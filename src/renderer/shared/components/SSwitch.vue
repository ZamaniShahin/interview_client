<script setup lang="ts">
withDefaults(
  defineProps<{ modelValue: boolean; label: string; description?: string; disabled?: boolean }>(),
  { description: undefined, disabled: false },
);
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>();
</script>

<template>
  <button
    type="button"
    role="switch"
    class="switch"
    :aria-checked="modelValue"
    :disabled="disabled"
    @click="emit('update:modelValue', !modelValue)"
  >
    <span class="text">
      <span class="label">{{ label }}</span>
      <span v-if="description" class="small">{{ description }}</span>
    </span>
    <span class="track" aria-hidden="true"><span class="knob" /></span>
  </button>
</template>

<style scoped>
.switch {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 0;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--text-1);
  text-align: left;
}
.text {
  display: flex;
  flex: 1;
  flex-direction: column;
}
.label {
  font: 400 14px/20px var(--font-sans);
}
.track {
  position: relative;
  width: 34px;
  height: 20px;
  flex: none;
  border: 1px solid var(--edge);
  border-radius: 999px;
  background: var(--surface-1);
}
.knob {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: var(--text-2);
  transition: left 120ms ease-out;
}
.switch[aria-checked='true'] .track {
  border-color: var(--primary);
  background: var(--primary);
}
.switch[aria-checked='true'] .knob {
  left: 17px;
  background: var(--on-primary);
}
.switch:disabled {
  color: var(--text-off);
}
.switch:disabled .track {
  border-color: var(--line-2);
}
</style>
