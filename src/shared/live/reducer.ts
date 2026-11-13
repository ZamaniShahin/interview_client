// Turns the hub's events (and a few local facts) into what the overlay shows. Pure: same input, same output, so
// main and the tests run exactly the same code. The rules come from the client docs (03-live-interview.md) and the
// design handoff's §7.2.
import {
  ErrorCodes,
  PracticeDifficulty,
  PracticeQuestionSource,
  SessionEndReasons,
  SessionPhase,
  SpeechStates,
  UsageWarnings,
  type LiveClient,
  type SessionSnapshot,
} from '../contracts/sotto-contracts';
import {
  feedbackOf,
  idlePracticeSlice,
  statusOf,
  summaryOf,
  turnOf,
  type PracticeSlice,
  type PracticeTurnView,
} from '../practice';
import {
  initialLiveState,
  interviewTypeOf,
  type AnswerView,
  type CaptureStatus,
  type Listening,
  type LiveViewState,
  type Tier,
} from './view-state';

/**
 * The hub's events about the session. `entitlementsUpdated` is the account's, not the session's: it has no `Seq`, and
 * main answers it by reading the account again (hub-driver.ts), so it never reaches the overlay's state.
 */
export type SessionEventName = Exclude<keyof LiveClient, 'entitlementsUpdated'>;

/** One session event, named as `LiveClient` names it, with its payload. Follows the contract by construction. */
export type LiveEvent = {
  [K in SessionEventName]: { name: K; e: Parameters<LiveClient[K]>[0] };
}[SessionEventName];

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
  /** The server accepted a command: the session is in use, so an inactivity notice no longer holds. */
  | { type: 'commandAccepted' }
  /** How capturing this computer's sound is going (main's capture, 1.11). */
  | { type: 'capture'; status: CaptureStatus }
  /** Look at an earlier answer by index, or follow the newest again (null). */
  | { type: 'view'; index: number | null }
  /** Minutes and tier come from the account until the hub carries usage (backend 2.4). */
  | { type: 'account'; minutesLeft: number | null; tier: Tier | null }
  /** The question an answer started for matched one of the user's prepared answers, on this computer (3.8). */
  | { type: 'prepared'; answerId: string; phrasing: string; answer: string }
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
    case 'commandAccepted':
      return state.ending?.reason === SessionEndReasons.Inactive ? { ...state, ending: null } : state;
    case 'capture':
      return { ...state, capture: action.status };
    case 'view':
      return { ...state, viewing: clampView(state, action.index) };
    case 'account':
      return { ...state, minutesLeft: action.minutesLeft, tier: action.tier };
    case 'prepared':
      return updateAnswer(state, action.answerId, (a) => ({
        ...a,
        prepared: { phrasing: action.phrasing, answer: action.answer },
      }));
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
    gapFiller: null,
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
    interviewType: interviewTypeOf(s.InterviewType) ?? state.interviewType,
    // The snapshot carries the question so far; the phrase in progress comes back with the next partial.
    heard: { finished: s.Heard, live: '' },
    // A session that moved has none: the driver attaches the kept copies again, and their events follow.
    attachments: { ids: s.Attachments.map((a) => a.Id), max: s.MaxAttachments },
    // Where the practice is; its questions and feedback so far stay as they were drawn.
    practice: practiceWithStatus(state.practice, s.Practice),
    lastSeq: Math.max(state.lastSeq, s.LastSeq),
    // A line was for a moment that has passed by the time a (re)connect is drawn again.
    gapFiller: null,
  };
}

/**
 * The practice's state, as the server says. One that runs after a summary is a new practice: the last one's questions
 * and summary go (they were kept in history as it ended).
 */
function practiceWithStatus(practice: PracticeSlice, status: Parameters<typeof statusOf>[0]): PracticeSlice {
  const next = statusOf(status);
  if (next !== null && practice.summary !== null) return { ...idlePracticeSlice, status: next };
  return { ...practice, status: next };
}

/** A question asked: added in its place, or put in place of one with its number (asked again after a move). */
function withQuestion(practice: PracticeSlice, turn: PracticeTurnView): PracticeSlice {
  const fresh = practice.summary !== null ? idlePracticeSlice : practice;
  const turns = [...fresh.turns.filter((t) => t.n !== turn.n), turn].sort((a, b) => a.n - b.n);
  return { ...fresh, turns };
}

function applyEvent(state: LiveViewState, event: LiveEvent): LiveViewState {
  // A resume replays what came after LastSeq; anything older was applied already.
  if (event.e.Seq <= state.lastSeq) return state;
  const seen = { ...state, lastSeq: event.e.Seq };
  // Inactivity is the one ending that can go away: anything heard or asked keeps the session (SessionEnding).
  const next =
    seen.ending?.reason === SessionEndReasons.Inactive && keepsSessionAlive(event.name)
      ? { ...seen, ending: null }
      : seen;

  switch (event.name) {
    case 'status':
      return {
        ...next,
        phase: next.phase === 'starting' || next.phase === 'reconnecting' ? 'live' : next.phase,
        auto: event.e.Auto,
        paused: event.e.Paused,
        listening: listeningFrom(event.e.Stt),
        // A spelling this build doesn't know (a newer server's) leaves the switch as it was.
        interviewType: interviewTypeOf(event.e.InterviewType) ?? next.interviewType,
      };

    case 'transcriptPartial':
      return { ...next, heard: splitHeard(next.heard.finished, event.e.Text) };

    case 'transcriptFinal':
      return { ...next, heard: { finished: event.e.Text, live: '' } };

    case 'speechStarted':
      return next;

    // A line to say while the answer loads (Q47): up at once, as text; an empty one takes it down. The next answer to
    // start claims it.
    case 'gapFiller':
      return { ...next, gapFiller: event.e.Text?.trim() ? { text: event.e.Text, answerId: null } : null };

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
        screenshotIds: event.e.ScreenshotIds ?? [],
        prepared: null,
      };
      return {
        ...next,
        // A newer question always wins; the server says so with AnswerCancelled, and this holds even if it didn't.
        answers: [
          ...next.answers.map((a) => (a.ending === 'writing' ? { ...a, ending: 'stopped' as const } : a)),
          answer,
        ],
        // When an answer starts, Heard starts over: the question moved into the answer.
        heard: { finished: '', live: '' },
        // The line up is this answer's, unless one before it claimed it already.
        gapFiller:
          next.gapFiller && next.gapFiller.answerId === null
            ? { ...next.gapFiller, answerId: event.e.AnswerId }
            : next.gapFiller,
        // Someone looking back stays where they are (§7.1, History).
      };
    }

    // Its answer's first text, or its end, takes the line down; an older answer's never does.
    case 'answerDelta':
      return updateAnswer(withoutFillerOf(next, event.e.AnswerId), event.e.AnswerId, (a) =>
        a.ending === 'writing' ? { ...a, text: a.text + event.e.Text } : a,
      );

    case 'answerDone':
      return updateAnswer(withoutFillerOf(next, event.e.AnswerId), event.e.AnswerId, (a) =>
        a.ending === 'writing' ? { ...a, ending: 'done' } : a,
      );

    case 'answerCancelled':
      return updateAnswer(withoutFillerOf(next, event.e.AnswerId), event.e.AnswerId, (a) =>
        a.ending === 'writing' ? { ...a, ending: 'stopped' } : a,
      );

    case 'answerFailed':
      return updateAnswer(withoutFillerOf(next, event.e.AnswerId), event.e.AnswerId, (a) =>
        event.e.Code === ErrorCodes.Ai.OutputBlocked
          ? // What it had shown disappears (backend decision, 2026-11-06).
            { ...a, text: '', ending: 'hidden', failureMessage: null }
          : { ...a, ending: 'failed', failureMessage: event.e.Message },
      );

    case 'cleared':
      // Starting over takes the attached screenshots too; the server's `Attachments` that follows says the same.
      return {
        ...next,
        answers: [],
        viewing: null,
        heard: { finished: '', live: '' },
        notice: null,
        attachments: { ...next.attachments, ids: [] },
        gapFiller: null,
      };

    case 'attachments':
      return { ...next, attachments: { ids: event.e.Items.map((item) => item.Id), max: event.e.Max } };

    // Practice (the server's 3.3, drawn by the Practice page).
    case 'mockState':
      // Practice pauses the copilot: a line for its answer has nothing to wait for.
      return { ...next, practice: practiceWithStatus(next.practice, event.e.Status), gapFiller: null };

    case 'mockQuestion':
      return { ...next, practice: withQuestion(next.practice, turnOf(event.e)) };

    case 'mockFeedback': {
      const e = event.e;
      const known = next.practice.turns.find((t) => t.n === e.N);
      // A feedback whose question was missed (a resume that couldn't replay it) brings its question with it.
      const turn: PracticeTurnView = {
        ...(known ?? {
          n: e.N,
          mainN: 0,
          total: next.practice.status?.total ?? 0,
          kind: e.Kind,
          question: e.Question,
          source: PracticeQuestionSource.Model,
          difficulty: next.practice.status?.difficulty ?? PracticeDifficulty.Medium,
        }),
        answer: e.Answer,
        feedback: feedbackOf(e),
      };
      return { ...next, practice: withQuestion(next.practice, turn) };
    }

    case 'mockSummary':
      return { ...next, practice: { ...next.practice, summary: summaryOf(event.e) } };

    case 'notice':
      return { ...next, notice: { code: event.e.Code, text: event.e.Text } };

    case 'usage':
      return applyUsage(next, event.e.MinutesLeft, event.e.Warning);

    case 'sessionEnding':
      return { ...next, ending: { reason: event.e.Reason, secondsLeft: event.e.SecondsLeft } };

    case 'sessionEnded':
      return endSession({ ...next, ending: null }, event.e.Reason);
  }
}

/** The line goes once the answer that claimed it streams or ends (Q47). */
function withoutFillerOf(state: LiveViewState, answerId: string): LiveViewState {
  return state.gapFiller?.answerId === answerId ? { ...state, gapFiller: null } : state;
}

/** The events that show the session is in use: something heard, or an answer asked for. */
function keepsSessionAlive(name: SessionEventName): boolean {
  return (
    name === 'transcriptPartial' || name === 'transcriptFinal' || name === 'speechStarted' || name === 'answerStart'
  );
}

/**
 * A minute was charged (`Usage`). The balance follows the server; a low balance gets the quiet note at 10 and 2
 * minutes left (the UI canvas, "Minutes and endings"), and passing 80% of the session's AI ceiling moves the answers to
 * the fast tier, which the status strip shows.
 */
function applyUsage(state: LiveViewState, minutesLeft: number | null, warning: string | null): LiveViewState {
  const next = { ...state, minutesLeft };
  if (warning === UsageWarnings.LowCredit && minutesLeft !== null) {
    return {
      ...next,
      notice: { code: warning, text: `${minutesLeft} ${minutesLeft === 1 ? 'minute' : 'minutes'} left.` },
    };
  }
  if (warning === UsageWarnings.CostTierDown) return { ...next, tier: 'fast' };
  return next;
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
