<script setup lang="ts">
// A text box with a 1 px edge (3.9:1), a ring on focus, and a visible caret instead of an I-beam. With a limit, the
// count appears near it, and past it the limit is named and nothing is cut (the handoff's state 20).
import { computed, useId } from 'vue';
import { limitState } from '../../../shared/text-limits';
import SIcon from './SIcon.vue';

const props = withDefaults(
  defineProps<{
    modelValue: string;
    /** A visible label; or `ariaLabel` when the box is labelled by its surroundings. */
    label?: string;
    ariaLabel?: string;
    placeholder?: string;
    rows?: number;
    limit?: number;
    hint?: string;
    mono?: boolean;
    disabled?: boolean;
  }>(),
  {
    label: undefined,
    ariaLabel: undefined,
    placeholder: undefined,
    rows: 3,
    limit: undefined,
    hint: undefined,
    mono: false,
    disabled: false,
  },
);
const emit = defineEmits<{ 'update:modelValue': [value: string]; submit: [] }>();

const id = useId();
const state = computed(() => (props.limit ? limitState(props.modelValue, props.limit) : null));
</script>

<template>
  <div class="field">
    <label v-if="label" class="label" :for="id">{{ label }}</label>
    <textarea
      :id="id"
      class="box"
      :class="{ mono }"
      :rows="rows"
      :value="modelValue"
      :placeholder="placeholder"
      :aria-label="label ? undefined : ariaLabel"
      :aria-describedby="`${id}-hint`"
      :aria-invalid="state && state.over > 0 ? true : undefined"
      :disabled="disabled"
      @input="emit('update:modelValue', ($event.target as HTMLTextAreaElement).value)"
      @keydown.ctrl.enter.prevent="emit('submit')"
    />
    <p :id="`${id}-hint`" class="hint">
      <template v-if="state?.message">
        <SIcon name="attention" :size="14" class="hint-icon" />
        <span>{{ state.message }}</span>
      </template>
      <span v-else-if="hint">{{ hint }}</span>
      <span v-if="state && (state.showCount || state.over > 0)" class="count num" :class="{ over: state.over > 0 }">
        {{ state.length.toLocaleString('en-US') }} / {{ state.limit.toLocaleString('en-US') }}
      </span>
    </p>
  </div>
</template>

<style scoped>
.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.label {
  color: var(--text-1);
  font: 600 12px/16px var(--font-sans);
}
.box {
  display: block;
  width: 100%;
  padding: 7px 10px;
  border: 1px solid var(--edge);
  border-radius: 6px;
  outline: none;
  background: var(--surface-1);
  color: var(--text-0);
  font: 400 14px/20px var(--font-sans);
  resize: none;
}
.box.mono {
  font: 400 13px/20px var(--font-mono);
}
.box::placeholder {
  color: var(--text-3);
}
.box:focus {
  border-color: var(--text-2);
  box-shadow:
    0 0 0 2px var(--surface-0),
    0 0 0 4px var(--focus);
}
.box:disabled {
  border-color: var(--line-2);
  background: transparent;
  color: var(--text-off);
}
.hint {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 16px;
  color: var(--text-2);
  font: 400 12px/16px var(--font-sans);
}
.hint-icon {
  color: var(--text-0);
}
.count {
  margin-left: auto;
  white-space: nowrap;
}
.count.over {
  color: var(--text-0);
  font-weight: 600;
}
</style>
