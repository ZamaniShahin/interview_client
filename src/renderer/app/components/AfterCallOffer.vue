<script setup lang="ts">
// After the call (F8 · a): only here, after the session, and only because minutes were the reason it ended. A top-up
// where the plan has minutes to add to, another plan, or the provider's portal for a subscriber; all in the browser.
import { computed, ref } from 'vue';
import { SessionEndReasons } from '../../../shared/contracts/sotto-contracts';
import { offerLines, plansOffered, subscribed, topUpsOffered } from '../../../shared/plan-words';
import SButton from '../../shared/components/SButton.vue';
import { useAppStore } from '../app-store';
import TopUpOffer from './TopUpOffer.vue';

const emit = defineEmits<{ plans: [] }>();
const store = useAppStore();
const busy = ref(false);

const account = computed(() => store.account);
const shown = computed(() => store.lastSessionEnd === SessionEndReasons.CreditExhausted && account.value !== null);
const topUp = computed(() => (account.value ? (topUpsOffered(account.value)[0] ?? null) : null));
const otherPlan = computed(() => {
  if (!account.value) return null;
  return plansOffered(account.value).find((offer) => offer.id !== account.value!.plan.id) ?? null;
});
const comeBack = computed(() => {
  const plan = account.value?.plan;
  return plan?.renews && plan.periodMinutes !== null && plan.until
    ? `Your plan's ${plan.periodMinutes} minutes come back on ${plan.until}. `
    : '';
});

async function run(action: () => Promise<unknown>): Promise<void> {
  busy.value = true;
  try {
    await action();
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <section v-if="shown && account" class="offer" aria-labelledby="offer-title">
    <h2 id="offer-title" class="h">The session ended: no minutes left.</h2>
    <div class="choices">
      <TopUpOffer
        v-if="topUp"
        :top-up="topUp"
        :disabled="busy || store.payment !== null"
        @buy="(topUpId) => run(() => store.buy({ topUpId }))"
      />
      <div v-if="otherPlan" class="change">
        <p class="eyebrow">Or change plan</p>
        <p class="title">{{ otherPlan.name }}</p>
        <p class="small">{{ offerLines(otherPlan)[0] }}.</p>
        <SButton size="sm" class="action" @click="emit('plans')">See the plans</SButton>
      </div>
      <div v-else-if="subscribed(account)" class="change">
        <p class="eyebrow">Or change plan</p>
        <p class="small">A plan is changed in your billing page.</p>
        <SButton size="sm" external class="action" :disabled="busy" @click="run(() => store.billingPortal())"
          >Manage billing</SButton
        >
      </div>
    </div>
    <p class="small foot">{{ comeBack }}Nothing is charged until you finish in the browser.</p>
    <SButton size="sm" variant="ghost" @click="store.dismiss('offer')">Not now</SButton>
  </section>
</template>

<style scoped>
.offer {
  padding: 16px;
  border: 1px solid var(--line-2);
  border-radius: 10px;
  background: var(--surface-1);
}
.h {
  margin-bottom: 12px;
  color: var(--text-0);
  font: 600 15px/22px var(--font-sans);
}
.choices {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 12px;
}
.change {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 16px;
  border: 1px solid var(--line);
  border-radius: 10px;
}
.title {
  color: var(--text-0);
  font: 600 15px/22px var(--font-sans);
}
.action {
  align-self: flex-start;
  margin-top: 8px;
}
.foot {
  margin: 12px 0 8px;
}
</style>
