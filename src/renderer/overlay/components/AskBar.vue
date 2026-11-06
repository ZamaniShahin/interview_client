<script setup lang="ts">
// Typing into the session: Question, Tip, Study or Result, and Answer. With nothing typed, Answer is the trigger: it
// answers what was heard, or the same question again. Over a mode's limit, the limit is named and nothing is cut.
import { computed, ref } from 'vue';
import { AskMode } from '../../../shared/contracts/sotto-contracts';
import { askLimits, limitState } from '../../../shared/text-limits';
import SButton from '../../shared/components/SButton.vue';
import SIcon from '../../shared/components/SIcon.vue';
import SSegmented from '../../shared/components/SSegmented.vue';

const props = withDefaults(
  defineProps<{
    /** Sends the text; resolves true when the server took it, so the box can be emptied. */
    send: (mode: AskMode, text: string) => Promise<boolean>;
    disabled?: boolean;
    /** The connection is gone: what is typed is kept, and Answer waits. */
    waiting?: boolean;
    /** MANUAL: Answer is the obvious next step, and says what it will answer. */
    manual?: boolean;
  }>(),
  { disabled: false, waiting: false, manual: false },
);

const mode = ref<AskMode>(AskMode.Question);
const text = ref('');
const sending = ref(false);

const modes = [
  { value: AskMode.Question, label: 'Question' },
  { value: AskMode.Tip, label: 'Tip' },
  { value: AskMode.Study, label: 'Study' },
  { value: AskMode.Result, label: 'Result' },
];

const placeholders: Record<AskMode, string> = {
  [AskMode.Question]: 'Type a question',
  [AskMode.Tip]: 'A note on the last answer, like “shorter”',
  [AskMode.Study]: 'A topic to study',
  [AskMode.Result]: 'Paste what the code printed, or its error',
};

const hints: Record<AskMode, string> = {
  [AskMode.Question]: '',
  [AskMode.Tip]: 'Rewrites the last answer.',
  [AskMode.Study]: 'A longer explainer, for preparing.',
  [AskMode.Result]: "What running the last answer's code printed.",
};

const limit = computed(() => limitState(text.value, askLimits[mode.value]));
const canSend = computed(() => !props.disabled && !props.waiting && !sending.value && limit.value.over === 0);
const label = computed(() => (props.manual && !text.value.trim() ? 'Answer what was heard' : 'Answer'));

async function submit(): Promise<void> {
  if (!canSend.value) return;
  sending.value = true;
  try {
    if (await props.send(mode.value, text.value.trim())) text.value = '';
  } finally {
    sending.value = false;
  }
}
</script>

<template>
  <div class="ask">
    <SSegmented v-model="mode" :options="modes" label="Ask mode" size="sm" :disabled="disabled" class="modes" />
    <div class="row">
      <textarea
        v-model="text"
        class="box"
        :class="{ mono: mode === AskMode.Result }"
        :rows="text.includes('\n') || text.length > 60 ? 3 : 1"
        :placeholder="disabled ? 'Ready in a moment' : placeholders[mode]"
        :aria-label="placeholders[mode]"
        aria-describedby="ask-hint"
        :aria-invalid="limit.over > 0 ? true : undefined"
        :disabled="disabled"
        @keydown.ctrl.enter.prevent="submit"
      />
      <SButton variant="primary" shortcut="Ctrl ⏎" :disabled="!canSend" @click="submit">{{ label }}</SButton>
    </div>
    <p id="ask-hint" class="hint" :class="{ empty: !limit.message && !waiting && !hints[mode] && !limit.showCount }">
      <template v-if="limit.message">
        <SIcon name="attention" :size="14" class="hint-icon" /><span>{{ limit.message }}</span>
      </template>
      <span v-else-if="waiting">Anything you type is kept. Answer works again once the connection is back.</span>
      <span v-else>{{ hints[mode] }}</span>
      <span v-if="limit.showCount || limit.over > 0" class="count num" :class="{ over: limit.over > 0 }">
        {{ limit.length.toLocaleString('en-US') }} / {{ limit.limit.toLocaleString('en-US') }}
      </span>
    </p>
  </div>
</template>

<style scoped>
.ask {
  flex: none;
  padding: 8px 12px 14px 10px;
  border-top: 1px solid var(--line);
  background: var(--surface-0);
}
.modes {
  margin-bottom: 8px;
}
.row {
  display: flex;
  align-items: flex-end;
  gap: 8px;
}
.box {
  flex: 1;
  min-height: 36px;
  max-height: 96px;
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
}
.hint {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 6px;
  color: var(--text-2);
  font: 400 12px/16px var(--font-sans);
}
.hint.empty {
  display: none;
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
