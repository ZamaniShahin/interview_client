import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AnswerKind, ErrorCodes } from '../../src/shared/contracts/sotto-contracts';
import type { CommandResult } from '../../src/shared/ipc';
import type { LiveAction } from '../../src/shared/live/reducer';
import type { LiveViewState } from '../../src/shared/live/view-state';
import { SessionController, type SessionCommand, type SessionDriver } from '../../src/main/session/session-controller';

class FakeDriver implements SessionDriver {
  readonly commands: SessionCommand[] = [];
  readonly frames: number[] = [];
  dispatch: (action: LiveAction) => void = () => {};

  audio(pcm: Uint8Array): void {
    this.frames.push(pcm[0]!);
  }

  async start(dispatch: (action: LiveAction) => void): Promise<CommandResult> {
    this.dispatch = dispatch;
    dispatch({ type: 'starting' });
    return { ok: true };
  }

  async command(command: SessionCommand): Promise<CommandResult> {
    this.commands.push(command);
    return { ok: true };
  }

  dispose(): void {}
}

describe('the session controller in main', () => {
  let published: LiveViewState[];
  let controller: SessionController;

  beforeEach(() => {
    vi.useFakeTimers();
    published = [];
    controller = new SessionController((state) => published.push(state));
  });

  afterEach(() => vi.useRealTimers());

  it("hands the call's sound to the running session's driver, and to nobody once it ended", async () => {
    const driver = new FakeDriver();
    controller.audio(Uint8Array.of(1), 1);
    await controller.start(driver);

    controller.audio(Uint8Array.of(2), 2);
    driver.dispatch({ type: 'ended', reason: 'user' });
    controller.audio(Uint8Array.of(3), 3);

    expect(driver.frames).toEqual([2]);
  });

  it('refuses commands when no session runs', async () => {
    const result = await controller.command({ type: 'clear' });
    expect(result).toEqual({ ok: false, code: ErrorCodes.Session.NotInSession, message: 'No session is running.' });
  });

  it('refuses a second session while one runs', async () => {
    await controller.start(new FakeDriver());
    const result = await controller.start(new FakeDriver());
    expect(result).toMatchObject({ ok: false, code: ErrorCodes.Session.AlreadyInSession });
  });

  it('forgets an inactivity notice once a command is accepted, as the server does', async () => {
    const driver = new FakeDriver();
    await controller.start(driver);
    driver.dispatch({
      type: 'event',
      event: { name: 'sessionEnding', e: { Seq: 1, AtMs: 1, Reason: 'inactive', SecondsLeft: 60 } },
    });
    expect(controller.current.ending).not.toBeNull();

    await controller.command({ type: 'setMode', auto: false, paused: null });

    expect(controller.current.ending).toBeNull();
  });

  it('keeps the inactivity notice when the server refuses the command', async () => {
    const driver = new FakeDriver();
    driver.command = async () => ({ ok: false, code: ErrorCodes.Request.RateLimited, message: 'Too many.' });
    await controller.start(driver);
    driver.dispatch({
      type: 'event',
      event: { name: 'sessionEnding', e: { Seq: 1, AtMs: 1, Reason: 'inactive', SecondsLeft: 60 } },
    });

    await controller.command({ type: 'trigger', text: null });

    expect(controller.current.ending).toEqual({ reason: 'inactive', secondsLeft: 60 });
  });

  it('forgets the question being put together once Clear heard is accepted', async () => {
    const driver = new FakeDriver();
    await controller.start(driver);
    driver.dispatch({ type: 'event', event: { name: 'transcriptFinal', e: { Seq: 1, AtMs: 1, Text: 'Next one.' } } });
    await controller.command({ type: 'clearHeard' });
    expect(controller.current.heard).toEqual({ finished: '', live: '' });
  });

  it('keeps looking back local: nothing goes to the server', async () => {
    const driver = new FakeDriver();
    await controller.start(driver);
    await controller.command({ type: 'view', index: 0 });
    expect(driver.commands).toEqual([]);
  });

  it('sends the overlay at most one state every 33 ms while an answer streams', async () => {
    const driver = new FakeDriver();
    await controller.start(driver);
    vi.advanceTimersByTime(40);
    published = [];

    driver.dispatch({
      type: 'event',
      event: { name: 'answerStart', e: { Seq: 1, AtMs: 1, AnswerId: 'a', Question: 'Q', Kind: AnswerKind.Spoken, Instruction: null } },
    });
    for (let i = 0; i < 20; i++) {
      driver.dispatch({ type: 'event', event: { name: 'answerDelta', e: { Seq: 2 + i, AtMs: 2, AnswerId: 'a', Text: 'x' } } });
    }
    vi.advanceTimersByTime(33);

    expect(published).toHaveLength(1);
    expect(published[0]!.answers[0]!.text).toBe('x'.repeat(20));
  });
});
