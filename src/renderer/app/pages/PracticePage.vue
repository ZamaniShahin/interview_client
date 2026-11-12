<script setup lang="ts">
// Practice (Shahin, 2026-11-12; the server's 3.3, v1's mock interview): Sotto asks, the user types the answer, and each
// answer gets a score and feedback, then a summary at the end. Drawn from the protocol and v1's flow on Sotto's own
// components until Claude Design's practice export is at hand (Q50), and redrawn from it then. The practice runs in
// main, in a session of its own that hears nothing; this page only draws it and forwards what the user asks.
import { computed } from 'vue';
import { useAppStore } from '../app-store';
import PracticeDone from '../components/PracticeDone.vue';
import PracticeRunning from '../components/PracticeRunning.vue';
import PracticeSetup from '../components/PracticeSetup.vue';

const store = useAppStore();
const view = computed(() => store.practice);
</script>

<template>
  <section class="page" aria-labelledby="practice-title">
    <h1 id="practice-title" class="title">Practice</h1>
    <PracticeSetup v-if="view.phase === 'idle'" />
    <PracticeDone v-else-if="view.phase === 'done'" :view="view" />
    <PracticeRunning v-else :view="view" />
  </section>
</template>

<style scoped>
.page {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.title {
  color: var(--text-0);
  font: 600 24px/32px var(--font-sans);
}
</style>
