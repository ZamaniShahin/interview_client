// The first run's sound check (F1 · 4): a short live session, heard in the setup window instead of the overlay, which
// proves the call's sound reaches Sotto. It is a session like any other and is charged like one (Q12, 2026-11-09), so
// it starts only when asked. It runs in MANUAL with no documents, so nothing it hears is ever answered; and leaving it
// ends the session, so its words can't join a real question (what v1's `clear_heard` was for, in a backend that ran
// on between sessions).
import { ErrorCodes } from '../../shared/contracts/sotto-contracts';
import { idleSoundCheck, type SoundCheckView } from '../../shared/first-run';
import type { CommandResult } from '../../shared/ipc';
import { endedText } from '../../shared/live/copy';
import type { CaptureStatus, LiveViewState } from '../../shared/live/view-state';
import { SessionController, type SessionDriver } from './session-controller';

export interface SoundCheckDependencies {
  /** The session's driver: the hub's, in MANUAL and without documents; the preview's in development. */
  driver: () => SessionDriver;
  /** A real session is running: the seat has one live session at a time, and this would take it. */
  busy: () => boolean;
  startCapture: () => void;
  stopCapture: () => void;
  /** The first words have come: the check passed (Home's readiness says when). */
  passed: () => void;
  publish: (view: SoundCheckView) => void;
  now?: () => number;
}

export class SoundCheck {
  private controller: SessionController | null = null;
  private current: SoundCheckView = idleSoundCheck;

  constructor(private readonly deps: SoundCheckDependencies) {}

  get view(): SoundCheckView {
    return this.current;
  }

  get running(): boolean {
    return this.controller !== null;
  }

  async start(): Promise<CommandResult> {
    if (this.controller) return { ok: true };
    if (this.deps.busy()) {
      return { ok: false, code: ErrorCodes.Session.AlreadyInSession, message: 'End the session first.' };
    }
    const controller = new SessionController((state) => this.follow(controller, state));
    this.controller = controller;
    this.show({ ...idleSoundCheck, phase: 'starting', startedAtMs: (this.deps.now ?? Date.now)() });

    const result = await controller.start(this.deps.driver());
    // Stopped while it started: stop() has already put everything away.
    if (this.controller !== controller) return result;
    if (!result.ok) {
      this.controller = null;
      this.show({ ...idleSoundCheck, problem: { code: result.code, message: result.message } });
      return result;
    }
    this.deps.startCapture();
    return result;
  }

  /** Leaving the step, the window or the app: the session ends, and what it heard with it. */
  async stop(): Promise<void> {
    const controller = this.controller;
    if (!controller) return;
    this.controller = null;
    this.deps.stopCapture();
    if (controller.running) await controller.command({ type: 'endSession' }).catch(() => undefined);
    controller.reset();
    this.show(idleSoundCheck);
  }

  /** A frame of this computer's sound, for the check's session. */
  audio(pcm: Uint8Array, capturedAtMs: number): void {
    this.controller?.audio(pcm, capturedAtMs);
  }

  /** How capture is going: the meter, no sound yet, a device lost. */
  capture(status: CaptureStatus): void {
    this.controller?.dispatch({ type: 'capture', status });
  }

  private follow(controller: SessionController, state: LiveViewState): void {
    // A stopped check's last word is of no interest.
    if (this.controller !== controller) return;
    const words = state.heard.finished.trim() !== '' || state.heard.live.trim() !== '';
    if (words && !this.current.heardSomething) this.deps.passed();

    const ended = state.phase === 'ended';
    if (ended) {
      // The server ended it (the minutes ran out, say): nothing more to hear.
      this.controller = null;
      this.deps.stopCapture();
    }
    const endedEarly = ended && state.endReason !== null && state.endReason !== 'user';
    this.show({
      phase: ended ? 'ended' : state.phase === 'starting' || state.phase === 'idle' ? 'starting' : 'live',
      heard: { finished: state.heard.finished, live: state.heard.live },
      level: state.capture.level,
      noSound: state.capture.noSound,
      down: state.capture.down,
      heardSomething: this.current.heardSomething || words,
      startedAtMs: this.current.startedAtMs,
      problem: endedEarly ? { code: state.endReason!, message: endedText(state.endReason!) } : null,
    });
  }

  private show(view: SoundCheckView): void {
    this.current = view;
    this.deps.publish(view);
  }
}
