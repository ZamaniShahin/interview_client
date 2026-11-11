<script setup lang="ts">
// Prepare (F14): the documents answers are grounded in, each counted against its limit and edited in place. They stay
// on this computer, encrypted, and go to the server only with a session (main sends them as `SetContext`, and the prep
// doc as `SetPrepDoc`). Each can be typed, pasted, or read from a file on this computer (3.10): the text read shows
// in the editor first, and nothing is kept until it is saved. Then the preferences (3.8): custom instructions and the
// answer bank.
import { computed, ref } from 'vue';
import { fieldLimits, type DocumentField, type ReadTarget } from '../../../shared/documents';
import { documentLimits, formatCount } from '../../../shared/text-limits';
import SButton from '../../shared/components/SButton.vue';
import SSegmented from '../../shared/components/SSegmented.vue';
import STextArea from '../../shared/components/STextArea.vue';
import { useAppStore } from '../app-store';
import AnswerBank from '../components/AnswerBank.vue';
import InstructionsEditor from '../components/InstructionsEditor.vue';

type Part = 'documents' | 'instructions' | 'bank';
const part = ref<Part>('documents');
const store = useAppStore();

const fields: { field: DocumentField; label: string; rows: number; fromFile: boolean }[] = [
  { field: 'name', label: 'Name', rows: 1, fromFile: false },
  { field: 'resume', label: 'Résumé', rows: 10, fromFile: true },
  { field: 'jobDescription', label: 'Job description', rows: 10, fromFile: true },
  { field: 'notes', label: 'Notes', rows: 5, fromFile: true },
];

const editing = ref<ReadTarget | null>(null);
const draft = ref('');
/** The prep doc's file name and whether it was cut, while it is being edited. */
const draftName = ref('');
const draftCut = ref(false);
const saving = ref(false);
const reading = ref<ReadTarget | null>(null);
/** What went wrong, and where: a save, or a file that couldn't be read. */
const failure = ref<{ target: ReadTarget; message: string } | null>(null);

const documents = computed(() => store.documents);
const prepDoc = computed(() => documents.value.prepDoc);
const firstLine = (text: string) =>
  text
    .split(/\r?\n/)
    .find((line) => line.trim() !== '')
    ?.trim() ?? '';
const limitOf = (target: ReadTarget) => (target === 'prepDoc' ? documentLimits.prepDoc : fieldLimits[target]);
const tooLong = computed(() => editing.value !== null && draft.value.length > limitOf(editing.value));

function edit(target: ReadTarget): void {
  editing.value = target;
  failure.value = null;
  if (target === 'prepDoc') {
    draft.value = prepDoc.value?.text ?? '';
    draftName.value = prepDoc.value?.name ?? '';
    draftCut.value = prepDoc.value?.cut ?? false;
  } else {
    draft.value = documents.value[target];
  }
}

/** A file the user picks, read on this computer: its text opens in the editor, to look over before it is kept. */
async function fromFile(target: ReadTarget): Promise<void> {
  failure.value = null;
  reading.value = target;
  try {
    const read = await store.readDocument(target);
    if (!read.ok) {
      // A cancelled pick says nothing.
      if (read.message) failure.value = { target, message: read.message };
      return;
    }
    editing.value = target;
    draft.value = read.text;
    draftName.value = read.name;
    draftCut.value = read.cut;
  } finally {
    reading.value = null;
  }
}

async function save(): Promise<void> {
  const target = editing.value;
  if (!target || tooLong.value) return;
  saving.value = true;
  // Only spaces is nothing: the document goes.
  const text = draft.value.trim() === '' ? '' : draft.value;
  const result =
    target === 'prepDoc'
      ? await store.setPrepDoc({ text, name: text ? draftName.value : '', cut: text !== '' && draftCut.value })
      : await store.setDocument({ field: target, text });
  saving.value = false;
  if (result.ok) editing.value = null;
  else failure.value = { target, message: result.message };
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
      <p class="lede">
        What answers are grounded in. Type it, paste it, or read it from a PDF or Word file. Kept on this computer,
        encrypted; only the text is sent, and only for a session.
      </p>
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
            v-if="doc.fromFile && editing !== doc.field"
            size="sm"
            variant="ghost"
            :disabled="reading !== null"
            :aria-label="`Read the ${doc.label.toLowerCase()} from a file`"
            @click="fromFile(doc.field)"
          >
            {{ reading === doc.field ? 'Reading…' : 'From a file' }}
          </SButton>
          <SButton
            v-if="editing !== doc.field"
            size="sm"
            :aria-label="`${documents[doc.field] ? 'Edit' : 'Add'} ${doc.label}`"
            @click="edit(doc.field)"
          >
            {{ documents[doc.field] ? 'Edit' : 'Add' }}
          </SButton>
        </div>
        <p v-if="failure?.target === doc.field && editing !== doc.field" class="failure" role="alert">
          {{ failure.message }}
        </p>
        <div v-if="editing === doc.field" class="editor">
          <STextArea
            v-model="draft"
            :aria-label="doc.label"
            :rows="doc.rows"
            :limit="fieldLimits[doc.field]"
            hint="Paste it, or type."
            @submit="save"
          />
          <p v-if="failure?.target === doc.field" class="failure" role="alert">{{ failure.message }}</p>
          <div class="actions">
            <SButton variant="ghost" size="sm" @click="editing = null">Cancel</SButton>
            <SButton variant="primary" size="sm" :disabled="saving || tooLong" @click="save">Save</SButton>
          </div>
        </div>
      </div>
      <div class="doc">
        <div class="row">
          <div class="main">
            <p class="name">Prep doc</p>
            <p class="small preview">
              <template v-if="prepDoc">{{ prepDoc.name || firstLine(prepDoc.text) }}</template>
              <template v-else>Not added. A longer document to draw on: a study guide, design notes.</template>
            </p>
          </div>
          <span class="small num">
            {{ formatCount(prepDoc?.text.length ?? 0) }} / {{ formatCount(documentLimits.prepDoc) }}
          </span>
          <SButton
            v-if="editing !== 'prepDoc'"
            size="sm"
            variant="ghost"
            :disabled="reading !== null"
            aria-label="Read the prep doc from a file"
            @click="fromFile('prepDoc')"
          >
            {{ reading === 'prepDoc' ? 'Reading…' : 'From a file' }}
          </SButton>
          <SButton
            v-if="editing !== 'prepDoc'"
            size="sm"
            :aria-label="`${prepDoc ? 'Edit' : 'Add'} the prep doc`"
            @click="edit('prepDoc')"
          >
            {{ prepDoc ? 'Edit' : 'Add' }}
          </SButton>
        </div>
        <p v-if="prepDoc?.cut && editing !== 'prepDoc'" class="small cut">
          Longer than {{ formatCount(documentLimits.prepDoc) }} characters, so only its start is kept; answers know it
          was cut.
        </p>
        <p v-if="failure?.target === 'prepDoc' && editing !== 'prepDoc'" class="failure" role="alert">
          {{ failure.message }}
        </p>
        <div v-if="editing === 'prepDoc'" class="editor">
          <p v-if="draftName" class="small">{{ draftName }}</p>
          <p v-if="draftCut" class="small cut">
            Longer than {{ formatCount(documentLimits.prepDoc) }} characters, so it was cut at a line break: only its
            start is kept.
          </p>
          <STextArea
            v-model="draft"
            aria-label="Prep doc"
            :rows="12"
            :limit="documentLimits.prepDoc"
            hint="Paste it, type, or read it from a file."
            @submit="save"
          />
          <p v-if="failure?.target === 'prepDoc'" class="failure" role="alert">{{ failure.message }}</p>
          <div class="actions">
            <SButton variant="ghost" size="sm" @click="editing = null">Cancel</SButton>
            <SButton variant="primary" size="sm" :disabled="saving || tooLong" @click="save">Save</SButton>
          </div>
        </div>
      </div>
    </template>
    <InstructionsEditor v-else-if="part === 'instructions'" />
    <AnswerBank v-else />
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
.editor > .small {
  margin-bottom: 6px;
}
.cut {
  margin-bottom: 10px;
  color: var(--text-1);
}
.failure {
  margin: 6px 0 10px;
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
