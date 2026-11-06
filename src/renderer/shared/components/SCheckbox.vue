<script setup lang="ts">
withDefaults(defineProps<{ modelValue: boolean; disabled?: boolean }>(), { disabled: false });
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>();
</script>

<template>
  <label class="check">
    <input
      type="checkbox"
      :checked="modelValue"
      :disabled="disabled"
      @change="emit('update:modelValue', ($event.target as HTMLInputElement).checked)"
    />
    <span><slot /></span>
  </label>
</template>

<style scoped>
.check {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  color: var(--text-1);
  font: 400 14px/20px var(--font-sans);
}
input {
  appearance: none;
  display: grid;
  place-content: center;
  width: 18px;
  height: 18px;
  margin: 1px 0 0;
  flex: none;
  border: 1px solid var(--edge);
  border-radius: 4px;
  background: var(--surface-1);
}
input:checked {
  border-color: var(--primary);
  background: var(--primary);
}
input:checked::after {
  content: '';
  width: 9px;
  height: 5px;
  margin-top: -2px;
  border: 2px solid var(--on-primary);
  border-top: 0;
  border-right: 0;
  transform: rotate(-45deg);
}
</style>
