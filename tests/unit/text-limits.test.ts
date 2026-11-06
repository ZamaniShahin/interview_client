import { describe, expect, it } from 'vitest';
import { limitState } from '../../src/shared/text-limits';

describe('text limits', () => {
  it('shows the count only from 90% of the limit', () => {
    expect(limitState('x'.repeat(899), 1_000).showCount).toBe(false);
    expect(limitState('x'.repeat(900), 1_000).showCount).toBe(true);
  });

  it('names the limit past it, and promises nothing was cut', () => {
    const state = limitState('x'.repeat(4_212), 4_000);
    expect(state.over).toBe(212);
    expect(state.message).toBe('Shorten it by 212 characters. Nothing has been cut.');
  });

  it('says one character in the singular', () => {
    expect(limitState('x'.repeat(1_001), 1_000).message).toBe('Shorten it by 1 character. Nothing has been cut.');
  });

  it('has no message when the text fits', () => {
    expect(limitState('fits', 1_000).message).toBeNull();
  });
});
