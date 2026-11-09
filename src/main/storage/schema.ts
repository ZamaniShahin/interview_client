// The local database's schema, migration by migration (local-database.ts runs them). The tables are backend
// docs/07 §5's, each added with the checkpoint that first uses it: history and the answer bank come later.
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
];
