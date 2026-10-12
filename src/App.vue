<script setup lang="ts">
import { onMounted } from 'vue';
import { initNavigation, refreshVehicles, state } from './store';
import ConnectionBar from './components/ConnectionBar.vue';
import DemoPanel from './components/DemoPanel.vue';
import Disclaimer from './components/Disclaimer.vue';
import HomeView from './views/HomeView.vue';
import VehicleView from './views/VehicleView.vue';
import ScanView from './views/ScanView.vue';
import ReportView from './views/ReportView.vue';
import CompareView from './views/CompareView.vue';
import LiveView from './views/LiveView.vue';

onMounted(() => {
    refreshVehicles();
    initNavigation();
});
</script>

<template>
    <ConnectionBar />
    <main>
        <DemoPanel />
        <HomeView v-if="state.route.name === 'home'" />
        <VehicleView v-else-if="state.route.name === 'vehicle'" :key="state.route.id" :vehicle-id="state.route.id" />
        <ScanView v-else-if="state.route.name === 'scan'" :vehicle-id="state.route.vehicleId" />
        <ReportView v-else-if="state.route.name === 'report'" :key="state.route.scanId" :vehicle-id="state.route.vehicleId" :scan-id="state.route.scanId" />
        <CompareView
            v-else-if="state.route.name === 'compare'"
            :vehicle-id="state.route.vehicleId"
            :before-id="state.route.beforeId"
            :after-id="state.route.afterId"
        />
        <LiveView v-else-if="state.route.name === 'live'" :vehicle-id="state.route.vehicleId" />
        <Disclaimer />
    </main>
</template>
