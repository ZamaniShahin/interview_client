<script setup lang="ts" generic="T extends string | number">
// Choices that don't fit a segmented control: a list drawn in the window, never a native select element (its popup
// is a separate window a share can see). Up and down move the choice; selected is marked by fill, weight and a tick.
import SIcon from './SIcon.vue';

const props = defineProps<{
  modelValue: T;
  options: { value: T; label: string; detail?: string }[];
  /** The list's name, for screen readers. */
  label: string;
}>();
const emit = defineEmits<{ 'update:modelValue': [value: T] }>();

function move(delta: number): void {
  const at = props.options.findIndex((o) => o.value === props.modelValue);
  const next = props.options[Math.min(Math.max(at + delta, 0), props.options.length - 1)];
  if (next) emit('update:modelValue', next.value);
}
</script>

<template>
  <div class="list" role="listbox" :aria-label="label" @keydown.up.prevent="move(-1)" @keydown.down.prevent="move(1)">
    <button
      v-for="option in options"
      :key="String(option.value)"
      type="button"
      role="option"
      class="option"
      :aria-selected="option.value === modelValue"
      :tabindex="option.value === modelValue ? 0 : -1"
      @click="emit('update:modelValue', option.value)"
    >
      <span class="text">
        <span>{{ option.label }}</span>
        <span v-if="option.detail" class="small">{{ option.detail }}</span>
      </span>
      <SIcon v-if="option.value === modelValue" name="check" class="tick" />
    </button>
  </div>
</template>

<style scoped>
.list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 4px;
  border: 1px solid var(--line-2);
  border-radius: var(--radius-card);
  background: var(--surface-1);
}
.option {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 36px;
  padding: 6px 10px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--text-1);
  font: 400 13px/18px var(--font-sans);
  text-align: left;
}
.option:hover {
  background: var(--surface-2);
  color: var(--text-0);
}
.option[aria-selected='true'] {
  background: var(--surface-3);
  color: var(--text-0);
  font-weight: 600;
}
.text {
  display: flex;
  flex: 1;
  flex-direction: column;
}
.tick {
  color: var(--text-0);
}
</style>
