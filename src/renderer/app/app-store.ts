// The app window's view of main's state: sign-in, the account, this computer's documents, the first run, the last
// problem. Main owns all of it and says when it changes; the store only follows, and forwards what the user asks for.
// It also holds where the setup wizard is (F1), which only this window knows.
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { initialAppState, type AppState } from '../../shared/app-state';
import type { BankEntryInput } from '../../shared/answer-bank';
import type { ReadDocumentResult, ReadTarget, SetDocumentRequest, SetPrepDocRequest } from '../../shared/documents';
import { idleSoundCheck, notice as firstRunNotice, type SoundCheckView } from '../../shared/first-run';
import type { InterviewView } from '../../shared/history';
import { idlePractice, type PracticeStart, type PracticeView } from '../../shared/practice';
import type {
  CommandResult,
  DismissTarget,
  HidingTestAction,
  PaymentAction,
  PurchaseRequest,
  SignInPageAction,
} from '../../shared/ipc';

/** The window's pages, as the sidebar lists them. */
export type PageId = 'home' | 'prepare' | 'practice' | 'history' | 'account' | 'settings' | 'help';

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
  let unlistenPractice: (() => void) | null = null;

  const auth = computed(() => state.value.auth);
  const account = computed(() => state.value.account);
  const problem = computed(() => state.value.problem);
  const documents = computed(() => state.value.documents);
  const signedIn = computed(() => state.value.auth.status === 'signed-in');
  const firstRun = computed(() => state.value.firstRun);
  const payment = computed(() => state.value.payment);
  const notice = computed(() => state.value.notice);
  const lastSessionEnd = computed(() => state.value.lastSessionEnd);
  const deviceLimit = computed(() => state.value.deviceLimit);
  const soundCheck = ref<SoundCheckView>(idleSoundCheck);
  const setup = ref<{ mode: SetupMode; screen: SetupScreen } | null>(null);
  /** The page shown: the sidebar's choice, or the one a page sends the user to (History to Practice, and back). */
  const page = ref<PageId>('home');
  /** An interview or practice History is to open when it shows next (a practice just kept, say). */
  const historyToOpen = ref<number | null>(null);
  /** The practice, as main runs it for the Practice page. */
  const practice = ref<PracticeView>(idlePractice);

  async function load(): Promise<void> {
    stopListening ??= window.appApi.onState((changed) => {
      state.value = changed;
      loaded.value = true;
    });
    unlistenSoundCheck ??= window.appApi.onSoundCheck((view) => (soundCheck.value = view));
    unlistenPractice ??= window.appApi.onPractice((view) => (practice.value = view));
    state.value = await window.appApi.getState();
    loaded.value = true;
    // The setup opens by itself until it has been finished once; after that, only for a notice whose words changed.
    if (!state.value.firstRun.finished) openSetup('full');
    else if (!state.value.firstRun.acknowledged) openSetup('notice');
  }

  function go(next: PageId): void {
    page.value = next;
  }

  /** History, opening one interview or practice in it. */
  function showInHistory(id: number): void {
    historyToOpen.value = id;
    page.value = 'history';
  }

  /**
   * A practice: a count and a focus, or the questions chosen (History's "Practice this question", "Retry the 2
   * lowest"). The Practice page shows it from its start.
   */
  function startPractice(start: PracticeStart): Promise<CommandResult> {
    page.value = 'practice';
    return window.appApi.practice({ type: 'start', start });
  }

  function answerPractice(text: string): Promise<CommandResult> {
    return window.appApi.practice({ type: 'answer', text });
  }

  function nextPractice(): Promise<CommandResult> {
    return window.appApi.practice({ type: 'next' });
  }

  function stopPractice(): Promise<CommandResult> {
    return window.appApi.practice({ type: 'stop' });
  }

  /** Puts the practice's summary away: the setup shows again. */
  function closePractice(): Promise<CommandResult> {
    return window.appApi.practice({ type: 'close' });
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
    return window.appApi.acknowledgeNotice(firstRunNotice.version);
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

  /** Starts the free trial from this computer (F9 · a); a refusal comes back as the problem. */
  function startTrial(): Promise<CommandResult> {
    return window.appApi.startTrial();
  }

  /** Buys a plan or a top-up in the browser; main waits for the payment and says when it arrived (F8). */
  function buy(purchase: PurchaseRequest): Promise<CommandResult> {
    return window.appApi.buy(purchase);
  }

  function billingPortal(): Promise<CommandResult> {
    return window.appApi.billingPortal();
  }

  /** Saves a copy of everything the server keeps about the user (Q19). */
  function exportData(): Promise<CommandResult> {
    return window.appApi.exportData();
  }

  /** Deletes the account, its email typed again (Q19); main signs out once it is done. */
  function deleteAccount(confirm: string): Promise<CommandResult> {
    return window.appApi.deleteAccount(confirm);
  }

  function paymentAction(action: PaymentAction): Promise<CommandResult> {
    return window.appApi.payment(action);
  }

  function removeDevice(deviceId: string): Promise<CommandResult> {
    return window.appApi.removeDevice(deviceId);
  }

  function replaceDevice(deviceId: string): Promise<CommandResult> {
    return window.appApi.replaceDevice(deviceId);
  }

  function ledgerMore(): Promise<CommandResult> {
    return window.appApi.ledgerMore();
  }

  function dismiss(target: DismissTarget): void {
    window.appApi.dismiss(target);
  }

  /** Keeps one document on this computer; the state main sends next carries it. */
  function setDocument(change: SetDocumentRequest): Promise<CommandResult> {
    return window.appApi.setDocument(change);
  }

  /** Keeps the prep doc on this computer (3.10); the state main sends next carries it. */
  function setPrepDoc(change: SetPrepDocRequest): Promise<CommandResult> {
    return window.appApi.setPrepDoc(change);
  }

  /** Reads a document from a file the user picks (3.10): its text, to look over before it is kept. */
  function readDocument(target: ReadTarget): Promise<ReadDocumentResult> {
    return window.appApi.readDocument(target);
  }

  /** The preferences (3.8): main sends them next with the state. */
  const preferences = computed(() => state.value.preferences);

  function setInstructions(text: string): Promise<CommandResult> {
    return window.appApi.setInstructions(text);
  }

  function saveBankEntry(input: BankEntryInput): Promise<CommandResult> {
    return window.appApi.saveBankEntry(input);
  }

  function removeBankEntry(id: string): Promise<CommandResult> {
    return window.appApi.removeBankEntry(id);
  }

  // History (3.9): the list and the debriefs being written come with the state; an interview is read whole on demand.
  const history = computed(() => state.value.history);
  const debriefing = computed(() => state.value.debriefing);

  function openInterview(id: number): Promise<InterviewView | null> {
    return window.appApi.openInterview(id);
  }

  function deleteInterview(id: number): Promise<CommandResult> {
    return window.appApi.deleteInterview(id);
  }

  function clearHistory(): Promise<CommandResult> {
    return window.appApi.clearHistory();
  }

  function debrief(id: number): Promise<CommandResult> {
    return window.appApi.debrief(id);
  }

  /** An interview's recording, saved as a WAV where the user chooses (3.12). */
  function saveRecording(id: number): Promise<CommandResult> {
    return window.appApi.saveRecording(id);
  }

  // Prep drafts (3.9): held in main until each is kept or skipped.
  const drafts = computed(() => state.value.drafts);

  function writeDrafts(): Promise<CommandResult> {
    return window.appApi.writeDrafts();
  }

  function keepDraft(id: number): Promise<CommandResult> {
    return window.appApi.keepDraft(id);
  }

  function skipDraft(id: number): Promise<CommandResult> {
    return window.appApi.skipDraft(id);
  }

  // Automatic updates (4.2): where one stands, and installing it now.
  const update = computed(() => state.value.update);

  function installUpdate(): Promise<CommandResult> {
    return window.appApi.installUpdate();
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
    payment,
    notice,
    lastSessionEnd,
    deviceLimit,
    soundCheck,
    setup,
    page,
    historyToOpen,
    practice,
    go,
    showInHistory,
    startPractice,
    answerPractice,
    nextPractice,
    stopPractice,
    closePractice,
    load,
    signIn,
    cancelSignIn,
    signOut,
    refresh,
    startSession,
    setDocument,
    setPrepDoc,
    readDocument,
    preferences,
    setInstructions,
    saveBankEntry,
    removeBankEntry,
    history,
    debriefing,
    openInterview,
    deleteInterview,
    saveRecording,
    clearHistory,
    debrief,
    drafts,
    writeDrafts,
    keepDraft,
    skipDraft,
    update,
    installUpdate,
    openSetup,
    showSetupScreen,
    closeSetup,
    acknowledgeNotice,
    finishSetup,
    startSoundCheck,
    stopSoundCheck,
    hidingTest,
    signInPage,
    startTrial,
    buy,
    billingPortal,
    exportData,
    deleteAccount,
    paymentAction,
    removeDevice,
    replaceDevice,
    ledgerMore,
    dismiss,
  };
});
