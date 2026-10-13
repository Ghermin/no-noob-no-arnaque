import type { EcuReport, ExtDtc } from '../types';
import type { Elm327 } from './elm327';
import { describeDtc } from './dtc';
import { parseRawFrames as rawFrames } from './frames';
import { logLine } from './log';
import type { Progress } from './modules';

const hex = (n: number, len = 2) => n.toString(16).toUpperCase().padStart(len, '0');

export const VAG_MODULES: { address: number; name: string }[] = [
    { address: 0x01, name: 'Moteur' },
    { address: 0x02, name: 'Boîte automatique' },
    { address: 0x03, name: 'ABS / ESP' },
    { address: 0x08, name: 'Climatisation' },
    { address: 0x09, name: 'Électronique centrale' },
    { address: 0x15, name: 'Airbag' },
    { address: 0x16, name: 'Commodos de volant' },
    { address: 0x17, name: 'Tableau de bord' },
    { address: 0x1f, name: 'Passerelle (gateway)' },
    { address: 0x25, name: 'Antidémarrage' },
    { address: 0x44, name: 'Direction assistée' },
    { address: 0x46, name: 'Confort' },
    { address: 0x56, name: 'Radio' }
];

const VAG_CODES: Record<string, string> = {
    '00283': 'Capteur de vitesse de roue avant gauche (G47)',
    '00285': 'Capteur de vitesse de roue avant droite (G45)',
    '00287': 'Capteur de vitesse de roue arrière droite (G44)',
    '00290': 'Capteur de vitesse de roue arrière gauche (G46)',
    '00532': "Tension d'alimentation B+",
    '00588': 'Allumeur airbag conducteur (N95)',
    '00625': 'Signal de vitesse du véhicule',
    '00668': "Tension d'alimentation borne 30",
    '01044': 'Calculateur mal codé',
    '01299': 'Interface de diagnostic du bus de données (J533)',
    '01312': 'Bus de données propulsion',
    '01314': 'Calculateur moteur : pas de communication',
    '01316': 'Calculateur ABS : pas de communication',
    '01321': 'Calculateur airbag : pas de communication'
};

export function describeVagCode(value: number): string {
    const code = value.toString().padStart(5, '0');
    if (VAG_CODES[code]) return VAG_CODES[code];
    if (value >= 16384 && value < 16384 + 1000) {
        const obd = `P0${(value - 16384).toString().padStart(3, '0')}`;
        return `${obd} : ${describeDtc(obd).description}`;
    }
    if (value >= 17408 && value < 17408 + 1000) {
        const obd = `P1${(value - 17408).toString().padStart(3, '0')}`;
        return `${obd} : code moteur propre à VAG`;
    }
    return 'Code VAG (description non disponible)';
}

export function decodeVagDtcs(payload: number[]): ExtDtc[] {
    const dtcs: ExtDtc[] = [];
    for (let i = 2; i + 3 <= payload.length; i += 3) {
        const value = (payload[i] << 8) | payload[i + 1];
        if (value === 0xffff || value === 0) continue;
        dtcs.push({
            code: value.toString().padStart(5, '0'),
            description: describeVagCode(value),
            status: `statut 0x${hex(payload[i + 2])}`
        });
    }
    return dtcs;
}

export function decodeMeasuringBlock(payload: number[]): { formula: number; a: number; b: number }[] {
    const fields = [];
    for (let i = 2; i + 3 <= payload.length; i += 3) {
        fields.push({ formula: payload[i], a: payload[i + 1], b: payload[i + 2] });
    }
    return fields;
}

export class Tp20Channel {
    private txId = 0;
    private rxId = 0;
    private seq = 0;

    constructor(
        private readonly elm: Elm327,
        readonly address: number
    ) {}

    async open(): Promise<boolean> {
        const responseId = 0x200 + this.address;
        await this.elm.tryCommands(['ATSH200', `ATCRA${hex(responseId, 3)}`]);
        const setup = rawFrames(await this.elm.send(`${hex(this.address)}C00010000301`, 3000)).find(
            (f) => f.id === responseId && f.data[1] === 0xd0
        );
        if (!setup) return false;
        this.rxId = setup.data[2] | ((setup.data[3] & 0x0f) << 8);
        this.txId = setup.data[4] | ((setup.data[5] & 0x0f) << 8);
        logLine('!', `TP2.0 module ${hex(this.address)} tx=${hex(this.txId, 3)} rx=${hex(this.rxId, 3)}`);
        await this.elm.tryCommands([`ATSH${hex(this.txId, 3)}`, `ATCRA${hex(this.rxId, 3)}`]);
        const params = rawFrames(await this.elm.send('A00F8AFF32FF', 3000));
        return params.some((f) => f.data[0] === 0xa1);
    }

    async request(payload: number[]): Promise<number[] | null> {
        const bytes = [payload.length >> 8, payload.length & 0xff, ...payload];
        let raw = '';
        for (let i = 0; i < bytes.length; i += 7) {
            const last = i + 7 >= bytes.length;
            const opcode = (last ? 0x10 : 0x20) | this.seq;
            this.seq = (this.seq + 1) & 0x0f;
            raw = await this.elm.send([opcode, ...bytes.slice(i, i + 7)].map((b) => hex(b)).join(''), 3000);
        }

        let buffer: number[] | null = null;
        let expected = 0;
        for (let attempt = 0; attempt < 25; attempt++) {
            let ackSeq: number | null = null;
            let complete = false;
            for (const frame of rawFrames(raw).filter((f) => f.id === this.rxId)) {
                const op = frame.data[0] >> 4;
                if (frame.data[0] === 0xa8) throw new Error('Le calculateur a fermé la connexion');
                if (op > 3) continue;
                if (buffer === null) {
                    expected = (frame.data[1] << 8) | frame.data[2];
                    buffer = frame.data.slice(3);
                } else {
                    buffer.push(...frame.data.slice(1));
                }
                if (op === 0 || op === 1) ackSeq = ((frame.data[0] & 0x0f) + 1) & 0x0f;
                if (op === 1 || op === 3) complete = true;
            }
            if (ackSeq !== null) {
                raw = await this.elm.send(`B${hex(ackSeq, 1)}`, 3000);
            }
            if (complete && buffer) {
                const message = buffer.slice(0, expected);
                if (message[0] === 0x7f && message[2] === 0x78) {
                    buffer = null;
                    if (ackSeq === null) raw = await this.elm.send('A3', 3000);
                    continue;
                }
                return message;
            }
            if (ackSeq === null) raw = await this.elm.send('A3', 3000);
        }
        return null;
    }

    async close(): Promise<void> {
        await this.elm.tryCommands(['A8']);
    }
}

function asciiRuns(bytes: number[]): string[] {
    return String.fromCharCode(...bytes.map((b) => (b >= 0x20 && b < 0x7f ? b : 0x00)))
        .split('\u0000')
        .map((s) => s.trim())
        .filter((s) => s.length >= 3);
}

async function readModule(elm: Elm327, address: number, name: string): Promise<{ report: EcuReport; odometer: number | null } | null> {
    const channel = new Tp20Channel(elm, address);
    if (!(await channel.open())) return null;
    try {
        await channel.request([0x10, 0x89]);
        const ident = await channel.request([0x1a, 0x9b]);
        const runs = ident && ident[0] === 0x5a ? asciiRuns(ident.slice(2)) : [];
        const dtcResponse = await channel.request([0x18, 0x02, 0xff, 0x00]);
        const dtcs = dtcResponse && dtcResponse[0] === 0x58 ? decodeVagDtcs(dtcResponse) : [];

        let odometer: number | null = null;
        if (address === 0x17) {
            const block = await channel.request([0x21, 0x02]);
            if (block && block[0] === 0x61) {
                const field = decodeMeasuringBlock(block).find((f) => f.formula === 0x24);
                if (field) odometer = field.a * 2560 + field.b * 10;
            }
        }

        return {
            report: {
                id: `VAG ${hex(address)}`,
                name: runs.slice(1).find((r) => /[A-Za-z]{3}/.test(r)) ?? name,
                protocol: 'KWP2000 sur TP2.0 (VAG, expérimental)',
                partNumber: runs[0] ?? null,
                dtcs: dtcResponse ? dtcs : [{ code: '—', description: 'Lecture des codes impossible sur ce calculateur', status: null }]
            },
            odometer
        };
    } finally {
        await channel.close();
    }
}

export async function scanVag(elm: Elm327, progress: Progress): Promise<{ reports: EcuReport[]; odometer: number | null }> {
    if (elm.protocolKind !== 'can11') return { reports: [], odometer: null };
    const reports: EcuReport[] = [];
    let odometer: number | null = null;
    try {
        await elm.tryCommands(['ATCAF0', 'ATH1', 'ATS0', 'ATAL', 'ATAT0', 'ATST19']);
        for (const [index, module] of VAG_MODULES.entries()) {
            progress(`Calculateurs VAG : ${module.name}… (${index + 1}/${VAG_MODULES.length})`);
            try {
                const result = await readModule(elm, module.address, module.name);
                if (result) {
                    reports.push(result.report);
                    if (result.odometer !== null) odometer = result.odometer;
                }
            } catch (e) {
                logLine('!', `VAG ${hex(module.address)}: ${(e as Error).message}`);
            }
        }
    } finally {
        await elm.tryCommands(['ATAL', 'ATCAF1']);
        await elm.restoreObdDefaults();
    }
    return { reports, odometer };
}
