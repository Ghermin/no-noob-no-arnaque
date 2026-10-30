import { describe, expect, it } from 'vitest';
import { decodeMode06Records, monitorName } from './mode06';
import { decodeGmlanFrames, decodeKwpDtcs, decodeUdsDtcs } from './modules';
import { describeFailureType } from './dtc';
import { parseResponse } from './frames';
import { guessFuel } from '../format';
import { decodeVagDtcs, describeVagCode } from './vag';
import { Elm327 } from './elm327';
import { Simulator, createSimulatorTransport, type DemoProfile } from './simulator';
import { clearEngineCodes, runScan } from './scanner';
import { analyzeScan, compareScans } from '../analysis';
import type { SavedScan, ScanResult } from '../types';

describe('mode 06', () => {
    it('decodes records and checks limits on raw values', () => {
        const tests = decodeMode06Records([0x46, 0x21, 0x80, 0x01, 0x00, 0x76, 0x00, 0x00, 0x00, 0x64, 0x01, 0x01, 0x0a, 0x0e, 0x74, 0x0c, 0x80, 0xff, 0xff]);
        expect(tests).toHaveLength(2);
        expect(tests[0]).toMatchObject({ monitor: 'Catalyseur (banc 1)', value: 118, max: 100, passed: false });
        expect(tests[1].unit).toBe('mV');
        expect(tests[1].passed).toBe(true);
    });

    it('handles signed scalings', () => {
        const [test] = decodeMode06Records([0x46, 0x85, 0x80, 0x81, 0xff, 0xf6, 0xff, 0xec, 0x00, 0x0a]);
        expect(test.value).toBe(-10);
        expect(test.passed).toBe(true);
    });

    it('names monitors', () => {
        expect(monitorName(0x01)).toBe('Sonde lambda amont (banc 1)');
        expect(monitorName(0x06)).toBe('Sonde lambda aval (banc 2)');
        expect(monitorName(0xa3)).toBe('Ratés de combustion cylindre 2');
    });
});

describe('module DTC decoding', () => {
    it('decodes UDS records with failure type and status', () => {
        const [dtc] = decodeUdsDtcs([0x59, 0x02, 0xff, 0x40, 0x35, 0x1c, 0x09]).dtcs;
        expect(dtc.code).toBe('C0035-1C');
        expect(dtc.status).toBe('présent en ce moment · confirmé');
        expect(dtc.history).toBe(false);
        expect(describeFailureType(dtc.code)).toBe('tension hors plage');
    });

    it('keeps only UDS codes that actually failed', () => {
        const { dtcs, ignored } = decodeUdsDtcs([
            0x59, 0x02, 0xff,
            0x04, 0x20, 0x00, 0x40, // test pas encore fait ce cycle : pas un défaut
            0x05, 0x05, 0x00, 0x50, // jamais testé depuis l'effacement : pas un défaut
            0x01, 0x71, 0x00, 0x24, // en attente
            0x03, 0x01, 0x00, 0x20, // survenu depuis l'effacement, absent aujourd'hui
            0xff, 0xff, 0xff, 0x40 // remplissage
        ]);
        expect(ignored).toBe(2);
        expect(dtcs.map((d) => [d.code, d.history])).toEqual([
            ['P0171-00', false],
            ['P0301-00', true]
        ]);
    });

    it('finds no fault in the real Ford Puma engine module answer (status 0x40 / 0x50 only)', () => {
        // Réponse brute du PCM d'une Puma mHEV 2022, journal du 30/10/2026.
        const raw = [
            '7E810EB5902FF001100', '7E82140001200400014', '7E82200400015004000', '7E82371004000870040', '7E82400880040008A00',
            '7E82540008B00400096', '7E826004000CE004001', '7E82706004001110040', '7E82801160040013300', '7E82940013A00400171',
            '7E82A00400172004002', '7E82B17004002340040', '7E82C02360040029800', '7E82D40029900400325', '7E82E00400327004003',
            '7E82F28004004200040', '7E82005050050054400', '7E8214005460040059F', '7E82200400812004010', '7E82301005010250050',
            '7E82410260040111600', '7E82550112400501127', '7E82600501137005011', '7E827380050115E0040', '7E82812850040129900',
            '7E82940130D00401397', '7E82A00501464005015', '7E82B010050160A0050', '7E82C20960040209700', '7E82D40222700402270',
            '7E82E00402271004024', '7E82F530040246C0040', '7E820250F004025B000', '7E82140261000400000'
        ].join('\r');
        const [message] = parseResponse(raw, 'can11');
        const { dtcs, ignored } = decodeUdsDtcs(message.data);
        expect(dtcs).toEqual([]);
        expect(ignored).toBe(58);
    });

    it('does not count unsorted codes from old scans as faults', () => {
        const old = {
            ...({} as ScanResult),
            mil: false,
            monitors: [],
            stored: [],
            pending: [],
            permanent: [],
            distanceSinceClear: null,
            warmupsSinceClear: null,
            distanceWithMil: null,
            full: true,
            modules: [{ id: '0x7E0', name: 'Moteur (PCM)', protocol: 'UDS', partNumber: null, dtcs: [{ code: 'P0420-00', description: '', status: 'mémorisé' }] }]
        } as ScanResult;
        const titles = analyzeScan(old).map((f) => f.title);
        expect(titles).toContain('Refaites un scan pour les autres calculateurs');
        expect(titles.some((t) => t.startsWith('Moteur (PCM)'))).toBe(false);
    });

    it('decodes KWP records', () => {
        expect(decodeKwpDtcs([0x58, 0x01, 0x04, 0x20, 0x60]).map((d) => d.code)).toEqual(['P0420']);
    });

    it('decodes VAG codes and maps OBD equivalents', () => {
        const dtcs = decodeVagDtcs([0x58, 0x02, 0x41, 0xa4, 0x23, 0x01, 0x1b, 0x23]);
        expect(dtcs.map((d) => d.code)).toEqual(['16804', '00283']);
        expect(dtcs[0].description).toContain('P0420');
        expect(describeVagCode(283)).toContain('G47');
    });
});

async function connectedSim(profile: DemoProfile) {
    const sim = new Simulator(profile);
    const elm = new Elm327(createSimulatorTransport(sim));
    await elm.initialize();
    return { sim, elm };
}

function saved(result: ScanResult, date: number, odometer: number | null = null): SavedScan {
    return { id: String(date), vehicleId: 'v', date, label: 'controle', odometer, note: '', result };
}

describe('full scan — VAG TP2.0 (Ibiza)', () => {
    it('reads VAG modules, codes and cluster mileage', async () => {
        const { elm } = await connectedSim('ibiza');
        const result = await runScan(elm, undefined, true);
        const names = result.modules!.map((m) => m.name);
        expect(names).toHaveLength(5);
        expect(result.modules!.every((m) => m.protocol.includes('TP2.0'))).toBe(true);
        const abs = result.modules!.find((m) => m.partNumber === '6R0907379AH')!;
        expect(abs.dtcs.map((d) => d.code)).toEqual(['00283']);
        const engine = result.modules!.find((m) => m.partNumber === '03L906023ML')!;
        expect(engine.dtcs[0].description).toContain('P0401');
        expect(result.odometerCluster).toBe(152340);
        expect(result.mode06!.find((t) => t.mid === 0x31)!.passed).toBe(false);

        const after = await runScan(elm);
        expect(after.stored.map((d) => d.code)).toEqual(['P0401']);
    });
});

describe('full scan — UDS (citadine)', () => {
    it('discovers UDS modules and reads OBD mileage', async () => {
        const { elm } = await connectedSim('citadine');
        const result = await runScan(elm, undefined, true);
        expect(result.modules!.map((m) => m.name)).toEqual(['ABS ESP BOSCH 9.3', 'TABLEAU DE BORD', 'AIRBAG', 'INJECTION']);
        expect(result.modules!.find((m) => m.name.startsWith('ABS'))!.dtcs[0].code).toBe('C0035-1C');
        expect(result.odometerObd).toBeCloseTo(48230.5);
        expect(result.mode06!.find((t) => t.mid === 0x21)!.passed).toBe(false);
        const titles = analyzeScan(result, 48230).map((f) => f.title);
        expect(titles).toContain('ABS ESP BOSCH 9.3 : 1 défaut');
        expect(titles).toContain('1 autotest détaillé hors limites');
        expect(titles).not.toContain('Kilométrage incohérent');
    }, 20000);

    it('detects a tampered odometer and a mileage rollback', async () => {
        const { sim, elm } = await connectedSim('citadine');
        const first = saved(await runScan(elm, undefined, true), 1, sim.dashboardKm);
        sim.tamperOdometer(40000);
        const tampered = await runScan(elm, undefined, true);
        expect(analyzeScan(tampered, sim.dashboardKm).some((f) => f.title === 'Kilométrage incohérent')).toBe(true);
        const second = saved(tampered, 2, sim.dashboardKm);
        expect(compareScans(first, second).findings[0].title).toBe('Le kilométrage a reculé');
    }, 30000);
});

describe('user clear', () => {
    it('clears engine codes and reports when the fault comes back', async () => {
        const { sim, elm } = await connectedSim('ibiza');
        const before = { ...saved(await runScan(elm), 1), clearedByUser: true };
        expect(await clearEngineCodes(elm)).toBe(true);
        const justAfter = await runScan(elm);
        expect(justAfter.stored).toHaveLength(0);
        expect(justAfter.permanent.map((d) => d.code)).toEqual(['P0401']);
        expect(analyzeScan(justAfter, null, true).some((f) => f.title === 'Vous avez effacé les codes défaut')).toBe(true);

        sim.drive(80);
        const later = saved(await runScan(elm), 2);
        const cmp = compareScans(before, later, true);
        expect(cmp.findings[0].title).toBe('Codes effacés par vous entre les deux scans');
        expect(cmp.findings.some((f) => f.title === 'Défaut revenu après effacement')).toBe(true);
    });
});

describe('full scan — Ford (Puma flexifuel)', () => {
    it('names Ford modules, reads ethanol support and mileage', async () => {
        const { sim, elm } = await connectedSim('puma');
        sim.canErrorOnce = true;
        const result = await runScan(elm, undefined, true);
        expect(result.modules!.map((m) => m.name)).toEqual([
            'Passerelle (GWM)',
            'Tableau de bord (IPC)',
            'Boîtier habitacle (BCM)',
            'Airbag (RCM)',
            'ABS / ESP',
            'Moteur (PCM)'
        ]);
        expect(result.supportedPids).toContain(0x52);
        expect(guessFuel(result)).toBe('ethanol');
        expect(result.odometerObd).toBeCloseTo(21780.4);
        expect(analyzeScan(result, 21780)[0].title).toBe('Aucun défaut détecté');
        expect(result.modules!.find((m) => m.name === 'Moteur (PCM)')!.ignored).toBe(2);
        expect(result.modules!.find((m) => m.name === 'Boîtier habitacle (BCM)')!.dtcs).toEqual([]);
    }, 20000);
});

describe('full scan — GM (Captiva)', () => {
    it('reads GMLAN modules and the KWP engine module', async () => {
        const { sim, elm } = await connectedSim('captiva');
        const result = await runScan(elm, undefined, true);
        expect(result.vin).toBe('KL1CA26YJ8B000000');
        expect(result.pending.map((d) => d.code)).toEqual(['P0380']);
        const abs = result.modules!.find((m) => m.name === 'ABS / ESP (EBCM)')!;
        expect(abs.protocol).toBe('GMLAN (expérimental)');
        expect(abs.dtcs.map((d) => d.code)).toEqual(['C0035-00']);
        expect(result.modules!.find((m) => m.name === 'Airbag (SDM)')!.dtcs).toEqual([]);
        expect(result.modules!.find((m) => m.name === 'Moteur (ECM)')!.protocol).toBe('KWP2000 sur CAN');

        sim.drive(80);
        const later = await runScan(elm, undefined, true);
        expect(later.stored.map((d) => d.code)).toEqual(['P0380']);
        expect(later.modules!.find((m) => m.name === 'Moteur (ECM)')!.dtcs.map((d) => d.code)).toEqual(['P0380']);
    }, 30000);

    it('decodes GMLAN UUDT frames and negative responses', () => {
        expect(decodeGmlanFrames('5438140350A0AAAA\r543810000000AAAA', 0x643)!.map((d) => d.code)).toEqual(['C0035-0A']);
        expect(decodeGmlanFrames('643037FA911', 0x643)).toBeNull();
        expect(decodeGmlanFrames('NO DATA', 0x643)).toBeNull();
    });
});
