<script setup lang="ts">
// This interview's answers, ‹ 3 of 7 ›. Looking back offers the way to the newest; a new answer that starts meanwhile
// is announced, never forced on the reader (handoff §7.1).
import SButton from '../../shared/components/SButton.vue';
import SIconButton from '../../shared/components/SIconButton.vue';

defineProps<{ position: number; total: number; lookingBack: boolean; newWriting: boolean }>();
const emit = defineEmits<{ previous: []; next: []; live: [] }>();
</script>

<template>
  <nav class="pager" aria-label="Answers in this interview">
    <SIconButton icon="chevronLeft" label="Earlier answer" :size="24" :disabled="position <= 1" @click="emit('previous')" />
    <span class="pos num" aria-live="polite">{{ position }} of {{ total }}</span>
    <SIconButton icon="chevronRight" label="Later answer" :size="24" :disabled="position >= total" @click="emit('next')" />
    <SButton v-if="lookingBack" :variant="newWriting ? 'primary' : 'secondary'" size="sm" class="live" @click="emit('live')">
      {{ newWriting ? 'New answer' : 'Back to live' }}
    </SButton>
  </nav>
</template>

<style scoped>
.pager {
  display: inline-flex;
  align-items: center;
  margin-left: auto;
  flex: none;
}
.pos {
  padding: 0 2px;
  color: var(--text-2);
  font: 500 12px/16px var(--font-sans);
  white-space: nowrap;
}
.live {
  margin-left: 6px;
}
</style>
