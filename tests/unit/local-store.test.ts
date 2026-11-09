import { describe, expect, it } from 'vitest';
import { emptyDocuments } from '../../src/shared/documents';
import { defaultSettings } from '../../src/shared/settings';
import { openDatabase } from '../../src/main/storage/local-database';
import { LocalStore, readinessFrom } from '../../src/main/storage/local-store';
import { migrations } from '../../src/main/storage/schema';
import { SettingsStore } from '../../src/main/settings-store';

const nov9 = Date.UTC(2026, 10, 9, 12);

function store(now = nov9) {
  const db = openDatabase(null, null, migrations);
  return { db, local: new LocalStore(db, () => now) };
}

describe("this computer's documents (1.14)", () => {
  it('has none at first', () => {
    expect(store().local.documents()).toEqual(emptyDocuments);
  });

  it('keeps each one whole, with when it was saved', () => {
    const { local } = store();
    local.setDocument('resume', 'Backend engineer, 7 years.\nGo and Kafka.');
    local.setDocument('name', 'Sam Rivera');

    expect(local.documents()).toMatchObject({
      resume: 'Backend engineer, 7 years.\nGo and Kafka.',
      name: 'Sam Rivera',
      jobDescription: '',
      savedAt: { resume: nov9, name: nov9, jobDescription: null, notes: null },
    });
  });

  it('puts them where backend docs/07 §5 says: the résumé and the job description in documents, the rest in settings', () => {
    const { db, local } = store();
    local.setDocument('resume', 'R');
    local.setDocument('jobDescription', 'J');
    local.setDocument('name', 'N');
    local.setDocument('notes', 'Notes');

    expect(db.prepare('SELECT kind, text, chars FROM documents ORDER BY kind').all()).toEqual([
      { kind: 'jd', text: 'J', chars: 1 },
      { kind: 'resume', text: 'R', chars: 1 },
    ]);
    expect(db.prepare('SELECT key FROM settings ORDER BY key').all()).toEqual([
      { key: 'profile.name' },
      { key: 'profile.notes' },
    ]);
  });

  it('replaces a document with its new text, and removes it when the text is empty', () => {
    const { db, local } = store();
    local.setDocument('jobDescription', 'First draft');
    local.setDocument('jobDescription', 'Senior Backend Engineer, Payments');
    expect(local.documents().jobDescription).toBe('Senior Backend Engineer, Payments');

    local.setDocument('jobDescription', '');
    local.setDocument('name', 'Sam');
    local.setDocument('name', '');

    expect(local.documents()).toEqual(emptyDocuments);
    expect(db.prepare('SELECT count(*) AS n FROM documents').get()).toEqual({ n: 0 });
  });

  it('ignores a kept value that no longer reads, rather than fail', () => {
    const { db, local } = store();
    db.prepare("INSERT INTO settings (key, value) VALUES ('profile.name', 'not json')").run();
    db.prepare("INSERT INTO settings (key, value) VALUES ('profile.notes', '{\"text\": 5}')").run();

    expect(local.documents()).toEqual(emptyDocuments);
  });
});

describe('the settings, kept on this computer (1.14)', () => {
  it('come back as they were saved', () => {
    const { local } = store();
    local.saveSettings({ ...defaultSettings, theme: 'light', opacity: 80, keepTranscripts: true });

    expect(local.settings()).toEqual({ ...defaultSettings, theme: 'light', opacity: 80, keepTranscripts: true });
  });

  it('leave out a value that no longer reads, so its default stands', () => {
    const { db, local } = store();
    local.saveSettings(defaultSettings);
    db.prepare("UPDATE settings SET value = '\"purple\"' WHERE key = 'settings.theme'").run();
    db.prepare("UPDATE settings SET value = 'nonsense' WHERE key = 'settings.opacity'").run();
    db.prepare("INSERT INTO settings (key, value) VALUES ('settings.trayOnly', 'true')").run();

    const kept = local.settings();

    expect(kept).not.toHaveProperty('theme');
    expect(kept).not.toHaveProperty('opacity');
    expect(kept).not.toHaveProperty('trayOnly');
    expect(kept).toMatchObject({ textSize: 'M', startCompact: false });
  });

  it('are restored over the defaults, and each change after is kept', () => {
    const { local } = store();
    local.saveSettings({ ...defaultSettings, textSize: 'L' });
    const told: string[] = [];
    const settings = new SettingsStore((s) => told.push(s.theme));

    settings.restore(local.settings(), (s) => local.saveSettings(s));
    settings.update({ theme: 'light' });

    expect(settings.get()).toMatchObject({ textSize: 'L', theme: 'light' });
    expect(local.settings()).toMatchObject({ textSize: 'L', theme: 'light' });
    expect(told).toEqual(['dark', 'light']);
  });

  it('start as the defaults where nothing was kept', () => {
    const settings = new SettingsStore(() => {});
    settings.restore({}, () => {});
    expect(settings.get()).toEqual(defaultSettings);
  });
});

describe("Home's readiness, from this computer (1.14)", () => {
  it('names the résumé by when it was saved, the job by its first line, and the sound check by when it passed', () => {
    const { local } = store();
    local.setDocument('resume', 'Backend engineer.');
    local.setDocument('jobDescription', '\n  Senior Backend Engineer, Payments  \nYou will own the ledger.');
    local.soundCheckPassed();

    expect(readinessFrom(local.documents(), local.soundCheckAt())).toEqual({
      resume: 'updated Nov 9',
      jobDescription: 'Senior Backend Engineer, Payments',
      soundCheck: 'passed Nov 9',
    });
  });

  it('says nothing is there when nothing is', () => {
    expect(readinessFrom(emptyDocuments, null)).toEqual({ resume: null, jobDescription: null, soundCheck: null });
  });

  it('shortens a long first line', () => {
    const { local } = store();
    local.setDocument('jobDescription', 'x'.repeat(80));

    const title = readinessFrom(local.documents(), null).jobDescription!;
    expect(title).toHaveLength(60);
    expect(title.endsWith('…')).toBe(true);
  });

  it('counts a document of spaces as missing', () => {
    expect(
      readinessFrom({ ...emptyDocuments, resume: '   ', savedAt: { ...emptyDocuments.savedAt, resume: nov9 } }, null)
        .resume,
    ).toBeNull();
  });
});
