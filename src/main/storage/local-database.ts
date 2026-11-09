// This computer's own data (backend docs/07 §5): one SQLite file in userData, encrypted by SQLite3 Multiple Ciphers in
// SQLCipher's format. Its key is made here, once, and kept with the sign-in's secrets (SecretStore, safeStorage). Where
// the OS can't encrypt, the database lives in memory: nothing is written, and it lasts until the app quits, as the
// sign-in then does (CLAUDE.md rule 12).
//
// The schema grows by numbered migrations (schema.ts), run in order and once each, at open; `user_version` says how
// far a file has come. A file from a newer app is refused rather than guessed at.
import { randomBytes } from 'node:crypto';
import { existsSync, renameSync } from 'node:fs';
import Database from 'better-sqlite3-multiple-ciphers';
import type { SecretStore } from '../auth/secret-store';

export type LocalDatabase = Database.Database;

export interface Migration {
  /** 1, 2, 3…: a migration's number is its place, and never changes once released. */
  version: number;
  /** What it changes, in words, for the log of a failure. */
  name: string;
  up: (db: LocalDatabase) => void;
}

export class NewerDatabaseError extends Error {
  constructor(
    readonly found: number,
    readonly known: number,
  ) {
    super(`The local database is at version ${found}; this app knows up to ${known}.`);
  }
}

/** Opens (or makes) the encrypted file at `file`, brought up to date; in memory when `file` is null. */
export function openDatabase(file: string | null, key: string | null, migrations: readonly Migration[]): LocalDatabase {
  const db = new Database(file ?? ':memory:');
  try {
    if (file !== null) {
      if (!key) throw new Error('An encrypted database needs its key.');
      // SQLCipher 4's format, so the file can be opened with standard tools for support, with the key.
      db.pragma("cipher='sqlcipher'");
      db.pragma('legacy=4');
      db.pragma(`key="x'${key}'"`);
    }
    // Reading the version is the first read: a wrong key fails here (SQLITE_NOTADB), not later.
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    migrate(db, migrations);
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}

/** Runs the migrations a database hasn't had yet, each in its own transaction with the version it brings. */
export function migrate(db: LocalDatabase, migrations: readonly Migration[]): void {
  const known = migrations.length;
  migrations.forEach((m, i) => {
    if (m.version !== i + 1) throw new Error(`Migration ${m.name} is numbered ${m.version}, not ${i + 1}.`);
  });
  const current = db.pragma('user_version', { simple: true }) as number;
  if (current > known) throw new NewerDatabaseError(current, known);
  for (const m of migrations.slice(current)) {
    db.transaction(() => {
      m.up(db);
      db.pragma(`user_version = ${m.version}`);
    })();
  }
}

/** A file no key here opens: its key is gone (the secrets were deleted), or it isn't a database at all. */
export const isUnreadable = (error: unknown) => (error as { code?: unknown } | null)?.code === 'SQLITE_NOTADB';

/**
 * Moves an unreadable file aside, with its WAL and shared-memory files, so a fresh one can take its place. Nothing is
 * deleted: `sotto.db.unreadable-<time>` stays beside it. Returns the new name.
 */
export function setAside(file: string, now = Date.now()): string {
  const aside = `${file}.unreadable-${now}`;
  for (const suffix of ['', '-wal', '-shm']) {
    if (existsSync(file + suffix)) renameSync(file + suffix, aside + suffix);
  }
  return aside;
}

/** The database's key: made once, 32 random bytes as hex, kept among the secrets. */
export async function databaseKey(secrets: SecretStore): Promise<string> {
  const kept = await secrets.get('database-key');
  if (kept && /^[0-9a-f]{64}$/.test(kept)) return kept;
  const made = randomBytes(32).toString('hex');
  await secrets.set('database-key', made);
  return made;
}
