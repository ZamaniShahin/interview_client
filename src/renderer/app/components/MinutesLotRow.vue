<script setup lang="ts">
// One lot of minutes: where it came from, what is left of it, when it expires. The soonest to expire is used first.
import type { MinutesLot } from '../../../shared/account';

defineProps<{ lot: MinutesLot }>();
</script>

<template>
  <div class="row">
    <div class="main">
      <p class="title">{{ lot.source }}</p>
      <p class="small">{{ lot.left }} of {{ lot.granted }} left · expire {{ lot.expires }}</p>
    </div>
    <p class="num value">{{ lot.left }} min</p>
  </div>
</template>

<style scoped>
.row {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 44px;
  border-bottom: 1px solid var(--line);
}
.main {
  flex: 1;
}
.title,
.value {
  color: var(--text-0);
  font: 600 14px/20px var(--font-sans);
}
</style>
