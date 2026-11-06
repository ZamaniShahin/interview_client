<script setup lang="ts">
// A plan to choose. Names and prices are placeholders until they are decided (Q3); buying opens the browser.
import SButton from '../../shared/components/SButton.vue';
import SIcon from '../../shared/components/SIcon.vue';

defineProps<{
  name: string;
  price: string;
  period: string;
  features: string[];
  current?: boolean;
  action: string;
  primary?: boolean;
}>();
const emit = defineEmits<{ choose: [] }>();
</script>

<template>
  <section class="plan" :class="{ current }" :aria-label="name">
    <p class="name">{{ name }}<span v-if="current" class="tag">Your plan</span></p>
    <p class="price num">{{ price }} <small>{{ period }}</small></p>
    <ul class="features">
      <li v-for="feature in features" :key="feature"><SIcon name="check" />{{ feature }}</li>
    </ul>
    <SButton :variant="primary ? 'primary' : 'secondary'" external class="action" @click="emit('choose')">{{ action }}</SButton>
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
.price {
  color: var(--text-0);
  font: 600 24px/32px var(--font-sans);
}
.price small {
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
