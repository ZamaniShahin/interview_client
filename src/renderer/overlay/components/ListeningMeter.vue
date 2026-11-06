<script setup lang="ts">
// Four bars beside "Listening". Their heights follow the interviewer's level once capture reports it (1.11); until
// then they hold still. Flat and grey when nothing is being listened to.
import { computed } from 'vue';

const props = withDefaults(defineProps<{ level?: number | null; flat?: boolean }>(), { level: null, flat: false });

const heights = computed(() => {
  if (props.flat) return [3, 3, 3, 3];
  if (props.level === null) return [5, 9, 12, 7];
  const l = Math.min(Math.max(props.level, 0), 1);
  return [0.45, 0.75, 1, 0.6].map((f) => Math.max(3, Math.round(12 * l * f)));
});
</script>

<template>
  <span class="meter" :class="{ flat }" aria-hidden="true">
    <i v-for="(h, i) in heights" :key="i" :style="{ height: `${h}px` }" />
  </span>
</template>

<style scoped>
.meter {
  display: inline-flex;
  align-items: flex-end;
  gap: 2px;
  height: 12px;
  flex: none;
}
i {
  display: block;
  width: 3px;
  border-radius: 1px;
  background: var(--ok);
}
.flat i {
  background: var(--text-3);
}
</style>
