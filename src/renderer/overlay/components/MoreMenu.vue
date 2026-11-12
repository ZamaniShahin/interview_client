<script setup lang="ts">
// The overlay's More menu, drawn inside the window: a native menu is a separate window a share can see.
import { onMounted, ref } from 'vue';
import SIcon from '../../shared/components/SIcon.vue';
import SSegmented from '../../shared/components/SSegmented.vue';
import type { Settings } from '../../../shared/settings';
import type { MoreAction } from '../more-actions';

defineProps<{ compact: boolean; textSize: Settings['textSize'] }>();
const emit = defineEmits<{ select: [action: MoreAction]; textSize: [size: Settings['textSize']]; close: [] }>();

const menu = ref<HTMLElement | null>(null);
onMounted(() => menu.value?.querySelector<HTMLElement>('[role="menuitem"]')?.focus());

function move(delta: number): void {
  const items = [...(menu.value?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
  const at = items.indexOf(document.activeElement as HTMLElement);
  items[(at + delta + items.length) % items.length]?.focus();
}
</script>

<template>
  <div
    ref="menu"
    class="menu"
    role="menu"
    aria-label="More"
    @keydown.esc.stop="emit('close')"
    @keydown.down.prevent="move(1)"
    @keydown.up.prevent="move(-1)"
  >
    <button type="button" role="menuitem" class="item" @click="emit('select', 'startOver')">Start over</button>
    <button type="button" role="menuitem" class="item" @click="emit('select', 'compact')">
      {{ compact ? 'Full view' : 'Compact view' }}<span class="key">Ctrl Shift M</span>
    </button>
    <button type="button" role="menuitem" class="item" @click="emit('select', 'hide')">
      Hide the window<span class="key">Ctrl Shift H</span>
    </button>
    <div class="sep" role="separator" />
    <div class="row">
      <span>Text size</span>
      <SSegmented
        :model-value="textSize"
        :options="[
          { value: 'S', label: 'S' },
          { value: 'M', label: 'M' },
          { value: 'L', label: 'L' },
        ]"
        label="Text size"
        size="sm"
        @update:model-value="(size) => emit('textSize', size)"
      />
    </div>
    <div class="sep" role="separator" />
    <button type="button" role="menuitem" class="item" @click="emit('select', 'end')">
      <SIcon name="stop" :size="14" />End session
    </button>
  </div>
</template>

<style scoped>
.menu {
  position: absolute;
  top: 34px;
  right: 6px;
  z-index: 5;
  width: 236px;
  padding: 4px;
  border-radius: 12px;
  /* A material of its own over the answer: nearly solid, blurring what is under it (the apple-design skill). */
  background: var(--menu);
  backdrop-filter: blur(24px) saturate(160%);
  box-shadow:
    var(--shadow-2),
    0 0 0 1px var(--line-2),
    inset 0 1px 0 var(--highlight);
  /* It opens from the button that opened it. */
  transform-origin: top right;
  animation: menu-in 160ms var(--ease-out);
}
@keyframes menu-in {
  from {
    opacity: 0;
    transform: scale(0.97);
  }
}
.item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  height: 32px;
  padding: 0 8px;
  border: 0;
  border-radius: var(--radius-chip);
  background: transparent;
  color: var(--text-1);
  font: 400 13px/16px var(--font-sans);
  text-align: left;
  white-space: nowrap;
}
.item:hover,
.item:focus-visible {
  background: var(--surface-3);
  color: var(--text-0);
}
.key {
  margin-left: auto;
  padding: 0 5px;
  border: 1px solid currentColor;
  border-radius: 4px;
  font: 500 11px/16px var(--font-sans);
  opacity: 0.72;
}
.sep {
  height: 1px;
  margin: 4px 6px;
  background: var(--line);
}
.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 36px;
  padding: 0 8px;
  color: var(--text-1);
  font: 400 13px/16px var(--font-sans);
}
</style>
