<script setup lang="ts">
// The answer's text: Markdown rendered by src/renderer/shared/markdown.ts, which allows no raw HTML, no links and no
// images, and sanitizes what it produces. While it writes, a caret ends the last line.
import { computed } from 'vue';
import { renderAnswer } from '../../shared/markdown';

const props = defineProps<{ text: string; writing: boolean }>();
const html = computed(() => renderAnswer(props.text));
</script>

<template>
  <!-- eslint-disable-next-line vue/no-v-html -- renderAnswer escapes the Markdown and DOMPurify sanitizes the result. -->
  <div class="answer" :class="{ writing }" v-html="html" />
</template>

<style scoped>
.writing > :deep(:last-child)::after {
  content: '';
  display: inline-block;
  width: 2px;
  height: 1em;
  margin-left: 2px;
  vertical-align: -0.15em;
  background: var(--text-2);
}
</style>
