// What the app window shows of the app as a whole: who is signed in, the account, and the one problem to explain.
// Main owns it and sends it whole on every change.
import type { AccountView } from './account';

export type AuthView =
  | { status: 'signed-out' }
  /** Waiting for the user to finish in the browser (F1 · 2). */
  | { status: 'signing-in' }
  | { status: 'signed-in'; email: string; name: string | null }
  /** The sign-in ended (a refresh token was refused): sign in again (F2 · a). */
  | { status: 'expired' }
  /** Signed in before, but Sotto can't be reached to confirm it; tried again on the next refresh. */
  | { status: 'unreachable' };

export interface Problem {
  /** A code from `ErrorCodes`, such as `device_limit_reached`. */
  code: string;
  message: string;
}

export interface AppState {
  auth: AuthView;
  account: AccountView | null;
  problem: Problem | null;
  /** Development's scripted preview (`npm run dev:preview`): no server, a sample account. */
  preview: boolean;
}

export const initialAppState: AppState = { auth: { status: 'signed-out' }, account: null, problem: null, preview: false };
