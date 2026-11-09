// The app window's preload bridge, played for renderer tests: main's state as given, and every call recorded.
import { vi } from 'vitest';
import type { AppApi } from '../../src/preload/api';
import type { AppState } from '../../src/shared/app-state';
import type { SoundCheckView } from '../../src/shared/first-run';

/** `overrides` are mocks too (`vi.fn`), so every method keeps its mock's type for the test's assertions. */
export function fakeAppApi(state: AppState, overrides: Partial<AppApi> = {}) {
  const soundCheckListeners: ((view: SoundCheckView) => void)[] = [];
  const stateListeners: ((state: AppState) => void)[] = [];
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
    acknowledgeNotice: vi.fn(async () => ({ ok: true as const })),
    finishSetup: vi.fn(async () => ({ ok: true as const })),
    soundCheck: vi.fn(async () => ({ ok: true as const })),
    onSoundCheck: vi.fn((listener: (view: SoundCheckView) => void) => {
      soundCheckListeners.push(listener);
      return () => {};
    }),
    hidingTest: vi.fn(async () => ({ ok: true as const })),
    signInPage: vi.fn(),
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
  };
}
