// What the overlay shows of a live session. Main owns it (it holds the connection); the overlay gets a copy.
import type { AnswerKind, Guid } from '../contracts/sotto-contracts';

/** How listening is going, as the overlay words it. The server's `degraded` reads as "down": typing still works. */
export type Listening = 'ok' | 'reconnecting' | 'down';

/** `reconnecting` is the connection to Sotto; listening has its own state. */
export type Phase = 'idle' | 'starting' | 'live' | 'reconnecting' | 'ended';

/** How an answer finished, or that it hasn't yet (the handoff's §7.2, states 5 to 9). */
export type AnswerEnding = 'writing' | 'done' | 'stopped' | 'failed' | 'hidden';

export type Tier = 'fast' | 'smart';

export interface AnswerView {
  id: Guid;
  /** The question as the server understood it. */
  question: string;
  kind: AnswerKind;
  /** A Tip's note, such as "shorter". */
  instruction: string | null;
  /** Markdown, growing while the answer writes. Emptied when the answer is hidden. */
  text: string;
  ending: AnswerEnding;
  /** The server's plain message when the answer failed. Never kept for a hidden answer. */
  failureMessage: string | null;
  startedAtMs: number;
}

export interface LiveViewState {
  phase: Phase;
  auto: boolean;
  /** AUTO needs the résumé and the job description (`SessionSnapshot.ContextReady`). */
  autoAvailable: boolean;
  paused: boolean;
  listening: Listening;
  /** The interviewer's finished words, and the phrase still being spoken. */
  heard: { finished: string; live: string };
  /** This interview's answers, oldest first. */
  answers: AnswerView[];
  /** The answer being looked at, by index; null follows the newest. */
  viewing: number | null;
  /** The newest notice from the server (a code and plain words), until the next one replaces it. */
  notice: { code: string; text: string } | null;
  /** Why the session ended: a `SessionEndReasons` value. */
  endReason: string | null;
  /** From the account until the hub carries usage (backend 2.4); null on a plan without minutes. */
  minutesLeft: number | null;
  tier: Tier | null;
  /** The newest event's sequence number: what a resume asks the server to replay after. */
  lastSeq: number;
}

export const initialLiveState: LiveViewState = {
  phase: 'idle',
  auto: true,
  autoAvailable: true,
  paused: false,
  listening: 'ok',
  heard: { finished: '', live: '' },
  answers: [],
  viewing: null,
  notice: null,
  endReason: null,
  minutesLeft: null,
  tier: null,
  lastSeq: 0,
};

/** The answer on screen: the one being looked at, or the newest. */
export function visibleAnswerIndex(state: LiveViewState): number | null {
  if (state.answers.length === 0) return null;
  return state.viewing ?? state.answers.length - 1;
}

/** True while looking back and a newer answer exists than the one on screen. */
export function isLookingBack(state: LiveViewState): boolean {
  return state.viewing !== null && state.viewing < state.answers.length - 1;
}
