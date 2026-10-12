import { describe, expect, it } from 'vitest';
import { parseResponse, isErrorResponse } from './frames';
import { decodeDtcBytes, decodeDtcMessages, describeDtc } from './dtc';
import { decodeReadiness } from './readiness';
import { decodeSupportedPids } from './pids';
import { makeFromVin, vinFromMessages, yearFromVin } from './vin';
import { Elm327 } from './elm327';
import { Simulator, createSimulatorTransport } from './simulator';
import { runScan } from './scanner';
import { analyzeScan, compareScans } from '../analysis';
import type { SavedScan, ScanResult } from '../types';

describe('frames', () => {
    it('reassembles a multi-frame CAN 11-bit VIN response', () => {
        const raw = '7E81014490201565353\r7E8215A5A5A364A5A41\r7E82252303030303030\r\r';
        const messages = parseResponse(raw, 'can11');
        expect(messages).toHaveLength(1);
        expect(vinFromMessages(messages, true)).toBe('VSSZZZ6JZAR000000');
    });

    it('keeps single frames from several ECUs apart and ignores padding', () => {
        const raw = 'SEARCHING...\r7E806410098180013AA\r7E906410080000001AA\r';
        const messages = parseResponse(raw, 'can11');
        expect(messages.map((m) => m.ecu)).toEqual(['7E8', '7E9']);
        expect(messages[0].data).toEqual([0x41, 0x00, 0x98, 0x18, 0x00, 0x13]);
    });

    it('parses legacy protocol frames by stripping header and checksum', () => {
        const messages = parseResponse('48 6B 10 41 0D 32 9F\r', 'legacy');
        expect(messages).toEqual([{ ecu: '10', data: [0x41, 0x0d, 0x32] }]);
    });

    it('detects error responses', () => {
        expect(isErrorResponse('NO DATA\r\r')).toBe(true);
        expect(isErrorResponse('UNABLE TO CONNECT\r')).toBe(true);
        expect(isErrorResponse('7E803410D32AAAAAAAA')).toBe(false);
    });
});

describe('dtc', () => {
    it('decodes the system letter and digits', () => {
        expect(decodeDtcBytes(0x04, 0x01)).toBe('P0401');
        expect(decodeDtcBytes(0x24, 0x2f)).toBe('P242F');
        expect(decodeDtcBytes(0xc1, 0x00)).toBe('U0100');
        expect(decodeDtcBytes(0x41, 0x23)).toBe('C0123');
        expect(decodeDtcBytes(0x81, 0x23)).toBe('B0123');
    });

    it('skips the CAN count byte and zero padding', () => {
        const dtcs = decodeDtcMessages([{ ecu: '7E8', data: [0x43, 0x02, 0x04, 0x01, 0x01, 0x71, 0x00, 0x00] }], true);
        expect(dtcs.map((d) => d.code)).toEqual(['P0401', 'P0171']);
    });

    it('describes known, generic and manufacturer codes', () => {
        expect(describeDtc('P0401').known).toBe(true);
        expect(describeDtc('P1234').manufacturerSpecific).toBe(true);
        expect(describeDtc('P0999').manufacturerSpecific).toBe(false);
    });
});

describe('readiness', () => {
    it('decodes MIL, count and diesel monitors', () => {
        const r = decodeReadiness([0x81, 0x0f, 0xe8, 0x40]);
        expect(r.mil).toBe(true);
        expect(r.dtcCount).toBe(1);
        expect(r.ignition).toBe('compression');
        const fap = r.monitors.find((m) => m.label.includes('FAP'));
        expect(fap?.complete).toBe(false);
        expect(r.monitors.filter((m) => !m.complete)).toHaveLength(1);
    });

    it('decodes petrol monitors', () => {
        const r = decodeReadiness([0x00, 0x07, 0x65, 0x01]);
        expect(r.ignition).toBe('spark');
        expect(r.monitors.find((m) => m.label === 'Catalyseur')?.complete).toBe(false);
    });
});

describe('pids & vin', () => {
    it('decodes the supported PID bitmap', () => {
        expect(decodeSupportedPids(0, [0xbe, 0x1f, 0xa8, 0x13])).toContain(0x0c);
        expect(decodeSupportedPids(0, [0x00, 0x00, 0x00, 0x01])).toEqual([0x20]);
    });

    it('derives make and year', () => {
        expect(makeFromVin('VSSZZZ6JZAR000000')).toBe('Seat');
        expect(yearFromVin('VSSZZZ6JZAR000000')).toBe(2010);
        expect(yearFromVin('VF1XXXXXX7X000000')).toBe(2007);
    });
});

async function connectedSim() {
    const sim = new Simulator();
    const elm = new Elm327(createSimulatorTransport(sim));
    await elm.initialize();
    return { sim, elm };
}

function saved(result: ScanResult, date: number, odometer: number | null = null): SavedScan {
    return { id: String(date), vehicleId: 'v', date, label: 'controle', odometer, note: '', result };
}

describe('end-to-end with the simulator', () => {
    it('scans the demo car', async () => {
        const { elm } = await connectedSim();
        const result = await runScan(elm);
        expect(elm.protocolName).toContain('CAN 11 bits 500');
        expect(result.vin).toBe('VSSZZZ6JZAR000000');
        expect(result.mil).toBe(true);
        expect(result.stored.map((d) => d.code)).toEqual(['P0401']);
        expect(result.permanent.map((d) => d.code)).toEqual(['P0401']);
        expect(result.ignition).toBe('compression');
        expect(result.fuelCode).toBe(4);
        expect(result.distanceSinceClear).toBe(18450);
        expect(analyzeScan(result)[0].severity).toBe('danger');
    });

    it('flags a clear without repair', async () => {
        const { sim, elm } = await connectedSim();
        const before = saved(await runScan(elm), 1, 150000);
        sim.garageClear(false);
        const after = saved(await runScan(elm), 2, 150010);
        expect(after.result.stored).toHaveLength(0);
        expect(analyzeScan(after.result).some((f) => f.title.includes('Effacement récent'))).toBe(true);
        const cmp = compareScans(before, after);
        expect(cmp.findings[0].title).toContain('effacés');
        expect(cmp.persisting.map((c) => c.code)).toEqual(['P0401']);

        sim.drive(80);
        const later = saved(await runScan(elm), 3);
        expect(later.result.stored.map((d) => d.code)).toEqual(['P0401']);
    });

    it('confirms a real repair after driving', async () => {
        const { sim, elm } = await connectedSim();
        const before = saved(await runScan(elm), 1);
        sim.garageClear(true);
        sim.drive(80);
        const after = saved(await runScan(elm), 2);
        const cmp = compareScans(before, after);
        expect(cmp.fixed.map((c) => c.code)).toEqual(['P0401']);
        expect(cmp.findings.some((f) => f.title === 'Réparation confirmée par la voiture')).toBe(true);
    });
});
