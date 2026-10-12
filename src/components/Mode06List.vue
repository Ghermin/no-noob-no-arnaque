<script setup lang="ts">
import { computed } from 'vue';
import type { Mode06Test } from '../obd/mode06';

const props = defineProps<{ tests: Mode06Test[] }>();

const sorted = computed(() => [...props.tests].sort((a, b) => Number(a.passed) - Number(b.passed) || a.mid - b.mid || a.tid - b.tid));
const failed = computed(() => props.tests.filter((t) => !t.passed).length);

function format(value: number): string {
    return value.toLocaleString('fr-FR', { maximumFractionDigits: 3 });
}
</script>

<template>
    <details class="card" :open="failed > 0">
        <summary>
            <span class="spread">
                <strong>{{ tests.length }} test(s)</strong>
                <span class="badge" :class="failed ? 'warning' : 'ok'">{{ failed ? `${failed} hors limites` : 'Tous dans les limites' }}</span>
            </span>
        </summary>
        <ul class="list">
            <li v-for="test in sorted" :key="`${test.mid}-${test.tid}`">
                <div class="spread">
                    <span>{{ test.monitor }} <span class="small muted">· test {{ test.tid }}</span></span>
                    <span class="badge" :class="test.passed ? 'ok' : 'warning'">{{ test.passed ? 'OK' : 'Hors limites' }}</span>
                </div>
                <div class="small muted">
                    Mesuré {{ format(test.value) }} {{ test.unit }} · limites {{ format(test.min) }} à {{ format(test.max) }} {{ test.unit }}
                    <template v-if="!test.unit"> (valeur sans unité, propre au constructeur)</template>
                </div>
            </li>
        </ul>
    </details>
</template>

<style scoped>
summary {
    cursor: pointer;
    list-style: none;
}
</style>
