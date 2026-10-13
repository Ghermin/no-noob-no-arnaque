import type { Transport } from './transport';
import { logLine } from './log';

const BAUD_RATES = [38400, 115200, 9600, 230400, 500000];
const PROBE_TIMEOUT_MS = 900;

export const USB_FILTERS: USBDeviceFilter[] = [
    { vendorId: 0x0403 },
    { vendorId: 0x1a86 },
    { vendorId: 0x10c4 },
    { vendorId: 0x067b },
    { classCode: 0x02 }
];

export function isWebUsbAvailable(): boolean {
    return typeof navigator !== 'undefined' && 'usb' in navigator;
}

export function ftdiDivisor(baud: number): { value: number; index: number } {
    const FRACTION_CODES = [0, 3, 2, 4, 1, 5, 6, 7];
    const divisor3 = Math.round(24_000_000 / baud);
    const encoded = (divisor3 >> 3) | (FRACTION_CODES[divisor3 & 7] << 14);
    return { value: encoded & 0xffff, index: encoded >> 16 };
}

export function ch340Divisor(baud: number): { prescaler: number; low: number } {
    let factor = Math.floor(1_532_620_800 / baud);
    let divisor = 3;
    while (factor > 0xfff0 && divisor > 0) {
        factor >>= 3;
        divisor--;
    }
    factor = 0x10000 - factor;
    return { prescaler: (factor & 0xff00) | divisor, low: factor & 0xff };
}

interface Driver {
    name: string;
    interfaceNumber: number;
    statusBytes: number;
    init(): Promise<void>;
    setBaud(baud: number): Promise<void>;
}

function vendorOut(device: USBDevice, request: number, value: number, index = 0, data?: BufferSource) {
    return device.controlTransferOut({ requestType: 'vendor', recipient: 'device', request, value, index }, data);
}

function findInterface(device: USBDevice, classCode?: number): USBInterface {
    const interfaces = device.configuration!.interfaces;
    const match = interfaces.find((i) => i.alternate.endpoints.some((e) => e.type === 'bulk') && (classCode === undefined || i.alternate.interfaceClass === classCode));
    if (!match) throw new Error("Interface USB du câble introuvable.");
    return match;
}

function createDriver(device: USBDevice): Driver {
    if (device.vendorId === 0x0403) {
        return {
            name: 'Câble USB (FTDI)',
            interfaceNumber: findInterface(device).interfaceNumber,
            statusBytes: 2,
            async init() {
                await vendorOut(device, 0x00, 0x0000);
                await vendorOut(device, 0x02, 0x0000);
                await vendorOut(device, 0x04, 0x0008);
                await vendorOut(device, 0x01, 0x0303);
                await vendorOut(device, 0x09, 0x0002);
            },
            async setBaud(baud) {
                const { value, index } = ftdiDivisor(baud);
                await vendorOut(device, 0x03, value, index);
            }
        };
    }
    if (device.vendorId === 0x1a86) {
        return {
            name: 'Câble USB (CH340)',
            interfaceNumber: findInterface(device).interfaceNumber,
            statusBytes: 0,
            async init() {
                await vendorOut(device, 0xa1, 0x0000);
                await vendorOut(device, 0x9a, 0x2518, 0x00c3);
                await vendorOut(device, 0xa4, 0x009f);
            },
            async setBaud(baud) {
                const { prescaler, low } = ch340Divisor(baud);
                await vendorOut(device, 0x9a, 0x1312, prescaler);
                await vendorOut(device, 0x9a, 0x0f2c, low);
                await vendorOut(device, 0x9a, 0x2518, 0x00c3);
            }
        };
    }
    if (device.vendorId === 0x10c4) {
        const interfaceNumber = findInterface(device).interfaceNumber;
        const out = (request: number, value: number, data?: BufferSource) =>
            device.controlTransferOut({ requestType: 'vendor', recipient: 'interface', request, value, index: interfaceNumber }, data);
        return {
            name: 'Câble USB (CP210x)',
            interfaceNumber,
            statusBytes: 0,
            async init() {
                await out(0x00, 0x0001);
                await out(0x03, 0x0800);
                await out(0x07, 0x0303);
            },
            async setBaud(baud) {
                const data = new DataView(new ArrayBuffer(4));
                data.setUint32(0, baud, true);
                await out(0x1e, 0, data.buffer);
            }
        };
    }
    if (device.vendorId === 0x067b) {
        throw new Error("Câble à puce Prolific (PL2303) : pas encore pris en charge sur téléphone. Il fonctionne sur ordinateur.");
    }
    const data = findInterface(device, 0x0a);
    const control = device.configuration!.interfaces.find((i) => i.alternate.interfaceClass === 0x02);
    const controlNumber = control?.interfaceNumber ?? 0;
    const classOut = (request: number, value: number, payload?: BufferSource) =>
        device.controlTransferOut({ requestType: 'class', recipient: 'interface', request, value, index: controlNumber }, payload);
    return {
        name: 'Câble USB',
        interfaceNumber: data.interfaceNumber,
        statusBytes: 0,
        async init() {
            if (control) await device.claimInterface(controlNumber).catch(() => undefined);
            await classOut(0x22, 0x0003);
        },
        async setBaud(baud) {
            const coding = new DataView(new ArrayBuffer(7));
            coding.setUint32(0, baud, true);
            coding.setUint8(6, 8);
            await classOut(0x20, 0, coding.buffer);
        }
    };
}

export async function connectUsb(): Promise<Transport> {
    if (!isWebUsbAvailable()) {
        throw new Error('Connexion USB indisponible dans ce navigateur : utilisez Chrome sur Android ou ordinateur.');
    }
    const device = await navigator.usb.requestDevice({ filters: USB_FILTERS });
    await device.open();
    if (!device.configuration) await device.selectConfiguration(1);

    const driver = createDriver(device);
    try {
        await device.claimInterface(driver.interfaceNumber);
    } catch {
        await device.close().catch(() => undefined);
        throw new Error("Le câble est déjà utilisé par le système ou une autre app. Débranchez-le, rebranchez-le et réessayez.");
    }
    const endpoints = device.configuration!.interfaces.find((i) => i.interfaceNumber === driver.interfaceNumber)!.alternate.endpoints;
    const inEndpoint = endpoints.find((e) => e.type === 'bulk' && e.direction === 'in')!;
    const outEndpoint = endpoints.find((e) => e.type === 'bulk' && e.direction === 'out')!;
    await driver.init();

    const decoder = new TextDecoder();
    const encoder = new TextEncoder();
    const dataListeners: ((chunk: string) => void)[] = [];
    const disconnectListeners: (() => void)[] = [];
    const probe: { buffer: string | null } = { buffer: null };
    let closed = false;

    const strip = (data: DataView): Uint8Array => {
        const bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
        if (!driver.statusBytes) return bytes;
        const packet = inEndpoint.packetSize;
        const out: number[] = [];
        for (let i = 0; i < bytes.length; i += packet) {
            out.push(...bytes.subarray(i + driver.statusBytes, i + packet));
        }
        return new Uint8Array(out);
    };

    const finish = () => {
        if (closed) return;
        closed = true;
        disconnectListeners.forEach((l) => l());
    };

    (async () => {
        while (!closed) {
            try {
                const result = await device.transferIn(inEndpoint.endpointNumber, inEndpoint.packetSize * 4);
                if (!result.data || result.data.byteLength === 0) continue;
                const payload = strip(result.data);
                if (payload.length === 0) continue;
                const chunk = decoder.decode(payload, { stream: true });
                if (probe.buffer !== null) probe.buffer += chunk;
                else dataListeners.forEach((l) => l(chunk));
            } catch {
                finish();
            }
        }
    })();

    const write = (text: string) => device.transferOut(outEndpoint.endpointNumber, encoder.encode(text));

    let found = false;
    for (const baud of BAUD_RATES) {
        await driver.setBaud(baud);
        probe.buffer = '';
        await write('\rATI\r');
        const deadline = Date.now() + PROBE_TIMEOUT_MS;
        while (Date.now() < deadline && !(probe.buffer ?? '').includes('>')) {
            await new Promise((resolve) => setTimeout(resolve, 20));
        }
        const answer = probe.buffer ?? '';
        logLine('!', `USB ${driver.name} ${baud} bauds : ${answer.trim() || '(rien)'}`);
        if (/ELM|STN|OBD/i.test(answer) && answer.includes('>')) {
            found = true;
            break;
        }
    }
    probe.buffer = null;

    if (!found) {
        closed = true;
        await device.releaseInterface(driver.interfaceNumber).catch(() => undefined);
        await device.close().catch(() => undefined);
        throw new Error("Aucun adaptateur ELM327 n'a répondu sur ce câble. Vérifiez le branchement et que le contact est mis.");
    }

    navigator.usb.addEventListener('disconnect', (event) => {
        if ((event as USBConnectionEvent).device === device) finish();
    });

    return {
        name: driver.name,
        async write(text: string) {
            await write(text);
        },
        onData(listener) {
            dataListeners.push(listener);
        },
        onDisconnect(listener) {
            disconnectListeners.push(listener);
        },
        async close() {
            closed = true;
            await device.releaseInterface(driver.interfaceNumber).catch(() => undefined);
            await device.close().catch(() => undefined);
        }
    };
}
