import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  bankEntryInputSchema,
  bankEntryProblem,
  emptyPreferences,
  instructionsSchema,
  maxBankEntries,
  phrasingsOf,
  preferencesToSend,
  type BankEntry,
} from '../../src/shared/answer-bank';
import { AnswerKind } from '../../src/shared/contracts/sotto-contracts';
import type { CommandResult } from '../../src/shared/ipc';
import { reduceLive, type LiveAction } from '../../src/shared/live/reducer';
import { initialLiveState } from '../../src/shared/live/view-state';
import { openDatabase } from '../../src/main/storage/local-database';
import { LocalStore } from '../../src/main/storage/local-store';
import { migrations } from '../../src/main/storage/schema';
import { SessionController, type SessionDriver } from '../../src/main/session/session-controller';

const nov11 = Date.UTC(2026, 10, 11, 12);

function store() {
  const db = openDatabase(null, null, migrations);
  return { db, local: new LocalStore(db, () => nov11) };
}

const input = (
  phrasings: string[] | string,
  answer = 'My answer.',
  over: Partial<{ id: string | null; enabled: boolean }> = {},
) => ({
  id: null,
  phrasings: typeof phrasings === 'string' ? phrasings.split('\n') : phrasings,
  answer,
  enabled: true,
  ...over,
});

describe("an answer-bank entry's rules (3.8, v1's normalize_entry)", () => {
  it('takes the phrasings from lines, whitespace collapsed, empty lines and repeats in any case dropped, in order', () => {
    expect(
      phrasingsOf('  Tell me   about yourself \n\nWalk me through your résumé\ntell ME about yourself\n '),
    ).toEqual(['Tell me about yourself', 'Walk me through your résumé']);
    expect(phrasingsOf(['Why us?', '\tWhy\nus?\t', 'Why here?'])).toEqual(['Why us?', 'Why here?']);
    expect(phrasingsOf('')).toEqual([]);
  });

  it.each<[string, string[], string, string | null]>([
    ['no question', [], 'A.', 'Add the question: one per line for the other ways it gets asked.'],
    ['seven ways to ask it', ['1', '2', '3', '4', '5', '6', '7'], 'A.', 'Up to 6 ways to ask it: remove 1.'],
    [
      'a way to ask it over 300 characters',
      ['Q?', 'q'.repeat(301)],
      'A.',
      'Each way to ask it is 300 characters at most: shorten line 2.',
    ],
    ['no answer', ['Q?'], '   ', 'Add the answer.'],
    [
      'an answer over 4,000 characters',
      ['Q?'],
      'a'.repeat(4_002),
      'The answer is 4,000 characters at most: shorten it by 2.',
    ],
    ['six ways, 300 characters, 4,000 of answer', ['1', '2', '3', '4', '5', 'q'.repeat(300)], 'a'.repeat(4_000), null],
  ])('words %s', (_what, phrasings, answer, problem) => {
    expect(bankEntryProblem(phrasings, answer)).toBe(problem);
  });

  it('takes from the window only an id it could have made, and nothing else', () => {
    expect(bankEntryInputSchema.safeParse(input(['Q?'])).success).toBe(true);
    expect(
      bankEntryInputSchema.safeParse(input(['Q?'], 'A.', { id: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4' })).success,
    ).toBe(true);
    for (const id of ['', '../x', 'x'.repeat(41), 'has space']) {
      expect(bankEntryInputSchema.safeParse(input(['Q?'], 'A.', { id })).success).toBe(false);
    }
    expect(bankEntryInputSchema.safeParse({ ...input(['Q?']), source: 'draft' }).success).toBe(false);
    expect(bankEntryInputSchema.safeParse({ ...input(['Q?']), enabled: 'yes' }).success).toBe(false);
    expect(instructionsSchema.safeParse('i'.repeat(4_000)).success).toBe(true);
    expect(instructionsSchema.safeParse('i'.repeat(4_001)).success).toBe(false);
  });
});

describe('the preferences as a session sends them (3.8)', () => {
  const entry = (id: string, enabled = true): BankEntry => ({
    id,
    phrasings: [`Q ${id}?`, `Other ${id}?`],
    answer: `A ${id}.`,
    enabled,
    source: 'manual',
    updatedAt: 1,
  });

  it('sends the instructions and the enabled entries, in the bank’s order', () => {
    expect(
      preferencesToSend({
        instructions: 'Keep it short.',
        instructionsSavedAt: 1,
        bank: [entry('a'), entry('b', false), entry('c')],
      }),
    ).toEqual({
      CustomInstructions: 'Keep it short.',
      PreparedAnswers: [
        { Id: 'a', Phrasings: ['Q a?', 'Other a?'], Answer: 'A a.' },
        { Id: 'c', Phrasings: ['Q c?', 'Other c?'], Answer: 'A c.' },
      ],
    });
  });

  it('sends no instructions when there are none, and nothing at all when there is nothing', () => {
    expect(preferencesToSend({ ...emptyPreferences, bank: [entry('a')] })?.CustomInstructions).toBeNull();
    expect(preferencesToSend(emptyPreferences)).toBeNull();
    expect(preferencesToSend({ instructions: '   ', instructionsSavedAt: 1, bank: [entry('a', false)] })).toBeNull();
    expect(preferencesToSend({ instructions: 'Short.', instructionsSavedAt: 1, bank: [] })).toEqual({
      CustomInstructions: 'Short.',
      PreparedAnswers: [],
    });
  });

  it('sends at most the 100 the server takes', () => {
    const bank = Array.from({ length: 120 }, (_, i) => entry(`e${i}`));
    expect(preferencesToSend({ ...emptyPreferences, bank })?.PreparedAnswers).toHaveLength(maxBankEntries);
  });
});

describe('the answer bank, as kept on this computer (3.8)', () => {
  it('has none at first, and no instructions', () => {
    expect(store().local.preferences()).toEqual(emptyPreferences);
  });

  it('keeps a new entry cleaned, under a new id, last, in the answer_bank table docs/07 §5 plans', () => {
    const { db, local } = store();
    local.saveBankEntry(input('First?'));

    const saved = local.saveBankEntry(input('  Why   us? \nwhy US?\nWhy here?', '  Platform.  '));

    expect(saved).toMatchObject({
      ok: true,
      entry: {
        phrasings: ['Why us?', 'Why here?'],
        answer: 'Platform.',
        enabled: true,
        source: 'manual',
        updatedAt: nov11,
      },
    });
    const bank = local.bank();
    expect(bank.map((e) => e.phrasings[0])).toEqual(['First?', 'Why us?']);
    expect(bank[1]!.id).toMatch(/^[0-9a-f]{32}$/);
    expect(db.prepare('SELECT phrasings, enabled, source FROM answer_bank WHERE id = ?').get(bank[1]!.id)).toEqual({
      phrasings: '["Why us?","Why here?"]',
      enabled: 1,
      source: 'manual',
    });
  });

  it('changes a known entry in its place, keeping where it came from', () => {
    const { local } = store();
    const first = local.saveBankEntry(input('First?'), 'draft');
    local.saveBankEntry(input('Second?'));
    const id = first.ok ? first.entry.id : '';

    local.saveBankEntry(input('First, changed?', 'New answer.', { id, enabled: false }));

    expect(local.bank().map((e) => [e.phrasings[0], e.answer, e.enabled, e.source])).toEqual([
      ['First, changed?', 'New answer.', false, 'draft'],
      ['Second?', 'My answer.', true, 'manual'],
    ]);
  });

  it("refuses an entry that isn't one, in words, and keeps nothing", () => {
    const { local } = store();
    expect(local.saveBankEntry(input([], 'A.'))).toEqual({
      ok: false,
      problem: 'Add the question: one per line for the other ways it gets asked.',
    });
    expect(local.saveBankEntry(input('Q?', ' '))).toEqual({ ok: false, problem: 'Add the answer.' });
    expect(local.bank()).toEqual([]);
  });

  it(`refuses a new entry past ${maxBankEntries}, but still changes a known one`, () => {
    const { local } = store();
    const ids: string[] = [];
    for (let i = 0; i < maxBankEntries; i++) {
      const saved = local.saveBankEntry(input(`Q${i}?`));
      if (saved.ok) ids.push(saved.entry.id);
    }

    expect(local.saveBankEntry(input('One more?'))).toEqual({
      ok: false,
      problem: 'The answer bank is full (100 answers): delete one first.',
    });
    expect(local.saveBankEntry(input('Q0, changed?', 'A.', { id: ids[0]! }))).toMatchObject({ ok: true });
    local.removeBankEntry(ids[1]!);
    expect(local.saveBankEntry(input('One more?'))).toMatchObject({ ok: true });
    expect(local.bank()).toHaveLength(maxBankEntries);
  });

  it('gives an unknown id a new one, rather than writing under it', () => {
    const { local } = store();
    const saved = local.saveBankEntry(input('Q?', 'A.', { id: 'nosuchid' }));
    expect(saved.ok && saved.entry.id).not.toBe('nosuchid');
  });

  it('leaves out a row that no longer reads', () => {
    const { db, local } = store();
    local.saveBankEntry(input('Good?'));
    db.prepare("INSERT INTO answer_bank VALUES ('bad1', 'not json', 'A', 1, 'manual', '2026-11-11T00:00:00Z')").run();
    db.prepare("INSERT INTO answer_bank VALUES ('bad2', '[]', 'A', 1, 'manual', '2026-11-11T00:00:00Z')").run();
    db.prepare("INSERT INTO answer_bank VALUES ('bad3', '[1, 2]', 'A', 1, 'manual', '2026-11-11T00:00:00Z')").run();
    expect(local.bank().map((e) => e.phrasings[0])).toEqual(['Good?']);
  });

  it('keeps the custom instructions whole, with when, and removes them when emptied', () => {
    const { local } = store();
    expect(local.setInstructions('Keep answers short.\nMention Kubernetes.')).toMatchObject({
      instructions: 'Keep answers short.\nMention Kubernetes.',
      instructionsSavedAt: nov11,
    });
    expect(local.setInstructions('   ')).toMatchObject({ instructions: '', instructionsSavedAt: null });
  });
});

describe("the bank's table, on a database from before it (3.8)", () => {
  let dir: string;
  beforeEach(() => (dir = mkdtempSync(join(tmpdir(), 'sotto-bank-'))));
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('comes with migration 2, keeping what migration 1 kept', () => {
    const file = join(dir, 'sotto.db');
    const key = 'c0ffee00'.repeat(8);
    const old = openDatabase(file, key, migrations.slice(0, 1));
    new LocalStore(old).setDocument('resume', 'Kept résumé.');
    old.close();

    // Opened by the version that brought migration 2 (3.8); later ones are tested with their checkpoints.
    const db = openDatabase(file, key, migrations.slice(0, 2));
    const local = new LocalStore(db);
    expect(db.pragma('user_version', { simple: true })).toBe(2);
    expect(local.documents().resume).toBe('Kept résumé.');
    expect(local.saveBankEntry(input('Q?'))).toMatchObject({ ok: true });
    db.close();
  });
});

describe('the 📌 card: a question matched to a prepared answer on this computer (3.8)', () => {
  class FakeDriver implements SessionDriver {
    dispatch: (action: LiveAction) => void = () => {};
    async start(dispatch: (action: LiveAction) => void): Promise<CommandResult> {
      this.dispatch = dispatch;
      return { ok: true };
    }
    async command(): Promise<CommandResult> {
      return { ok: true };
    }
    dispose(): void {}
  }

  let seq = 0;
  const start = (driver: FakeDriver, question: string, kind: AnswerKind = AnswerKind.Spoken) => {
    const id = `answer-${++seq}`;
    driver.dispatch({
      type: 'event',
      event: {
        name: 'answerStart',
        e: { Seq: seq, AtMs: seq, AnswerId: id, Question: question, Kind: kind, Instruction: null, ScreenshotIds: [] },
      },
    });
    return id;
  };

  const bank = [
    { id: 'intro', phrasings: ['Tell me about yourself'], answer: 'I build payment systems.', enabled: true },
    { id: 'off', phrasings: ['Why do you want to work here?'], answer: 'Off.', enabled: false },
  ];

  async function session() {
    vi.useFakeTimers();
    const controller = new SessionController(() => {});
    controller.useBank(bank);
    const driver = new FakeDriver();
    await controller.start(driver);
    return { controller, driver };
  }

  afterEach(() => vi.useRealTimers());

  it.each([AnswerKind.Spoken, AnswerKind.Typed])(
    'matches a spoken or typed question (kind %i) as its answer starts',
    async (kind) => {
      const { controller, driver } = await session();
      start(driver, 'So, could you tell me a little bit about yourself?', kind);
      expect(controller.current.answers.at(-1)!.prepared).toEqual({
        phrasing: 'Tell me about yourself',
        answer: 'I build payment systems.',
      });
    },
  );

  it.each([AnswerKind.Tip, AnswerKind.Study, AnswerKind.Result, AnswerKind.Screen])(
    'never matches a question of kind %i: not the interviewer’s',
    async (kind) => {
      const { controller, driver } = await session();
      start(driver, 'Tell me about yourself', kind);
      expect(controller.current.answers.at(-1)!.prepared).toBeNull();
    },
  );

  it('shows none for a question that matches nothing, or only a disabled entry', async () => {
    const { controller, driver } = await session();
    start(driver, 'How does Kafka keep messages in order?');
    start(driver, 'Why do you want to work here?');
    expect(controller.current.answers.map((a) => a.prepared)).toEqual([null, null]);
  });

  it('matches against the bank given for the session, and nothing without one', async () => {
    const { controller, driver } = await session();
    controller.useBank([]);
    start(driver, 'Tell me about yourself');
    expect(controller.current.answers.at(-1)!.prepared).toBeNull();
  });

  it('keeps a prepared answer with its own answer only, and leaves the state alone for an id it doesn’t hold', () => {
    const started = reduceLive(initialLiveState, {
      type: 'event',
      event: {
        name: 'answerStart',
        e: {
          Seq: 1,
          AtMs: 1,
          AnswerId: 'a',
          Question: 'Q',
          Kind: AnswerKind.Spoken,
          Instruction: null,
          ScreenshotIds: [],
        },
      },
    });
    expect(started.answers[0]!.prepared).toBeNull();
    const prepared = reduceLive(started, { type: 'prepared', answerId: 'a', phrasing: 'Q', answer: 'Mine.' });
    expect(prepared.answers[0]!.prepared).toEqual({ phrasing: 'Q', answer: 'Mine.' });
    expect(reduceLive(started, { type: 'prepared', answerId: 'other', phrasing: 'Q', answer: 'Mine.' })).toEqual(
      started,
    );
  });
});
