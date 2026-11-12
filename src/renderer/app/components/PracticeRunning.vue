<script setup lang="ts">
// A practice running (J9, v1's mock flow): the question, the answer typed, the score and feedback, then the next
// question or, after the last, the results. While the server writes a question or scores an answer, the page says so
// and waits. An answer that couldn't be scored comes back to the box, to send again.
import { computed, ref, watch } from 'vue';
import { PracticeState, PracticeTurnKind } from '../../../shared/contracts/sotto-contracts';
import {
  difficultyLabels,
  practiceEndingText,
  practiceLimits,
  sourceLabels,
  type PracticeView,
} from '../../../shared/practice';
import SBanner from '../../shared/components/SBanner.vue';
import SButton from '../../shared/components/SButton.vue';
import STextArea from '../../shared/components/STextArea.vue';
import { useAppStore } from '../app-store';
import PracticeFeedback from './PracticeFeedback.vue';

const props = defineProps<{ view: PracticeView }>();
const store = useAppStore();

const draft = ref('');
const sending = ref(false);
const failure = ref<string | null>(null);

const status = computed(() => props.view.status);
/** The question on screen: the newest asked; none while the first is written. */
const turn = computed(() => props.view.turns.at(-1) ?? null);
const state = computed(() => (props.view.phase === 'starting' ? PracticeState.Preparing : status.value?.state));

// A new question starts with an empty box.
watch(
  () => turn.value?.n,
  () => {
    draft.value = '';
    failure.value = null;
  },
);

const writing = computed(() => state.value === PracticeState.Preparing || state.value === undefined);
const answering = computed(() => state.value === PracticeState.Answering && turn.value !== null);
const scoring = computed(() => state.value === PracticeState.Scoring && turn.value !== null);
const feedback = computed(() => (state.value === PracticeState.Feedback ? (turn.value?.feedback ?? null) : null));
const canSend = computed(
  () => draft.value.trim() !== '' && draft.value.length <= practiceLimits.answer && !sending.value,
);

/** "Question 2 of 5", or the follow-up to it. */
const where = computed(() => {
  const t = turn.value;
  if (!t || writing.value) return props.view.phase === 'starting' ? 'Starting…' : 'Practice';
  return t.kind === PracticeTurnKind.FollowUp
    ? `Follow-up to question ${t.mainN}`
    : `Question ${t.mainN} of ${t.total || status.value?.total || t.mainN}`;
});

async function run(ask: () => Promise<{ ok: boolean; message?: string }>): Promise<void> {
  sending.value = true;
  failure.value = null;
  try {
    const result = await ask();
    if (!result.ok) failure.value = result.message ?? 'That didn’t work. Try again.';
  } finally {
    sending.value = false;
  }
}

const send = () => (canSend.value ? run(() => store.answerPractice(draft.value)) : Promise.resolve());
const next = () => run(() => store.nextPractice());
const stop = () => run(() => store.stopPractice());
</script>

<template>
  <div class="running">
    <div class="bar">
      <p class="where">{{ where }}</p>
      <span v-if="turn && !writing && turn.kind === PracticeTurnKind.FollowUp" class="tag">Follow-up</span>
      <span v-if="status && !writing" class="tag">{{ difficultyLabels[status.difficulty] }}</span>
      <span class="spacer" />
      <span v-if="view.minutesLeft !== null" class="small num">{{ view.minutesLeft }} min left</span>
      <SButton variant="ghost" size="sm" icon="stop" :disabled="view.phase === 'starting' || sending" @click="stop">
        Stop practice
      </SButton>
    </div>

    <SBanner v-if="view.ending" tone="attention" icon="clock">
      {{ practiceEndingText(view.ending.reason, view.ending.secondsLeft) }}
    </SBanner>

    <template v-if="writing">
      <template v-if="status?.error">
        <p class="failure" role="alert">{{ status.error }}</p>
        <div class="actions">
          <SButton variant="primary" :disabled="sending" @click="next">Try again</SButton>
        </div>
      </template>
      <p v-else class="waiting" role="status">
        {{ turn ? 'Writing the next question…' : 'Writing the first question…' }}
      </p>
    </template>

    <template v-else-if="turn">
      <article class="question-card" aria-label="The question">
        <p class="eyebrow">{{ sourceLabels[turn.source] }}</p>
        <h2 class="question">{{ turn.question }}</h2>
      </article>

      <template v-if="answering">
        <STextArea
          v-model="draft"
          aria-label="Your answer"
          :rows="8"
          :limit="practiceLimits.answer"
          placeholder="Type your answer, as you would say it."
          hint="Ctrl+Enter sends it."
          @submit="send"
        />
        <p v-if="status?.error" class="failure" role="alert">{{ status.error }}</p>
        <div class="actions">
          <SButton variant="primary" :disabled="!canSend" @click="send">Send answer</SButton>
          <span v-if="draft.length > practiceLimits.scored" class="small">
            Only the first {{ practiceLimits.scored.toLocaleString('en-US') }} characters are scored.
          </span>
        </div>
      </template>

      <template v-else-if="scoring">
        <p class="sent">{{ draft }}</p>
        <p class="waiting" role="status">Scoring your answer…</p>
      </template>

      <template v-else-if="feedback">
        <div class="answered">
          <p class="eyebrow">Your answer</p>
          <p class="sent">{{ turn.answer }}</p>
        </div>
        <PracticeFeedback :feedback="feedback" />
        <div class="actions">
          <SButton variant="primary" :disabled="sending" @click="next">
            {{ status?.last ? 'See the results' : 'Next question' }}
          </SButton>
        </div>
      </template>
    </template>

    <p v-if="failure" class="failure" role="alert">{{ failure }}</p>
  </div>
</template>

<style scoped>
.running {
  display: flex;
  flex-direction: column;
  gap: 14px;
  max-width: 760px;
}
.bar {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 32px;
}
.where {
  color: var(--text-0);
  font-weight: 600;
}
.spacer {
  flex: 1;
}
.tag {
  padding: 2px 8px;
  border-radius: var(--radius-chip);
  background: var(--surface-2);
  color: var(--text-2);
  font-size: 12px;
}
.question-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 18px 20px;
  border: 1px solid var(--line);
  border-radius: var(--radius-card);
  background: var(--surface-1);
}
.question {
  color: var(--text-0);
  font: 600 18px/26px var(--font-sans);
  letter-spacing: -0.005em;
}
.answered {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.sent {
  color: var(--text-1);
  white-space: pre-wrap;
}
.waiting {
  color: var(--text-2);
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
