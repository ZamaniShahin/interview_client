import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MemorySecretStore } from '../../src/main/auth/secret-store';
import {
  databaseKey,
  NewerDatabaseError,
  openDatabase,
  type LocalDatabase,
  type Migration,
} from '../../src/main/storage/local-database';

const key = 'a1b2c3d4'.repeat(8);
const otherKey = 'ffeeddcc'.repeat(8);

const notes: Migration[] = [
  { version: 1, name: 'notes', up: (db) => db.exec('CREATE TABLE notes (text TEXT NOT NULL)') },
  { version: 2, name: 'note times', up: (db) => db.exec('ALTER TABLE notes ADD COLUMN at INTEGER') },
];

describe("this computer's database (1.14)", () => {
  let dir: string;
  let file: string;
  const open: LocalDatabase[] = [];
  const openIt = (k: string | null, migrations = notes, at: string | null = file) => {
    const db = openDatabase(at, k, migrations);
    open.push(db);
    return db;
  };

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'sotto-db-'));
    file = join(dir, 'sotto.db');
  });

  afterEach(() => {
    for (const db of open.splice(0)) if (db.open) db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('reads back what it wrote, with its key, and writes nothing readable to the disk', () => {
    const db = openIt(key);
    db.prepare('INSERT INTO notes (text) VALUES (?)').run('the résumé text');
    db.close();

    expect(openIt(key).prepare('SELECT text FROM notes').get()).toEqual({ text: 'the résumé text' });
    const onDisk = readFileSync(file);
    expect(onDisk.includes(Buffer.from('the résumé text'))).toBe(false);
    expect(onDisk.subarray(0, 15).toString()).not.toBe('SQLite format 3');
  });

  it('is refused without its key, or with another', () => {
    openIt(key).close();

    expect(() => openIt(otherKey)).toThrow(expect.objectContaining({ code: 'SQLITE_NOTADB' }));
    expect(() => openIt(null)).toThrow('An encrypted database needs its key.');
  });

  it('runs each migration once, in order, and remembers how far it came', () => {
    let runs = 0;
    const counted = notes.map((m) => ({ ...m, up: (db: LocalDatabase) => (runs++, m.up(db)) }));

    openIt(key, counted).close();
    const again = openIt(key, counted);

    expect(runs).toBe(2);
    expect(again.pragma('user_version', { simple: true })).toBe(2);
    expect(again.prepare("SELECT name FROM pragma_table_info('notes')").all()).toEqual([
      { name: 'text' },
      { name: 'at' },
    ]);
  });

  it('brings an older file up to date with the migrations it lacks', () => {
    openIt(key, notes.slice(0, 1)).close();

    const db = openIt(key);

    expect(db.pragma('user_version', { simple: true })).toBe(2);
  });

  it('refuses a file from a newer app rather than guess at it', () => {
    openIt(key).close();

    expect(() => openIt(key, notes.slice(0, 1))).toThrow(NewerDatabaseError);
  });

  it('leaves a file as it was when a migration fails', () => {
    openIt(key, notes.slice(0, 1)).close();
    const failing: Migration[] = [
      notes[0]!,
      {
        version: 2,
        name: 'half done',
        up: (db) => {
          db.exec('ALTER TABLE notes ADD COLUMN at INTEGER');
          throw new Error('Something went wrong halfway.');
        },
      },
    ];

    expect(() => openIt(key, failing)).toThrow('Something went wrong halfway.');
    const db = openIt(key, notes.slice(0, 1));
    expect(db.pragma('user_version', { simple: true })).toBe(1);
    expect(db.prepare("SELECT name FROM pragma_table_info('notes')").all()).toEqual([{ name: 'text' }]);
  });

  it('refuses migrations out of order', () => {
    expect(() => openIt(key, [notes[1]!])).toThrow('numbered 2, not 1');
  });

  it('lives in memory, writing nothing, where the computer cannot encrypt', () => {
    const db = openIt(null, notes, null);
    db.prepare('INSERT INTO notes (text) VALUES (?)').run('kept until the app quits');

    expect(db.prepare('SELECT count(*) AS n FROM notes').get()).toEqual({ n: 1 });
    expect(existsSync(file)).toBe(false);
  });
});

describe("the database's key", () => {
  it('is made once, 32 random bytes, and kept among the secrets', async () => {
    const secrets = new MemorySecretStore();

    const first = await databaseKey(secrets);
    const second = await databaseKey(secrets);

    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(second).toBe(first);
    expect(await secrets.get('database-key')).toBe(first);
  });

  it('is made again if what was kept is not a key', async () => {
    const secrets = new MemorySecretStore();
    await secrets.set('database-key', 'not a key');

    expect(await databaseKey(secrets)).toMatch(/^[0-9a-f]{64}$/);
  });
});
