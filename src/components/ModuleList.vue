<script setup lang="ts">
import { computed } from 'vue';
import type { EcuReport, ExtDtc } from '../types';
import { moduleDtcs } from '../analysis';
import { describeDtc, describeFailureType } from '../obd/dtc';

const props = defineProps<{ modules: EcuReport[] }>();

const STANDARD_CODE = /^([PCBU][0-9A-F]{4})(-[0-9A-F]{2})?$/;

function line(dtc: ExtDtc) {
    const match = STANDARD_CODE.exec(dtc.code);
    return {
        code: dtc.code,
        // Description recalculée pour profiter des textes ajoutés depuis le scan (sauf codes VAG, déjà décrits).
        description: match ? describeDtc(match[1]).description : dtc.description,
        failure: describeFailureType(dtc.code),
        status: dtc.status
    };
}

function ignoredText(count: number): string {
    return count > 1
        ? `${count} autres codes listés par ce calculateur : leur test n'a pas encore été fait, ce ne sont pas des défauts.`
        : "1 autre code listé par ce calculateur : son test n'a pas encore été fait, ce n'est pas un défaut.";
}

// Les anciens scans nommaient « Calculateur 0x736 » les calculateurs inconnus.
function displayName(module: EcuReport): string {
    return module.name.replace(/^Calculateur (0x[0-9A-F]+)$/i, 'Calculateur non identifié ($1)');
}

const items = computed(() =>
    props.modules
        .map((module) => ({
            module,
            name: displayName(module),
            faults: moduleDtcs(module, 'defaut').map(line),
            history: moduleDtcs(module, 'historique').map(line),
            unsorted: moduleDtcs(module, 'non-trie').map(line),
            unreadable: module.dtcs.some((d) => d.code === '—')
        }))
        .sort((a, b) => b.faults.length - a.faults.length)
);
</script>

<template>
    <div v-for="{ module, name, faults, history, unsorted, unreadable } in items" :key="module.id" class="card">
        <div class="spread">
            <h3>{{ name }}</h3>
            <span v-if="faults.length" class="badge danger">{{ faults.length }} défaut{{ faults.length > 1 ? 's' : '' }}</span>
            <span v-else-if="unreadable" class="badge warning">Illisible</span>
            <span v-else-if="unsorted.length" class="badge warning">À revérifier</span>
            <span v-else class="badge ok">Aucun défaut</span>
        </div>
        <p class="small muted meta">
            <template v-if="!name.includes(module.id)">Adresse {{ module.id }} · </template>{{ module.protocol }}
            <template v-if="module.partNumber"> · réf. {{ module.partNumber }}</template>
        </p>

        <ul v-if="faults.length" class="list">
            <li v-for="dtc in faults" :key="dtc.code">
                <span class="code">{{ dtc.code }}</span> {{ dtc.description }}
                <div class="small muted">
                    <template v-if="dtc.failure">Nature : {{ dtc.failure }} · </template>{{ dtc.status }}
                </div>
            </li>
        </ul>
        <p v-if="unreadable" class="small muted">Ce calculateur a répondu mais n'a pas donné sa liste de codes.</p>

        <template v-if="history.length">
            <p class="small"><strong>Défauts passés</strong> : apparus depuis le dernier effacement, absents aujourd'hui.</p>
            <ul class="list">
                <li v-for="dtc in history" :key="dtc.code" class="small">
                    <span class="code">{{ dtc.code }}</span> {{ dtc.description }}
                    <template v-if="dtc.failure"> ({{ dtc.failure }})</template>
                </li>
            </ul>
        </template>

        <p v-if="module.ignored" class="small muted">{{ ignoredText(module.ignored) }}</p>

        <details v-if="unsorted.length" class="small">
            <summary>{{ unsorted.length }} code(s) à revérifier (scan fait avec une ancienne version)</summary>
            <p class="muted">
                L'ancienne version ne vérifiait pas si ces codes étaient de vrais défauts. Le plus souvent, ce sont des tests pas encore
                exécutés. Refaites un scan pour faire le tri.
            </p>
            <ul class="list">
                <li v-for="dtc in unsorted" :key="dtc.code"><span class="code">{{ dtc.code }}</span> {{ dtc.description }}</li>
            </ul>
        </details>
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

summary {
    cursor: pointer;
}
</style>
