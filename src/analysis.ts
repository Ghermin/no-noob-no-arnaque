import type { SavedScan, ScanResult } from './types';
import { describeDtc } from './obd/dtc';

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

export function analyzeScan(result: ScanResult, odometer: number | null = null, clearedByUser = false): Finding[] {
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

    if (cleared && clearedByUser) {
        findings.push({
            severity: 'info',
            title: 'Vous avez effacé les codes défaut',
            detail: `Effacement fait avec l'app ${sinceClearText(result)}. ${
                incomplete.length > 0
                    ? `${plural(incomplete.length, "autotest n'a", "autotests n'ont")} pas encore tourné. Roulez quelques trajets variés, dont un trajet sur route de 20 min, puis refaites un scan pour voir si les défauts reviennent.`
                    : 'Tous les autotests ont depuis été repassés.'
            }`
        });
    } else if (cleared) {
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

    for (const module of result.modules ?? []) {
        const real = module.dtcs.filter((d) => d.code !== '—');
        if (real.length === 0) continue;
        findings.push({
            severity: /airbag/i.test(module.name) ? 'danger' : 'warning',
            title: `${module.name} : ${plural(real.length, 'code défaut', 'codes défaut')}`,
            detail: real.map((d) => `${d.code} (${d.description})`).join(' ; ')
        });
    }

    const failed = (result.mode06 ?? []).filter((t) => !t.passed);
    if (failed.length > 0) {
        findings.push({
            severity: 'warning',
            title: plural(failed.length, 'autotest détaillé hors limites', 'autotests détaillés hors limites'),
            detail: `Concerne : ${[...new Set(failed.map((t) => t.monitor))].join(', ')}. Un test hors limites annonce souvent un défaut avant que le voyant ne s'allume.`
        });
    }

    findings.push(...odometerFindings(result, odometer));

    if (findings.length === 0 || findings.every((f) => f.severity === 'info' || f.severity === 'ok')) {
        const allModules = result.full && (result.modules?.length ?? 0) > 0;
        findings.unshift({
            severity: 'ok',
            title: allModules ? 'Aucun défaut détecté' : 'Aucun défaut moteur détecté',
            detail: `${allModules ? `Aucun des ${result.modules!.length} calculateurs lus ne signale de défaut.` : 'Le calculateur moteur ne signale aucun défaut.'} Cela ne couvre pas l'usure mécanique (freins, pneus, courroie, amortisseurs…), que l'OBD ne voit pas.`
        });
    }

    return findings;
}

function farApart(a: number, b: number): boolean {
    return Math.abs(a - b) > Math.max(500, Math.max(a, b) * 0.03);
}

function odometerFindings(result: ScanResult, typed: number | null): Finding[] {
    const readings: [string, number][] = [];
    if (result.odometerObd != null) readings.push(['le calculateur moteur', Math.round(result.odometerObd)]);
    if (result.odometerCluster != null) readings.push(['le tableau de bord (lecture VAG expérimentale)', result.odometerCluster]);
    if (typed !== null) readings.push(['le compteur (votre saisie)', typed]);
    for (let i = 0; i < readings.length; i++) {
        for (let j = i + 1; j < readings.length; j++) {
            if (farApart(readings[i][1], readings[j][1])) {
                return [
                    {
                        severity: 'danger',
                        title: 'Kilométrage incohérent',
                        detail: `${readings.map(([source, km]) => `${km.toLocaleString('fr-FR')} km selon ${source}`).join(', ')}. Vérifiez votre saisie ; si elle est juste, un compteur trafiqué ou remplacé est possible.`
                    }
                ];
            }
        }
    }
    return [];
}

export interface CodeItem {
    code: string;
    description: string;
}

export interface Comparison {
    findings: Finding[];
    fixed: CodeItem[];
    appeared: CodeItem[];
    persisting: CodeItem[];
}

function codes(result: ScanResult): Map<string, string> {
    const map = new Map<string, string>();
    for (const d of [...result.stored, ...result.pending, ...result.permanent]) map.set(d.code, describeDtc(d.code).description);
    for (const module of result.modules ?? []) {
        for (const d of module.dtcs) {
            if (d.code !== '—') map.set(`${module.name} · ${d.code}`, d.description);
        }
    }
    return map;
}

function mileage(scan: SavedScan): number | null {
    return scan.odometer ?? (scan.result.odometerObd != null ? Math.round(scan.result.odometerObd) : null) ?? scan.result.odometerCluster ?? null;
}

export function clearedBetween(before: SavedScan, after: SavedScan): boolean {
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

export function compareScans(before: SavedScan, after: SavedScan, userCleared = false): Comparison {
    const beforeCodes = codes(before.result);
    const afterCodes = codes(after.result);
    const item = (code: string, map: Map<string, string>): CodeItem => ({ code, description: map.get(code) ?? '' });
    const fixed = [...beforeCodes.keys()].filter((c) => !afterCodes.has(c)).map((c) => item(c, beforeCodes));
    const appeared = [...afterCodes.keys()].filter((c) => !beforeCodes.has(c)).map((c) => item(c, afterCodes));
    const persisting = [...beforeCodes.keys()].filter((c) => afterCodes.has(c)).map((c) => item(c, afterCodes));
    const cleared = clearedBetween(before, after);
    const incomplete = incompleteMonitors(after.result);
    const findings: Finding[] = [];
    const kmBefore = mileage(before);
    const kmAfter = mileage(after);

    if (kmBefore !== null && kmAfter !== null && kmAfter < kmBefore - 1) {
        findings.push({
            severity: 'danger',
            title: 'Le kilométrage a reculé',
            detail: `${kmBefore.toLocaleString('fr-FR')} km au premier scan, ${kmAfter.toLocaleString('fr-FR')} km au second. Erreur de saisie, ou compteur trafiqué.`
        });
    }

    if (userCleared) {
        findings.push({
            severity: 'info',
            title: 'Codes effacés par vous entre les deux scans',
            detail: "Vous avez effacé les codes avec l'app. Les défauts encore présents sont revenus d'eux-mêmes."
        });
    } else if (cleared) {
        findings.push({
            severity: 'info',
            title: 'Codes effacés entre les deux scans',
            detail: "Quelqu'un a effacé la mémoire de défauts (ou la batterie a été débranchée). C'est normal après une réparation, mais un effacement seul ne répare rien."
        });
    }

    if (persisting.length > 0) {
        findings.push({
            severity: 'danger',
            title: userCleared
                ? persisting.length > 1
                    ? 'Défauts revenus après effacement'
                    : 'Défaut revenu après effacement'
                : persisting.length > 1
                  ? 'Défauts toujours présents'
                  : 'Défaut toujours présent',
            detail: userCleared
                ? `${codeList(persisting.map((c) => c.code))} ${persisting.length > 1 ? 'sont revenus' : 'est revenu'} tout seul après l'effacement : le problème est bien réel.`
                : `${codeList(persisting.map((c) => c.code))} ${persisting.length > 1 ? 'étaient déjà là au scan précédent et le sont toujours' : "était déjà là au scan précédent et l'est toujours"}.`
        });
    }

    if (appeared.length > 0) {
        findings.push({
            severity: 'warning',
            title: appeared.length > 1 ? 'Nouveaux défauts' : 'Nouveau défaut',
            detail: `${codeList(appeared.map((c) => c.code))} ${appeared.length > 1 ? "n'étaient pas présents" : "n'était pas présent"} au scan précédent.`
        });
    }

    if (fixed.length > 0) {
        if (incomplete.length > 0) {
            findings.push({
                severity: 'warning',
                title: 'Réparation pas encore confirmée',
                detail: `${codeList(fixed.map((c) => c.code))} ${fixed.length > 1 ? 'ont' : 'a'} disparu, mais ${plural(incomplete.length, "autotest n'a", "autotests n'ont")} pas encore tourné (${incomplete.map((m) => m.label).join(', ')}). Roulez quelques trajets variés (dont un trajet sur route de 20 min à vitesse stable), puis refaites un scan.`
            });
        } else {
            findings.push({
                severity: 'ok',
                title: userCleared ? 'Défaut pas revenu' : 'Réparation confirmée par la voiture',
                detail: `${codeList(fixed.map((c) => c.code))} ${fixed.length > 1 ? 'ont' : 'a'} disparu et tous les autotests sont repassés avec succès depuis.`
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
