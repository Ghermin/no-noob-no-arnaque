<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { elm, navigate, refreshVehicles, state } from '../store';
import { db } from '../storage';
import { SEVERITY_LABELS, formatDate, vehicleSubtitle, worstSeverity } from '../format';
import { isVag } from '../obd/vin';
import { SCAN_LABELS, type SavedScan, type Vehicle } from '../types';
import VehicleForm from '../components/VehicleForm.vue';

const props = defineProps<{ vehicleId: string }>();

const vehicle = computed(() => state.vehicles.find((v) => v.id === props.vehicleId));
const scans = ref<SavedScan[]>([]);
const editing = ref(false);
const selected = ref<string[]>([]);
const connected = computed(() => elm.value !== null);

onMounted(async () => {
    scans.value = await db.scans(props.vehicleId);
});

async function save(updated: Vehicle): Promise<void> {
    await db.saveVehicle(updated);
    await refreshVehicles();
    editing.value = false;
}

async function remove(): Promise<void> {
    if (!vehicle.value) return;
    if (!confirm(`Supprimer « ${vehicle.value.name} » et ses ${scans.value.length} scan(s) ? C'est définitif.`)) return;
    await db.deleteVehicle(vehicle.value.id);
    await refreshVehicles();
    navigate({ name: 'home' }, true);
}

function toggle(id: string): void {
    if (selected.value.includes(id)) {
        selected.value = selected.value.filter((s) => s !== id);
    } else {
        selected.value = [...selected.value, id].slice(-2);
    }
}

function compare(): void {
    const chosen = scans.value.filter((s) => selected.value.includes(s.id)).sort((a, b) => a.date - b.date);
    if (chosen.length !== 2) return;
    navigate({ name: 'compare', vehicleId: props.vehicleId, beforeId: chosen[0].id, afterId: chosen[1].id });
}
</script>

<template>
    <template v-if="vehicle">
        <div class="spread">
            <div>
                <h1>{{ vehicle.name }}</h1>
                <p class="muted small">{{ vehicleSubtitle(vehicle) }}</p>
            </div>
            <button v-if="!editing" class="link" @click="editing = true">Modifier</button>
        </div>
        <p v-if="vehicle.vin" class="small">VIN : <span class="code">{{ vehicle.vin }}</span></p>

        <div v-if="editing" class="card">
            <VehicleForm :vehicle="vehicle" submit-label="Enregistrer" @submit="save" @cancel="editing = false" />
            <button class="danger block delete" @click="remove">Supprimer ce véhicule</button>
        </div>

        <div class="row actions">
            <button class="primary" :disabled="!connected" @click="navigate({ name: 'scan', vehicleId: vehicle.id })">Nouveau scan</button>
            <button :disabled="!connected" @click="navigate({ name: 'live', vehicleId: vehicle.id })">Données en direct</button>
        </div>
        <p v-if="!connected" class="small muted">Connectez l'adaptateur (en haut) pour scanner.</p>

        <p v-if="isVag(vehicle.make)" class="notice info small">
            Véhicule du groupe VAG : la lecture des autres calculateurs (ABS, airbag, tableau de bord, kilométrage) est prévue dans une prochaine
            version.
        </p>

        <div class="spread">
            <h2>Historique</h2>
            <button v-if="scans.length >= 2" class="link" :disabled="selected.length !== 2" @click="compare">
                Comparer ({{ selected.length }}/2)
            </button>
        </div>
        <p v-if="scans.length >= 2" class="small muted">Cochez deux scans, par exemple « avant » et « après » le garage, pour les comparer.</p>
        <p v-if="scans.length === 0" class="muted small">Aucun scan pour ce véhicule.</p>

        <div v-for="scan in scans" :key="scan.id" class="card scan">
            <input
                v-if="scans.length >= 2"
                type="checkbox"
                :checked="selected.includes(scan.id)"
                :aria-label="`Sélectionner le scan « ${SCAN_LABELS[scan.label]} » du ${formatDate(scan.date)}`"
                @change="toggle(scan.id)"
            />
            <button class="link open" @click="navigate({ name: 'report', vehicleId: vehicle.id, scanId: scan.id })">
                <span class="spread">
                    <strong>{{ SCAN_LABELS[scan.label] }}</strong>
                    <span class="badge" :class="worstSeverity(scan.result)">{{ SEVERITY_LABELS[worstSeverity(scan.result)] }}</span>
                </span>
                <span class="small muted">
                    {{ formatDate(scan.date) }}
                    <template v-if="scan.odometer !== null"> · {{ scan.odometer.toLocaleString('fr-FR') }} km</template>
                    · {{ scan.result.stored.length + scan.result.pending.length }} code(s)
                </span>
            </button>
        </div>
    </template>
    <p v-else class="muted">Véhicule introuvable.</p>
</template>

<style scoped>
.actions {
    margin: 8px 0;
}

.delete {
    margin-top: 16px;
}

.scan {
    display: flex;
    gap: 12px;
    align-items: center;
}

.scan input {
    width: 22px;
    min-height: 22px;
    height: 22px;
    flex: none;
}

.open {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: stretch;
    text-align: left;
    color: var(--text);
}
</style>
