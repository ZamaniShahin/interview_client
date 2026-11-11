<script setup lang="ts">
// F1 · 5a: the hotkeys, the list main registers during a session (src/shared/hotkeys.ts). They work while the call app
// keeps the keyboard; only the focus key moves it to Sotto. They are the keys in effect: Settings changes them (3.13).
import { computed } from 'vue';
import { effectiveHotkeys, hotkeyRows, hotkeyText, keysOf } from '../../../shared/hotkeys';
import { useSettings } from '../../shared/use-settings';
import SButton from '../../shared/components/SButton.vue';
import SKbd from '../../shared/components/SKbd.vue';
import SetupStep from './SetupStep.vue';

const emit = defineEmits<{ back: []; next: [] }>();

const { settings } = useSettings(window.appApi);
const keys = computed(() => effectiveHotkeys(settings.value.hotkeys));
const lede = computed(
  () =>
    `These work while your call app has the keyboard. Only ${hotkeyText('focus', keys.value)} moves the keyboard to Sotto.`,
);
</script>

<template>
  <SetupStep heading="Your hands stay on the call" :lede="lede">
    <ul class="keys">
      <li v-for="row in hotkeyRows" :key="row.label" class="key">
        <span>{{ row.label }}</span>
        <SKbd :keys="keysOf(row.actions, keys)" />
      </li>
    </ul>
    <template #foot>
      <SButton variant="ghost" @click="emit('back')">Back</SButton>
      <span class="spacer" />
      <SButton variant="primary" @click="emit('next')">Continue</SButton>
    </template>
  </SetupStep>
</template>

<style scoped>
.keys {
  margin: 0;
  padding: 0;
  list-style: none;
}
.key {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 40px;
  border-bottom: 1px solid var(--line);
  color: var(--text-1);
  font: 400 14px/20px var(--font-sans);
}
</style>
