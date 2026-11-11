import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AnswerKind, ErrorCodes } from '../../src/shared/contracts/sotto-contracts';
import type { CommandResult } from '../../src/shared/ipc';
import type { LiveAction } from '../../src/shared/live/reducer';
import type { LiveViewState } from '../../src/shared/live/view-state';
import { captureFailureText } from '../../src/shared/screenshots';
import type { CaptureOutcome } from '../../src/main/screenshots/screen-capture';
import { ScreenshotShelf } from '../../src/main/screenshots/screenshot-shelf';
import type { EncodedShot } from '../../src/main/screenshots/shot-image';
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
      event: {
        name: 'answerStart',
        e: { Seq: 1, AtMs: 1, AnswerId: 'a', Question: 'Q', Kind: AnswerKind.Spoken, Instruction: null, ScreenshotIds: [] },
      },
    });
    for (let i = 0; i < 20; i++) {
      driver.dispatch({ type: 'event', event: { name: 'answerDelta', e: { Seq: 2 + i, AtMs: 2, AnswerId: 'a', Text: 'x' } } });
    }
    vi.advanceTimersByTime(33);

    expect(published).toHaveLength(1);
    expect(published[0]!.answers[0]!.text).toBe('x'.repeat(20));
  });
});

describe('screenshots through the session controller (3.6)', () => {
  const shot: EncodedShot = { bytes: Uint8Array.of(137, 80, 78, 71), mime: 'image/png', width: 800, height: 600 };
  let shelf: ScreenshotShelf;
  let outcomes: CaptureOutcome[];
  let captures: number;
  let controller: SessionController;
  let driver: FakeDriver;

  const status = (auto: boolean, seq = 1) =>
    driver.dispatch({ type: 'event', event: { name: 'status', e: { Seq: seq, AtMs: seq, Auto: auto, Paused: false, Stt: 'ok' } } });
  const attached = (ids: string[], seq: number, max = 5) =>
    driver.dispatch({ type: 'event', event: { name: 'attachments', e: { Seq: seq, AtMs: seq, Items: ids.map((Id) => ({ Id })), Max: max } } });

  beforeEach(async () => {
    vi.useFakeTimers();
    shelf = new ScreenshotShelf(() => 1_000);
    outcomes = [];
    captures = 0;
    controller = new SessionController(() => {}, {
      capture: async () => {
        captures += 1;
        return outcomes.shift() ?? { ok: true, shot };
      },
      shelf,
    });
    driver = new FakeDriver();
    await controller.start(driver);
  });

  afterEach(() => vi.useRealTimers());

  it('in AUTO, asks about the screenshot at once, with what was typed as its note', async () => {
    const result = await controller.command({ type: 'capture', hint: 'the second loop' });

    expect(result).toEqual({ ok: true });
    const [sent] = driver.commands;
    expect(sent).toMatchObject({ type: 'screenshotQuery', bytes: shot.bytes, hint: 'the second loop' });
    expect(shelf.get((sent as { id: string }).id)).toMatchObject({ bytes: shot.bytes, mime: 'image/png' });
  });

  it('in AUTO, sends no note for nothing typed', async () => {
    await controller.command({ type: 'capture', hint: '' });
    expect(driver.commands[0]).toMatchObject({ type: 'screenshotQuery', hint: null });
  });

  it('in MANUAL, attaches the screenshot for the next answer, and ignores the note', async () => {
    status(false);

    await controller.command({ type: 'capture', hint: 'ignored' });

    expect(driver.commands[0]).toMatchObject({ type: 'attachScreenshot', bytes: shot.bytes });
    expect(driver.commands[0]).not.toHaveProperty('hint');
  });

  it('without the documents AUTO answers only when asked, so a screenshot is attached', async () => {
    driver.dispatch({
      type: 'snapshot',
      snapshot: {
        SessionId: 's', Phase: 1, Auto: true, Paused: false, ContextReady: false, Heard: '', LastSeq: 1,
        Attachments: [], MaxAttachments: 5, PrepDoc: null, CustomInstructionsChars: 0, PreparedInPrompt: [], Practice: null,
      },
    });

    await controller.command({ type: 'capture', hint: null });

    expect(driver.commands[0]).toMatchObject({ type: 'attachScreenshot' });
  });

  it('says a question with all its screenshots is full before taking another', async () => {
    status(false);
    attached(['a', 'b', 'c'], 2, 3);

    const result = await controller.command({ type: 'capture', hint: null });

    expect(result).toEqual({ ok: false, code: 'capture_full', message: captureFailureText.full });
    expect(captures).toBe(0);
    expect(driver.commands).toEqual([]);
  });

  it.each(['busy', 'too_soon', 'blank', 'failed'] as const)('words a capture that made nothing (%s), and sends nothing', async (failure) => {
    outcomes.push({ ok: false, failure });

    const result = await controller.command({ type: 'capture', hint: null });

    expect(result).toEqual({ ok: false, code: `capture_${failure}`, message: captureFailureText[failure] });
    expect(driver.commands).toEqual([]);
    expect(shelf.size).toBe(0);
  });

  it('says nothing for a cancelled selection', async () => {
    outcomes.push({ ok: false, failure: 'cancelled' });
    expect(await controller.command({ type: 'capture', hint: null })).toEqual({ ok: false, code: 'capture_cancelled', message: '' });
    expect(driver.commands).toEqual([]);
  });

  it('keeps no screenshot the server refused', async () => {
    driver.command = async () => ({ ok: false, code: ErrorCodes.Licensing.QuotaExceeded, message: 'No more this session.' });

    const result = await controller.command({ type: 'capture', hint: null });

    expect(result).toMatchObject({ ok: false, code: ErrorCodes.Licensing.QuotaExceeded });
    expect(shelf.size).toBe(0);
  });

  it('sends nothing when the session ended while the selector showed', async () => {
    controller = new SessionController(() => {}, {
      capture: async () => {
        driver.dispatch({ type: 'ended', reason: 'user' });
        return { ok: true, shot };
      },
      shelf,
    });
    driver = new FakeDriver();
    await controller.start(driver);

    const result = await controller.command({ type: 'capture', hint: null });

    expect(result).toMatchObject({ ok: false, code: ErrorCodes.Session.NotInSession });
    expect(driver.commands).toEqual([]);
  });

  it('refuses a capture with no session, before taking anything', async () => {
    const idle = new SessionController(() => {}, { capture: async () => ({ ok: true, shot }), shelf });
    expect(await idle.command({ type: 'capture', hint: null })).toMatchObject({ code: ErrorCodes.Session.NotInSession });
  });

  it('attaches a kept screenshot again with its own bytes, and only one still kept, not attached, with room', async () => {
    const id = shelf.keep(shot);

    expect(await controller.command({ type: 'reattachScreenshot', id })).toEqual({ ok: true });
    expect(driver.commands[0]).toEqual({ type: 'attachScreenshot', id, bytes: shot.bytes });

    attached([id], 2);
    expect(await controller.command({ type: 'reattachScreenshot', id })).toEqual({ ok: true });
    expect(driver.commands).toHaveLength(1);

    expect(await controller.command({ type: 'reattachScreenshot', id: 'shot-gone-1' })).toMatchObject({
      ok: false,
      code: ErrorCodes.Request.NotFound,
    });
    attached(['a', 'b', 'c', 'd', 'e'], 3);
    expect(await controller.command({ type: 'reattachScreenshot', id })).toMatchObject({ ok: false, code: 'capture_full' });
  });

  it('passes taking a screenshot back to the driver', async () => {
    await controller.command({ type: 'detachScreenshot', id: 'shot-a-1' });
    expect(driver.commands).toEqual([{ type: 'detachScreenshot', id: 'shot-a-1' }]);
  });

  it('lets the screenshots go when the session is closed', async () => {
    shelf.keep(shot);
    controller.reset();
    expect(shelf.size).toBe(0);
  });

  it('keeps what is attached and under the latest answers when the shelf is full, letting the oldest others go', async () => {
    const small = new ScreenshotShelf(() => 1, 2);
    controller = new SessionController(() => {}, { capture: async () => ({ ok: true, shot }), shelf: small });
    driver = new FakeDriver();
    await controller.start(driver);
    const old = small.keep(shot);
    const underAnswer = small.keep(shot);
    driver.dispatch({
      type: 'event',
      event: {
        name: 'answerStart',
        e: { Seq: 1, AtMs: 1, AnswerId: 'a', Question: 'Q', Kind: AnswerKind.Screen, Instruction: null, ScreenshotIds: [underAnswer] },
      },
    });
    const waiting = small.keep(shot);

    attached([waiting], 2);
    expect([old, underAnswer, waiting].map((id) => small.get(id) !== null)).toEqual([false, true, true]);

    const [newer, newest] = [small.keep(shot), small.keep(shot)];
    attached([waiting], 3);
    expect([underAnswer, waiting, newer, newest].map((id) => small.get(id) !== null)).toEqual([true, true, false, false]);
  });
});
