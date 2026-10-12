<script setup lang="ts">
import { computed } from 'vue';
import { describeDtc } from '../obd/dtc';
import type { Dtc } from '../types';

const props = defineProps<{ title: string; hint: string; dtcs: Dtc[] }>();

const items = computed(() => props.dtcs.map((d) => ({ ...describeDtc(d.code), ecu: d.ecu })));
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
                    <span class="badge">{{ item.manufacturerSpecific ? 'Constructeur' : 'Générique' }}</span>
                </div>
                <div>{{ item.description }}</div>
                <div class="small muted">{{ item.system }} · calculateur {{ item.ecu }}</div>
            </li>
        </ul>
    </section>
</template>

<style scoped>
h3 {
    margin: 0;
}
</style>
