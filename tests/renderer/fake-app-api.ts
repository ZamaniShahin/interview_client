// The app window's preload bridge, played for renderer tests: main's state as given, and every call recorded.
import { vi } from 'vitest';
import type { AppApi } from '../../src/preload/api';
import type { AppState } from '../../src/shared/app-state';
import type { SoundCheckView } from '../../src/shared/first-run';
import type { PracticeView } from '../../src/shared/practice';

/** `overrides` are mocks too (`vi.fn`), so every method keeps its mock's type for the test's assertions. */
export function fakeAppApi(state: AppState, overrides: Partial<AppApi> = {}) {
  const soundCheckListeners: ((view: SoundCheckView) => void)[] = [];
  const stateListeners: ((state: AppState) => void)[] = [];
  const practiceListeners: ((view: PracticeView) => void)[] = [];
  const defaults = {
    getState: vi.fn(async () => state),
    onState: vi.fn((listener: (state: AppState) => void) => {
      stateListeners.push(listener);
      return () => {};
    }),
    signIn: vi.fn(async () => ({ ok: true as const })),
    cancelSignIn: vi.fn(),
    signOut: vi.fn(async () => {}),
    refresh: vi.fn(async () => {}),
    startSession: vi.fn(async () => ({ ok: true as const })),
    setDocument: vi.fn(async () => ({ ok: true as const })),
    setPrepDoc: vi.fn<AppApi['setPrepDoc']>(async () => ({ ok: true })),
    readDocument: vi.fn<AppApi['readDocument']>(async () => ({ ok: false, code: 'read_cancelled', message: '' })),
    setInstructions: vi.fn<AppApi['setInstructions']>(async () => ({ ok: true })),
    saveBankEntry: vi.fn<AppApi['saveBankEntry']>(async () => ({ ok: true })),
    removeBankEntry: vi.fn<AppApi['removeBankEntry']>(async () => ({ ok: true })),
    openInterview: vi.fn<AppApi['openInterview']>(async () => null),
    deleteInterview: vi.fn<AppApi['deleteInterview']>(async () => ({ ok: true })),
    clearHistory: vi.fn<AppApi['clearHistory']>(async () => ({ ok: true })),
    debrief: vi.fn<AppApi['debrief']>(async () => ({ ok: true })),
    copy: vi.fn<AppApi['copy']>(),
    writeDrafts: vi.fn<AppApi['writeDrafts']>(async () => ({ ok: true })),
    keepDraft: vi.fn<AppApi['keepDraft']>(async () => ({ ok: true })),
    skipDraft: vi.fn<AppApi['skipDraft']>(async () => ({ ok: true })),
    installUpdate: vi.fn<AppApi['installUpdate']>(async () => ({ ok: true })),
    acknowledgeNotice: vi.fn(async () => ({ ok: true as const })),
    finishSetup: vi.fn(async () => ({ ok: true as const })),
    soundCheck: vi.fn(async () => ({ ok: true as const })),
    onSoundCheck: vi.fn((listener: (view: SoundCheckView) => void) => {
      soundCheckListeners.push(listener);
      return () => {};
    }),
    practice: vi.fn<AppApi['practice']>(async () => ({ ok: true })),
    onPractice: vi.fn((listener: (view: PracticeView) => void) => {
      practiceListeners.push(listener);
      return () => {};
    }),
    hidingTest: vi.fn(async () => ({ ok: true as const })),
    signInPage: vi.fn(),
    startTrial: vi.fn<AppApi['startTrial']>(async () => ({ ok: true })),
    buy: vi.fn<AppApi['buy']>(async () => ({ ok: true })),
    billingPortal: vi.fn<AppApi['billingPortal']>(async () => ({ ok: true })),
    payment: vi.fn<AppApi['payment']>(async () => ({ ok: true })),
    removeDevice: vi.fn<AppApi['removeDevice']>(async () => ({ ok: true })),
    replaceDevice: vi.fn<AppApi['replaceDevice']>(async () => ({ ok: true })),
    ledgerMore: vi.fn<AppApi['ledgerMore']>(async () => ({ ok: true })),
    exportData: vi.fn<AppApi['exportData']>(async () => ({ ok: true })),
    deleteAccount: vi.fn<AppApi['deleteAccount']>(async () => ({ ok: true })),
    dismiss: vi.fn<AppApi['dismiss']>(),
    window: vi.fn(),
    getSettings: vi.fn(),
    setSettings: vi.fn(),
    onSettings: vi.fn(() => () => {}),
  } satisfies AppApi;
  const api = { ...defaults, ...overrides } as typeof defaults;
  return {
    api,
    /** Main sends a new state, as after a sign-in or a saved document. */
    send: (next: AppState) => stateListeners.forEach((listener) => listener(next)),
    /** Main sends the sound check as it goes. */
    soundCheck: (view: SoundCheckView) => soundCheckListeners.forEach((listener) => listener(view)),
    /** Main sends the practice as it goes. */
    practice: (view: PracticeView) => practiceListeners.forEach((listener) => listener(view)),
  };
}
