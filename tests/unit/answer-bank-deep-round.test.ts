// The deep round over 3.6, 3.8 and 3.10 (Shahin's, 2026-11-11): the answer bank and the 📌 match. Each part triggered
// again, widened with data points around v1's tables (answer-match.test.ts) and the entry rules (answer-bank.test.ts),
// and every outcome given a test of its own.
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  bankEntryProblem,
  bankIdSchema,
  maxAnswerChars,
  maxBankEntries,
  maxPhrasingChars,
  maxPhrasings,
  phrasingsOf,
  preferencesToSend,
  type BankEntry,
} from '../../src/shared/answer-bank';
import { bestMatch, buildIndex, similarity, stemsOf, type MatchEntry } from '../../src/shared/answer-match';
import { AnswerKind, ErrorCodes } from '../../src/shared/contracts/sotto-contracts';
import type { CommandResult } from '../../src/shared/ipc';
import { reduceLive, type LiveAction } from '../../src/shared/live/reducer';
import { initialLiveState, type LiveViewState } from '../../src/shared/live/view-state';
import { openDatabase } from '../../src/main/storage/local-database';
import { LocalStore } from '../../src/main/storage/local-store';
import { migrations } from '../../src/main/storage/schema';
import { SessionController, type SessionDriver } from '../../src/main/session/session-controller';

const entry = (id: string, phrasings: string[], over: Partial<MatchEntry> = {}): MatchEntry => ({
  id,
  phrasings,
  answer: `Answer ${id}.`,
  enabled: true,
  ...over,
});

describe('the 📌 match, widened around v1’s tables (3.8)', () => {
  const bank = buildIndex([
    entry('intro', ['Tell me about yourself', 'Walk me through your resume']),
    entry('weakness', ['What is your greatest weakness?']),
    entry('why-us', ['Why do you want to work here?']),
    entry('salary', ['What are your salary expectations?']),
    entry('failure', ['Tell me about a time you failed']),
    entry('five-years', ['Where do you see yourself in five years?']),
    entry('leaving', ['Why are you leaving your current job?']),
    entry('latency', ['How did you cut latency by forty percent?']),
    entry('kafka', ['Why did you choose Kafka over RabbitMQ?']),
  ]);

  it.each<[string, string | null]>([
    // As speech-to-text writes them: no capitals, no punctuation, numbers in words or digits.
    ['tell me about yourself', 'intro'],
    ['so tell me a little bit about yourself', 'intro'],
    ['okay so um tell me about yourself please', 'intro'],
    ['can you walk me through your resume', 'intro'],
    ['walk me through your résumé', 'intro'],
    ['whats your greatest weakness', 'weakness'],
    ['what’s your greatest weakness', 'weakness'],
    ['what would you say your greatest weakness is', 'weakness'],
    ['why do you want to work here', 'why-us'],
    ['so why do you want to work here at acme', 'why-us'],
    ['what are your salary expectations for this role', 'salary'],
    ['tell me about a time when you failed', 'failure'],
    ['where do you see yourself in 5 years', 'five-years'],
    ['where do you see yourself in five years time', 'five-years'],
    ['why are you leaving your current job', 'leaving'],
    ['how did you cut latency by 40%', 'latency'],
    ['how did you cut the latency by forty percent', 'latency'],
    ['how did you cut latency by 40 %', 'latency'],
    ['why did you choose kafka over rabbitmq', 'kafka'],
    ['why kafka over rabbitmq', 'kafka'],
    // Other questions, even close ones, never get someone else's answer.
    ['tell me about your team', null],
    ['what is your greatest strength', null],
    ['why did you choose postgres over mysql', null],
    ['what salary', null],
    ['why', null],
    ['', null],
    ['   ', null],
    ['... ??? !!!', null],
  ])('matches %j to %j', (question, id) => {
    expect(bestMatch(bank, question)?.id ?? null).toBe(id);
  });

  // Found by this round, and v1's own behaviour (its F1 and coverage, unchanged here): a different question that shares
  // two of three or three of four of a phrasing's words gets its answer. The card names the phrasing it matched, so the
  // user can tell; whether to be stricter than v1 is the open question Q49 (docs/08-open-questions.md).
  it.each<[string, string, string, number]>([
    ['where do you see the company in five years', 'five-years', 'Where do you see yourself in five years?', 0.75],
    ['how did you cut costs by forty percent', 'latency', 'How did you cut latency by forty percent?', 0.67],
  ])('matches %j, a different question, to %j as v1 does, naming the phrasing', (question, id, phrasing, score) => {
    expect(bestMatch(bank, question)).toMatchObject({ id, phrasing, score });
  });

  it('finds the question after a long preamble, in the last sentences', () => {
    const preamble = 'We are a payments company. We run Kafka and Postgres. Our team is twelve people. ';
    expect(bestMatch(bank, `${preamble.repeat(5)}So, tell me about yourself.`)?.id).toBe('intro');
    expect(bestMatch(bank, `${preamble}Where do you see yourself in five years? Take your time.`)?.id).toBe(
      'five-years',
    );
  });

  it('finds the question asked first, ahead of what follows it', () => {
    expect(bestMatch(bank, 'Tell me about yourself. We have plenty of time. There is no rush at all here.')?.id).toBe(
      'intro',
    );
  });

  // Stems that are no stopwords, no question words, and no prefix of one another.
  const words = ['kafka', 'ledger', 'latency', 'migration', 'terraform', 'grpc', 'docker', 'vault', 'ingress'];
  const phrase = (n: number, from = 0) => words.slice(from, from + n).join(' ');

  it.each<[string, string, string, number | null]>([
    ['covers it all, nothing else', phrase(5), phrase(5), 1],
    ['covers three of five (60%), nothing else', phrase(5), phrase(3), 0.75],
    ['covers two of five (40%)', phrase(5), phrase(2), null],
    ['covers two of three, nothing else', phrase(3), phrase(2), 0.8],
    ['covers it all, and half as much else', phrase(2), phrase(3), 0.8],
    ['covers it all, and as much else', phrase(3), phrase(6), 0.67],
    ['covers it all, and far more else', phrase(3), `${phrase(3)} ${phrase(5, 3)}`, null],
    ['shares nothing', phrase(3), phrase(3, 3), null],
  ])('scores a question that %s', (_, phrasing, question, score) => {
    const index = buildIndex([entry('only', [phrasing])]);
    const match = bestMatch(index, question);
    expect(match?.score ?? null).toBe(score);
  });

  it('agrees with similarity, rounded to two places', () => {
    const phrasing = phrase(3);
    for (let extra = 0; extra <= 4; extra++) {
      const question = `${phrasing} ${phrase(extra, 3)}`.trim();
      const f1 = similarity(stemsOf(question), stemsOf(phrasing));
      const match = bestMatch(buildIndex([entry('only', [phrasing])]), question);
      if (f1 >= 0.6) expect(match?.score).toBe(Math.round(f1 * 100) / 100);
      else expect(match).toBeNull();
    }
  });

  // Not at 0.75 itself: the score is a sum of fractions, a hair under its rounded value (0.7499999999999999).
  it.each<[number, string | null]>([
    [0.5, 'only'],
    [0.74, 'only'],
    [0.76, null],
    [1, null],
  ])('with a threshold of %d, matches a question scoring 0.75: %s', (threshold, id) => {
    const index = buildIndex([entry('only', [phrase(5)])]);
    expect(bestMatch(index, phrase(3), threshold)?.id ?? null).toBe(id);
  });

  it('keeps the earlier entry on a tie, and takes a later one that scores higher', () => {
    const tie = buildIndex([entry('first', [phrase(3)]), entry('second', [phrase(3)])]);
    expect(bestMatch(tie, phrase(3))?.id).toBe('first');
    const better = buildIndex([entry('first', [phrase(4)]), entry('second', [phrase(3)])]);
    expect(bestMatch(better, phrase(3))?.id).toBe('second');
  });

  it('matches any of an entry’s phrasings, and names the one it matched', () => {
    const index = buildIndex([entry('intro', ['Tell me about yourself', 'Walk me through your resume', 'Your story'])]);
    expect(bestMatch(index, 'walk me through your resume')).toMatchObject({
      id: 'intro',
      phrasing: 'Walk me through your resume',
      answer: 'Answer intro.',
    });
  });

  it('never matches a disabled entry, however close, nor a phrasing of only question words', () => {
    const index = buildIndex([
      entry('off', ['Tell me about yourself'], { enabled: false }),
      entry('empty', ['What is it?', 'How so?']),
    ]);
    expect(index).toEqual([]);
    expect(bestMatch(index, 'Tell me about yourself')).toBeNull();
  });

  it('matches a whole bank of a hundred entries against a long question quickly', () => {
    // A word of its own for each phrasing, all of one length so that none is a prefix of another.
    const tag = (n: number) => String.fromCharCode(97 + Math.floor(n / 26), 97 + (n % 26));
    const phrasingOf = (i: number, j: number) => `zq${tag(i)}${tag(j)} ${words[(i + j) % words.length]} deployment`;
    const full = buildIndex(
      Array.from({ length: maxBankEntries }, (_, i) =>
        entry(
          `e${i}`,
          Array.from({ length: maxPhrasings }, (__, j) => phrasingOf(i, j)),
        ),
      ),
    );
    const noise = Array.from({ length: 2_000 }, (_, i) => `word${i}`).join(' ');
    const started = performance.now();
    const match = bestMatch(full, `${noise} ${phrasingOf(42, 3)}`);
    expect(performance.now() - started).toBeLessThan(2_000);
    // Lost in two thousand other words: about something else.
    expect(match).toBeNull();
    expect(bestMatch(full, phrasingOf(42, 3))).toMatchObject({ id: 'e42', phrasing: phrasingOf(42, 3), score: 1 });
  });
});

describe('an entry’s rules, widened (3.8, v1’s normalize_entry)', () => {
  it.each<[string, string | string[], string[]]>([
    ['Windows line breaks', 'One?\r\nTwo?', ['One?', 'Two?']],
    ['empty lines between', 'One?\n\n\n\nTwo?', ['One?', 'Two?']],
    ['spaces and tabs inside', '  Tell   me\tabout  you  ', ['Tell me about you']],
    ['non-breaking spaces', 'Tell me', ['Tell me']],
    ['a repeat in other capitals', 'Why us?\nWHY US?\nwhy us?', ['Why us?']],
    ['a repeat with other spacing', 'Why  us?\n Why us? ', ['Why us?']],
    ['a repeat in accented capitals', 'Été?\nété?', ['Été?']],
    ['repeats kept apart by punctuation', 'Why us?\nWhy us', ['Why us?', 'Why us']],
    ['lines of only space', ' \n\t\n', []],
    [
      'a list, line breaks inside an item made spaces',
      ['Tell me\nabout you', 'Why us?'],
      ['Tell me about you', 'Why us?'],
    ],
    ['a list with empty items', ['', '  ', 'Why us?'], ['Why us?']],
  ])('takes phrasings with %s', (_, input, phrasings) => {
    expect(phrasingsOf(input)).toEqual(phrasings);
  });

  const lines = (n: number, length = 10) => Array.from({ length: n }, (_, i) => `${i}`.padEnd(length, 'q'));

  it.each<[string, string[], string, string | null]>([
    ['no question', [], 'An answer.', 'Add the question: one per line for the other ways it gets asked.'],
    [
      'no question and no answer: the question first',
      [],
      '',
      'Add the question: one per line for the other ways it gets asked.',
    ],
    [`${maxPhrasings} ways to ask it`, lines(maxPhrasings), 'An answer.', null],
    [
      `${maxPhrasings + 1} ways to ask it`,
      lines(maxPhrasings + 1),
      'An answer.',
      `Up to ${maxPhrasings} ways to ask it: remove 1.`,
    ],
    ['ten ways to ask it', lines(10), 'An answer.', `Up to ${maxPhrasings} ways to ask it: remove 4.`],
    [`a way to ask it of ${maxPhrasingChars} characters`, lines(3, maxPhrasingChars), 'An answer.', null],
    [
      `a third way to ask it of ${maxPhrasingChars + 1} characters`,
      [...lines(2), 'q'.repeat(maxPhrasingChars + 1)],
      'An answer.',
      `Each way to ask it is ${maxPhrasingChars} characters at most: shorten line 3.`,
    ],
    ['no answer', lines(1), '', 'Add the answer.'],
    ['an answer of spaces', lines(1), ' \n\t ', 'Add the answer.'],
    [`an answer of ${maxAnswerChars} characters`, lines(1), 'a'.repeat(maxAnswerChars), null],
    [
      `an answer of ${maxAnswerChars} characters, with space around`,
      lines(1),
      `  ${'a'.repeat(maxAnswerChars)}\n`,
      null,
    ],
    [
      `an answer of ${maxAnswerChars + 1} characters`,
      lines(1),
      'a'.repeat(maxAnswerChars + 1),
      'The answer is 4,000 characters at most: shorten it by 1.',
    ],
    [
      'an answer 1,234 characters too long',
      lines(1),
      'a'.repeat(maxAnswerChars + 1_234),
      'The answer is 4,000 characters at most: shorten it by 1,234.',
    ],
  ])('says of an entry with %s: %j', (_, phrasings, answer, problem) => {
    expect(bankEntryProblem(phrasings, answer)).toBe(problem);
  });
});

describe('the bank kept on this computer, widened (3.8)', () => {
  const nov11 = Date.UTC(2026, 10, 11, 12);
  let clock = nov11;
  const local = () => {
    const db = openDatabase(null, null, migrations);
    return { db, store: new LocalStore(db, () => clock) };
  };
  const save = (store: LocalStore, phrasings: string, over: Partial<{ id: string | null; enabled: boolean }> = {}) =>
    store.saveBankEntry({
      id: null,
      phrasings: phrasings.split('\n'),
      answer: `About ${phrasings}.`,
      enabled: true,
      ...over,
    });
  const id = (result: ReturnType<LocalStore['saveBankEntry']>) => (result.ok ? result.entry.id : '');

  it('names each new entry with 32 hex digits, an id the server takes, never twice', () => {
    const { store } = local();
    const ids = Array.from({ length: 50 }, (_, i) => id(save(store, `Question ${i}?`)));
    for (const each of ids) {
      expect(each).toMatch(/^[0-9a-f]{32}$/);
      expect(bankIdSchema.safeParse(each).success).toBe(true);
    }
    expect(new Set(ids).size).toBe(50);
  });

  it('keeps the order entries were added through edits, removals and additions', () => {
    const { store } = local();
    const [a, b, c] = ['A?', 'B?', 'C?'].map((q) => id(save(store, q)));
    save(store, 'B, changed?', { id: b! });
    expect(store.bank().map((e) => e.phrasings[0])).toEqual(['A?', 'B, changed?', 'C?']);
    store.removeBankEntry(a!);
    save(store, 'D?');
    expect(store.bank().map((e) => e.phrasings[0])).toEqual(['B, changed?', 'C?', 'D?']);
    expect(
      store
        .bank()
        .map((e) => e.id)
        .slice(0, 2),
    ).toEqual([b, c]);
  });

  it('keeps when each entry was last changed', () => {
    const { store } = local();
    clock = nov11;
    const first = id(save(store, 'A?'));
    clock = nov11 + 60_000;
    save(store, 'B?');
    clock = nov11 + 120_000;
    save(store, 'A, again?', { id: first });
    expect(store.bank().map((e) => e.updatedAt)).toEqual([nov11 + 120_000, nov11 + 60_000]);
  });

  it('keeps a draft a draft, however it is edited, and a typed one typed', () => {
    const { store } = local();
    const draft = store.saveBankEntry(
      { id: null, phrasings: ['Drafted?'], answer: 'By the server.', enabled: true },
      'draft',
    );
    const typed = save(store, 'Typed?');
    store.saveBankEntry(
      { id: id(draft), phrasings: ['Drafted, edited?'], answer: 'Mine now.', enabled: false },
      'manual',
    );
    store.saveBankEntry({ id: id(typed), phrasings: ['Typed?'], answer: 'Still mine.', enabled: true }, 'draft');
    expect(store.bank().map((e) => [e.source, e.enabled])).toEqual([
      ['draft', false],
      ['manual', true],
    ]);
  });

  it(`takes ${maxBankEntries} entries, refuses the next in words, and takes one again once there is room`, () => {
    const { store } = local();
    const ids = Array.from({ length: maxBankEntries }, (_, i) => id(save(store, `Q${i}?`)));
    expect(save(store, 'One too many?')).toEqual({
      ok: false,
      problem: `The answer bank is full (${maxBankEntries} answers): delete one first.`,
    });
    // Disabled entries count too: the limit is the bank's, not what is sent.
    save(store, 'Q0?', { id: ids[0]!, enabled: false });
    expect(save(store, 'Still too many?').ok).toBe(false);
    store.removeBankEntry(ids[5]!);
    expect(save(store, 'Room now?').ok).toBe(true);
    expect(store.bank()).toHaveLength(maxBankEntries);
  });

  it('refuses an entry that breaks a rule before anything is kept, new or known', () => {
    const { store } = local();
    const known = id(save(store, 'Known?'));
    expect(store.saveBankEntry({ id: null, phrasings: [' '], answer: 'x', enabled: true })).toMatchObject({
      ok: false,
    });
    expect(store.saveBankEntry({ id: known, phrasings: ['Known?'], answer: ' ', enabled: true })).toEqual({
      ok: false,
      problem: 'Add the answer.',
    });
    expect(store.bank()).toHaveLength(1);
    expect(store.bank()[0]!.answer).toBe('About Known?.');
  });

  it('removes nothing for an id it does not keep', () => {
    const { store } = local();
    save(store, 'A?');
    store.removeBankEntry('0'.repeat(32));
    store.removeBankEntry('');
    expect(store.bank()).toHaveLength(1);
  });

  it.each<[string, string, string]>([
    ['phrasings that are no JSON', 'not json', 'manual'],
    ['phrasings that are an object', '{"a":1}', 'manual'],
    ['no phrasings', '[]', 'manual'],
    ['phrasings that are not text', '[1,2]', 'manual'],
    ['a phrasing that is not text among others', '["A?",null]', 'manual'],
  ])('leaves out a row with %s, and reads the rest', (_, phrasings, source) => {
    const { db, store } = local();
    save(store, 'Fine?');
    db.prepare(
      `INSERT INTO answer_bank (id, phrasings, answer, enabled, source, updated_at) VALUES ('bad', ?, 'x', 1, ?, ?)`,
    ).run(phrasings, source, new Date(nov11).toISOString());
    expect(store.bank().map((e) => e.phrasings[0])).toEqual(['Fine?']);
  });

  it('sends what the bank holds as the server takes it: enabled entries in order, the instructions as written', () => {
    const { store } = local();
    store.setInstructions('  Keep it short.\n');
    const a = id(save(store, 'A?'));
    save(store, 'B?', { enabled: false });
    const c = id(save(store, 'C?\nSee?'));
    expect(preferencesToSend(store.preferences())).toEqual({
      CustomInstructions: '  Keep it short.\n',
      PreparedAnswers: [
        { Id: a, Phrasings: ['A?'], Answer: 'About A?.' },
        { Id: c, Phrasings: ['C?', 'See?'], Answer: 'About C?\nSee?.' },
      ],
    });
    store.setInstructions(' \n ');
    expect(store.preferences().instructions).toBe('');
    expect(preferencesToSend(store.preferences())?.CustomInstructions).toBeNull();
  });

  it('sends nothing when every entry is off and there are no instructions', () => {
    const { store } = local();
    save(store, 'A?', { enabled: false });
    expect(preferencesToSend(store.preferences())).toBeNull();
  });

  it.each<[string, Partial<BankEntry>, boolean]>([
    ['an enabled entry', {}, true],
    ['a disabled one', { enabled: false }, false],
  ])('matches %s in a session: %s', (_, over, matched) => {
    const index = buildIndex([
      { id: 'x', phrasings: ['Tell me about yourself'], answer: 'Me.', enabled: true, ...over },
    ]);
    expect(bestMatch(index, 'tell me about yourself') !== null).toBe(matched);
  });
});

describe('the 📌 card through a session, widened (3.8)', () => {
  class Driver implements SessionDriver {
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

  const bank: MatchEntry[] = [
    { id: 'intro', phrasings: ['Tell me about yourself'], answer: 'I build payment systems.', enabled: true },
    { id: 'why', phrasings: ['Why do you want to work here?'], answer: 'Your ledger.', enabled: true },
  ];

  let seq = 0;
  const answerStart = (driver: Driver, question: string, kind: AnswerKind = AnswerKind.Spoken, at = ++seq) => {
    const id = `answer-${at}`;
    driver.dispatch({
      type: 'event',
      event: {
        name: 'answerStart',
        e: { Seq: at, AtMs: at, AnswerId: id, Question: question, Kind: kind, Instruction: null, ScreenshotIds: [] },
      },
    });
    return id;
  };

  async function session(entries: MatchEntry[] = bank) {
    vi.useFakeTimers();
    const controller = new SessionController(() => {});
    controller.useBank(entries);
    const driver = new Driver();
    await controller.start(driver);
    return { controller, driver, answer: (id: string) => controller.current.answers.find((a) => a.id === id) };
  }

  afterEach(() => vi.useRealTimers());

  it('shows the prepared answer of each question matched, and none for the others, answer by answer', async () => {
    const { driver, answer } = await session();
    const ids = [
      answerStart(driver, 'So tell me about yourself'),
      answerStart(driver, 'How does Kafka order messages?'),
      answerStart(driver, 'Why do you want to work here?', AnswerKind.Typed),
      answerStart(driver, 'Why do you want to work here?', AnswerKind.Tip),
    ];
    expect(ids.map((id) => answer(id)?.prepared?.answer ?? null)).toEqual([
      'I build payment systems.',
      null,
      'Your ledger.',
      null,
    ]);
  });

  it('keeps the prepared answer as the generated one is written, finished, stopped, failed or hidden', async () => {
    const { driver, answer } = await session();
    const endings: [string, LiveAction | null][] = [
      [
        'written',
        { type: 'event', event: { name: 'answerDelta', e: { Seq: 0, AtMs: 0, AnswerId: '', Text: 'More.' } } },
      ],
      ['finished', { type: 'event', event: { name: 'answerDone', e: { Seq: 0, AtMs: 0, AnswerId: '' } } }],
      ['stopped', { type: 'event', event: { name: 'answerCancelled', e: { Seq: 0, AtMs: 0, AnswerId: '' } } }],
      [
        'failed',
        {
          type: 'event',
          event: {
            name: 'answerFailed',
            e: { Seq: 0, AtMs: 0, AnswerId: '', Code: ErrorCodes.Ai.ProviderUnavailable, Message: 'x' },
          },
        },
      ],
      [
        'hidden',
        {
          type: 'event',
          event: {
            name: 'answerFailed',
            e: { Seq: 0, AtMs: 0, AnswerId: '', Code: ErrorCodes.Ai.OutputBlocked, Message: 'x' },
          },
        },
      ],
    ];
    for (const [ending, action] of endings) {
      const id = answerStart(driver, 'Tell me about yourself');
      const e = (action as Extract<LiveAction, { type: 'event' }>).event.e as { Seq: number; AnswerId: string };
      e.Seq = ++seq;
      e.AnswerId = id;
      driver.dispatch(action!);
      expect([ending, answer(id)?.prepared?.answer]).toEqual([ending, 'I build payment systems.']);
    }
  });

  it('keeps the prepared answer through a snapshot after a reconnect, and a replay of the answer’s start', async () => {
    const { driver, answer, controller } = await session();
    const at = ++seq;
    const id = answerStart(driver, 'Tell me about yourself', AnswerKind.Spoken, at);
    driver.dispatch({
      type: 'snapshot',
      snapshot: {
        SessionId: 's',
        Phase: 1,
        Auto: true,
        Paused: false,
        ContextReady: true,
        Heard: '',
        LastSeq: at,
        Attachments: [],
        MaxAttachments: 5,
        PrepDoc: null,
        CustomInstructionsChars: 0,
        PreparedInPrompt: ['intro'],
        Practice: null,
      },
    });
    // The resume replays the start: nothing doubles, the card stays.
    answerStart(driver, 'Tell me about yourself', AnswerKind.Spoken, at);
    expect(controller.current.answers).toHaveLength(1);
    expect(answer(id)?.prepared).toEqual({ phrasing: 'Tell me about yourself', answer: 'I build payment systems.' });
  });

  it('matches nothing once the bank in use is emptied, and the new bank from the next session on', async () => {
    const first = await session();
    first.controller.useBank([]);
    const id = answerStart(first.driver, 'Tell me about yourself');
    expect(first.answer(id)?.prepared).toBeNull();
    first.controller.useBank([{ ...bank[0]!, answer: 'Changed.' }]);
    const again = answerStart(first.driver, 'Tell me about yourself');
    expect(first.answer(again)?.prepared?.answer).toBe('Changed.');
  });

  it('lets the cards go with their answers when the session starts over', async () => {
    const { driver, controller } = await session();
    answerStart(driver, 'Tell me about yourself');
    driver.dispatch({ type: 'event', event: { name: 'cleared', e: { Seq: ++seq, AtMs: seq } } });
    expect(controller.current.answers).toEqual([]);
  });

  it('changes nothing for a match to an answer it does not hold', () => {
    const state: LiveViewState = { ...initialLiveState };
    expect(reduceLive(state, { type: 'prepared', answerId: 'nobody', phrasing: 'x', answer: 'y' })).toBe(state);
  });
});
