<script setup lang="ts">
// Starting a practice (J9): how many questions (1 to 10) and on what, before it begins. The server writes the questions
// from the résumé and the job description, so one of them is needed; the answer bank's enabled entries seed some of
// them, except with a technical focus.
import { computed, ref } from 'vue';
import { PracticeFocus } from '../../../shared/contracts/sotto-contracts';
import { focusLabels, practiceLimits } from '../../../shared/practice';
import SButton from '../../shared/components/SButton.vue';
import SSegmented from '../../shared/components/SSegmented.vue';
import SSlider from '../../shared/components/SSlider.vue';
import { useAppStore } from '../app-store';

const store = useAppStore();
const count = ref<number>(practiceLimits.defaultCount);
const focus = ref<PracticeFocus>(PracticeFocus.Mixed);
const starting = ref(false);

const focuses = [PracticeFocus.Mixed, PracticeFocus.Behavioral, PracticeFocus.Technical].map((value) => ({
  value,
  label: focusLabels[value],
}));

const focusWords: Record<PracticeFocus, string> = {
  [PracticeFocus.Mixed]: 'Behavioral and technical questions, mixed.',
  [PracticeFocus.Behavioral]: 'About how you work: situations, decisions, people.',
  [PracticeFocus.Technical]: "About the job's skills, tools and systems.",
};

const hasDocuments = computed(
  () => store.documents.resume.trim() !== '' || store.documents.jobDescription.trim() !== '',
);
const prepared = computed(() => store.preferences.bank.filter((entry) => entry.enabled).length);
const seeds = computed(() => {
  if (focus.value === PracticeFocus.Technical) return 'Your prepared answers are left out of a technical practice.';
  if (prepared.value === 0) return '';
  return prepared.value === 1
    ? 'Your prepared answer can come up as one of the questions.'
    : `Your ${prepared.value} prepared answers can come up: every other question is one of them.`;
});

async function start(): Promise<void> {
  starting.value = true;
  try {
    await store.startPractice({ count: count.value, focus: focus.value, questions: null });
  } finally {
    starting.value = false;
  }
}
</script>

<template>
  <p class="lede">
    A mock interview: Sotto asks, you type your answer, and each answer gets a score and feedback, then a summary at the
    end. A weak answer gets one follow-up; strong answers make the next question harder.
  </p>
  <div class="card">
    <div class="row">
      <span>Questions</span>
      <SSlider v-model="count" :min="practiceLimits.minCount" :max="practiceLimits.maxCount" label="Questions" />
    </div>
    <div class="row">
      <span>Focus</span>
      <SSegmented v-model="focus" :options="focuses" label="Focus" />
    </div>
    <p class="small">
      {{ focusWords[focus] }} The questions are written from your résumé and the job description.
      <template v-if="seeds">{{ seeds }}</template>
    </p>
    <p v-if="!hasDocuments" class="need" role="status">
      Add your résumé or the job description in Prepare first: the questions are written from them.
      <SButton variant="ghost" size="sm" @click="store.go('prepare')">Open Prepare</SButton>
    </p>
    <div class="actions">
      <SButton variant="primary" :disabled="!hasDocuments || starting" @click="start">Start practice</SButton>
      <span class="small">It runs as a session, counted at your plan's practice rate. Nothing is heard.</span>
    </div>
    <p v-if="store.practice.problem" class="failure" role="alert">{{ store.practice.problem.message }}</p>
  </div>
</template>

<style scoped>
.lede {
  max-width: 640px;
  color: var(--text-2);
}
.card {
  display: flex;
  flex-direction: column;
  gap: 14px;
  max-width: 640px;
  padding: 18px 20px;
  border: 1px solid var(--line);
  border-radius: var(--radius-card);
  background: var(--surface-1);
}
.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.row > span {
  color: var(--text-0);
  font-weight: 600;
}
.need {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  color: var(--text-1);
}
.actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
}
.failure {
  color: var(--danger);
}
</style>
