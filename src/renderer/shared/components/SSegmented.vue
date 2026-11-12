<script setup lang="ts" generic="T extends string | number">
// Two to five choices, drawn in the window (a native dropdown's list is a separate window a share can see).
// The chosen one is raised, edged and brighter, never marked by color alone. Arrow keys move the choice.
const props = withDefaults(
  defineProps<{
    modelValue: T;
    options: { value: T; label: string; disabled?: boolean }[];
    /** The group's name, for screen readers. */
    label: string;
    size?: 'sm' | 'md';
    disabled?: boolean;
  }>(),
  { size: 'md', disabled: false },
);

const emit = defineEmits<{ 'update:modelValue': [value: T] }>();

function move(delta: number): void {
  const enabled = props.options.filter((o) => !o.disabled);
  const at = enabled.findIndex((o) => o.value === props.modelValue);
  const next = enabled[(at + delta + enabled.length) % enabled.length];
  if (next && !props.disabled) emit('update:modelValue', next.value);
}
</script>

<template>
  <div
    class="seg"
    :class="size"
    role="group"
    :aria-label="label"
    @keydown.left.prevent="move(-1)"
    @keydown.right.prevent="move(1)"
  >
    <button
      v-for="option in options"
      :key="String(option.value)"
      type="button"
      :aria-pressed="option.value === modelValue"
      :disabled="disabled || option.disabled"
      @click="emit('update:modelValue', option.value)"
    >
      {{ option.label }}
    </button>
  </div>
</template>

<style scoped>
.seg {
  display: inline-flex;
  flex: none;
  gap: 2px;
  padding: 2px;
  border-radius: var(--radius-control);
  background: var(--surface-2);
}
button {
  height: 28px;
  padding: 0 10px;
  border: 1px solid transparent;
  border-radius: var(--radius-chip);
  background: transparent;
  color: var(--text-2);
  font: 600 12px/16px var(--font-sans);
  white-space: nowrap;
  transition:
    background-color 150ms var(--ease-out),
    color 150ms var(--ease-out);
}
.sm button {
  height: 24px;
  padding: 0 8px;
  font-size: 11px;
  letter-spacing: 0.04em;
}
button:hover:not(:disabled) {
  color: var(--text-0);
}
button[aria-pressed='true'] {
  background: var(--selected);
  border-color: var(--line-2);
  color: var(--text-0);
  box-shadow:
    var(--shadow-1),
    inset 0 1px 0 var(--highlight);
}
button:disabled {
  color: var(--text-off);
}
button[aria-pressed='true']:disabled {
  background: transparent;
  box-shadow: none;
}
</style>
