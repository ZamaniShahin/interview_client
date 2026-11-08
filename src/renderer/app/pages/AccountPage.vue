<script setup lang="ts">
// The account (F10): the plan and its state, the minutes usable now and each lot behind them, the computers, the
// ledger. Billing, buying and signing in happen in the browser. Signing out keeps this computer registered (J3).
import { computed, ref } from 'vue';
import SButton from '../../shared/components/SButton.vue';
import { useAppStore } from '../app-store';
import DeviceRow from '../components/DeviceRow.vue';
import LedgerRow from '../components/LedgerRow.vue';
import MinutesLotRow from '../components/MinutesLotRow.vue';
import ProblemBanner from '../components/ProblemBanner.vue';
import SignInBanner from '../components/SignInBanner.vue';

const store = useAppStore();
const account = computed(() => store.account);
const signingOut = ref(false);

const stateWords: Record<string, string> = {
  none: 'No plan',
  trialing: 'Trial',
  active: 'Active',
  past_due: 'Payment due',
  cancelled: 'Cancelled',
  suspended: 'Suspended',
};

async function signOut(): Promise<void> {
  signingOut.value = true;
  try {
    await store.signOut();
  } finally {
    signingOut.value = false;
  }
}
</script>

<template>
  <section class="page" aria-labelledby="account-title">
    <h1 id="account-title" class="title">Account</h1>
    <ProblemBanner class="gap" />
    <SignInBanner class="gap" />
    <p v-if="!account" class="lede">{{ store.signedIn ? 'Reading your account…' : 'Not signed in.' }}</p>
    <template v-else>
      <p class="lede">{{ account.user.name }} · {{ account.user.emailMasked }}</p>

      <div class="grid">
        <div class="card">
          <p class="eyebrow">Plan</p>
          <p class="h">{{ account.plan.name }} <span class="tag">{{ stateWords[account.plan.state] }}</span></p>
          <p v-if="account.plan.renewsOn" class="small">Renews {{ account.plan.renewsOn }}</p>
          <div class="actions">
            <SButton size="sm" external disabled>Manage billing</SButton>
            <SButton size="sm" variant="ghost" disabled>Change plan</SButton>
          </div>
        </div>
        <div class="card">
          <p class="eyebrow">Computers</p>
          <p class="h">{{ account.devices.length }} of {{ account.deviceLimit }}</p>
          <p class="small">{{ account.devices.map((d) => d.name).join(' and ') }}</p>
        </div>
      </div>

      <div v-if="account.minutes" class="card block">
        <p class="eyebrow">Minutes you can use now</p>
        <p class="big num">{{ account.minutes.usable }} min</p>
        <MinutesLotRow v-for="lot in account.minutes.lots" :key="lot.source + lot.expires" :lot="lot" />
      </div>

      <div class="card block">
        <p class="eyebrow">Computers</p>
        <DeviceRow v-for="device in account.devices" :key="device.id" :device="device" :can-remove="false" />
      </div>

      <div class="card block">
        <p class="eyebrow">Minutes ledger</p>
        <LedgerRow v-for="(entry, i) in account.ledger" :key="i" :entry="entry" />
        <p v-if="account.ledger.length === 0" class="small">Nothing yet.</p>
      </div>

      <SButton variant="ghost" size="sm" class="sign-out" :disabled="store.state.preview || signingOut" @click="signOut">
        Sign out
      </SButton>
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
  gap: 8px;
  margin-top: 12px;
}
.sign-out {
  margin-top: 16px;
}
</style>
