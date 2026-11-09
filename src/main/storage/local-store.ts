// What the app keeps on this computer, over the encrypted database (local-database.ts, schema.ts). Where each thing
// lives follows backend docs/07 §5: the résumé and the job description are `documents`; the candidate's name, the
// notes and the settings are `settings` rows, each a key and a JSON value.
import { emptyDocuments, type DocumentField, type DocumentsView } from '../../shared/documents';
import type { FirstRunView } from '../../shared/first-run';
import { settingsSchema, type Settings } from '../../shared/settings';
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
  constructor(
    private readonly db: LocalDatabase,
    private readonly now: () => number = Date.now,
  ) {}

  documents(): DocumentsView {
    const view: DocumentsView = { ...emptyDocuments, savedAt: { ...emptyDocuments.savedAt } };
    for (const [field, place] of Object.entries(placeOf) as [DocumentField, Place][]) {
      const saved = place.table === 'documents' ? this.document(place.kind) : this.setting(place.key);
      if (isSavedText(saved)) {
        view[field] = saved.text;
        view.savedAt[field] = saved.savedAt;
      }
    }
    return view;
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
