import { afterEach, describe, expect, it, vi } from 'vitest';
import { ch340Divisor, connectUsb, ftdiDivisor } from './usb';
import { Elm327 } from './elm327';
import { Simulator } from './simulator';
import { runScan } from './scanner';

describe('USB baud rate encoding', () => {
    it('matches the FTDI divisors used by the Linux driver', () => {
        expect(ftdiDivisor(38400)).toEqual({ value: 0xc04e, index: 0 });
        expect(ftdiDivisor(115200)).toEqual({ value: 0x001a, index: 0 });
        expect(ftdiDivisor(9600)).toEqual({ value: 0x4138, index: 0 });
    });

    it('matches the CH340 divisor registers', () => {
        expect(ch340Divisor(9600)).toEqual({ prescaler: 0xb202, low: 0x0c });
        expect(ch340Divisor(38400)).toEqual({ prescaler: 0x6403, low: 0x18 });
        expect(ch340Divisor(115200)).toEqual({ prescaler: 0xcc03, low: 0x08 });
    });
});

type Chip = 'ftdi' | 'ch340';

class FakeUsbDevice {
    vendorId: number;
    configuration = {
        interfaces: [
            {
                interfaceNumber: 0,
                alternate: {
                    interfaceClass: 0xff,
                    endpoints: [
                        { endpointNumber: 1, direction: 'in', type: 'bulk', packetSize: 64 },
                        { endpointNumber: 2, direction: 'out', type: 'bulk', packetSize: 64 }
                    ]
                }
            }
        ]
    };
    baudKey = -1;
    private queue: number[] = [];
    private buffer = '';
    private closed = false;

    constructor(private readonly chip: Chip, private readonly sim: Simulator, private readonly goodKey: number) {
        this.vendorId = chip === 'ftdi' ? 0x0403 : 0x1a86;
    }

    async open() {}
    async selectConfiguration() {}
    async claimInterface() {}
    async releaseInterface() {}
    async close() {
        this.closed = true;
    }

    async controlTransferOut(setup: { request: number; value: number; index: number }) {
        if (this.chip === 'ftdi' && setup.request === 0x03) this.baudKey = setup.value;
        if (this.chip === 'ch340' && setup.request === 0x9a && setup.value === 0x1312) this.baudKey = setup.index;
        return { status: 'ok' };
    }

    async transferOut(_endpoint: number, data: Uint8Array) {
        const text = new TextDecoder().decode(data);
        if (this.baudKey !== this.goodKey) {
            this.queue.push(0xfe, 0x00, 0x9c);
            return { status: 'ok', bytesWritten: data.length };
        }
        this.buffer += text;
        let end = this.buffer.indexOf('\r');
        while (end !== -1) {
            const command = this.buffer.slice(0, end).trim();
            this.buffer = this.buffer.slice(end + 1);
            if (command) {
                const response = command === 'ATI' ? 'ELM327 v1.5' : this.sim.respond(command);
                this.queue.push(...new TextEncoder().encode(`${response}\r\r>`));
            }
            end = this.buffer.indexOf('\r');
        }
        return { status: 'ok', bytesWritten: data.length };
    }

    async transferIn(_endpoint: number, length: number) {
        await new Promise((resolve) => setTimeout(resolve, 2));
        if (this.closed) throw new Error('closed');
        const bytes: number[] = [];
        if (this.chip === 'ftdi') {
            while (bytes.length < length) {
                const chunk = this.queue.splice(0, 62);
                bytes.push(0x01, 0x60, ...chunk);
                if (this.queue.length === 0) break;
            }
        } else {
            bytes.push(...this.queue.splice(0, length));
        }
        return { status: 'ok', data: new DataView(new Uint8Array(bytes).buffer) };
    }
}

afterEach(() => {
    vi.unstubAllGlobals();
});

describe.each([
    ['ftdi', 0x001a],
    ['ch340', 0xcc03]
] as const)('WebUSB transport (%s)', (chip, goodKey) => {
    it('finds the baud rate and runs a full scan', async () => {
        const sim = new Simulator('captiva');
        const device = new FakeUsbDevice(chip, sim, goodKey);
        vi.stubGlobal('navigator', { usb: { requestDevice: async () => device, addEventListener: () => undefined } });

        const transport = await connectUsb();
        expect(transport.name).toBe(chip === 'ftdi' ? 'Câble USB (FTDI)' : 'Câble USB (CH340)');

        const elm = new Elm327(transport);
        await elm.initialize();
        const result = await runScan(elm, undefined, true);
        expect(result.vin).toBe('KL1CA26YJ8B000000');
        expect(result.modules!.some((m) => m.protocol === 'GMLAN (expérimental)')).toBe(true);
        await transport.close();
    }, 30000);
});

describe('WebUSB transport errors', () => {
    it('rejects Prolific chips with a clear message', async () => {
        const device = new FakeUsbDevice('ftdi', new Simulator(), 0);
        device.vendorId = 0x067b;
        vi.stubGlobal('navigator', { usb: { requestDevice: async () => device, addEventListener: () => undefined } });
        await expect(connectUsb()).rejects.toThrow('PL2303');
    });
});
