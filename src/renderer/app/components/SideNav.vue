<script setup lang="ts" generic="T extends string">
// The window's sidebar. The current page carries aria-current and changes weight and fill, never color alone.
import type { IconName } from '../../shared/icons';
import SIcon from '../../shared/components/SIcon.vue';

defineProps<{ items: { id: T; label: string; icon: IconName }[]; current: T }>();
const emit = defineEmits<{ select: [id: T] }>();
</script>

<template>
  <nav class="nav" aria-label="Main">
    <button
      v-for="item in items"
      :key="item.id"
      type="button"
      class="item"
      :aria-current="item.id === current ? 'page' : undefined"
      @click="emit('select', item.id)"
    >
      <SIcon :name="item.icon" />{{ item.label }}
    </button>
    <div class="foot"><slot name="footer" /></div>
  </nav>
</template>

<style scoped>
.nav {
  display: flex;
  flex-direction: column;
  gap: 2px;
  width: 196px;
  flex: none;
  padding: 12px 8px;
  border-right: 1px solid var(--line);
}
.item {
  display: flex;
  align-items: center;
  gap: 10px;
  height: 34px;
  padding: 0 10px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--text-2);
  font: 500 13px/16px var(--font-sans);
  text-align: left;
}
.item:hover {
  background: var(--surface-1);
  color: var(--text-0);
}
.item[aria-current='page'] {
  background: var(--surface-2);
  color: var(--text-0);
  font-weight: 600;
}
.foot {
  margin-top: auto;
  padding: 12px 10px 4px;
  border-top: 1px solid var(--line);
}
</style>
