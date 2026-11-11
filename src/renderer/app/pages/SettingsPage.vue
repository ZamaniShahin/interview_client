<script setup lang="ts">
// Settings: the UI canvas's proposals for the handoff's §14. Main owns them; every window follows a change at once.
import SSegmented from '../../shared/components/SSegmented.vue';
import SSwitch from '../../shared/components/SSwitch.vue';
import { useSettings } from '../../shared/use-settings';
import HotkeySettings from '../components/HotkeySettings.vue';

const { settings, update } = useSettings(window.appApi);
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
        <SSwitch :model-value="settings.startCompact" label="Start in compact view" @update:model-value="(startCompact) => update({ startCompact })" />
      </div>

      <div class="col">
        <p class="eyebrow">Kept on this computer</p>
        <SSwitch :model-value="settings.keepTranscripts" label="Keep transcripts" @update:model-value="(keepTranscripts) => update({ keepTranscripts })" />
        <SSwitch :model-value="settings.keepRecordings" label="Keep recordings" @update:model-value="(keepRecordings) => update({ keepRecordings })" />
        <p class="small">Both off by default, encrypted, never sent anywhere.</p>

        <p class="eyebrow section">Hotkeys</p>
        <HotkeySettings :changed="settings.hotkeys" @save="(hotkeys) => update({ hotkeys })" />
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
.section {
  margin-top: 8px;
}
</style>
