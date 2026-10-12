import type { Monitor } from '../types';

const SPARK_MONITORS = [
    'Catalyseur',
    'Catalyseur chauffé',
    "Système d'évaporation (EVAP)",
    "Injection d'air secondaire",
    'Climatisation',
    'Sondes lambda',
    'Chauffage des sondes lambda',
    'Recirculation des gaz (EGR / VVT)'
];

const COMPRESSION_MONITORS = [
    'Catalyseur NMHC',
    'Traitement des NOx / SCR',
    null,
    'Pression de suralimentation',
    null,
    "Capteurs des gaz d'échappement",
    'Filtre à particules (FAP)',
    'Recirculation des gaz (EGR / VVT)'
];

const CONTINUOUS_MONITORS = ['Ratés de combustion', 'Système carburant', 'Composants'];

export interface Readiness {
    mil: boolean;
    dtcCount: number;
    ignition: 'compression' | 'spark';
    monitors: Monitor[];
}

export function decodeReadiness(bytes: number[]): Readiness {
    const [a, b, c, d] = bytes;
    const ignition = b & 0x08 ? 'compression' : 'spark';
    const monitors: Monitor[] = [];

    CONTINUOUS_MONITORS.forEach((label, i) => {
        if (b & (1 << i)) {
            monitors.push({ key: `continu-${i}`, label, complete: !(b & (1 << (i + 4))) });
        }
    });

    const labels = ignition === 'compression' ? COMPRESSION_MONITORS : SPARK_MONITORS;
    labels.forEach((label, i) => {
        if (label && c & (1 << i)) {
            monitors.push({ key: `${ignition}-${i}`, label, complete: !(d & (1 << i)) });
        }
    });

    return { mil: (a & 0x80) !== 0, dtcCount: a & 0x7f, ignition, monitors };
}
