<script setup lang="ts">
// The ◢ grip: the overlay has no OS resize border (stealth rule 5), so dragging this asks main for the new size.
// At most one request per frame while dragging.
const emit = defineEmits<{ resize: [size: { width: number; height: number }] }>();

let start: { x: number; y: number; width: number; height: number } | null = null;
let frame = 0;

function down(event: PointerEvent): void {
  (event.currentTarget as Element).setPointerCapture(event.pointerId);
  start = { x: event.screenX, y: event.screenY, width: window.outerWidth, height: window.outerHeight };
}

function move(event: PointerEvent): void {
  if (!start || frame) return;
  const from = start;
  frame = requestAnimationFrame(() => {
    frame = 0;
    emit('resize', {
      width: Math.round(from.width + event.screenX - from.x),
      height: Math.round(from.height + event.screenY - from.y),
    });
  });
}

function up(): void {
  start = null;
}
</script>

<template>
  <span class="grip no-drag" aria-hidden="true" @pointerdown="down" @pointermove="move" @pointerup="up" @pointercancel="up">
    <svg viewBox="0 0 12 12" width="12" height="12"><path d="M11 4L4 11M11 7.5L7.5 11" /></svg>
  </span>
</template>

<style scoped>
.grip {
  position: absolute;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: flex-end;
  justify-content: flex-end;
  width: 16px;
  height: 16px;
  padding: 2px;
  color: var(--text-3);
}
svg {
  fill: none;
  stroke: currentColor;
  stroke-width: 1.4;
  stroke-linecap: round;
}
</style>
