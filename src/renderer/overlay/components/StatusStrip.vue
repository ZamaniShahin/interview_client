<script setup lang="ts">
// What can be changed during a session: AUTO or MANUAL, pause, the interview's type (TECH or INTRO, Q47); and the
// minutes left and the tier. Controls that can't work right now are disabled, not hidden, so the strip never jumps.
// The type shows what the server last said: a click asks for the other one, and the switch flips on its echo.
import SButton from '../../shared/components/SButton.vue';
import SIcon from '../../shared/components/SIcon.vue';
import SSegmented from '../../shared/components/SSegmented.vue';
import { InterviewTypes } from '../../../shared/contracts/sotto-contracts';
import type { InterviewType, Tier } from '../../../shared/live/view-state';

defineProps<{
  auto: boolean;
  autoAvailable: boolean;
  paused: boolean;
  interviewType: InterviewType;
  disabled: boolean;
  minutesLeft: number | null;
  tier: Tier | null;
}>();
const emit = defineEmits<{ setAuto: [auto: boolean]; togglePause: []; setInterviewType: [type: InterviewType] }>();
</script>

<template>
  <div class="strip">
    <SSegmented
      :model-value="auto && autoAvailable ? 'auto' : 'manual'"
      :options="[
        { value: 'auto', label: 'AUTO', disabled: !autoAvailable },
        { value: 'manual', label: 'MANUAL' },
      ]"
      label="Answer mode"
      size="sm"
      :disabled="disabled"
      @update:model-value="(v) => emit('setAuto', v === 'auto')"
    />
    <SButton
      v-if="paused"
      variant="secondary"
      size="sm"
      icon="play"
      aria-label="Resume"
      :disabled="disabled"
      @click="emit('togglePause')"
      ><span class="word">Resume</span></SButton
    >
    <SButton
      v-else
      variant="ghost"
      size="sm"
      icon="pause"
      aria-label="Pause"
      :disabled="disabled"
      @click="emit('togglePause')"
      ><span class="word">Pause</span></SButton
    >
    <SSegmented
      :model-value="interviewType"
      :options="[
        { value: InterviewTypes.Technical, label: 'TECH' },
        { value: InterviewTypes.Intro, label: 'INTRO' },
      ]"
      label="Interview type"
      size="sm"
      :disabled="disabled"
      @update:model-value="(v) => v !== interviewType && emit('setInterviewType', v)"
    />
    <span class="spacer" />
    <template v-if="minutesLeft !== null">
      <span class="stat num" :class="{ on: minutesLeft <= 10 }">{{ minutesLeft }} min</span>
      <span class="sep" />
    </template>
    <span v-if="tier === 'fast'" class="stat tier"><SIcon name="bolt" :size="14" />Fast</span>
    <span v-else-if="tier === 'smart'" class="stat tier">Smart</span>
  </div>
</template>

<style scoped>
.strip {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 36px;
  padding: 0 8px 0 10px;
  flex: none;
  border-bottom: 1px solid var(--line);
  container-type: inline-size;
}
/* At the overlay's narrowest (360 px) every control still fits: Pause and Resume show their icon only, and the tier,
   which nothing on the strip changes, goes. */
@container (max-width: 440px) {
  .word,
  .tier {
    display: none;
  }
}
.stat {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 24px;
  padding: 0 6px;
  color: var(--text-2);
  font: 500 12px/16px var(--font-sans);
  white-space: nowrap;
}
.stat.on {
  color: var(--text-0);
}
.sep {
  width: 1px;
  height: 16px;
  background: var(--line-2);
}
</style>
