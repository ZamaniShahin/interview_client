<script setup lang="ts">
// Home: state 01, no session. Sign-in when it isn't done, what a session needs, the minutes, and Start, which waits for
// the consent box. The box is ticked every time and never remembered (F4). Above them, what the account needs now: a
// purchase being finished in the browser (F8 · b), the offer after a session that ran out (F8 · a), the trial or the
// plans when there is no plan (F9), and one quiet line when something arrived (F8 · c).
import { computed, ref } from 'vue';
import { ErrorCodes } from '../../../shared/contracts/sotto-contracts';
import { planWords, trialOffered } from '../../../shared/plan-words';
import SBanner from '../../shared/components/SBanner.vue';
import SButton from '../../shared/components/SButton.vue';
import SCheckbox from '../../shared/components/SCheckbox.vue';
import SIcon from '../../shared/components/SIcon.vue';
import { useAppStore } from '../app-store';
import AfterCallOffer from '../components/AfterCallOffer.vue';
import PaymentWait from '../components/PaymentWait.vue';
import PlanPicker from '../components/PlanPicker.vue';
import ProblemBanner from '../components/ProblemBanner.vue';
import SignInBanner from '../components/SignInBanner.vue';
import TrialOffer from '../components/TrialOffer.vue';

const store = useAppStore();
const consent = ref(false);
const starting = ref(false);

const readiness = computed(() => store.account?.readiness ?? null);
const words = computed(() => (store.account ? planWords(store.account) : null));
const minutesDetail = computed(() => {
  const plan = store.account?.plan;
  if (!words.value || !plan) return '';
  return plan.maxSessionMinutes > 0
    ? `${words.value.detail}. Sessions up to ${plan.maxSessionMinutes} minutes.`
    : words.value.detail;
});
// No plan: the trial for someone who never had one (F9 · a), the plans otherwise (F9 · c).
const noPlan = computed(() => store.account?.plan.state === 'none');
const offerTrial = computed(() => (store.account ? trialOffered(store.account) !== null : false));
const showPlans = ref(false);
const autoReady = computed(() => !!(readiness.value?.resume && readiness.value?.jobDescription));
const canStart = computed(() => store.signedIn && store.account !== null);
// The server refused because the account's session is open elsewhere: starting again takes it over (J7), and the
// problem above says so in the server's words.
const takeOver = computed(() => store.problem?.code === ErrorCodes.Session.ActiveElsewhere);
const hint = computed(() => {
  if (!canStart.value) return 'Sign in to start.';
  if (!consent.value) return 'Tick the box to start.';
  if (takeOver.value) return 'Ends the session on your other device.';
  return autoReady.value ? 'AUTO, smart answers.' : 'Starts in MANUAL.';
});

async function start(): Promise<void> {
  starting.value = true;
  // A refusal comes back as the store's problem, shown above.
  const result = await store.startSession(consent.value, takeOver.value);
  starting.value = false;
  if (result.ok) consent.value = false;
}
</script>

<template>
  <section class="page" aria-labelledby="home-title">
    <h1 id="home-title" class="title">Home</h1>
    <p class="lede">Start a session when the call begins; the overlay opens over it.</p>

    <ProblemBanner class="gap" />
    <SignInBanner class="gap" />
    <SBanner v-if="store.notice" tone="done" class="gap">
      {{ store.notice }}
      <template #actions><SButton size="sm" variant="ghost" @click="store.dismiss('notice')">OK</SButton></template>
    </SBanner>
    <PaymentWait class="gap" />
    <AfterCallOffer class="gap" @plans="showPlans = true" />
    <template v-if="noPlan && !store.payment">
      <TrialOffer v-if="offerTrial" class="gap" @plans="showPlans = true" />
      <section v-else class="gap card" aria-labelledby="no-plan-title">
        <h2 id="no-plan-title" class="h">{{ store.account?.trial.endsOn ? 'Your trial has ended' : 'No plan' }}</h2>
        <p class="small">
          Your documents, prepared answers and history stay on this computer. Pick a plan to start sessions; it opens
          your browser.
        </p>
      </section>
    </template>
    <PlanPicker v-if="(showPlans || (noPlan && !offerTrial)) && !store.payment" class="gap" />
    <SBanner v-if="store.signedIn && readiness && !autoReady" tone="info" class="gap">
      Add your résumé and job description to answer automatically. Without them, Sotto answers only when you ask.
    </SBanner>

    <div class="grid">
      <div class="card">
        <h2 class="h">Ready for an interview</h2>
        <ul class="ready">
          <li>
            <SIcon :name="readiness?.resume ? 'done' : 'notDone'" :class="readiness?.resume ? 'yes' : 'no'" />Résumé ·
            {{ readiness?.resume ?? 'not added' }}
          </li>
          <li>
            <SIcon
              :name="readiness?.jobDescription ? 'done' : 'notDone'"
              :class="readiness?.jobDescription ? 'yes' : 'no'"
            />Job description · {{ readiness?.jobDescription ?? 'not added' }}
          </li>
          <li>
            <SIcon
              :name="readiness?.soundCheck ? 'done' : 'notDone'"
              :class="readiness?.soundCheck ? 'yes' : 'no'"
            />Sound check · {{ readiness?.soundCheck ?? 'not done' }}
          </li>
        </ul>
        <SCheckbox v-model="consent" class="consent"
          >I have consent to record and transcribe this conversation</SCheckbox
        >
        <div class="start">
          <SButton variant="primary" size="lg" :disabled="!canStart || !consent || starting" @click="start">
            {{ takeOver ? 'Start here' : 'Start session' }}
          </SButton>
          <span class="small">{{ hint }}</span>
        </div>
      </div>
      <div class="card">
        <template v-if="words">
          <p class="eyebrow">{{ words.eyebrow }}</p>
          <p class="big num">{{ words.headline }}</p>
          <p class="small">{{ minutesDetail }}</p>
        </template>
        <template v-else>
          <p class="eyebrow">Minutes</p>
          <p class="small">Shown once you're signed in.</p>
        </template>
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
