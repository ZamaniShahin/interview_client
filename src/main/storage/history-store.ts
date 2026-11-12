// History (3.9) over the encrypted database: backend docs/07 §5's `interviews`, `qa`, `transcript` and `debriefs`, a
// port of v1's db.py, and practice sessions with them (Q24): `practices` and `practice_turns`. Times are kept as ISO
// text, as every table here keeps them, and read back as epoch ms.
import {
  debriefSchema,
  practiceFeedbackSchema,
  practiceFocusSchema,
  practiceSummarySchema,
  type DebriefResult,
  type DebriefView,
  type HistoryAnswer,
  type InterviewSummary,
  type InterviewView,
  type PracticeHistory,
  type TranscriptLine,
} from '../../shared/history';
import type { PracticeFeedbackView, PracticeRecord, PracticeTurnView } from '../../shared/practice';
import type { LocalDatabase } from './local-database';

export interface InterviewStart {
  startedAt: number;
  candidate: string;
  role: string;
  tier: string | null;
}

interface SummaryRow {
  id: number;
  kind: 'interview' | 'practice';
  started_at: string;
  ended_at: string | null;
  candidate: string | null;
  role: string | null;
  end_reason: string | null;
  answers: number;
  lines: number;
  has_debrief: number;
  average: number | null;
}

interface TurnRow {
  n: number;
  main_n: number;
  total: number;
  kind: number;
  source: number;
  difficulty: number;
  question: string;
  answer: string | null;
  score: number | null;
  feedback: string | null;
}

const iso = (ms: number) => new Date(ms).toISOString();
const ms = (text: string) => Date.parse(text);

function summaryOf(row: SummaryRow): InterviewSummary {
  return {
    id: row.id,
    kind: row.kind,
    startedAt: ms(row.started_at),
    endedAt: row.ended_at === null ? null : ms(row.ended_at),
    candidate: row.candidate ?? '',
    role: row.role ?? '',
    endReason: row.end_reason,
    answers: row.answers,
    lines: row.lines,
    hasDebrief: row.has_debrief === 1,
    average: row.average,
  };
}

/** Kept JSON, read back through its schema: what no longer reads (an older app's, a broken row) is none. */
function parsed<T>(
  schema: { safeParse: (value: unknown) => { success: true; data: T } | { success: false } },
  text: string | null,
): T | null {
  if (text === null) return null;
  try {
    const result = schema.safeParse(JSON.parse(text));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

/** A score as the table takes it: 1 to 10, or none. */
const keptScore = (score: number | null | undefined): number | null =>
  typeof score === 'number' && Number.isInteger(score) && score >= 1 && score <= 10 ? score : null;

const summaryQuery = `
  SELECT i.id, i.kind, i.started_at, i.ended_at, i.candidate, i.role, i.end_reason,
         CASE WHEN i.kind = 'practice'
           THEN (SELECT COUNT(*) FROM practice_turns p WHERE p.interview_id = i.id AND p.answer IS NOT NULL)
           ELSE (SELECT COUNT(*) FROM qa q WHERE q.interview_id = i.id)
         END AS answers,
         (SELECT COUNT(*) FROM transcript t WHERE t.interview_id = i.id) AS lines,
         EXISTS (SELECT 1 FROM debriefs d WHERE d.interview_id = i.id) AS has_debrief,
         (SELECT pr.average FROM practices pr WHERE pr.interview_id = i.id) AS average
  FROM interviews i`;

/** What makes an interview or a practice worth keeping: an answer, a line, a debrief, or a practice's question. */
const keepsSomething = `
  (EXISTS (SELECT 1 FROM qa WHERE interview_id = interviews.id)
   OR EXISTS (SELECT 1 FROM transcript WHERE interview_id = interviews.id)
   OR EXISTS (SELECT 1 FROM debriefs WHERE interview_id = interviews.id)
   OR EXISTS (SELECT 1 FROM practice_turns WHERE interview_id = interviews.id))`;

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

  /**
   * A practice, whole, once it is over (Q24): its questions with the answers typed and their feedback, and its summary,
   * in one transaction. Its id.
   */
  savePractice(record: PracticeRecord): number {
    const save = this.db.transaction((r: PracticeRecord): number => {
      const id = Number(
        this.db
          .prepare(
            `INSERT INTO interviews (kind, started_at, ended_at, candidate, role, tier, end_reason)
             VALUES ('practice', ?, ?, ?, ?, ?, ?)`,
          )
          .run(iso(r.startedAt), iso(r.endedAt), r.candidate || null, r.role || null, r.tier, r.endReason)
          .lastInsertRowid,
      );
      this.db
        .prepare('INSERT INTO practices (interview_id, focus, average, summary) VALUES (?, ?, ?, ?)')
        .run(id, r.focus, r.summary?.average ?? null, r.summary ? JSON.stringify(r.summary) : null);
      const turn = this.db.prepare(
        `INSERT INTO practice_turns
           (interview_id, n, main_n, total, kind, source, difficulty, question, answer, score, feedback)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      for (const t of r.turns) {
        turn.run(
          id,
          t.n,
          t.mainN,
          t.total,
          t.kind,
          t.source,
          t.difficulty,
          t.question,
          t.answer,
          keptScore(t.feedback?.score),
          // A score outside 1 to 10 is no score; the rest of the feedback is kept as it was given.
          t.feedback ? JSON.stringify({ ...t.feedback, score: keptScore(t.feedback.score) }) : null,
        );
      }
      return id;
    });
    return save(record);
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
    return {
      ...summaryOf(row),
      qa,
      transcript,
      debrief: this.debrief(id),
      practice: row.kind === 'practice' ? this.practice(id) : null,
    };
  }

  /** A practice's focus, questions and summary; its questions as kept, the feedback only where it still reads. */
  private practice(id: number): PracticeHistory | null {
    const row = this.db.prepare('SELECT focus, summary FROM practices WHERE interview_id = ?').get(id) as
      { focus: number; summary: string | null } | undefined;
    const focus = practiceFocusSchema.safeParse(row?.focus);
    if (!row || !focus.success) return null;
    const turns = (
      this.db
        .prepare(
          `SELECT n, main_n, total, kind, source, difficulty, question, answer, score, feedback
           FROM practice_turns WHERE interview_id = ? ORDER BY n, id`,
        )
        .all(id) as TurnRow[]
    ).map((r): PracticeTurnView => ({
      n: r.n,
      mainN: r.main_n,
      total: r.total,
      kind: r.kind as PracticeTurnView['kind'],
      source: r.source as PracticeTurnView['source'],
      difficulty: r.difficulty as PracticeTurnView['difficulty'],
      question: r.question,
      answer: r.answer,
      feedback: parsed<PracticeFeedbackView>(practiceFeedbackSchema, r.feedback),
    }));
    return { focus: focus.data, turns, summary: parsed(practiceSummarySchema, row.summary) };
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

  /** An interview that kept nothing (no answer, no line, no debrief, no practice question) isn't history: it goes. */
  dropIfEmpty(id: number): boolean {
    return this.db.prepare(`DELETE FROM interviews WHERE id = ? AND NOT ${keepsSomething}`).run(id).changes > 0;
  }

  /** Every empty interview, left by an app that quit mid-session; how many went. */
  dropEmpty(): number {
    return this.db.prepare(`DELETE FROM interviews WHERE NOT ${keepsSomething}`).run().changes;
  }
}
