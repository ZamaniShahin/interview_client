<script setup lang="ts">
// The window's own title bar: the system frame is off, so this is where it is dragged, minimized and closed.
import SIconButton from '../../shared/components/SIconButton.vue';

defineProps<{ subtitle?: string }>();
const emit = defineEmits<{ minimize: []; maximize: []; close: [] }>();
</script>

<template>
  <header class="chrome drag-area">
    <span class="wordmark"><span class="mark" aria-hidden="true" />Sotto</span>
    <span v-if="subtitle" class="small subtitle">{{ subtitle }}</span>
    <span class="spacer" />
    <div class="controls">
      <SIconButton icon="minimize" label="Minimize" @click="emit('minimize')" />
      <SIconButton icon="maximize" label="Maximize" @click="emit('maximize')" />
      <SIconButton icon="close" label="Close" @click="emit('close')" />
    </div>
  </header>
</template>

<style scoped>
.chrome {
  display: flex;
  align-items: center;
  height: 36px;
  padding-left: 12px;
  flex: none;
  border-bottom: 1px solid var(--line);
}
.wordmark {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: var(--text-0);
  font: 600 13px/16px var(--font-sans);
}
/* A placeholder mark: Sotto has no logo yet (Q14). */
.mark {
  width: 14px;
  height: 14px;
  border: 2px solid var(--text-0);
  border-radius: 4px;
}
.subtitle {
  margin-left: 12px;
}
.controls {
  display: flex;
}
.controls :deep(.ib) {
  width: 44px;
  height: 36px;
  border-radius: 0;
}
</style>
