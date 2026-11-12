<script setup lang="ts">
// A practice over (J9, v1's summary): the average, each question with its score, the best and the lowest, and up to
// three tips from the weakest answers. Then the two lowest again (Q22, "Retry the 2 lowest"), another practice, or the
// practice whole in History, where each answer's feedback is kept.
import { computed } from 'vue';
import { PracticeTurnKind } from '../../../shared/contracts/sotto-contracts';
import { difficultyLabels, focusLabels, lowestQuestions, type PracticeView } from '../../../shared/practice';
import SButton from '../../shared/components/SButton.vue';
import { useAppStore } from '../app-store';

const props = defineProps<{ view: PracticeView }>();
const store = useAppStore();

const summary = computed(() => props.view.summary);
const lowest = computed(() => (summary.value ? lowestQuestions(summary.value.turns) : []));
const answered = computed(() => props.view.turns.filter((t) => t.answer !== null).length);

function retry(): void {
  if (!summary.value || lowest.value.length === 0) return;
  void store.startPractice({ count: lowest.value.length, focus: summary.value.focus, questions: lowest.value });
}

const plural = (n: number, word: string) => `${n} ${n === 1 ? word : `${word}s`}`;
</script>

<template>
  <div class="done">
    <p v-if="view.problem" class="failure" role="alert">{{ view.problem.message }}</p>

    <template v-if="summary">
      <div class="card result" aria-label="Your result">
        <p class="eyebrow">Average</p>
        <p v-if="summary.average !== null" class="average">
          <span class="value num">{{ summary.average }}</span>
          <span class="of">/ 10</span>
        </p>
        <p v-else class="of">No answer was scored.</p>
        <p class="small">
          {{ summary.answered }} of {{ plural(summary.asked, 'question') }} answered ·
          {{ focusLabels[summary.focus] }} · ended on {{ difficultyLabels[summary.difficulty].toLowerCase() }}
        </p>
      </div>

      <ol class="turns" aria-label="Questions">
        <li v-for="turn in summary.turns" :key="turn.n" class="turn">
          <span class="n num">{{ turn.n }}</span>
          <span class="q">
            {{ turn.question }}
            <span v-if="turn.kind === PracticeTurnKind.FollowUp" class="tag">Follow-up</span>
          </span>
          <span v-if="turn.n === summary.best" class="tag">Best</span>
          <span v-else-if="turn.n === summary.worst" class="tag">Lowest</span>
          <span class="score num">{{ turn.answered ? (turn.score ?? '–') : 'Not answered' }}</span>
        </li>
      </ol>

      <div v-if="summary.tips.length > 0" class="tips">
        <p class="eyebrow">To work on</p>
        <ul class="points">
          <li v-for="(tip, i) in summary.tips" :key="i">{{ tip }}</li>
        </ul>
      </div>
    </template>

    <p v-else class="lede">
      The practice ended before its summary.
      {{
        answered > 0 ? `${plural(answered, 'answer')} and their feedback are kept in History.` : 'Nothing was answered.'
      }}
    </p>

    <div class="actions">
      <SButton v-if="lowest.length === 2" variant="primary" @click="retry">Retry the 2 lowest</SButton>
      <SButton :variant="lowest.length === 2 ? 'secondary' : 'primary'" @click="store.closePractice()">
        Practice again
      </SButton>
      <SButton v-if="view.historyId !== null" variant="ghost" @click="store.showInHistory(view.historyId)">
        See it in History
      </SButton>
    </div>
  </div>
</template>

<style scoped>
.done {
  display: flex;
  flex-direction: column;
  gap: 14px;
  max-width: 760px;
}
.card {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 18px 20px;
  border: 1px solid var(--line);
  border-radius: var(--radius-card);
  background: var(--surface-1);
}
.average {
  display: flex;
  align-items: baseline;
  gap: 6px;
}
.value {
  color: var(--text-0);
  font: 600 32px/36px var(--font-sans);
  letter-spacing: -0.01em;
}
.of {
  color: var(--text-2);
}
.turns {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.turn {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border: 1px solid var(--line);
  border-radius: var(--radius-control);
  background: var(--surface-1);
}
.n {
  width: 20px;
  color: var(--text-3);
  text-align: right;
}
.q {
  flex: 1;
  min-width: 0;
  color: var(--text-1);
}
.score {
  min-width: 28px;
  color: var(--text-0);
  font-weight: 600;
  text-align: right;
  white-space: nowrap;
}
.tag {
  flex: none;
  padding: 2px 8px;
  border-radius: var(--radius-chip);
  background: var(--surface-2);
  color: var(--text-2);
  font-size: 12px;
}
.tips {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.points {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 0;
  padding-left: 18px;
  color: var(--text-1);
}
.lede {
  color: var(--text-2);
}
.actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}
.failure {
  color: var(--danger);
}
</style>
