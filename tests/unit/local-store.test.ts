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
    local.saveSettings({
      ...defaultSettings,
      theme: 'light',
      overlayOpacity: 55,
      appOpacity: 100,
      keepTranscripts: true,
    });

    expect(local.settings()).toEqual({
      ...defaultSettings,
      theme: 'light',
      overlayOpacity: 55,
      appOpacity: 100,
      keepTranscripts: true,
    });
  });

  it('leave out a value that no longer reads, so its default stands', () => {
    const { db, local } = store();
    local.saveSettings(defaultSettings);
    db.prepare("UPDATE settings SET value = '\"purple\"' WHERE key = 'settings.theme'").run();
    db.prepare("UPDATE settings SET value = '42' WHERE key = 'settings.overlayOpacity'").run();
    // The three-step fade before the glass (2026-11-12): an old row is left alone, and the new default stands.
    db.prepare("INSERT INTO settings (key, value) VALUES ('settings.opacity', '90')").run();
    db.prepare("INSERT INTO settings (key, value) VALUES ('settings.trayOnly', 'true')").run();

    const kept = local.settings();

    expect(kept).not.toHaveProperty('theme');
    expect(kept).not.toHaveProperty('overlayOpacity');
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

describe('the prep doc, as kept on this computer (3.10)', () => {
  it('keeps it whole in documents, under its kind, with its name and length, and whether it was cut in settings', () => {
    const { db, local } = store();

    const view = local.setPrepDoc({ text: 'Caching\nLoad balancing', name: 'system-design.pdf', cut: true });

    expect(view.prepDoc).toEqual({
      name: 'system-design.pdf',
      text: 'Caching\nLoad balancing',
      cut: true,
      savedAt: nov9,
    });
    expect(db.prepare("SELECT kind, name, chars FROM documents WHERE kind = 'prep'").get()).toEqual({
      kind: 'prep',
      name: 'system-design.pdf',
      chars: 22,
    });
    expect(db.prepare("SELECT value FROM settings WHERE key = 'documents.prepCut'").get()).toEqual({ value: 'true' });
  });

  it('keeps one with no name as nameless, and one not cut without the flag', () => {
    const { db, local } = store();
    local.setPrepDoc({ text: 'Long notes.', name: 'first.pdf', cut: true });

    local.setPrepDoc({ text: 'Typed.', name: '', cut: false });

    expect(local.prepDoc()).toEqual({ name: '', text: 'Typed.', cut: false, savedAt: nov9 });
    expect(db.prepare("SELECT name FROM documents WHERE kind = 'prep'").get()).toEqual({ name: null });
    expect(db.prepare("SELECT count(*) AS n FROM settings WHERE key = 'documents.prepCut'").get()).toEqual({ n: 0 });
  });

  it('removes it, and its flag, when emptied; the other documents stay', () => {
    const { local } = store();
    local.setDocument('resume', 'R');
    local.setPrepDoc({ text: 'Notes.', name: 'prep.docx', cut: true });

    const view = local.setPrepDoc({ text: '', name: '', cut: false });

    expect(view.prepDoc).toBeNull();
    expect(view.resume).toBe('R');
    expect(local.setPrepDoc({ text: 'Back.', name: '', cut: false }).prepDoc?.cut).toBe(false);
  });

  it('is none until one is kept, and leaves the four documents as they were', () => {
    const { local } = store();
    expect(local.documents().prepDoc).toBeNull();
    local.setPrepDoc({ text: 'Notes.', name: 'prep.docx', cut: false });
    expect(local.documents()).toMatchObject({ resume: '', jobDescription: '', name: '', notes: '' });
  });
});

describe('the first run, as kept on this computer (1.14)', () => {
  it('starts with nothing acknowledged, finished or tested', () => {
    expect(store().local.firstRun(1)).toEqual({ acknowledged: false, finished: false, hidingTested: false });
  });

  it('keeps the notice acknowledged in its version, and asks again for a new one', () => {
    const { local } = store();
    local.acknowledgeNotice(1);

    expect(local.firstRun(1).acknowledged).toBe(true);
    expect(local.firstRun(2).acknowledged).toBe(false);
  });

  it('keeps that setup was finished and hiding tested', () => {
    const { local } = store();
    local.finishSetup();
    local.hidingTested();

    expect(local.firstRun(1)).toEqual({ acknowledged: false, finished: true, hidingTested: true });
  });

  it('reads an acknowledgment that no longer makes sense as none', () => {
    const { db, local } = store();
    db.prepare("INSERT INTO settings (key, value) VALUES ('firstRun.notice', '\"yes\"')").run();
    expect(local.firstRun(1).acknowledged).toBe(false);
  });
});
