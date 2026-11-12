// Practice in history (Q24: one history keeps interviews and practice sessions, with their scores): a practice kept
// whole once it is over, listed with its average, read back with each answer's feedback, kept through the clean-up of
// empty rows, debriefed as an interview is, and the database migrated to hold it without touching what it held.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  PracticeDifficulty,
  PracticeFocus,
  PracticeQuestionSource,
  PracticeTurnKind,
  SessionEndReasons,
} from '../../src/shared/contracts/sotto-contracts';
import { debriefRequestOf } from '../../src/shared/history';
import type { PracticeRecord, PracticeSummaryView, PracticeTurnView } from '../../src/shared/practice';
import { openDatabase } from '../../src/main/storage/local-database';
import { HistoryStore } from '../../src/main/storage/history-store';
import { LocalStore } from '../../src/main/storage/local-store';
import { migrations } from '../../src/main/storage/schema';

const nov12 = Date.UTC(2026, 10, 12, 9);

const turn = (n: number, over: Partial<PracticeTurnView> = {}): PracticeTurnView => ({
  n,
  mainN: n,
  total: 2,
  kind: PracticeTurnKind.Main,
  question: `Question ${n}?`,
  source: PracticeQuestionSource.Model,
  difficulty: PracticeDifficulty.Medium,
  answer: `Answer ${n}.`,
  feedback: {
    score: 5 + n,
    good: ['Clear.'],
    improve: [`Improve ${n}.`],
    modelAnswer: `A stronger answer ${n}.`,
    prepared: '',
    raw: false,
  },
  ...over,
});

const summary = (over: Partial<PracticeSummaryView> = {}): PracticeSummaryView => ({
  asked: 2,
  answered: 2,
  average: 6.5,
  turns: [
    {
      n: 1,
      kind: PracticeTurnKind.Main,
      question: 'Question 1?',
      source: PracticeQuestionSource.Model,
      score: 6,
      answered: true,
    },
    {
      n: 2,
      kind: PracticeTurnKind.Main,
      question: 'Question 2?',
      source: PracticeQuestionSource.Model,
      score: 7,
      answered: true,
    },
  ],
  best: 2,
  worst: 1,
  talkSeconds: 0,
  wpm: null,
  fillers: 0,
  fillersPer100Words: null,
  focus: PracticeFocus.Behavioral,
  difficulty: PracticeDifficulty.Hard,
  tips: ['Improve 1.'],
  ...over,
});

const record = (over: Partial<PracticeRecord> = {}): PracticeRecord => ({
  startedAt: nov12,
  endedAt: nov12 + 9 * 60_000,
  endReason: SessionEndReasons.User,
  candidate: 'Sam Rivera',
  role: 'Senior Backend Engineer',
  tier: 'smart',
  focus: PracticeFocus.Behavioral,
  turns: [turn(1), turn(2)],
  summary: summary(),
  ...over,
});

const fresh = () => new HistoryStore(openDatabase(null, null, migrations));

describe('a practice kept in history', () => {
  it('is listed as a practice, with its answers and its average', () => {
    const history = fresh();
    const id = history.savePractice(record());
    expect(history.list()).toEqual([
      {
        id,
        kind: 'practice',
        startedAt: nov12,
        endedAt: nov12 + 9 * 60_000,
        candidate: 'Sam Rivera',
        role: 'Senior Backend Engineer',
        endReason: SessionEndReasons.User,
        answers: 2,
        lines: 0,
        hasDebrief: false,
        average: 6.5,
      },
    ]);
  });

  it('reads back whole: its focus, each question with the answer typed and its feedback, and its summary', () => {
    const history = fresh();
    const id = history.savePractice(record());
    const view = history.get(id)!;
    expect(view.practice).toEqual({ focus: PracticeFocus.Behavioral, turns: [turn(1), turn(2)], summary: summary() });
    expect(view.qa).toEqual([]);
    expect(view.transcript).toEqual([]);
  });

  it('keeps a question not answered, and counts only the answered', () => {
    const history = fresh();
    const id = history.savePractice(
      record({ turns: [turn(1), turn(2, { answer: null, feedback: null })], summary: summary({ answered: 1 }) }),
    );
    expect(history.list()[0]).toMatchObject({ answers: 1 });
    expect(history.get(id)!.practice!.turns[1]).toMatchObject({ answer: null, feedback: null });
  });

  it('keeps one that ended before its summary, with no average', () => {
    const history = fresh();
    const id = history.savePractice(record({ summary: null, endReason: SessionEndReasons.CreditExhausted }));
    expect(history.list()[0]).toMatchObject({ average: null, endReason: SessionEndReasons.CreditExhausted });
    expect(history.get(id)!.practice).toMatchObject({ summary: null, focus: PracticeFocus.Behavioral });
  });

  it('keeps follow-ups, chosen questions and every difficulty as they were', () => {
    const history = fresh();
    const turns = [
      turn(1, { source: PracticeQuestionSource.Chosen, difficulty: PracticeDifficulty.Easy }),
      turn(2, {
        kind: PracticeTurnKind.FollowUp,
        mainN: 1,
        source: PracticeQuestionSource.Bank,
        difficulty: PracticeDifficulty.Hard,
      }),
    ];
    const id = history.savePractice(record({ turns }));
    expect(history.get(id)!.practice!.turns).toEqual(turns);
  });

  it('keeps no score outside 1 to 10, and still keeps the rest of the feedback', () => {
    const history = fresh();
    const id = history.savePractice(
      record({ turns: [turn(1, { feedback: { ...turn(1).feedback!, score: 11 } }), turn(2)] }),
    );
    expect(history.get(id)!.practice!.turns[0]!.feedback).toEqual({ ...turn(1).feedback, score: null });
    expect(history.get(id)!.practice!.turns[1]!.feedback?.score).toBe(7);
  });

  it('is listed among interviews by when it started, the newest first', () => {
    const history = fresh();
    const interview = history.start({ startedAt: nov12 - 3_600_000, candidate: '', role: 'Old interview', tier: null });
    history.addAnswer(interview, { askedAt: nov12, kind: 0, question: 'Why?', answer: 'Because.' });
    const practice = history.savePractice(record());
    expect(history.list().map((i) => [i.id, i.kind])).toEqual([
      [practice, 'practice'],
      [interview, 'interview'],
    ]);
    expect(history.get(interview)).toMatchObject({ kind: 'interview', practice: null, average: null });
  });

  it('survives the clean-up of empty rows at start, and goes with what it holds when deleted', () => {
    const history = fresh();
    const id = history.savePractice(record());
    expect(history.dropEmpty()).toBe(0);
    expect(history.dropIfEmpty(id)).toBe(false);
    expect(history.list()).toHaveLength(1);
    history.delete(id);
    expect(history.get(id)).toBeNull();
    expect(history.list()).toEqual([]);
  });

  it('is cleared with the rest of history', () => {
    const history = fresh();
    history.savePractice(record());
    history.savePractice(record());
    expect(history.clear()).toBe(2);
  });

  it('keeps its debrief as an interview does', () => {
    const history = fresh();
    const id = history.savePractice(record());
    const debrief = {
      version: 1,
      raw: false,
      summary: 'Steady.',
      scores: null,
      strengths: [],
      improvements: [],
      strongerAnswers: [],
      followUps: [],
      thankYouEmail: '',
      metrics: null,
    };
    expect(history.saveDebrief(id, debrief, nov12)).toBe(true);
    expect(history.list()[0]).toMatchObject({ hasDebrief: true });
  });

  it('is debriefed from the answers the user typed, as the same job as an interview’s (Q24)', () => {
    const history = fresh();
    const id = history.savePractice(record({ turns: [turn(1), turn(2, { answer: null, feedback: null })] }));
    expect(debriefRequestOf(history.get(id)!)).toEqual({
      name: 'Sam Rivera',
      role: 'Senior Backend Engineer',
      questions: [{ question: 'Question 1?', answer: 'Answer 1.' }],
      transcript: [],
    });
  });

  it('has nothing to debrief when nothing was answered', () => {
    const history = fresh();
    const id = history.savePractice(record({ turns: [turn(1, { answer: null, feedback: null })] }));
    expect(debriefRequestOf(history.get(id)!)).toBeNull();
  });
});

describe('the database, migrated to keep practices (migration 4)', () => {
  it('keeps every interview it held, as an interview', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sotto-practice-'));
    try {
      const file = join(dir, 'sotto.db');
      const key = 'c0ffee00'.repeat(8);
      const old = openDatabase(file, key, migrations.slice(0, 3));
      const before = new LocalStore(old, () => nov12);
      const id = before.history.start({ startedAt: nov12, candidate: 'Sam', role: 'Payments', tier: 'smart' });
      old
        .prepare('INSERT INTO qa (interview_id, asked_at, kind, question, answer) VALUES (?, ?, 0, ?, ?)')
        .run(id, new Date(nov12).toISOString(), 'Why Kafka?', 'Ordering.');
      old.close();

      const db = openDatabase(file, key, migrations);
      const after = new LocalStore(db, () => nov12);
      expect(db.pragma('user_version', { simple: true })).toBe(4);
      expect(after.history.list()).toEqual([
        expect.objectContaining({ id, kind: 'interview', answers: 1, average: null, role: 'Payments' }),
      ]);
      expect(after.history.get(id)).toMatchObject({ practice: null, qa: [{ question: 'Why Kafka?' }] });
      const practice = after.history.savePractice(record());
      expect(after.history.list().map((i) => i.kind)).toEqual(['practice', 'interview']);
      expect(after.history.get(practice)?.practice?.turns).toHaveLength(2);
      db.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('takes only the two kinds, and a score from 1 to 10 or none', () => {
    const db = openDatabase(null, null, migrations);
    expect(() =>
      db.prepare("INSERT INTO interviews (started_at, kind) VALUES ('2026-11-12', 'meeting')").run(),
    ).toThrow();
    const id = Number(
      db.prepare("INSERT INTO interviews (started_at, kind) VALUES ('2026-11-12', 'practice')").run().lastInsertRowid,
    );
    const insert = db.prepare(
      `INSERT INTO practice_turns (interview_id, n, main_n, total, kind, source, difficulty, question, score)
       VALUES (?, 1, 1, 1, 0, 0, 1, 'Q', ?)`,
    );
    expect(() => insert.run(id, 0)).toThrow();
    expect(() => insert.run(id, 11)).toThrow();
    expect(() => insert.run(id, 10)).not.toThrow();
    expect(() => insert.run(id, null)).not.toThrow();
  });
});
