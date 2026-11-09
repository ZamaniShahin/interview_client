<script setup lang="ts">
// F1 · 1: what goes where. Acknowledged once, and again whenever its words change; no session starts without it (J2).
// No Back, no Skip: it is the first thing, and the only one that can't wait.
import { ref } from 'vue';
import { notice } from '../../../shared/first-run';
import SBanner from '../../shared/components/SBanner.vue';
import SButton from '../../shared/components/SButton.vue';
import SIcon from '../../shared/components/SIcon.vue';
import type { IconName } from '../../shared/icons';
import { useAppStore } from '../app-store';
import SetupStep from './SetupStep.vue';

defineProps<{ /** Shown alone, because its words changed since it was acknowledged. */ alone: boolean }>();
const emit = defineEmits<{ next: [] }>();
const store = useAppStore();
const failure = ref<string | null>(null);

async function understand(): Promise<void> {
  failure.value = null;
  const result = await store.acknowledgeNotice();
  if (result.ok) emit('next');
  else failure.value = result.message;
}
</script>

<template>
  <SetupStep :heading="notice.heading" :lede="notice.lede">
    <ul class="rows">
      <li v-for="row in notice.rows" :key="row.title" class="row">
        <SIcon :name="row.icon as IconName" class="icon" />
        <div>
          <p class="title">{{ row.title }}</p>
          <p class="body">{{ row.body }}</p>
        </div>
      </li>
    </ul>
    <SBanner v-if="failure" tone="attention">{{ failure }}</SBanner>
    <template #foot>
      <span class="note">{{ alone ? 'The words have changed since you last read them.' : 'Step 1 of 5' }}</span>
      <span class="spacer" />
      <SButton variant="primary" @click="understand">I understand</SButton>
    </template>
  </SetupStep>
</template>

<style scoped>
.rows {
  display: flex;
  flex-direction: column;
  gap: 16px;
  margin: 0 0 16px;
  padding: 0;
  list-style: none;
}
.row {
  display: flex;
  gap: 12px;
}
.icon {
  flex: none;
  margin-top: 2px;
  color: var(--text-1);
}
.title {
  color: var(--text-0);
  font: 600 14px/20px var(--font-sans);
}
.body {
  color: var(--text-1);
  font: 400 14px/20px var(--font-sans);
}
</style>
