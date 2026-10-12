<script setup lang="ts">
import { ref } from 'vue';
import { elm } from '../store';
import { db, newId } from '../storage';
import { clearEngineCodes, runScan } from '../obd/scanner';
import type { Vehicle } from '../types';

const props = defineProps<{ vehicle: Vehicle }>();
const emit = defineEmits<{ done: [scanId: string]; cancel: [] }>();

const understood = ref(false);
const odometer = ref<number | ''>('');
const running = ref(false);
const progress = ref('');
const error = ref('');

async function run(): Promise<void> {
    if (!elm.value) return;
    running.value = true;
    error.value = '';
    try {
        const result = await runScan(elm.value, (message) => (progress.value = `Sauvegarde avant effacement : ${message.toLowerCase()}`));
        if (props.vehicle.vin && result.vin && props.vehicle.vin !== result.vin) {
            throw new Error(`La voiture branchée (VIN ${result.vin}) n'est pas « ${props.vehicle.name} ». Rien n'a été effacé.`);
        }
        const scanId = newId();
        await db.saveScan({
            id: scanId,
            vehicleId: props.vehicle.id,
            date: Date.now(),
            label: 'controle',
            odometer: odometer.value === '' ? null : Number(odometer.value),
            note: 'Scan enregistré automatiquement juste avant l’effacement des codes.',
            result,
            clearedByUser: true
        });
        progress.value = 'Effacement des codes…';
        if (!(await clearEngineCodes(elm.value))) {
            await db.saveScan({
                id: scanId,
                vehicleId: props.vehicle.id,
                date: Date.now(),
                label: 'controle',
                odometer: odometer.value === '' ? null : Number(odometer.value),
                note: 'Scan enregistré avant une tentative d’effacement refusée par la voiture.',
                result
            });
            throw new Error("La voiture a refusé l'effacement. Vérifiez que le contact est mis et le moteur arrêté, puis réessayez.");
        }
        emit('done', scanId);
    } catch (e) {
        error.value = (e as Error).message;
    } finally {
        running.value = false;
    }
}
</script>

<template>
    <div class="card stack">
        <h3>Effacer les codes défaut du moteur</h3>
        <p class="small">
            Pratique pour vérifier si un défaut est réel : s'il revient tout seul après quelques trajets, le problème est toujours là.
        </p>
        <ul class="small consequences">
            <li>Un scan est d'abord <strong>enregistré automatiquement</strong> : vous gardez la trace des codes.</li>
            <li>Le voyant s'éteint, les codes et l'état du moteur au moment du défaut (freeze frame) sont effacés.</li>
            <li>
                <strong>Tous les autotests repartent de zéro.</strong> Il faut rouler (dont un trajet sur route) pour qu'ils se refassent : évitez
                de le faire juste avant un contrôle technique.
            </li>
            <li>Les codes <strong>permanents</strong> ne s'effacent pas : la voiture les retirera elle-même si le problème est réglé.</li>
            <li>Seul le calculateur moteur est concerné. Rien d'autre n'est modifié.</li>
        </ul>
        <p class="notice warning small">Contact mis, <strong>moteur arrêté</strong>.</p>
        <label>
            Kilométrage au compteur (facultatif)
            <input v-model="odometer" type="number" min="0" inputmode="numeric" :disabled="running" />
        </label>
        <label class="check">
            <input v-model="understood" type="checkbox" :disabled="running" />
            <span>J'ai compris, le moteur est arrêté</span>
        </label>
        <p v-if="running" class="small" role="status">{{ progress }}</p>
        <p v-if="error" class="notice danger small">{{ error }}</p>
        <div class="row">
            <button class="primary" :disabled="!understood || running || !elm" @click="run">Scanner puis effacer</button>
            <button :disabled="running" @click="emit('cancel')">Annuler</button>
        </div>
    </div>
</template>

<style scoped>
.consequences {
    padding-left: 20px;
    margin: 0;
}

.consequences li {
    margin-bottom: 4px;
}

.check {
    flex-direction: row;
    align-items: center;
    gap: 10px;
}

.check input {
    width: 22px;
    height: 22px;
    min-height: 22px;
    flex: none;
}
</style>
