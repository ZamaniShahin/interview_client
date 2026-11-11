// Owns the live session's view state in main: the overlay can reload without losing it, and nothing in a renderer
// talks to the network. Commands go to a driver: the hub (hub-driver.ts), or the scripted preview in development.
import { bestMatch, buildIndex, type MatchEntry, type MatchIndex } from '../../shared/answer-match';
import { AnswerKind, ErrorCodes } from '../../shared/contracts/sotto-contracts';
import type { CommandResult, OverlayCommand } from '../../shared/ipc';
import { reduceLive, type LiveAction } from '../../shared/live/reducer';
import { initialLiveState, type LiveViewState } from '../../shared/live/view-state';
import { captureCode, captureFailureText, type CaptureFailure } from '../../shared/screenshots';
import type { CaptureOutcome } from '../screenshots/screen-capture';
import type { ScreenshotShelf } from '../screenshots/screenshot-shelf';

/**
 * The overlay's commands as a driver gets them. A capture arrives as its picture, taken in main (3.6), so a driver
 * attaches it, or asks about it at once; looking back through answers never reaches a driver.
 */
export type SessionCommand =
  | Exclude<OverlayCommand, { type: 'view' | 'capture' | 'reattachScreenshot' }>
  | { type: 'attachScreenshot'; id: string; bytes: Uint8Array }
  | { type: 'screenshotQuery'; id: string; bytes: Uint8Array; hint: string | null };

export interface SessionDriver {
  /** Starts the session; events come back through `dispatch`. `state` reads the current view (a resume needs LastSeq). */
  start(dispatch: (action: LiveAction) => void, state: () => LiveViewState): Promise<CommandResult>;
  command(command: SessionCommand): Promise<CommandResult>;
  /** One 100 ms frame of the call's sound (1.11), as captured; the hub uploads it (1.12), the preview ignores it. */
  audio?(pcm: Uint8Array, capturedAtMs: number): void;
  /** Stops listening and drops timers or the connection. Safe to call twice. */
  dispose(): void;
}

/** Screenshots (3.6): taking one, and keeping each in memory while the session shows or needs it. */
export interface SessionScreenshots {
  capture(): Promise<CaptureOutcome>;
  readonly shelf: ScreenshotShelf;
}

/** While an answer streams, the overlay gets at most one state every 33 ms, about 30 a second. */
const publishEveryMs = 33;

/** The latest answers whose screenshots are always kept (3.6). */
export const keepScreenshotsOfAnswers = 10;

const notInSession: CommandResult = {
  ok: false,
  code: ErrorCodes.Session.NotInSession,
  message: 'No session is running.',
};

function captureFailed(failure: CaptureFailure): CommandResult {
  return { ok: false, code: captureCode(failure), message: failure === 'cancelled' ? '' : captureFailureText[failure] };
}

export class SessionController {
  private state: LiveViewState = initialLiveState;
  private driver: SessionDriver | null = null;
  private publishTimer: ReturnType<typeof setTimeout> | null = null;
  /** The answer bank's enabled entries, indexed once per session (3.8). */
  private bank: MatchIndex = [];

  constructor(
    private readonly publish: (state: LiveViewState) => void,
    private readonly screenshots: SessionScreenshots | null = null,
  ) {}

  get current(): LiveViewState {
    return this.state;
  }

  get running(): boolean {
    return this.driver !== null && this.state.phase !== 'ended';
  }

  /** The answer bank the session's questions are matched to (3.8): its enabled entries, in its order. */
  useBank(entries: readonly MatchEntry[]): void {
    this.bank = buildIndex(entries);
  }

  readonly dispatch = (action: LiveAction): void => {
    this.state = reduceLive(this.state, action);
    if (action.type === 'event' && action.event.name === 'answerStart') this.matchPrepared(action.event.e);
    if (action.type === 'event' && (action.event.name === 'attachments' || action.event.name === 'answerStart')) {
      this.screenshots?.shelf.prune(this.screenshotsInUse());
    }
    this.schedulePublish();
  };

  /**
   * The 📌 card (3.8, v1's prepared_match): a spoken or typed question, the trigger's included, matched to the user's
   * own prepared answers as its answer starts, so theirs shows at once while the generated one is written. Not a Tip,
   * Study, Result or a screen's: those aren't the interviewer's questions.
   */
  private matchPrepared(e: { AnswerId: string; Question: string; Kind: AnswerKind }): void {
    if (this.bank.length === 0 || (e.Kind !== AnswerKind.Spoken && e.Kind !== AnswerKind.Typed)) return;
    const match = bestMatch(this.bank, e.Question);
    if (match) {
      this.state = reduceLive(this.state, {
        type: 'prepared',
        answerId: e.AnswerId,
        phrasing: match.phrasing,
        answer: match.answer,
      });
    }
  }

  async start(driver: SessionDriver): Promise<CommandResult> {
    if (this.running) {
      return { ok: false, code: ErrorCodes.Session.AlreadyInSession, message: 'A session is already running.' };
    }
    this.driver?.dispose();
    this.driver = driver;
    const result = await driver.start(this.dispatch, () => this.state);
    // A session that never started leaves nothing behind: the next Start begins clean.
    if (!result.ok && this.driver === driver) this.reset();
    return result;
  }

  async command(command: OverlayCommand): Promise<CommandResult> {
    switch (command.type) {
      case 'view':
        this.dispatch({ type: 'view', index: command.index });
        return { ok: true };
      case 'capture':
        return this.capture(command.hint);
      case 'reattachScreenshot':
        return this.reattach(command.id);
      default:
        return this.send(command);
    }
  }

  /** A frame of the call's sound, for the running session's driver; nothing when no session runs. */
  audio(pcm: Uint8Array, capturedAtMs: number): void {
    if (this.running) this.driver?.audio?.(pcm, capturedAtMs);
  }

  /** After the overlay is closed on an ended session: its screenshots go with it. */
  reset(): void {
    this.driver?.dispose();
    this.driver = null;
    this.screenshots?.shelf.clear();
    this.state = { ...initialLiveState, minutesLeft: this.state.minutesLeft, tier: this.state.tier };
    this.schedulePublish();
  }

  private async send(command: SessionCommand): Promise<CommandResult> {
    if (!this.driver) return notInSession;
    const result = await this.driver.command(command);
    if (result.ok) {
      // Any command keeps the session in use, which the server counts against inactivity too.
      this.dispatch({ type: 'commandAccepted' });
      // Clear heard has no event of its own: the question being put together is simply forgotten.
      if (command.type === 'clearHeard') this.dispatch({ type: 'heardCleared' });
    }
    return result;
  }

  /**
   * A screenshot (3.6, v1's): in AUTO it is answered at once, with what was typed as its note; in MANUAL it waits,
   * attached, for the next answer. A question that has all it can take says so before anything is captured.
   */
  private async capture(hint: string | null): Promise<CommandResult> {
    if (!this.running) return notInSession;
    if (!this.screenshots) return captureFailed('failed');
    const asksAtOnce = this.state.auto && this.state.autoAvailable;
    if (!asksAtOnce && this.state.attachments.ids.length >= this.state.attachments.max) return captureFailed('full');

    const taken = await this.screenshots.capture();
    if (!taken.ok) return captureFailed(taken.failure);
    // The session may have ended while the selector showed.
    if (!this.running) return notInSession;

    const id = this.screenshots.shelf.keep(taken.shot);
    const result = await this.send(
      asksAtOnce
        ? { type: 'screenshotQuery', id, bytes: taken.shot.bytes, hint: hint || null }
        : { type: 'attachScreenshot', id, bytes: taken.shot.bytes },
    );
    // A screenshot the server didn't take is shown nowhere: it isn't kept either.
    if (!result.ok) this.screenshots.shelf.drop(id);
    return result;
  }

  /** A kept screenshot attached again for the next answer, so the model sees it again (＋ under an answer). */
  private async reattach(id: string): Promise<CommandResult> {
    if (!this.running) return notInSession;
    const shot = this.screenshots?.shelf.get(id);
    if (!shot) {
      return {
        ok: false,
        code: ErrorCodes.Request.NotFound,
        message: 'That screenshot is no longer kept. Take it again.',
      };
    }
    if (this.state.attachments.ids.includes(id)) return { ok: true };
    if (this.state.attachments.ids.length >= this.state.attachments.max) return captureFailed('full');
    return this.send({ type: 'attachScreenshot', id, bytes: shot.bytes });
  }

  /**
   * The screenshots still in use: those attached, and those under the latest answers. Older answers' may go once the
   * shelf is full (v1 kept its latest pages' only): the overlay then says the screenshot is no longer kept.
   */
  private screenshotsInUse(): string[] {
    return [
      ...this.state.attachments.ids,
      ...this.state.answers.slice(-keepScreenshotsOfAnswers).flatMap((a) => a.screenshotIds),
    ];
  }

  private schedulePublish(): void {
    if (this.publishTimer) return;
    this.publishTimer = setTimeout(() => {
      this.publishTimer = null;
      this.publish(this.state);
    }, publishEveryMs);
  }
}
