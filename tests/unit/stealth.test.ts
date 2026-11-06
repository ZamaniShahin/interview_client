import { describe, expect, it } from 'vitest';
import { keepOnTop, keepOutOfCapture } from '../../src/main/windows/stealth';

describe('the stealth rules main applies to every window', () => {
  it('leaves a window out of captures at once, and again every time it is shown', () => {
    const calls: boolean[] = [];
    let onShow: (() => void) | undefined;
    keepOutOfCapture({
      setContentProtection: (enable) => calls.push(enable),
      on: (_event, listener) => (onShow = listener),
    });
    expect(calls).toEqual([true]);
    // Windows resets the flag on each show (v1 KNOWN_ISSUES #12).
    onShow?.();
    onShow?.();
    expect(calls).toEqual([true, true, true]);
  });

  it('keeps the overlay above the call at the screen-saver level', () => {
    const levels: (string | undefined)[] = [];
    keepOnTop({ setAlwaysOnTop: (flag, level) => flag && levels.push(level) });
    expect(levels).toEqual(['screen-saver']);
  });
});
