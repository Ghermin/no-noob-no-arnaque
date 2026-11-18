<script setup lang="ts">
import { computed } from 'vue';
import { connect, disconnect, elm, navigate, state } from '../store';
import { isWebBluetoothAvailable } from '../obd/transport';
import { isWebSerialAvailable } from '../obd/serial';
import { isWebUsbAvailable } from '../obd/usb';

const bluetooth = isWebBluetoothAvailable();
const usb = isWebSerialAvailable() || isWebUsbAvailable();
const connected = computed(() => elm.value !== null);
const logo = `${import.meta.env.BASE_URL}icon.svg`;
</script>

<template>
    <header class="pg-top no-print">
        <a class="pg-brand" href="./" @click.prevent="navigate({ name: 'home' })">
            <img :src="logo" alt="" width="36" height="36" />No Noob No Arnaque
        </a>
        <div class="tools">
            <template v-if="connected">
                <span class="badge ok" :title="elm?.protocolName">● {{ elm?.name }}</span>
                <button class="small-btn" @click="disconnect()">Déconnecter</button>
            </template>
            <template v-else-if="state.route.name !== 'home'">
                <span v-if="state.connecting" class="small muted">Connexion…</span>
                <template v-else>
                    <button
                        v-if="bluetooth || !usb"
                        class="small-btn primary"
                        :disabled="!bluetooth"
                        :title="'Adaptateur Bluetooth BLE'"
                        @click="connect('bluetooth')"
                    >
                        {{ usb ? 'Bluetooth' : 'Connecter' }}
                    </button>
                    <button v-if="usb" class="small-btn primary" title="Câble OBD USB" @click="connect('usb')">USB</button>
                </template>
            </template>
            <a class="pg-gh" href="https://github.com/Ghermin/no-noob-no-arnaque" target="_blank" rel="noopener">
                <svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z"/></svg>
                GitHub
            </a>
        </div>
    </header>
    <p v-if="state.connectionError && state.route.name !== 'home'" class="pg-wrap error small no-print" role="alert">{{ state.connectionError }}</p>
</template>

<style scoped>
.pg-top {
    flex-wrap: wrap;
}

.pg-brand {
    white-space: nowrap;
}

.tools {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
}

.small-btn {
    min-height: 36px;
    padding: 6px 12px;
    font-size: 0.875rem;
}

.badge {
    max-width: 160px;
    overflow: hidden;
    text-overflow: ellipsis;
}

.error {
    color: var(--danger);
    margin-block: 0 12px;
}

@media (max-width: 560px) {
    .pg-brand {
        font-size: 17px;
    }

    /* Sur téléphone, la place va aux boutons de connexion. */
    .small-btn ~ .pg-gh,
    .badge ~ .pg-gh {
        display: none;
    }
}
</style>
