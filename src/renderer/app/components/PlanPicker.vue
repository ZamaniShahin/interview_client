<script setup lang="ts">
// The plans for sale, side by side (F9 · c), from the server's catalog. A subscriber changes plan in the provider's
// portal instead, so this is shown only to someone without a paid plan; buying waits in the window (F8 · b).
import { computed, ref } from 'vue';
import { plansOffered } from '../../../shared/plan-words';
import { useAppStore } from '../app-store';
import PlanCard from './PlanCard.vue';

const store = useAppStore();
const buying = ref(false);
const offers = computed(() => (store.account ? plansOffered(store.account) : []));
const canBuy = computed(() => store.account?.catalog?.purchases === true);

async function choose(planId: string): Promise<void> {
  buying.value = true;
  try {
    await store.buy({ planId });
  } finally {
    buying.value = false;
  }
}
</script>

<template>
  <div v-if="offers.length" class="picker">
    <div class="cards">
      <PlanCard
        v-for="(offer, i) in offers"
        :key="offer.id"
        :offer="offer"
        :primary="i === 0"
        :disabled="buying || store.payment !== null"
        @choose="choose"
      />
    </div>
    <p class="small">Choosing opens your browser. Nothing is charged until you finish there.</p>
  </div>
  <p v-else-if="store.account && !canBuy" class="small">Plans can't be bought here yet.</p>
</template>

<style scoped>
.cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 16px;
}
.picker .small {
  margin-top: 10px;
}
</style>
