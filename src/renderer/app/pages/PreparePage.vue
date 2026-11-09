<script setup lang="ts">
// Prepare (F14): the documents answers are grounded in, each counted against its limit and edited in place. They stay
// on this computer, encrypted, and go to the server only with a session (main sends them as `SetContext`).
// Instructions and the answer bank come with the later phase; so does the prep doc, which no command can send yet.
import { computed, ref } from 'vue';
import { fieldLimits, type DocumentField } from '../../../shared/documents';
import { documentLimits, formatCount } from '../../../shared/text-limits';
import SButton from '../../shared/components/SButton.vue';
import SSegmented from '../../shared/components/SSegmented.vue';
import STextArea from '../../shared/components/STextArea.vue';
import { useAppStore } from '../app-store';

type Part = 'documents' | 'instructions' | 'bank';
const part = ref<Part>('documents');
const store = useAppStore();

const fields: { field: DocumentField; label: string; rows: number }[] = [
  { field: 'name', label: 'Name', rows: 1 },
  { field: 'resume', label: 'Résumé', rows: 10 },
  { field: 'jobDescription', label: 'Job description', rows: 10 },
  { field: 'notes', label: 'Notes', rows: 5 },
];

const editing = ref<DocumentField | null>(null);
const draft = ref('');
const saving = ref(false);
const failure = ref<string | null>(null);

const documents = computed(() => store.documents);
const firstLine = (text: string) =>
  text
    .split(/\r?\n/)
    .find((line) => line.trim() !== '')
    ?.trim() ?? '';
const tooLong = computed(() => editing.value !== null && draft.value.length > fieldLimits[editing.value]);

function edit(field: DocumentField): void {
  editing.value = field;
  draft.value = documents.value[field];
  failure.value = null;
}

async function save(): Promise<void> {
  const field = editing.value;
  if (!field || tooLong.value) return;
  saving.value = true;
  // Only spaces is nothing: the document goes.
  const result = await store.setDocument({ field, text: draft.value.trim() === '' ? '' : draft.value });
  saving.value = false;
  if (result.ok) editing.value = null;
  else failure.value = result.message;
}
</script>

<template>
  <section class="page" aria-labelledby="prepare-title">
    <div class="head">
      <h1 id="prepare-title" class="title">Prepare</h1>
      <SSegmented
        v-model="part"
        :options="[
          { value: 'documents', label: 'Documents' },
          { value: 'instructions', label: 'Instructions' },
          { value: 'bank', label: 'Answer bank' },
        ]"
        label="Part"
      />
    </div>
    <template v-if="part === 'documents'">
      <p class="lede">What answers are grounded in. Kept on this computer, encrypted; sent only for a session.</p>
      <div v-for="doc in fields" :key="doc.field" class="doc">
        <div class="row">
          <div class="main">
            <p class="name">{{ doc.label }}</p>
            <p class="small preview">{{ firstLine(documents[doc.field]) || 'Not added' }}</p>
          </div>
          <span class="small num">
            {{ formatCount(documents[doc.field].length) }} / {{ formatCount(fieldLimits[doc.field]) }}
          </span>
          <SButton
            v-if="editing !== doc.field"
            size="sm"
            :aria-label="`${documents[doc.field] ? 'Edit' : 'Add'} ${doc.label}`"
            @click="edit(doc.field)"
          >
            {{ documents[doc.field] ? 'Edit' : 'Add' }}
          </SButton>
        </div>
        <div v-if="editing === doc.field" class="editor">
          <STextArea
            v-model="draft"
            :aria-label="doc.label"
            :rows="doc.rows"
            :limit="fieldLimits[doc.field]"
            hint="Paste it, or type."
            @submit="save"
          />
          <p v-if="failure" class="failure" role="alert">{{ failure }}</p>
          <div class="actions">
            <SButton variant="ghost" size="sm" @click="editing = null">Cancel</SButton>
            <SButton variant="primary" size="sm" :disabled="saving || tooLong" @click="save">Save</SButton>
          </div>
        </div>
      </div>
      <div class="row lone">
        <div class="main">
          <p class="name">Prep doc</p>
          <p class="small">Not added. A longer document to draw on: a study guide, design notes. It comes later.</p>
        </div>
        <span class="small num">0 / {{ formatCount(documentLimits.prepDoc) }}</span>
        <SButton size="sm" disabled>Add</SButton>
      </div>
    </template>
    <p v-else class="lede">
      {{
        part === 'instructions'
          ? 'Your custom instructions, up to 4,000 characters.'
          : 'Prepared answers, each with the phrasings it answers.'
      }}
      They come with the later phase (F14).
    </p>
  </section>
</template>

<style scoped>
.page {
  max-width: 720px;
}
.head {
  display: flex;
  align-items: center;
  margin-bottom: 12px;
}
.title {
  flex: 1;
  color: var(--text-0);
  font: 600 24px/32px var(--font-sans);
}
.lede {
  margin-bottom: 12px;
  color: var(--text-2);
}
.doc {
  border-bottom: 1px solid var(--line);
}
.row {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 52px;
}
.lone {
  border-bottom: 1px solid var(--line);
}
.main {
  flex: 1;
  min-width: 0;
}
.preview {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.name {
  color: var(--text-0);
  font: 600 14px/20px var(--font-sans);
}
.editor {
  padding: 0 0 12px;
}
.failure {
  margin-top: 6px;
  color: var(--text-0);
  font: 400 13px/18px var(--font-sans);
}
.actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 8px;
}
</style>
