// Practice in main (Shahin, 2026-11-12, with the server's 3.3): a live session of its own, run for the Practice page and
// drawn there, never in the overlay. Like the sound check it hears nothing: no sound is captured, so no minute is spent
// on speech-to-text. It starts the session, then the practice; once the summary comes, the practice is kept in history
// (Q24) and the session ends, so no minute is charged after it. The server never hears the user.
import { ErrorCodes, SessionEndReasons, type PracticeFocus } from '../../shared/contracts/sotto-contracts';
import type { CommandResult } from '../../shared/ipc';

import type { LiveViewState, Tier } from '../../shared/live/view-state';
import {
  idlePractice,
  practiceEndedText,
  type PracticeRecord,
  type PracticeStart,
  type PracticeView,
} from '../../shared/practice';
import { SessionController, type PracticeCommand, type SessionDriver } from './session-controller';

/** A practice session's driver, with the account's minutes and tier, or why there is none (signed out, say). */
export type PracticeDriverOutcome =
  | { ok: true; driver: SessionDriver; minutesLeft: number | null; tier: Tier | null }
  | { ok: false; code: string; message: string };

export interface PracticeRunDependencies {
  /** The hub's driver, with the documents and the answer bank (the server writes questions from them); the preview's. */
  driver: () => Promise<PracticeDriverOutcome>;
  /** Why no practice can start now (a session or the sound check runs: one live session at a time), or null. */
  busy: () => string | null;
  publish: (view: PracticeView) => void;
  /** Keeps a practice in history; its id, or null when history can't be had. */
  keep: (record: PracticeRecord) => number | null;
  /** What history names it by: the candidate and the role, from the documents. */
  about: () => { candidate: string; role: string };
  /** A practice session ended: its minutes were charged, so the account is read again. */
  ended?: () => void;
  now?: () => number;
}

const notRunning: CommandResult = {
  ok: false,
  code: ErrorCodes.Session.NotInSession,
  message: 'No practice is running.',
};

export class PracticeRun {
  private controller: SessionController | null = null;
  private current: PracticeView = idlePractice;
  /** The practice now, from its start: what history keeps of it. */
  private run: { startedAt: number; focus: PracticeFocus; tier: Tier | null; candidate: string; role: string } | null =
    null;
  private kept = false;
  private historyId: number | null = null;
  private ending = false;
  /** The user put the summary away while its session was still ending: nothing more is shown of it. */
  private dismissed = false;

  constructor(private readonly deps: PracticeRunDependencies) {}

  get view(): PracticeView {
    return this.current;
  }

  /** A practice session is open: the account's one live session is taken. */
  get running(): boolean {
    return this.controller !== null;
  }

  async start(start: PracticeStart): Promise<CommandResult> {
    // The last practice's session is still closing, a moment after its summary.
    if (this.controller && this.ending) {
      return {
        ok: false,
        code: ErrorCodes.Session.PracticeRunning,
        message: 'The last practice is still ending. Try again in a moment.',
      };
    }
    if (this.controller) {
      return {
        ok: false,
        code: ErrorCodes.Session.PracticeRunning,
        message: 'A practice is already running: stop it to start another.',
      };
    }
    const busy = this.deps.busy();
    if (busy) return { ok: false, code: ErrorCodes.Session.AlreadyInSession, message: busy };

    this.dismissed = false;
    this.kept = false;
    this.ending = false;
    this.historyId = null;
    this.show({ ...idlePractice, phase: 'starting' });
    const made = await this.deps.driver();
    if (!made.ok) return this.refused(made);

    const controller = new SessionController((state) => this.follow(controller, state));
    this.controller = controller;
    this.run = { startedAt: this.now(), focus: start.focus, tier: made.tier, ...this.deps.about() };
    controller.dispatch({ type: 'account', minutesLeft: made.minutesLeft, tier: made.tier });

    const started = await controller.start(made.driver);
    // Quit while it started: quit() has put everything away.
    if (this.controller !== controller) return started;
    if (!started.ok) {
      this.controller = null;
      return this.refused(started);
    }
    const begun = await controller.practice({
      type: 'mockStart',
      count: start.count,
      focus: start.focus,
      questions: start.questions,
    });
    if (this.controller !== controller) return begun;
    if (!begun.ok) {
      // Refused (no practice on this plan, no documents to write questions from…): its session ends at once.
      this.controller = null;
      await controller.command({ type: 'endSession' }).catch(() => undefined);
      controller.reset();
      this.deps.ended?.();
      return this.refused(begun);
    }
    return { ok: true };
  }

  answer(text: string): Promise<CommandResult> {
    return this.send({ type: 'mockAnswer', text });
  }

  next(): Promise<CommandResult> {
    return this.send({ type: 'mockNext' });
  }

  /** Ends the practice early: its summary comes, it is kept, and its session ends. */
  stop(): Promise<CommandResult> {
    return this.send({ type: 'mockStop' });
  }

  /** Puts the summary away; the setup shows again. A practice still running is stopped first. */
  async close(): Promise<CommandResult> {
    if (this.controller && this.current.phase !== 'done') return this.stop();
    this.dismissed = true;
    this.show(idlePractice);
    return { ok: true };
  }

  /** The app is quitting: the practice's session ends, and what was answered is kept. */
  async quit(): Promise<void> {
    const controller = this.controller;
    if (!controller) return;
    this.controller = null;
    if (controller.running) await controller.command({ type: 'endSession' }).catch(() => undefined);
    if (!this.kept) this.keep(controller.current, SessionEndReasons.User);
    controller.reset();
  }

  private async send(command: PracticeCommand): Promise<CommandResult> {
    const controller = this.controller;
    if (!controller || this.ending) return notRunning;
    return controller.practice(command);
  }

  private refused(failure: { code: string; message: string }): CommandResult {
    this.run = null;
    this.show({ ...idlePractice, problem: { code: failure.code, message: failure.message } });
    return { ok: false, code: failure.code, message: failure.message };
  }

  private follow(controller: SessionController, state: LiveViewState): void {
    // A session put away (quit) has nothing more to say.
    if (this.controller !== controller) return;
    const ended = state.phase === 'ended';
    const summary = state.practice.summary;

    // Over once its summary came, or its session ended under it: kept once, with what was answered.
    if ((summary !== null || ended) && !this.kept) this.keep(state, ended ? state.endReason : SessionEndReasons.User);
    // Its summary came: the session ends, so no minute is charged after it.
    if (summary !== null && !ended && !this.ending) {
      this.ending = true;
      void controller.command({ type: 'endSession' }).catch(() => undefined);
    }
    if (ended) {
      this.controller = null;
      this.ending = false;
      controller.reset();
      this.deps.ended?.();
    }
    if (this.dismissed) return;

    const endedEarly = ended && state.endReason !== null && state.endReason !== SessionEndReasons.User;
    this.show({
      phase:
        ended || summary !== null ? 'done' : state.phase === 'idle' || state.phase === 'starting' ? 'starting' : 'live',
      status: summary !== null ? null : state.practice.status,
      turns: state.practice.turns,
      summary,
      ending: ended ? null : state.ending,
      minutesLeft: state.minutesLeft,
      problem: endedEarly ? { code: state.endReason!, message: practiceEndedText(state.endReason!) } : null,
      historyId: this.historyId,
    });
  }

  /** Into history (Q24): the practice's questions, answers and feedback, and its summary; nothing when none was answered. */
  private keep(state: LiveViewState, reason: string | null): void {
    this.kept = true;
    const run = this.run;
    if (!run || !state.practice.turns.some((t) => t.answer !== null)) return;
    this.historyId = this.deps.keep({
      startedAt: run.startedAt,
      endedAt: this.now(),
      endReason: reason,
      candidate: run.candidate,
      role: run.role,
      tier: run.tier,
      focus: state.practice.summary?.focus ?? run.focus,
      turns: state.practice.turns,
      summary: state.practice.summary,
    });
  }

  private show(view: PracticeView): void {
    this.current = view;
    this.deps.publish(view);
  }

  private now(): number {
    return (this.deps.now ?? Date.now)();
  }
}
