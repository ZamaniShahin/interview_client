<script setup lang="ts">
// A line to say while the answer loads (backend Q47, v1's gap filler): up the moment a question is sent, gone when its
// answer starts streaming (the session's state decides that). The server's text, shown as text, never as HTML. Never
// left up longer than 30 s, as v1's: if its answer never comes (the server gone), it goes on its own.
import { onBeforeUnmount, ref, watch } from 'vue';

const props = defineProps<{ text: string | null }>();

/** How long a line may stay up when its answer never comes. */
const maxShownMs = 30_000;

const expired = ref(false);
let timer: ReturnType<typeof setTimeout> | null = null;

watch(
  () => props.text,
  (text) => {
    if (timer) clearTimeout(timer);
    timer = null;
    expired.value = false;
    if (text) timer = setTimeout(() => (expired.value = true), maxShownMs);
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  if (timer) clearTimeout(timer);
});
</script>

<template>
  <section v-if="text && !expired" class="filler" aria-live="polite">
    <span class="label">Say while it loads</span>
    <span class="text">{{ text }}</span>
  </section>
</template>

<style scoped>
.filler {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: 8px 10px 0;
  padding: 8px 10px;
  flex: none;
  border-radius: 8px;
  background: var(--surface-2);
}
.label {
  color: var(--text-2);
  font: 600 11px/14px var(--font-sans);
  letter-spacing: 0.02em;
  text-transform: uppercase;
}
.text {
  color: var(--text-0);
  font: 500 15px/22px var(--font-sans);
}
</style>
