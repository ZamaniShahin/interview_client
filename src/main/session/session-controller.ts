// Owns the live session's view state in main: the overlay can reload without losing it, and nothing in a renderer
// talks to the network. Commands go to a driver: the hub (hub-driver.ts), or the scripted preview in development.
import { ErrorCodes } from '../../shared/contracts/sotto-contracts';
import type { CommandResult, OverlayCommand } from '../../shared/ipc';
import { reduceLive, type LiveAction } from '../../shared/live/reducer';
import { initialLiveState, type LiveViewState } from '../../shared/live/view-state';

export type SessionCommand = Exclude<OverlayCommand, { type: 'view' }>;

export interface SessionDriver {
  /** Starts the session; events come back through `dispatch`. `state` reads the current view (a resume needs LastSeq). */
  start(dispatch: (action: LiveAction) => void, state: () => LiveViewState): Promise<CommandResult>;
  command(command: SessionCommand): Promise<CommandResult>;
  /** Stops listening and drops timers or the connection. Safe to call twice. */
  dispose(): void;
}

/** While an answer streams, the overlay gets at most one state every 33 ms, about 30 a second. */
const publishEveryMs = 33;

export class SessionController {
  private state: LiveViewState = initialLiveState;
  private driver: SessionDriver | null = null;
  private publishTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly publish: (state: LiveViewState) => void) {}

  get current(): LiveViewState {
    return this.state;
  }

  get running(): boolean {
    return this.driver !== null && this.state.phase !== 'ended';
  }

  readonly dispatch = (action: LiveAction): void => {
    this.state = reduceLive(this.state, action);
    this.schedulePublish();
  };

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
    if (command.type === 'view') {
      this.dispatch({ type: 'view', index: command.index });
      return { ok: true };
    }
    if (!this.driver) {
      return { ok: false, code: ErrorCodes.Session.NotInSession, message: 'No session is running.' };
    }
    const result = await this.driver.command(command);
    if (result.ok) {
      // Any command keeps the session in use, which the server counts against inactivity too.
      this.dispatch({ type: 'commandAccepted' });
      // Clear heard has no event of its own: the question being put together is simply forgotten.
      if (command.type === 'clearHeard') this.dispatch({ type: 'heardCleared' });
    }
    return result;
  }

  /** After the overlay is closed on an ended session. */
  reset(): void {
    this.driver?.dispose();
    this.driver = null;
    this.state = { ...initialLiveState, minutesLeft: this.state.minutesLeft, tier: this.state.tier };
    this.schedulePublish();
  }

  private schedulePublish(): void {
    if (this.publishTimer) return;
    this.publishTimer = setTimeout(() => {
      this.publishTimer = null;
      this.publish(this.state);
    }, publishEveryMs);
  }
}
