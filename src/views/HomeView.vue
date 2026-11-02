<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { connect, elm, navigate, refreshVehicles, state } from '../store';
import { db, newId } from '../storage';
import { isWebBluetoothAvailable } from '../obd/transport';
import { isWebSerialAvailable } from '../obd/serial';
import { isWebUsbAvailable } from '../obd/usb';
import { SEVERITY_LABELS, formatDate, vehicleSubtitle, worstSeverity } from '../format';
import type { SavedScan, Vehicle } from '../types';
import VehicleForm from '../components/VehicleForm.vue';
import { downloadText } from '../download';
import { exportLog } from '../obd/log';

const bluetooth = isWebBluetoothAvailable();
const serial = isWebSerialAvailable() || isWebUsbAvailable();
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

// Une fois connecté, on enchaîne directement sur le diagnostic.
async function start(kind: 'bluetooth' | 'usb'): Promise<void> {
    if (await connect(kind)) navigate({ name: 'scan', vehicleId: null });
}

async function exportBackup(): Promise<void> {
    downloadText(`no-noob-no-arnaque-${new Date().toISOString().slice(0, 10)}.json`, await db.exportAll(), 'application/json');
}

function exportJournal(): void {
    downloadText(
        `journal-obd-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.txt`,
        exportLog({
            app: 'No Noob No Arnaque',
            date: new Date().toISOString(),
            adaptateur: elm.value?.name ?? 'déconnecté',
            version: elm.value?.adapterVersion ?? '—',
            protocole: elm.value?.protocolName ?? '—',
            navigateur: navigator.userAgent
        })
    );
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
    <section class="hero">
        <h1>Diagnostiquez votre voiture vous-même</h1>
        <p class="muted">Codes défaut, voyant, effacement suspect : vérifiez avant ou après le garage. Gratuit, sans compte.</p>
    </section>

    <div v-if="connected" class="card start">
        <h2>Adaptateur connecté</h2>
        <p class="small muted">{{ elm?.protocolName }}</p>
        <div class="row">
            <button class="primary big" @click="navigate({ name: 'scan', vehicleId: null })">Lancer le diagnostic</button>
            <button @click="navigate({ name: 'live', vehicleId: null })">Données en direct</button>
        </div>
    </div>

    <div v-else class="card start">
        <ol class="steps">
            <li>
                <strong>Branchez l'adaptateur OBD</strong>
                <span class="muted">sur la prise sous le volant.</span>
            </li>
            <li>
                <strong>Mettez le contact</strong>
                <span class="muted">ou démarrez le moteur.</span>
            </li>
            <li>
                <strong>Connectez-le</strong>
                <div v-if="bluetooth || serial" class="row actions">
                    <button v-if="bluetooth" class="primary big" :disabled="state.connecting" @click="start('bluetooth')">
                        {{ serial ? 'Adaptateur Bluetooth' : "Connecter l'adaptateur" }}
                    </button>
                    <button v-if="serial" class="big" :class="{ primary: !bluetooth }" :disabled="state.connecting" @click="start('usb')">
                        Câble USB
                    </button>
                </div>
                <p v-else class="notice warning small">
                    Ce navigateur ne sait pas parler à un adaptateur. Ouvrez cette page dans <strong>Chrome</strong> ou <strong>Edge</strong>, sur
                    Android ou sur ordinateur (pas sur iPhone).
                </p>
                <p v-if="state.connecting" class="small muted status" role="status">Connexion en cours…</p>
                <p v-else-if="state.connectionError" class="small error" role="alert">{{ state.connectionError }}</p>
            </li>
        </ol>
        <p class="small muted next">Le diagnostic se lance ensuite en un clic.</p>

        <details class="small">
            <summary>Pas encore d'adaptateur ?</summary>
            <p>
                Il faut un adaptateur <strong>ELM327 Bluetooth 4.0 (BLE)</strong> ou un <strong>câble OBD USB</strong>, vendus à petit prix. Évitez
                les modèles en Bluetooth « classique » : un navigateur ne peut pas s'y connecter. Sur téléphone, un câble USB se branche avec un
                adaptateur USB-C (OTG).
            </p>
        </details>
    </div>

    <template v-if="state.vehicles.length > 0 || adding">
        <div class="spread">
            <h2>Mon garage</h2>
            <button v-if="!adding" class="link" @click="adding = true">+ Ajouter un véhicule</button>
        </div>

        <div v-if="adding" class="card">
            <VehicleForm :vehicle="blankVehicle()" submit-label="Ajouter" @submit="addVehicle" @cancel="adding = false" />
        </div>

        <button v-for="vehicle in state.vehicles" :key="vehicle.id" class="card vehicle" @click="navigate({ name: 'vehicle', id: vehicle.id })">
            <div class="spread">
                <div>
                    <div class="name">{{ vehicle.name }}</div>
                    <div class="small muted">{{ vehicleSubtitle(vehicle) }}</div>
                </div>
                <span v-if="lastScans[vehicle.id]" class="badge" :class="worstSeverity(lastScans[vehicle.id]!.result, lastScans[vehicle.id]!.odometer)">
                    {{ SEVERITY_LABELS[worstSeverity(lastScans[vehicle.id]!.result, lastScans[vehicle.id]!.odometer)] }}
                </span>
            </div>
            <div class="small muted">
                {{ lastScans[vehicle.id] ? `Dernier scan : ${formatDate(lastScans[vehicle.id]!.date)}` : 'Jamais scanné' }}
            </div>
        </button>
    </template>

    <details class="card more">
        <summary>Sauvegarde et aide</summary>
        <h3>Sauvegarde</h3>
        <p class="small muted">Vos scans restent uniquement dans ce navigateur. Exportez-les pour les garder ou les transférer sur un autre appareil.</p>
        <div class="row">
            <button :disabled="state.vehicles.length === 0" @click="exportBackup">Exporter</button>
            <label class="button import">
                Importer
                <input type="file" accept="application/json,.json" @change="importBackup" />
            </label>
            <button v-if="state.vehicles.length === 0 && !adding" class="link" @click="adding = true">+ Ajouter un véhicule à la main</button>
        </div>
        <p v-if="backupMessage" class="small" role="status">{{ backupMessage }}</p>

        <h3>Un souci avec votre voiture ou votre adaptateur ?</h3>
        <p class="small muted">
            Le journal technique contient les échanges avec l'adaptateur depuis l'ouverture de la page (dont le VIN, aucune autre donnée
            personnelle). Joignez-le à un signalement sur
            <a href="https://github.com/Ghermin/no-noob-no-arnaque/issues" target="_blank" rel="noopener">GitHub</a>.
        </p>
        <button @click="exportJournal">Télécharger le journal technique</button>
    </details>
</template>

<style scoped>
.hero p {
    margin-bottom: 16px;
}

.start h2 {
    margin-top: 0;
}

.steps {
    list-style: none;
    counter-reset: step;
    padding: 0;
    margin: 0;
}

.steps > li {
    counter-increment: step;
    position: relative;
    padding: 0 0 16px 44px;
    min-height: 32px;
}

.steps > li::before {
    content: counter(step);
    position: absolute;
    left: 0;
    top: -2px;
    width: 30px;
    height: 30px;
    border-radius: 50%;
    background: var(--accent);
    color: var(--accent-text);
    font-weight: 800;
    display: grid;
    place-items: center;
}

.steps strong {
    display: block;
}

.actions {
    margin-top: 10px;
}

.big {
    min-height: 52px;
    padding: 12px 20px;
    font-size: 1.05rem;
    flex: 1 1 200px;
}

.status,
.error {
    margin: 8px 0 0;
}

.error {
    color: var(--danger);
}

.steps .notice {
    margin: 8px 0 0;
}

.next {
    margin: 0 0 12px 44px;
}

details summary {
    cursor: pointer;
    font-weight: 600;
}

details > p {
    margin: 8px 0 0;
}

.more {
    margin-top: 24px;
}

.more h3 {
    margin-top: 16px;
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
