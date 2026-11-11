// What the app keeps on this computer, over the encrypted database (local-database.ts, schema.ts). Where each thing
// lives follows backend docs/07 §5: the résumé, the job description and the prep doc are `documents` (the prep doc
// with its file's name); the candidate's name, the notes and the settings are `settings` rows, each a key and a JSON
// value, as is whether the prep doc was cut. The answer bank is its own table (3.8), and the custom instructions a
// settings row. History (3.9) has four tables of its own, kept by history-store.ts over the same database.
import {
  emptyDocuments,
  type DocumentField,
  type DocumentsView,
  type PrepDocView,
  type SetPrepDocRequest,
} from '../../shared/documents';
import { randomUUID } from 'node:crypto';
import {
  bankEntryProblem,
  maxBankEntries,
  phrasingsOf,
  type BankEntry,
  type BankEntryInput,
  type PreferencesView,
} from '../../shared/answer-bank';
import type { FirstRunView } from '../../shared/first-run';
import { settingsSchema, type Settings } from '../../shared/settings';
import { HistoryStore } from './history-store';
import type { LocalDatabase } from './local-database';

type Place = { table: 'documents'; kind: 'resume' | 'jd' } | { table: 'settings'; key: string };

const placeOf: Record<DocumentField, Place> = {
  resume: { table: 'documents', kind: 'resume' },
  jobDescription: { table: 'documents', kind: 'jd' },
  name: { table: 'settings', key: 'profile.name' },
  notes: { table: 'settings', key: 'profile.notes' },
};

interface SavedText {
  text: string;
  savedAt: number;
}

const isSavedText = (value: unknown): value is SavedText =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as SavedText).text === 'string' &&
  typeof (value as SavedText).savedAt === 'number';

export class LocalStore {
  /** The interviews kept on this computer (3.9), in the same database. */
  readonly history: HistoryStore;

  constructor(
    private readonly db: LocalDatabase,
    private readonly now: () => number = Date.now,
  ) {
    this.history = new HistoryStore(db);
  }

  documents(): DocumentsView {
    const view: DocumentsView = { ...emptyDocuments, savedAt: { ...emptyDocuments.savedAt } };
    for (const [field, place] of Object.entries(placeOf) as [DocumentField, Place][]) {
      const saved = place.table === 'documents' ? this.document(place.kind) : this.setting(place.key);
      if (isSavedText(saved)) {
        view[field] = saved.text;
        view.savedAt[field] = saved.savedAt;
      }
    }
    view.prepDoc = this.prepDoc();
    return view;
  }

  /** The prep doc (3.10), or null when there is none. */
  prepDoc(): PrepDocView | null {
    const row = this.db.prepare("SELECT name, text, updated_at FROM documents WHERE kind = 'prep'").get() as
      { name: string | null; text: string; updated_at: string } | undefined;
    if (!row) return null;
    return {
      name: row.name ?? '',
      text: row.text,
      cut: this.setting('documents.prepCut') === true,
      savedAt: Date.parse(row.updated_at),
    };
  }

  /** Keeps the prep doc whole, with its name and whether it was cut; an empty text removes it. Checked by the IPC handler. */
  setPrepDoc(change: SetPrepDocRequest): DocumentsView {
    this.db.transaction(() => {
      if (change.text === '') {
        this.db.prepare("DELETE FROM documents WHERE kind = 'prep'").run();
        this.deleteSetting('documents.prepCut');
        return;
      }
      this.db
        .prepare(
          `INSERT INTO documents (kind, name, text, chars, updated_at) VALUES ('prep', ?, ?, ?, ?)
           ON CONFLICT (kind) DO UPDATE SET name = excluded.name, text = excluded.text, chars = excluded.chars,
             updated_at = excluded.updated_at`,
        )
        .run(change.name || null, change.text, change.text.length, new Date(this.now()).toISOString());
      if (change.cut) this.setSetting('documents.prepCut', true);
      else this.deleteSetting('documents.prepCut');
    })();
    return this.documents();
  }

  /** Keeps one field's whole text; an empty text removes it. The limits were checked by the IPC handler. */
  setDocument(field: DocumentField, text: string): DocumentsView {
    const place = placeOf[field];
    const at = this.now();
    if (place.table === 'documents') {
      if (text === '') {
        this.db.prepare('DELETE FROM documents WHERE kind = ?').run(place.kind);
      } else {
        this.db
          .prepare(
            `INSERT INTO documents (kind, name, text, chars, updated_at) VALUES (?, NULL, ?, ?, ?)
             ON CONFLICT (kind) DO UPDATE SET text = excluded.text, chars = excluded.chars, updated_at = excluded.updated_at`,
          )
          .run(place.kind, text, text.length, new Date(at).toISOString());
      }
    } else if (text === '') {
      this.deleteSetting(place.key);
    } else {
      this.setSetting(place.key, { text, savedAt: at } satisfies SavedText);
    }
    return this.documents();
  }

  /** The preferences (3.8): custom instructions, and the answer bank in the order its entries were added. */
  preferences(): PreferencesView {
    const instructions = this.setting('preferences.instructions');
    return {
      instructions: isSavedText(instructions) ? instructions.text : '',
      instructionsSavedAt: isSavedText(instructions) ? instructions.savedAt : null,
      bank: this.bank(),
    };
  }

  /** Keeps the custom instructions whole; empty removes them. Checked by the IPC handler. */
  setInstructions(text: string): PreferencesView {
    if (text.trim() === '') this.deleteSetting('preferences.instructions');
    else this.setSetting('preferences.instructions', { text, savedAt: this.now() } satisfies SavedText);
    return this.preferences();
  }

  /**
   * Keeps an entry, cleaned as v1 kept it (`normalize_entry`): new, it gets an id and goes last; known, it is changed in
   * its place. Refused in words when it isn't one (no question, no answer, past a limit), or the bank is full.
   */
  saveBankEntry(
    input: BankEntryInput,
    source: BankEntry['source'] = 'manual',
  ): { ok: true; entry: BankEntry } | { ok: false; problem: string } {
    const phrasings = phrasingsOf(input.phrasings);
    const answer = input.answer.trim();
    const problem = bankEntryProblem(phrasings, answer);
    if (problem) return { ok: false, problem };
    const known = input.id !== null && this.bank().some((e) => e.id === input.id);
    if (!known && this.bank().length >= maxBankEntries) {
      return { ok: false, problem: `The answer bank is full (${maxBankEntries} answers): delete one first.` };
    }
    const entry: BankEntry = {
      id: known ? input.id! : randomUUID().replace(/-/g, ''),
      phrasings,
      answer,
      enabled: input.enabled,
      source: known ? (this.bank().find((e) => e.id === input.id)?.source ?? source) : source,
      updatedAt: this.now(),
    };
    this.db
      .prepare(
        `INSERT INTO answer_bank (id, phrasings, answer, enabled, source, updated_at) VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT (id) DO UPDATE SET phrasings = excluded.phrasings, answer = excluded.answer,
           enabled = excluded.enabled, updated_at = excluded.updated_at`,
      )
      .run(
        entry.id,
        JSON.stringify(entry.phrasings),
        entry.answer,
        entry.enabled ? 1 : 0,
        entry.source,
        new Date(entry.updatedAt).toISOString(),
      );
    return { ok: true, entry };
  }

  removeBankEntry(id: string): void {
    this.db.prepare('DELETE FROM answer_bank WHERE id = ?').run(id);
  }

  /** The answer bank, oldest first. A row that no longer reads is left out. */
  bank(): BankEntry[] {
    const rows = this.db
      .prepare('SELECT id, phrasings, answer, enabled, source, updated_at FROM answer_bank ORDER BY rowid')
      .all() as {
      id: string;
      phrasings: string;
      answer: string;
      enabled: number;
      source: string;
      updated_at: string;
    }[];
    const entries: BankEntry[] = [];
    for (const row of rows) {
      let phrasings: unknown;
      try {
        phrasings = JSON.parse(row.phrasings);
      } catch {
        continue;
      }
      if (!Array.isArray(phrasings) || phrasings.length === 0 || !phrasings.every((p) => typeof p === 'string'))
        continue;
      entries.push({
        id: row.id,
        phrasings: phrasings as string[],
        answer: row.answer,
        enabled: row.enabled === 1,
        source: row.source === 'draft' ? 'draft' : 'manual',
        updatedAt: Date.parse(row.updated_at),
      });
    }
    return entries;
  }

  /** The settings kept, field by field. One that no longer reads (from an older app, say) is left out: its default stands. */
  settings(): Partial<Settings> {
    const kept: Record<string, unknown> = {};
    for (const [field, schema] of Object.entries(settingsSchema.shape)) {
      const value = this.setting(`settings.${field}`);
      if (value !== undefined && schema.safeParse(value).success) kept[field] = value;
    }
    return kept as Partial<Settings>;
  }

  /** The first run, as kept: which notice version was acknowledged, whether setup was finished and hiding tested. */
  firstRun(currentNotice: number): FirstRunView {
    const acknowledged = this.setting('firstRun.notice');
    return {
      acknowledged:
        typeof acknowledged === 'object' &&
        acknowledged !== null &&
        (acknowledged as { version?: unknown }).version === currentNotice,
      finished: typeof this.setting('firstRun.finishedAt') === 'number',
      hidingTested: typeof this.setting('firstRun.hidingTestedAt') === 'number',
    };
  }

  /** The notice in this version was read and acknowledged, now: asked again only when its words change. */
  acknowledgeNotice(version: number): void {
    this.setSetting('firstRun.notice', { version, at: this.now() });
  }

  finishSetup(): void {
    this.setSetting('firstRun.finishedAt', this.now());
  }

  hidingTested(): void {
    this.setSetting('firstRun.hidingTestedAt', this.now());
  }

  /** When the sound check last heard this computer's sound (the first run, step 4), or null. */
  soundCheckAt(): number | null {
    const at = this.setting('firstRun.soundCheckAt');
    return typeof at === 'number' ? at : null;
  }

  soundCheckPassed(at = this.now()): void {
    this.setSetting('firstRun.soundCheckAt', at);
  }

  saveSettings(settings: Settings): void {
    this.db.transaction(() => {
      for (const [field, value] of Object.entries(settings)) this.setSetting(`settings.${field}`, value);
    })();
  }

  /** A setting's value, or undefined when there is none, or none that reads. */
  protected setting(key: string): unknown {
    const row = this.db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
    if (!row) return undefined;
    try {
      return JSON.parse(row.value) as unknown;
    } catch {
      return undefined;
    }
  }

  protected setSetting(key: string, value: unknown): void {
    this.db
      .prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value')
      .run(key, JSON.stringify(value));
  }

  protected deleteSetting(key: string): void {
    this.db.prepare('DELETE FROM settings WHERE key = ?').run(key);
  }

  private document(kind: 'resume' | 'jd'): SavedText | undefined {
    const row = this.db.prepare('SELECT text, updated_at FROM documents WHERE kind = ?').get(kind) as
      { text: string; updated_at: string } | undefined;
    return row ? { text: row.text, savedAt: Date.parse(row.updated_at) } : undefined;
  }
}

const day = (ms: number) => new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

/** The job description's first line, as Home names it: "Senior Backend Engineer, Payments". */
function titleOf(text: string): string {
  const line =
    text
      .split(/\r?\n/)
      .find((l) => l.trim() !== '')
      ?.trim() ?? '';
  return line.length > 60 ? `${line.slice(0, 59).trimEnd()}…` : line;
}

/** What Home's readiness card says of this computer's documents and its sound check. */
export function readinessFrom(
  documents: DocumentsView,
  soundCheckAt: number | null,
): { resume: string | null; jobDescription: string | null; soundCheck: string | null } {
  const resumeAt = documents.savedAt.resume;
  return {
    resume: documents.resume.trim() && resumeAt !== null ? `updated ${day(resumeAt)}` : null,
    jobDescription: documents.jobDescription.trim() ? titleOf(documents.jobDescription) : null,
    soundCheck: soundCheckAt !== null ? `passed ${day(soundCheckAt)}` : null,
  };
}
