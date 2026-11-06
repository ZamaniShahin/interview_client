<script setup lang="ts">
defineProps<{ keys: string[] }>();
</script>

<template>
  <span class="keys">
    <kbd v-for="key in keys" :key="key">{{ key }}</kbd>
  </span>
</template>

<style scoped>
.keys {
  display: inline-flex;
  gap: 3px;
}
kbd {
  display: inline-flex;
  align-items: center;
  height: 22px;
  padding: 0 7px;
  border: 1px solid var(--line-2);
  border-bottom-width: 2px;
  border-radius: 5px;
  background: var(--surface-1);
  color: var(--text-0);
  font: 500 12px/16px var(--font-sans);
}
</style>
