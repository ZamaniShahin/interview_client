import { describe, expect, it } from 'vitest';
import { SessionEndReasons } from '../../src/shared/contracts/sotto-contracts';
import { endedText, overlayBanner } from '../../src/shared/live/copy';
import { initialLiveState, type LiveViewState } from '../../src/shared/live/view-state';

const live = (change: Partial<LiveViewState>): LiveViewState => ({ ...initialLiveState, phase: 'live', ...change });

describe("the overlay's words", () => {
  it('has calm, plain words for every way a session ends', () => {
    for (const reason of Object.values(SessionEndReasons)) {
      const text = endedText(reason);
      expect(text).toMatch(/\.$/);
      expect(text).not.toContain('!');
    }
    expect(endedText(SessionEndReasons.CreditExhausted)).toBe('The session ended: no minutes left.');
  });

  it('still reads calmly for a reason a newer server added', () => {
    expect(endedText('something_new')).toBe('Session ended.');
  });

  it('says it is reconnecting before anything else', () => {
    expect(overlayBanner(live({ phase: 'reconnecting', paused: true }))?.lead).toBe('Reconnecting…');
  });

  it('says minutes still count while paused', () => {
    expect(overlayBanner(live({ paused: true }))).toMatchObject({ lead: 'Paused.', rest: 'Minutes still count.' });
  });

  it("says listening isn't available at the start, and is down later", () => {
    expect(overlayBanner(live({ listening: 'down' }))?.lead).toBe("Listening isn't available right now.");
    expect(overlayBanner(live({ listening: 'down', heard: { finished: 'Next one.', live: '' } }))?.lead).toBe(
      'Listening is down.',
    );
  });

  it('says how to answer automatically when AUTO cannot run', () => {
    expect(overlayBanner(live({ autoAvailable: false }))?.lead).toBe('Answers only when you ask.');
  });

  it('shows nothing when all is well', () => {
    expect(overlayBanner(live({}))).toBeNull();
  });

  it("says when the minutes run out, in the canvas's words", () => {
    expect(overlayBanner(live({ ending: { reason: SessionEndReasons.CreditExhausted, secondsLeft: 30 } }))).toEqual({
      icon: 'clock',
      lead: 'No minutes left.',
      rest: 'The session ends in 30 seconds.',
    });
  });

  it('tells an inactive user how to keep the session', () => {
    expect(overlayBanner(live({ ending: { reason: SessionEndReasons.Inactive, secondsLeft: 60 } }))).toMatchObject({
      lead: 'Nothing heard for a while.',
      rest: 'The session ends in a minute. Ask a question to keep it.',
    });
  });

  it('has calm words for every ending, and for one a newer server adds', () => {
    for (const reason of [...Object.values(SessionEndReasons), 'something_new']) {
      const banner = overlayBanner(live({ ending: { reason, secondsLeft: 30 } }));
      expect(banner?.lead).toMatch(/\.$/);
      expect(`${banner?.lead} ${banner?.rest}`).not.toContain('!');
    }
    expect(overlayBanner(live({ ending: { reason: 'something_new', secondsLeft: 1 } }))).toMatchObject({
      lead: 'The session is ending.',
      rest: 'The session ends in 1 second.',
    });
  });

  it('puts an ending above being paused, and reconnecting above an ending', () => {
    const endingSoon = { reason: SessionEndReasons.MaxLength, secondsLeft: 30 };
    expect(overlayBanner(live({ paused: true, ending: endingSoon }))?.icon).toBe('clock');
    expect(overlayBanner(live({ phase: 'reconnecting', ending: endingSoon }))?.icon).toBe('reconnect');
  });
});

describe("the overlay's words about this computer's sound", () => {
  const capture = (change: Partial<LiveViewState['capture']>) => ({
    level: null,
    noSound: false,
    down: false,
    ...change,
  });

  it('says when the device is lost, and that it is trying again', () => {
    expect(overlayBanner(live({ capture: capture({ down: true }) }))).toEqual({
      icon: 'attention',
      lead: "Can't hear this computer's sound.",
      rest: 'Trying again…',
    });
  });

  it('says when nothing has been heard yet, and what to check', () => {
    expect(overlayBanner(live({ capture: capture({ noSound: true }) }))).toMatchObject({
      lead: 'No sound from this computer yet.',
      rest: 'Check that the call plays on this computer.',
    });
  });

  it('puts a lost device above being paused, and being paused above no sound yet', () => {
    expect(overlayBanner(live({ paused: true, capture: capture({ down: true }) }))?.lead).toBe(
      "Can't hear this computer's sound.",
    );
    expect(overlayBanner(live({ paused: true, capture: capture({ noSound: true }) }))?.lead).toBe('Paused.');
  });

  it('puts reconnecting and an ending above both', () => {
    const lost = capture({ down: true, noSound: true });
    expect(overlayBanner(live({ phase: 'reconnecting', capture: lost }))?.icon).toBe('reconnect');
    expect(
      overlayBanner(live({ ending: { reason: SessionEndReasons.MaxLength, secondsLeft: 30 }, capture: lost }))?.icon,
    ).toBe('clock');
  });
});
