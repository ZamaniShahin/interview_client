// The preview's practice interviewer (`npm run dev:preview` only): the server's 3.3 flow and rules, scripted, so the
// Practice page can be built and checked without a server. Questions are written ahead, an answer is scored by its
// length, a weak main answer (4 or less) gets one follow-up, a strong one (8 or more) makes the next harder, a weak
// follow-up makes it easier, and the summary is the server's (backend Practice.cs).
import {
  ErrorCodes,
  PracticeDifficulty,
  PracticeFocus,
  PracticeQuestionSource,
  PracticeState,
  PracticeTurnKind,
  type PracticeStatus,
} from '../../shared/contracts/sotto-contracts';
import type { CommandResult } from '../../shared/ipc';
import type { LiveEvent } from '../../shared/live/reducer';

export interface PreviewPracticeHooks {
  emit: (event: LiveEvent) => void;
  stamp: () => { Seq: number; AtMs: number };
  at: (ms: number, run: () => void) => void;
}

/** How long the preview takes to write a question, and to score an answer. */
export const previewQuestionMs = 700;
export const previewScoreMs = 900;

const behavioral = [
  'Tell me about a time you disagreed with a teammate. How did you handle it?',
  'Describe a project that did not go to plan. What did you learn?',
  'Tell me about a time you had to deliver on a tight deadline.',
  'How do you handle feedback you disagree with?',
  'Tell me about a decision you made without all the data.',
  'Describe a time you helped someone on your team grow.',
  'Tell me about a mistake you made in production, and what you did next.',
  'How do you decide what to work on when everything is urgent?',
  'Tell me about a time you changed your mind about a technical choice.',
  'Describe a time you had to explain something complex to a non-engineer.',
];

const technical = [
  'How would you design a rate limiter for a public API?',
  'Walk me through how a database index speeds up a query.',
  'How would you make a payment endpoint safe to call twice?',
  'How would you find a memory leak in a long-running service?',
  'How would you roll out a breaking schema change with no downtime?',
  'What would you put in front of a service that gets ten times its usual traffic?',
  'How would you keep two services consistent without a distributed transaction?',
  'Walk me through what happens when a request hits a cold cache.',
  'How would you test code that depends on the current time?',
  'How would you design retries so they never make an outage worse?',
];

const followUp = 'Can you make that concrete: one example, what you did, and what changed because of it?';

const harder = (d: PracticeDifficulty): PracticeDifficulty =>
  d === PracticeDifficulty.Easy ? PracticeDifficulty.Medium : PracticeDifficulty.Hard;
const easier = (d: PracticeDifficulty): PracticeDifficulty =>
  d === PracticeDifficulty.Hard ? PracticeDifficulty.Medium : PracticeDifficulty.Easy;

/** The questions a focus asks, in order: mixed takes from each in turn. */
function questionsFor(focus: PracticeFocus): string[] {
  if (focus === PracticeFocus.Behavioral) return behavioral;
  if (focus === PracticeFocus.Technical) return technical;
  return behavioral.flatMap((q, i) => [q, technical[i]!]);
}

interface Turn {
  n: number;
  mainN: number;
  kind: PracticeTurnKind;
  question: string;
  source: PracticeQuestionSource;
  difficulty: PracticeDifficulty;
  answer: string;
  score: number | null;
  improve: string[];
}

/** The preview's score: by length, as a stand-in for the model's judgement. */
export function previewScore(answer: string): number {
  const words = answer.trim().split(/\s+/).filter(Boolean).length;
  if (words < 12) return 3;
  if (words < 40) return 6;
  return 8;
}

const goodByScore = (score: number): string[] =>
  score >= 8
    ? ['You named the situation, what you did and the result.', 'The answer has a clear structure.']
    : score >= 5
      ? ['You answered the question asked.']
      : [];

const improveByScore = (score: number): string[] =>
  score >= 8
    ? ['Put a number on the result.']
    : score >= 5
      ? ['Give one concrete example.', 'End with the result, in numbers if you can.']
      : ['Say what you did, not only what happened.', 'Give one concrete example.', 'Answer in two to four sentences.'];

const modelAnswer =
  'A stronger answer names the situation in a sentence, then what you did and why, then what changed: "At Northwind ' +
  'our checkout failed twice a week. I added idempotency keys to the payment calls and a replay test, and the failures ' +
  'stopped: none in the six months since."';

export class PreviewPractice {
  private count = 0;
  private focus: PracticeFocus = PracticeFocus.Mixed;
  private difficulty: PracticeDifficulty = PracticeDifficulty.Medium;
  private pending: { question: string; source: PracticeQuestionSource }[] = [];
  private turns: Turn[] = [];
  private state: PracticeState = PracticeState.Off;
  private current: Turn | null = null;
  private error: string | null = null;
  private followUpNext = false;
  private runs = false;

  constructor(private readonly hooks: PreviewPracticeHooks) {}

  get running(): boolean {
    return this.runs;
  }

  start(count: number, focus: PracticeFocus, questions: string[] | null): CommandResult {
    if (this.runs) {
      return {
        ok: false,
        code: ErrorCodes.Session.PracticeRunning,
        message: 'A practice interview is already running: stop it to start another.',
      };
    }
    const chosen = (questions ?? []).filter((q) => q.trim() !== '');
    this.runs = true;
    this.focus = focus;
    this.difficulty = PracticeDifficulty.Medium;
    this.turns = [];
    this.current = null;
    this.error = null;
    this.followUpNext = false;
    this.count = chosen.length > 0 ? chosen.length : count;
    this.pending =
      chosen.length > 0
        ? chosen.map((question) => ({ question, source: PracticeQuestionSource.Chosen }))
        : questionsFor(focus)
            .slice(0, count)
            .map((question) => ({ question, source: PracticeQuestionSource.Model }));
    this.state = PracticeState.Preparing;
    this.emitState();
    this.hooks.at(previewQuestionMs, () => this.present());
    return { ok: true };
  }

  answer(text: string): CommandResult {
    if (!this.runs || this.state !== PracticeState.Answering || !this.current) {
      this.emitState();
      return { ok: true };
    }
    if (text.trim() === '') {
      this.error = "I didn't catch an answer yet: say it out loud, or type it.";
      this.emitState();
      return { ok: true };
    }
    const turn = this.current;
    turn.answer = text;
    this.error = null;
    this.state = PracticeState.Scoring;
    this.emitState();
    this.hooks.at(previewScoreMs, () => this.score(turn));
    return { ok: true };
  }

  next(): CommandResult {
    if (this.runs && this.state === PracticeState.Feedback) {
      if (this.isLast()) {
        this.finish();
      } else {
        this.state = PracticeState.Preparing;
        this.emitState();
        this.hooks.at(previewQuestionMs / 2, () => this.present());
      }
      return { ok: true };
    }
    this.emitState();
    return { ok: true };
  }

  stop(): CommandResult {
    if (this.runs) this.finish();
    else this.emitState();
    return { ok: true };
  }

  /** The session is ending: a practice running gives its summary first, as the server's does. */
  endWithSession(): void {
    if (this.runs) this.finish();
  }

  private present(): void {
    if (!this.runs || this.state !== PracticeState.Preparing) return;
    const mainN = this.turns.filter((t) => t.kind === PracticeTurnKind.Main).length;
    const asFollowUp = this.followUpNext;
    const next = asFollowUp ? { question: followUp, source: PracticeQuestionSource.Model } : this.pending.shift();
    if (!next) {
      this.finish();
      return;
    }
    this.followUpNext = false;
    const turn: Turn = {
      n: this.turns.length + 1,
      mainN: asFollowUp ? mainN : mainN + 1,
      kind: asFollowUp ? PracticeTurnKind.FollowUp : PracticeTurnKind.Main,
      question: next.question,
      source: next.source,
      difficulty: this.difficulty,
      answer: '',
      score: null,
      improve: [],
    };
    this.turns.push(turn);
    this.current = turn;
    this.state = PracticeState.Answering;
    this.hooks.emit({
      name: 'mockQuestion',
      e: {
        ...this.hooks.stamp(),
        N: turn.n,
        MainN: turn.mainN,
        Total: this.count,
        Kind: turn.kind,
        Question: turn.question,
        Source: turn.source,
        Difficulty: turn.difficulty,
      },
    });
    this.emitState();
  }

  private score(turn: Turn): void {
    if (!this.runs || this.current !== turn || this.state !== PracticeState.Scoring) return;
    const score = previewScore(turn.answer);
    turn.score = score;
    turn.improve = improveByScore(score);
    // v1's adaptive rules (the server's): a weak main answer gets one follow-up; strong makes it harder; a weak
    // follow-up makes it easier.
    if (turn.kind === PracticeTurnKind.Main && score <= 4) this.followUpNext = true;
    if (score >= 8) this.difficulty = harder(this.difficulty);
    if (turn.kind === PracticeTurnKind.FollowUp && score <= 4) this.difficulty = easier(this.difficulty);
    this.state = PracticeState.Feedback;
    this.hooks.emit({
      name: 'mockFeedback',
      e: {
        ...this.hooks.stamp(),
        N: turn.n,
        Kind: turn.kind,
        Question: turn.question,
        Answer: turn.answer,
        Spoken: false,
        Metrics: null,
        Score: score,
        Good: goodByScore(score),
        Improve: turn.improve,
        ModelAnswer: modelAnswer,
        Prepared: '',
        Raw: false,
      },
    });
    this.emitState();
  }

  private isLast(): boolean {
    return this.state === PracticeState.Feedback && !this.followUpNext && this.pending.length === 0;
  }

  private finish(): void {
    this.runs = false;
    const answered = this.turns.filter((t) => t.answer.length > 0);
    const scored = answered.filter((t) => t.score !== null);
    let best: Turn | null = null;
    let worst: Turn | null = null;
    for (const turn of scored) {
      if (!best || turn.score! > best.score!) best = turn;
      if (!worst || turn.score! < worst.score!) worst = turn;
    }
    const tips: string[] = [];
    for (const turn of [...scored].sort((a, b) => a.score! - b.score!)) {
      for (const tip of turn.improve) if (!tips.includes(tip) && tips.length < 3) tips.push(tip);
    }
    const average =
      scored.length > 0 ? Math.round((10 * scored.reduce((sum, t) => sum + t.score!, 0)) / scored.length) / 10 : null;
    this.hooks.emit({
      name: 'mockSummary',
      e: {
        ...this.hooks.stamp(),
        Asked: this.turns.length,
        Answered: answered.length,
        Average: average,
        Turns: this.turns.map((t) => ({
          N: t.n,
          Kind: t.kind,
          Question: t.question,
          Source: t.source,
          Score: t.score,
          Answered: t.answer.length > 0,
        })),
        Best: best && scored.length > 1 ? best.n : null,
        Worst: worst && scored.length > 1 && worst !== best ? worst.n : null,
        TalkSeconds: 0,
        Wpm: null,
        Fillers: 0,
        FillersPer100Words: null,
        Focus: this.focus,
        Difficulty: this.difficulty,
        Tips: tips,
      },
    });
    this.state = PracticeState.Off;
    this.current = null;
    this.emitState();
  }

  private status(): PracticeStatus | null {
    if (!this.runs) return null;
    return {
      State: this.state,
      N: this.turns.length,
      MainN: this.turns.filter((t) => t.kind === PracticeTurnKind.Main).length,
      Total: this.count,
      Focus: this.focus,
      Difficulty: this.difficulty,
      Last: this.isLast(),
      Question: this.current && this.state !== PracticeState.Preparing ? this.current.question : '',
      Error: this.error,
    };
  }

  private emitState(): void {
    this.hooks.emit({ name: 'mockState', e: { ...this.hooks.stamp(), Status: this.status() } });
  }
}
