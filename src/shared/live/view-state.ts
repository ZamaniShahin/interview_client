// What the overlay shows of a live session. Main owns it (it holds the connection); the overlay gets a copy.
import { InterviewTypes, type AnswerKind, type Guid, type InterviewType } from '../contracts/sotto-contracts';
import { idlePracticeSlice, type PracticeSlice } from '../practice';

/** How listening is going, as the overlay words it. The server's `degraded` reads as "down": typing still works. */
export type Listening = 'ok' | 'reconnecting' | 'down';

/** `reconnecting` is the connection to Sotto; listening has its own state. */
export type Phase = 'idle' | 'starting' | 'live' | 'reconnecting' | 'ended';

/** How capturing the call's sound is going (1.11), as main's capture reports it. */
export interface CaptureStatus {
  /** The meter's level, 0…1; null while no frame has come. */
  level: number | null;
  /** Nothing heard from this computer since capture opened, for about 20 s (Q18). */
  noSound: boolean;
  /** The device was lost or refused; capture is reopening it. */
  down: boolean;
}

export const idleCapture: CaptureStatus = { level: null, noSound: false, down: false };

/** How an answer finished, or that it hasn't yet (the handoff's §7.2, states 5 to 9). */
export type AnswerEnding = 'writing' | 'done' | 'stopped' | 'failed' | 'hidden';

export type Tier = 'fast' | 'smart';

/**
 * A line to say while the answer loads (backend Q47, v1's gap filler): up the moment a question is sent. `answerId` is
 * the answer that claimed it (the next to start): that answer's first text, or its end, takes it down; an older
 * answer's text never does.
 */
export interface GapFillerView {
  text: string;
  answerId: Guid | null;
}

/** The interview's type (Q47): `intro` or `technical`, as the contract spells them. */
export type { InterviewType };

/** The two types, in the order the strip shows them. */
export const interviewTypes: readonly InterviewType[] = [InterviewTypes.Technical, InterviewTypes.Intro];

/** A spelling the protocol has, or null: what a newer server might send is never shown as one of these. */
export function interviewTypeOf(value: unknown): InterviewType | null {
  return value === InterviewTypes.Intro || value === InterviewTypes.Technical ? value : null;
}

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
  /** The screenshots this answer reads, by the client's ids, in the order taken (3.6); empty for one with none. */
  screenshotIds: string[];
  /**
   * The user's own prepared answer for this question, matched on this computer as the answer started (3.8, the 📌
   * card): the phrasing it matched, and the answer as prepared. Null when none matched.
   */
  prepared: { phrasing: string; answer: string } | null;
}

/** The screenshots waiting for the next answer (3.6): the client's ids, in the order attached, and how many fit. */
export interface Attachments {
  ids: string[];
  max: number;
}

/**
 * Whether this computer records the session (3.12, Q51): off; on, the call and the microphone; or the call alone while
 * the microphone can't be had. Main says so: the recording is this computer's, never the server's.
 */
export type RecordingState = 'off' | 'on' | 'call-only';

export interface LiveViewState {
  phase: Phase;
  auto: boolean;
  /** AUTO needs the résumé and the job description (`SessionSnapshot.ContextReady`). */
  autoAvailable: boolean;
  paused: boolean;
  listening: Listening;
  /** This computer's sound, as captured (1.11): the meter, and whether it reaches Sotto at all. */
  capture: CaptureStatus;
  /** The interviewer's finished words, and the phrase still being spoken. */
  heard: { finished: string; live: string };
  /** The screenshots attached for the next answer, as the server last said (`Attachments`). */
  attachments: Attachments;
  /** This interview's answers, oldest first. */
  answers: AnswerView[];
  /** The answer being looked at, by index; null follows the newest. */
  viewing: number | null;
  /** The newest notice from the server (a code and plain words), until the next one replaces it. */
  notice: { code: string; text: string } | null;
  /**
   * The session will end in `secondsLeft` seconds for `reason` (a `SessionEndReasons` value), unless the reason goes
   * away: only `inactive` can, and anything heard or asked forgets it (`SessionEnding`).
   */
  ending: { reason: string; secondsLeft: number } | null;
  /** Why the session ended: a `SessionEndReasons` value. */
  endReason: string | null;
  /** From the account until the hub carries usage (backend 2.4); null on a plan without minutes. */
  minutesLeft: number | null;
  tier: Tier | null;
  /**
   * The interview's type as the server last said (`Status`, the snapshot): how long and how technical the answers are
   * (Q47). The strip's TECH / INTRO switch shows this, so it flips on the server's word, as v1's header did.
   */
  interviewType: InterviewType;
  /** The line to say while the answer loads, or null (Q47's gap fillers). */
  gapFiller: GapFillerView | null;
  /** This computer's recording of the session (3.12): the strip's REC mark. */
  recording: RecordingState;
  /**
   * The practice interview, when the session runs one (the server's 3.3): where it is, its questions with their
   * answers and feedback, and its summary once it ends. The Practice page draws it; the overlay never runs one.
   */
  practice: PracticeSlice;
  /** The newest event's sequence number: what a resume asks the server to replay after. */
  lastSeq: number;
}

export const initialLiveState: LiveViewState = {
  phase: 'idle',
  auto: true,
  autoAvailable: true,
  paused: false,
  listening: 'ok',
  capture: idleCapture,
  heard: { finished: '', live: '' },
  // Five a question (client docs/03, "Screenshots") until the server says otherwise.
  attachments: { ids: [], max: 5 },
  answers: [],
  viewing: null,
  notice: null,
  ending: null,
  endReason: null,
  minutesLeft: null,
  tier: null,
  // v1's default, and the server's until the client says otherwise.
  interviewType: InterviewTypes.Technical,
  gapFiller: null,
  recording: 'off',
  practice: idlePracticeSlice,
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
