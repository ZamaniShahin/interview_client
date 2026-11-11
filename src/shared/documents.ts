// What answers are grounded in (Prepare, F14; the first run's step 3): kept on this computer in the encrypted database
// (main/storage), shown in the app window, and sent to the server only for a session (`SetContext`, and the prep doc
// with `SetPrepDoc`). Typed, pasted, or read from a file on this computer (3.10): only the text is kept and sent.
import { z } from 'zod';
import { documentLimits } from './text-limits';

export const documentFields = ['name', 'resume', 'jobDescription', 'notes'] as const;
export type DocumentField = (typeof documentFields)[number];

/** The server's limits (text-limits.ts), field by field. */
export const fieldLimits: Record<DocumentField, number> = {
  name: documentLimits.name,
  resume: documentLimits.resume,
  jobDescription: documentLimits.jobDescription,
  notes: documentLimits.notes,
};

/**
 * The prep doc (3.10, the server's 3.2): a longer document prepared for this interview, with its file's name. `cut`:
 * read from a file longer than the limit, it was cut at a line break, and the server tells the model it has only the
 * start (v1's note).
 */
export interface PrepDocView {
  name: string;
  text: string;
  cut: boolean;
  savedAt: number;
}

export interface DocumentsView {
  name: string;
  resume: string;
  jobDescription: string;
  notes: string;
  /** When each was last saved (epoch ms), or null if it never was. */
  savedAt: Record<DocumentField, number | null>;
  prepDoc: PrepDocView | null;
}

export const emptyDocuments: DocumentsView = {
  name: '',
  resume: '',
  jobDescription: '',
  notes: '',
  savedAt: { name: null, resume: null, jobDescription: null, notes: null },
  prepDoc: null,
};

/** A change from Prepare or the first run: one field's whole text. Empty removes it. Never over its limit. */
export const setDocumentSchema = z
  .object({ field: z.enum(documentFields), text: z.string() })
  .strict()
  .superRefine((change, ctx) => {
    if (change.text.length > fieldLimits[change.field]) {
      ctx.addIssue({ code: 'custom', path: ['text'], message: 'too_long' });
    }
  });
export type SetDocumentRequest = z.infer<typeof setDocumentSchema>;

/** The longest a prep doc's name may be, as the server takes it. */
export const prepDocNameMaxChars = 200;

/** The prep doc, whole: its text (empty removes it), its file's name, and whether it was cut. */
export const setPrepDocSchema = z
  .object({
    text: z.string().max(documentLimits.prepDoc),
    name: z.string().trim().max(prepDocNameMaxChars),
    cut: z.boolean(),
  })
  .strict();
export type SetPrepDocRequest = z.infer<typeof setPrepDocSchema>;

/** What may be read from a file: one of the documents, or the prep doc. */
export const readTargetSchema = z.enum([...documentFields, 'prepDoc']);
export type ReadTarget = z.infer<typeof readTargetSchema>;

/**
 * A file read on this computer (3.10): its text, for the user to look over before saving, its name, and for the prep
 * doc whether it was cut. A document over its limit comes back whole, for the user to shorten: nothing but the prep
 * doc is cut.
 */
export type ReadDocumentResult =
  { ok: true; text: string; name: string; cut: boolean } | { ok: false; code: string; message: string };

/** AUTO answers from both the résumé and the job description, as the server's own rule has it. */
export const answersOnItsOwn = (documents: DocumentsView) =>
  documents.resume.trim() !== '' && documents.jobDescription.trim() !== '';
