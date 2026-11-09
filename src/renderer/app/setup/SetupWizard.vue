<script setup lang="ts">
// The setup wizard (F1): five steps in the window, before any session; Help runs them again. It opens by itself until
// it has been finished once. The stepper only shows where the user is: later steps can't be skipped to. Alone, a
// screen is the notice whose words changed, or Help's Test hiding.
import { computed } from 'vue';
import { setupSteps } from '../../../shared/first-run';
import SStepper from '../../shared/components/SStepper.vue';
import { setupScreens, useAppStore } from '../app-store';
import SetupDocuments from './SetupDocuments.vue';
import SetupHiding from './SetupHiding.vue';
import SetupHotkeys from './SetupHotkeys.vue';
import SetupNotice from './SetupNotice.vue';
import SetupSignIn from './SetupSignIn.vue';
import SetupSoundCheck from './SetupSoundCheck.vue';

const store = useAppStore();
const screen = computed(() => store.setup?.screen ?? 'notice');
const mode = computed(() => store.setup?.mode ?? 'full');
/** Step 5 has two screens: the hotkeys, then Test hiding. */
const step = computed(() => Math.min(setupScreens.indexOf(screen.value), setupSteps.length - 1));

function next(): void {
  if (mode.value !== 'full') {
    store.closeSetup();
    return;
  }
  const following = setupScreens[setupScreens.indexOf(screen.value) + 1];
  if (following) store.showSetupScreen(following);
}

function back(): void {
  const earlier = setupScreens[setupScreens.indexOf(screen.value) - 1];
  if (earlier) store.showSetupScreen(earlier);
}

async function finish(): Promise<void> {
  if (mode.value === 'full') await store.finishSetup();
  store.closeSetup();
}
</script>

<template>
  <section class="wizard" aria-labelledby="setup-heading">
    <SStepper v-if="mode === 'full'" :steps="[...setupSteps]" :current="step" class="stepper" />
    <SetupNotice v-if="screen === 'notice'" :alone="mode === 'notice'" @next="next" />
    <SetupSignIn v-else-if="screen === 'signIn'" @back="back" @next="next" />
    <SetupDocuments v-else-if="screen === 'documents'" @back="back" @next="next" />
    <SetupSoundCheck v-else-if="screen === 'soundCheck'" @back="back" @next="next" />
    <SetupHotkeys v-else-if="screen === 'hotkeys'" @back="back" @next="next" />
    <SetupHiding v-else :alone="mode === 'hiding'" @back="back" @finish="finish" />
  </section>
</template>

<style scoped>
.wizard {
  display: flex;
  flex-direction: column;
  height: 100%;
}
.stepper {
  margin-bottom: 24px;
}
</style>
