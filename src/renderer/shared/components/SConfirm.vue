<script setup lang="ts">
// A confirmation drawn in place, under what it is about. A native dialog is a separate window a share can see.
import { onMounted, ref } from 'vue';
import SButton from './SButton.vue';

withDefaults(
  defineProps<{ question: string; detail?: string; confirmLabel: string; cancelLabel?: string; destructive?: boolean }>(),
  { detail: undefined, cancelLabel: 'Cancel', destructive: false },
);
const emit = defineEmits<{ confirm: []; cancel: [] }>();

const root = ref<HTMLElement | null>(null);
onMounted(() => root.value?.focus());
</script>

<template>
  <div ref="root" class="confirm" role="group" :aria-label="question" tabindex="-1" @keydown.esc.stop="emit('cancel')">
    <p class="question">{{ question }}</p>
    <p v-if="detail" class="detail">{{ detail }}</p>
    <div class="actions">
      <SButton :variant="destructive ? 'danger' : 'primary'" size="sm" @click="emit('confirm')">{{ confirmLabel }}</SButton>
      <SButton variant="ghost" size="sm" @click="emit('cancel')">{{ cancelLabel }}</SButton>
    </div>
  </div>
</template>

<style scoped>
.confirm {
  padding: 12px;
  border: 1px solid var(--line-2);
  border-radius: var(--radius-card);
  outline: none;
  background: var(--surface-2);
}
.question {
  color: var(--text-0);
  font: 600 14px/20px var(--font-sans);
}
.detail {
  margin-top: 2px;
  color: var(--text-2);
  font: 400 13px/18px var(--font-sans);
}
.actions {
  display: flex;
  gap: 8px;
  margin-top: 10px;
}
</style>
