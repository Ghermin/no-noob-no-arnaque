<script setup lang="ts">
import type { Finding } from '../analysis';
import { SEVERITY_LABELS } from '../format';

defineProps<{ findings: Finding[] }>();
</script>

<template>
    <div class="stack">
        <div v-for="(finding, i) in findings" :key="i" class="notice" :class="finding.severity">
            <div class="spread">
                <strong>{{ finding.title }}</strong>
                <span class="badge" :class="finding.severity">{{ SEVERITY_LABELS[finding.severity] }}</span>
            </div>
            <p class="small detail">{{ finding.detail }}</p>
        </div>
    </div>
</template>

<style scoped>
.notice {
    margin-bottom: 0;
}

.detail {
    margin: 4px 0 0;
}
</style>
