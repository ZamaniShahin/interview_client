// Practice (client, with the server's 3.3; Shahin, 2026-11-12): v1's mock interview, on the Practice page. The server
// plays the interviewer in a live session of its own: it asks, the user answers by typing (spoken answers come with the
// speech coach, 3.7), and it scores the answer and gives feedback, then a summary at the end. The server never hears
// the user and keeps nothing; this computer keeps each practice in history, with its scores (Q24).
import { z } from 'zod';
import {
  PracticeDifficulty,
  PracticeFocus,
  PracticeQuestionSource,
  PracticeState,
  PracticeTurnKind,
  SessionEndReasons,
  type MockFeedbackEvent,
  type MockQuestionEvent,
  type MockSummaryEvent,
  type PracticeStatus,
} from './contracts/sotto-contracts';
import { endedText, endingText } from './live/copy';

/** The server's limits (backend Practice.cs, docs/03 §4): 1 to 10 questions, a chosen one 400 characters at most. */
export const practiceLimits = {
  minCount: 1,
  maxCount: 10,
  defaultCount: 5,
  question: 400,
  /** An answer may be 20,000 characters, of which the server scores the first 6,000 (v1's cut). */
  answer: 20_000,
  scored: 6_000,
} as const;

const focusSchema = z.union([
  z.literal(PracticeFocus.Mixed),
  z.literal(PracticeFocus.Behavioral),
  z.literal(PracticeFocus.Technical),
]);

/**
 * A practice to start: a count and a focus, or the questions chosen to practice (Q22: "Retry the 2 lowest", "Practice
 * this question"), which then set the count.
 */
export const practiceStartSchema = z
  .object({
    count: z.number().int().min(practiceLimits.minCount).max(practiceLimits.maxCount),
    focus: focusSchema,
    questions: z
      .array(z.string().trim().min(1).max(practiceLimits.question))
      .min(1)
      .max(practiceLimits.maxCount)
      .nullable(),
  })
  .strict();
export type PracticeStart = z.infer<typeof practiceStartSchema>;

/** What the Practice page may ask of main. An answer is never empty: the page says so before it is sent. */
export const practiceActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('start'), start: practiceStartSchema }).strict(),
  z.object({ type: z.literal('answer'), text: z.string().trim().min(1).max(practiceLimits.answer) }).strict(),
  /** After the feedback: the next question, or the results after the last; also tries again a question that failed. */
  z.object({ type: z.literal('next') }).strict(),
  /** Ends the practice early: its summary comes, and the session ends. */
  z.object({ type: z.literal('stop') }).strict(),
  /** Puts the summary away: the page shows the setup again. */
  z.object({ type: z.literal('close') }).strict(),
]);
export type PracticeAction = z.infer<typeof practiceActionSchema>;

/** Where the practice is, as the server last said (`MockState`). */
export interface PracticeStatusView {
  state: PracticeState;
  /** Questions asked, follow-ups included. */
  n: number;
  /** Main questions asked, of `total`. */
  mainN: number;
  total: number;
  focus: PracticeFocus;
  difficulty: PracticeDifficulty;
  /** On the final feedback: the page offers the results, not a next question. */
  last: boolean;
  /** The question being answered or scored. */
  question: string;
  /** What went wrong, if something did: a question that couldn't be written, an answer that couldn't be scored. */
  error: string | null;
}

/** The server's feedback on one answer. */
export interface PracticeFeedbackView {
  /** 1 to 10; null when the model gave none. */
  score: number | null;
  good: string[];
  improve: string[];
  /** A stronger answer to say. */
  modelAnswer: string;
  /** The user's own prepared answer, for a question from the answer bank; empty otherwise. */
  prepared: string;
  /** The model answered in prose: what it said is kept as the one thing to improve. */
  raw: boolean;
}

/** One question of the practice, with the answer given and its feedback once they come. */
export interface PracticeTurnView {
  n: number;
  mainN: number;
  total: number;
  kind: PracticeTurnKind;
  question: string;
  source: PracticeQuestionSource;
  difficulty: PracticeDifficulty;
  answer: string | null;
  feedback: PracticeFeedbackView | null;
}

/** The practice's summary (v1's, the server's): its questions and scores, the best and the worst, a few tips. */
export interface PracticeSummaryView {
  asked: number;
  answered: number;
  average: number | null;
  turns: {
    n: number;
    kind: PracticeTurnKind;
    question: string;
    source: PracticeQuestionSource;
    score: number | null;
    answered: boolean;
  }[];
  /** The best and the worst answers by `n`, with two scored or more. */
  best: number | null;
  worst: number | null;
  /** The delivery, from spoken answers only: none while answers are typed. */
  talkSeconds: number;
  wpm: number | null;
  fillers: number;
  fillersPer100Words: number | null;
  focus: PracticeFocus;
  difficulty: PracticeDifficulty;
  tips: string[];
}

/** The practice part of a live session's view (view-state.ts). */
export interface PracticeSlice {
  status: PracticeStatusView | null;
  turns: PracticeTurnView[];
  summary: PracticeSummaryView | null;
}

export const idlePracticeSlice: PracticeSlice = { status: null, turns: [], summary: null };

export function statusOf(s: PracticeStatus | null): PracticeStatusView | null {
  if (!s) return null;
  return {
    state: s.State,
    n: s.N,
    mainN: s.MainN,
    total: s.Total,
    focus: s.Focus,
    difficulty: s.Difficulty,
    last: s.Last,
    question: s.Question,
    error: s.Error,
  };
}

export function turnOf(e: MockQuestionEvent): PracticeTurnView {
  return {
    n: e.N,
    mainN: e.MainN,
    total: e.Total,
    kind: e.Kind,
    question: e.Question,
    source: e.Source,
    difficulty: e.Difficulty,
    answer: null,
    feedback: null,
  };
}

export function feedbackOf(e: MockFeedbackEvent): PracticeFeedbackView {
  return {
    score: e.Score,
    good: e.Good,
    improve: e.Improve,
    modelAnswer: e.ModelAnswer,
    prepared: e.Prepared,
    raw: e.Raw,
  };
}

export function summaryOf(e: MockSummaryEvent): PracticeSummaryView {
  return {
    asked: e.Asked,
    answered: e.Answered,
    average: e.Average,
    turns: e.Turns.map((t) => ({
      n: t.N,
      kind: t.Kind,
      question: t.Question,
      source: t.Source,
      score: t.Score,
      answered: t.Answered,
    })),
    best: e.Best,
    worst: e.Worst,
    talkSeconds: e.TalkSeconds,
    wpm: e.Wpm,
    fillers: e.Fillers,
    fillersPer100Words: e.FillersPer100Words,
    focus: e.Focus,
    difficulty: e.Difficulty,
    tips: e.Tips,
  };
}

/**
 * What the Practice page shows: the practice of its session, and the session around it. `idle` shows the setup;
 * `starting` until the server took it on; `live` while it runs; `done` with the summary, or how it ended early, until
 * the user closes it.
 */
export interface PracticeView extends PracticeSlice {
  phase: 'idle' | 'starting' | 'live' | 'done';
  /** The session will end soon, and why (`SessionEnding`): a quiet spell, the minutes, the plan's longest session. */
  ending: { reason: string; secondsLeft: number } | null;
  /** On a plan with minutes, what is left; null otherwise. */
  minutesLeft: number | null;
  /** Why it couldn't start, or ended early: a code and plain words. */
  problem: { code: string; message: string } | null;
  /** The practice as kept in history, once it is. */
  historyId: number | null;
}

export const idlePractice: PracticeView = {
  ...idlePracticeSlice,
  phase: 'idle',
  ending: null,
  minutesLeft: null,
  problem: null,
  historyId: null,
};

/** A practice as history keeps it (Q24): its questions, the answers and the feedback, and its summary. */
export interface PracticeRecord {
  startedAt: number;
  endedAt: number;
  endReason: string | null;
  candidate: string;
  role: string;
  tier: string | null;
  focus: PracticeFocus;
  turns: PracticeTurnView[];
  summary: PracticeSummaryView | null;
}

/**
 * "Retry the 2 lowest" (Q22, the practice design): the questions of the lowest-scored answers, lowest first, the
 * earlier first on a tie. Only with at least `count` scored answers, so there is something to compare.
 */
export function lowestQuestions(
  turns: readonly { n: number; question: string; score: number | null; answered: boolean }[],
  count = 2,
): string[] {
  const scored = turns.filter((t) => t.answered && t.score !== null && t.question.trim() !== '');
  if (scored.length < count) return [];
  const picked: string[] = [];
  for (const turn of [...scored].sort((a, b) => a.score! - b.score! || a.n - b.n)) {
    const question = turn.question.trim().slice(0, practiceLimits.question);
    if (!picked.includes(question)) picked.push(question);
    if (picked.length === count) break;
  }
  return picked;
}

export const focusLabels: Record<PracticeFocus, string> = {
  [PracticeFocus.Mixed]: 'Mixed',
  [PracticeFocus.Behavioral]: 'Behavioral',
  [PracticeFocus.Technical]: 'Technical',
};

export const difficultyLabels: Record<PracticeDifficulty, string> = {
  [PracticeDifficulty.Easy]: 'Easy',
  [PracticeDifficulty.Medium]: 'Medium',
  [PracticeDifficulty.Hard]: 'Hard',
};

export const sourceLabels: Record<PracticeQuestionSource, string> = {
  [PracticeQuestionSource.Model]: 'Written for you',
  [PracticeQuestionSource.Bank]: 'From your answer bank',
  [PracticeQuestionSource.Chosen]: 'You chose it',
};

/** Whether the state is one the server is working on: the page waits, its buttons quiet. */
export function practiceBusy(status: PracticeStatusView | null): boolean {
  return status !== null && (status.state === PracticeState.Preparing || status.state === PracticeState.Scoring);
}

/**
 * Why a practice ended early, in its own words: nothing is heard in practice, so a quiet spell is "nothing happened".
 * The other endings read as a session's (live/copy.ts).
 */
export function practiceEndedText(reason: string | null): string {
  if (reason === SessionEndReasons.Inactive) return 'The practice ended: nothing happened for a while.';
  return endedText(reason);
}

/** The notice before an ending (`SessionEnding`), for the Practice page: why, when, and what keeps it going. */
export function practiceEndingText(reason: string, secondsLeft: number): string {
  const when = endingText(secondsLeft);
  switch (reason) {
    case SessionEndReasons.Inactive:
      return `Nothing happened for a while. ${when} Send your answer to keep going.`;
    case SessionEndReasons.CreditExhausted:
      return `No minutes left. ${when}`;
    case SessionEndReasons.MaxLength:
      return `Your plan's longest session is nearly over. ${when}`;
    default:
      return when;
  }
}
