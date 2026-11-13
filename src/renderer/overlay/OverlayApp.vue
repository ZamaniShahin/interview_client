<script setup lang="ts">
// The overlay: the product. It works with no click at all; when clicked into, a ring shows it has the keyboard, and
// Esc gives the keyboard back to the call. Below 300 px tall it lays itself out compact: the bar and the answer.
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { AskMode } from '../../shared/contracts/sotto-contracts';
import type { CommandResult, OverlayHotkey } from '../../shared/ipc';
import { endedText, overlayBanner } from '../../shared/live/copy';
import type { InterviewType } from '../../shared/live/view-state';
import SButton from '../shared/components/SButton.vue';
import SConfirm from '../shared/components/SConfirm.vue';
import SIcon from '../shared/components/SIcon.vue';
import { useNow } from '../shared/use-now';
import { useSettings } from '../shared/use-settings';
import AnswerCard from './components/AnswerCard.vue';
import AskBar from './components/AskBar.vue';
import AttachmentTray from './components/AttachmentTray.vue';
import HeardPanel from './components/HeardPanel.vue';
import GapFillerLine from './components/GapFillerLine.vue';
import MoreMenu from './components/MoreMenu.vue';
import OverlayBanner from './components/OverlayBanner.vue';
import OverlayBar from './components/OverlayBar.vue';
import ResizeGrip from './components/ResizeGrip.vue';
import StatusStrip from './components/StatusStrip.vue';
import { useLiveStore } from './live-store';
import { effectiveHotkeys, hotkeyText } from '../../shared/hotkeys';
import type { MoreAction } from './more-actions';
import { keepScreenshotImages } from './use-screenshots';

const live = useLiveStore();
const { settings, update: updateSettings } = useSettings(window.overlayApi);
// The hotkeys in effect, named in the words that mention them (3.13).
const keys = computed(() => effectiveHotkeys(settings.value.hotkeys));
const triggerKey = computed(() => hotkeyText('trigger', keys.value));
const captureKey = computed(() => hotkeyText('capture', keys.value));
const now = useNow();

const hasKeyboard = ref(document.hasFocus());
const compact = ref(window.innerHeight < 300);
const menuOpen = ref(false);
const confirming = ref<'end' | 'startOver' | null>(null);

const s = computed(() => live.state);
const ended = computed(() => s.value.phase === 'ended');
const banner = computed(() => overlayBanner(s.value));
const controlsDisabled = computed(() => s.value.phase !== 'live');
/** MANUAL, or AUTO without the documents: answers come only when asked, and a screenshot waits for one. */
const manual = computed(() => !s.value.auto || !s.value.autoAvailable);
/** A screenshot under an answer can be attached again: a session runs, and the question has room. */
const canAttach = computed(() => s.value.phase === 'live' && s.value.attachments.ids.length < s.value.attachments.max);

const askBar = ref<InstanceType<typeof AskBar> | null>(null);
const capture = (hint: string | null): Promise<CommandResult> => live.command({ type: 'capture', hint });

/** A hotkey main hands over: the screenshot takes what the ask bar holds as its note. */
function onHotkey(hotkey: OverlayHotkey): void {
  if (hotkey !== 'capture' || ended.value) return;
  if (askBar.value) void askBar.value.captureNow();
  else void capture(null);
}

// The images the overlay holds are only those something on screen still names.
watch(
  () => [...s.value.attachments.ids, ...s.value.answers.flatMap((a) => a.screenshotIds)],
  (ids) => keepScreenshotImages(ids),
);

let stopListening: (() => void) | null = null;
let stopHotkeys: (() => void) | null = null;
const onFocus = () => (hasKeyboard.value = true);
const onBlur = () => (hasKeyboard.value = false);
const onResize = () => (compact.value = window.innerHeight < 300);

function onKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Escape') return;
  if (menuOpen.value) menuOpen.value = false;
  else if (confirming.value) confirming.value = null;
  else window.overlayApi.window({ type: 'releaseKeyboard' });
}

onMounted(async () => {
  window.addEventListener('focus', onFocus);
  window.addEventListener('blur', onBlur);
  window.addEventListener('resize', onResize);
  document.addEventListener('keydown', onKeydown);
  stopHotkeys = window.overlayApi.onHotkey(onHotkey);
  stopListening = await live.connect();
});

onBeforeUnmount(() => {
  window.removeEventListener('focus', onFocus);
  window.removeEventListener('blur', onBlur);
  window.removeEventListener('resize', onResize);
  document.removeEventListener('keydown', onKeydown);
  stopHotkeys?.();
  stopListening?.();
});

async function send(mode: AskMode, text: string): Promise<boolean> {
  const result = text
    ? await live.command({ type: 'ask', mode, text })
    : await live.command({ type: 'trigger', text: null });
  return result.ok;
}

function view(index: number | null): void {
  void live.command({ type: 'view', index });
}

/**
 * TECH or INTRO (Q47): asks the session for it, and keeps it as the user's choice for the next session. The strip
 * flips when the server says so (`Status`), not here.
 */
function setInterviewType(interviewType: InterviewType): void {
  void live.command({ type: 'setInterviewType', interviewType });
  void updateSettings({ interviewType });
}

const hide = () => window.overlayApi.window({ type: 'hide' });
const resize = (size: { width: number; height: number }) => window.overlayApi.window({ type: 'resize', ...size });

function onMore(action: MoreAction): void {
  menuOpen.value = false;
  if (action === 'startOver') confirming.value = 'startOver';
  else if (action === 'end') confirming.value = 'end';
  else if (action === 'compact') window.overlayApi.window({ type: 'compact', on: !compact.value });
  else window.overlayApi.window({ type: 'hide' });
}

function confirm(): void {
  if (confirming.value === 'end') void live.command({ type: 'endSession' });
  if (confirming.value === 'startOver') void live.command({ type: 'clear' });
  confirming.value = null;
}
</script>

<template>
  <main class="overlay" :class="{ 'has-keyboard': hasKeyboard }">
    <OverlayBar
      :phase="s.phase"
      :paused="s.paused"
      :listening="s.listening"
      :level="s.capture.level"
      :compact="compact"
      :menu-open="menuOpen"
      :minutes-left="s.minutesLeft"
      @toggle-compact="onMore('compact')"
      @toggle-menu="menuOpen = !menuOpen"
      @close="hide"
    />

    <StatusStrip
      v-if="!compact && !ended"
      :auto="s.auto"
      :auto-available="s.autoAvailable"
      :paused="s.paused"
      :interview-type="s.interviewType"
      :disabled="controlsDisabled"
      :minutes-left="s.minutesLeft"
      :tier="s.tier"
      @set-auto="(auto) => live.command({ type: 'setMode', auto, paused: null })"
      @toggle-pause="live.command({ type: 'setMode', auto: null, paused: !s.paused })"
      @set-interview-type="setInterviewType"
    />

    <MoreMenu
      v-if="menuOpen && !ended"
      :compact="compact"
      :text-size="settings.textSize"
      @select="onMore"
      @text-size="(textSize) => updateSettings({ textSize })"
      @close="menuOpen = false"
    />

    <div v-if="ended" class="ended" role="status">
      <SIcon name="stop" />
      <span
        ><b>{{ endedText(s.endReason) }}</b> Listening and answering have stopped.</span
      >
    </div>
    <OverlayBanner v-else-if="banner && !compact" :banner="banner">
      <SButton v-if="s.paused" size="sm" @click="live.command({ type: 'setMode', auto: null, paused: false })"
        >Resume</SButton
      >
    </OverlayBanner>

    <HeardPanel
      v-if="!compact && !ended"
      :finished="s.heard.finished"
      :live="s.heard.live"
      :pile="!s.auto || !s.autoAvailable"
      :placeholder="
        s.paused
          ? 'Not listening while paused.'
          : s.listening === 'down'
            ? 'Not hearing the call right now.'
            : 'Listening for the interviewer…'
      "
      :can-clear="!!(s.heard.finished || s.heard.live)"
      @clear="live.command({ type: 'clearHeard' })"
    />

    <!-- Outside the answer's scroll, so it shows even with an earlier answer scrolled down (v1's place for it). -->
    <GapFillerLine v-if="!compact && !ended" :text="s.gapFiller?.text ?? null" />

    <AnswerCard
      v-if="live.visible && live.visibleIndex !== null"
      :answer="live.visible"
      :position="live.visibleIndex + 1"
      :total="s.answers.length"
      :looking-back="live.lookingBack"
      :new-writing="live.newestWriting"
      :stopped-before="live.stoppedBefore"
      :now="now"
      :compact="compact"
      :can-attach="canAttach"
      @previous="view(live.visibleIndex - 1)"
      @next="view(live.visibleIndex + 1)"
      @live="view(null)"
      @retry="live.command({ type: 'trigger', text: null })"
      @attach="(id) => live.command({ type: 'reattachScreenshot', id })"
    />
    <p v-else-if="!ended" class="empty">
      <b>{{ s.phase === 'starting' ? 'Starting your session…' : 'Ready.' }}</b>
      {{
        s.phase === 'starting'
          ? 'A moment. There is nothing to do.'
          : `An answer appears here when a question ends. ${triggerKey} answers at any time.`
      }}
    </p>

    <template v-if="!compact">
      <div v-if="confirming" class="confirm-slot">
        <SConfirm
          v-if="confirming === 'end'"
          question="End the session?"
          detail="Minutes stop counting. The answers stay on screen until you close the overlay."
          confirm-label="End session"
          cancel-label="Keep going"
          @confirm="confirm"
          @cancel="confirming = null"
        />
        <SConfirm
          v-else
          question="Start over?"
          detail="Forgets what was heard, the answers on screen and what this interview has said so far. For a new interviewer or a new round."
          confirm-label="Start over"
          @confirm="confirm"
          @cancel="confirming = null"
        />
      </div>
      <div v-else-if="ended" class="ended-foot">
        <p class="small">The answers stay readable until you close this.</p>
        <SButton size="sm" @click="hide">Close</SButton>
      </div>
      <template v-else>
        <AttachmentTray
          v-if="s.attachments.ids.length > 0"
          :ids="s.attachments.ids"
          :max="s.attachments.max"
          :manual="manual"
          :trigger-key="triggerKey"
          @remove="(id) => live.command({ type: 'detachScreenshot', id })"
        />
        <AskBar
          ref="askBar"
          :send="send"
          :capture="capture"
          :disabled="s.phase === 'starting'"
          :waiting="s.phase === 'reconnecting'"
          :manual="manual"
          :attached="s.attachments.ids.length"
          :capture-key="captureKey"
        />
      </template>
    </template>

    <ResizeGrip @resize="resize" />
  </main>
</template>

<style scoped>
.overlay {
  position: relative;
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  /* The window's own corners, which its page draws (window.css): the edge follows them. */
  border-radius: var(--radius-window);
  background: var(--surface-0);
  box-shadow: inset 0 0 0 1px var(--line-2);
}
/* When the overlay has the keyboard, the whole window says so: typing goes here, not to the call. */
.overlay.has-keyboard {
  box-shadow: inset 0 0 0 2px var(--focus);
}
.empty {
  margin: auto 24px;
  color: var(--text-3);
  font: 400 14px/20px var(--font-sans);
  text-align: center;
}
.empty b {
  display: block;
  margin-bottom: 4px;
  color: var(--text-2);
  font-weight: 600;
}
.ended {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 10px 8px;
  padding: 8px 10px;
  flex: none;
  border-radius: 8px;
  background: var(--surface-2);
  font: 400 13px/18px var(--font-sans);
}
.ended b {
  color: var(--text-0);
  font-weight: 600;
}
.confirm-slot {
  flex: none;
  padding: 10px 12px 14px;
  border-top: 1px solid var(--line);
}
.ended-foot {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: none;
  padding: 10px 12px 14px;
  border-top: 1px solid var(--line);
}
.ended-foot .small {
  flex: 1;
}
</style>
