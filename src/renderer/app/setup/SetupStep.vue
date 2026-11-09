<script setup lang="ts">
// One step of the setup (F1): its heading and lede, what it asks, and its footer of Back, a note, and the way on.
import type { IconName } from '../../shared/icons';
import SIcon from '../../shared/components/SIcon.vue';

defineProps<{ heading: string; lede?: string; icon?: IconName }>();
</script>

<template>
  <div class="step">
    <div class="content">
      <h1 id="setup-heading" class="heading">
        <SIcon v-if="icon" :name="icon" :size="20" />
        {{ heading }}
      </h1>
      <p v-if="lede" class="lede">{{ lede }}</p>
      <slot />
    </div>
    <footer class="foot">
      <slot name="foot" />
    </footer>
  </div>
</template>

<style scoped>
.step {
  display: flex;
  flex: 1;
  min-height: 0;
  flex-direction: column;
}
.content {
  flex: 1;
  min-height: 0;
  max-width: 640px;
  overflow-y: auto;
}
.heading {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--text-0);
  font: 600 22px/30px var(--font-sans);
}
.lede {
  margin: 6px 0 18px;
  color: var(--text-2);
  font: 400 14px/20px var(--font-sans);
}
.foot {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: none;
  padding-top: 16px;
  border-top: 1px solid var(--line);
}
.foot :slotted(.spacer) {
  flex: 1;
}
.foot :slotted(.note) {
  color: var(--text-2);
  font: 400 12px/16px var(--font-sans);
}
</style>
