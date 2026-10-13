import { afterEach, describe, expect, it, vi } from 'vitest';
import { connectSerial } from './serial';
import { Elm327 } from './elm327';
import { Simulator } from './simulator';
import { runScan } from './scanner';

class FakePort extends EventTarget {
    readable: ReadableStream<Uint8Array> | null = null;
    writable: WritableStream<Uint8Array> | null = null;
    opened: number[] = [];

    constructor(private readonly sim: Simulator, private readonly realBaud: number) {
        super();
    }

    getInfo() {
        return { usbVendorId: 0x0403, usbProductId: 0x6015 };
    }

    async open({ baudRate }: { baudRate: number }) {
        this.opened.push(baudRate);
        let controller!: ReadableStreamDefaultController<Uint8Array>;
        this.readable = new ReadableStream<Uint8Array>({ start: (c) => void (controller = c) });
        const encoder = new TextEncoder();
        const decoder = new TextDecoder();
        let buffer = '';
        this.writable = new WritableStream<Uint8Array>({
            write: (chunk) => {
                if (baudRate !== this.realBaud) {
                    controller.enqueue(new Uint8Array([0xfe, 0x00, 0x9c]));
                    return;
                }
                buffer += decoder.decode(chunk);
                let end = buffer.indexOf('\r');
                while (end !== -1) {
                    const command = buffer.slice(0, end).trim();
                    buffer = buffer.slice(end + 1);
                    if (command) {
                        const response = command === 'ATI' ? 'ELM327 v1.5' : this.sim.respond(command);
                        setTimeout(() => controller.enqueue(encoder.encode(`${response}\r\r>`)), 2);
                    }
                    end = buffer.indexOf('\r');
                }
            }
        });
    }

    async close() {
        this.readable = null;
        this.writable = null;
    }
}

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('USB serial transport', () => {
    it('detects the baud rate and runs a scan over the cable', async () => {
        const sim = new Simulator('citadine');
        const port = new FakePort(sim, 115200);
        vi.stubGlobal('navigator', { serial: { requestPort: async () => port } });

        const transport = await connectSerial();
        expect(port.opened).toEqual([38400, 115200]);
        expect(transport.name).toBe('Câble USB (FTDI)');

        const elm = new Elm327(transport);
        await elm.initialize();
        const result = await runScan(elm);
        expect(result.vin).toBe('VF1RJA00XL5000000');
        await transport.close();
    });

    it('fails clearly when nothing answers', async () => {
        const port = new FakePort(new Simulator(), 1);
        vi.stubGlobal('navigator', { serial: { requestPort: async () => port } });
        await expect(connectSerial()).rejects.toThrow('Aucun adaptateur ELM327');
    }, 10000);
});
