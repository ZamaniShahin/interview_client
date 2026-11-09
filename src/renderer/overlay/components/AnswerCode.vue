<script setup lang="ts">
// A code block of an answer (canvas: Overlay, Live): its language, its source in the syntax colors, and Copy. Copy
// puts the source on the clipboard as the model wrote it, never the colored HTML. Main does the copying, since the
// overlay never takes focus. "Copied" shows for a moment.
import { onBeforeUnmount, ref } from 'vue';
import SIcon from '../../shared/components/SIcon.vue';

const props = defineProps<{ language: string; code: string; html: string }>();

const copied = ref(false);
let timer: ReturnType<typeof setTimeout> | undefined;

function copy(): void {
  window.overlayApi.copy(props.code);
  copied.value = true;
  clearTimeout(timer);
  timer = setTimeout(() => (copied.value = false), 1500);
}

onBeforeUnmount(() => clearTimeout(timer));
</script>

<template>
  <div class="code">
    <div class="code-head">
      <span>{{ language }}</span>
      <button type="button" class="link" :disabled="!code" :aria-label="`Copy the ${language} code`" @click="copy">
        <SIcon name="copy" :size="14" />
        <span aria-live="polite">{{ copied ? 'Copied' : 'Copy' }}</span>
      </button>
    </div>
    <!-- eslint-disable-next-line vue/no-v-html -- highlight.js escapes the source, and markdown.ts sanitizes the result. -->
    <pre><code v-html="html" /></pre>
  </div>
</template>

<style scoped>
.link {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 24px;
  margin-left: auto;
  padding: 0 6px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--text-2);
  font: 600 12px/16px var(--font-sans);
  white-space: nowrap;
}
.link:hover:not(:disabled) {
  background: var(--surface-2);
  color: var(--text-0);
}
.link:disabled {
  color: var(--text-off);
}
</style>
