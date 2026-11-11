<script setup lang="ts">
// The answer bank (3.8, F14): the user's prepared answers, each with the ways its question gets asked. Enabled ones go
// with each session, and show at once (📌) when a question asked matches one; the order is the order the server fits
// them into its prompt. Kept on this computer.
import { computed, ref } from 'vue';
import {
  bankEntryProblem,
  maxAnswerChars,
  maxBankEntries,
  maxPhrasings,
  phrasingsOf,
  type BankEntry,
} from '../../../shared/answer-bank';
import { formatCount } from '../../../shared/text-limits';
import SButton from '../../shared/components/SButton.vue';
import SConfirm from '../../shared/components/SConfirm.vue';
import SSwitch from '../../shared/components/SSwitch.vue';
import STextArea from '../../shared/components/STextArea.vue';
import { useAppStore } from '../app-store';

const store = useAppStore();
const bank = computed(() => store.preferences.bank);
const enabled = computed(() => bank.value.filter((entry) => entry.enabled).length);

/** The entry being edited: its id, or 'new' for one being added. */
const editing = ref<string | 'new' | null>(null);
const questions = ref('');
const answer = ref('');
const enabledDraft = ref(true);
const saving = ref(false);
const failure = ref<{ target: string; message: string } | null>(null);
const deleting = ref<string | null>(null);

const problem = computed(() => bankEntryProblem(phrasingsOf(questions.value), answer.value));

function add(): void {
  editing.value = 'new';
  questions.value = '';
  answer.value = '';
  enabledDraft.value = true;
  failure.value = null;
}

function edit(entry: BankEntry): void {
  editing.value = entry.id;
  questions.value = entry.phrasings.join('\n');
  answer.value = entry.answer;
  enabledDraft.value = entry.enabled;
  failure.value = null;
}

async function save(): Promise<void> {
  const target = editing.value;
  if (!target || problem.value) return;
  saving.value = true;
  const result = await store.saveBankEntry({
    id: target === 'new' ? null : target,
    phrasings: phrasingsOf(questions.value),
    answer: answer.value,
    enabled: enabledDraft.value,
  });
  saving.value = false;
  if (result.ok) editing.value = null;
  else failure.value = { target, message: result.message };
}

/** On or off from the list: the entry as it is, with only that changed. */
async function toggle(entry: BankEntry, on: boolean): Promise<void> {
  failure.value = null;
  const result = await store.saveBankEntry({
    id: entry.id,
    phrasings: entry.phrasings,
    answer: entry.answer,
    enabled: on,
  });
  if (!result.ok) failure.value = { target: entry.id, message: result.message };
}

async function remove(id: string): Promise<void> {
  deleting.value = null;
  const result = await store.removeBankEntry(id);
  if (!result.ok) failure.value = { target: id, message: result.message };
}

const also = (entry: BankEntry) =>
  entry.phrasings.length > 1
    ? `Also asked as ${entry.phrasings.length - 1} other ${entry.phrasings.length === 2 ? 'way' : 'ways'}`
    : '';
</script>

<template>
  <div class="bank">
    <div class="intro">
      <p class="lede">
        Answers you prepared, each with the ways its question gets asked. When a question matches one, your answer shows
        at once. Enabled ones go with each session.
      </p>
      <span class="small num">{{ enabled }} enabled · {{ bank.length }} / {{ maxBankEntries }}</span>
    </div>

    <ul class="entries" aria-label="Prepared answers">
      <li v-for="entry in bank" :key="entry.id" class="entry">
        <template v-if="editing !== entry.id">
          <div class="row">
            <div class="main">
              <p class="question">{{ entry.phrasings[0] }}</p>
              <p class="small preview">{{ also(entry) || entry.answer }}</p>
            </div>
            <!-- The switch is a full-width settings row: here it gets a slot of its own, or it takes the question's room. -->
            <div class="toggle">
              <SSwitch
                :model-value="entry.enabled"
                :label="entry.enabled ? 'On' : 'Off'"
                @update:model-value="(on) => toggle(entry, on)"
              />
            </div>
            <SButton size="sm" :aria-label="`Edit “${entry.phrasings[0]}”`" @click="edit(entry)">Edit</SButton>
            <SButton
              size="sm"
              variant="ghost"
              :aria-label="`Delete “${entry.phrasings[0]}”`"
              @click="deleting = entry.id"
            >
              Delete
            </SButton>
          </div>
          <SConfirm
            v-if="deleting === entry.id"
            question="Delete this prepared answer?"
            :detail="`“${entry.phrasings[0]}” goes from this computer.`"
            confirm-label="Delete"
            destructive
            @confirm="remove(entry.id)"
            @cancel="deleting = null"
          />
          <p v-if="failure?.target === entry.id" class="failure" role="alert">{{ failure.message }}</p>
        </template>
        <div v-else class="editor">
          <STextArea
            v-model="questions"
            label="The question"
            :rows="3"
            :hint="`One per line: the question, then other ways it gets asked (up to ${maxPhrasings}).`"
          />
          <STextArea v-model="answer" label="Your answer" :rows="8" :limit="maxAnswerChars" @submit="save" />
          <SSwitch v-model="enabledDraft" label="Use it in sessions" />
          <p v-if="problem && (questions || answer)" class="small problem">{{ problem }}</p>
          <p v-if="failure?.target === entry.id" class="failure" role="alert">{{ failure.message }}</p>
          <div class="actions">
            <SButton variant="ghost" size="sm" @click="editing = null">Cancel</SButton>
            <SButton variant="primary" size="sm" :disabled="saving || problem !== null" @click="save">Save</SButton>
          </div>
        </div>
      </li>
    </ul>

    <p v-if="bank.length === 0 && editing !== 'new'" class="small empty">
      No prepared answers yet. Add the questions you expect, with the answer you want to give.
    </p>

    <div v-if="editing === 'new'" class="editor new">
      <STextArea
        v-model="questions"
        label="The question"
        :rows="3"
        :hint="`One per line: the question, then other ways it gets asked (up to ${maxPhrasings}).`"
      />
      <STextArea v-model="answer" label="Your answer" :rows="8" :limit="maxAnswerChars" @submit="save" />
      <SSwitch v-model="enabledDraft" label="Use it in sessions" />
      <p v-if="problem && (questions || answer)" class="small problem">{{ problem }}</p>
      <p v-if="failure?.target === 'new'" class="failure" role="alert">{{ failure.message }}</p>
      <div class="actions">
        <SButton variant="ghost" size="sm" @click="editing = null">Cancel</SButton>
        <SButton variant="primary" size="sm" :disabled="saving || problem !== null" @click="save">Save</SButton>
      </div>
    </div>
    <div v-else class="add">
      <SButton size="sm" icon="plus" :disabled="bank.length >= maxBankEntries || editing !== null" @click="add">
        Add a prepared answer
      </SButton>
      <span v-if="bank.length >= maxBankEntries" class="small">
        The bank is full: {{ formatCount(maxBankEntries) }} answers. Delete one to add another.
      </span>
    </div>
  </div>
</template>

<style scoped>
.intro {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 8px;
}
.lede {
  flex: 1;
  color: var(--text-2);
}
.entries {
  padding: 0;
  list-style: none;
}
.entry {
  border-bottom: 1px solid var(--line);
}
.row {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 56px;
}
.main {
  flex: 1;
  min-width: 0;
}
.toggle {
  flex: none;
  width: 76px;
}
.question {
  color: var(--text-0);
  font: 600 14px/20px var(--font-sans);
  overflow-wrap: anywhere;
}
.preview {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.editor {
  display: grid;
  gap: 10px;
  padding: 10px 0 12px;
}
.problem,
.failure {
  color: var(--text-0);
}
.failure {
  font: 400 13px/18px var(--font-sans);
}
.actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
.empty {
  padding: 16px 0;
}
.add {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 12px;
}
</style>
