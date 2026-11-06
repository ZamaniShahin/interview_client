<script setup lang="ts">
// One answer in each of its endings (handoff §7.2, states 5 to 9): writing, done, stopped early, didn't finish,
// hidden. What it showed stays, except a hidden answer, whose text is already gone from the state.
import type { AnswerView } from '../../../shared/live/view-state';
import SButton from '../../shared/components/SButton.vue';
import SIcon from '../../shared/components/SIcon.vue';
import { ago } from '../../shared/use-now';
import AnswerBody from './AnswerBody.vue';
import HistoryPager from './HistoryPager.vue';
import KindBadge from './KindBadge.vue';

defineProps<{
  answer: AnswerView;
  position: number;
  total: number;
  lookingBack: boolean;
  /** A newer answer is writing while this older one is on screen. */
  newWriting: boolean;
  /** The position of the answer a newer question just stopped, to say where it is kept. */
  stoppedBefore: number | null;
  now: number;
  compact: boolean;
}>();
const emit = defineEmits<{ previous: []; next: []; live: []; retry: [] }>();
</script>

<template>
  <article class="card" :aria-label="`Answer ${position} of ${total}`">
    <header class="head">
      <h2 class="question">{{ answer.question }}</h2>
      <div v-if="!compact" class="meta">
        <KindBadge :kind="answer.kind" :instruction="answer.instruction" />
        <span v-if="answer.ending === 'writing'" class="writing"><span class="dot" />Writing…</span>
        <span v-else-if="answer.ending === 'stopped'" class="tag">Stopped early</span>
        <span v-else class="when">{{ ago(answer.startedAtMs, now) }}</span>
        <HistoryPager
          :position="position"
          :total="total"
          :looking-back="lookingBack"
          :new-writing="newWriting"
          @previous="emit('previous')"
          @next="emit('next')"
          @live="emit('live')"
        />
      </div>
      <p v-if="stoppedBefore !== null && !compact" class="when">
        The answer before stopped early. It is kept at {{ stoppedBefore }} of {{ total }}.
      </p>
    </header>

    <div v-if="answer.ending === 'hidden'" class="hidden" role="status">
      <SIcon name="hidden" />
      <span>This answer can't be shown. Try asking another way.</span>
    </div>
    <div v-else class="body" :class="{ dimmed: answer.ending === 'stopped' }">
      <AnswerBody :text="answer.text" :writing="answer.ending === 'writing'" />
      <div v-if="answer.ending === 'failed'" class="end" role="status">
        <SIcon name="attention" />
        <span>{{ answer.failureMessage || 'This answer stopped early.' }}</span>
        <SButton size="sm" class="retry" @click="emit('retry')">Try again</SButton>
      </div>
    </div>
  </article>
</template>

<style scoped>
.card {
  display: flex;
  flex: 1;
  min-height: 0;
  flex-direction: column;
  overflow: hidden;
}
.head {
  flex: none;
  padding: 10px 12px 8px;
}
.question {
  color: var(--text-0);
  font: 600 15px/22px var(--font-sans);
  user-select: text;
}
.meta {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 24px;
  margin-top: 6px;
}
.when {
  color: var(--text-3);
  font: 400 12px/16px var(--font-sans);
  white-space: nowrap;
}
p.when {
  margin-top: 6px;
}
.tag {
  height: 20px;
  padding: 0 6px;
  border: 1px solid var(--line-2);
  border-radius: 4px;
  background: var(--surface-2);
  color: var(--text-1);
  font: 500 11px/18px var(--font-sans);
}
.writing {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--text-3);
  font: 500 12px/16px var(--font-sans);
}
.writing .dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--text-2);
  animation: breathe 1.6s ease-in-out infinite;
}
@keyframes breathe {
  0%,
  100% {
    opacity: 0.3;
  }
  50% {
    opacity: 1;
  }
}
.body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 2px 12px 12px;
}
.dimmed :deep(.answer) {
  color: var(--text-2);
}
.end {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 2px 0 10px;
  padding: 8px 10px;
  border: 1px solid var(--line-2);
  border-radius: 8px;
  background: var(--surface-1);
  font: 400 13px/18px var(--font-sans);
}
.end > :first-child {
  color: var(--text-0);
}
.retry {
  margin-left: auto;
}
.hidden {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin: 4px 12px 12px;
  padding: 14px;
  border: 1px solid var(--line-2);
  border-radius: 8px;
  background: var(--surface-1);
  font: 400 14px/20px var(--font-sans);
}
.hidden > :first-child {
  margin-top: 2px;
  color: var(--text-0);
}
</style>
