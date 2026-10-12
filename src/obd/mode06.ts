import type { Elm327 } from './elm327';
import { decodeSupportedPids } from './pids';

export interface Mode06Test {
    mid: number;
    tid: number;
    monitor: string;
    unit: string;
    value: number;
    min: number;
    max: number;
    passed: boolean;
}

interface Scaling {
    factor: number;
    offset?: number;
    unit: string;
}

const SCALING: Record<number, Scaling> = {
    0x01: { factor: 1, unit: '' },
    0x02: { factor: 0.1, unit: '' },
    0x03: { factor: 0.01, unit: '' },
    0x04: { factor: 0.001, unit: '' },
    0x07: { factor: 0.25, unit: 'tr/min' },
    0x08: { factor: 0.01, unit: 'km/h' },
    0x09: { factor: 1, unit: 'km/h' },
    0x0a: { factor: 0.122, unit: 'mV' },
    0x0b: { factor: 0.001, unit: 'V' },
    0x0c: { factor: 0.01, unit: 'V' },
    0x0d: { factor: 0.00390625, unit: 'mA' },
    0x0e: { factor: 0.001, unit: 'A' },
    0x0f: { factor: 0.01, unit: 'A' },
    0x10: { factor: 1, unit: 'ms' },
    0x11: { factor: 100, unit: 'ms' },
    0x12: { factor: 1, unit: 's' },
    0x13: { factor: 1, unit: 'mΩ' },
    0x14: { factor: 1, unit: 'Ω' },
    0x15: { factor: 1, unit: 'kΩ' },
    0x16: { factor: 0.1, offset: -40, unit: '°C' },
    0x17: { factor: 0.01, unit: 'kPa' },
    0x1a: { factor: 1, unit: 'kPa' },
    0x1b: { factor: 10, unit: 'kPa' },
    0x1c: { factor: 0.01, unit: '°' },
    0x1d: { factor: 0.5, unit: '°' },
    0x24: { factor: 1, unit: 'coups' },
    0x25: { factor: 1, unit: 'km' },
    0x27: { factor: 0.01, unit: 'g/s' },
    0x28: { factor: 1, unit: 'g/s' },
    0x2f: { factor: 0.01, unit: '%' },
    0x34: { factor: 1, unit: 'min' },
    0x81: { factor: 1, unit: '' },
    0x82: { factor: 0.1, unit: '' },
    0x83: { factor: 0.01, unit: '' },
    0x84: { factor: 0.001, unit: '' },
    0x8a: { factor: 0.122, unit: 'mV' },
    0x8b: { factor: 0.001, unit: 'V' },
    0x8c: { factor: 0.01, unit: 'V' },
    0x8e: { factor: 0.001, unit: 'A' },
    0x90: { factor: 1, unit: 'ms' },
    0x96: { factor: 0.1, unit: '°C' },
    0x9c: { factor: 0.01, unit: '°' },
    0x9d: { factor: 0.5, unit: '°' },
    0xaf: { factor: 0.01, unit: '%' }
};

const RANGES: [number, number, string][] = [
    [0x01, 0x10, 'Sonde lambda'],
    [0x21, 0x24, 'Catalyseur'],
    [0x31, 0x34, 'Recirculation des gaz (EGR)'],
    [0x35, 0x38, 'Distribution variable (VVT)'],
    [0x39, 0x3d, "Système d'évaporation (EVAP)"],
    [0x41, 0x50, 'Chauffage de sonde lambda'],
    [0x61, 0x64, 'Catalyseur chauffé'],
    [0x71, 0x74, "Injection d'air secondaire"],
    [0x81, 0x84, 'Système carburant'],
    [0x85, 0x88, 'Pression de suralimentation'],
    [0x90, 0x91, 'Piège à NOx'],
    [0x98, 0x99, 'Catalyseur NOx (SCR)'],
    [0xa1, 0xa1, 'Ratés de combustion (global)'],
    [0xb0, 0xb1, 'Filtre à particules (FAP)']
];

export function monitorName(mid: number): string {
    if (mid >= 0xa2 && mid <= 0xad) return `Ratés de combustion cylindre ${mid - 0xa1}`;
    const range = RANGES.find(([from, to]) => mid >= from && mid <= to);
    if (!range) return `Moniteur 0x${mid.toString(16).toUpperCase().padStart(2, '0')}`;
    const [from, to, label] = range;
    if (from === to) return label;
    if (from === 0x01 || from === 0x41) {
        const index = mid - from;
        return `${label} banc ${Math.floor(index / 4) + 1} capteur ${(index % 4) + 1}`;
    }
    return `${label} n°${mid - from + 1}`;
}

function scale(raw: number, uas: number): { value: number; unit: string } {
    const scaling = SCALING[uas];
    if (!scaling) return { value: raw, unit: '(brut)' };
    return { value: raw * scaling.factor + (scaling.offset ?? 0), unit: scaling.unit };
}

export function decodeMode06Records(data: number[]): Mode06Test[] {
    const tests: Mode06Test[] = [];
    for (let i = 1; i + 9 <= data.length; i += 9) {
        const [mid, tid, uas, v1, v2, n1, n2, x1, x2] = data.slice(i, i + 9);
        const signed = uas >= 0x80;
        const read = (hi: number, lo: number) => {
            const n = (hi << 8) | lo;
            return signed && n & 0x8000 ? n - 0x10000 : n;
        };
        const rawValue = read(v1, v2);
        const rawMin = read(n1, n2);
        const rawMax = read(x1, x2);
        const value = scale(rawValue, uas);
        tests.push({
            mid,
            tid,
            monitor: monitorName(mid),
            unit: value.unit,
            value: value.value,
            min: scale(rawMin, uas).value,
            max: scale(rawMax, uas).value,
            passed: rawValue >= rawMin && rawValue <= rawMax
        });
    }
    return tests;
}

export async function readMode06(elm: Elm327): Promise<Mode06Test[] | null> {
    if (!elm.isCan) return null;
    const supported: number[] = [];
    for (const base of [0x00, 0x20, 0x40, 0x60, 0x80, 0xa0, 0xc0, 0xe0]) {
        if (base !== 0x00 && !supported.includes(base)) break;
        const messages = await elm.request(0x06, base);
        const message = messages.find((m) => m.data[1] === base);
        if (!message) break;
        supported.push(...decodeSupportedPids(base, message.data.slice(2)));
    }
    if (supported.length === 0) return null;
    const tests: Mode06Test[] = [];
    for (const mid of supported.filter((m) => m % 0x20 !== 0)) {
        for (const message of await elm.request(0x06, mid)) {
            tests.push(...decodeMode06Records(message.data));
        }
    }
    return tests;
}
