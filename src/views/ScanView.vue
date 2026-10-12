<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { elm, navigate, refreshVehicles, state } from '../store';
import { db, newId } from '../storage';
import { runScan } from '../obd/scanner';
import { makeFromVin, yearFromVin } from '../obd/vin';
import { guessFuel } from '../format';
import { SCAN_LABELS, type ScanLabel, type ScanResult, type Vehicle } from '../types';
import VehicleForm from '../components/VehicleForm.vue';

const props = defineProps<{ vehicleId: string | null }>();

type Step = 'scanning' | 'error' | 'vehicle' | 'mismatch' | 'details';

const step = ref<Step>('scanning');
const progress = ref('Préparation…');
const error = ref('');
const result = ref<ScanResult | null>(null);
const vehicle = ref<Vehicle | null>(null);
const isNewVehicle = ref(false);
const details = reactive({ label: 'controle' as ScanLabel, odometer: '' as number | '', note: '' });
const labels = Object.entries(SCAN_LABELS) as [ScanLabel, string][];
const lastOdometer = ref<number | null>(null);

function vehicleFromScan(scan: ScanResult): Vehicle {
    const make = scan.vin ? makeFromVin(scan.vin) : null;
    const year = scan.vin ? yearFromVin(scan.vin) : null;
    return {
        id: newId(),
        name: [make, year].filter(Boolean).join(' ') || 'Ma voiture',
        vin: scan.vin,
        fuel: guessFuel(scan),
        make,
        year,
        createdAt: Date.now()
    };
}

function resolveVehicle(scan: ScanResult): void {
    const chosen = props.vehicleId ? state.vehicles.find((v) => v.id === props.vehicleId) : undefined;
    if (chosen) {
        vehicle.value = { ...chosen };
        step.value = chosen.vin && scan.vin && chosen.vin !== scan.vin ? 'mismatch' : 'details';
        return;
    }
    const known = scan.vin ? state.vehicles.find((v) => v.vin === scan.vin) : undefined;
    if (known) {
        vehicle.value = { ...known };
        step.value = 'details';
        return;
    }
    vehicle.value = vehicleFromScan(scan);
    isNewVehicle.value = true;
    step.value = 'vehicle';
}

async function loadLastOdometer(vehicleId: string): Promise<void> {
    const previous = (await db.scans(vehicleId)).find((s) => s.odometer !== null);
    lastOdometer.value = previous?.odometer ?? null;
}

async function scan(): Promise<void> {
    if (!elm.value) {
        error.value = "L'adaptateur n'est pas connecté.";
        step.value = 'error';
        return;
    }
    step.value = 'scanning';
    try {
        result.value = await runScan(elm.value, (message) => (progress.value = message));
        resolveVehicle(result.value);
        if (vehicle.value && !isNewVehicle.value) await loadLastOdometer(vehicle.value.id);
    } catch (e) {
        error.value = (e as Error).message;
        step.value = 'error';
    }
}

onMounted(scan);

function useNewVehicle(): void {
    if (!result.value) return;
    vehicle.value = vehicleFromScan(result.value);
    isNewVehicle.value = true;
    step.value = 'vehicle';
}

function confirmVehicle(updated: Vehicle): void {
    vehicle.value = updated;
    step.value = 'details';
}

async function save(): Promise<void> {
    if (!vehicle.value || !result.value) return;
    const target = vehicle.value;
    if (!target.vin && result.value.vin && !isNewVehicle.value) target.vin = result.value.vin;
    await db.saveVehicle(target);
    const scanId = newId();
    await db.saveScan({
        id: scanId,
        vehicleId: target.id,
        date: Date.now(),
        label: details.label,
        odometer: details.odometer === '' ? null : Number(details.odometer),
        note: details.note.trim(),
        result: result.value
    });
    await refreshVehicles();
    navigate({ name: 'report', vehicleId: target.id, scanId }, true);
}
</script>

<template>
    <h1>Scan</h1>

    <div v-if="step === 'scanning'" class="card">
        <p><span class="spinner" aria-hidden="true"></span> {{ progress }}</p>
        <p class="small muted">Gardez le contact mis. Le scan prend 10 à 30 secondes.</p>
    </div>

    <div v-else-if="step === 'error'" class="notice danger">
        <strong>Le scan a échoué</strong>
        <p class="small">{{ error }}</p>
        <button :disabled="!elm" @click="scan">Réessayer</button>
    </div>

    <div v-else-if="step === 'mismatch' && vehicle" class="notice warning">
        <strong>Ce n'est pas la même voiture</strong>
        <p class="small">
            Le VIN lu (<span class="code">{{ result?.vin }}</span>) ne correspond pas à celui de « {{ vehicle.name }} » (<span class="code">{{ vehicle.vin }}</span>).
        </p>
        <div class="row">
            <button class="primary" @click="useNewVehicle">Créer un nouveau véhicule</button>
            <button @click="step = 'details'">Enregistrer quand même ici</button>
        </div>
    </div>

    <div v-else-if="step === 'vehicle' && vehicle" class="card">
        <h3>Nouveau véhicule détecté</h3>
        <p class="small muted">
            Vérifiez les informations, en particulier le <strong>carburant</strong> : il détermine les mesures affichées.
            <template v-if="!result?.vin"> Le VIN n'a pas pu être lu sur cette voiture.</template>
        </p>
        <VehicleForm :vehicle="vehicle" submit-label="Continuer" :vin-locked="!!result?.vin" @submit="confirmVehicle" @cancel="navigate({ name: 'home' }, true)" />
    </div>

    <form v-else-if="step === 'details' && vehicle" class="card stack" @submit.prevent="save">
        <h3>Enregistrer le scan de « {{ vehicle.name }} »</h3>
        <label>
            Contexte
            <select v-model="details.label">
                <option v-for="[value, label] in labels" :key="value" :value="value">{{ label }}</option>
            </select>
        </label>
        <label>
            Kilométrage au compteur (facultatif)
            <input v-model="details.odometer" type="number" min="0" inputmode="numeric" :placeholder="lastOdometer !== null ? `Dernier relevé : ${lastOdometer.toLocaleString('fr-FR')} km` : 'Ex. : 142350'" />
            <span class="small muted hint">Permet de détecter un effacement des codes entre deux scans, même discret.</span>
        </label>
        <label>
            Note (facultatif)
            <textarea v-model="details.note" rows="2" maxlength="500" placeholder="Ex. : devis garage X, remplacement vanne EGR 480 €"></textarea>
        </label>
        <button type="submit" class="primary">Voir le rapport</button>
    </form>
</template>

<style scoped>
.hint {
    font-weight: 400;
}

.spinner {
    display: inline-block;
    width: 14px;
    height: 14px;
    border: 2px solid var(--border);
    border-top-color: var(--accent);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
    vertical-align: -2px;
    margin-right: 6px;
}

@keyframes spin {
    to {
        transform: rotate(360deg);
    }
}
</style>
