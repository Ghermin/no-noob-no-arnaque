<script setup lang="ts">
import { ref } from 'vue';
import { simulator } from '../store';

const lastAction = ref('');

function act(label: string, action: () => void): void {
    action();
    lastAction.value = label;
}
</script>

<template>
    <details v-if="simulator" class="card demo no-print">
        <summary><strong>Mode démo</strong> : Ibiza 1.6 TDI de 2010 simulée, avec une vanne EGR encrassée (P0401)</summary>
        <p class="small muted">Jouez un scénario, puis relancez un scan pour voir ce que l'app détecte.</p>
        <div class="row">
            <button @click="act('Le garage a effacé les codes sans rien réparer.', () => simulator!.garageClear(false))">Garage : efface sans réparer</button>
            <button @click="act('Le garage a réparé la vanne EGR et effacé les codes.', () => simulator!.garageClear(true))">Garage : répare vraiment</button>
            <button @click="act('Vous avez roulé 15 km en ville.', () => simulator!.drive(15))">Rouler 15 km</button>
            <button @click="act('Vous avez roulé 80 km sur route.', () => simulator!.drive(80))">Rouler 80 km</button>
            <button class="danger" @click="act('Simulation remise à zéro.', () => simulator!.reset())">Réinitialiser</button>
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
