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
});
