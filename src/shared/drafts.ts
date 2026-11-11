// Prep drafts (3.9, the server's 3.4 jobs; v1's "draft answers"): likely questions with answers, written by the
// server from the documents, for the user to look over and keep in the answer bank, or skip. Nothing is kept until
// the user keeps it; a kept draft is a bank entry like any other, marked as drafted.
import { z } from 'zod';
import { maxBankEntries, maxPhrasingChars, type PreferencesView } from './answer-bank';
import type { DocumentsView } from './documents';

/** How many the server is asked for (its default; it takes 3 to 20). */
export const draftCount = 12;

/** The server's limits for the questions already prepared (backend `StartPrepDraftsValidator`). */
export const draftLimits = { prepared: 100, preparedChars: 300 } as const;

/** A draft as the server writes it, checked before it is shown: bounded far past what the server makes. */
export const draftSchema = z.object({
  phrasings: z.array(z.string().max(2_000)).min(1).max(20),
  answer: z.string().max(20_000),
});

export const draftsResultSchema = z.object({ drafts: z.array(draftSchema).max(50) });

/** A draft shown in Prepare, until it is kept or skipped. `id` names it in this app's life only. */
export interface DraftView {
  id: number;
  phrasings: string[];
  answer: string;
}

/** The drafts being written or waiting to be looked over. */
export interface DraftsView {
  writing: boolean;
  items: DraftView[];
}

export const emptyDrafts: DraftsView = { writing: false, items: [] };

/** A draft, as a window names it. */
export const draftIdSchema = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);

/** What `POST /api/v1/jobs/prep-drafts` takes. */
export interface DraftsRequest {
  name: string | null;
  resume: string | null;
  jobDescription: string | null;
  notes: string | null;
  prepared: string[];
  count: number;
}

const orNull = (text: string) => (text.trim() ? text : null);

/**
 * The drafts asked for: the documents as kept, and the questions the bank already holds (each entry's first way to
 * ask it), so the server drafts others. Null when there is neither a résumé nor a job description: the server writes
 * from them, and would refuse.
 */
export function draftsRequestOf(documents: DocumentsView, preferences: PreferencesView): DraftsRequest | null {
  if (!documents.resume.trim() && !documents.jobDescription.trim()) return null;
  return {
    name: orNull(documents.name),
    resume: orNull(documents.resume),
    jobDescription: orNull(documents.jobDescription),
    notes: orNull(documents.notes),
    prepared: preferences.bank
      .slice(0, Math.min(maxBankEntries, draftLimits.prepared))
      .map((entry) => entry.phrasings[0] ?? '')
      .filter(
        (phrasing) =>
          phrasing.trim() !== '' && phrasing.length <= Math.min(maxPhrasingChars, draftLimits.preparedChars),
      ),
    count: draftCount,
  };
}
