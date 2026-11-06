<script setup lang="ts">
// How the question was asked: spoken, typed, a Tip with its note, Study, Result, or a screen (later phase).
import { computed } from 'vue';
import { AnswerKind } from '../../../shared/contracts/sotto-contracts';
import type { IconName } from '../../shared/icons';
import SIcon from '../../shared/components/SIcon.vue';

const props = defineProps<{ kind: AnswerKind; instruction: string | null }>();

const kinds: Record<AnswerKind, { icon: IconName; word: string }> = {
  [AnswerKind.Spoken]: { icon: 'spoken', word: 'Spoken' },
  [AnswerKind.Typed]: { icon: 'typed', word: 'Typed' },
  [AnswerKind.Tip]: { icon: 'tip', word: 'Tip' },
  [AnswerKind.Study]: { icon: 'study', word: 'Study' },
  [AnswerKind.Result]: { icon: 'result', word: 'Result' },
  [AnswerKind.Screen]: { icon: 'screen', word: 'Screen' },
};

const badge = computed(() => {
  const k = kinds[props.kind] ?? kinds[AnswerKind.Spoken];
  if (props.kind !== AnswerKind.Tip || !props.instruction) return k;
  const note = props.instruction.length > 24 ? `${props.instruction.slice(0, 23)}…` : props.instruction;
  return { ...k, word: `Tip: “${note}”` };
});
</script>

<template>
  <span class="kind"><SIcon :name="badge.icon" :size="12" />{{ badge.word }}</span>
</template>

<style scoped>
.kind {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 20px;
  padding: 0 6px;
  border: 1px solid var(--line-2);
  border-radius: 4px;
  color: var(--text-2);
  font: 500 11px/16px var(--font-sans);
  white-space: nowrap;
}
</style>
