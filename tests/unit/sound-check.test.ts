import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SoundCheck } from '../../src/main/session/sound-check';
import type { SessionCommand, SessionDriver } from '../../src/main/session/session-controller';
import { ErrorCodes, SessionEndReasons, SpeechStates } from '../../src/shared/contracts/sotto-contracts';
import type { SoundCheckView } from '../../src/shared/first-run';
import type { CommandResult } from '../../src/shared/ipc';
import type { LiveAction } from '../../src/shared/live/reducer';

let seq = 0;
const stamp = () => ({ Seq: ++seq, AtMs: 1_800_000_000_000 + seq });

/** A session as the hub would run it: starting, then live; `say` brings a transcript, `end` the server's ending. */
class FakeDriver implements SessionDriver {
  dispatch: (action: LiveAction) => void = () => {};
  readonly frames: number[] = [];
  readonly commands: SessionCommand[] = [];
  disposed = false;

  constructor(private readonly answer: CommandResult = { ok: true }) {}

  async start(dispatch: (action: LiveAction) => void): Promise<CommandResult> {
    this.dispatch = dispatch;
    dispatch({ type: 'starting' });
    if (!this.answer.ok) return this.answer;
    dispatch({
      type: 'event',
      event: { name: 'status', e: { ...stamp(), Auto: false, Paused: false, Stt: SpeechStates.Ok } },
    });
    return { ok: true };
  }

  async command(command: SessionCommand): Promise<CommandResult> {
    this.commands.push(command);
    if (command.type === 'endSession') this.end(SessionEndReasons.User);
    return { ok: true };
  }

  audio(pcm: Uint8Array): void {
    this.frames.push(pcm[0]!);
  }

  dispose(): void {
    this.disposed = true;
  }

  say(text: string, final = true): void {
    this.dispatch({
      type: 'event',
      event: { name: final ? 'transcriptFinal' : 'transcriptPartial', e: { ...stamp(), Text: text } },
    });
  }

  end(reason: string): void {
    this.dispatch({ type: 'event', event: { name: 'sessionEnded', e: { ...stamp(), Reason: reason } } });
  }
}

function harness(options: { busy?: boolean; answer?: CommandResult } = {}) {
  const drivers: FakeDriver[] = [];
  const views: SoundCheckView[] = [];
  const capture = { started: 0, stopped: 0 };
  let passed = 0;
  const check = new SoundCheck({
    driver: () => {
      const driver = new FakeDriver(options.answer);
      drivers.push(driver);
      return driver;
    },
    busy: () => options.busy ?? false,
    startCapture: () => capture.started++,
    stopCapture: () => capture.stopped++,
    passed: () => passed++,
    publish: (view) => views.push(view),
    now: () => 1_000,
  });
  return { check, drivers, views, capture, passed: () => passed, last: () => views.at(-1)! };
}

describe("the first run's sound check (1.14)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('starts a session of its own when asked, then listens to this computer', async () => {
    const h = harness();
    expect(h.views).toEqual([]);

    expect(await h.check.start()).toEqual({ ok: true });
    vi.advanceTimersByTime(40);

    expect(h.drivers).toHaveLength(1);
    expect(h.capture.started).toBe(1);
    expect(h.check.running).toBe(true);
    expect(h.last()).toMatchObject({ phase: 'live', startedAtMs: 1_000, heardSomething: false, problem: null });
  });

  it('passes on the first words it hears, once, and shows them', async () => {
    const h = harness();
    await h.check.start();

    h.drivers[0]!.say('The telescope sees in infrared', false);
    vi.advanceTimersByTime(40);
    h.drivers[0]!.say('The telescope sees in infrared.');
    vi.advanceTimersByTime(40);

    expect(h.passed()).toBe(1);
    expect(h.last()).toMatchObject({
      heardSomething: true,
      heard: { finished: 'The telescope sees in infrared.', live: '' },
    });
  });

  it("hands this computer's sound to its own session, and shows how capture goes", async () => {
    const h = harness();
    await h.check.start();

    h.check.audio(Uint8Array.of(7), 1);
    h.check.capture({ level: 0.4, noSound: false, down: false });
    vi.advanceTimersByTime(40);
    h.check.capture({ level: 0, noSound: true, down: false });
    vi.advanceTimersByTime(40);

    expect(h.drivers[0]!.frames).toEqual([7]);
    expect(h.views.map((v) => v.level)).toContain(0.4);
    expect(h.last()).toMatchObject({ level: 0, noSound: true });
  });

  it('ends its session when left, so what it heard never joins a real question', async () => {
    const h = harness();
    await h.check.start();
    h.drivers[0]!.say('Something heard.');

    await h.check.stop();

    expect(h.drivers[0]!.commands).toEqual([{ type: 'endSession' }]);
    expect(h.drivers[0]!.disposed).toBe(true);
    expect(h.capture.stopped).toBe(1);
    expect(h.check.running).toBe(false);
    expect(h.last()).toMatchObject({ phase: 'idle', heardSomething: false, heard: { finished: '', live: '' } });
  });

  it('stops quietly when nothing runs', async () => {
    const h = harness();
    await h.check.stop();
    expect(h.capture.stopped).toBe(0);
    expect(h.views).toEqual([]);
  });

  it("says why it couldn't start, in the server's words, and listens to nothing", async () => {
    const h = harness({
      answer: {
        ok: false,
        code: ErrorCodes.Licensing.NoEntitlement,
        message: "Your plan doesn't include live sessions.",
      },
    });

    const result = await h.check.start();

    expect(result).toMatchObject({ ok: false, code: ErrorCodes.Licensing.NoEntitlement });
    expect(h.capture.started).toBe(0);
    expect(h.check.running).toBe(false);
    expect(h.last()).toMatchObject({ phase: 'idle', problem: { message: "Your plan doesn't include live sessions." } });
  });

  it('waits while a real session runs: the seat has one at a time', async () => {
    const h = harness({ busy: true });

    expect(await h.check.start()).toMatchObject({ ok: false, code: ErrorCodes.Session.AlreadyInSession });
    expect(h.drivers).toEqual([]);
  });

  it('starts once, however often asked', async () => {
    const h = harness();
    await h.check.start();
    await h.check.start();
    expect(h.drivers).toHaveLength(1);
  });

  it('says so when the server ends it, and stops listening', async () => {
    const h = harness();
    await h.check.start();

    h.drivers[0]!.end(SessionEndReasons.CreditExhausted);
    vi.advanceTimersByTime(40);

    expect(h.capture.stopped).toBe(1);
    expect(h.check.running).toBe(false);
    expect(h.last()).toMatchObject({ phase: 'ended', problem: { code: SessionEndReasons.CreditExhausted } });
  });

  it('can run again after it was left', async () => {
    const h = harness();
    await h.check.start();
    await h.check.stop();

    await h.check.start();

    expect(h.drivers).toHaveLength(2);
    expect(h.capture.started).toBe(2);
  });
});
