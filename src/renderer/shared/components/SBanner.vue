<script setup lang="ts">
// A calm banner: an icon and plain words, an action when there is one. Never amber, never flashing.
import { computed } from 'vue';
import type { IconName } from '../icons';
import SIcon from './SIcon.vue';

const props = withDefaults(defineProps<{ tone?: 'info' | 'done' | 'attention'; icon?: IconName }>(), {
  tone: 'info',
  icon: undefined,
});
const iconName = computed<IconName>(() => props.icon ?? props.tone);
</script>

<template>
  <div class="banner" :class="tone" role="status">
    <SIcon :name="iconName" class="lead" />
    <span class="text"><slot /></span>
    <span v-if="$slots.actions" class="actions"><slot name="actions" /></span>
  </div>
</template>

<style scoped>
.banner {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--surface-2);
  color: var(--text-1);
  font: 400 13px/20px var(--font-sans);
}
.lead {
  margin-top: 2px;
  color: var(--text-0);
}
.done .lead {
  color: var(--ok);
}
.text {
  flex: 1;
}
.text :deep(b) {
  color: var(--text-0);
  font-weight: 600;
}
.actions {
  display: flex;
  flex: none;
  gap: 6px;
  align-self: center;
}
</style>
