<script setup lang="ts">
// Finishing a purchase in the browser (F8 · b): no card form in the app, the provider's page does it. The window waits
// and main reads the account until what was bought shows; then one quiet line says so (F8 · c).
import SButton from '../../shared/components/SButton.vue';
import { useAppStore } from '../app-store';

const store = useAppStore();
</script>

<template>
  <section v-if="store.payment" class="wait" aria-live="polite" aria-labelledby="wait-title">
    <h2 id="wait-title" class="h">Finish in your browser.</h2>
    <p class="small">
      {{ store.payment.item }}: the minutes appear here by themselves, usually within a few seconds of paying.
    </p>
    <div class="actions">
      <SButton size="sm" external @click="store.paymentAction('open')">Open the page again</SButton>
      <SButton size="sm" variant="ghost" @click="store.paymentAction('cancel')">Cancel</SButton>
    </div>
    <p class="status small">
      <template v-if="store.payment.stale">
        Still waiting. If you paid, it shows here within a minute or two: Sotto keeps checking.
      </template>
      <template v-else>Waiting for the payment…</template>
    </p>
  </section>
</template>

<style scoped>
.wait {
  padding: 16px;
  border: 1px solid var(--line-2);
  border-radius: 10px;
  background: var(--surface-1);
}
.h {
  color: var(--text-0);
  font: 600 15px/22px var(--font-sans);
}
.actions {
  display: flex;
  gap: 8px;
  margin-top: 12px;
}
.status {
  margin-top: 10px;
}
</style>
