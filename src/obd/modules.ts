import type { EcuReport, ExtDtc } from '../types';
import type { Elm327 } from './elm327';
import { decodeDtcBytes, describeDtc } from './dtc';
import type { EcuMessage } from './frames';

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
    generic: {
        0x7e0: 'Moteur',
        0x7e1: 'Boîte de vitesses'
    }
};

export function brandFamily(make: string | null): keyof typeof KNOWN_NAMES {
    if (make && ['Seat', 'Volkswagen', 'Volkswagen Utilitaires', 'Škoda', 'Audi'].includes(make)) return 'vag';
    if (make && ['Renault', 'Dacia'].includes(make)) return 'renault';
    return 'generic';
}

function ascii(bytes: number[]): string {
    return String.fromCharCode(...bytes.filter((b) => b >= 0x20 && b < 0x7f)).trim();
}

function isNegative(message: EcuMessage | undefined, service: number): boolean {
    return !!message && message.data[0] === 0x7f && message.data[1] === service;
}

export function decodeUdsDtcs(data: number[]): ExtDtc[] {
    const dtcs: ExtDtc[] = [];
    for (let i = 3; i + 4 <= data.length; i += 4) {
        const [a, b, ftb, status] = data.slice(i, i + 4);
        const base = decodeDtcBytes(a, b);
        const states: string[] = [];
        if (status & 0x01) states.push('actif');
        if (status & 0x04) states.push('en attente');
        if (status & 0x08) states.push('confirmé');
        dtcs.push({
            code: `${base}-${ftb.toString(16).toUpperCase().padStart(2, '0')}`,
            description: describeDtc(base).description,
            status: states.join(', ') || 'mémorisé'
        });
    }
    return dtcs;
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

async function discover(elm: Elm327, progress: Progress): Promise<{ tx: number; rx: number }[]> {
    await elm.tryCommands(['ATCAF1', 'ATH1', 'ATS0', 'ATAT0', 'ATST10', 'ATCF700', 'ATCM700']);
    const found: { tx: number; rx: number }[] = [];
    for (let tx = 0x700; tx <= 0x7f7; tx++) {
        if (tx === 0x7df || (tx >= 0x7e8 && tx <= 0x7ef)) continue;
        if (tx % 16 === 0) progress(`Recherche des calculateurs… (${Math.round(((tx - 0x700) / 0xf8) * 100)} %)`);
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
    return found;
}

async function readEcu(elm: Elm327, tx: number, rx: number, family: keyof typeof KNOWN_NAMES): Promise<EcuReport> {
    await elm.tryCommands(['ATST64', `ATSH${hex3(tx)}`, `ATCRA${hex3(rx)}`, `ATFCSH${hex3(tx)}`, 'ATFCSD300000', 'ATFCSM1']);

    const name = (await elm.query('22F197')).find((m) => m.data[0] === 0x62);
    const part = (await elm.query('22F187')).find((m) => m.data[0] === 0x62);
    let protocol = 'UDS';
    let dtcs: ExtDtc[] = [];

    let response = (await elm.query('1902FF', 5000))[0];
    if (isNegative(response, 0x19) && response.data[2] === 0x78) response = (await elm.query('1902FF', 5000))[0];
    if (response?.data[0] === 0x59) {
        dtcs = decodeUdsDtcs(response.data);
    } else {
        const kwp = (await elm.query('1802FF00', 5000))[0];
        if (kwp?.data[0] === 0x58) {
            protocol = 'KWP2000 sur CAN';
            dtcs = decodeKwpDtcs(kwp.data);
        } else {
            protocol = 'non identifié';
        }
    }

    return {
        id: `0x${hex3(tx)}`,
        name: (name && ascii(name.data.slice(3))) || KNOWN_NAMES[family][tx] || KNOWN_NAMES.generic[tx] || `Calculateur 0x${hex3(tx)}`,
        protocol,
        partNumber: part ? ascii(part.data.slice(3)) || null : null,
        dtcs
    };
}

export async function scanModules(elm: Elm327, make: string | null, progress: Progress): Promise<EcuReport[]> {
    if (elm.protocolKind !== 'can11') return [];
    const family = brandFamily(make);
    try {
        const found = await discover(elm, progress);
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
