<script setup lang="ts">
// Settings: the UI canvas's proposals for the handoff's §14. Main owns them; every window follows a change at once.
import SKbd from '../../shared/components/SKbd.vue';
import SSegmented from '../../shared/components/SSegmented.vue';
import SSwitch from '../../shared/components/SSwitch.vue';
import { useSettings } from '../../shared/use-settings';

const { settings, update } = useSettings(window.appApi);

const hotkeys = [
  { action: 'Answer now', keys: ['Ctrl', 'Enter'] },
  { action: 'Type in the overlay', keys: ['Ctrl', 'Shift', 'Space'] },
  { action: 'AUTO or MANUAL', keys: ['Ctrl', 'Shift', 'A'] },
  { action: 'Pause or resume', keys: ['Ctrl', 'Shift', 'P'] },
  { action: 'Earlier or later answer', keys: ['Ctrl', 'Shift', '←', '→'] },
  { action: 'Compact or full view', keys: ['Ctrl', 'Shift', 'M'] },
  { action: 'Hide or show the overlay', keys: ['Ctrl', 'Shift', 'H'] },
];
</script>

<template>
  <section class="page" aria-labelledby="settings-title">
    <h1 id="settings-title" class="title">Settings</h1>
    <div class="grid">
      <div class="col">
        <p class="eyebrow">Appearance</p>
        <div class="row">
          <span>Theme</span>
          <SSegmented
            :model-value="settings.theme"
            :options="[
              { value: 'dark', label: 'Dark' },
              { value: 'light', label: 'Light' },
            ]"
            label="Theme"
            @update:model-value="(theme) => update({ theme })"
          />
        </div>
        <div class="row">
          <span>Answer text</span>
          <SSegmented
            :model-value="settings.textSize"
            :options="[
              { value: 'S', label: 'S' },
              { value: 'M', label: 'M' },
              { value: 'L', label: 'L' },
            ]"
            label="Answer text size"
            @update:model-value="(textSize) => update({ textSize })"
          />
        </div>
        <div class="row">
          <span>Overlay opacity</span>
          <SSegmented
            :model-value="settings.opacity"
            :options="[
              { value: 100, label: '100%' },
              { value: 90, label: '90%' },
              { value: 80, label: '80%' },
            ]"
            label="Overlay opacity"
            @update:model-value="(opacity) => update({ opacity })"
          />
        </div>
        <p class="small">Opacity is for your comfort only: the overlay is left out of shares either way.</p>

        <p class="eyebrow section">During a session</p>
        <SSwitch
          :model-value="settings.trayOnly"
          label="Show Sotto in the tray only"
          description="A full-screen share shows the taskbar."
          @update:model-value="(trayOnly) => update({ trayOnly })"
        />
        <SSwitch :model-value="settings.startCompact" label="Start in compact view" @update:model-value="(startCompact) => update({ startCompact })" />
      </div>

      <div class="col">
        <p class="eyebrow">Kept on this computer</p>
        <SSwitch :model-value="settings.keepTranscripts" label="Keep transcripts" @update:model-value="(keepTranscripts) => update({ keepTranscripts })" />
        <SSwitch :model-value="settings.keepRecordings" label="Keep recordings" @update:model-value="(keepRecordings) => update({ keepRecordings })" />
        <p class="small">Both off by default, encrypted, never sent anywhere.</p>

        <p class="eyebrow section">Hotkeys</p>
        <div v-for="hotkey in hotkeys" :key="hotkey.action" class="row key-row">
          <span>{{ hotkey.action }}</span>
          <SKbd :keys="hotkey.keys" />
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.title {
  margin-bottom: 16px;
  color: var(--text-0);
  font: 600 24px/32px var(--font-sans);
}
.grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px 28px;
}
.col {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.key-row {
  min-height: 32px;
  border-bottom: 1px solid var(--line);
  font-size: 13px;
}
.section {
  margin-top: 8px;
}
</style>
