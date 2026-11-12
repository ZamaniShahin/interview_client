<script setup lang="ts">
// One practice answer's feedback (the server's scorer, v1's): the score, what was good, what to improve, a stronger
// answer to say, and the user's own prepared answer when the question came from the answer bank. It is all the model's
// words, so it is drawn as text, never as HTML.
import type { PracticeFeedbackView } from '../../../shared/practice';

defineProps<{ feedback: PracticeFeedbackView }>();
</script>

<template>
  <section class="feedback" aria-label="Feedback">
    <p class="score">
      <template v-if="feedback.score !== null">
        <span class="value num">{{ feedback.score }}</span>
        <span class="of">/ 10</span>
      </template>
      <span v-else class="none">No score this time.</span>
    </p>
    <div v-if="feedback.good.length > 0" class="part">
      <p class="eyebrow">Good</p>
      <ul class="points">
        <li v-for="(point, i) in feedback.good" :key="i">{{ point }}</li>
      </ul>
    </div>
    <div v-if="feedback.improve.length > 0" class="part">
      <!-- A reply in prose rather than in the shape asked for is kept as the one thing to improve (`Raw`). -->
      <p class="eyebrow">{{ feedback.raw ? 'What the scorer said' : 'To improve' }}</p>
      <ul class="points">
        <li v-for="(point, i) in feedback.improve" :key="i">{{ point }}</li>
      </ul>
    </div>
    <div v-if="feedback.modelAnswer.trim() !== ''" class="part">
      <p class="eyebrow">A stronger answer</p>
      <p class="text">{{ feedback.modelAnswer }}</p>
    </div>
    <div v-if="feedback.prepared.trim() !== ''" class="part">
      <p class="eyebrow">Your prepared answer</p>
      <p class="text">{{ feedback.prepared }}</p>
    </div>
  </section>
</template>

<style scoped>
.feedback {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.score {
  display: flex;
  align-items: baseline;
  gap: 6px;
}
.value {
  color: var(--text-0);
  font: 600 28px/32px var(--font-sans);
  letter-spacing: -0.01em;
}
.of,
.none {
  color: var(--text-2);
}
.part {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.points {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 0;
  padding-left: 18px;
  color: var(--text-1);
}
.text {
  color: var(--text-1);
  white-space: pre-wrap;
}
</style>
