// Turns the hub's events (and a few local facts) into what the overlay shows. Pure: same input, same output, so
// main and the tests run exactly the same code. The rules come from the client docs (03-live-interview.md) and the
// design handoff's §7.2.
import {
  ErrorCodes,
  SessionPhase,
  SpeechStates,
  type LiveClient,
  type SessionSnapshot,
} from '../contracts/sotto-contracts';
import { initialLiveState, type AnswerView, type Listening, type LiveViewState, type Tier } from './view-state';

/** One hub event, named as `LiveClient` names it, with its payload. Follows the contract by construction. */
export type LiveEvent = {
  [K in keyof LiveClient]: { name: K; e: Parameters<LiveClient[K]>[0] };
}[keyof LiveClient];

export type LiveAction =
  /** The user pressed Start; nothing from the server yet. Clears the last session. */
  | { type: 'starting' }
  /** A snapshot after (re)connecting (`GetState`): it replaces what may have been missed. */
  | { type: 'snapshot'; snapshot: SessionSnapshot }
  | { type: 'event'; event: LiveEvent }
  /** The connection to Sotto dropped; the session waits on the server for up to 2 minutes. */
  | { type: 'connectionLost' }
  | { type: 'connectionRestored' }
  /** `ClearHeard` was accepted: the question being put together is forgotten. */
  | { type: 'heardCleared' }
  /** Look at an earlier answer by index, or follow the newest again (null). */
  | { type: 'view'; index: number | null }
  /** Minutes and tier come from the account until the hub carries usage (backend 2.4). */
  | { type: 'account'; minutesLeft: number | null; tier: Tier | null }
  /** The session ended without a `SessionEnded` event: it couldn't be resumed in time, or the server said it expired. */
  | { type: 'ended'; reason: string };

export function reduceLive(state: LiveViewState, action: LiveAction): LiveViewState {
  switch (action.type) {
    case 'starting':
      return { ...initialLiveState, phase: 'starting', minutesLeft: state.minutesLeft, tier: state.tier };
    case 'snapshot':
      return applySnapshot(state, action.snapshot);
    case 'event':
      return applyEvent(state, action.event);
    case 'connectionLost':
      return state.phase === 'ended' || state.phase === 'idle' ? state : { ...state, phase: 'reconnecting' };
    case 'connectionRestored':
      return state.phase === 'reconnecting' ? { ...state, phase: 'live' } : state;
    case 'heardCleared':
      return { ...state, heard: { finished: '', live: '' } };
    case 'view':
      return { ...state, viewing: clampView(state, action.index) };
    case 'account':
      return { ...state, minutesLeft: action.minutesLeft, tier: action.tier };
    case 'ended':
      return state.phase === 'ended' ? state : endSession(state, action.reason);
  }
}

function endSession(state: LiveViewState, reason: string): LiveViewState {
  return {
    ...state,
    phase: 'ended',
    endReason: reason,
    answers: state.answers.map((a) => (a.ending === 'writing' ? { ...a, ending: 'stopped' as const } : a)),
  };
}

function applySnapshot(state: LiveViewState, s: SessionSnapshot): LiveViewState {
  const phase =
    s.Phase === SessionPhase.Ended
      ? 'ended'
      : s.Phase === SessionPhase.Starting
        ? 'starting'
        : s.Phase === SessionPhase.Suspended
          ? 'reconnecting'
          : 'live';
  return {
    ...state,
    phase,
    auto: s.Auto,
    paused: s.Paused,
    autoAvailable: s.ContextReady,
    // The snapshot carries the question so far; the phrase in progress comes back with the next partial.
    heard: { finished: s.Heard, live: '' },
    lastSeq: Math.max(state.lastSeq, s.LastSeq),
  };
}

function applyEvent(state: LiveViewState, event: LiveEvent): LiveViewState {
  // A resume replays what came after LastSeq; anything older was applied already.
  if (event.e.Seq <= state.lastSeq) return state;
  const next = { ...state, lastSeq: event.e.Seq };

  switch (event.name) {
    case 'status':
      return {
        ...next,
        phase: next.phase === 'starting' || next.phase === 'reconnecting' ? 'live' : next.phase,
        auto: event.e.Auto,
        paused: event.e.Paused,
        listening: listeningFrom(event.e.Stt),
      };

    case 'transcriptPartial':
      return { ...next, heard: splitHeard(next.heard.finished, event.e.Text) };

    case 'transcriptFinal':
      return { ...next, heard: { finished: event.e.Text, live: '' } };

    case 'speechStarted':
      return next;

    case 'answerStart': {
      const answer: AnswerView = {
        id: event.e.AnswerId,
        question: event.e.Question,
        kind: event.e.Kind,
        instruction: event.e.Instruction,
        text: '',
        ending: 'writing',
        failureMessage: null,
        startedAtMs: event.e.AtMs,
      };
      return {
        ...next,
        // A newer question always wins; the server says so with AnswerCancelled, and this holds even if it didn't.
        answers: [...next.answers.map((a) => (a.ending === 'writing' ? { ...a, ending: 'stopped' as const } : a)), answer],
        // When an answer starts, Heard starts over: the question moved into the answer.
        heard: { finished: '', live: '' },
        // Someone looking back stays where they are (§7.1, History).
      };
    }

    case 'answerDelta':
      return updateAnswer(next, event.e.AnswerId, (a) => (a.ending === 'writing' ? { ...a, text: a.text + event.e.Text } : a));

    case 'answerDone':
      return updateAnswer(next, event.e.AnswerId, (a) => (a.ending === 'writing' ? { ...a, ending: 'done' } : a));

    case 'answerCancelled':
      return updateAnswer(next, event.e.AnswerId, (a) => (a.ending === 'writing' ? { ...a, ending: 'stopped' } : a));

    case 'answerFailed':
      return updateAnswer(next, event.e.AnswerId, (a) =>
        event.e.Code === ErrorCodes.Ai.OutputBlocked
          ? // What it had shown disappears (backend decision, 2026-11-06).
            { ...a, text: '', ending: 'hidden', failureMessage: null }
          : { ...a, ending: 'failed', failureMessage: event.e.Message },
      );

    case 'cleared':
      return { ...next, answers: [], viewing: null, heard: { finished: '', live: '' }, notice: null };

    case 'notice':
      return { ...next, notice: { code: event.e.Code, text: event.e.Text } };

    case 'sessionEnded':
      return endSession(next, event.e.Reason);
  }
}

function listeningFrom(stt: string): Listening {
  if (stt === SpeechStates.Reconnecting) return 'reconnecting';
  if (stt === SpeechStates.Degraded) return 'down';
  return 'ok';
}

/** A partial carries the question so far; whatever goes beyond the last final is the phrase still being spoken. */
function splitHeard(finished: string, text: string): { finished: string; live: string } {
  if (finished && text.startsWith(finished)) {
    return { finished, live: text.slice(finished.length).trimStart() };
  }
  return { finished: '', live: text };
}

function updateAnswer(state: LiveViewState, id: string, change: (a: AnswerView) => AnswerView): LiveViewState {
  const index = state.answers.findIndex((a) => a.id === id);
  if (index < 0) return state;
  const answers = state.answers.slice();
  answers[index] = change(answers[index]!);
  return { ...state, answers };
}

function clampView(state: LiveViewState, index: number | null): number | null {
  if (index === null || state.answers.length === 0) return null;
  const last = state.answers.length - 1;
  const clamped = Math.min(Math.max(index, 0), last);
  // Reaching the newest answer means following it again.
  return clamped === last ? null : clamped;
}
