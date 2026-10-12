import type { Transport } from './transport';
import { isErrorResponse, parseResponse, protocolKind, type EcuMessage, type ProtocolKind } from './frames';

const PROTOCOL_NAMES: Record<string, string> = {
    '1': 'SAE J1850 PWM',
    '2': 'SAE J1850 VPW',
    '3': 'ISO 9141-2',
    '4': 'ISO 14230-4 KWP (init 5 bauds)',
    '5': 'ISO 14230-4 KWP (init rapide)',
    '6': 'ISO 15765-4 CAN 11 bits 500 kbit/s',
    '7': 'ISO 15765-4 CAN 29 bits 500 kbit/s',
    '8': 'ISO 15765-4 CAN 11 bits 250 kbit/s',
    '9': 'ISO 15765-4 CAN 29 bits 250 kbit/s'
};

export class Elm327 {
    private buffer = '';
    private pending: { resolve: (value: string) => void; reject: (reason: Error) => void; timer: ReturnType<typeof setTimeout> } | null = null;
    private queue: Promise<unknown> = Promise.resolve();
    private kind: ProtocolKind = 'can11';
    protocolNumber = '';
    adapterVersion = '';

    constructor(private readonly transport: Transport) {
        transport.onData((chunk) => this.receive(chunk));
    }

    get name(): string {
        return this.transport.name;
    }

    get protocolName(): string {
        return PROTOCOL_NAMES[this.protocolNumber] ?? `Protocole ${this.protocolNumber || 'inconnu'}`;
    }

    onDisconnect(listener: () => void): void {
        this.transport.onDisconnect(listener);
    }

    private receive(chunk: string): void {
        this.buffer += chunk;
        const end = this.buffer.indexOf('>');
        if (end === -1 || !this.pending) return;
        const response = this.buffer.slice(0, end);
        this.buffer = this.buffer.slice(end + 1);
        const { resolve, timer } = this.pending;
        clearTimeout(timer);
        this.pending = null;
        resolve(response);
    }

    send(command: string, timeoutMs = 5000): Promise<string> {
        const run = () =>
            new Promise<string>((resolve, reject) => {
                this.buffer = '';
                const timer = setTimeout(() => {
                    this.pending = null;
                    reject(new Error(`Pas de réponse de l'adaptateur à « ${command} »`));
                }, timeoutMs);
                this.pending = { resolve, reject, timer };
                this.transport.write(`${command}\r`).catch((e: Error) => {
                    clearTimeout(timer);
                    this.pending = null;
                    reject(e);
                });
            });
        const next = this.queue.then(run, run);
        this.queue = next.catch(() => undefined);
        return next;
    }

    async initialize(): Promise<void> {
        const reset = await this.send('ATZ', 4000);
        this.adapterVersion = reset.replace(/[\r\n>]+/g, ' ').trim();
        for (const cmd of ['ATE0', 'ATL0', 'ATS0', 'ATH1', 'ATAT1', 'ATSP0']) {
            await this.send(cmd);
        }
        const probe = await this.send('0100', 15000);
        if (isErrorResponse(probe)) {
            throw new Error("La voiture ne répond pas. Mettez le contact (ou démarrez le moteur) puis réessayez.");
        }
        const dpn = (await this.send('ATDPN')).replace(/[^0-9A-C]/gi, '').toUpperCase();
        this.protocolNumber = dpn.replace(/^A/, '');
        this.kind = protocolKind(this.protocolNumber);
    }

    async request(mode: number, pid?: number, timeoutMs = 5000): Promise<EcuMessage[]> {
        const hex = (n: number) => n.toString(16).toUpperCase().padStart(2, '0');
        const command = pid === undefined ? hex(mode) : hex(mode) + hex(pid);
        const raw = await this.send(command, timeoutMs);
        if (isErrorResponse(raw)) return [];
        return parseResponse(raw, this.kind).filter((m) => m.data[0] === mode + 0x40);
    }

    get isCan(): boolean {
        return this.kind !== 'legacy';
    }

    async close(): Promise<void> {
        await this.transport.close();
    }
}
