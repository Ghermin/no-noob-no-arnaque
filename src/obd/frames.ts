export interface EcuMessage {
    ecu: string;
    data: number[];
}

export type ProtocolKind = 'can11' | 'can29' | 'legacy';

const NOISE = /^(SEARCHING\.\.\.|BUS INIT.*|OK|STOPPED|>)$/;

export const ERROR_MARKERS = ['NO DATA', 'UNABLE TO CONNECT', 'CAN ERROR', 'BUS ERROR', 'BUFFER FULL', 'FB ERROR', 'DATA ERROR', 'ERROR', '?'];

export function protocolKind(protocolNumber: string): ProtocolKind {
    const p = protocolNumber.replace(/^A/, '').toUpperCase();
    if (p === '6' || p === '8') return 'can11';
    if (p === '7' || p === '9') return 'can29';
    return 'legacy';
}

export function cleanLines(raw: string): string[] {
    return raw
        .split(/[\r\n]+/)
        .map((l) => l.replace(/\s+/g, '').toUpperCase())
        .filter((l) => l.length > 0 && !NOISE.test(l));
}

export function hexBytes(hex: string): number[] {
    const out: number[] = [];
    for (let i = 0; i + 1 < hex.length; i += 2) {
        out.push(parseInt(hex.slice(i, i + 2), 16));
    }
    return out;
}

function parseCan(lines: string[], headerLength: number): EcuMessage[] {
    const buffers = new Map<string, { expected: number; data: number[] }>();
    const order: string[] = [];

    for (const line of lines) {
        if (!/^[0-9A-F]+$/.test(line) || line.length <= headerLength) continue;
        const ecu = line.slice(0, headerLength);
        const bytes = hexBytes(line.slice(headerLength));
        if (bytes.length === 0) continue;
        const pci = bytes[0] >> 4;

        if (pci === 0) {
            const length = bytes[0] & 0x0f;
            buffers.set(ecu, { expected: length, data: bytes.slice(1, 1 + length) });
            if (!order.includes(ecu)) order.push(ecu);
        } else if (pci === 1) {
            const length = ((bytes[0] & 0x0f) << 8) | bytes[1];
            buffers.set(ecu, { expected: length, data: bytes.slice(2) });
            if (!order.includes(ecu)) order.push(ecu);
        } else if (pci === 2) {
            const buffer = buffers.get(ecu);
            if (buffer) buffer.data.push(...bytes.slice(1));
        }
    }

    return order.map((ecu) => {
        const buffer = buffers.get(ecu)!;
        return { ecu, data: buffer.data.slice(0, buffer.expected) };
    });
}

function parseLegacy(lines: string[]): EcuMessage[] {
    const messages: EcuMessage[] = [];
    for (const line of lines) {
        if (!/^[0-9A-F]+$/.test(line)) continue;
        const bytes = hexBytes(line);
        if (bytes.length < 5) continue;
        messages.push({ ecu: bytes[2].toString(16).toUpperCase().padStart(2, '0'), data: bytes.slice(3, -1) });
    }
    return messages;
}

export function parseResponse(raw: string, kind: ProtocolKind): EcuMessage[] {
    const lines = cleanLines(raw);
    if (kind === 'can11') return parseCan(lines, 3);
    if (kind === 'can29') return parseCan(lines, 8);
    return parseLegacy(lines);
}

export function isErrorResponse(raw: string): boolean {
    const text = raw.replace(/\s+/g, ' ').toUpperCase();
    return ERROR_MARKERS.some((m) => text.includes(m)) && !/[0-9A-F]{6,}/.test(raw.replace(/\s+/g, ''));
}
