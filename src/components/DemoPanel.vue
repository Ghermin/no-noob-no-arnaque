<script setup lang="ts">
import { ref } from 'vue';
import { connect, simulator } from '../store';
import { DEMO_PROFILES, type DemoProfile } from '../obd/simulator';

const lastAction = ref('');
const tick = ref(0);
const profiles = Object.entries(DEMO_PROFILES) as [DemoProfile, { label: string; story: string }][];

function act(label: string, action: () => void): void {
    action();
    lastAction.value = label;
    tick.value++;
}

async function switchProfile(profile: DemoProfile): Promise<void> {
    if (await connect('demo', profile)) lastAction.value = `Voiture démo : ${DEMO_PROFILES[profile].label}.`;
}
</script>

<template>
    <details v-if="simulator" class="card demo no-print">
        <summary>
            <strong>Mode démo</strong> : {{ DEMO_PROFILES[simulator.profile].label }}
        </summary>
        <p class="small muted">{{ DEMO_PROFILES[simulator.profile].story }}</p>
        <p :key="tick" class="small">
            Compteur affiché au tableau de bord : <strong>{{ simulator.dashboardKm.toLocaleString('fr-FR') }} km</strong>. Saisissez-le au moment
            d'enregistrer un scan.
        </p>
        <div class="row">
            <button @click="act('Le garage a effacé les codes sans rien réparer.', () => simulator!.garageClear(false))">Garage : efface sans réparer</button>
            <button @click="act('Le garage a réparé le défaut moteur et effacé les codes.', () => simulator!.garageClear(true))">Garage : répare vraiment</button>
            <button @click="act('Vous avez roulé 15 km en ville.', () => simulator!.drive(15))">Rouler 15 km</button>
            <button @click="act('Vous avez roulé 80 km sur route.', () => simulator!.drive(80))">Rouler 80 km</button>
            <button @click="act('Le compteur a été reculé de 40 000 km.', () => simulator!.tamperOdometer(40000))">Trafiquer le compteur</button>
            <button class="danger" @click="act('Simulation remise à zéro.', () => simulator!.reset())">Réinitialiser</button>
        </div>
        <div class="row switch">
            <span class="small muted">Autre voiture :</span>
            <button
                v-for="[profile, info] in profiles.filter(([p]) => p !== simulator!.profile)"
                :key="profile"
                class="link"
                @click="switchProfile(profile)"
            >
                {{ info.label }}
            </button>
        </div>
        <p v-if="lastAction" class="small" role="status">✔ {{ lastAction }}</p>
    </details>
</template>

<style scoped>
.demo {
    border-style: dashed;
}

summary {
    cursor: pointer;
}

.row {
    margin-top: 8px;
}

.row button {
    font-size: 0.875rem;
}

p.small {
    margin: 8px 0 0;
}
</style>
