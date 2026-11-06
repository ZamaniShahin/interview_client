<script setup lang="ts">
// Home: state 01, no session. What a session needs, the minutes, and Start, which waits for the consent box. The box
// is ticked every time and never remembered (F4).
import { computed, ref } from 'vue';
import SBanner from '../../shared/components/SBanner.vue';
import SButton from '../../shared/components/SButton.vue';
import SCheckbox from '../../shared/components/SCheckbox.vue';
import SIcon from '../../shared/components/SIcon.vue';
import { useAccountStore } from '../account-store';

const store = useAccountStore();
const consent = ref(false);
const starting = ref(false);
const error = ref<string | null>(null);

const readiness = computed(() => store.account?.readiness ?? null);
const autoReady = computed(() => !!(readiness.value?.resume && readiness.value?.jobDescription));

async function start(): Promise<void> {
  error.value = null;
  starting.value = true;
  const result = await store.startSession(consent.value);
  starting.value = false;
  if (result.ok) consent.value = false;
  else error.value = result.message;
}
</script>

<template>
  <section class="page" aria-labelledby="home-title">
    <h1 id="home-title" class="title">Home</h1>
    <p class="lede">Start a session when the call begins; the overlay opens over it.</p>

    <SBanner v-if="error" tone="attention" class="gap">{{ error }}</SBanner>
    <SBanner v-else-if="store.loaded && !store.account" tone="info" class="gap">
      <b>Not signed in.</b> Signing in happens in your browser.
      <template #actions><SButton size="sm" external disabled>Sign in</SButton></template>
    </SBanner>
    <SBanner v-else-if="readiness && !autoReady" tone="info" class="gap">
      Add your résumé and job description to answer automatically. Without them, Sotto answers only when you ask.
    </SBanner>

    <div class="grid">
      <div class="card">
        <h2 class="h">Ready for an interview</h2>
        <ul class="ready">
          <li><SIcon :name="readiness?.resume ? 'done' : 'notDone'" :class="readiness?.resume ? 'yes' : 'no'" />Résumé · {{ readiness?.resume ?? 'not added' }}</li>
          <li><SIcon :name="readiness?.jobDescription ? 'done' : 'notDone'" :class="readiness?.jobDescription ? 'yes' : 'no'" />Job description · {{ readiness?.jobDescription ?? 'not added' }}</li>
          <li><SIcon :name="readiness?.soundCheck ? 'done' : 'notDone'" :class="readiness?.soundCheck ? 'yes' : 'no'" />Sound check · {{ readiness?.soundCheck ?? 'not done' }}</li>
        </ul>
        <SCheckbox v-model="consent" class="consent">I have consent to record and transcribe this conversation</SCheckbox>
        <div class="start">
          <SButton variant="primary" size="lg" :disabled="!consent || starting" @click="start">Start session</SButton>
          <span class="small">{{ !consent ? 'Tick the box to start.' : autoReady ? 'AUTO, smart answers.' : 'Starts in MANUAL.' }}</span>
        </div>
      </div>
      <div class="card">
        <p class="eyebrow">Minutes</p>
        <template v-if="store.account?.minutes">
          <p class="big num">{{ store.account.minutes.usable }} min left</p>
          <p class="small">{{ store.account.plan.name }} plan · renews {{ store.account.plan.renewsOn }}</p>
        </template>
        <p v-else class="small">Shown once you're signed in.</p>
      </div>
    </div>
  </section>
</template>

<style scoped>
.page {
  max-width: 720px;
}
.title {
  margin-bottom: 4px;
  color: var(--text-0);
  font: 600 24px/32px var(--font-sans);
}
.lede {
  margin-bottom: 20px;
  color: var(--text-2);
}
.gap {
  margin-bottom: 16px;
}
.grid {
  display: grid;
  grid-template-columns: 3fr 2fr;
  gap: 16px;
}
.card {
  padding: 16px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--surface-1);
}
.h {
  margin-bottom: 8px;
  color: var(--text-0);
  font: 600 15px/22px var(--font-sans);
}
.ready {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
  font: 400 13px/18px var(--font-sans);
}
.ready li {
  display: flex;
  align-items: center;
  gap: 8px;
}
.yes {
  color: var(--ok);
}
.no {
  color: var(--text-3);
}
.consent {
  margin-top: 18px;
}
.start {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 16px;
}
.big {
  color: var(--text-0);
  font: 600 15px/20px var(--font-sans);
}
</style>
