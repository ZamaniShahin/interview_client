// Prep drafts (3.9, the server's 3.4 job): likely questions with answers, written from the documents, held in main's
// memory until the user keeps each in the answer bank or skips it. Main holds them, not the window, so they wait
// while the user looks elsewhere; none is written to disk until kept.
import type { BankEntryInput, PreferencesView } from '../../shared/answer-bank';
import { maxPhrasingChars, maxPhrasings } from '../../shared/answer-bank';
import { ErrorCodes } from '../../shared/contracts/sotto-contracts';
import type { DocumentsView } from '../../shared/documents';
import { draftsRequestOf, draftsResultSchema, type DraftsView, type DraftView } from '../../shared/drafts';
import type { CommandResult } from '../../shared/ipc';
import { jobFailureText } from '../../shared/jobs';
import { ApiError } from '../api/rest-client';

export interface DraftsServiceDependencies {
  /** What the drafts are written from, or null while it can't be read. */
  documents: () => DocumentsView | null;
  preferences: () => PreferencesView | null;
  /** Runs a job on the server (run-job.ts): its result, or an ApiError. */
  job: (path: string, body: unknown) => Promise<unknown>;
  /** Keeps a draft in the answer bank, marked as drafted; refused in words when it can't be kept. */
  keep: (input: BankEntryInput) => { ok: true } | { ok: false; problem: string };
  changed: (drafts: DraftsView) => void;
}

const noDocuments: CommandResult = {
  ok: false,
  code: ErrorCodes.Field.Required,
  message: 'Add your résumé or the job description first: the drafts are written from them.',
};

export class DraftsService {
  private items: DraftView[] = [];
  private writing = false;
  private seq = 0;

  constructor(private readonly deps: DraftsServiceDependencies) {}

  get view(): DraftsView {
    return { writing: this.writing, items: [...this.items] };
  }

  /** Asks the server for drafts; new ones join those still waiting, past the ones already shown. */
  async write(): Promise<CommandResult> {
    if (this.writing) return { ok: false, code: 'drafts_running', message: 'Drafts are being written.' };
    const documents = this.deps.documents();
    const preferences = this.deps.preferences();
    if (!documents || !preferences) {
      return {
        ok: false,
        code: ErrorCodes.Request.Unavailable,
        message: "This computer's documents can't be read right now.",
      };
    }
    const request = draftsRequestOf(documents, {
      ...preferences,
      // The questions waiting here are prepared too: the server is asked for others.
      bank: [
        ...preferences.bank,
        ...this.items.map((d) => ({
          id: '',
          phrasings: d.phrasings,
          answer: '',
          enabled: true,
          source: 'draft' as const,
          updatedAt: 0,
        })),
      ],
    });
    if (!request) return noDocuments;

    this.writing = true;
    this.announce();
    try {
      const parsed = draftsResultSchema.safeParse(await this.deps.job('/api/v1/jobs/prep-drafts', request));
      if (!parsed.success) {
        return {
          ok: false,
          code: ErrorCodes.Request.Internal,
          message: "The drafts came back in a form Sotto can't read. Ask again.",
        };
      }
      for (const draft of parsed.data.drafts) {
        const phrasings = draft.phrasings.map((p) => p.trim()).filter(Boolean);
        if (phrasings.length === 0 || !draft.answer.trim()) continue;
        this.items.push({ id: ++this.seq, phrasings, answer: draft.answer.trim() });
      }
      return { ok: true };
    } catch (error) {
      const code = error instanceof ApiError ? error.code : ErrorCodes.Request.Unavailable;
      return { ok: false, code, message: jobFailureText('drafts', code) };
    } finally {
      this.writing = false;
      this.announce();
    }
  }

  /**
   * Keeps a draft in the answer bank, as written: its first ways to ask it that fit the bank (6, of 300 characters
   * each), and its answer, which the bank checks. Refused in words, and still waiting, when it can't be kept.
   */
  keep(id: number): CommandResult {
    const draft = this.items.find((d) => d.id === id);
    if (!draft) return { ok: false, code: ErrorCodes.Request.NotFound, message: 'That draft is no longer here.' };
    const phrasings = draft.phrasings.filter((p) => p.length <= maxPhrasingChars).slice(0, maxPhrasings);
    const kept = this.deps.keep({ id: null, phrasings, answer: draft.answer, enabled: true });
    if (!kept.ok) return { ok: false, code: ErrorCodes.Request.InvalidInput, message: kept.problem };
    this.drop(id);
    return { ok: true };
  }

  skip(id: number): CommandResult {
    if (!this.items.some((d) => d.id === id)) {
      return { ok: false, code: ErrorCodes.Request.NotFound, message: 'That draft is no longer here.' };
    }
    this.drop(id);
    return { ok: true };
  }

  private drop(id: number): void {
    this.items = this.items.filter((d) => d.id !== id);
    this.announce();
  }

  private announce(): void {
    this.deps.changed(this.view);
  }
}
