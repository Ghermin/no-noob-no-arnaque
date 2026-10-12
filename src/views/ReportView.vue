<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { navigate, state } from '../store';
import { db } from '../storage';
import { analyzeScan } from '../analysis';
import { formatDate, formatDuration, vehicleSubtitle } from '../format';
import { SCAN_LABELS, type SavedScan } from '../types';
import FindingList from '../components/FindingList.vue';
import DtcList from '../components/DtcList.vue';

const props = defineProps<{ vehicleId: string; scanId: string }>();

const vehicle = computed(() => state.vehicles.find((v) => v.id === props.vehicleId));
const scan = ref<SavedScan | null>(null);
const previous = ref<SavedScan | null>(null);
const loaded = ref(false);

onMounted(async () => {
    const scans = await db.scans(props.vehicleId);
    const index = scans.findIndex((s) => s.id === props.scanId);
    scan.value = scans[index] ?? null;
    previous.value = index >= 0 ? scans[index + 1] ?? null : null;
    loaded.value = true;
});

const findings = computed(() => (scan.value ? analyzeScan(scan.value.result) : []));

async function remove(): Promise<void> {
    if (!scan.value || !confirm('Supprimer ce scan ?')) return;
    await db.deleteScan(scan.value.id);
    navigate({ name: 'vehicle', id: props.vehicleId }, true);
}

function printPage(): void {
    window.print();
}
</script>

<template>
    <template v-if="scan">
        <button class="link no-print" @click="navigate({ name: 'vehicle', id: vehicleId })">← {{ vehicle?.name ?? 'Véhicule' }}</button>
        <h1>Rapport : {{ SCAN_LABELS[scan.label].toLowerCase() }}</h1>
        <p class="muted small">
            {{ vehicle?.name }}<template v-if="vehicle"> ({{ vehicleSubtitle(vehicle) }})</template> · {{ formatDate(scan.date) }}
            <template v-if="scan.odometer !== null"> · {{ scan.odometer.toLocaleString('fr-FR') }} km</template>
        </p>
        <p v-if="scan.note" class="card small">📝 {{ scan.note }}</p>

        <div class="row no-print actions">
            <button v-if="previous" class="primary" @click="navigate({ name: 'compare', vehicleId, beforeId: previous.id, afterId: scan.id })">
                Comparer au scan précédent
            </button>
            <button @click="printPage">Imprimer / PDF</button>
        </div>

        <h2>Verdict</h2>
        <FindingList :findings="findings" />

        <h2>Codes défaut</h2>
        <DtcList title="Confirmés" hint="Défauts détectés plusieurs fois : ce sont eux qui allument le voyant." :dtcs="scan.result.stored" />
        <DtcList title="En attente" hint="Détectés une seule fois. À surveiller : ils deviendront confirmés s'ils reviennent." :dtcs="scan.result.pending" />
        <DtcList
            title="Permanents"
            hint="Impossibles à effacer avec un outil : ils disparaissent seulement quand la voiture a vérifié elle-même la réparation."
            :dtcs="scan.result.permanent"
        />

        <h2>Depuis le dernier effacement des codes</h2>
        <div class="grid-2">
            <div class="stat">
                <div class="value">{{ scan.result.distanceSinceClear ?? '—' }}<small v-if="scan.result.distanceSinceClear !== null"> km</small></div>
                <div class="label">Distance parcourue</div>
            </div>
            <div class="stat">
                <div class="value">{{ scan.result.warmupsSinceClear ?? '—' }}</div>
                <div class="label">Démarrages à froid{{ scan.result.warmupsSinceClear === 255 ? ' (max)' : '' }}</div>
            </div>
            <div class="stat">
                <div class="value">{{ scan.result.minutesSinceClear !== null ? formatDuration(scan.result.minutesSinceClear) : '—' }}</div>
                <div class="label">Temps moteur tournant</div>
            </div>
            <div class="stat">
                <div class="value">{{ scan.result.distanceWithMil ?? '—' }}<small v-if="scan.result.distanceWithMil !== null"> km</small></div>
                <div class="label">Parcourus voyant allumé</div>
            </div>
        </div>
        <p class="small muted">« — » : information non fournie par cette voiture. Les compteurs plafonnent (65 535 km, 255 démarrages).</p>

        <h2>Autotests (moniteurs)</h2>
        <p class="small muted">
            La voiture vérifie elle-même chaque système en roulant. « Pas encore fait » signifie que le test n'a pas tourné depuis le dernier
            effacement : il ne détecte donc encore rien.
        </p>
        <div class="card">
            <ul v-if="scan.result.monitors.length" class="list">
                <li v-for="monitor in scan.result.monitors" :key="monitor.key" class="spread">
                    <span>{{ monitor.label }}</span>
                    <span class="badge" :class="monitor.complete ? 'ok' : 'warning'">{{ monitor.complete ? 'Terminé' : 'Pas encore fait' }}</span>
                </li>
            </ul>
            <p v-else class="muted small">Information non disponible.</p>
        </div>

        <details class="card small">
            <summary>Informations techniques</summary>
            <ul class="list">
                <li>VIN : <span class="code">{{ scan.result.vin ?? 'non lu' }}</span></li>
                <li>Protocole : {{ scan.result.protocol }}</li>
                <li>Adaptateur : {{ scan.result.adapter }}</li>
                <li>Calculateur(s) ayant répondu : {{ scan.result.ecus.join(', ') || '—' }}</li>
                <li>Allumage : {{ scan.result.ignition === 'compression' ? 'par compression (diesel)' : 'commandé (essence, GPL…)' }}</li>
                <li>PID supportés : {{ scan.result.supportedPids.length }}</li>
            </ul>
        </details>

        <button class="danger no-print" @click="remove">Supprimer ce scan</button>
    </template>
    <p v-else-if="loaded" class="muted">Scan introuvable.</p>
</template>

<style scoped>
.actions {
    margin-bottom: 8px;
}

summary {
    cursor: pointer;
    font-weight: 600;
}
</style>
