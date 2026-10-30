<script setup lang="ts">
import { computed } from 'vue';
import { monitorName, type Mode06Test } from '../obd/mode06';

const props = defineProps<{ tests: Mode06Test[] }>();

// Regroupe les mesures par système : c'est le verdict par système qui parle, les valeurs restent en détail.
const groups = computed(() => {
    const byMonitor = new Map<number, Mode06Test[]>();
    for (const test of props.tests) byMonitor.set(test.mid, [...(byMonitor.get(test.mid) ?? []), test]);
    return [...byMonitor]
        .map(([mid, tests]) => ({ name: monitorName(mid), tests, failed: tests.filter((t) => !t.passed).length }))
        .sort((a, b) => b.failed - a.failed);
});
const failed = computed(() => groups.value.filter((g) => g.failed > 0).length);

function format(value: number, unit: string): string {
    const text = value.toLocaleString('fr-FR', { maximumFractionDigits: 3 });
    return unit && unit !== '(brut)' ? `${text} ${unit}` : text;
}
</script>

<template>
    <details class="card" :open="failed > 0">
        <summary>
            <span class="spread">
                <strong>{{ groups.length }} système{{ groups.length > 1 ? 's' : '' }} testé{{ groups.length > 1 ? 's' : '' }}</strong>
                <span class="badge" :class="failed ? 'warning' : 'ok'">{{ failed ? `${failed} hors limites` : 'Tous dans les limites' }}</span>
            </span>
        </summary>
        <ul class="list">
            <li v-for="group in groups" :key="group.name">
                <details>
                    <summary class="spread">
                        <span>{{ group.name }}</span>
                        <span class="badge" :class="group.failed ? 'warning' : 'ok'">{{ group.failed ? 'Hors limites' : 'OK' }}</span>
                    </summary>
                    <ul class="small muted measures">
                        <li v-for="test in group.tests" :key="test.tid">
                            {{ test.passed ? '✓' : '✗' }} Mesure {{ format(test.value, test.unit) }}, limites
                            {{ format(test.min, test.unit) }} à {{ format(test.max, test.unit) }}
                            <template v-if="!test.unit || test.unit === '(brut)'"> (échelle propre au constructeur)</template>
                        </li>
                    </ul>
                </details>
            </li>
        </ul>
    </details>
</template>

<style scoped>
summary {
    cursor: pointer;
    list-style: none;
}

.measures {
    margin: 4px 0 0;
    padding-left: 4px;
    list-style: none;
}
</style>
