<script setup lang="ts">
import type { IconName } from '../icons';
import SIcon from './SIcon.vue';

// An icon-only button: its name is for screen readers (aria-label), never a tooltip (`title`), which a share can see.
withDefaults(
  defineProps<{ icon: IconName; label: string; expanded?: boolean; size?: 24 | 28; disabled?: boolean }>(),
  { expanded: undefined, size: 28, disabled: false },
);
</script>

<template>
  <button
    type="button"
    class="ib"
    :class="`s${size}`"
    :aria-label="label"
    :aria-expanded="expanded"
    :disabled="disabled"
  >
    <SIcon :name="icon" />
  </button>
</template>

<style scoped>
.ib {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  padding: 0;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--text-2);
}
.s28 {
  width: 28px;
  height: 28px;
}
.s24 {
  width: 24px;
  height: 24px;
}
.ib:hover:not(:disabled) {
  background: var(--surface-2);
  color: var(--text-0);
}
.ib[aria-expanded='true'] {
  background: var(--surface-3);
  color: var(--text-0);
}
.ib:disabled {
  color: var(--text-off);
}
</style>
