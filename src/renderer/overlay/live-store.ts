// The overlay's copy of the session's view state. Main owns the state and sends it; this only mirrors it, so a
// reload of the overlay loses nothing.
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import type { OverlayCommand } from '../../shared/ipc';
import { initialLiveState, isLookingBack, visibleAnswerIndex, type LiveViewState } from '../../shared/live/view-state';

export const useLiveStore = defineStore('live', () => {
  const state = ref<LiveViewState>(initialLiveState);

  const visibleIndex = computed(() => visibleAnswerIndex(state.value));
  const visible = computed(() => (visibleIndex.value === null ? null : (state.value.answers[visibleIndex.value] ?? null)));
  const lookingBack = computed(() => isLookingBack(state.value));
  const newestWriting = computed(() => state.value.answers.at(-1)?.ending === 'writing');

  /** The answer a newer question just stopped, while the new one writes: says where the old one is kept. */
  const stoppedBefore = computed(() => {
    const answers = state.value.answers;
    const last = answers.length - 1;
    if (lookingBack.value || last < 1) return null;
    return answers[last]?.ending === 'writing' && answers[last - 1]?.ending === 'stopped' ? last : null;
  });

  async function connect(): Promise<() => void> {
    state.value = await window.overlayApi.getState();
    return window.overlayApi.onState((next) => (state.value = next));
  }

  const command = (c: OverlayCommand) => window.overlayApi.command(c);

  return { state, visibleIndex, visible, lookingBack, newestWriting, stoppedBefore, connect, command };
});
