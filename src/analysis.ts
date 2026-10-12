import type { SavedScan, ScanResult } from './types';

export type Severity = 'ok' | 'info' | 'warning' | 'danger';

export interface Finding {
    severity: Severity;
    title: string;
    detail: string;
}

const RECENT_CLEAR_KM = 200;
const RECENT_CLEAR_WARMUPS = 10;

export function recentlyCleared(result: ScanResult): boolean {
    if (result.distanceSinceClear !== null) return result.distanceSinceClear < RECENT_CLEAR_KM;
    if (result.warmupsSinceClear !== null) return result.warmupsSinceClear < RECENT_CLEAR_WARMUPS;
    return false;
}

function incompleteMonitors(result: ScanResult) {
    return result.monitors.filter((m) => !m.complete);
}

function plural(count: number, singular: string, pluralForm: string): string {
    return `${count} ${count > 1 ? pluralForm : singular}`;
}

function sinceClearText(result: ScanResult): string {
    if (!result.distanceSinceClear && !result.warmupsSinceClear) return "à l'instant (aucun trajet depuis)";
    const parts: string[] = [];
    if (result.distanceSinceClear !== null) parts.push(`${result.distanceSinceClear} km`);
    if (result.warmupsSinceClear !== null) parts.push(plural(result.warmupsSinceClear, 'démarrage à froid', 'démarrages à froid'));
    return `il y a seulement ${parts.join(' et ')}`;
}

function codeList(list: string[]): string {
    return list.length > 1 ? `Les codes ${list.join(', ')}` : `Le code ${list[0]}`;
}

export function analyzeScan(result: ScanResult): Finding[] {
    const findings: Finding[] = [];
    const incomplete = incompleteMonitors(result);
    const cleared = recentlyCleared(result);

    if (result.mil) {
        findings.push({
            severity: 'danger',
            title: 'Voyant moteur allumé',
            detail: 'Le calculateur demande l\'allumage du voyant moteur : un défaut lié à la pollution ou au moteur est confirmé.'
        });
    }

    if (result.stored.length > 0) {
        findings.push({
            severity: result.mil ? 'danger' : 'warning',
            title: `${result.stored.length} code(s) défaut confirmé(s)`,
            detail: 'Ces défauts ont été détectés plusieurs fois. Voir le détail ci-dessous.'
        });
    }

    if (result.pending.length > 0) {
        findings.push({
            severity: 'warning',
            title: `${result.pending.length} code(s) en attente`,
            detail: "Défauts détectés une fois, pas encore confirmés. S'ils reviennent au prochain trajet, ils seront confirmés."
        });
    }

    if (result.permanent.length > 0) {
        findings.push({
            severity: 'danger',
            title: `${result.permanent.length} code(s) permanent(s)`,
            detail: "Ces codes ne s'effacent pas avec un outil de diagnostic : seul le calculateur les retire quand il a vérifié lui-même que le problème est réglé. Un code permanent après un « effacement » montre que le défaut n'a pas encore été validé comme réparé."
        });
    }

    if (cleared) {
        const base = `Les codes défaut ont été effacés ${sinceClearText(result)}.`;
        findings.push({
            severity: incomplete.length > 0 ? 'warning' : 'info',
            title: 'Effacement récent des codes défaut',
            detail:
                incomplete.length > 0
                    ? `${base} Les autotests n'ont pas encore tous tourné : la voiture ne peut pas encore confirmer qu'elle va bien. Normal juste après une réparation ou un débranchement de batterie, mais à l'achat d'une occasion c'est un signal d'alerte : un défaut a peut-être été masqué.`
                    : `${base} Tous les autotests ont depuis été repassés avec succès.`
        });
    } else if (incomplete.length > 0) {
        findings.push({
            severity: 'info',
            title: plural(incomplete.length, 'autotest non terminé', 'autotests non terminés'),
            detail: `Pas encore exécutés depuis le dernier effacement : ${incomplete.map((m) => m.label).join(', ')}. Certains (FAP, EGR, catalyseur) ne tournent que dans des conditions précises, par exemple un trajet sur route à vitesse stable.`
        });
    }

    if (result.distanceWithMil !== null && result.distanceWithMil > 0) {
        findings.push({
            severity: 'warning',
            title: `${result.distanceWithMil} km parcourus voyant allumé`,
            detail: 'Distance parcourue depuis que le voyant moteur s\'est allumé.'
        });
    }

    if (findings.length === 0 || findings.every((f) => f.severity === 'info' || f.severity === 'ok')) {
        findings.unshift({
            severity: 'ok',
            title: 'Aucun défaut moteur détecté',
            detail: "Le calculateur moteur ne signale aucun défaut. Cela ne couvre pas l'usure mécanique (freins, pneus, courroie, amortisseurs…), que l'OBD ne voit pas."
        });
    }

    return findings;
}

export interface Comparison {
    findings: Finding[];
    fixed: string[];
    appeared: string[];
    persisting: string[];
}

function codes(result: ScanResult): string[] {
    return [...new Set([...result.stored, ...result.pending, ...result.permanent].map((d) => d.code))];
}

function clearedBetween(before: SavedScan, after: SavedScan): boolean {
    const b = before.result;
    const a = after.result;
    if (b.distanceSinceClear !== null && a.distanceSinceClear !== null && a.distanceSinceClear < b.distanceSinceClear) return true;
    if (b.warmupsSinceClear !== null && a.warmupsSinceClear !== null && a.warmupsSinceClear < b.warmupsSinceClear) return true;
    if (b.minutesSinceClear !== null && a.minutesSinceClear !== null && a.minutesSinceClear < b.minutesSinceClear) return true;
    if (before.odometer !== null && after.odometer !== null && b.distanceSinceClear !== null && a.distanceSinceClear !== null) {
        const driven = after.odometer - before.odometer;
        const counted = a.distanceSinceClear - b.distanceSinceClear;
        if (driven > 20 && counted < driven - 20) return true;
    }
    return false;
}

export function compareScans(before: SavedScan, after: SavedScan): Comparison {
    const beforeCodes = codes(before.result);
    const afterCodes = codes(after.result);
    const fixed = beforeCodes.filter((c) => !afterCodes.includes(c));
    const appeared = afterCodes.filter((c) => !beforeCodes.includes(c));
    const persisting = beforeCodes.filter((c) => afterCodes.includes(c));
    const cleared = clearedBetween(before, after);
    const incomplete = incompleteMonitors(after.result);
    const findings: Finding[] = [];

    if (cleared) {
        findings.push({
            severity: 'info',
            title: 'Codes effacés entre les deux scans',
            detail: "Quelqu'un a effacé la mémoire de défauts (ou la batterie a été débranchée). C'est normal après une réparation, mais un effacement seul ne répare rien."
        });
    }

    if (persisting.length > 0) {
        findings.push({
            severity: 'danger',
            title: persisting.length > 1 ? 'Défauts toujours présents' : 'Défaut toujours présent',
            detail: `${codeList(persisting)} ${persisting.length > 1 ? 'étaient déjà là au scan précédent et le sont toujours' : "était déjà là au scan précédent et l'est toujours"}.`
        });
    }

    if (appeared.length > 0) {
        findings.push({
            severity: 'warning',
            title: appeared.length > 1 ? 'Nouveaux défauts' : 'Nouveau défaut',
            detail: `${codeList(appeared)} ${appeared.length > 1 ? "n'étaient pas présents" : "n'était pas présent"} au scan précédent.`
        });
    }

    if (fixed.length > 0) {
        if (incomplete.length > 0) {
            findings.push({
                severity: 'warning',
                title: 'Réparation pas encore confirmée',
                detail: `${codeList(fixed)} ${fixed.length > 1 ? 'ont' : 'a'} disparu, mais ${plural(incomplete.length, "autotest n'a", "autotests n'ont")} pas encore tourné (${incomplete.map((m) => m.label).join(', ')}). Roulez quelques trajets variés (dont un trajet sur route de 20 min à vitesse stable), puis refaites un scan.`
            });
        } else {
            findings.push({
                severity: 'ok',
                title: 'Réparation confirmée par la voiture',
                detail: `${codeList(fixed)} ${fixed.length > 1 ? 'ont' : 'a'} disparu et tous les autotests sont repassés avec succès depuis.`
            });
        }
    }

    if (findings.length === 0) {
        findings.push({
            severity: 'ok',
            title: 'Aucun changement',
            detail: 'Mêmes codes défaut et pas d\'effacement détecté entre les deux scans.'
        });
    }

    return { findings, fixed, appeared, persisting };
}
