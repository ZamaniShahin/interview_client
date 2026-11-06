<script setup lang="ts">
// The overlay's top bar: where it is dragged (the window has no system frame), how the session is, and how
// listening is going. Every state has an icon or a dot, and a word.
import type { Listening, Phase } from '../../../shared/live/view-state';
import SIcon from '../../shared/components/SIcon.vue';
import SIconButton from '../../shared/components/SIconButton.vue';
import ListeningMeter from './ListeningMeter.vue';

defineProps<{ phase: Phase; paused: boolean; listening: Listening; compact: boolean; menuOpen: boolean; minutesLeft: number | null }>();
const emit = defineEmits<{ toggleCompact: []; toggleMenu: []; close: [] }>();
</script>

<template>
  <div class="bar drag-area">
    <span class="drag" aria-hidden="true"><SIcon name="drag" /></span>

    <span v-if="phase === 'ended'" class="state"><SIcon name="stop" :size="14" />Ended</span>
    <span v-else-if="phase === 'reconnecting'" class="state"><SIcon name="offline" :size="14" />Reconnecting…</span>
    <span v-else-if="phase === 'starting' || phase === 'idle'" class="state quiet"><span class="dot" />Starting…</span>
    <span v-else-if="paused" class="state"><SIcon name="pause" :size="14" />Paused</span>
    <span v-else class="state"><span class="dot" />Live</span>

    <template v-if="phase === 'live'">
      <span v-if="paused" class="stat"><ListeningMeter flat />Not listening</span>
      <span v-else-if="listening === 'reconnecting'" class="stat on"><SIcon name="reconnect" :size="14" />Listening: reconnecting…</span>
      <span v-else-if="listening === 'down'" class="stat on"><SIcon name="listeningDown" :size="14" />Listening is down</span>
      <span v-else class="stat"><ListeningMeter />Listening</span>
    </template>

    <span class="spacer" />
    <span v-if="compact && minutesLeft !== null" class="stat num">{{ minutesLeft }} min</span>

    <SIconButton v-if="phase === 'ended'" icon="close" label="Close" @click="emit('close')" />
    <template v-else>
      <SIconButton :icon="compact ? 'expand' : 'compact'" :label="compact ? 'Full view' : 'Compact view'" @click="emit('toggleCompact')" />
      <SIconButton icon="more" label="More" :expanded="menuOpen" @click="emit('toggleMenu')" />
    </template>
  </div>
</template>

<style scoped>
.bar {
  display: flex;
  align-items: center;
  gap: 2px;
  height: 36px;
  padding: 0 6px 0 2px;
  flex: none;
}
.drag {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 28px;
  flex: none;
  color: var(--text-3);
}
.state {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 0 6px;
  color: var(--text-0);
  font: 600 13px/16px var(--font-sans);
  white-space: nowrap;
}
.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--ok);
}
.quiet .dot {
  background: var(--text-3);
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
</style>
