// What answers are grounded in (Prepare, F14; the first run's step 3): kept on this computer in the encrypted database
// (main/storage), shown in the app window, and sent to the server only for a session (`SetContext`). Typed or pasted
// for now; reading files comes with 3.10. The prep doc waits for a command that sends it.
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

export interface DocumentsView {
  name: string;
  resume: string;
  jobDescription: string;
  notes: string;
  /** When each was last saved (epoch ms), or null if it never was. */
  savedAt: Record<DocumentField, number | null>;
}

export const emptyDocuments: DocumentsView = {
  name: '',
  resume: '',
  jobDescription: '',
  notes: '',
  savedAt: { name: null, resume: null, jobDescription: null, notes: null },
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

/** AUTO answers from both the résumé and the job description, as the server's own rule has it. */
export const answersOnItsOwn = (documents: DocumentsView) =>
  documents.resume.trim() !== '' && documents.jobDescription.trim() !== '';
