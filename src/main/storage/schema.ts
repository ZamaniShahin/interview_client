// The local database's schema, migration by migration (local-database.ts runs them). The tables are backend
// docs/07 §5's, each added with the checkpoint that first uses it: the answer bank with 3.8, history with 3.9.
// A released migration never changes; a change is a new one.
import type { Migration } from './local-database';

export const migrations: readonly Migration[] = [
  {
    version: 1,
    name: 'documents and settings (1.14)',
    up: (db) =>
      db.exec(`
        CREATE TABLE documents (
          kind TEXT PRIMARY KEY CHECK (kind IN ('resume', 'jd', 'prep')),
          name TEXT,
          text TEXT NOT NULL,
          chars INTEGER NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE TABLE settings (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );
      `),
  },
  {
    version: 2,
    name: 'the answer bank (3.8)',
    // Kept in the order added (the rowid): the order the server fits them into its prompt.
    up: (db) =>
      db.exec(`
        CREATE TABLE answer_bank (
          id TEXT PRIMARY KEY,
          phrasings TEXT NOT NULL,
          answer TEXT NOT NULL,
          enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)),
          source TEXT NOT NULL CHECK (source IN ('manual', 'draft')),
          updated_at TEXT NOT NULL
        );
      `),
  },
  {
    version: 3,
    name: 'history (3.9)',
    // docs/07 §5's tables, with when an interview ended and why (v1 had neither). Deleting an interview deletes what
    // it holds: foreign keys are on (local-database.ts).
    up: (db) =>
      db.exec(`
        CREATE TABLE interviews (
          id INTEGER PRIMARY KEY,
          started_at TEXT NOT NULL,
          ended_at TEXT,
          candidate TEXT,
          role TEXT,
          company TEXT,
          tier TEXT,
          session_id TEXT,
          end_reason TEXT
        );
        CREATE TABLE qa (
          id INTEGER PRIMARY KEY,
          interview_id INTEGER NOT NULL REFERENCES interviews (id) ON DELETE CASCADE,
          asked_at TEXT NOT NULL,
          kind INTEGER NOT NULL,
          question TEXT NOT NULL,
          answer TEXT NOT NULL
        );
        CREATE INDEX qa_interview ON qa (interview_id);
        CREATE TABLE transcript (
          id INTEGER PRIMARY KEY,
          interview_id INTEGER NOT NULL REFERENCES interviews (id) ON DELETE CASCADE,
          at TEXT NOT NULL,
          speaker TEXT NOT NULL CHECK (speaker IN ('interviewer', 'candidate')),
          text TEXT NOT NULL
        );
        CREATE INDEX transcript_interview ON transcript (interview_id);
        CREATE TABLE debriefs (
          interview_id INTEGER PRIMARY KEY REFERENCES interviews (id) ON DELETE CASCADE,
          created_at TEXT NOT NULL,
          content TEXT NOT NULL
        );
      `),
  },
];
