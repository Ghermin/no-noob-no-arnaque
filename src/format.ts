import { analyzeScan, type Severity } from './analysis';
import { FUEL_LABELS, type Fuel, type ScanResult, type Vehicle } from './types';
import { fuelFromCode } from './obd/pids';

const SEVERITY_RANK: Record<Severity, number> = { ok: 0, info: 1, warning: 2, danger: 3 };

export const SEVERITY_LABELS: Record<Severity, string> = {
    ok: 'RAS',
    info: 'À noter',
    warning: 'Attention',
    danger: 'Défaut'
};

export function formatDate(timestamp: number): string {
    return new Date(timestamp).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' });
}

export function formatDuration(minutes: number): string {
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    if (hours < 48) return `${hours} h`;
    return `${Math.floor(hours / 24)} jours`;
}

export function vehicleSubtitle(vehicle: Vehicle): string {
    return [vehicle.make, vehicle.year, FUEL_LABELS[vehicle.fuel]].filter(Boolean).join(' · ');
}

export function worstSeverity(result: ScanResult): Severity {
    return analyzeScan(result).reduce<Severity>((worst, f) => (SEVERITY_RANK[f.severity] > SEVERITY_RANK[worst] ? f.severity : worst), 'ok');
}

export function guessFuel(result: ScanResult): Fuel {
    if (result.fuelCode !== null) {
        const fuel = fuelFromCode(result.fuelCode);
        if (fuel) return fuel;
    }
    return result.ignition === 'compression' ? 'diesel' : 'essence';
}
