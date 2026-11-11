<script setup lang="ts">
// One answer kept in history (3.9), drawn by the overlay's own AnswerBody, as the overlay drew it: Markdown through
// markdown.ts and DOMPurify, code colored with its Copy, a diagram drawn. Only the size is the window's own.
import AnswerBody from '../../overlay/components/AnswerBody.vue';

defineProps<{ text: string }>();
</script>

<template>
  <div class="kept">
    <AnswerBody :text="text" :writing="false" />
  </div>
</template>

<style scoped>
/* The window's own size, not the overlay's setting. */
.kept {
  --answer-size: 14px;
  --answer-line: 22px;
  overflow-wrap: anywhere;
}
</style>
