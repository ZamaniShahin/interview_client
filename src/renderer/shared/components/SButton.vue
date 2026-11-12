<script setup lang="ts">
import type { IconName } from '../icons';
import SIcon from './SIcon.vue';

withDefaults(
  defineProps<{
    variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
    size?: 'sm' | 'md' | 'lg';
    icon?: IconName;
    /** Opens the browser (sign-in, checkout, billing): shown with the arrow-out icon, and said to screen readers. */
    external?: boolean;
    /** A key hint inside the button, such as "Ctrl ⏎". */
    shortcut?: string;
    disabled?: boolean;
  }>(),
  { variant: 'secondary', size: 'md', icon: undefined, external: false, shortcut: undefined, disabled: false },
);
</script>

<template>
  <button type="button" class="btn" :class="[variant, size]" :disabled="disabled">
    <SIcon v-if="external" name="external" :size="size === 'sm' ? 14 : 16" />
    <SIcon v-else-if="icon" :name="icon" :size="size === 'sm' ? 14 : 16" />
    <slot />
    <span v-if="shortcut" class="key">{{ shortcut }}</span>
    <span v-if="external" class="sr-only">(opens your browser)</span>
  </button>
</template>

<style scoped>
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 32px;
  padding: 0 12px;
  flex: none;
  border: 1px solid transparent;
  border-radius: var(--radius-control);
  background: transparent;
  color: var(--text-1);
  font: 600 13px/16px var(--font-sans);
  white-space: nowrap;
  transition:
    background-color 150ms var(--ease-out),
    border-color 150ms var(--ease-out),
    transform 100ms ease-out;
}
/* Pressed, it gives a little, at once (the apple-design skill's feedback). */
.btn:active:not(:disabled) {
  transform: var(--press);
}
.sm {
  height: 26px;
  padding: 0 8px;
  gap: 5px;
  font-size: 12px;
}
.lg {
  height: 40px;
  padding: 0 16px;
  font-size: 14px;
}
.primary {
  background: var(--primary);
  color: var(--on-primary);
  box-shadow:
    var(--shadow-1),
    inset 0 1px 0 var(--primary-highlight);
}
.primary:hover:not(:disabled) {
  background: var(--primary-hover);
}
.secondary {
  background: var(--surface-2);
  border-color: var(--line-2);
  color: var(--text-0);
  box-shadow: inset 0 1px 0 var(--highlight);
}
.secondary:hover:not(:disabled) {
  background: var(--surface-3);
}
.ghost:hover:not(:disabled) {
  background: var(--surface-2);
  color: var(--text-0);
}
.danger {
  border-color: var(--line-2);
  color: var(--danger);
}
.danger:hover:not(:disabled) {
  background: var(--surface-2);
}
.btn:disabled {
  background: transparent;
  border-color: var(--line);
  color: var(--text-off);
}
.primary:disabled {
  background: var(--surface-2);
  border-color: transparent;
  box-shadow: none;
}
.key {
  display: inline-flex;
  align-items: center;
  height: 18px;
  padding: 0 5px;
  border: 1px solid currentColor;
  border-radius: 4px;
  font: 500 11px/16px var(--font-sans);
  opacity: 0.72;
}
</style>
