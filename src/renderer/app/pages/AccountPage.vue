<script setup lang="ts">
// The account (F10): the plan and its state, the minutes usable now and each lot behind them, the computers, the
// ledger. Billing, buying and signing in happen in the browser. Signing out keeps this computer registered (J3), and
// asks first (F10 · e). The ledger and the computers each have a page of their own, under Account. Your data (Q19): a
// copy to save, and deleting the account, with its email typed again; the server checks it and says what holds it up.
import { computed, ref } from 'vue';
import { removalConfirmation, removalRule } from '../../../shared/device-words';
import { planWords, plural, subscribed, topUpsOffered } from '../../../shared/plan-words';
import SBanner from '../../shared/components/SBanner.vue';
import SButton from '../../shared/components/SButton.vue';
import SConfirm from '../../shared/components/SConfirm.vue';
import { useAppStore } from '../app-store';
import DeviceRow from '../components/DeviceRow.vue';
import LedgerRow from '../components/LedgerRow.vue';
import MinutesLotRow from '../components/MinutesLotRow.vue';
import PaymentWait from '../components/PaymentWait.vue';
import PlanPicker from '../components/PlanPicker.vue';
import ProblemBanner from '../components/ProblemBanner.vue';
import SignInBanner from '../components/SignInBanner.vue';

type View = 'account' | 'ledger' | 'computers';

const store = useAppStore();
const account = computed(() => store.account);
const view = ref<View>('account');
const busy = ref(false);
const confirmingSignOut = ref(false);
const showPlans = ref(false);
const deleting = ref(false);
const deleteTyped = ref('');

const words = computed(() => (account.value ? planWords(account.value) : null));
const isSubscribed = computed(() => (account.value ? subscribed(account.value) : false));
const topUps = computed(() => (account.value ? topUpsOffered(account.value) : []));
const canBuy = computed(() => account.value?.catalog?.purchases === true);

/** The plan's line under its name (F10 · a, d). */
const planLine = computed(() => {
  const current = account.value;
  if (!current) return '';
  const { plan } = current;
  switch (plan.state) {
    case 'active':
      if (plan.licensed)
        return plan.until
          ? `Given by Sotto until ${plan.until}: nothing to pay.`
          : 'Given by Sotto, with no end: nothing to pay.';
      if (!plan.until) return '';
      return plan.renews ? `Renews ${plan.until}` : `Runs until ${plan.until}, then stops.`;
    case 'past_due':
      return plan.until
        ? `Your last payment didn't go through. Update it in the browser by ${plan.until} to keep your plan; until then, everything works.`
        : "Your last payment didn't go through. Update it in the browser to keep your plan.";
    case 'trialing':
      return plan.until ? `Ends ${plan.until} · ${current.minutes?.usable ?? 0} minutes left` : 'Trial';
    case 'suspended':
      return 'Your account is suspended. Sessions and the AI jobs stop; documents and history stay on this computer.';
    case 'none':
      return 'No plan: pick one to start sessions.';
  }
  return '';
});

const signOutDetail = computed(
  () =>
    `Your documents, prepared answers and history stay here, encrypted, and open again when you sign back in. This computer stays one of your ${account.value?.deviceLimit ?? 3}.`,
);
const placesFree = computed(() => {
  const free = (account.value?.deviceLimit ?? 0) - (account.value?.devices.length ?? 0);
  return free > 0 ? `${plural(free, 'place')} free.` : 'No place free.';
});
const confirmWords = computed(() =>
  account.value ? removalConfirmation(account.value.deviceRemovals, new Date()) : '',
);

async function run(action: () => Promise<unknown>): Promise<void> {
  busy.value = true;
  try {
    await action();
  } finally {
    busy.value = false;
  }
}

/** A subscriber changes plan in the provider's portal; anyone else picks one here. */
function changePlan(): void {
  if (isSubscribed.value) void run(() => store.billingPortal());
  else showPlans.value = !showPlans.value;
}

async function signOut(): Promise<void> {
  confirmingSignOut.value = false;
  await run(() => store.signOut());
}

function exportData(): void {
  void run(() => store.exportData());
}

function cancelDelete(): void {
  deleting.value = false;
  deleteTyped.value = '';
}

/** Deleted, main signs out and the window goes back to signing in; refused, the problem says why and the form stays. */
async function deleteAccount(): Promise<void> {
  let deleted = false;
  await run(async () => {
    deleted = (await store.deleteAccount(deleteTyped.value.trim())).ok;
  });
  if (deleted) cancelDelete();
}
</script>

<template>
  <section class="page" aria-labelledby="account-title">
    <template v-if="view === 'account'">
      <h1 id="account-title" class="title">Account</h1>
      <ProblemBanner class="gap" />
      <SignInBanner class="gap" />
      <SBanner v-if="store.notice" tone="done" class="gap">
        {{ store.notice }}
        <template #actions><SButton size="sm" variant="ghost" @click="store.dismiss('notice')">OK</SButton></template>
      </SBanner>
      <PaymentWait class="gap" />
      <p v-if="!account" class="lede">{{ store.signedIn ? 'Reading your account…' : 'Not signed in.' }}</p>
      <template v-else>
        <p class="lede">{{ account.user.name }} · {{ account.user.emailMasked }}</p>

        <div class="grid">
          <div class="card">
            <p class="eyebrow">Plan</p>
            <p class="h">
              {{ account.plan.name }} <span class="tag">{{ words?.tag }}</span>
            </p>
            <p v-if="planLine" class="small">{{ planLine }}</p>
            <div class="actions">
              <SButton
                v-if="isSubscribed"
                size="sm"
                external
                :disabled="busy"
                @click="run(() => store.billingPortal())"
              >
                Manage billing
              </SButton>
              <SButton
                v-if="isSubscribed || (canBuy && !account.plan.licensed)"
                size="sm"
                variant="ghost"
                :external="isSubscribed"
                :disabled="busy"
                @click="changePlan"
              >
                Change plan
              </SButton>
            </div>
          </div>
          <div class="card">
            <p class="eyebrow">Computers</p>
            <p class="h">{{ account.devices.length }} of {{ account.deviceLimit }}</p>
            <p class="small">
              {{ account.devices.map((d) => (d.isThisComputer ? 'This computer' : d.name)).join(' and ') }}
            </p>
            <div class="actions">
              <SButton size="sm" variant="ghost" @click="view = 'computers'">Manage computers</SButton>
            </div>
          </div>
        </div>

        <PlanPicker v-if="showPlans && !isSubscribed" class="block" />

        <div v-if="account.minutes" class="card block">
          <p class="eyebrow">Minutes you can use now</p>
          <p class="big num">{{ account.minutes.usable }} min</p>
          <MinutesLotRow v-for="lot in account.minutes.lots" :key="lot.source + lot.expires" :lot="lot" />
          <div class="actions">
            <SButton
              v-for="topUp in topUps"
              :key="topUp.id"
              size="sm"
              external
              :disabled="busy || store.payment !== null"
              @click="run(() => store.buy({ topUpId: topUp.id }))"
            >
              Top up +{{ topUp.minutes }} minutes
            </SButton>
            <SButton size="sm" variant="ghost" @click="view = 'ledger'">The ledger</SButton>
          </div>
        </div>
        <div v-else class="card block">
          <p class="eyebrow">Minutes</p>
          <p class="small">
            {{ account.plan.fairUseMinutes ? 'No meter: fair use applies.' : 'No minutes without a plan.' }}
          </p>
          <div class="actions">
            <SButton size="sm" variant="ghost" @click="view = 'ledger'">The ledger</SButton>
          </div>
        </div>

        <div class="card block">
          <p class="eyebrow">Your data</p>
          <p class="small">
            A copy of everything Sotto keeps about you: your profile and computers, your plan, minutes and sessions.
            What was said in an interview was never kept.
          </p>
          <div v-if="!deleting" class="actions">
            <SButton size="sm" variant="ghost" :disabled="store.state.preview || busy" @click="exportData">
              Save a copy
            </SButton>
            <SButton size="sm" variant="ghost" :disabled="store.state.preview || busy" @click="deleting = true">
              Delete account
            </SButton>
          </div>
          <div v-else class="delete" role="group" aria-label="Delete your account" @keydown.esc.stop="cancelDelete">
            <p class="question">Delete your Sotto account?</p>
            <p class="small">
              Your plan ends and your computers are removed, at once and for good. Cancel a paid plan in Manage billing
              first. Your documents and history on this computer stay until you remove them.
            </p>
            <label class="label" for="delete-email">Type your account's email to confirm</label>
            <input
              id="delete-email"
              v-model="deleteTyped"
              class="box"
              type="email"
              autocomplete="off"
              spellcheck="false"
              maxlength="320"
              @keydown.enter="deleteTyped.trim() && deleteAccount()"
            />
            <div class="actions">
              <SButton size="sm" variant="danger" :disabled="busy || !deleteTyped.trim()" @click="deleteAccount">
                Delete my account
              </SButton>
              <SButton size="sm" variant="ghost" :disabled="busy" @click="cancelDelete">Keep it</SButton>
            </div>
          </div>
        </div>

        <div class="sign-out">
          <SConfirm
            v-if="confirmingSignOut"
            question="Sign out of Sotto on this computer?"
            :detail="signOutDetail"
            confirm-label="Sign out"
            @confirm="signOut"
            @cancel="confirmingSignOut = false"
          />
          <SButton
            v-else
            variant="ghost"
            size="sm"
            :disabled="store.state.preview || busy"
            @click="confirmingSignOut = true"
          >
            Sign out
          </SButton>
        </div>
      </template>
    </template>

    <template v-else-if="view === 'ledger' && account">
      <SButton size="sm" variant="ghost" class="back" @click="view = 'account'">Account ›</SButton>
      <h1 class="title">Minutes ledger</h1>
      <p class="lede">Every change to your minutes, newest first.</p>
      <ProblemBanner class="gap" />
      <div class="card">
        <div class="head">
          <span>Date</span><span>What</span><span class="num">Minutes</span><span class="num">After</span>
        </div>
        <LedgerRow v-for="entry in account.ledger" :key="entry.number" :entry="entry" />
        <p v-if="account.ledger.length === 0" class="small empty">Nothing yet.</p>
      </div>
      <SButton
        v-if="account.ledgerNext !== null"
        size="sm"
        class="more"
        :disabled="busy"
        @click="run(() => store.ledgerMore())"
      >
        Show earlier
      </SButton>
    </template>

    <template v-else-if="view === 'computers' && account">
      <SButton size="sm" variant="ghost" class="back" @click="view = 'account'">Account ›</SButton>
      <h1 class="title">Computers</h1>
      <p class="lede">
        Your plan allows {{ account.deviceLimit }}. A removed computer is signed out and can't be added back.
        {{ removalRule(account.deviceRemovals) }}
      </p>
      <ProblemBanner class="gap" />
      <div class="card">
        <DeviceRow
          v-for="device in account.devices"
          :key="device.id"
          :device="device"
          :can-remove="!busy && account.deviceRemovals.left > 0"
          :detail="confirmWords"
          @remove="(id) => run(() => store.removeDevice(id))"
        />
      </div>
      <p class="small foot">{{ placesFree }} Sotto asks before adding a computer over the limit.</p>
    </template>
  </section>
</template>

<style scoped>
.page {
  max-width: 720px;
  padding-bottom: 24px;
}
.title {
  margin-bottom: 4px;
  color: var(--text-0);
  font: 600 24px/32px var(--font-sans);
}
.lede {
  margin-bottom: 16px;
  color: var(--text-2);
}
.gap {
  margin-bottom: 16px;
}
.grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}
.card {
  padding: 14px 16px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--surface-1);
}
.block {
  margin-top: 16px;
}
.h {
  margin: 2px 0;
  color: var(--text-0);
  font: 600 15px/22px var(--font-sans);
}
.big {
  color: var(--text-0);
  font: 600 20px/28px var(--font-sans);
}
.tag {
  margin-left: 6px;
  padding: 1px 6px;
  border-radius: 4px;
  background: var(--surface-2);
  color: var(--text-1);
  font: 500 11px/16px var(--font-sans);
}
.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
}
.sign-out {
  margin-top: 16px;
}
.back {
  margin-bottom: 8px;
}
.head {
  display: grid;
  grid-template-columns: 70px 1fr 64px 64px;
  gap: 0 12px;
  padding-bottom: 6px;
  border-bottom: 1px solid var(--line);
  color: var(--text-2);
  font: 500 12px/16px var(--font-sans);
}
.empty {
  padding: 10px 0;
}
.more {
  margin-top: 12px;
}
.foot {
  margin-top: 12px;
}
.delete {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 8px;
  padding: 12px;
  border: 1px solid var(--line-2);
  border-radius: 10px;
  background: var(--surface-2);
}
.question {
  color: var(--text-0);
  font: 600 14px/20px var(--font-sans);
}
.label {
  color: var(--text-1);
  font: 600 12px/16px var(--font-sans);
}
.box {
  width: 100%;
  padding: 7px 10px;
  border: 1px solid var(--edge);
  border-radius: 6px;
  outline: none;
  background: var(--surface-1);
  color: var(--text-0);
  font: 400 14px/20px var(--font-sans);
}
.box:focus {
  border-color: var(--text-2);
}
</style>
