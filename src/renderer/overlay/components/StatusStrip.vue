<script setup lang="ts">
// What can be changed during a session: AUTO or MANUAL, pause; and the minutes left and the tier. Controls that can't
// work right now are disabled, not hidden, so the strip never jumps.
import SButton from '../../shared/components/SButton.vue';
import SIcon from '../../shared/components/SIcon.vue';
import SSegmented from '../../shared/components/SSegmented.vue';
import type { Tier } from '../../../shared/live/view-state';

defineProps<{
  auto: boolean;
  autoAvailable: boolean;
  paused: boolean;
  disabled: boolean;
  minutesLeft: number | null;
  tier: Tier | null;
}>();
const emit = defineEmits<{ setAuto: [auto: boolean]; togglePause: [] }>();
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
    <SButton v-if="paused" variant="secondary" size="sm" icon="play" :disabled="disabled" @click="emit('togglePause')">Resume</SButton>
    <SButton v-else variant="ghost" size="sm" icon="pause" :disabled="disabled" @click="emit('togglePause')">Pause</SButton>
    <span class="spacer" />
    <template v-if="minutesLeft !== null">
      <span class="stat num" :class="{ on: minutesLeft <= 10 }">{{ minutesLeft }} min</span>
      <span class="sep" />
    </template>
    <span v-if="tier === 'fast'" class="stat"><SIcon name="bolt" :size="14" />Fast</span>
    <span v-else-if="tier === 'smart'" class="stat">Smart</span>
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
