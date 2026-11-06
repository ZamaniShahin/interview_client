import { describe, expect, it } from 'vitest';
import { AskMode } from '../../src/shared/contracts/sotto-contracts';
import { overlayCommandSchema, overlayWindowActionSchema, startSessionSchema } from '../../src/shared/ipc';
import { settingsPatchSchema } from '../../src/shared/settings';

describe('what a window may send to main', () => {
  it("accepts a question within its mode's limit", () => {
    expect(overlayCommandSchema.safeParse({ type: 'ask', mode: AskMode.Question, text: 'What is a mutex?' }).success).toBe(true);
  });

  it('refuses a Tip over its 1,000 characters', () => {
    const result = overlayCommandSchema.safeParse({ type: 'ask', mode: AskMode.Tip, text: 'x'.repeat(1_001) });
    expect(result.success).toBe(false);
  });

  it('accepts a pasted Result of 200,000 characters', () => {
    expect(overlayCommandSchema.safeParse({ type: 'ask', mode: AskMode.Result, text: 'x'.repeat(200_000) }).success).toBe(true);
  });

  it('refuses an empty question, an unknown mode and an unknown command', () => {
    expect(overlayCommandSchema.safeParse({ type: 'ask', mode: AskMode.Question, text: '   ' }).success).toBe(false);
    expect(overlayCommandSchema.safeParse({ type: 'ask', mode: 9, text: 'hi' }).success).toBe(false);
    expect(overlayCommandSchema.safeParse({ type: 'openUrl', url: 'https://example.com' }).success).toBe(false);
  });

  it('needs the consent box ticked to start a session', () => {
    expect(startSessionSchema.safeParse({ consent: true }).success).toBe(true);
    expect(startSessionSchema.safeParse({ consent: false }).success).toBe(false);
    expect(startSessionSchema.safeParse({}).success).toBe(false);
  });

  it('takes only known settings, with their own values', () => {
    expect(settingsPatchSchema.safeParse({ theme: 'light' }).success).toBe(true);
    expect(settingsPatchSchema.safeParse({ theme: 'blue' }).success).toBe(false);
    expect(settingsPatchSchema.safeParse({ apiKey: 'sk-…' }).success).toBe(false);
  });

  it('never sizes the overlay below its smallest', () => {
    expect(overlayWindowActionSchema.safeParse({ type: 'resize', width: 360, height: 200 }).success).toBe(true);
    expect(overlayWindowActionSchema.safeParse({ type: 'resize', width: 100, height: 50 }).success).toBe(false);
  });
});
