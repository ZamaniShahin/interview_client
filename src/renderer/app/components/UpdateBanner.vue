<script setup lang="ts">
// Updates (4.2): a newer Sotto, downloaded and ready, says so, with a way to install it now; and while the server no
// longer takes this version (client_outdated, which the problem banner words), how the new one is coming along.
import { computed, ref } from 'vue';
import { ErrorCodes } from '../../../shared/contracts/sotto-contracts';
import SBanner from '../../shared/components/SBanner.vue';
import SButton from '../../shared/components/SButton.vue';
import { useAppStore } from '../app-store';

const store = useAppStore();
const update = computed(() => store.update);
const outdated = computed(() => store.problem?.code === ErrorCodes.Identity.ClientOutdated);
const installing = ref(false);
const failure = ref<string | null>(null);

async function install(): Promise<void> {
  installing.value = true;
  failure.value = null;
  const result = await store.installUpdate();
  if (!result.ok) {
    failure.value = result.message;
    installing.value = false;
  }
}
</script>

<template>
  <SBanner v-if="update.status === 'ready'" tone="done">
    Sotto {{ update.version }} is ready. It installs the next time Sotto closes, or now.
    <template #actions>
      <SButton size="sm" variant="primary" :disabled="installing" @click="install">Restart to update</SButton>
    </template>
  </SBanner>
  <SBanner v-else-if="outdated && update.status === 'downloading'" tone="info">
    The new version is downloading ({{ update.percent }}%). Restart Sotto once it is ready.
  </SBanner>
  <p v-if="failure" class="failure" role="alert">{{ failure }}</p>
</template>

<style scoped>
.failure {
  margin-top: 6px;
  color: var(--danger);
}
</style>
