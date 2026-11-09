import { describe, expect, it } from 'vitest';
import { hotkeyRows, keysOf, sessionHotkeys, type HotkeyAction } from '../../src/shared/hotkeys';

describe('the hotkeys the first run shows (1.14)', () => {
  it('shows every hotkey main registers, once', () => {
    const shown = hotkeyRows.flatMap((row) => row.actions);
    expect([...shown].sort()).toEqual((Object.keys(sessionHotkeys) as HotkeyAction[]).sort());
  });

  it("draws each row's keys as the canvas does", () => {
    expect(Object.fromEntries(hotkeyRows.map((row) => [row.label, keysOf(row.actions).join(' ')]))).toEqual({
      'Answer now': 'Ctrl Enter',
      'Type in the overlay': 'Ctrl Shift Space',
      'AUTO or MANUAL': 'Ctrl Shift A',
      'Pause or resume': 'Ctrl Shift P',
      'Earlier or later answer': 'Ctrl Shift ← →',
      'Compact or full view': 'Ctrl Shift M',
      'Hide or show the overlay': 'Ctrl Shift H',
    });
  });
});
