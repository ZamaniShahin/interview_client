<script setup lang="ts">
// No plan yet (F9 · a): one button for the trial, as the catalog describes it. Once per person and per computer, and
// it needs a verified email (F2 · c); a refusal comes back as the problem above, in the server's words.
import { computed, ref } from 'vue';
import { trialLines, trialOffered } from '../../../shared/plan-words';
import SButton from '../../shared/components/SButton.vue';
import SIcon from '../../shared/components/SIcon.vue';
import { useAppStore } from '../app-store';

const emit = defineEmits<{ plans: [] }>();
const store = useAppStore();
const starting = ref(false);
const trial = computed(() => (store.account ? trialOffered(store.account) : null));
const lines = computed(() => (trial.value ? trialLines(trial.value) : []));

async function start(): Promise<void> {
  starting.value = true;
  try {
    await store.startTrial();
  } finally {
    starting.value = false;
  }
}
</script>

<template>
  <section v-if="trial" class="trial" aria-labelledby="trial-title">
    <h2 id="trial-title" class="h">Try Sotto in a real interview</h2>
    <p class="lede">
      The trial is free: {{ trial.days }} days and {{ trial.minutes ?? 0 }} minutes, with sessions up to
      {{ trial.maxSessionMinutes }} minutes and {{ trial.smart ? 'smart' : 'fast' }} answers. No card needed.
    </p>
    <ul class="lines">
      <li v-for="line in lines" :key="line"><SIcon name="check" />{{ line }}</li>
    </ul>
    <div class="actions">
      <SButton variant="primary" :disabled="starting" @click="start">Start the trial</SButton>
      <SButton variant="ghost" @click="emit('plans')">See the plans</SButton>
    </div>
    <p class="small">Once per person and per computer.</p>
  </section>
</template>

<style scoped>
.trial {
  padding: 16px;
  border: 1px solid var(--line-2);
  border-radius: var(--radius-card);
  background: var(--surface-1);
}
.h {
  color: var(--text-0);
  font: 600 15px/22px var(--font-sans);
}
.lede {
  margin-top: 4px;
  color: var(--text-1);
}
.lines {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 12px 0;
  padding: 0;
  list-style: none;
  font: 400 13px/18px var(--font-sans);
}
.lines li {
  display: flex;
  gap: 8px;
  color: var(--text-1);
}
.actions {
  display: flex;
  gap: 8px;
  margin-bottom: 8px;
}
</style>
