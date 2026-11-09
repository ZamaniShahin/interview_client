<script setup lang="ts">
// F1 · 4: the sound check. Play speech on this computer and see its words: proof that the interviewer will reach Sotto.
// It is a short live session, charged like any minute (Q12), so it starts only when asked, and leaving the step ends
// it (main/session/sound-check.ts). Continue never waits on it: no sound is a hint, not a wall.
import { computed, onBeforeUnmount, ref } from 'vue';
import SBanner from '../../shared/components/SBanner.vue';
import SButton from '../../shared/components/SButton.vue';
import { useNow } from '../../shared/use-now';
import ListeningMeter from '../../overlay/components/ListeningMeter.vue';
import { useAppStore } from '../app-store';
import SetupStep from './SetupStep.vue';

const emit = defineEmits<{ back: []; next: [] }>();
const store = useAppStore();
const now = useNow(1000);
const failure = ref<string | null>(null);

const view = computed(() => store.soundCheck);
const running = computed(() => view.value.phase === 'starting' || view.value.phase === 'live');
/** Hearing only once the session is live: until then the server has started nothing, and charged nothing. */
const headline = computed(() =>
  view.value.phase === 'live'
    ? "Hearing this computer's sound"
    : view.value.phase === 'starting'
      ? 'Starting the sound check…'
      : 'Not listening yet',
);

/** Only the newest words: a podcast runs on. */
const keep = 240;
const shown = computed(() => {
  const { finished, live } = view.value.heard;
  const room = Math.max(0, keep - live.length);
  return {
    finished: finished.length > room ? `…${finished.slice(finished.length - room)}` : finished,
    live: live.length > keep ? `…${live.slice(live.length - keep)}` : live,
  };
});

const elapsed = computed(() => {
  const started = view.value.startedAtMs;
  const seconds = started === null ? 0 : Math.max(0, Math.floor((now.value - started) / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
});

async function start(): Promise<void> {
  failure.value = null;
  const result = await store.startSoundCheck();
  if (!result.ok) failure.value = result.message;
}

function leave(to: 'back' | 'next'): void {
  void store.stopSoundCheck();
  if (to === 'back') emit('back');
  else emit('next');
}

onBeforeUnmount(() => void store.stopSoundCheck());
</script>

<template>
  <SetupStep
    heading="The sound check"
    lede="Play something with speech on this computer, a video or a podcast. Its words should appear below: that is how the interviewer will reach Sotto. Your microphone isn't used."
  >
    <div class="card">
      <div class="card-head">
        <ListeningMeter :level="view.level" :flat="!running" />
        <span>{{ headline }}</span>
        <span class="grow" />
        <span v-if="running" class="small num">{{ elapsed }}</span>
      </div>
      <p v-if="running" class="heard" aria-live="polite">
        {{ shown.finished }}
        <span class="live">{{ shown.live }}</span
        ><span class="caret" aria-hidden="true" />
      </p>
      <div v-else class="start">
        <SButton variant="primary" @click="start">Start the sound check</SButton>
        <p class="small">It runs as a short session, so it uses session minutes like one.</p>
      </div>
    </div>
    <SBanner v-if="view.heardSomething" tone="done">
      <strong>Sotto can hear it.</strong> The call's sound will reach it the same way.
    </SBanner>
    <SBanner v-else-if="view.down" tone="attention">Can't hear this computer's sound. Trying again…</SBanner>
    <SBanner v-else-if="view.problem || failure" tone="attention">{{ view.problem?.message ?? failure }}</SBanner>
    <template #foot>
      <SButton variant="ghost" @click="leave('back')">Back</SButton>
      <span class="spacer" />
      <span class="note">Nothing after 20 s? Check the sound plays on this computer, not on another device.</span>
      <SButton variant="primary" @click="leave('next')">Continue</SButton>
    </template>
  </SetupStep>
</template>

<style scoped>
.card {
  margin-bottom: 12px;
  border: 1px solid var(--line-2);
  border-radius: 8px;
  background: var(--surface-1);
}
.card-head {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 36px;
  padding: 0 12px;
  border-bottom: 1px solid var(--line);
  color: var(--text-1);
  font: 500 13px/18px var(--font-sans);
}
.grow {
  flex: 1;
}
.heard {
  min-height: 96px;
  padding: 12px;
  color: var(--text-1);
  font: 400 15px/22px var(--font-sans);
}
.live {
  color: var(--text-2);
}
.caret {
  display: inline-block;
  width: 2px;
  height: 1em;
  margin-left: 2px;
  vertical-align: -0.15em;
  background: var(--text-2);
}
.start {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px 12px;
}
</style>
