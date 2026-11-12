<script setup lang="ts">
// A pack of minutes to buy (F8 · a), as the catalog has it: how many, and how long they last. Bought in the browser.
import { computed } from 'vue';
import type { TopUpOffer } from '../../../shared/account';
import { topUpLines } from '../../../shared/plan-words';
import SButton from '../../shared/components/SButton.vue';

const props = defineProps<{ topUp: TopUpOffer; disabled?: boolean }>();
const emit = defineEmits<{ buy: [topUpId: string] }>();
const lines = computed(() => topUpLines(props.topUp));
</script>

<template>
  <section class="offer" :aria-label="lines.title">
    <p class="eyebrow">Top up</p>
    <p class="title num">{{ lines.title }}</p>
    <p class="small">{{ lines.detail }}</p>
    <SButton variant="primary" external class="action" :disabled="disabled" @click="emit('buy', topUp.id)">
      Top up in the browser
    </SButton>
  </section>
</template>

<style scoped>
.offer {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 16px;
  border: 1px solid var(--line-2);
  border-radius: var(--radius-card);
  background: var(--surface-1);
}
.title {
  color: var(--text-0);
  font: 600 20px/28px var(--font-sans);
}
.action {
  align-self: flex-start;
  margin-top: 10px;
}
</style>
