<script setup lang="ts">
// The last thing that went wrong (a start the server refused, a sign-in that failed, the account unread), in the
// server's own words. "Try again" only when trying again can help.
import { computed, ref } from 'vue';
import { ErrorCodes } from '../../../shared/contracts/sotto-contracts';
import SBanner from '../../shared/components/SBanner.vue';
import SButton from '../../shared/components/SButton.vue';
import { useAppStore } from '../app-store';

const store = useAppStore();
const retrying = ref(false);
const canRetry = computed(() => store.problem?.code === ErrorCodes.Request.Unavailable && store.signedIn);

async function retry(): Promise<void> {
  retrying.value = true;
  try {
    await store.refresh();
  } finally {
    retrying.value = false;
  }
}
</script>

<template>
  <SBanner v-if="store.problem" tone="attention">
    {{ store.problem.message }}
    <template v-if="canRetry" #actions>
      <SButton size="sm" :disabled="retrying" @click="retry">Try again</SButton>
    </template>
  </SBanner>
</template>
