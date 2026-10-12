export type Fuel = 'diesel' | 'essence' | 'hybride' | 'gpl' | 'electrique' | 'inconnu';

export const FUEL_LABELS: Record<Fuel, string> = {
    diesel: 'Diesel',
    essence: 'Essence',
    hybride: 'Hybride',
    gpl: 'GPL / bicarburation',
    electrique: 'Électrique',
    inconnu: 'Je ne sais pas'
};

export interface Monitor {
    key: string;
    label: string;
    complete: boolean;
}

export interface Dtc {
    code: string;
    ecu: string;
}

export interface ScanResult {
    vin: string | null;
    protocol: string;
    adapter: string;
    mil: boolean;
    ignition: 'compression' | 'spark';
    monitors: Monitor[];
    stored: Dtc[];
    pending: Dtc[];
    permanent: Dtc[];
    distanceSinceClear: number | null;
    warmupsSinceClear: number | null;
    minutesSinceClear: number | null;
    distanceWithMil: number | null;
    minutesWithMil: number | null;
    fuelCode: number | null;
    supportedPids: number[];
    ecus: string[];
}

export type ScanLabel = 'controle' | 'avant-garage' | 'apres-garage' | 'achat-occasion';

export const SCAN_LABELS: Record<ScanLabel, string> = {
    controle: 'Contrôle',
    'avant-garage': 'Avant le garage',
    'apres-garage': 'Après le garage',
    'achat-occasion': "Achat d'occasion"
};

export interface Vehicle {
    id: string;
    name: string;
    vin: string | null;
    fuel: Fuel;
    make: string | null;
    year: number | null;
    createdAt: number;
}

export interface SavedScan {
    id: string;
    vehicleId: string;
    date: number;
    label: ScanLabel;
    odometer: number | null;
    note: string;
    result: ScanResult;
}
