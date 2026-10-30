<script setup lang="ts">
import { computed } from 'vue';
import { describeDtc } from '../obd/dtc';
import type { Dtc } from '../types';

const props = defineProps<{ title: string; hint: string; dtcs: Dtc[] }>();

const ECU_NAMES: Record<string, string> = { '7E8': 'calculateur moteur', '7E9': 'calculateur de boîte de vitesses' };

const items = computed(() =>
    props.dtcs.map((d) => ({ ...describeDtc(d.code), ecu: d.ecu, ecuName: ECU_NAMES[d.ecu.toUpperCase()] ?? `calculateur ${d.ecu}` }))
);
</script>

<template>
    <section class="card">
        <div class="spread">
            <h3>{{ title }}</h3>
            <span class="badge" :class="dtcs.length ? 'danger' : 'ok'">{{ dtcs.length }}</span>
        </div>
        <p class="small muted">{{ hint }}</p>
        <ul v-if="items.length" class="list">
            <li v-for="item in items" :key="item.code + item.ecu">
                <div class="spread">
                    <span class="code">{{ item.code }}</span>
                    <span class="badge">{{ item.manufacturerSpecific ? 'Propre à la marque' : 'Standard' }}</span>
                </div>
                <div>{{ item.description }}</div>
                <div class="small muted">{{ item.system }} · signalé par le {{ item.ecuName }}</div>
            </li>
        </ul>
    </section>
</template>

<style scoped>
h3 {
    margin: 0;
}
</style>
