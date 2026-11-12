<script setup lang="ts">
// A value along a range, drawn in the window: the browser's own range input, which opens nothing a share could see,
// restyled on the tokens. Arrow keys step it, and its value is said beside it, never only by the thumb's place.
import { computed } from 'vue';

const props = withDefaults(
  defineProps<{
    modelValue: number;
    min: number;
    max: number;
    step?: number;
    /** Its name, for screen readers. */
    label: string;
    /** Said after the value: '%'. */
    unit?: string;
    disabled?: boolean;
  }>(),
  { step: 1, unit: '', disabled: false },
);

const emit = defineEmits<{ 'update:modelValue': [value: number] }>();

/** How far along the track the value is, for the filled part. */
const fill = computed(() => `${((props.modelValue - props.min) / (props.max - props.min)) * 100}%`);

function changed(event: Event): void {
  emit('update:modelValue', Number((event.target as HTMLInputElement).value));
}
</script>

<template>
  <div class="slider" :class="{ disabled }">
    <input
      type="range"
      :min="min"
      :max="max"
      :step="step"
      :value="modelValue"
      :aria-label="label"
      :aria-valuetext="`${modelValue}${unit}`"
      :disabled="disabled"
      :style="{ '--fill': fill }"
      @input="changed"
    />
    <span class="value num" aria-hidden="true">{{ modelValue }}{{ unit }}</span>
  </div>
</template>

<style scoped>
.slider {
  display: inline-flex;
  align-items: center;
  gap: 10px;
}
input {
  width: 128px;
  height: 20px;
  margin: 0;
  background: transparent;
  appearance: none;
}
input::-webkit-slider-runnable-track {
  height: 4px;
  border-radius: 2px;
  background: linear-gradient(to right, var(--text-1) var(--fill), var(--surface-3) var(--fill));
}
input::-webkit-slider-thumb {
  width: 16px;
  height: 16px;
  margin-top: -6px;
  border: 1px solid var(--line-2);
  border-radius: 50%;
  background: var(--primary);
  box-shadow: var(--shadow-1);
  appearance: none;
  transition: transform 120ms var(--ease-out);
}
input:active::-webkit-slider-thumb {
  transform: scale(1.15);
}
input:focus-visible {
  outline: none;
}
input:focus-visible::-webkit-slider-thumb {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}
.value {
  min-width: 36px;
  color: var(--text-1);
  font: 600 12px/16px var(--font-sans);
  text-align: right;
}
.disabled {
  opacity: 0.5;
}
</style>
