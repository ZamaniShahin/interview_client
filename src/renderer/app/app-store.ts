// The app window's view of main's state: sign-in, the account, this computer's documents, the first run, the last
// problem. Main owns all of it and says when it changes; the store only follows, and forwards what the user asks for.
// It also holds where the setup wizard is (F1), which only this window knows.
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { initialAppState, type AppState } from '../../shared/app-state';
import type { SetDocumentRequest } from '../../shared/documents';
import { idleSoundCheck, notice, type SoundCheckView } from '../../shared/first-run';
import type { CommandResult, HidingTestAction, SignInPageAction } from '../../shared/ipc';

/** The setup's screens, in order: step 5 has two, the hotkeys then Test hiding. */
export const setupScreens = ['notice', 'signIn', 'documents', 'soundCheck', 'hotkeys', 'hiding'] as const;
export type SetupScreen = (typeof setupScreens)[number];

/**
 * The whole setup; the notice alone, when its words changed after setup was finished; or Test hiding alone, from
 * Help.
 */
export type SetupMode = 'full' | 'notice' | 'hiding';

export const useAppStore = defineStore('app', () => {
  const state = ref<AppState>({ ...initialAppState });
  const loaded = ref(false);
  let stopListening: (() => void) | null = null;
  let unlistenSoundCheck: (() => void) | null = null;

  const auth = computed(() => state.value.auth);
  const account = computed(() => state.value.account);
  const problem = computed(() => state.value.problem);
  const documents = computed(() => state.value.documents);
  const signedIn = computed(() => state.value.auth.status === 'signed-in');
  const firstRun = computed(() => state.value.firstRun);
  const soundCheck = ref<SoundCheckView>(idleSoundCheck);
  const setup = ref<{ mode: SetupMode; screen: SetupScreen } | null>(null);

  async function load(): Promise<void> {
    stopListening ??= window.appApi.onState((changed) => {
      state.value = changed;
      loaded.value = true;
    });
    unlistenSoundCheck ??= window.appApi.onSoundCheck((view) => (soundCheck.value = view));
    state.value = await window.appApi.getState();
    loaded.value = true;
    // The setup opens by itself until it has been finished once; after that, only for a notice whose words changed.
    if (!state.value.firstRun.finished) openSetup('full');
    else if (!state.value.firstRun.acknowledged) openSetup('notice');
  }

  function openSetup(mode: SetupMode): void {
    const screen: SetupScreen =
      mode === 'hiding' ? 'hiding' : mode === 'full' && state.value.firstRun.acknowledged ? 'signIn' : 'notice';
    setup.value = { mode, screen };
  }

  function showSetupScreen(screen: SetupScreen): void {
    if (setup.value) setup.value = { ...setup.value, screen };
  }

  function closeSetup(): void {
    setup.value = null;
  }

  function acknowledgeNotice(): Promise<CommandResult> {
    return window.appApi.acknowledgeNotice(notice.version);
  }

  function finishSetup(): Promise<CommandResult> {
    return window.appApi.finishSetup();
  }

  function startSoundCheck(): Promise<CommandResult> {
    return window.appApi.soundCheck('start');
  }

  function stopSoundCheck(): Promise<CommandResult> {
    return window.appApi.soundCheck('stop');
  }

  function hidingTest(action: HidingTestAction): Promise<CommandResult> {
    return window.appApi.hidingTest(action);
  }

  function signInPage(action: SignInPageAction): void {
    window.appApi.signInPage(action);
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

  /** Keeps one document on this computer; the state main sends next carries it. */
  function setDocument(change: SetDocumentRequest): Promise<CommandResult> {
    return window.appApi.setDocument(change);
  }

  return {
    state,
    loaded,
    auth,
    account,
    problem,
    documents,
    signedIn,
    firstRun,
    soundCheck,
    setup,
    load,
    signIn,
    cancelSignIn,
    signOut,
    refresh,
    startSession,
    setDocument,
    openSetup,
    showSetupScreen,
    closeSetup,
    acknowledgeNotice,
    finishSetup,
    startSoundCheck,
    stopSoundCheck,
    hidingTest,
    signInPage,
  };
});
