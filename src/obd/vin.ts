import type { EcuMessage } from './frames';

const WMI: Record<string, string> = {
    VSS: 'Seat',
    VSE: 'Seat',
    WVW: 'Volkswagen',
    WVG: 'Volkswagen',
    WV1: 'Volkswagen Utilitaires',
    WV2: 'Volkswagen Utilitaires',
    TMB: 'Škoda',
    WAU: 'Audi',
    WUA: 'Audi',
    TRU: 'Audi',
    VF1: 'Renault',
    VF6: 'Renault',
    UU1: 'Dacia',
    VF3: 'Peugeot',
    VR3: 'Peugeot',
    VF7: 'Citroën',
    VR7: 'Citroën',
    VR1: 'DS',
    W0L: 'Opel',
    W0V: 'Opel',
    VXK: 'Opel',
    WF0: 'Ford',
    ZFA: 'Fiat',
    ZAR: 'Alfa Romeo',
    ZCF: 'Iveco',
    WBA: 'BMW',
    WMW: 'Mini',
    WDD: 'Mercedes-Benz',
    WDB: 'Mercedes-Benz',
    W1K: 'Mercedes-Benz',
    WME: 'Smart',
    VNK: 'Toyota',
    SB1: 'Toyota',
    JTD: 'Toyota',
    JTN: 'Toyota',
    VSK: 'Nissan',
    SJN: 'Nissan',
    JN1: 'Nissan',
    KMH: 'Hyundai',
    TMA: 'Hyundai',
    NLH: 'Hyundai',
    KNA: 'Kia',
    U5Y: 'Kia',
    YV1: 'Volvo',
    JMZ: 'Mazda',
    JHM: 'Honda',
    SHH: 'Honda',
    TSM: 'Suzuki',
    JSA: 'Suzuki',
    MAL: 'Hyundai',
    SAL: 'Land Rover',
    SAJ: 'Jaguar',
    LRW: 'Tesla',
    '5YJ': 'Tesla',
    XWE: 'Kia',
    KL1: 'Chevrolet',
    KLA: 'Daewoo',
    '1G1': 'Chevrolet',
    NM0: 'Ford'
};

const VAG = ['Seat', 'Volkswagen', 'Volkswagen Utilitaires', 'Škoda', 'Audi'];

const YEAR_CODES = 'ABCDEFGHJKLMNPRSTVWXY123456789';

export function vinFromMessages(messages: EcuMessage[], isCan: boolean): string | null {
    if (messages.length === 0) return null;
    let bytes: number[];
    if (isCan) {
        bytes = messages[0].data.slice(3);
    } else {
        const ecu = messages[0].ecu;
        bytes = messages
            .filter((m) => m.ecu === ecu)
            .sort((x, y) => x.data[2] - y.data[2])
            .flatMap((m) => m.data.slice(3));
    }
    const vin = String.fromCharCode(...bytes.filter((b) => b >= 0x20 && b < 0x7f)).replace(/[^A-HJ-NPR-Z0-9]/g, '');
    return vin.length === 17 ? vin : null;
}

export function makeFromVin(vin: string): string | null {
    return WMI[vin.slice(0, 3)] ?? null;
}

export function isVag(make: string | null): boolean {
    return make !== null && VAG.includes(make);
}

export function yearFromVin(vin: string): number | null {
    const index = YEAR_CODES.indexOf(vin[9]);
    if (index === -1) return null;
    const year = 2010 + index;
    const current = new Date().getFullYear() + 1;
    return year > current ? year - 30 : year;
}
