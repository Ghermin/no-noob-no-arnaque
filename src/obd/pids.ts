import type { Fuel } from '../types';

export interface PidDefinition {
    pid: number;
    label: string;
    unit: string;
    decode: (b: number[]) => number;
    digits?: number;
    fuels?: Fuel[];
}

const word = (b: number[]) => b[0] * 256 + b[1];
const percent = (b: number[]) => (b[0] * 100) / 255;
const trim = (b: number[]) => ((b[0] - 128) * 100) / 128;

export const LIVE_PIDS: PidDefinition[] = [
    { pid: 0x0c, label: 'Régime moteur', unit: 'tr/min', decode: (b) => word(b) / 4 },
    { pid: 0x0d, label: 'Vitesse', unit: 'km/h', decode: (b) => b[0] },
    { pid: 0x05, label: 'Température liquide de refroidissement', unit: '°C', decode: (b) => b[0] - 40 },
    { pid: 0x5c, label: "Température d'huile", unit: '°C', decode: (b) => b[0] - 40 },
    { pid: 0x0f, label: "Température d'air d'admission", unit: '°C', decode: (b) => b[0] - 40 },
    { pid: 0x04, label: 'Charge moteur calculée', unit: '%', decode: percent },
    { pid: 0x0b, label: "Pression d'admission (absolue)", unit: 'kPa', decode: (b) => b[0] },
    { pid: 0x33, label: 'Pression atmosphérique', unit: 'kPa', decode: (b) => b[0] },
    { pid: 0x10, label: "Débit d'air (débitmètre)", unit: 'g/s', decode: (b) => word(b) / 100, digits: 1 },
    { pid: 0x42, label: 'Tension batterie (calculateur)', unit: 'V', decode: (b) => word(b) / 1000, digits: 2 },
    { pid: 0x49, label: "Position pédale d'accélérateur", unit: '%', decode: percent },
    { pid: 0x23, label: 'Pression rail carburant', unit: 'bar', decode: (b) => (word(b) * 10) / 100, fuels: ['diesel'] },
    { pid: 0x2c, label: 'EGR commandée', unit: '%', decode: percent, fuels: ['diesel', 'essence', 'hybride', 'gpl'] },
    { pid: 0x2d, label: 'Erreur EGR', unit: '%', decode: trim, digits: 1 },
    { pid: 0x06, label: 'Correction injection court terme (banc 1)', unit: '%', decode: trim, digits: 1, fuels: ['essence', 'hybride', 'gpl'] },
    { pid: 0x07, label: 'Correction injection long terme (banc 1)', unit: '%', decode: trim, digits: 1, fuels: ['essence', 'hybride', 'gpl'] },
    { pid: 0x14, label: 'Sonde lambda amont (banc 1)', unit: 'V', decode: (b) => b[0] / 200, digits: 3, fuels: ['essence', 'hybride', 'gpl'] },
    { pid: 0x15, label: 'Sonde lambda aval (banc 1)', unit: 'V', decode: (b) => b[0] / 200, digits: 3, fuels: ['essence', 'hybride', 'gpl'] },
    { pid: 0x11, label: 'Position papillon', unit: '%', decode: percent, fuels: ['essence', 'hybride', 'gpl'] },
    { pid: 0x5e, label: 'Consommation instantanée', unit: 'L/h', decode: (b) => word(b) / 20, digits: 1 },
    { pid: 0x2f, label: 'Niveau de carburant', unit: '%', decode: percent },
    { pid: 0x46, label: 'Température extérieure', unit: '°C', decode: (b) => b[0] - 40 },
    { pid: 0x1f, label: 'Temps depuis démarrage', unit: 's', decode: word }
];

export const COUNTER_PIDS = {
    distanceWithMil: 0x21,
    warmupsSinceClear: 0x30,
    distanceSinceClear: 0x31,
    minutesWithMil: 0x4d,
    minutesSinceClear: 0x4e
} as const;

export function decodeWord(b: number[]): number {
    return word(b);
}

export function pidsForFuel(fuel: Fuel): PidDefinition[] {
    return LIVE_PIDS.filter((p) => !p.fuels || fuel === 'inconnu' || p.fuels.includes(fuel));
}

export function decodeSupportedPids(base: number, bytes: number[]): number[] {
    const supported: number[] = [];
    bytes.slice(0, 4).forEach((byte, i) => {
        for (let bit = 0; bit < 8; bit++) {
            if (byte & (0x80 >> bit)) supported.push(base + i * 8 + bit + 1);
        }
    });
    return supported;
}

export function fuelFromCode(code: number): Fuel | null {
    if (code === 0x04) return 'diesel';
    if (code === 0x01 || code === 0x09) return 'essence';
    if (code === 0x05 || code === 0x0c) return 'gpl';
    if (code >= 0x11 && code <= 0x14) return 'hybride';
    if (code === 0x08) return 'electrique';
    return null;
}
