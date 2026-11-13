// The preferences (3.8, the server's 3.2): custom instructions for every answer, and the answer bank, the user's
// prepared answers, each with the phrasings it answers. Kept on this computer, encrypted; the enabled entries and the
// instructions go to the server with a session (`SetPreferences`). v1's answer_bank.py rules, as limits the server
// shares (backend contract `SetPreferencesRequest`, `PreparedAnswer`).
import { z } from 'zod';
import type { SetPreferencesRequest } from './contracts/sotto-contracts';

/** At most this many entries, enabled or not (v1's MAX_ENTRIES; the server takes this many enabled ones). */
export const maxBankEntries = 100;
/** The question and the other ways it gets asked. */
export const maxPhrasings = 6;
export const maxPhrasingChars = 300;
export const maxAnswerChars = 4_000;
/** Custom instructions, as the server takes them. */
export const maxInstructionsChars = 4_000;

/** An id as the client names an entry: the server names the ones in the prompt by it (at most 40 characters). */
export const bankIdSchema = z.string().regex(/^[A-Za-z0-9_-]{1,40}$/);

export interface BankEntry {
  id: string;
  /** The question first, as lists show it; then the other ways it gets asked. */
  phrasings: string[];
  answer: string;
  /** Only enabled entries go to the server and are matched; a disabled one waits. */
  enabled: boolean;
  /** Typed by the user, or drafted by the server and kept (3.9's drafts). */
  source: 'manual' | 'draft';
  updatedAt: number;
}

export interface PreferencesView {
  instructions: string;
  instructionsSavedAt: number | null;
  /** In the order kept, which is the order sent: the server fits the first ones in its prompt. */
  bank: BankEntry[];
}

export const emptyPreferences: PreferencesView = { instructions: '', instructionsSavedAt: null, bank: [] };

/** A phrasing as kept: whitespace collapsed to single spaces, nothing around it (v1's normalize_entry). */
export function cleanPhrasing(text: string): string {
  return text.split(/\s+/).filter(Boolean).join(' ');
}

/**
 * The phrasings of an entry being saved, from one per line or a list: cleaned, the empty ones and repeats (in any
 * case) dropped, in their order. v1's normalize_entry, except that nothing is cut: the editor names a limit instead.
 */
export function phrasingsOf(input: string | string[]): string[] {
  const lines = typeof input === 'string' ? input.split(/\r?\n/) : input;
  const out: string[] = [];
  const seen = new Set<string>();
  for (const line of lines) {
    const phrasing = cleanPhrasing(line);
    if (phrasing && !seen.has(phrasing.toLowerCase())) {
      seen.add(phrasing.toLowerCase());
      out.push(phrasing);
    }
  }
  return out;
}

/** What the app window sends to save an entry; main gives a new one its id. Checked again after cleaning. */
export const bankEntryInputSchema = z
  .object({
    id: bankIdSchema.nullable(),
    phrasings: z.array(z.string().max(maxPhrasingChars * 4)).max(maxPhrasings * 4),
    answer: z.string().max(maxAnswerChars * 2),
    enabled: z.boolean(),
  })
  .strict();
export type BankEntryInput = z.infer<typeof bankEntryInputSchema>;

/** Why an entry can't be kept, in the editor's words; null when it can. */
export function bankEntryProblem(phrasings: string[], answer: string): string | null {
  if (phrasings.length === 0) return 'Add the question: one per line for the other ways it gets asked.';
  if (phrasings.length > maxPhrasings)
    return `Up to ${maxPhrasings} ways to ask it: remove ${phrasings.length - maxPhrasings}.`;
  const long = phrasings.findIndex((p) => p.length > maxPhrasingChars);
  if (long >= 0) return `Each way to ask it is ${maxPhrasingChars} characters at most: shorten line ${long + 1}.`;
  if (!answer.trim()) return 'Add the answer.';
  if (answer.trim().length > maxAnswerChars) {
    return `The answer is ${maxAnswerChars.toLocaleString('en-US')} characters at most: shorten it by ${(answer.trim().length - maxAnswerChars).toLocaleString('en-US')}.`;
  }
  return null;
}

export const instructionsSchema = z.string().max(maxInstructionsChars);

/**
 * The preferences as a session sends them (`SetPreferences`): the instructions, and the bank's enabled entries in its
 * order, the most the server takes; the server fits the first ones into its prompt. Nothing to send is null.
 */
export function preferencesToSend(
  view: PreferencesView,
): Omit<SetPreferencesRequest, 'CommandId' | 'GapFillers'> | null {
  const enabled = view.bank.filter((entry) => entry.enabled).slice(0, maxBankEntries);
  if (!view.instructions.trim() && enabled.length === 0) return null;
  return {
    CustomInstructions: view.instructions.trim() ? view.instructions : null,
    PreparedAnswers: enabled.map((entry) => ({ Id: entry.id, Phrasings: entry.phrasings, Answer: entry.answer })),
  };
}
