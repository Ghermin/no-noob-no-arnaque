import type { Transport } from './transport';

export type DemoProfile = 'ibiza' | 'citadine';

export const DEMO_PROFILES: Record<DemoProfile, { label: string; story: string }> = {
    ibiza: {
        label: 'Seat Ibiza 1.6 TDI 2010',
        story: 'Diesel avec une vanne EGR encrassée (P0401) et un capteur ABS défaillant. Calculateurs VAG en TP2.0.'
    },
    citadine: {
        label: 'Citadine essence 2020',
        story: "Aucun voyant, mais un autotest du catalyseur hors limites et un défaut dans l'ABS. Calculateurs en UDS, kilométrage lisible."
    }
};

interface SimModule {
    name: string;
    part: string;
    codes: () => number[][];
}

interface SimState {
    stored: string[];
    pending: string[];
    permanent: string[];
    fault: string | null;
    repaired: boolean;
    distanceSinceClear: number;
    warmupsSinceClear: number;
    minutesSinceClear: number;
    distanceWithMil: number;
    monitorsIncomplete: number;
    odometer: number;
    clusterOffset: number;
}

const hex = (n: number, len = 2) => n.toString(16).toUpperCase().padStart(len, '0');
const word = (v: number) => [(v >> 8) & 0xff, v & 0xff];
const ascii = (text: string) => [...text].map((c) => c.charCodeAt(0));

function dtcBytes(code: string): number[] {
    const system = 'PCBU'.indexOf(code[0]);
    const a = (system << 6) | (parseInt(code[1], 16) << 4) | parseInt(code[2], 16);
    return [a, parseInt(code.slice(3), 16)];
}

function canFrames(data: number[], header: string): string[] {
    const pad = (bytes: number[]) => {
        while (bytes.length < 8) bytes.push(0xaa);
        return header + bytes.map((b) => hex(b)).join('');
    };
    if (data.length <= 7) return [pad([data.length, ...data])];
    const frames = [pad([0x10 | (data.length >> 8), data.length & 0xff, ...data.slice(0, 6)])];
    let seq = 1;
    for (let i = 6; i < data.length; i += 7) {
        frames.push(pad([0x20 | (seq & 0x0f), ...data.slice(i, i + 7)]));
        seq++;
    }
    return frames;
}

function supportedBitmap(list: number[], base: number): number[] {
    const bytes = [0, 0, 0, 0];
    list.filter((p) => p > base && p <= base + 32).forEach((p) => {
        const index = p - base - 1;
        bytes[index >> 3] |= 0x80 >> (index & 7);
    });
    return bytes;
}

function withRangeMarkers(list: number[]): number[] {
    const out = new Set(list);
    const max = Math.max(...list);
    for (let base = 0x20; base < max; base += 0x20) out.add(base);
    return [...out];
}

export class Simulator {
    state: SimState;
    private startedAt = Date.now();
    private header = '7DF';
    private caf = true;
    private channelSeq: Record<number, number> = {};

    constructor(readonly profile: DemoProfile = 'ibiza') {
        this.state = this.initialState();
    }

    private get diesel(): boolean {
        return this.profile === 'ibiza';
    }

    get vin(): string {
        return this.diesel ? 'VSSZZZ6JZAR000000' : 'VF1RJA00XL5000000';
    }

    get dashboardKm(): number {
        return Math.round(this.state.odometer + this.state.clusterOffset);
    }

    private initialState(): SimState {
        const diesel = this.profile === 'ibiza';
        return {
            stored: diesel ? ['P0401'] : [],
            pending: [],
            permanent: diesel ? ['P0401'] : [],
            fault: diesel ? 'P0401' : null,
            repaired: false,
            distanceSinceClear: diesel ? 18450 : 9120,
            warmupsSinceClear: 255,
            minutesSinceClear: diesel ? 21600 : 9800,
            distanceWithMil: diesel ? 640 : 0,
            monitorsIncomplete: 0,
            odometer: diesel ? 152340 : 48230.5,
            clusterOffset: 0
        };
    }

    private get monitorsAvailable(): number {
        return this.diesel ? 0xe8 : 0x65;
    }

    private get supportedPids(): number[] {
        const common = [0x01, 0x04, 0x05, 0x0b, 0x0c, 0x0d, 0x0f, 0x10, 0x1c, 0x1f, 0x21, 0x2d, 0x30, 0x31, 0x33, 0x42, 0x46, 0x49, 0x4d, 0x4e, 0x51];
        const specific = this.diesel ? [0x23, 0x2c] : [0x06, 0x07, 0x11, 0x14, 0x15, 0xa6];
        return withRangeMarkers([...common, ...specific]);
    }

    reset(): void {
        this.state = this.initialState();
    }

    garageClear(repair: boolean): void {
        const s = this.state;
        s.stored = [];
        s.pending = [];
        s.repaired = repair;
        s.distanceSinceClear = 0;
        s.warmupsSinceClear = 0;
        s.minutesSinceClear = 0;
        s.distanceWithMil = 0;
        s.monitorsIncomplete = this.monitorsAvailable;
    }

    tamperOdometer(km: number): void {
        this.state.clusterOffset -= km;
    }

    drive(km: number): void {
        const s = this.state;
        s.odometer += km;
        s.distanceSinceClear = Math.min(65535, s.distanceSinceClear + km);
        s.warmupsSinceClear = Math.min(255, s.warmupsSinceClear + Math.max(1, Math.round(km / 25)));
        s.minutesSinceClear = Math.min(65535, s.minutesSinceClear + Math.round(km * 1.2));
        s.monitorsIncomplete = km >= 30 ? 0 : s.monitorsIncomplete & 0x40;
        if (s.fault && !s.repaired) {
            if (s.pending.includes(s.fault) || km >= 60) {
                s.pending = s.pending.filter((c) => c !== s.fault);
                if (!s.stored.includes(s.fault)) s.stored.push(s.fault);
            } else if (!s.stored.includes(s.fault)) {
                s.pending.push(s.fault);
            }
        } else if (s.fault && s.monitorsIncomplete === 0) {
            s.permanent = s.permanent.filter((c) => c !== s.fault);
        }
        if (s.stored.length > 0) s.distanceWithMil += km;
    }

    private get absFault(): boolean {
        return this.state.distanceSinceClear > 0;
    }

    private pid(pid: number): number[] | null {
        const s = this.state;
        if (pid % 0x20 === 0) return this.supportedPids.includes(pid) || pid === 0 ? supportedBitmap(this.supportedPids, pid) : null;
        if (!this.supportedPids.includes(pid)) return null;
        const t = (Date.now() - this.startedAt) / 1000;
        const load = Math.max(0, Math.sin(t / 4));
        const rpm = (this.diesel ? 850 : 750) + 1300 * load;
        switch (pid) {
            case 0x01:
                return [(s.stored.length > 0 ? 0x80 : 0) | s.stored.length, this.diesel ? 0x0f : 0x07, this.monitorsAvailable, s.monitorsIncomplete];
            case 0x04:
                return [Math.round(load * 180 + 40)];
            case 0x05:
                return [Math.round(Math.min(90, 40 + t)) + 40];
            case 0x06:
                return [128 + Math.round(Math.sin(t * 3) * 6)];
            case 0x07:
                return [131];
            case 0x0b:
                return [Math.round(this.diesel ? 101 + load * 90 : 30 + load * 60)];
            case 0x0c:
                return word(Math.round(rpm * 4));
            case 0x0d:
                return [Math.round(load * 65)];
            case 0x0f:
                return [58];
            case 0x10:
                return word(Math.round((4 + load * 30) * 100));
            case 0x11:
                return [Math.round(load * 200 + 20)];
            case 0x14:
            case 0x15:
                return [Math.round(pid === 0x14 ? 90 + Math.sin(t * 5) * 80 : 140), 0xff];
            case 0x1c:
                return [0x06];
            case 0x1f:
                return word(Math.round(t));
            case 0x21:
                return word(s.distanceWithMil);
            case 0x23:
                return word(Math.round((300 + load * 900) * 10));
            case 0x2c:
                return [Math.round(rpm < 1500 ? 90 : 20)];
            case 0x2d:
                return [s.fault && !s.repaired ? 70 : 128];
            case 0x30:
                return [s.warmupsSinceClear];
            case 0x31:
                return word(s.distanceSinceClear);
            case 0x33:
                return [101];
            case 0x42:
                return word(Math.round(14100 + Math.sin(t) * 150));
            case 0x46:
                return [58];
            case 0x49:
                return [Math.round(load * 200 + 30)];
            case 0x4d:
                return word(s.stored.length > 0 ? 940 : 0);
            case 0x4e:
                return word(s.minutesSinceClear);
            case 0x51:
                return [this.diesel ? 0x04 : 0x01];
            case 0xa6: {
                const raw = Math.round(s.odometer * 10);
                return [(raw >>> 24) & 0xff, (raw >> 16) & 0xff, (raw >> 8) & 0xff, raw & 0xff];
            }
            default:
                return null;
        }
    }

    private mode06(mid: number): number[] | null {
        const s = this.state;
        const tests: Record<number, number[][]> = this.diesel
            ? {
                  0x31: [[0x80, 0x01, ...word(s.fault && !s.repaired ? 70 : 96), ...word(80), ...word(65535)]],
                  0x85: [[0x80, 0x1a, ...word(12), ...word(0), ...word(40)]],
                  0xb0: [[0x80, 0x1a, ...word(4), ...word(0), ...word(25)]]
              }
            : {
                  0x01: [[0x01, 0x0a, ...word(3700), ...word(3200), ...word(65535)]],
                  0x21: [[0x80, 0x01, ...word(118), ...word(0), ...word(100)]],
                  0xa1: [[0x0b, 0x24, ...word(0), ...word(0), ...word(65535)]]
              };
        const mids = Object.keys(tests).map(Number);
        if (mid % 0x20 === 0) {
            const all = withRangeMarkers(mids);
            return mid === 0 || all.includes(mid) ? supportedBitmap(all, mid) : null;
        }
        const records = tests[mid];
        return records ? records.flatMap((r) => [mid, ...r]) : null;
    }

    private vagModules(): Record<number, SimModule> {
        if (!this.diesel) return {};
        const s = this.state;
        return {
            0x01: { name: '1.6l R4 EDC   H04', part: '03L906023ML', codes: () => (s.stored.includes('P0401') ? [[...word(16384 + 401), 0x23]] : []) },
            0x03: { name: 'ESP MK60EC1   H31', part: '6R0907379AH', codes: () => (this.absFault ? [[...word(283), 0x23]] : []) },
            0x15: { name: 'AIRBAG VW10   G001', part: '6R0959655', codes: () => [] },
            0x17: { name: 'KOMBIINSTRUMENT RB4', part: '6R0920861D', codes: () => [] },
            0x1f: { name: 'J533  Gateway H04', part: '6R0937087', codes: () => [] }
        };
    }

    private udsEcus(): Record<number, { rx: number; name: string; part: string; dtcs: () => number[][] }> {
        if (this.diesel) return {};
        return {
            0x7e0: { rx: 0x7e8, name: 'INJECTION', part: '237100123R', dtcs: () => [] },
            0x740: { rx: 0x760, name: 'ABS ESP BOSCH 9.3', part: '476606345R', dtcs: () => (this.absFault ? [[0x40, 0x35, 0x1c, 0x09]] : []) },
            0x743: { rx: 0x763, name: 'TABLEAU DE BORD', part: '248107654R', dtcs: () => [] },
            0x752: { rx: 0x772, name: 'AIRBAG', part: '985105432R', dtcs: () => [] }
        };
    }

    private obdResponse(cmd: string): string {
        const mode = parseInt(cmd.slice(0, 2), 16);
        const s = this.state;
        let data: number[] | null = null;
        if (mode === 0x01) {
            const pid = parseInt(cmd.slice(2, 4), 16);
            const value = this.pid(pid);
            data = value ? [0x41, pid, ...value] : null;
        } else if (mode === 0x06) {
            const mid = parseInt(cmd.slice(2, 4), 16);
            const value = this.mode06(mid);
            data = value ? (mid % 0x20 === 0 ? [0x46, mid, ...value] : [0x46, ...value]) : null;
        } else if (mode === 0x03 || mode === 0x07 || mode === 0x0a) {
            const list = mode === 0x03 ? s.stored : mode === 0x07 ? s.pending : s.permanent;
            data = [mode + 0x40, list.length, ...list.flatMap(dtcBytes)];
        } else if (mode === 0x04) {
            this.garageClear(this.state.repaired);
            data = [0x44];
        } else if (mode === 0x09 && cmd.slice(2, 4) === '02') {
            data = [0x49, 0x02, 0x01, ...ascii(this.vin)];
        }
        return data ? canFrames(data, '7E8').join('\r') : 'NO DATA';
    }

    private udsResponse(cmd: string): string {
        const ecu = this.udsEcus()[parseInt(this.header, 16)];
        if (!ecu) return 'NO DATA';
        const service = parseInt(cmd.slice(0, 2), 16);
        let data: number[];
        if (cmd === '3E00') data = [0x7e, 0x00];
        else if (cmd === '22F197') data = [0x62, 0xf1, 0x97, ...ascii(ecu.name)];
        else if (cmd === '22F187') data = [0x62, 0xf1, 0x87, ...ascii(ecu.part)];
        else if (cmd === '1902FF') data = [0x59, 0x02, 0xff, ...ecu.dtcs().flat()];
        else data = [0x7f, service, 0x11];
        return canFrames(data, hex(ecu.rx, 3)).join('\r');
    }

    private kwpResponse(module: SimModule, address: number, payload: number[]): number[] {
        const [service, sub] = payload;
        if (service === 0x10) return [0x50, sub];
        if (service === 0x1a && sub === 0x9b) return [0x5a, 0x9b, ...ascii(module.part.padEnd(12)), 0x00, 0x00, ...ascii(module.name)];
        if (service === 0x18) {
            const codes = module.codes();
            return [0x58, codes.length, ...codes.flat()];
        }
        if (service === 0x21 && address === 0x17 && sub === 0x02) {
            const km = this.dashboardKm;
            const a = Math.floor(km / 2560);
            const b = Math.round((km - a * 2560) / 10);
            return [0x61, 0x02, 0x24, a, b, 0x25, 0x00, 0x00, 0x08, 0x0a, 0x96, 0x05, 0x0a, 0x82];
        }
        return [0x7f, service, 0x11];
    }

    private tp20Response(bytes: number[]): string {
        const modules = this.vagModules();
        const headerId = parseInt(this.header, 16);
        if (headerId === 0x200) {
            const address = bytes[0];
            if (!modules[address] || bytes[1] !== 0xc0) return 'NO DATA';
            const index = Object.keys(modules).map(Number).indexOf(address);
            const rx = 0x300 + index;
            const tx = 0x740 + index;
            return hex(0x200 + address, 3) + [0x00, 0xd0, rx & 0xff, rx >> 8, tx & 0xff, tx >> 8, 0x01].map((b) => hex(b)).join('');
        }
        const addresses = Object.keys(modules).map(Number);
        const index = headerId - 0x740;
        const address = addresses[index];
        if (address === undefined) return 'NO DATA';
        const rxHeader = hex(0x300 + index, 3);
        const first = bytes[0];
        if (first === 0xa0 || first === 0xa3) return `${rxHeader}A10F8AFF4AFF`;
        if (first === 0xa8 || first >> 4 === 0xb || first >> 4 === 0x9) return 'NO DATA';
        const op = first >> 4;
        if (op > 3) return 'NO DATA';
        const length = (bytes[1] << 8) | bytes[2];
        const message = this.kwpResponse(modules[address], address, bytes.slice(3, 3 + length));
        const lines = [`${rxHeader}B${hex(((first & 0x0f) + 1) & 0x0f, 1)}`];
        const payload = [message.length >> 8, message.length & 0xff, ...message];
        for (let i = 0; i < payload.length; i += 7) {
            const last = i + 7 >= payload.length;
            const seq = this.channelSeq[address] ?? 0;
            this.channelSeq[address] = (seq + 1) & 0x0f;
            lines.push(rxHeader + [(last ? 0x10 : 0x20) | seq, ...payload.slice(i, i + 7)].map((b) => hex(b)).join(''));
        }
        return lines.join('\r');
    }

    respond(command: string): string {
        const cmd = command.replace(/\s+/g, '').toUpperCase();
        if (cmd === 'ATZ') return 'ELM327 v1.5 (simulateur)';
        if (cmd === 'ATDPN') return 'A6';
        if (cmd === 'ATRV') return '12.6V';
        if (cmd.startsWith('ATSH')) {
            this.header = cmd.slice(4);
            return 'OK';
        }
        if (cmd === 'ATCAF0' || cmd === 'ATCAF1') {
            this.caf = cmd === 'ATCAF1';
            return 'OK';
        }
        if (cmd.startsWith('AT')) return 'OK';
        if (!/^[0-9A-F]+$/.test(cmd)) return '?';
        if (!this.caf) {
            const bytes: number[] = [];
            for (let i = 0; i < cmd.length; i += 2) bytes.push(parseInt(cmd.slice(i, i + 2), 16));
            return this.tp20Response(bytes);
        }
        if (this.header === '7DF') return this.obdResponse(cmd);
        return this.udsResponse(cmd);
    }
}

export function createSimulatorTransport(sim: Simulator): Transport {
    const dataListeners: ((chunk: string) => void)[] = [];
    const disconnectListeners: (() => void)[] = [];
    let buffer = '';

    return {
        name: `Simulateur (${DEMO_PROFILES[sim.profile].label})`,
        async write(data: string) {
            buffer += data;
            let end = buffer.indexOf('\r');
            while (end !== -1) {
                const command = buffer.slice(0, end);
                buffer = buffer.slice(end + 1);
                const response = `${sim.respond(command)}\r\r>`;
                setTimeout(() => {
                    for (let i = 0; i < response.length; i += 20) {
                        const chunk = response.slice(i, i + 20);
                        dataListeners.forEach((l) => l(chunk));
                    }
                }, 5);
                end = buffer.indexOf('\r');
            }
        },
        onData(listener) {
            dataListeners.push(listener);
        },
        onDisconnect(listener) {
            disconnectListeners.push(listener);
        },
        async close() {
            disconnectListeners.forEach((l) => l());
        }
    };
}
