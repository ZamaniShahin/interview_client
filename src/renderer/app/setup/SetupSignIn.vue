<script setup lang="ts">
// F1 · 2: sign in, in the browser, while the window waits; it moves on by itself once the account is read. This
// computer is registered on the way, with nothing to do (J4). Already signed in, as on a second run, it says so.
import { computed, ref, watch } from 'vue';
import SButton from '../../shared/components/SButton.vue';
import ProblemBanner from '../components/ProblemBanner.vue';
import { useAppStore } from '../app-store';
import SetupStep from './SetupStep.vue';

const emit = defineEmits<{ back: []; next: [] }>();
const store = useAppStore();

const waiting = computed(() => store.auth.status === 'signing-in');
const reading = computed(() => store.auth.status === 'signed-in' && store.account === null);
const ready = computed(() => store.auth.status === 'signed-in' && store.account !== null);
const startedHere = ref(false);

// The sign-in that started here has finished and the account is read: on, by itself.
watch(ready, (now) => {
  if (now && startedHere.value) emit('next');
});

async function signIn(): Promise<void> {
  startedHere.value = true;
  await store.signIn();
}

function back(): void {
  if (waiting.value) store.cancelSignIn();
  emit('back');
}
</script>

<template>
  <SetupStep
    v-if="waiting"
    heading="Finish signing in in your browser."
    lede="Sign in, or create an account, on the page that opened. This window carries on by itself."
  >
    <div class="actions">
      <SButton @click="store.signInPage('open')">Open the page again</SButton>
      <SButton variant="ghost" @click="store.signInPage('copy')">Copy the link</SButton>
    </div>
    <p class="status" role="status"><span class="dot" aria-hidden="true" />Waiting for the browser…</p>
    <template #foot>
      <SButton variant="ghost" @click="back">Back</SButton>
      <span class="spacer" />
      <span class="note">Next: registering this computer, by itself</span>
    </template>
  </SetupStep>

  <SetupStep
    v-else-if="ready || reading"
    heading="You're signed in"
    :lede="reading ? 'Reading your account…' : undefined"
  >
    <p v-if="ready" class="body">
      As {{ store.account?.user.emailMasked }}. This computer is registered to your account.
    </p>
    <template #foot>
      <SButton variant="ghost" @click="back">Back</SButton>
      <span class="spacer" />
      <SButton variant="primary" :disabled="!ready" @click="emit('next')">Continue</SButton>
    </template>
  </SetupStep>

  <SetupStep
    v-else
    heading="Sign in"
    lede="Sign in, or create an account, in your browser. This window carries on by itself."
  >
    <ProblemBanner class="problem" />
    <SButton variant="primary" external @click="signIn">Sign in</SButton>
    <template #foot>
      <SButton variant="ghost" @click="back">Back</SButton>
      <span class="spacer" />
    </template>
  </SetupStep>
</template>

<style scoped>
.actions {
  display: flex;
  gap: 8px;
}
.status {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 16px;
  color: var(--text-2);
  font: 400 13px/18px var(--font-sans);
}
.dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--text-2);
}
.body {
  color: var(--text-1);
  font: 400 14px/20px var(--font-sans);
}
.problem {
  margin-bottom: 12px;
}
</style>
