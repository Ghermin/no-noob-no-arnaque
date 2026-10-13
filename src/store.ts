import { reactive, shallowRef } from 'vue';
import { Elm327 } from './obd/elm327';
import { connectBluetooth } from './obd/transport';
import { connectSerial } from './obd/serial';
import { Simulator, createSimulatorTransport, type DemoProfile } from './obd/simulator';
import { db } from './storage';
import type { Vehicle } from './types';

export type Route =
    | { name: 'home' }
    | { name: 'vehicle'; id: string }
    | { name: 'scan'; vehicleId: string | null }
    | { name: 'report'; vehicleId: string; scanId: string }
    | { name: 'compare'; vehicleId: string; beforeId: string; afterId: string }
    | { name: 'live'; vehicleId: string | null };

export const elm = shallowRef<Elm327 | null>(null);
export const simulator = shallowRef<Simulator | null>(null);

export const state = reactive({
    route: { name: 'home' } as Route,
    connecting: false,
    connectionError: '',
    vehicles: [] as Vehicle[]
});

const plainRoute = (route: Route): Route => JSON.parse(JSON.stringify(route)) as Route;

export function navigate(route: Route, replace = false): void {
    state.route = route;
    if (replace) {
        history.replaceState(plainRoute(route), '');
    } else {
        history.pushState(plainRoute(route), '');
    }
    window.scrollTo(0, 0);
}

export function initNavigation(): void {
    history.replaceState(plainRoute(state.route), '');
    window.addEventListener('popstate', (event) => {
        state.route = (event.state as Route | null) ?? { name: 'home' };
    });
}

export async function refreshVehicles(): Promise<void> {
    state.vehicles = await db.vehicles();
}

export async function connect(kind: 'bluetooth' | 'serial' | 'demo', profile: DemoProfile = 'ibiza'): Promise<boolean> {
    state.connecting = true;
    state.connectionError = '';
    let instance: Elm327 | null = null;
    try {
        await disconnect();
        let transport;
        if (kind === 'demo') {
            const sim = new Simulator(profile);
            simulator.value = sim;
            transport = createSimulatorTransport(sim);
        } else if (kind === 'serial') {
            transport = await connectSerial();
        } else {
            transport = await connectBluetooth();
        }
        const created = new Elm327(transport);
        instance = created;
        created.onDisconnect(() => {
            if (elm.value === created) {
                elm.value = null;
                simulator.value = null;
            }
        });
        await created.initialize();
        elm.value = created;
        return true;
    } catch (e) {
        const error = e as Error;
        state.connectionError = error.name === 'NotFoundError' ? '' : error.message;
        simulator.value = null;
        if (instance) await instance.close().catch(() => undefined);
        return false;
    } finally {
        state.connecting = false;
    }
}

export async function disconnect(): Promise<void> {
    const current = elm.value;
    elm.value = null;
    simulator.value = null;
    if (current) await current.close();
}
