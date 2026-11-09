import { describe, expect, it } from 'vitest';
import { AskMode } from '../../src/shared/contracts/sotto-contracts';
import { setDocumentSchema } from '../../src/shared/documents';
import {
  acknowledgeNoticeSchema,
  copyTextSchema,
  hidingTestActionSchema,
  overlayCommandSchema,
  overlayWindowActionSchema,
  signInPageActionSchema,
  soundCheckActionSchema,
  startSessionSchema,
} from '../../src/shared/ipc';
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

  it('takes a session over only with consent, and only with a plain yes or no', () => {
    expect(startSessionSchema.safeParse({ consent: true, takeOver: true }).success).toBe(true);
    expect(startSessionSchema.safeParse({ consent: true, takeOver: false }).success).toBe(true);
    expect(startSessionSchema.safeParse({ takeOver: true }).success).toBe(false);
    expect(startSessionSchema.safeParse({ consent: true, takeOver: 'yes' }).success).toBe(false);
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

describe("what an answer's Copy may hand main (1.13)", () => {
  it('takes a code block of any size an answer has', () => {
    expect(copyTextSchema.safeParse('print("swiss")\n').success).toBe(true);
    expect(copyTextSchema.safeParse('x'.repeat(100_000)).success).toBe(true);
  });

  it('refuses nothing to copy, too much, or anything but text', () => {
    expect(copyTextSchema.safeParse('').success).toBe(false);
    expect(copyTextSchema.safeParse('x'.repeat(100_001)).success).toBe(false);
    expect(copyTextSchema.safeParse({ text: 'code' }).success).toBe(false);
    expect(copyTextSchema.safeParse(42).success).toBe(false);
  });
});

describe('what the app window may keep as a document (1.14)', () => {
  it.each([
    ['name', 200],
    ['resume', 50_000],
    ['jobDescription', 30_000],
    ['notes', 5_000],
  ] as const)('takes a %s up to its limit of %i characters, and refuses one past it', (field, limit) => {
    expect(setDocumentSchema.safeParse({ field, text: 'x'.repeat(limit) }).success).toBe(true);
    const over = setDocumentSchema.safeParse({ field, text: 'x'.repeat(limit + 1) });
    expect(over.success).toBe(false);
    expect(over.error?.issues[0]?.message).toBe('too_long');
  });

  it('takes an empty text, which removes the document', () => {
    expect(setDocumentSchema.safeParse({ field: 'resume', text: '' }).success).toBe(true);
  });

  it('refuses a document it has no place for, extra fields, and anything but text', () => {
    expect(setDocumentSchema.safeParse({ field: 'prepDoc', text: 'x' }).success).toBe(false);
    expect(setDocumentSchema.safeParse({ field: 'resume', text: 'x', path: 'C:\resume.pdf' }).success).toBe(false);
    expect(setDocumentSchema.safeParse({ field: 'resume', text: 42 }).success).toBe(false);
  });
});

describe('what the setup may ask of main (1.14)', () => {
  it('acknowledges a notice by its version, and nothing else', () => {
    expect(acknowledgeNoticeSchema.safeParse({ version: 1 }).success).toBe(true);
    expect(acknowledgeNoticeSchema.safeParse({ version: 0 }).success).toBe(false);
    expect(acknowledgeNoticeSchema.safeParse({ version: 1.5 }).success).toBe(false);
    expect(acknowledgeNoticeSchema.safeParse({ version: 1, at: 0 }).success).toBe(false);
  });

  it('knows the sound check, Test hiding and the sign-in page by their few actions', () => {
    expect(['start', 'stop'].map((a) => soundCheckActionSchema.safeParse(a).success)).toEqual([true, true]);
    expect(['show', 'hide', 'hidden'].map((a) => hidingTestActionSchema.safeParse(a).success)).toEqual([true, true, true]);
    expect(['open', 'copy'].map((a) => signInPageActionSchema.safeParse(a).success)).toEqual([true, true]);
    for (const schema of [soundCheckActionSchema, hidingTestActionSchema, signInPageActionSchema]) {
      expect(schema.safeParse('delete').success).toBe(false);
      expect(schema.safeParse({ action: 'start' }).success).toBe(false);
    }
  });
});
