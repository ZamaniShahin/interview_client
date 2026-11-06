<script setup lang="ts">
import { icons, type IconName } from '../icons';

withDefaults(defineProps<{ name: IconName; size?: 12 | 14 | 16 | 20 | 24 }>(), { size: 16 });
</script>

<template>
  <svg class="icon" :width="size" :height="size" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
    <path :d="icons[name]" />
  </svg>
</template>

<style scoped>
.icon {
  flex: none;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.6;
  stroke-linecap: round;
  stroke-linejoin: round;
}
</style>
