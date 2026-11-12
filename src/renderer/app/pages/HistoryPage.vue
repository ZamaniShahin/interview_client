<script setup lang="ts">
// History (3.9; v1's history and its report): the interviews kept on this computer, newest first, and one opened
// whole: its debrief, its questions with the answers given, and the interviewer's words when transcripts are kept.
// A debrief is asked of the server here, and only here: it is the one time an interview leaves this computer.
// Practice sessions are kept here too, with their scores (Q24): one opens with each answer's feedback, and its two
// lowest can be practised again; any question an interviewer asked can be practised on its own (Q22).
import { computed, ref, watch } from 'vue';
import {
  AnswerKind,
  PracticeFocus,
  PracticeTurnKind,
  SessionEndReasons,
} from '../../../shared/contracts/sotto-contracts';
import type { InterviewSummary, InterviewView } from '../../../shared/history';
import { difficultyLabels, focusLabels, lowestQuestions, practiceLimits, sourceLabels } from '../../../shared/practice';
import SButton from '../../shared/components/SButton.vue';
import SConfirm from '../../shared/components/SConfirm.vue';
import { useAppStore } from '../app-store';
import DebriefView from '../components/DebriefView.vue';
import HistoryAnswer from '../components/HistoryAnswer.vue';
import PracticeFeedback from '../components/PracticeFeedback.vue';

const store = useAppStore();
const open = ref<InterviewView | null>(null);
const confirming = ref<'one' | 'all' | null>(null);
const failure = ref<string | null>(null);

async function show(id: number): Promise<void> {
  failure.value = null;
  confirming.value = null;
  open.value = await store.openInterview(id);
}

function back(): void {
  open.value = null;
  failure.value = null;
  confirming.value = null;
}

// Another page sent the user here to open one (Practice's "See it in History").
watch(
  () => store.historyToOpen,
  (id) => {
    if (id === null) return;
    store.historyToOpen = null;
    void show(id);
  },
  { immediate: true },
);

// History changed (an answer kept, a debrief written, one deleted): the interview open is read again.
watch(
  () => store.history,
  async () => {
    if (open.value) open.value = await store.openInterview(open.value.id);
  },
);

const writing = computed(() => (open.value ? store.debriefing.includes(open.value.id) : false));

async function debrief(): Promise<void> {
  if (!open.value) return;
  failure.value = null;
  const result = await store.debrief(open.value.id);
  if (!result.ok) failure.value = result.message;
}

async function remove(): Promise<void> {
  if (!open.value) return;
  const result = await store.deleteInterview(open.value.id);
  if (result.ok) back();
  else failure.value = result.message;
}

async function clear(): Promise<void> {
  const result = await store.clearHistory();
  confirming.value = null;
  if (!result.ok) failure.value = result.message;
}

const thisYear = new Date().getFullYear();
function when(ms: number): string {
  const date = new Date(ms);
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    ...(date.getFullYear() === thisYear ? {} : { year: 'numeric' }),
    hour: '2-digit',
    minute: '2-digit',
  });
}

function length(interview: InterviewSummary): string {
  if (interview.endedAt === null) return '';
  const minutes = Math.round((interview.endedAt - interview.startedAt) / 60_000);
  return minutes < 1 ? 'under a minute' : `${minutes} min`;
}

const name = (interview: InterviewSummary) =>
  interview.kind === 'practice'
    ? interview.role
      ? `Practice · ${interview.role}`
      : 'Practice'
    : interview.role || 'Interview';

function holds(interview: InterviewSummary): string {
  if (interview.kind === 'practice') {
    const answered = `${interview.answers} answered`;
    return interview.average !== null ? `${answered} · average ${interview.average}` : answered;
  }
  const answers = `${interview.answers} ${interview.answers === 1 ? 'answer' : 'answers'}`;
  return interview.lines > 0
    ? `${answers} · ${interview.lines} ${interview.lines === 1 ? 'line' : 'lines'} heard`
    : answers;
}

const endings: Record<string, string> = {
  [SessionEndReasons.CreditExhausted]: 'ended when the minutes ran out',
  [SessionEndReasons.MaxLength]: 'ended at the longest a session runs',
  [SessionEndReasons.Inactive]: 'ended after a quiet spell',
  [SessionEndReasons.OpenedElsewhere]: 'moved to another computer',
  [SessionEndReasons.CostLimit]: "ended at the session's limit",
  [SessionEndReasons.Expired]: 'ended when the connection was lost',
  [SessionEndReasons.Suspended]: 'ended when the account was suspended',
};

function about(interview: InterviewSummary): string {
  return [when(interview.startedAt), length(interview), endings[interview.endReason ?? ''] ?? '']
    .filter(Boolean)
    .join(' · ');
}

/** The questions an interviewer asked: the ones worth practising on their own. */
const askedByInterviewer = (kind: number) => kind === AnswerKind.Spoken || kind === AnswerKind.Typed;

function practiseQuestion(question: string): void {
  void store.startPractice({
    count: 1,
    focus: PracticeFocus.Mixed,
    questions: [question.trim().slice(0, practiceLimits.question)],
  });
}

/** A practice's two lowest-scored answers, from its summary, or from its feedback when it ended before one. */
const lowest = computed(() => {
  const practice = open.value?.practice;
  if (!practice) return [];
  const turns =
    practice.summary?.turns ??
    practice.turns.map((t) => ({
      n: t.n,
      question: t.question,
      score: t.feedback?.score ?? null,
      answered: t.answer !== null,
    }));
  return lowestQuestions(turns);
});

function retryLowest(): void {
  const practice = open.value?.practice;
  if (!practice || lowest.value.length === 0) return;
  void store.startPractice({ count: lowest.value.length, focus: practice.focus, questions: lowest.value });
}

const turnHeading = (t: { kind: number; mainN: number; difficulty: number; source: number }) =>
  [
    t.kind === PracticeTurnKind.FollowUp ? `Follow-up to question ${t.mainN}` : `Question ${t.mainN}`,
    difficultyLabels[t.difficulty as keyof typeof difficultyLabels],
    sourceLabels[t.source as keyof typeof sourceLabels],
  ].join(' · ');

const kinds: Record<number, string> = {
  [AnswerKind.Spoken]: 'Heard',
  [AnswerKind.Typed]: 'Typed',
  [AnswerKind.Tip]: 'Tip',
  [AnswerKind.Study]: 'Study',
  [AnswerKind.Result]: 'Result',
  [AnswerKind.Screen]: 'Screen',
};
</script>

<template>
  <section class="page" aria-labelledby="history-title">
    <template v-if="!open">
      <h1 id="history-title" class="title">History</h1>
      <p class="lede">
        Each interview, kept on this computer, encrypted: its questions and the answers they got, and the interviewer's
        words when you keep transcripts (Settings). A debrief is written only when you ask for one.
      </p>

      <p v-if="store.history.length === 0" class="empty">No interviews yet. Each session you run is kept here.</p>
      <ul v-else class="list" aria-label="Interviews">
        <li v-for="interview in store.history" :key="interview.id">
          <button
            type="button"
            class="row"
            :aria-label="`Open ${name(interview)}, ${when(interview.startedAt)}`"
            @click="show(interview.id)"
          >
            <span class="main">
              <span class="name">{{ name(interview) }}</span>
              <span class="small">{{ about(interview) }}</span>
            </span>
            <span class="small num">{{ holds(interview) }}</span>
            <span v-if="interview.kind === 'practice'" class="tag">Practice</span>
            <span v-if="store.debriefing.includes(interview.id)" class="tag">Writing debrief…</span>
            <span v-else-if="interview.hasDebrief" class="tag">Debrief</span>
          </button>
        </li>
      </ul>

      <template v-if="store.history.length > 0">
        <SConfirm
          v-if="confirming === 'all'"
          question="Delete all history?"
          :detail="`All ${store.history.length} interviews go from this computer, with their debriefs.`"
          confirm-label="Delete all"
          destructive
          @confirm="clear"
          @cancel="confirming = null"
        />
        <SButton v-else variant="ghost" size="sm" class="clear" @click="confirming = 'all'">Delete all history</SButton>
      </template>
      <p v-if="failure" class="failure" role="alert">{{ failure }}</p>
    </template>

    <template v-else>
      <SButton variant="ghost" size="sm" icon="chevronLeft" class="back" @click="back">All interviews</SButton>
      <h1 id="history-title" class="title">{{ name(open) }}</h1>
      <p class="small">
        {{ about(open) }}<template v-if="open.candidate"> · {{ open.candidate }}</template>
      </p>

      <div class="actions">
        <SButton v-if="writing" disabled>Writing your debrief…</SButton>
        <SButton v-else :variant="open.debrief ? 'secondary' : 'primary'" @click="debrief">
          {{ open.debrief ? 'Write the debrief again' : 'Get a debrief' }}
        </SButton>
        <SButton v-if="lowest.length === 2" variant="secondary" @click="retryLowest">Retry the 2 lowest</SButton>
        <SButton variant="ghost" @click="confirming = 'one'">Delete</SButton>
      </div>
      <p v-if="!open.debrief && !writing" class="small">
        The server reads its questions, answers and transcript once to write it, and keeps none of them. Your plan
        counts it as one debrief.
      </p>
      <SConfirm
        v-if="confirming === 'one'"
        question="Delete this interview?"
        detail="Its answers, transcript and debrief go from this computer."
        confirm-label="Delete"
        destructive
        @confirm="remove"
        @cancel="confirming = null"
      />
      <p v-if="failure" class="failure" role="alert">{{ failure }}</p>

      <DebriefView v-if="open.debrief" :debrief="open.debrief" />

      <template v-if="open.practice">
        <div v-if="open.practice.summary" class="summary">
          <p class="eyebrow">Average</p>
          <p class="average num">{{ open.practice.summary.average ?? '–' }} <span class="of">/ 10</span></p>
          <p class="small">
            {{ open.practice.summary.answered }} of {{ open.practice.summary.asked }} answered ·
            {{ focusLabels[open.practice.focus] }}
          </p>
          <template v-if="open.practice.summary.tips.length > 0">
            <p class="eyebrow tips">To work on</p>
            <ul class="points">
              <li v-for="(tip, i) in open.practice.summary.tips" :key="i">{{ tip }}</li>
            </ul>
          </template>
        </div>
        <h2 class="part">Questions</h2>
        <ol class="qa" aria-label="Practice questions">
          <li v-for="turn in open.practice.turns" :key="turn.n" class="exchange">
            <p class="eyebrow">{{ turnHeading(turn) }}</p>
            <p class="question">{{ turn.question }}</p>
            <p v-if="turn.answer !== null" class="said">{{ turn.answer }}</p>
            <p v-else class="small">Not answered.</p>
            <PracticeFeedback v-if="turn.feedback" :feedback="turn.feedback" class="turn-feedback" />
          </li>
        </ol>
      </template>

      <template v-else>
        <h2 class="part">Questions and answers</h2>
        <p v-if="open.qa.length === 0" class="small">No answers were kept.</p>
        <ol v-else class="qa" aria-label="Questions and answers">
          <li v-for="qa in open.qa" :key="qa.id" class="exchange">
            <p class="eyebrow">{{ kinds[qa.kind] ?? 'Answer' }}</p>
            <p class="question">{{ qa.question }}</p>
            <HistoryAnswer :text="qa.answer" />
            <SButton
              v-if="askedByInterviewer(qa.kind) && qa.question.trim() !== ''"
              variant="ghost"
              size="sm"
              class="practise"
              :aria-label="`Practice “${qa.question}”`"
              @click="practiseQuestion(qa.question)"
            >
              Practice this question
            </SButton>
          </li>
        </ol>
      </template>

      <template v-if="open.transcript.length > 0">
        <h2 class="part">What the interviewer said</h2>
        <ol class="lines" aria-label="Transcript">
          <li v-for="(line, i) in open.transcript" :key="i">{{ line.text }}</li>
        </ol>
      </template>
    </template>
  </section>
</template>

<style scoped>
.page {
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-width: 760px;
}
.title {
  color: var(--text-0);
  font: 600 24px/32px var(--font-sans);
}
.lede,
.empty {
  color: var(--text-2);
}
.list,
.qa,
.lines {
  margin: 0;
  padding: 0;
  list-style: none;
}
.list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.row {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--line-2);
  border-radius: 8px;
  background: var(--surface-1);
  color: var(--text-1);
  font: inherit;
  text-align: left;
}
.row:hover {
  background: var(--surface-3);
}
.main {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
}
.name {
  color: var(--text-0);
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.tag {
  flex: none;
  padding: 2px 8px;
  border-radius: var(--radius-card);
  background: var(--surface-2);
  color: var(--text-2);
  font-size: 12px;
}
.clear,
.back {
  align-self: flex-start;
}
.actions {
  display: flex;
  gap: 8px;
}
.failure {
  color: var(--danger);
}
.part {
  margin-top: 8px;
  color: var(--text-0);
  font: 600 16px/24px var(--font-sans);
}
.qa {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.exchange {
  padding-bottom: 16px;
  border-bottom: 1px solid var(--line);
}
.question {
  margin: 2px 0 6px;
  color: var(--text-0);
  font-weight: 600;
}
.lines li {
  padding: 4px 0;
  color: var(--text-1);
}
.summary {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 16px 18px;
  border: 1px solid var(--line);
  border-radius: var(--radius-card);
  background: var(--surface-1);
}
.average {
  color: var(--text-0);
  font: 600 28px/32px var(--font-sans);
  letter-spacing: -0.01em;
}
.of {
  color: var(--text-2);
  font: 400 14px/20px var(--font-sans);
  letter-spacing: 0;
}
.tips {
  margin-top: 8px;
}
.points {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 0;
  padding-left: 18px;
  color: var(--text-1);
}
.said {
  margin-bottom: 10px;
  color: var(--text-1);
  white-space: pre-wrap;
}
.turn-feedback {
  padding: 12px 14px;
  border: 1px solid var(--line);
  border-radius: var(--radius-control);
  background: var(--surface-1);
}
.practise {
  align-self: flex-start;
  margin-top: 6px;
}
.exchange {
  display: flex;
  flex-direction: column;
}
</style>
