<script setup lang="ts">
// Help: the setup again (F1), and Test hiding on its own.
import SButton from '../../shared/components/SButton.vue';
import { useAppStore } from '../app-store';

const store = useAppStore();
</script>

<template>
  <section class="page" aria-labelledby="help-title">
    <h1 id="help-title" class="title">Help</h1>
    <div class="row">
      <div class="main">
        <p class="name">Run the setup again</p>
        <p class="small">What goes where, sign-in, your documents, the sound check, the hotkeys and Test hiding.</p>
      </div>
      <SButton size="sm" @click="store.openSetup('full')">Run the setup</SButton>
    </div>
    <div class="row">
      <div class="main">
        <p class="name">Test hiding</p>
        <p class="small">Check with a real screen share that Sotto is left out of it.</p>
      </div>
      <SButton size="sm" icon="shield" @click="store.openSetup('hiding')">Test hiding</SButton>
    </div>
  </section>
</template>

<style scoped>
.page {
  max-width: 720px;
}
.title {
  margin-bottom: 12px;
  color: var(--text-0);
  font: 600 24px/32px var(--font-sans);
}
.row {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 60px;
  border-bottom: 1px solid var(--line);
}
.main {
  flex: 1;
}
.name {
  color: var(--text-0);
  font: 600 14px/20px var(--font-sans);
}
</style>
