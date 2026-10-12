<script setup lang="ts">
import type { EcuReport } from '../types';

defineProps<{ modules: EcuReport[] }>();
</script>

<template>
    <div v-for="module in modules" :key="module.id" class="card">
        <div class="spread">
            <h3>{{ module.name }}</h3>
            <span class="badge" :class="module.dtcs.some((d) => d.code !== '—') ? 'danger' : module.dtcs.length ? 'warning' : 'ok'">
                {{ module.dtcs.some((d) => d.code !== '—') ? module.dtcs.length : module.dtcs.length ? '?' : 'RAS' }}
            </span>
        </div>
        <p class="small muted meta">
            {{ module.id }} · {{ module.protocol }}<template v-if="module.partNumber"> · réf. {{ module.partNumber }}</template>
        </p>
        <ul v-if="module.dtcs.length" class="list">
            <li v-for="dtc in module.dtcs" :key="dtc.code">
                <span class="code">{{ dtc.code }}</span> {{ dtc.description }}
                <div v-if="dtc.status" class="small muted">{{ dtc.status }}</div>
            </li>
        </ul>
    </div>
</template>

<style scoped>
h3 {
    margin: 0;
}

.meta {
    margin: 2px 0 4px;
    word-break: break-word;
}
</style>
