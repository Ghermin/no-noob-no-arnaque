<script setup lang="ts">
import { computed } from 'vue';
import { connect, disconnect, elm, navigate, state } from '../store';
import { isWebBluetoothAvailable } from '../obd/transport';
import { isWebSerialAvailable } from '../obd/serial';
import { isWebUsbAvailable } from '../obd/usb';

const bluetooth = isWebBluetoothAvailable();
const usb = isWebSerialAvailable() || isWebUsbAvailable();
const connected = computed(() => elm.value !== null);
</script>

<template>
    <header class="bar no-print">
        <div class="inner">
            <button class="brand link" @click="navigate({ name: 'home' })">
                <span aria-hidden="true">🔧</span> No Noob No Arnaque
            </button>
            <div v-if="connected" class="row">
                <span class="badge ok" :title="elm?.protocolName">● {{ elm?.name }}</span>
                <button class="small-btn" @click="disconnect()">Déconnecter</button>
            </div>
            <div v-else class="row">
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
                <button class="small-btn" :disabled="state.connecting" @click="connect('demo')">Démo</button>
            </div>
        </div>
        <div v-if="state.connectionError" class="inner">
            <p class="error small">{{ state.connectionError }}</p>
        </div>
    </header>
</template>

<style scoped>
.bar {
    position: sticky;
    top: 0;
    z-index: 10;
    background: var(--surface);
    border-bottom: 1px solid var(--border);
}

.inner {
    max-width: 760px;
    margin: 0 auto;
    padding: 8px 16px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
}

.brand {
    font-weight: 800;
    color: var(--text);
    font-size: 1rem;
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
    margin: 0;
}
</style>
