// What the app window shows of the app as a whole: who is signed in, the account, this computer's documents, and the
// one problem to explain. Main owns it and sends it whole on every change.
import type { AccountView, DeviceRemovalsView, DeviceView } from './account';
import { emptyDocuments, type DocumentsView } from './documents';
import { initialFirstRun, type FirstRunView } from './first-run';

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

/** A purchase being finished in the browser (F8 · b): what it is, in words ("+100 minutes", "Unlimited"). */
export interface PaymentView {
  item: string;
  /** Waited long enough: the window says the minutes still appear once paid, and stops reading every few seconds. */
  stale: boolean;
}

/** The account's computers when this one can't be added (F3 · a): remove one, or sign out instead. */
export interface DeviceLimitState {
  devices: DeviceView[];
  limit: number;
  removals: DeviceRemovalsView;
  /** This computer's name, as it would be added. */
  thisComputer: string;
}

export interface AppState {
  auth: AuthView;
  account: AccountView | null;
  problem: Problem | null;
  /** Development's scripted preview (`npm run dev:preview`): no server, a sample account. */
  preview: boolean;
  /** What answers are grounded in, as kept on this computer (1.14). */
  documents: DocumentsView;
  /** The first run: the notice acknowledged, setup finished, hiding tested (1.14). */
  firstRun: FirstRunView;
  /** Why the last session ended (a `SessionEndReasons` value), until the window has said it: F8 · a's offer. */
  lastSessionEnd: string | null;
  /** A purchase being finished in the browser (F8 · b), or none. */
  payment: PaymentView | null;
  /** One quiet line after something worked: "100 minutes added. They last until Nov 6, 2027." (F8 · c). */
  notice: string | null;
  /** This computer can't be added: the account is at its device limit (F3). */
  deviceLimit: DeviceLimitState | null;
}

export const initialAppState: AppState = {
  auth: { status: 'signed-out' },
  account: null,
  problem: null,
  preview: false,
  documents: emptyDocuments,
  firstRun: initialFirstRun,
  lastSessionEnd: null,
  payment: null,
  notice: null,
  deviceLimit: null,
};
