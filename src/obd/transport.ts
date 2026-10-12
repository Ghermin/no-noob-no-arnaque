export interface Transport {
    readonly name: string;
    write(data: string): Promise<void>;
    onData(listener: (chunk: string) => void): void;
    onDisconnect(listener: () => void): void;
    close(): Promise<void>;
}

const CANDIDATE_SERVICES: BluetoothServiceUUID[] = [
    0xfff0,
    0xffe0,
    0x18f0,
    'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
    '0000ae30-0000-1000-8000-00805f9b34fb',
    '0000beef-0000-1000-8000-00805f9b34fb'
];

const CHUNK_SIZE = 20;

export function isWebBluetoothAvailable(): boolean {
    return typeof navigator !== 'undefined' && 'bluetooth' in navigator;
}

async function findCharacteristics(server: BluetoothRemoteGATTServer) {
    const services = await server.getPrimaryServices();
    for (const service of services) {
        let chars: BluetoothRemoteGATTCharacteristic[];
        try {
            chars = await service.getCharacteristics();
        } catch {
            continue;
        }
        const notify = chars.find((c) => c.properties.notify || c.properties.indicate);
        const write = chars.find((c) => c.properties.write || c.properties.writeWithoutResponse);
        if (notify && write) {
            return { notify, write };
        }
    }
    throw new Error("Adaptateur non reconnu : aucun canal série BLE trouvé. Vérifiez qu'il s'agit bien d'un adaptateur ELM327 BLE (Bluetooth 4.0).");
}

export async function connectBluetooth(): Promise<Transport> {
    if (!isWebBluetoothAvailable()) {
        throw new Error('Web Bluetooth indisponible : utilisez Chrome ou Edge sur Android ou ordinateur.');
    }
    const device = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: CANDIDATE_SERVICES
    });
    if (!device.gatt) {
        throw new Error("Cet appareil n'expose pas de service Bluetooth exploitable.");
    }
    const server = await device.gatt.connect();
    const { notify, write } = await findCharacteristics(server);

    const decoder = new TextDecoder();
    const encoder = new TextEncoder();
    const dataListeners: ((chunk: string) => void)[] = [];
    const disconnectListeners: (() => void)[] = [];

    notify.addEventListener('characteristicvaluechanged', () => {
        if (!notify.value) return;
        const chunk = decoder.decode(notify.value);
        dataListeners.forEach((l) => l(chunk));
    });
    await notify.startNotifications();
    device.addEventListener('gattserverdisconnected', () => disconnectListeners.forEach((l) => l()));

    return {
        name: device.name || 'Adaptateur OBD',
        async write(data: string) {
            const bytes = encoder.encode(data);
            for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
                const chunk = bytes.slice(i, i + CHUNK_SIZE);
                if (write.properties.writeWithoutResponse) {
                    await write.writeValueWithoutResponse(chunk);
                } else {
                    await write.writeValueWithResponse(chunk);
                }
            }
        },
        onData(listener) {
            dataListeners.push(listener);
        },
        onDisconnect(listener) {
            disconnectListeners.push(listener);
        },
        async close() {
            try {
                await notify.stopNotifications();
            } catch {
                /* adaptateur déjà déconnecté */
            }
            device.gatt?.disconnect();
        }
    };
}
