import type { ScanResult } from '../types';
import type { Elm327 } from './elm327';
import { decodeDtcMessages } from './dtc';
import { COUNTER_PIDS, decodeSupportedPids, decodeWord, type PidDefinition } from './pids';
import { decodeReadiness } from './readiness';
import { vinFromMessages } from './vin';

export type ScanStep = (message: string) => void;

async function readPid(elm: Elm327, pid: number): Promise<number[] | null> {
    const messages = await elm.request(0x01, pid);
    const message = messages.find((m) => m.data[1] === pid);
    return message ? message.data.slice(2) : null;
}

export async function readSupportedPids(elm: Elm327): Promise<number[]> {
    const supported: number[] = [];
    for (const base of [0x00, 0x20, 0x40, 0x60, 0x80]) {
        if (base !== 0x00 && !supported.includes(base)) break;
        const bytes = await readPid(elm, base);
        if (!bytes) break;
        supported.push(...decodeSupportedPids(base, bytes));
    }
    return supported;
}

export async function runScan(elm: Elm327, step: ScanStep = () => undefined): Promise<ScanResult> {
    step('Lecture des capacités du calculateur…');
    const supportedPids = await readSupportedPids(elm);

    step('Lecture du VIN…');
    const vin = vinFromMessages(await elm.request(0x09, 0x02, 8000), elm.isCan);

    step('Lecture du voyant moteur et des autotests…');
    const status = await readPid(elm, 0x01);
    const readiness = status ? decodeReadiness(status) : null;

    step('Lecture des codes défaut…');
    const storedMessages = await elm.request(0x03, undefined, 8000);
    const pendingMessages = await elm.request(0x07, undefined, 8000);
    const permanentMessages = await elm.request(0x0a, undefined, 8000);

    step('Lecture des compteurs depuis le dernier effacement…');
    const counter = async (pid: number, decode: (b: number[]) => number) => {
        if (!supportedPids.includes(pid)) return null;
        const bytes = await readPid(elm, pid);
        return bytes ? decode(bytes) : null;
    };
    const distanceSinceClear = await counter(COUNTER_PIDS.distanceSinceClear, decodeWord);
    const warmupsSinceClear = await counter(COUNTER_PIDS.warmupsSinceClear, (b) => b[0]);
    const minutesSinceClear = await counter(COUNTER_PIDS.minutesSinceClear, decodeWord);
    const distanceWithMil = await counter(COUNTER_PIDS.distanceWithMil, decodeWord);
    const minutesWithMil = await counter(COUNTER_PIDS.minutesWithMil, decodeWord);
    const fuelCode = await counter(0x51, (b) => b[0]);

    const ecus = [...new Set([...storedMessages, ...pendingMessages].map((m) => m.ecu))];

    return {
        vin,
        protocol: elm.protocolName,
        adapter: elm.name,
        mil: readiness?.mil ?? false,
        ignition: readiness?.ignition ?? 'spark',
        monitors: readiness?.monitors ?? [],
        stored: decodeDtcMessages(storedMessages, elm.isCan),
        pending: decodeDtcMessages(pendingMessages, elm.isCan),
        permanent: decodeDtcMessages(permanentMessages, elm.isCan),
        distanceSinceClear,
        warmupsSinceClear,
        minutesSinceClear,
        distanceWithMil,
        minutesWithMil,
        fuelCode,
        supportedPids,
        ecus
    };
}

export async function readLive(elm: Elm327, pid: PidDefinition): Promise<number | null> {
    const bytes = await readPid(elm, pid.pid);
    return bytes ? pid.decode(bytes) : null;
}
