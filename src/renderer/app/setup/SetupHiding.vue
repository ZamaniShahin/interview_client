<script setup lang="ts">
// F1 · 5b: Test hiding. The user can't see the overlay in their own share, so they check with a real one: the overlay
// shows with its test card (main opens the real overlay window), and they say what the share sent. Finishing doesn't
// need the test. Alone, it is Help's "Test hiding".
import { onBeforeUnmount, ref } from 'vue';
import SBanner from '../../shared/components/SBanner.vue';
import SButton from '../../shared/components/SButton.vue';
import { useAppStore } from '../app-store';
import SetupStep from './SetupStep.vue';

defineProps<{ /** Run from Help, not as the setup's last step. */ alone: boolean }>();
const emit = defineEmits<{ back: []; finish: [] }>();
const store = useAppStore();

const seen = ref(false);
const hidden = ref(false);
const failure = ref<string | null>(null);

async function act(action: 'show' | 'hidden'): Promise<void> {
  failure.value = null;
  const result = await store.hidingTest(action);
  if (!result.ok) failure.value = result.message;
  else if (action === 'hidden') {
    hidden.value = true;
    seen.value = false;
  }
}

function seeIt(): void {
  seen.value = true;
  hidden.value = false;
}

function leave(to: 'back' | 'finish'): void {
  if (to === 'back') emit('back');
  else emit('finish');
}

// Back, Finish, Skip or the window closing: the test card goes with the step.
onBeforeUnmount(() => void store.hidingTest('hide'));
</script>

<template>
  <SetupStep
    heading="Test hiding"
    icon="shield"
    lede="Sotto's windows are left out of screen shares and recordings. Check it once with a real share."
  >
    <ol class="steps">
      <li>
        Start sharing your whole screen in your call app: Zoom, Meet or Teams. A meeting with only yourself is enough.
      </li>
      <li>Press <strong>Show the overlay</strong>. It appears on your screen with a test card.</li>
      <li>
        Look at what the share sends, in its preview or from a second device. The overlay and this window should not be
        in it.
      </li>
    </ol>
    <div class="actions">
      <SButton @click="act('show')">Show the overlay</SButton>
      <SButton variant="ghost" @click="seeIt">I can see it in the share</SButton>
      <SButton variant="primary" @click="act('hidden')">It's hidden</SButton>
    </div>
    <p class="small">
      "I can see it" opens the fixes: a call app's own capture mode, or an older Windows version. Finishing doesn't need
      the test.
    </p>
    <SBanner v-if="hidden" tone="done"
      ><strong>Sotto is hidden from your share.</strong> It stays hidden the same way in a session.</SBanner
    >
    <SBanner v-if="seen" tone="attention">
      <strong>If the share shows Sotto:</strong>
      <ul class="fixes">
        <li>
          Your call app may be capturing in a mode that shows every window. Look in its screen-sharing settings for an
          advanced capture option, and switch it back to the default.
        </li>
        <li>
          Windows older than Windows 10, version 2004, shows protected windows as black boxes instead of leaving them
          out. Update Windows.
        </li>
      </ul>
      Then test again.
    </SBanner>
    <SBanner v-if="failure" tone="attention">{{ failure }}</SBanner>
    <template #foot>
      <SButton v-if="!alone" variant="ghost" @click="leave('back')">Back</SButton>
      <span class="spacer" />
      <SButton v-if="!alone" variant="ghost" @click="leave('finish')">Skip the test</SButton>
      <SButton variant="primary" @click="leave('finish')">{{ alone ? 'Done' : 'Finish' }}</SButton>
    </template>
  </SetupStep>
</template>

<style scoped>
.steps {
  margin: 0 0 16px;
  padding-left: 20px;
  color: var(--text-1);
  font: 400 14px/20px var(--font-sans);
}
.steps li {
  margin-bottom: 8px;
}
.actions {
  display: flex;
  gap: 8px;
  margin-bottom: 8px;
}
.small {
  margin-bottom: 12px;
}
.fixes {
  margin: 6px 0;
  padding-left: 18px;
}
</style>
