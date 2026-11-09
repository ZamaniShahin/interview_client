// The app window's view of main's state: sign-in, the account, the last problem. Main owns all of it and says when it
// changes; the store only follows, and forwards what the user asks for.
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { initialAppState, type AppState } from '../../shared/app-state';
import type { CommandResult } from '../../shared/ipc';

export const useAppStore = defineStore('app', () => {
  const state = ref<AppState>({ ...initialAppState });
  const loaded = ref(false);
  let stopListening: (() => void) | null = null;

  const auth = computed(() => state.value.auth);
  const account = computed(() => state.value.account);
  const problem = computed(() => state.value.problem);
  const signedIn = computed(() => state.value.auth.status === 'signed-in');

  async function load(): Promise<void> {
    stopListening ??= window.appApi.onState((changed) => {
      state.value = changed;
      loaded.value = true;
    });
    state.value = await window.appApi.getState();
    loaded.value = true;
  }

  function signIn(): Promise<CommandResult> {
    return window.appApi.signIn();
  }

  function cancelSignIn(): void {
    window.appApi.cancelSignIn();
  }

  function signOut(): Promise<void> {
    return window.appApi.signOut();
  }

  function refresh(): Promise<void> {
    return window.appApi.refresh();
  }

  /**
   * The consent box is part of the request, every time (F4): main refuses a start without it. `takeOver` ends the
   * account's session on another device, and is sent only after the user chose "Start here".
   */
  function startSession(consent: boolean, takeOver = false): Promise<CommandResult> {
    if (!consent) {
      return Promise.resolve({ ok: false, code: 'invalid_input', message: 'Tick the consent box to start.' });
    }
    return window.appApi.startSession(takeOver ? { consent: true, takeOver: true } : { consent: true });
  }

  return { state, loaded, auth, account, problem, signedIn, load, signIn, cancelSignIn, signOut, refresh, startSession };
});
