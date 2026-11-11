<script setup lang="ts">
// Prep drafts (3.9, the server's 3.4 job; v1's "draft answers"): likely questions with answers, written by the server
// from the résumé and the job description. Main holds them until each is kept in the answer bank or skipped; a kept
// one is an entry like any other, editable above.
import { computed, ref } from 'vue';
import { maxBankEntries } from '../../../shared/answer-bank';
import SButton from '../../shared/components/SButton.vue';
import { useAppStore } from '../app-store';

const store = useAppStore();
const drafts = computed(() => store.drafts);
const full = computed(() => store.preferences.bank.length >= maxBankEntries);
const failure = ref<{ target: number | 'write'; message: string } | null>(null);

async function write(): Promise<void> {
  failure.value = null;
  const result = await store.writeDrafts();
  if (!result.ok) failure.value = { target: 'write', message: result.message };
}

async function keep(id: number): Promise<void> {
  failure.value = null;
  const result = await store.keepDraft(id);
  if (!result.ok) failure.value = { target: id, message: result.message };
}

async function skip(id: number): Promise<void> {
  failure.value = null;
  await store.skipDraft(id);
}
</script>

<template>
  <section class="drafts" aria-label="Drafts">
    <div class="head">
      <div class="text">
        <p class="name">Drafts from your documents</p>
        <p class="small">
          Sotto writes likely questions with answers from your résumé and the job description. Keep the ones that sound
          like you: nothing goes into the bank until you do. Your plan counts each time you ask.
        </p>
      </div>
      <SButton v-if="drafts.writing" size="sm" disabled>Writing drafts…</SButton>
      <SButton v-else size="sm" :disabled="full" @click="write">
        {{ drafts.items.length > 0 ? 'Draft more' : 'Draft answers' }}
      </SButton>
    </div>
    <p v-if="failure?.target === 'write'" class="failure" role="alert">{{ failure.message }}</p>

    <ul v-if="drafts.items.length > 0" class="items" aria-label="Drafted answers">
      <li v-for="draft in drafts.items" :key="draft.id" class="item">
        <p class="question">{{ draft.phrasings[0] }}</p>
        <p v-if="draft.phrasings.length > 1" class="small">Also asked: {{ draft.phrasings.slice(1).join(' · ') }}</p>
        <p class="answer">{{ draft.answer }}</p>
        <div class="actions">
          <SButton
            size="sm"
            variant="primary"
            :disabled="full"
            :aria-label="`Keep “${draft.phrasings[0]}”`"
            @click="keep(draft.id)"
          >
            Keep
          </SButton>
          <SButton size="sm" variant="ghost" :aria-label="`Skip “${draft.phrasings[0]}”`" @click="skip(draft.id)">
            Skip
          </SButton>
        </div>
        <p v-if="failure?.target === draft.id" class="failure" role="alert">{{ failure.message }}</p>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.drafts {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid var(--line);
}
.head {
  display: flex;
  align-items: flex-start;
  gap: 16px;
}
.text {
  flex: 1;
  min-width: 0;
}
.name {
  color: var(--text-0);
  font-weight: 600;
}
.items {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 12px;
  border: 1px dashed var(--line-2);
  border-radius: 8px;
}
.question {
  color: var(--text-0);
  font-weight: 600;
}
.answer {
  color: var(--text-1);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.actions {
  display: flex;
  gap: 8px;
  margin-top: 4px;
}
.failure {
  color: var(--danger);
}
</style>
