<script setup lang="ts">
// Where sign-in stands when it isn't done, with the one action that moves it on. Signing in happens in the browser,
// and the app waits and says so (J3). Nothing shows once signed in.
import { ref } from 'vue';
import SBanner from '../../shared/components/SBanner.vue';
import SButton from '../../shared/components/SButton.vue';
import { useAppStore } from '../app-store';

const store = useAppStore();
const retrying = ref(false);

async function retry(): Promise<void> {
  retrying.value = true;
  try {
    await store.refresh();
  } finally {
    retrying.value = false;
  }
}
</script>

<template>
  <SBanner v-if="store.auth.status === 'signed-out'" tone="info">
    <b>Not signed in.</b> Signing in happens in your browser.
    <template #actions><SButton size="sm" external @click="store.signIn()">Sign in</SButton></template>
  </SBanner>
  <SBanner v-else-if="store.auth.status === 'signing-in'" tone="info">
    <b>Finish signing in in your browser.</b> Sotto carries on when you're done.
    <template #actions><SButton size="sm" variant="ghost" @click="store.cancelSignIn()">Cancel</SButton></template>
  </SBanner>
  <SBanner v-else-if="store.auth.status === 'expired'" tone="attention">
    <b>Your sign-in has ended.</b> Sign in again to carry on.
    <template #actions><SButton size="sm" external @click="store.signIn()">Sign in again</SButton></template>
  </SBanner>
  <SBanner v-else-if="store.auth.status === 'unreachable'" tone="attention">
    <b>Can't reach Sotto right now.</b> You're still signed in on this computer.
    <template #actions><SButton size="sm" :disabled="retrying" @click="retry">Try again</SButton></template>
  </SBanner>
</template>
