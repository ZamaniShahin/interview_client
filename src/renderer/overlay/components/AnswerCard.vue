<script setup lang="ts">
// One answer in each of its endings (handoff §7.2, states 5 to 9): writing, done, stopped early, didn't finish,
// hidden. What it showed stays, except a hidden answer, whose text is already gone from the state. The user's own
// prepared answer (📌) stays even then: it is theirs, matched on this computer, never the model's.
//
// A long answer follows its newest line only while the reader is at the bottom (design.md). Scrolled up, they keep
// their place, and "New text below" offers the way back down.
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { AnswerView } from '../../../shared/live/view-state';
import SButton from '../../shared/components/SButton.vue';
import SIcon from '../../shared/components/SIcon.vue';
import { ago } from '../../shared/use-now';
import AnswerBody from './AnswerBody.vue';
import HistoryPager from './HistoryPager.vue';
import KindBadge from './KindBadge.vue';
import PreparedCard from './PreparedCard.vue';
import ScreenshotStrip from './ScreenshotStrip.vue';

const props = defineProps<{
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
  /** A screenshot the answer read can be attached again: a session runs, and the question has room. */
  canAttach?: boolean;
}>();
const emit = defineEmits<{ previous: []; next: []; live: []; retry: []; attach: [id: string] }>();

const body = ref<HTMLElement | null>(null);
/** At the bottom: what arrives scrolls into view. */
const following = ref(true);
/** Scrolled up while the answer grew below. */
const newBelow = ref(false);

/** Within a line of the bottom counts as at the bottom. */
const atBottom = (el: HTMLElement) => el.scrollHeight - el.scrollTop - el.clientHeight < 24;

function onScroll(): void {
  if (!body.value) return;
  following.value = atBottom(body.value);
  if (following.value) newBelow.value = false;
}

/** The answer grew: by its text, or by a diagram that finished drawing. */
function grew(): void {
  const el = body.value;
  if (!el) return;
  if (following.value) el.scrollTop = el.scrollHeight;
  else if (!atBottom(el)) newBelow.value = true;
}

function showNewText(): void {
  if (body.value) body.value.scrollTop = body.value.scrollHeight;
  following.value = true;
  newBelow.value = false;
}

watch(() => props.answer.text, grew, { flush: 'post' });

// Another answer on screen (looking back, or a new question): it starts at its top, followed.
watch(
  () => props.answer.id,
  () => {
    following.value = true;
    newBelow.value = false;
    if (body.value) body.value.scrollTop = 0;
  },
  { flush: 'post' },
);

let resizes: ResizeObserver | undefined;
onMounted(() => {
  const content = body.value?.firstElementChild;
  if (!content || typeof ResizeObserver === 'undefined') return;
  resizes = new ResizeObserver(grew);
  resizes.observe(content);
});
onBeforeUnmount(() => resizes?.disconnect());
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
      <ScreenshotStrip
        v-if="!compact && answer.screenshotIds.length > 0"
        :ids="answer.screenshotIds"
        :can-attach="canAttach ?? false"
        @attach="(id) => emit('attach', id)"
      />
    </header>

    <template v-if="answer.ending === 'hidden'">
      <div v-if="answer.prepared" class="kept">
        <PreparedCard :phrasing="answer.prepared.phrasing" :answer="answer.prepared.answer" />
      </div>
      <div class="hidden" role="status">
        <SIcon name="hidden" />
        <span>This answer can't be shown. Try asking another way.</span>
      </div>
    </template>
    <div v-else class="scroller">
      <div ref="body" class="body" :class="{ dimmed: answer.ending === 'stopped' }" @scroll.passive="onScroll">
        <!-- One element, so the observer below sees the answer grow, whether or not a prepared answer comes first. -->
        <div class="content">
          <PreparedCard v-if="answer.prepared" :phrasing="answer.prepared.phrasing" :answer="answer.prepared.answer" />
          <AnswerBody :text="answer.text" :writing="answer.ending === 'writing'" />
        </div>
        <div v-if="answer.ending === 'failed'" class="end" role="status">
          <SIcon name="attention" />
          <span>{{ answer.failureMessage || 'This answer stopped early.' }}</span>
          <SButton size="sm" class="retry" @click="emit('retry')">Try again</SButton>
        </div>
      </div>
      <SButton v-if="newBelow" size="sm" icon="arrowDown" class="below" @click="showNewText">New text below</SButton>
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
.scroller {
  position: relative;
  display: flex;
  flex: 1;
  min-height: 0;
  flex-direction: column;
}
.below {
  position: absolute;
  bottom: 14px;
  left: 50%;
  transform: translateX(-50%);
  box-shadow: var(--shadow-2);
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
.kept {
  margin: 4px 12px 0;
}
</style>
