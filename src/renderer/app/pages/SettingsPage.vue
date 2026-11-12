<script setup lang="ts">
// Settings: the UI canvas's proposals for the handoff's §14. Main owns them; every window follows a change at once.
import SSegmented from '../../shared/components/SSegmented.vue';
import SSlider from '../../shared/components/SSlider.vue';
import SSwitch from '../../shared/components/SSwitch.vue';
import { minOpacity } from '../../../shared/settings';
import { hasGlass, useSettings } from '../../shared/use-settings';
import HotkeySettings from '../components/HotkeySettings.vue';

const { settings, update } = useSettings(window.appApi);
/** Whether Windows draws the glass behind the windows: then each background has its own opacity. */
const glass = hasGlass();
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
          <span>{{ glass ? 'Overlay background' : 'Overlay opacity' }}</span>
          <SSlider
            :model-value="settings.overlayOpacity"
            :min="minOpacity"
            :max="100"
            :step="5"
            unit="%"
            :label="glass ? 'Overlay background' : 'Overlay opacity'"
            @update:model-value="(overlayOpacity) => update({ overlayOpacity })"
          />
        </div>
        <div v-if="glass" class="row">
          <span>Window background</span>
          <SSlider
            :model-value="settings.appOpacity"
            :min="minOpacity"
            :max="100"
            :step="5"
            unit="%"
            label="Window background"
            @update:model-value="(appOpacity) => update({ appOpacity })"
          />
        </div>
        <p class="small">
          {{
            glass
              ? 'How much of the screen shows through, blurred, behind the text; the text stays solid. For your comfort only: the overlay is left out of shares either way.'
              : 'Without Windows 11’s glass, the overlay fades as a whole. For your comfort only: it is left out of shares either way.'
          }}
        </p>

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
/* A setting's name stays on one line beside its control. */
.row > span {
  white-space: nowrap;
}
.section {
  margin-top: 8px;
}
</style>
