<script setup lang="ts">
// F1 · 3: name, résumé, job description, pasted or typed (reading files comes with 3.10). They are kept on this computer
// like Prepare's, and AUTO needs the résumé and the job description. "Skip for now" moves on and keeps nothing.
import { computed, reactive, ref } from 'vue';
import { fieldLimits } from '../../../shared/documents';
import SBanner from '../../shared/components/SBanner.vue';
import SButton from '../../shared/components/SButton.vue';
import STextArea from '../../shared/components/STextArea.vue';
import { useAppStore } from '../app-store';
import SetupStep from './SetupStep.vue';

const emit = defineEmits<{ back: []; next: [] }>();
const store = useAppStore();

const fields = ['name', 'resume', 'jobDescription'] as const;
const draft = reactive({
  name: store.documents.name,
  resume: store.documents.resume,
  jobDescription: store.documents.jobDescription,
});
const saving = ref(false);
const failure = ref<string | null>(null);
const tooLong = computed(() => fields.some((field) => draft[field].length > fieldLimits[field]));

/** Keeps what changed, then moves on; a document of spaces only goes. */
async function save(): Promise<void> {
  if (tooLong.value) return;
  saving.value = true;
  failure.value = null;
  for (const field of fields) {
    if (draft[field] === store.documents[field]) continue;
    const result = await store.setDocument({ field, text: draft[field].trim() === '' ? '' : draft[field] });
    if (!result.ok) {
      failure.value = result.message;
      saving.value = false;
      return;
    }
  }
  saving.value = false;
  emit('next');
}
</script>

<template>
  <SetupStep
    heading="Your documents"
    lede="Answers are grounded in these. They stay on this computer and go to the server only for a session."
  >
    <div class="fields">
      <STextArea v-model="draft.name" label="Your name" :rows="1" :limit="fieldLimits.name" />
      <STextArea
        v-model="draft.resume"
        label="Résumé"
        :rows="6"
        :limit="fieldLimits.resume"
        hint="Paste it, or type."
      />
      <STextArea
        v-model="draft.jobDescription"
        label="Job description"
        :rows="6"
        :limit="fieldLimits.jobDescription"
        placeholder="Paste the job description"
        hint="Notes and a prep doc can be added later, in Prepare."
      />
    </div>
    <SBanner v-if="failure" tone="attention">{{ failure }}</SBanner>
    <template #foot>
      <SButton variant="ghost" @click="emit('back')">Back</SButton>
      <span class="spacer" />
      <SButton variant="ghost" @click="emit('next')">Skip for now</SButton>
      <SButton variant="primary" :disabled="saving || tooLong" @click="save">Continue</SButton>
    </template>
  </SetupStep>
</template>

<style scoped>
.fields {
  display: flex;
  flex-direction: column;
  gap: 14px;
  margin-bottom: 12px;
}
</style>
