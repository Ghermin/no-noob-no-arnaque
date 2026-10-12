<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { elm, navigate, refreshVehicles, state } from '../store';
import { db, newId } from '../storage';
import { isWebBluetoothAvailable } from '../obd/transport';
import { SEVERITY_LABELS, formatDate, vehicleSubtitle, worstSeverity } from '../format';
import type { SavedScan, Vehicle } from '../types';
import VehicleForm from '../components/VehicleForm.vue';

const bluetooth = isWebBluetoothAvailable();
const connected = computed(() => elm.value !== null);
const adding = ref(false);
const lastScans = ref<Record<string, SavedScan | undefined>>({});
const backupMessage = ref('');

async function loadLastScans(): Promise<void> {
    const entries = await Promise.all(state.vehicles.map(async (v) => [v.id, (await db.scans(v.id))[0]] as const));
    lastScans.value = Object.fromEntries(entries);
}

onMounted(loadLastScans);
watch(() => state.vehicles, loadLastScans);

function blankVehicle(): Vehicle {
    return { id: newId(), name: '', vin: null, fuel: 'inconnu', make: null, year: null, createdAt: Date.now() };
}

async function addVehicle(vehicle: Vehicle): Promise<void> {
    await db.saveVehicle(vehicle);
    await refreshVehicles();
    adding.value = false;
    navigate({ name: 'vehicle', id: vehicle.id });
}

async function exportBackup(): Promise<void> {
    const blob = new Blob([await db.exportAll()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `no-noob-no-arnaque-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
}

async function importBackup(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    try {
        const count = await db.importAll(await file.text());
        await refreshVehicles();
        backupMessage.value = `${count} scan(s) importé(s).`;
    } catch (e) {
        backupMessage.value = (e as Error).message;
    } finally {
        input.value = '';
    }
}
</script>

<template>
    <section>
        <h1>Vérifiez ce que dit le garagiste</h1>
        <p>
            Branchez un adaptateur OBD Bluetooth sur votre voiture et lisez vous-même les codes défaut, l'état des autotests et les traces d'un
            effacement récent des codes. Faites un scan avant et après le garage pour comparer.
        </p>
    </section>

    <div v-if="!bluetooth" class="notice warning">
        <strong>Bluetooth indisponible dans ce navigateur.</strong>
        <p class="small">
            Utilisez <strong>Chrome</strong> ou <strong>Edge</strong> sur Android ou sur ordinateur. iPhone et Firefox ne gèrent pas Web Bluetooth.
            Vous pouvez quand même essayer le <strong>mode Démo</strong>.
        </p>
    </div>

    <div v-if="!connected" class="card">
        <h3>Pour commencer</h3>
        <ol class="small steps">
            <li>Achetez un adaptateur <strong>ELM327 en Bluetooth 4.0 (BLE)</strong>. Les modèles en Bluetooth « classique » ne marchent pas dans un navigateur.</li>
            <li>Branchez-le sur la prise OBD, en général sous le volant, et mettez le contact.</li>
            <li>Appuyez sur <strong>Connecter</strong> en haut et choisissez l'adaptateur.</li>
        </ol>
        <p class="small muted">Pas d'adaptateur ? Appuyez sur <strong>Démo</strong> pour essayer avec une voiture simulée.</p>
    </div>

    <div v-else class="card">
        <h3>Adaptateur connecté</h3>
        <p class="small muted">{{ elm?.protocolName }}</p>
        <div class="row">
            <button class="primary" @click="navigate({ name: 'scan', vehicleId: null })">Lancer un scan</button>
            <button @click="navigate({ name: 'live', vehicleId: null })">Données en direct</button>
        </div>
    </div>

    <div class="spread">
        <h2>Mon garage</h2>
        <button v-if="!adding" class="link" @click="adding = true">+ Ajouter un véhicule</button>
    </div>

    <div v-if="adding" class="card">
        <VehicleForm :vehicle="blankVehicle()" submit-label="Ajouter" @submit="addVehicle" @cancel="adding = false" />
    </div>

    <p v-if="state.vehicles.length === 0 && !adding" class="muted small">
        Aucun véhicule pour l'instant. Il sera créé automatiquement au premier scan (reconnu par son VIN), ou ajoutez-le à la main.
    </p>

    <button v-for="vehicle in state.vehicles" :key="vehicle.id" class="card vehicle" @click="navigate({ name: 'vehicle', id: vehicle.id })">
        <div class="spread">
            <div>
                <div class="name">{{ vehicle.name }}</div>
                <div class="small muted">{{ vehicleSubtitle(vehicle) }}</div>
            </div>
            <span v-if="lastScans[vehicle.id]" class="badge" :class="worstSeverity(lastScans[vehicle.id]!.result)">
                {{ SEVERITY_LABELS[worstSeverity(lastScans[vehicle.id]!.result)] }}
            </span>
        </div>
        <div class="small muted">
            {{ lastScans[vehicle.id] ? `Dernier scan : ${formatDate(lastScans[vehicle.id]!.date)}` : 'Jamais scanné' }}
        </div>
    </button>

    <h2>Sauvegarde</h2>
    <p class="small muted">
        Vos scans sont enregistrés uniquement dans ce navigateur. Exportez-les pour les garder ou les transférer sur un autre appareil.
    </p>
    <div class="row">
        <button :disabled="state.vehicles.length === 0" @click="exportBackup">Exporter</button>
        <label class="button import">
            Importer
            <input type="file" accept="application/json,.json" @change="importBackup" />
        </label>
    </div>
    <p v-if="backupMessage" class="small" role="status">{{ backupMessage }}</p>
</template>

<style scoped>
.steps {
    padding-left: 20px;
    margin: 0 0 8px;
}

.vehicle {
    display: block;
    width: 100%;
    text-align: left;
    font-weight: 400;
}

.name {
    font-weight: 700;
}

.import {
    font-size: 1rem;
}

.import input {
    display: none;
}
</style>
