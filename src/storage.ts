import type { SavedScan, Vehicle } from './types';

const DB_NAME = 'no-noob-no-arnaque';
const DB_VERSION = 1;

type StoreName = 'vehicles' | 'scans';

const plain = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

let dbPromise: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
    if (!dbPromise) {
        dbPromise = new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);
            request.onupgradeneeded = () => {
                const db = request.result;
                if (!db.objectStoreNames.contains('vehicles')) db.createObjectStore('vehicles', { keyPath: 'id' });
                if (!db.objectStoreNames.contains('scans')) {
                    db.createObjectStore('scans', { keyPath: 'id' }).createIndex('vehicleId', 'vehicleId');
                }
            };
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }
    return dbPromise;
}

async function run<T>(store: StoreName, mode: IDBTransactionMode, action: (s: IDBObjectStore) => IDBRequest): Promise<T> {
    const db = await open();
    return new Promise((resolve, reject) => {
        const request = action(db.transaction(store, mode).objectStore(store));
        request.onsuccess = () => resolve(request.result as T);
        request.onerror = () => reject(request.error);
    });
}

export function newId(): string {
    return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export const db = {
    vehicles(): Promise<Vehicle[]> {
        return run<Vehicle[]>('vehicles', 'readonly', (s) => s.getAll()).then((list) => list.sort((a, b) => a.createdAt - b.createdAt));
    },
    saveVehicle(vehicle: Vehicle): Promise<unknown> {
        return run('vehicles', 'readwrite', (s) => s.put(plain(vehicle)));
    },
    async deleteVehicle(id: string): Promise<void> {
        const scans = await db.scans(id);
        for (const scan of scans) await db.deleteScan(scan.id);
        await run('vehicles', 'readwrite', (s) => s.delete(id));
    },
    scans(vehicleId: string): Promise<SavedScan[]> {
        return run<SavedScan[]>('scans', 'readonly', (s) => s.index('vehicleId').getAll(vehicleId)).then((list) => list.sort((a, b) => b.date - a.date));
    },
    saveScan(scan: SavedScan): Promise<unknown> {
        return run('scans', 'readwrite', (s) => s.put(plain(scan)));
    },
    deleteScan(id: string): Promise<unknown> {
        return run('scans', 'readwrite', (s) => s.delete(id));
    },
    async exportAll(): Promise<string> {
        const vehicles = await db.vehicles();
        const scans = (await Promise.all(vehicles.map((v) => db.scans(v.id)))).flat();
        return JSON.stringify({ app: DB_NAME, version: 1, exportedAt: new Date().toISOString(), vehicles, scans }, null, 2);
    },
    async importAll(json: string): Promise<number> {
        const data = JSON.parse(json) as { app?: string; vehicles?: Vehicle[]; scans?: SavedScan[] };
        if (data.app !== DB_NAME || !Array.isArray(data.vehicles) || !Array.isArray(data.scans)) {
            throw new Error("Ce fichier n'est pas une sauvegarde No Noob No Arnaque.");
        }
        for (const vehicle of data.vehicles) await db.saveVehicle(vehicle);
        for (const scan of data.scans) await db.saveScan(scan);
        return data.scans.length;
    }
};
