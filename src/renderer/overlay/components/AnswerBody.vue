<script setup lang="ts">
// The answer's text, in parts (src/renderer/shared/markdown.ts): prose as sanitized HTML, each code block with its
// Copy, each diagram drawn once complete. Markdown allows no raw HTML, no links and no images. While it writes, a
// caret ends the last line of prose or code.
import { computed } from 'vue';
import { renderAnswerParts } from '../../shared/markdown';
import AnswerCode from './AnswerCode.vue';
import AnswerDiagram from './AnswerDiagram.vue';

const props = defineProps<{ text: string; writing: boolean }>();
// Parts only grow at the end while an answer streams, so their index is a stable key: a drawn diagram stays drawn.
const parts = computed(() => renderAnswerParts(props.text));
</script>

<template>
  <div class="answer" :class="{ writing }">
    <template v-for="(part, index) in parts" :key="index">
      <!-- eslint-disable-next-line vue/no-v-html -- markdown.ts escapes the Markdown, and DOMPurify sanitizes the result. -->
      <div v-if="part.kind === 'prose'" class="prose" v-html="part.html" />
      <AnswerCode v-else-if="part.kind === 'code'" :language="part.language" :code="part.code" :html="part.html" />
      <AnswerDiagram v-else :source="part.source" :complete="part.complete" :writing="writing" />
    </template>
  </div>
</template>

<style scoped>
.writing > .prose:last-child > :deep(:last-child)::after,
.writing > .code:last-child :deep(code)::after {
  content: '';
  display: inline-block;
  width: 2px;
  height: 1em;
  margin-left: 2px;
  vertical-align: -0.15em;
  background: var(--text-2);
}
</style>
