<script setup lang="ts">
import { reactive } from 'vue';
import { FUEL_LABELS, type Fuel, type Vehicle } from '../types';

const props = defineProps<{ vehicle: Vehicle; submitLabel: string; vinLocked?: boolean }>();
const emit = defineEmits<{ submit: [vehicle: Vehicle]; cancel: [] }>();

const form = reactive({ ...props.vehicle, vin: props.vehicle.vin ?? '', year: props.vehicle.year ?? ('' as number | '') });
const fuels = Object.entries(FUEL_LABELS) as [Fuel, string][];

function submit(): void {
    const vin = form.vin.trim().toUpperCase();
    emit('submit', {
        ...props.vehicle,
        name: form.name.trim() || 'Ma voiture',
        make: form.make?.trim() || null,
        year: form.year === '' ? null : Number(form.year),
        fuel: form.fuel,
        vin: vin.length === 17 ? vin : null
    });
}
</script>

<template>
    <form class="stack" @submit.prevent="submit">
        <label>
            Nom
            <input v-model="form.name" required maxlength="40" placeholder="Ex. : L'Ibiza" />
        </label>
        <label>
            Carburant
            <select v-model="form.fuel">
                <option v-for="[value, label] in fuels" :key="value" :value="value">{{ label }}</option>
            </select>
            <span class="small muted hint">Sert à n'afficher que les mesures utiles (pression de rail pour un diesel, sondes lambda pour une essence…).</span>
        </label>
        <div class="grid-2">
            <label>
                Marque
                <input v-model="form.make" maxlength="30" placeholder="Ex. : Seat" />
            </label>
            <label>
                Année
                <input v-model="form.year" type="number" min="1996" max="2100" inputmode="numeric" />
            </label>
        </div>
        <label>
            VIN (numéro de série)
            <input v-model="form.vin" maxlength="17" :readonly="vinLocked" placeholder="Rempli automatiquement au premier scan" class="code" />
        </label>
        <div class="row">
            <button type="submit" class="primary">{{ submitLabel }}</button>
            <button type="button" @click="emit('cancel')">Annuler</button>
        </div>
    </form>
</template>

<style scoped>
.hint {
    font-weight: 400;
}
</style>
