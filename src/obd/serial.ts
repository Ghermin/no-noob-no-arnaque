import type { Transport } from './transport';
import { logLine } from './log';
import { describeAnswer, hexId, probeElm, type ProbeRead } from './probe';

const BAUD_RATES = [38400, 115200, 9600, 230400, 500000];

export function isWebSerialAvailable(): boolean {
    return typeof navigator !== 'undefined' && 'serial' in navigator;
}

function timedReader(reader: ReadableStreamDefaultReader<Uint8Array>): ProbeRead {
    const decoder = new TextDecoder();
    // Une lecture abandonnée sur délai reste en attente : on la réutilise pour ne pas perdre ce qu'elle recevra.
    let pending: Promise<ReadableStreamReadResult<Uint8Array>> | null = null;
    return async (ms, done) => {
        let text = '';
        const deadline = Date.now() + ms;
        while (Date.now() < deadline) {
            const remaining = deadline - Date.now();
            pending ??= reader.read();
            const result = await Promise.race([pending, new Promise<null>((resolve) => setTimeout(() => resolve(null), remaining))]);
            if (result === null) break;
            pending = null;
            if (result.done) break;
            text += decoder.decode(result.value, { stream: true });
            if (done(text)) break;
        }
        return text;
    };
}

async function probe(port: SerialPort, baudRate: number): Promise<ReadableStreamDefaultReader<Uint8Array> | null> {
    try {
        await port.open({ baudRate });
    } catch (error) {
        logLine('!', `série ${baudRate} bauds : ouverture impossible ${(error as Error).name}: ${(error as Error).message}`);
        throw new Error("Impossible d'ouvrir ce port : il est peut-être utilisé par un autre onglet ou logiciel OBD. Fermez-les, débranchez et rebranchez le câble, puis réessayez.");
    }
    const reader = port.readable!.getReader();
    const writer = port.writable!.getWriter();
    try {
        const { ok, answer } = await probeElm((text) => writer.write(new TextEncoder().encode(text)), timedReader(reader));
        logLine('!', `série ${baudRate} bauds : ${describeAnswer(answer)}`);
        if (ok) {
            writer.releaseLock();
            return reader;
        }
    } catch (error) {
        logLine('!', `série ${baudRate} bauds : erreur ${(error as Error).name}: ${(error as Error).message}`);
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
    const portInfo = port.getInfo();
    logLine(
        '!',
        portInfo.usbVendorId === undefined
            ? `port série sans identifiant USB (Bluetooth ou port natif ?) ${portInfo.bluetoothServiceClassId ?? ''}`.trim()
            : `port série USB vendor=${hexId(portInfo.usbVendorId)} product=${hexId(portInfo.usbProductId)}`
    );

    let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
    for (const baudRate of BAUD_RATES) {
        reader = await probe(port, baudRate);
        if (reader) break;
    }
    if (!reader) {
        throw new Error("Aucun adaptateur ELM327 n'a répondu sur ce port. Vérifiez le câble et que le contact est mis.");
    }

    let activeReader = reader;
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
        while (!closed) {
            try {
                const { value, done } = await activeReader.read();
                if (done) break;
                const chunk = decoder.decode(value, { stream: true });
                dataListeners.forEach((l) => l(chunk));
            } catch (error) {
                // Erreur de trame ou de parité : le port reste ouvert et fournit un nouveau flux. Débranché : plus de flux.
                logLine('!', `lecture série : ${(error as Error).name}: ${(error as Error).message}`);
                activeReader.releaseLock();
                if (closed || !port.readable) break;
                activeReader = port.readable.getReader();
            }
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
