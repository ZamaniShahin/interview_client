<script setup lang="ts">
// A plan to choose (F9 · c), as the server's catalog describes it: its name and what it gives. The price is on the
// provider's page until it is decided (Q3), and choosing opens the browser.
import { computed } from 'vue';
import type { PlanOffer } from '../../../shared/account';
import { offerLines } from '../../../shared/plan-words';
import SButton from '../../shared/components/SButton.vue';
import SIcon from '../../shared/components/SIcon.vue';

const props = defineProps<{ offer: PlanOffer; current?: boolean; primary?: boolean; disabled?: boolean }>();
const emit = defineEmits<{ choose: [planId: string] }>();
const lines = computed(() => offerLines(props.offer));
</script>

<template>
  <section class="plan" :class="{ current }" :aria-label="offer.name">
    <p class="name">{{ offer.name }}<span v-if="current" class="tag">Your plan</span></p>
    <p class="period">Monthly · the price shows on the payment page</p>
    <ul class="features">
      <li v-for="line in lines" :key="line"><SIcon name="check" />{{ line }}</li>
    </ul>
    <SButton
      v-if="!current"
      :variant="primary ? 'primary' : 'secondary'"
      external
      class="action"
      :disabled="disabled"
      @click="emit('choose', offer.id)"
    >
      Choose {{ offer.name }}
    </SButton>
  </section>
</template>

<style scoped>
.plan {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 18px;
  border: 1px solid var(--line-2);
  border-radius: 12px;
  background: var(--surface-1);
}
.plan.current {
  border-color: var(--text-2);
}
.name {
  color: var(--text-0);
  font: 600 15px/22px var(--font-sans);
}
.tag {
  margin-left: 6px;
  padding: 1px 6px;
  border-radius: 4px;
  background: var(--surface-2);
  color: var(--text-1);
  font: 500 11px/16px var(--font-sans);
}
.period {
  color: var(--text-2);
  font: 400 13px/18px var(--font-sans);
}
.features {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.features li {
  display: flex;
  gap: 8px;
  color: var(--text-1);
  font: 400 13px/18px var(--font-sans);
}
.features li :deep(svg) {
  margin-top: 1px;
  color: var(--text-2);
}
.action {
  align-self: flex-start;
  margin-top: auto;
}
</style>
