<script setup lang="ts">
// This computer can't be added: the account is at its device limit (F3 · a). The account's computers, to remove one
// in this one's place (one step on the server: Q25), or sign out instead. Nothing else works until then.
import { computed, ref } from 'vue';
import { removalConfirmation, removalRule } from '../../shared/device-words';
import { plural } from '../../shared/plan-words';
import SButton from '../shared/components/SButton.vue';
import { useAppStore } from './app-store';
import DeviceRow from './components/DeviceRow.vue';
import ProblemBanner from './components/ProblemBanner.vue';

const store = useAppStore();
const busy = ref(false);
const limit = computed(() => store.deviceLimit!);
const confirmWords = computed(() => removalConfirmation(limit.value.removals, new Date()));

async function replace(deviceId: string): Promise<void> {
  busy.value = true;
  try {
    await store.replaceDevice(deviceId);
  } finally {
    busy.value = false;
  }
}

async function signOut(): Promise<void> {
  busy.value = true;
  try {
    await store.signOut();
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <section class="limit" aria-labelledby="limit-title">
    <h1 id="limit-title" class="title">
      This account is on {{ plural(limit.devices.length, 'computer') }}, the most your plan allows
    </h1>
    <p class="lede">
      Remove one to use Sotto here. A removed computer is signed out and can't be added back.
      {{ removalRule(limit.removals) }}
    </p>
    <ProblemBanner class="gap" />
    <div class="card">
      <DeviceRow
        v-for="device in limit.devices"
        :key="device.id"
        :device="device"
        :can-remove="!busy && limit.removals.left > 0"
        :detail="confirmWords"
        @remove="replace"
      />
    </div>
    <p class="foot small">
      This computer: <b>{{ limit.thisComputer }}</b
      >, waiting to be added.
      <SButton size="sm" variant="ghost" :disabled="busy" @click="signOut">Sign out instead</SButton>
    </p>
  </section>
</template>

<style scoped>
.limit {
  max-width: 640px;
}
.title {
  margin-bottom: 6px;
  color: var(--text-0);
  font: 600 22px/30px var(--font-sans);
}
.lede {
  margin-bottom: 16px;
  color: var(--text-2);
}
.gap {
  margin-bottom: 16px;
}
.card {
  padding: 4px 16px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--surface-1);
}
.foot {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 16px;
}
</style>
