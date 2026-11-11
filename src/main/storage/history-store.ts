// History (3.9) over the encrypted database: backend docs/07 §5's `interviews`, `qa`, `transcript` and `debriefs`, a
// port of v1's db.py. Times are kept as ISO text, as every table here keeps them, and read back as epoch ms.
import {
  debriefSchema,
  type DebriefResult,
  type DebriefView,
  type HistoryAnswer,
  type InterviewSummary,
  type InterviewView,
  type TranscriptLine,
} from '../../shared/history';
import type { LocalDatabase } from './local-database';

export interface InterviewStart {
  startedAt: number;
  candidate: string;
  role: string;
  tier: string | null;
}

interface SummaryRow {
  id: number;
  started_at: string;
  ended_at: string | null;
  candidate: string | null;
  role: string | null;
  end_reason: string | null;
  answers: number;
  lines: number;
  has_debrief: number;
}

const iso = (ms: number) => new Date(ms).toISOString();
const ms = (text: string) => Date.parse(text);

function summaryOf(row: SummaryRow): InterviewSummary {
  return {
    id: row.id,
    startedAt: ms(row.started_at),
    endedAt: row.ended_at === null ? null : ms(row.ended_at),
    candidate: row.candidate ?? '',
    role: row.role ?? '',
    endReason: row.end_reason,
    answers: row.answers,
    lines: row.lines,
    hasDebrief: row.has_debrief === 1,
  };
}

const summaryQuery = `
  SELECT i.id, i.started_at, i.ended_at, i.candidate, i.role, i.end_reason,
         (SELECT COUNT(*) FROM qa q WHERE q.interview_id = i.id) AS answers,
         (SELECT COUNT(*) FROM transcript t WHERE t.interview_id = i.id) AS lines,
         EXISTS (SELECT 1 FROM debriefs d WHERE d.interview_id = i.id) AS has_debrief
  FROM interviews i`;

export class HistoryStore {
  constructor(private readonly db: LocalDatabase) {}

  /** A new interview, as its session starts; its id. */
  start(start: InterviewStart): number {
    const result = this.db
      .prepare('INSERT INTO interviews (started_at, candidate, role, tier) VALUES (?, ?, ?, ?)')
      .run(iso(start.startedAt), start.candidate || null, start.role || null, start.tier);
    return Number(result.lastInsertRowid);
  }

  end(id: number, endedAt: number, reason: string | null): void {
    this.db
      .prepare('UPDATE interviews SET ended_at = ?, end_reason = ? WHERE id = ? AND ended_at IS NULL')
      .run(iso(endedAt), reason, id);
  }

  addAnswer(id: number, answer: Omit<HistoryAnswer, 'id'>): void {
    this.db
      .prepare('INSERT INTO qa (interview_id, asked_at, kind, question, answer) VALUES (?, ?, ?, ?, ?)')
      .run(id, iso(answer.askedAt), answer.kind, answer.question, answer.answer);
  }

  addLine(id: number, line: TranscriptLine): void {
    this.db
      .prepare('INSERT INTO transcript (interview_id, at, speaker, text) VALUES (?, ?, ?, ?)')
      .run(id, iso(line.at), line.speaker, line.text);
  }

  /** Every interview, the newest first. */
  list(): InterviewSummary[] {
    return (this.db.prepare(`${summaryQuery} ORDER BY i.started_at DESC, i.id DESC`).all() as SummaryRow[]).map(
      summaryOf,
    );
  }

  /** One interview, whole; null for one there is not. */
  get(id: number): InterviewView | null {
    const row = this.db.prepare(`${summaryQuery} WHERE i.id = ?`).get(id) as SummaryRow | undefined;
    if (!row) return null;
    const qa = (
      this.db
        .prepare('SELECT id, asked_at, kind, question, answer FROM qa WHERE interview_id = ? ORDER BY id')
        .all(id) as { id: number; asked_at: string; kind: number; question: string; answer: string }[]
    ).map((r) => ({ id: r.id, askedAt: ms(r.asked_at), kind: r.kind, question: r.question, answer: r.answer }));
    const transcript = (
      this.db.prepare('SELECT at, speaker, text FROM transcript WHERE interview_id = ? ORDER BY id').all(id) as {
        at: string;
        speaker: TranscriptLine['speaker'];
        text: string;
      }[]
    ).map((r) => ({ at: ms(r.at), speaker: r.speaker, text: r.text }));
    return { ...summaryOf(row), qa, transcript, debrief: this.debrief(id) };
  }

  /** Its debrief, or null; one that no longer reads (from an older app, say) is none. */
  debrief(id: number): DebriefView | null {
    const row = this.db.prepare('SELECT created_at, content FROM debriefs WHERE interview_id = ?').get(id) as
      { created_at: string; content: string } | undefined;
    if (!row) return null;
    try {
      const parsed = debriefSchema.safeParse(JSON.parse(row.content));
      return parsed.success ? { ...parsed.data, createdAt: ms(row.created_at) } : null;
    } catch {
      return null;
    }
  }

  /** Keeps (or replaces) an interview's debrief; false when the interview is gone. */
  saveDebrief(id: number, debrief: DebriefResult, createdAt: number): boolean {
    if (!this.db.prepare('SELECT 1 FROM interviews WHERE id = ?').get(id)) return false;
    this.db
      .prepare(
        `INSERT INTO debriefs (interview_id, created_at, content) VALUES (?, ?, ?)
         ON CONFLICT (interview_id) DO UPDATE SET created_at = excluded.created_at, content = excluded.content`,
      )
      .run(id, iso(createdAt), JSON.stringify(debrief));
    return true;
  }

  /** Deletes an interview and all it holds. */
  delete(id: number): void {
    this.db.prepare('DELETE FROM interviews WHERE id = ?').run(id);
  }

  /** Deletes every interview; how many there were. */
  clear(): number {
    return this.db.prepare('DELETE FROM interviews').run().changes;
  }

  /** An interview that kept nothing (no answer, no line, no debrief) isn't history: it goes. */
  dropIfEmpty(id: number): boolean {
    return (
      this.db
        .prepare(
          `DELETE FROM interviews WHERE id = ?
             AND NOT EXISTS (SELECT 1 FROM qa WHERE interview_id = interviews.id)
             AND NOT EXISTS (SELECT 1 FROM transcript WHERE interview_id = interviews.id)
             AND NOT EXISTS (SELECT 1 FROM debriefs WHERE interview_id = interviews.id)`,
        )
        .run(id).changes > 0
    );
  }

  /** Every empty interview, left by an app that quit mid-session; how many went. */
  dropEmpty(): number {
    return this.db
      .prepare(
        `DELETE FROM interviews
           WHERE NOT EXISTS (SELECT 1 FROM qa WHERE interview_id = interviews.id)
             AND NOT EXISTS (SELECT 1 FROM transcript WHERE interview_id = interviews.id)
             AND NOT EXISTS (SELECT 1 FROM debriefs WHERE interview_id = interviews.id)`,
      )
      .run().changes;
  }
}
