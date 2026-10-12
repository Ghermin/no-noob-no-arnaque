<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { navigate, state } from '../store';
import { db } from '../storage';
import { compareScans } from '../analysis';
import { describeDtc } from '../obd/dtc';
import { formatDate } from '../format';
import { SCAN_LABELS, type SavedScan } from '../types';
import FindingList from '../components/FindingList.vue';

const props = defineProps<{ vehicleId: string; beforeId: string; afterId: string }>();

const vehicle = computed(() => state.vehicles.find((v) => v.id === props.vehicleId));
const before = ref<SavedScan | null>(null);
const after = ref<SavedScan | null>(null);
const loaded = ref(false);

onMounted(async () => {
    const scans = await db.scans(props.vehicleId);
    before.value = scans.find((s) => s.id === props.beforeId) ?? null;
    after.value = scans.find((s) => s.id === props.afterId) ?? null;
    loaded.value = true;
});

const comparison = computed(() => (before.value && after.value ? compareScans(before.value, after.value) : null));

const rows = computed(() => {
    if (!before.value || !after.value) return [];
    const b = before.value.result;
    const a = after.value.result;
    return [
        { label: 'Voyant moteur', before: b.mil ? 'Allumé' : 'Éteint', after: a.mil ? 'Allumé' : 'Éteint' },
        { label: 'Codes confirmés', before: b.stored.length, after: a.stored.length },
        { label: 'Codes en attente', before: b.pending.length, after: a.pending.length },
        { label: 'Codes permanents', before: b.permanent.length, after: a.permanent.length },
        { label: 'Km depuis effacement', before: b.distanceSinceClear ?? '—', after: a.distanceSinceClear ?? '—' },
        { label: 'Démarrages depuis effacement', before: b.warmupsSinceClear ?? '—', after: a.warmupsSinceClear ?? '—' },
        {
            label: 'Autotests terminés',
            before: `${b.monitors.filter((m) => m.complete).length}/${b.monitors.length}`,
            after: `${a.monitors.filter((m) => m.complete).length}/${a.monitors.length}`
        },
        { label: 'Compteur', before: before.value.odometer ?? '—', after: after.value.odometer ?? '—' }
    ];
});

function printPage(): void {
    window.print();
}
</script>

<template>
    <template v-if="before && after && comparison">
        <button class="link no-print" @click="navigate({ name: 'vehicle', id: vehicleId })">← {{ vehicle?.name ?? 'Véhicule' }}</button>
        <h1>Comparaison</h1>
        <p class="small muted">
            {{ SCAN_LABELS[before.label] }} ({{ formatDate(before.date) }}) → {{ SCAN_LABELS[after.label] }} ({{ formatDate(after.date) }})
        </p>

        <h2>Verdict</h2>
        <FindingList :findings="comparison.findings" />

        <h2>Détail</h2>
        <div class="card table-wrap">
            <table>
                <thead>
                    <tr>
                        <th></th>
                        <th>Avant</th>
                        <th>Après</th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-for="row in rows" :key="row.label" :class="{ changed: row.before !== row.after }">
                        <th scope="row">{{ row.label }}</th>
                        <td>{{ row.before }}</td>
                        <td>{{ row.after }}</td>
                    </tr>
                </tbody>
            </table>
        </div>

        <template v-for="group in [
            { title: 'Disparus', codes: comparison.fixed, cls: 'ok' },
            { title: 'Toujours là', codes: comparison.persisting, cls: 'danger' },
            { title: 'Nouveaux', codes: comparison.appeared, cls: 'warning' }
        ]" :key="group.title">
            <div v-if="group.codes.length" class="card">
                <h3>{{ group.title }}</h3>
                <ul class="list">
                    <li v-for="code in group.codes" :key="code">
                        <span class="badge" :class="group.cls">{{ code }}</span> {{ describeDtc(code).description }}
                    </li>
                </ul>
            </div>
        </template>

        <button class="no-print" @click="printPage">Imprimer / PDF</button>
    </template>
    <p v-else-if="loaded" class="muted">Scans introuvables.</p>
</template>

<style scoped>
.table-wrap {
    overflow-x: auto;
    padding: 8px;
}

table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.9rem;
}

th,
td {
    text-align: left;
    padding: 8px;
    border-bottom: 1px solid var(--border);
}

tbody tr:last-child th,
tbody tr:last-child td {
    border-bottom: none;
}

thead th {
    color: var(--muted);
    font-size: 0.8rem;
}

tbody th {
    font-weight: 500;
}

.changed td {
    font-weight: 700;
}
</style>
