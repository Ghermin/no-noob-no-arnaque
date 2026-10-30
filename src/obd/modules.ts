import type { EcuReport, ExtDtc } from '../types';
import type { Elm327 } from './elm327';
import { decodeDtcBytes, describeDtc } from './dtc';
import { parseRawFrames, type EcuMessage } from './frames';

export type Progress = (message: string) => void;

const hex3 = (n: number) => n.toString(16).toUpperCase().padStart(3, '0');

const KNOWN_NAMES: Record<string, Record<number, string>> = {
    vag: {
        0x7e0: 'Moteur',
        0x7e1: 'Boîte de vitesses',
        0x710: 'Passerelle (gateway)',
        0x70e: 'Électronique centrale',
        0x712: 'Direction assistée',
        0x713: 'ABS / ESP',
        0x714: 'Tableau de bord',
        0x715: 'Airbag',
        0x746: 'Climatisation'
    },
    renault: {
        0x7e0: 'Injection (moteur)',
        0x740: 'ABS / ESP',
        0x742: 'Direction assistée',
        0x743: 'Tableau de bord',
        0x744: 'Climatisation',
        0x745: 'Boîtier habitacle (UCH)',
        0x752: 'Airbag'
    },
    ford: {
        0x7e0: 'Moteur (PCM)',
        0x7e1: 'Boîte de vitesses (TCM)',
        0x7e4: 'Batterie hybride (BECM)',
        0x706: 'Caméra avant (IPMA)',
        0x716: 'Passerelle (GWM)',
        0x720: 'Tableau de bord (IPC)',
        0x724: 'Commodos au volant (SCCM)',
        0x726: 'Boîtier habitacle (BCM)',
        0x727: 'Audio (ACM)',
        0x730: 'Direction assistée (PSCM)',
        0x733: 'Climatisation (HVAC)',
        0x736: 'Aide au stationnement (PAM)',
        0x737: 'Airbag (RCM)',
        0x740: 'Porte conducteur (DDM)',
        0x741: 'Porte passager (PDM)',
        0x760: 'ABS / ESP',
        0x764: 'Régulateur adaptatif / radar (CCM)',
        0x7d0: 'Multimédia (APIM / SYNC)'
    },
    gm: {
        0x7e0: 'Moteur (ECM)',
        0x7e2: 'Boîte de vitesses (TCM)',
        0x241: 'Boîtier habitacle (BCM)',
        0x243: 'ABS / ESP (EBCM)',
        0x247: 'Airbag (SDM)',
        0x24c: 'Tableau de bord (IPC)'
    },
    generic: {
        0x7e0: 'Moteur',
        0x7e1: 'Boîte de vitesses'
    }
};

export function brandFamily(make: string | null): keyof typeof KNOWN_NAMES {
    if (make && ['Seat', 'Volkswagen', 'Volkswagen Utilitaires', 'Škoda', 'Audi'].includes(make)) return 'vag';
    if (make && ['Renault', 'Dacia'].includes(make)) return 'renault';
    if (make === 'Ford') return 'ford';
    if (make && ['Chevrolet', 'Daewoo', 'Cadillac', 'Opel'].includes(make)) return 'gm';
    return 'generic';
}

function ascii(bytes: number[]): string {
    return String.fromCharCode(...bytes.filter((b) => b >= 0x20 && b < 0x7f)).trim();
}

function isNegative(message: EcuMessage | undefined, service: number): boolean {
    return !!message && message.data[0] === 0x7f && message.data[1] === service;
}

// Octet de statut UDS (ISO 14229). Beaucoup de calculateurs (Ford notamment) listent tous leurs codes avec
// seulement « test pas encore fait » (0x40, 0x50) : ce ne sont pas des défauts.
const UDS_TEST_FAILED = 0x01;
const UDS_PENDING = 0x04;
const UDS_CONFIRMED = 0x08;
const UDS_FAILED_SINCE_CLEAR = 0x20;
const UDS_WARNING_LAMP = 0x80;

function udsStates(status: number): string[] {
    const states: string[] = [];
    if (status & UDS_TEST_FAILED) states.push('présent en ce moment');
    if (status & UDS_CONFIRMED) states.push('confirmé');
    if (status & UDS_PENDING) states.push('en attente de confirmation');
    if (status & UDS_WARNING_LAMP) states.push("allume un voyant");
    if (states.length === 0 && status & UDS_FAILED_SINCE_CLEAR) states.push("survenu depuis le dernier effacement, absent aujourd'hui");
    return states;
}

export function decodeUdsDtcs(data: number[]): { dtcs: ExtDtc[]; ignored: number } {
    const dtcs: ExtDtc[] = [];
    let ignored = 0;
    for (let i = 3; i + 4 <= data.length; i += 4) {
        const [a, b, ftb, status] = data.slice(i, i + 4);
        if ((a | b | ftb) === 0 || (a & b & ftb) === 0xff) continue;
        const states = udsStates(status);
        if (states.length === 0) {
            ignored++;
            continue;
        }
        const base = decodeDtcBytes(a, b);
        dtcs.push({
            code: `${base}-${ftb.toString(16).toUpperCase().padStart(2, '0')}`,
            description: describeDtc(base).description,
            status: states.join(' · '),
            history: (status & (UDS_TEST_FAILED | UDS_PENDING | UDS_CONFIRMED | UDS_WARNING_LAMP)) === 0
        });
    }
    return { dtcs, ignored };
}

export function decodeKwpDtcs(data: number[]): ExtDtc[] {
    const dtcs: ExtDtc[] = [];
    for (let i = 2; i + 2 < data.length; i += 3) {
        const [a, b, status] = data.slice(i, i + 3);
        if (a === 0 && b === 0) continue;
        const code = decodeDtcBytes(a, b);
        dtcs.push({ code, description: describeDtc(code).description, status: `statut 0x${status.toString(16).toUpperCase().padStart(2, '0')}` });
    }
    return dtcs;
}

async function sweep(elm: Elm327, ids: number[], filter: string, progress: Progress, found: { tx: number; rx: number }[]): Promise<void> {
    await elm.tryCommands(['ATCAF1', 'ATH1', 'ATS0', 'ATAT0', 'ATST10', `ATCF${filter}`, 'ATCM700']);
    for (const [index, tx] of ids.entries()) {
        if (index % 16 === 0) progress(`Recherche des calculateurs… (${Math.round((index / ids.length) * 100)} %)`);
        if (found.some((f) => f.rx === tx)) continue;
        await elm.send(`ATSH${hex3(tx)}`);
        const messages = await elm.query('3E00', 1500);
        for (const message of messages) {
            const rx = parseInt(message.ecu, 16);
            if (rx !== tx && !found.some((f) => f.rx === rx) && (message.data[0] === 0x7e || message.data[0] === 0x7f)) {
                found.push({ tx, rx });
            }
        }
    }
}

async function discover(elm: Elm327, family: keyof typeof KNOWN_NAMES, progress: Progress): Promise<{ tx: number; rx: number }[]> {
    const found: { tx: number; rx: number }[] = [];
    const standard: number[] = [];
    for (let tx = 0x700; tx <= 0x7f7; tx++) {
        if (tx !== 0x7df && (tx < 0x7e8 || tx > 0x7ef)) standard.push(tx);
    }
    await sweep(elm, standard, '700', progress, found);
    if (family === 'gm') {
        const gmlan = Array.from({ length: 0x20 }, (_, i) => 0x240 + i);
        await sweep(elm, gmlan, '600', (m) => progress(`${m} — adresses GM`), found);
    }
    return found;
}

export function decodeGmlanFrames(raw: string, rx: number): ExtDtc[] | null {
    const frames = parseRawFrames(raw).filter((f) => (f.id & 0xff) === (rx & 0xff));
    if (frames.some((f) => f.id === rx && f.data[1] === 0x7f)) return null;
    const records = frames.filter((f) => f.id !== rx && f.data[0] === 0x81);
    if (records.length === 0) return frames.length > 0 ? [] : null;
    const dtcs: ExtDtc[] = [];
    for (const { data } of records) {
        const [, a, b, ftb, status] = data;
        if (a === 0 && b === 0) continue;
        const base = decodeDtcBytes(a, b);
        const code = `${base}-${ftb.toString(16).toUpperCase().padStart(2, '0')}`;
        if (dtcs.some((d) => d.code === code)) continue;
        dtcs.push({ code, description: describeDtc(base).description, status: `statut 0x${status.toString(16).toUpperCase().padStart(2, '0')}` });
    }
    return dtcs;
}

async function readGmlanDtcs(elm: Elm327, tx: number, rx: number): Promise<ExtDtc[] | null> {
    try {
        await elm.tryCommands(['ATCAF0', `ATSH${hex3(tx)}`, `ATCF${hex3(rx & 0xff)}`, 'ATCM0FF', 'ATSTFF']);
        return decodeGmlanFrames(await elm.send('03A981FF', 6000), rx);
    } finally {
        await elm.tryCommands(['ATCAF1', 'ATST64']);
    }
}

async function readEcu(elm: Elm327, tx: number, rx: number, family: keyof typeof KNOWN_NAMES): Promise<EcuReport> {
    await elm.tryCommands(['ATCAF1', 'ATST64', `ATSH${hex3(tx)}`, `ATCRA${hex3(rx)}`, `ATFCSH${hex3(tx)}`, 'ATFCSD300000', 'ATFCSM1']);

    const name = (await elm.query('22F197')).find((m) => m.data[0] === 0x62);
    let part = (await elm.query('22F187')).find((m) => m.data[0] === 0x62);
    // Ford ne répond pas à F187 : sa référence pièce est dans F113.
    if (!part && family === 'ford') part = (await elm.query('22F113')).find((m) => m.data[0] === 0x62);
    let protocol = 'UDS';
    let dtcs: ExtDtc[] = [];
    let ignored = 0;

    let response = (await elm.query('1902FF', 5000))[0];
    if (isNegative(response, 0x19) && response.data[2] === 0x78) response = (await elm.query('1902FF', 5000))[0];
    if (response?.data[0] === 0x59) {
        ({ dtcs, ignored } = decodeUdsDtcs(response.data));
    } else {
        const kwp = (await elm.query('1802FF00', 5000))[0];
        if (kwp?.data[0] === 0x58) {
            protocol = 'KWP2000 sur CAN';
            dtcs = decodeKwpDtcs(kwp.data);
        } else {
            const gm = family === 'gm' ? await readGmlanDtcs(elm, tx, rx) : null;
            if (gm) {
                protocol = 'GMLAN (expérimental)';
                dtcs = gm;
            } else {
                protocol = 'non identifié';
            }
        }
    }

    return {
        id: `0x${hex3(tx)}`,
        name: (name && ascii(name.data.slice(3))) || KNOWN_NAMES[family][tx] || KNOWN_NAMES.generic[tx] || `Calculateur non identifié (0x${hex3(tx)})`,
        protocol,
        partNumber: part ? ascii(part.data.slice(3)) || null : null,
        dtcs,
        ...(ignored ? { ignored } : {})
    };
}

export async function scanModules(elm: Elm327, make: string | null, progress: Progress): Promise<EcuReport[]> {
    if (elm.protocolKind !== 'can11') return [];
    const family = brandFamily(make);
    try {
        const found = await discover(elm, family, progress);
        const reports: EcuReport[] = [];
        for (const [index, { tx, rx }] of found.entries()) {
            progress(`Lecture des calculateurs… (${index + 1}/${found.length})`);
            reports.push(await readEcu(elm, tx, rx, family));
        }
        return reports;
    } finally {
        await elm.restoreObdDefaults();
    }
}
