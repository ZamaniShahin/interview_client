<script setup lang="ts">
// The screenshots an answer read (3.6), under its question: a small picture of each, and a way to attach one again for
// the next question, so the model sees it again rather than only its notes (v1's ＋). An old one may no longer be kept.
import SIconButton from '../../shared/components/SIconButton.vue';
import { screenshotImage } from '../use-screenshots';

defineProps<{ ids: string[]; canAttach: boolean }>();
const emit = defineEmits<{ attach: [id: string] }>();
</script>

<template>
  <ul class="strip" aria-label="Screenshots this answer read">
    <li v-for="(id, i) in ids" :key="id" class="shot">
      <img v-if="screenshotImage(id)" :src="screenshotImage(id)!" :alt="`Screenshot ${i + 1}`" draggable="false" />
      <span v-else-if="screenshotImage(id) === null" class="gone">No longer kept</span>
      <SIconButton
        v-if="canAttach && screenshotImage(id)"
        icon="plus"
        :size="24"
        :label="`Attach screenshot ${i + 1} again, for your next question`"
        class="again"
        @click="emit('attach', id)"
      />
    </li>
  </ul>
</template>

<style scoped>
.strip {
  display: flex;
  gap: 6px;
  margin-top: 8px;
  padding: 0;
  list-style: none;
}
.shot {
  position: relative;
  width: 64px;
  height: 44px;
  overflow: hidden;
  border: 1px solid var(--line-2);
  border-radius: 6px;
  background: var(--surface-2);
}
.shot img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.gone {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  padding: 2px;
  color: var(--text-3);
  font: 400 10px/12px var(--font-sans);
  text-align: center;
}
.again {
  position: absolute;
  right: 0;
  bottom: 0;
  background: var(--surface-1);
}
</style>
