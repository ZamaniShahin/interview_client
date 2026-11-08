<script setup lang="ts">
// One change to the minutes, with the balance after it. Debits read quieter than credits; the sign says which.
import type { LedgerEntry } from '../../../shared/account';

defineProps<{ entry: LedgerEntry }>();
const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : '0');
</script>

<template>
  <div class="row">
    <span class="small">{{ entry.date }}</span>
    <span><span class="kind">{{ entry.kind }}</span> <span v-if="entry.detail" class="small">· {{ entry.detail }}</span></span>
    <span class="num value" :class="{ debit: entry.minutes < 0 }">{{ signed(entry.minutes) }}</span>
    <span class="num value debit">{{ entry.balanceAfter }}</span>
  </div>
</template>

<style scoped>
.row {
  display: grid;
  grid-template-columns: 70px 1fr 64px 64px;
  gap: 0 12px;
  align-items: center;
  min-height: 40px;
  border-bottom: 1px solid var(--line);
}
.kind {
  color: var(--text-0);
  font: 600 14px/20px var(--font-sans);
}
.value {
  color: var(--text-0);
  font: 600 14px/20px var(--font-sans);
  text-align: right;
}
.value.debit {
  color: var(--text-2);
}
</style>
