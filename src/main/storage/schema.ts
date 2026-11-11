// The local database's schema, migration by migration (local-database.ts runs them). The tables are backend
// docs/07 §5's, each added with the checkpoint that first uses it: the answer bank with 3.8, history later.
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
];
