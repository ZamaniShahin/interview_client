<script setup lang="ts">
// The screenshots waiting for the next answer (3.6): a small picture of each, a way to take one back, and what comes
// next. In MANUAL they go with the next answer asked for; in AUTO the next answer reads them.
import SIconButton from '../../shared/components/SIconButton.vue';
import { screenshotImage } from '../use-screenshots';

/** `triggerKey`: Answer now's hotkey as the user has it (3.13), for the words. */
withDefaults(defineProps<{ ids: string[]; max: number; manual: boolean; triggerKey?: string }>(), {
  triggerKey: 'Ctrl+Enter',
});
const emit = defineEmits<{ remove: [id: string] }>();
</script>

<template>
  <section class="tray" aria-label="Screenshots for your next question">
    <ul class="shots">
      <li v-for="(id, i) in ids" :key="id" class="shot">
        <img v-if="screenshotImage(id)" :src="screenshotImage(id)!" :alt="`Screenshot ${i + 1}`" draggable="false" />
        <span v-else class="missing" />
        <SIconButton
          icon="close"
          :size="24"
          :label="`Remove screenshot ${i + 1}`"
          class="remove"
          @click="emit('remove', id)"
        />
      </li>
    </ul>
    <p class="line">
      <b class="num">{{ ids.length }} of {{ max }}</b>
      {{
        manual
          ? `for your next question. ${triggerKey} answers with them; anything typed goes along as a note.`
          : 'for your next question, which reads them.'
      }}
    </p>
  </section>
</template>

<style scoped>
.tray {
  flex: none;
  padding: 8px 12px 0;
  border-top: 1px solid var(--line);
}
.shots {
  display: flex;
  gap: 6px;
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
.missing {
  display: block;
  width: 100%;
  height: 100%;
}
.remove {
  position: absolute;
  top: 0;
  right: 0;
  background: var(--surface-1);
}
.line {
  margin-top: 6px;
  color: var(--text-2);
  font: 400 12px/16px var(--font-sans);
}
.line b {
  color: var(--text-1);
  font-weight: 600;
}
</style>
