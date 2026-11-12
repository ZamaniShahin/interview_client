<script setup lang="ts">
// The session's hotkeys in Settings (3.13): each action's keys, changed by pressing the new ones. Nothing is global
// outside a session, so the keys pressed here reach this window; the change is checked as it is pressed (Ctrl or Alt,
// no clash, nothing the system keeps) and kept with the settings once saved.
import { computed, onBeforeUnmount, ref } from 'vue';
import {
  acceleratorOf,
  capsOf,
  effectiveHotkeys,
  hotkeyActions,
  hotkeyLabels,
  hotkeyProblem,
  sessionHotkeys,
  type HotkeyAction,
  type HotkeyOverrides,
} from '../../../shared/hotkeys';
import SButton from '../../shared/components/SButton.vue';
import SKbd from '../../shared/components/SKbd.vue';

const props = defineProps<{ changed: HotkeyOverrides }>();
const emit = defineEmits<{ save: [changed: HotkeyOverrides] }>();

const keys = computed(() => effectiveHotkeys(props.changed));
/** The action whose new keys are being pressed, and what was pressed so far. */
const listening = ref<HotkeyAction | null>(null);
const pressed = ref<string | null>(null);

const problem = computed(() =>
  listening.value && pressed.value ? hotkeyProblem(listening.value, pressed.value, keys.value) : null,
);

function onKey(event: KeyboardEvent): void {
  if (!listening.value) return;
  event.preventDefault();
  event.stopPropagation();
  // Esc alone stops listening, keeping the keys as they were.
  if (event.code === 'Escape' && !event.ctrlKey && !event.altKey && !event.shiftKey && !event.metaKey) {
    stop();
    return;
  }
  const accelerator = acceleratorOf(event);
  if (accelerator) pressed.value = accelerator;
}

function listen(action: HotkeyAction): void {
  listening.value = action;
  pressed.value = null;
  window.addEventListener('keydown', onKey, true);
}

function stop(): void {
  listening.value = null;
  pressed.value = null;
  window.removeEventListener('keydown', onKey, true);
}

onBeforeUnmount(stop);

function save(): void {
  const action = listening.value;
  const chosen = pressed.value;
  if (!action || !chosen || problem.value) return;
  const next = { ...props.changed };
  // The default again is no change at all.
  if (chosen === sessionHotkeys[action]) delete next[action];
  else next[action] = chosen;
  stop();
  emit('save', next);
}

function reset(action: HotkeyAction): void {
  const next = { ...props.changed };
  delete next[action];
  emit('save', next);
}

const anyChanged = computed(() => Object.keys(props.changed).length > 0);
</script>

<template>
  <ul class="hotkeys" aria-label="Hotkeys">
    <li v-for="action in hotkeyActions" :key="action" class="key">
      <div class="row">
        <span class="name">{{ hotkeyLabels[action] }}</span>
        <SKbd :keys="capsOf(keys[action])" />
        <SButton
          v-if="listening !== action"
          size="sm"
          variant="ghost"
          :aria-label="`Change “${hotkeyLabels[action]}”`"
          :disabled="listening !== null"
          @click="listen(action)"
        >
          Change
        </SButton>
        <SButton
          v-if="changed[action] && listening !== action"
          size="sm"
          variant="ghost"
          :aria-label="`Put back “${hotkeyLabels[action]}”`"
          :disabled="listening !== null"
          @click="reset(action)"
        >
          Default
        </SButton>
      </div>
      <div
        v-if="listening === action"
        class="listen"
        role="group"
        :aria-label="`New keys for “${hotkeyLabels[action]}”`"
      >
        <p v-if="!pressed" class="small">Press the new keys, with Ctrl or Alt. Esc keeps them as they are.</p>
        <template v-else>
          <SKbd :keys="capsOf(pressed)" />
          <p v-if="problem" class="small problem" role="alert">{{ problem }}</p>
        </template>
        <div class="actions">
          <SButton size="sm" variant="ghost" @click="stop">Cancel</SButton>
          <SButton size="sm" variant="primary" :disabled="!pressed || problem !== null" @click="save">Save</SButton>
        </div>
      </div>
    </li>
  </ul>
  <SButton v-if="anyChanged && listening === null" size="sm" variant="ghost" class="all" @click="emit('save', {})">
    Put back every default
  </SButton>
  <p class="small">
    They work only while a session runs, so they never take keys from other apps the rest of the time.
  </p>
</template>

<style scoped>
.hotkeys {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 32px;
}
.name {
  flex: 1;
  min-width: 0;
}
.listen {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 4px 0 8px;
  padding: 10px 12px;
  border: 1px solid var(--line-2);
  border-radius: 8px;
  background: var(--surface-1);
}
.problem {
  color: var(--danger);
}
.actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
.all {
  align-self: flex-start;
}
</style>
