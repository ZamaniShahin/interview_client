<script setup lang="ts">
// A diagram of an answer (```mermaid), drawn by Mermaid once its closing fence has arrived (shared/diagram.ts). While
// it streams, "Drawing the diagram…" holds its place. A source Mermaid can't read, or one the answer stopped in the
// middle of, shows as its code block, which still reads for a diagram drawn in text. A theme change draws it again in
// the new colors.
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { diagrams, type DiagramDrawer } from '../../shared/diagram';
import { highlightCode } from '../../shared/markdown';
import AnswerCode from './AnswerCode.vue';

const props = withDefaults(
  defineProps<{ source: string; complete: boolean; writing: boolean; drawer?: DiagramDrawer }>(),
  {
    drawer: () => diagrams,
  },
);

/** The drawing: its SVG, `null` when it can't be drawn, `undefined` until it is. */
const svg = ref<string | null | undefined>(undefined);

// The theme is a class on <html> (use-settings.ts): a change there may change the colors a drawing was made in.
const theme = ref(0);
const observer = new MutationObserver(() => theme.value++);
observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
onBeforeUnmount(() => observer.disconnect());

watch(
  [() => props.source, () => props.complete, theme],
  async ([source, complete]) => {
    if (!complete) {
      svg.value = undefined;
      return;
    }
    const ready = props.drawer.drawn(source);
    if (ready !== undefined) {
      svg.value = ready;
      return;
    }
    svg.value = undefined;
    const drawn = await props.drawer.draw(source);
    // Only if it is still this diagram: the answer may have moved on meanwhile.
    if (props.source === source && props.complete) svg.value = drawn;
  },
  { immediate: true },
);

const drawing = computed(() => svg.value === undefined && (props.complete || props.writing));
const escaped = computed(() => highlightCode(props.source, 'mermaid'));
</script>

<template>
  <!-- eslint-disable-next-line vue/no-v-html -- Mermaid draws in strict mode, and shared/diagram.ts sanitizes its SVG. -->
  <div v-if="svg" class="dia" role="img" aria-label="Diagram" v-html="svg" />
  <div v-else-if="drawing" class="dia drawing" role="status">Drawing the diagram…</div>
  <AnswerCode v-else language="Diagram" :code="source" :html="escaped" />
</template>
