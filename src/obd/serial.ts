import type { Transport } from './transport';
import { logLine } from './log';

const BAUD_RATES = [38400, 115200, 9600, 230400, 500000];
const PROBE_TIMEOUT_MS = 900;

export function isWebSerialAvailable(): boolean {
    return typeof navigator !== 'undefined' && 'serial' in navigator;
}

async function readFor(reader: ReadableStreamDefaultReader<Uint8Array>, ms: number): Promise<string> {
    const decoder = new TextDecoder();
    let text = '';
    const deadline = Date.now() + ms;
    while (Date.now() < deadline) {
        const remaining = deadline - Date.now();
        const result = await Promise.race([
            reader.read(),
            new Promise<null>((resolve) => setTimeout(() => resolve(null), remaining))
        ]);
        if (result === null || result.done) break;
        text += decoder.decode(result.value, { stream: true });
        if (text.includes('>')) break;
    }
    return text;
}

async function probe(port: SerialPort, baudRate: number): Promise<ReadableStreamDefaultReader<Uint8Array> | null> {
    await port.open({ baudRate });
    const reader = port.readable!.getReader();
    const writer = port.writable!.getWriter();
    try {
        await writer.write(new TextEncoder().encode('\rATI\r'));
        const answer = await readFor(reader, PROBE_TIMEOUT_MS);
        logLine('!', `série ${baudRate} bauds : ${answer.trim() || '(rien)'}`);
        if (/ELM|STN|OBD/i.test(answer) && answer.includes('>')) {
            writer.releaseLock();
            return reader;
        }
    } catch {
        /* vitesse suivante */
    }
    writer.releaseLock();
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
    await port.close().catch(() => undefined);
    return null;
}

export async function connectSerial(): Promise<Transport> {
    if (!isWebSerialAvailable()) {
        throw new Error('Connexion USB indisponible : utilisez Chrome ou Edge sur ordinateur.');
    }
    const port = await navigator.serial.requestPort();

    let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
    for (const baudRate of BAUD_RATES) {
        reader = await probe(port, baudRate);
        if (reader) break;
    }
    if (!reader) {
        throw new Error("Aucun adaptateur ELM327 n'a répondu sur ce port. Vérifiez le câble et que le contact est mis.");
    }

    const activeReader = reader;
    const dataListeners: ((chunk: string) => void)[] = [];
    const disconnectListeners: (() => void)[] = [];
    let closed = false;

    const notifyDisconnect = () => {
        if (closed) return;
        closed = true;
        disconnectListeners.forEach((l) => l());
    };

    (async () => {
        const decoder = new TextDecoder();
        try {
            for (;;) {
                const { value, done } = await activeReader.read();
                if (done) break;
                const chunk = decoder.decode(value, { stream: true });
                dataListeners.forEach((l) => l(chunk));
            }
        } catch {
            /* câble débranché */
        }
        notifyDisconnect();
    })();

    port.addEventListener('disconnect', notifyDisconnect);
    const info = port.getInfo();

    return {
        name: info.usbVendorId === 0x0403 ? 'Câble USB (FTDI)' : 'Câble USB',
        async write(data: string) {
            const writer = port.writable!.getWriter();
            try {
                await writer.write(new TextEncoder().encode(data));
            } finally {
                writer.releaseLock();
            }
        },
        onData(listener) {
            dataListeners.push(listener);
        },
        onDisconnect(listener) {
            disconnectListeners.push(listener);
        },
        async close() {
            closed = true;
            await activeReader.cancel().catch(() => undefined);
            activeReader.releaseLock();
            await port.close().catch(() => undefined);
        }
    };
}
