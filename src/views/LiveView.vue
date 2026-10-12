<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import { elm, navigate, state } from '../store';
import { pidsForFuel, type PidDefinition } from '../obd/pids';
import { readLive, readSupportedPids } from '../obd/scanner';
import { FUEL_LABELS, type Fuel } from '../types';

const props = defineProps<{ vehicleId: string | null }>();

const vehicle = computed(() => (props.vehicleId ? state.vehicles.find((v) => v.id === props.vehicleId) : undefined));
const fuel = ref<Fuel>(vehicle.value?.fuel ?? 'inconnu');
const supported = ref<number[] | null>(null);
const values = reactive<Record<number, number | null>>({});
const running = ref(false);
const error = ref('');
const fuels = Object.entries(FUEL_LABELS) as [Fuel, string][];

const pids = computed<PidDefinition[]>(() => {
    const list = pidsForFuel(fuel.value);
    return supported.value ? list.filter((p) => supported.value!.includes(p.pid)) : list;
});

let stopped = false;

async function loop(): Promise<void> {
    running.value = true;
    while (!stopped && elm.value) {
        for (const pid of pids.value) {
            if (stopped || !elm.value) break;
            try {
                values[pid.pid] = await readLive(elm.value, pid);
            } catch (e) {
                error.value = (e as Error).message;
            }
        }
        await new Promise((resolve) => setTimeout(resolve, 250));
    }
    running.value = false;
}

onMounted(async () => {
    if (!elm.value) return;
    try {
        supported.value = await readSupportedPids(elm.value);
    } catch (e) {
        error.value = (e as Error).message;
    }
    loop();
});

onBeforeUnmount(() => {
    stopped = true;
});

function format(pid: PidDefinition): string {
    const value = values[pid.pid];
    if (value === undefined) return '…';
    if (value === null) return '—';
    return value.toLocaleString('fr-FR', { maximumFractionDigits: pid.digits ?? 0, minimumFractionDigits: pid.digits ?? 0 });
}
</script>

<template>
    <button v-if="vehicle" class="link" @click="navigate({ name: 'vehicle', id: vehicle.id })">← {{ vehicle.name }}</button>
    <h1>Données en direct</h1>

    <p v-if="!elm" class="notice warning">Connectez l'adaptateur pour afficher les mesures.</p>

    <template v-else>
        <label class="fuel">
            Type de moteur
            <select v-model="fuel">
                <option v-for="[value, label] in fuels" :key="value" :value="value">{{ label }}</option>
            </select>
        </label>
        <p class="small muted">
            {{ pids.length }} mesure(s) disponible(s) sur cette voiture.
            <span v-if="running">Mise à jour en continu.</span>
        </p>
        <p v-if="error" class="small notice warning">{{ error }}</p>

        <div class="grid-2">
            <div v-for="pid in pids" :key="pid.pid" class="stat">
                <div class="value">
                    {{ format(pid) }} <small>{{ pid.unit }}</small>
                </div>
                <div class="label">{{ pid.label }}</div>
            </div>
        </div>
    </template>
</template>

<style scoped>
.fuel {
    margin: 8px 0;
    max-width: 280px;
}
</style>
