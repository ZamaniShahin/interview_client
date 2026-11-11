<script setup lang="ts">
// Custom instructions (3.8, F14): how every answer should be, in the user's words ("keep answers short", "mention my
// Kubernetes work"). Kept on this computer; sent with each session. They shape answers but never override the rules
// that keep answers honest (the server's, Q9).
import { computed, ref, watch } from 'vue';
import { maxInstructionsChars } from '../../../shared/answer-bank';
import { formatCount } from '../../../shared/text-limits';
import SButton from '../../shared/components/SButton.vue';
import STextArea from '../../shared/components/STextArea.vue';
import { useAppStore } from '../app-store';

const store = useAppStore();
const saved = computed(() => store.preferences.instructions);
const draft = ref(saved.value);
const saving = ref(false);
const failure = ref<string | null>(null);
const done = ref(false);
const changed = computed(() => draft.value !== saved.value);
const tooLong = computed(() => draft.value.length > maxInstructionsChars);

// What main keeps is what shows, unless the user has changed it meanwhile.
watch(saved, (next, previous) => {
  if (draft.value === previous) draft.value = next;
});

async function save(): Promise<void> {
  if (!changed.value || tooLong.value) return;
  saving.value = true;
  failure.value = null;
  // Only spaces is nothing: the instructions go.
  const result = await store.setInstructions(draft.value.trim() === '' ? '' : draft.value);
  saving.value = false;
  if (result.ok) done.value = true;
  else failure.value = result.message;
}
</script>

<template>
  <div class="instructions">
    <p class="lede">
      How every answer should be, in your words: "keep answers short", "mention my Kubernetes work". Kept on this
      computer; sent with each session. Up to {{ formatCount(maxInstructionsChars) }} characters.
    </p>
    <STextArea
      v-model="draft"
      aria-label="Custom instructions"
      :rows="8"
      :limit="maxInstructionsChars"
      @update:model-value="done = false"
      @submit="save"
    />
    <p v-if="failure" class="failure" role="alert">{{ failure }}</p>
    <div class="actions">
      <span v-if="done && !changed" class="small" role="status">Saved.</span>
      <SButton variant="ghost" size="sm" :disabled="!changed || saving" @click="draft = saved">Undo changes</SButton>
      <SButton variant="primary" size="sm" :disabled="!changed || saving || tooLong" @click="save">Save</SButton>
    </div>
  </div>
</template>

<style scoped>
.lede {
  margin-bottom: 12px;
  color: var(--text-2);
}
.failure {
  margin-top: 6px;
  color: var(--text-0);
  font: 400 13px/18px var(--font-sans);
}
.actions {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
}
.actions .small {
  margin-right: auto;
}
</style>
