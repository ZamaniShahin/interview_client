<script setup lang="ts">
// Prepare (F14): the documents, each counted against its limit. Editing them, custom instructions and the answer
// bank come with the first run (1.14) and the local database; the limits are the server's (src/shared/text-limits.ts).
import { ref } from 'vue';
import { documentLimits } from '../../../shared/text-limits';
import SButton from '../../shared/components/SButton.vue';
import SSegmented from '../../shared/components/SSegmented.vue';

type Part = 'documents' | 'instructions' | 'bank';
const part = ref<Part>('documents');

const documents = [
  { label: 'Name', limit: documentLimits.name },
  { label: 'Résumé', limit: documentLimits.resume },
  { label: 'Job description', limit: documentLimits.jobDescription },
  { label: 'Notes', limit: documentLimits.notes },
  { label: 'Prep doc', limit: documentLimits.prepDoc },
];
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
      <div v-for="doc in documents" :key="doc.label" class="row">
        <div class="main">
          <p class="name">{{ doc.label }}</p>
          <p class="small">Not added</p>
        </div>
        <span class="small num">0 / {{ doc.limit.toLocaleString('en-US') }}</span>
        <SButton size="sm" disabled>Add</SButton>
      </div>
    </template>
    <p v-else class="lede">
      {{ part === 'instructions' ? 'Your custom instructions, up to 4,000 characters.' : 'Prepared answers, each with the phrasings it answers.' }}
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
.row {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 52px;
  border-bottom: 1px solid var(--line);
}
.main {
  flex: 1;
}
.name {
  color: var(--text-0);
  font: 600 14px/20px var(--font-sans);
}
</style>
