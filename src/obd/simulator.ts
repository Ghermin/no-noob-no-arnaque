import type { Transport } from './transport';

interface SimState {
    vin: string;
    stored: string[];
    pending: string[];
    permanent: string[];
    fault: string | null;
    repaired: boolean;
    distanceSinceClear: number;
    warmupsSinceClear: number;
    minutesSinceClear: number;
    distanceWithMil: number;
    monitorsAvailable: number;
    monitorsIncomplete: number;
}

const SUPPORTED = [0x01, 0x04, 0x05, 0x0b, 0x0c, 0x0d, 0x0f, 0x10, 0x1c, 0x1f, 0x20, 0x21, 0x23, 0x2c, 0x2d, 0x30, 0x31, 0x33, 0x40, 0x42, 0x46, 0x49, 0x4d, 0x4e, 0x51];

const hex = (n: number, len = 2) => n.toString(16).toUpperCase().padStart(len, '0');

function dtcBytes(code: string): number[] {
    const system = 'PCBU'.indexOf(code[0]);
    const a = (system << 6) | (parseInt(code[1], 16) << 4) | parseInt(code[2], 16);
    return [a, parseInt(code.slice(3), 16)];
}

function canFrames(data: number[]): string[] {
    const header = '7E8';
    if (data.length <= 7) {
        const bytes = [data.length, ...data];
        while (bytes.length < 8) bytes.push(0xaa);
        return [header + bytes.map((b) => hex(b)).join('')];
    }
    const frames = [header + [0x10 | (data.length >> 8), data.length & 0xff, ...data.slice(0, 6)].map((b) => hex(b)).join('')];
    let seq = 1;
    for (let i = 6; i < data.length; i += 7) {
        const bytes = [0x20 | (seq & 0x0f), ...data.slice(i, i + 7)];
        while (bytes.length < 8) bytes.push(0xaa);
        frames.push(header + bytes.map((b) => hex(b)).join(''));
        seq++;
    }
    return frames;
}

function supportedBitmap(base: number): number[] {
    const bytes = [0, 0, 0, 0];
    SUPPORTED.filter((p) => p > base && p <= base + 32).forEach((p) => {
        const index = p - base - 1;
        bytes[index >> 3] |= 0x80 >> (index & 7);
    });
    return bytes;
}

export class Simulator {
    state: SimState = Simulator.initialState();
    private startedAt = Date.now();

    static initialState(): SimState {
        return {
            vin: 'VSSZZZ6JZAR000000',
            stored: ['P0401'],
            pending: [],
            permanent: ['P0401'],
            fault: 'P0401',
            repaired: false,
            distanceSinceClear: 18450,
            warmupsSinceClear: 255,
            minutesSinceClear: 21600,
            distanceWithMil: 640,
            monitorsAvailable: 0xe8,
            monitorsIncomplete: 0x00
        };
    }

    reset(): void {
        this.state = Simulator.initialState();
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
        s.monitorsIncomplete = s.monitorsAvailable;
    }

    drive(km: number): void {
        const s = this.state;
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

    private pid(pid: number): number[] | null {
        const s = this.state;
        const t = (Date.now() - this.startedAt) / 1000;
        const rpm = 850 + 1300 * Math.max(0, Math.sin(t / 4));
        const word = (v: number) => [(v >> 8) & 0xff, v & 0xff];
        switch (pid) {
            case 0x00:
            case 0x20:
            case 0x40:
                return supportedBitmap(pid);
            case 0x01:
                return [(s.stored.length > 0 ? 0x80 : 0) | s.stored.length, 0x0f, s.monitorsAvailable, s.monitorsIncomplete];
            case 0x04:
                return [Math.round(((rpm - 850) / 1300) * 180 + 40)];
            case 0x05:
                return [Math.round(Math.min(90, 40 + t)) + 40];
            case 0x0b:
                return [Math.round(101 + ((rpm - 850) / 1300) * 90)];
            case 0x0c:
                return word(Math.round(rpm * 4));
            case 0x0d:
                return [Math.round(Math.max(0, (rpm - 850) / 20))];
            case 0x0f:
                return [58];
            case 0x10:
                return word(Math.round((8 + ((rpm - 850) / 1300) * 30) * 100));
            case 0x1c:
                return [0x06];
            case 0x1f:
                return word(Math.round(t));
            case 0x21:
                return word(s.distanceWithMil);
            case 0x23:
                return word(Math.round((300 + ((rpm - 850) / 1300) * 900) * 10));
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
                return [Math.round(((rpm - 850) / 1300) * 200 + 30)];
            case 0x4d:
                return word(s.stored.length > 0 ? 940 : 0);
            case 0x4e:
                return word(s.minutesSinceClear);
            case 0x51:
                return [0x04];
            default:
                return null;
        }
    }

    respond(command: string): string {
        const cmd = command.replace(/\s+/g, '').toUpperCase();
        if (cmd === 'ATZ') return 'ELM327 v1.5 (simulateur)';
        if (cmd === 'ATDPN') return 'A6';
        if (cmd === 'ATRV') return '12.6V';
        if (cmd.startsWith('AT')) return 'OK';

        const mode = parseInt(cmd.slice(0, 2), 16);
        const s = this.state;
        let data: number[] | null = null;

        if (mode === 0x01) {
            const pid = parseInt(cmd.slice(2, 4), 16);
            const value = this.pid(pid);
            data = value ? [0x41, pid, ...value] : null;
        } else if (mode === 0x03 || mode === 0x07 || mode === 0x0a) {
            const list = mode === 0x03 ? s.stored : mode === 0x07 ? s.pending : s.permanent;
            data = [mode + 0x40, list.length, ...list.flatMap(dtcBytes)];
        } else if (mode === 0x04) {
            this.garageClear(false);
            data = [0x44];
        } else if (mode === 0x09 && cmd.slice(2, 4) === '02') {
            data = [0x49, 0x02, 0x01, ...[...s.vin].map((c) => c.charCodeAt(0))];
        }

        return data ? canFrames(data).join('\r') : 'NO DATA';
    }
}

export function createSimulatorTransport(sim: Simulator): Transport {
    const dataListeners: ((chunk: string) => void)[] = [];
    const disconnectListeners: (() => void)[] = [];
    let buffer = '';

    return {
        name: 'Simulateur (Ibiza diesel 2010)',
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
                }, 30);
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
