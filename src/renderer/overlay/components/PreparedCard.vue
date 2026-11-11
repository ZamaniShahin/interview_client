<script setup lang="ts">
// The 📌 card (3.8, F15): when the question matched one of the user's own prepared answers, theirs shows at once, over
// the generated answer still being written. Their own words, shown as they wrote them: plain text, never Markdown.
import SIcon from '../../shared/components/SIcon.vue';

defineProps<{ phrasing: string; answer: string }>();
</script>

<template>
  <section class="prepared" aria-label="Your prepared answer">
    <p class="head">
      <SIcon name="pin" :size="14" class="pin" />
      <b>Your prepared answer</b>
      <span class="for">for “{{ phrasing }}”</span>
    </p>
    <p class="answer">{{ answer }}</p>
  </section>
</template>

<style scoped>
.prepared {
  margin: 2px 0 12px;
  padding: 10px 12px;
  border: 1px solid var(--line-2);
  border-radius: 8px;
  background: var(--surface-1);
}
.head {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 6px;
  color: var(--text-2);
  font: 400 12px/16px var(--font-sans);
}
.head b {
  color: var(--text-0);
  font-weight: 600;
}
.pin {
  align-self: center;
  color: var(--text-1);
}
.for {
  min-width: 0;
  overflow-wrap: anywhere;
}
.answer {
  color: var(--text-0);
  font: 400 var(--answer-size, 15px) / var(--answer-line, 22px) var(--font-sans);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  user-select: text;
}
</style>
