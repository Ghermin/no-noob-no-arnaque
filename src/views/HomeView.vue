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
    <section class="pg-hero home-hero">
        <div class="pg-hero__tags">
            <p class="pg-kicker">~/projets/no-noob-no-arnaque</p>
            <ul class="pg-chips">
                <li>OBD-II</li>
                <li>Navigateur</li>
                <li>Sans compte</li>
            </ul>
        </div>
        <h1>Diagnostiquez votre voiture <span class="pg-grad">vous-même</span>.</h1>
        <p class="pg-lead">Codes défaut, voyant, effacement suspect : vérifiez avant ou après le garage. Gratuit, sans compte.</p>
    </section>

    <div v-if="connected" class="pg-card highlight ready">
        <h2>Adaptateur connecté</h2>
        <p class="small muted">{{ elm?.protocolName }}</p>
        <div class="row">
            <button class="primary big" @click="navigate({ name: 'scan', vehicleId: null })">Lancer le diagnostic</button>
            <button class="big" @click="navigate({ name: 'live', vehicleId: null })">Données en direct</button>
        </div>
    </div>

    <template v-else>
        <ol class="pg-steps steps">
            <li class="pg-card">
                <h2>Branchez l'adaptateur OBD</h2>
                <p>sur la prise sous le volant.</p>
            </li>
            <li class="pg-card">
                <h2>Mettez le contact</h2>
                <p>ou démarrez le moteur.</p>
            </li>
            <li class="pg-card highlight">
                <h2>Connectez-le</h2>
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
        <p class="pg-meta">Le diagnostic se lance ensuite en un clic.</p>

        <div class="pg-faq adapter">
            <details>
                <summary>Pas encore d'adaptateur ?</summary>
                <p>
                    Il faut un adaptateur <strong>ELM327 Bluetooth 4.0 (BLE)</strong> ou un <strong>câble OBD USB</strong>, vendus à petit prix. Évitez
                    les modèles en Bluetooth « classique » : un navigateur ne peut pas s'y connecter. Sur téléphone, un câble USB se branche avec un
                    adaptateur USB-C (OTG).
                </p>
            </details>
        </div>
    </template>

    <section v-if="state.vehicles.length > 0 || adding" class="pg-section">
        <div class="spread garage-head">
            <h2>Mon garage</h2>
            <button v-if="!adding" class="link" @click="adding = true">+ Ajouter un véhicule</button>
        </div>

        <div v-if="adding" class="card">
            <VehicleForm :vehicle="blankVehicle()" submit-label="Ajouter" @submit="addVehicle" @cancel="adding = false" />
        </div>

        <div class="pg-grid pg-grid--wide">
            <button v-for="vehicle in state.vehicles" :key="vehicle.id" class="card vehicle" @click="navigate({ name: 'vehicle', id: vehicle.id })">
                <span class="spread">
                    <span>
                        <span class="name">{{ vehicle.name }}</span>
                        <span class="small muted sub">{{ vehicleSubtitle(vehicle) }}</span>
                    </span>
                    <span v-if="lastScans[vehicle.id]" class="badge" :class="worstSeverity(lastScans[vehicle.id]!.result, lastScans[vehicle.id]!.odometer)">
                        {{ SEVERITY_LABELS[worstSeverity(lastScans[vehicle.id]!.result, lastScans[vehicle.id]!.odometer)] }}
                    </span>
                </span>
                <span class="small muted sub last">
                    {{ lastScans[vehicle.id] ? `Dernier scan : ${formatDate(lastScans[vehicle.id]!.date)}` : 'Jamais scanné' }}
                </span>
            </button>
        </div>
    </section>

    <section class="pg-section more">
        <div class="pg-faq">
            <details>
                <summary>Sauvegarde et aide</summary>
                <div>
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
                </div>
            </details>
        </div>
    </section>
</template>

<style scoped>
/* Halo ambre et orange derrière l'accroche, comme l'icône */
.home-hero {
    position: relative;
    width: auto;
    padding-bottom: clamp(24px, 3vw, 36px);
}

.home-hero::before {
    content: '';
    position: absolute;
    inset: -90px -20vw auto;
    height: 560px;
    z-index: -1;
    pointer-events: none;
    background:
        radial-gradient(30% 42% at 20% 20%, color-mix(in srgb, #ffb020 20%, transparent), transparent 70%),
        radial-gradient(30% 42% at 78% 14%, color-mix(in srgb, #f2542d 16%, transparent), transparent 70%);
}

.steps {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 16px;
    grid-template-columns: 1fr 1fr 1.35fr;
}

@media (max-width: 860px) {
    .steps {
        grid-template-columns: 1fr;
    }
}

.steps h2 {
    margin: 0 0 6px;
    font-size: 18px;
    letter-spacing: -0.015em;
}

.steps p {
    margin: 0;
    font-size: 15.5px;
    color: var(--muted);
}

.highlight {
    border-color: var(--pg-accent);
    box-shadow: 0 0 0 1px var(--pg-accent) inset, var(--pg-shadow-hover);
}

.ready h2 {
    margin-top: 0;
}

.actions {
    margin-top: 12px;
}

.big {
    min-height: 50px;
    padding: 12px 20px;
    font-size: 1rem;
    flex: 1 1 180px;
}

.steps .status,
.steps .error,
.steps .notice {
    margin-top: 10px;
}

.steps .error {
    color: var(--danger);
}

.steps .notice {
    color: var(--text);
}

.adapter {
    margin-top: 20px;
}

.pg-section {
    width: auto;
}

.garage-head {
    flex-wrap: wrap;
    margin-bottom: 20px;
}

.garage-head h2 {
    margin: 0;
}

.vehicle {
    display: block;
    width: 100%;
    margin: 0;
    text-align: left;
    font-weight: 400;
}

.name {
    display: block;
    font-size: 1.1rem;
    font-weight: 700;
    letter-spacing: -0.015em;
}

.sub {
    display: block;
}

.last {
    margin-top: 10px;
}

.more {
    padding-top: clamp(28px, 4vw, 40px);
}

.more h3 {
    margin: 18px 0 4px;
    color: var(--text);
}

.more h3:first-child {
    margin-top: 0;
}

.import {
    font-size: 1rem;
    flex-direction: row;
}

.import input {
    display: none;
}
</style>
