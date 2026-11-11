<script setup lang="ts">
// An interview's debrief (3.9; the server's 3.4 job, v1's debrief panel): a summary, the scores the model gave, what
// went well and what to do better, stronger answers, follow-ups to expect, and a thank-you email to copy. Every part is
// the model's text, shown as text: nothing here is HTML.
import { computed, ref } from 'vue';
import type { DebriefView } from '../../../shared/history';
import SButton from '../../shared/components/SButton.vue';

const props = defineProps<{ debrief: DebriefView }>();

const scoreNames = {
  clarity: 'Clarity',
  structure: 'Structure',
  technical: 'Technical depth',
  delivery: 'Delivery',
  filler: 'Few filler words',
} as const;

const scores = computed(() =>
  props.debrief.scores
    ? (Object.keys(scoreNames) as (keyof typeof scoreNames)[])
        .map((key) => ({ name: scoreNames[key] as string, value: props.debrief.scores![key] }))
        .filter((s): s is { name: string; value: number } => s.value !== null)
    : [],
);

const metrics = computed(() => {
  const m = props.debrief.metrics;
  if (!m) return null;
  const words = m.words.toLocaleString('en-US');
  return `You said ${words} ${m.words === 1 ? 'word' : 'words'} in ${m.turns} ${m.turns === 1 ? 'turn' : 'turns'}, with ${m.fillersPer100Words.toFixed(1)} filler words in every 100.`;
});

const written = computed(() =>
  new Date(props.debrief.createdAt).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }),
);

const copied = ref(false);
function copyEmail(): void {
  window.appApi.copy(props.debrief.thankYouEmail);
  copied.value = true;
}
</script>

<template>
  <section class="debrief" aria-label="Debrief">
    <p class="eyebrow">Debrief · written {{ written }}</p>
    <p v-if="debrief.raw" class="small">The debrief came back without its parts: here it is as it was written.</p>
    <p class="summary">{{ debrief.summary }}</p>

    <ul v-if="scores.length > 0" class="scores" aria-label="Scores">
      <li v-for="score in scores" :key="score.name" class="score">
        <span class="small">{{ score.name }}</span>
        <b class="num">{{ score.value }}<span class="out">/10</span></b>
      </li>
    </ul>
    <p v-if="metrics" class="small">{{ metrics }}</p>

    <template v-if="debrief.strengths.length > 0">
      <h3 class="part">What went well</h3>
      <ul class="points">
        <li v-for="(point, i) in debrief.strengths" :key="i">{{ point }}</li>
      </ul>
    </template>

    <template v-if="debrief.improvements.length > 0">
      <h3 class="part">What to do better</h3>
      <ul class="points">
        <li v-for="(point, i) in debrief.improvements" :key="i">{{ point }}</li>
      </ul>
    </template>

    <template v-if="debrief.strongerAnswers.length > 0">
      <h3 class="part">Stronger answers</h3>
      <div v-for="(better, i) in debrief.strongerAnswers" :key="i" class="better">
        <p class="question">{{ better.question }}</p>
        <p class="text">{{ better.answer }}</p>
      </div>
    </template>

    <template v-if="debrief.followUps.length > 0">
      <h3 class="part">Questions to expect next</h3>
      <ul class="points">
        <li v-for="(question, i) in debrief.followUps" :key="i">{{ question }}</li>
      </ul>
    </template>

    <template v-if="debrief.thankYouEmail.trim()">
      <h3 class="part">A thank-you email</h3>
      <p class="text email">{{ debrief.thankYouEmail }}</p>
      <div class="actions">
        <SButton size="sm" icon="copy" @click="copyEmail">Copy the email</SButton>
        <span v-if="copied" class="small" role="status">Copied.</span>
      </div>
    </template>
  </section>
</template>

<style scoped>
.debrief {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 16px;
  border: 1px solid var(--line-2);
  border-radius: 8px;
  background: var(--surface-1);
}
.summary,
.text {
  color: var(--text-1);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.scores {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 4px 0;
  padding: 0;
  list-style: none;
}
.score {
  display: flex;
  flex-direction: column;
  min-width: 110px;
  padding: 8px 10px;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: var(--surface-2);
}
.score b {
  color: var(--text-0);
  font: 600 18px/24px var(--font-sans);
}
.out {
  color: var(--text-3);
  font-size: 12px;
  font-weight: 400;
}
.part {
  margin-top: 8px;
  color: var(--text-0);
  font: 600 14px/20px var(--font-sans);
}
.points {
  margin: 0;
  padding-left: 20px;
  color: var(--text-1);
}
.points li {
  margin-bottom: 4px;
}
.better {
  padding: 8px 0;
  border-top: 1px solid var(--line);
}
.question {
  color: var(--text-0);
  font-weight: 600;
}
.email {
  padding: 10px 12px;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: var(--surface-0);
}
.actions {
  display: flex;
  align-items: center;
  gap: 10px;
}
</style>
