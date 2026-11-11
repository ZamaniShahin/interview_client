// The prepared-answer match (3.8), against v1's own tables: backend/test_text_utils.py (textnorm) and
// backend/test_answer_bank.py (best_match), row for row.
import { describe, expect, it } from 'vitest';
import {
  bestMatch,
  buildIndex,
  contentStems,
  coverage,
  normalizeNumbers,
  similarity,
  stem,
  stemsOf,
  tokens,
  type MatchEntry,
} from '../../src/shared/answer-match';

let ids = 0;
const entry = (phrasings: string[], answer = 'An answer.', over: Partial<MatchEntry> = {}): MatchEntry => ({
  id: `e${++ids}`,
  phrasings,
  answer,
  enabled: true,
  ...over,
});

describe("v1's textnorm, ported (test_text_utils.py)", () => {
  it.each<[string, string[]]>([
    ['Hello, World!', ['hello', 'world']],
    ["don't stop", ['dont', 'stop']],
    ['It’s fine', ['its', 'fine']],
    ['10,000 users', ['10000', 'users']],
    ['1,234,567 rows', ['1234567', 'rows']],
    ['3,14', ['3', '14']],
    ['40 % faster', ['40%', 'faster']],
    ['99.9% uptime', ['99.9%', 'uptime']],
    ['v2.0 release', ['v', '2.0', 'release']],
    ['Résumé café naïve Zürich', ['resume', 'cafe', 'naive', 'zurich']],
    ['ＡＢＣ', ['abc']],
    ['C++ and C#', ['c', 'and', 'c']],
    ['e-mail', ['e', 'mail']],
    ['12abc', ['12', 'abc']],
    ['   ', []],
    ['', []],
    ['!!! ??? ...', []],
  ])('tokens(%j) is %j', (text, expected) => {
    expect(tokens(text)).toEqual(expected);
  });

  it.each<[string[], string[]]>([
    [['forty', 'percent'], ['40%']],
    [['two', 'hundred', 'and', 'fifty', 'thousand'], ['250000']],
    [
      ['one', 'million', 'users'],
      ['1000000', 'users'],
    ],
    [['three', 'billion'], ['3000000000']],
    [['twenty', 'five'], ['25']],
    [['twelve', 'hundred'], ['1200']],
    [['zero'], ['0']],
    [['five', 'pct'], ['5%']],
    [['10', 'percent'], ['10%']],
    [['percent'], ['percent']],
    [['hundred'], ['hundred']],
    [
      ['thousand', 'users'],
      ['thousand', 'users'],
    ],
    [
      ['a', 'billion', 'dollars'],
      ['a', 'billion', 'dollars'],
    ],
    [
      ['five', 'and', 'dime'],
      ['5', 'and', 'dime'],
    ],
    [['and'], ['and']],
    [
      ['cut', 'latency', 'by', 'forty', 'percent', 'in', 'two', 'weeks'],
      ['cut', 'latency', 'by', '40%', 'in', '2', 'weeks'],
    ],
    [
      ['2', 'million', 'users'],
      ['2000000', 'users'],
    ],
    [['10', 'thousand'], ['10000']],
    [
      ['3', 'hundred', 'ms'],
      ['300', 'ms'],
    ],
    [
      ['2.5', 'million'],
      ['2.5', 'million'],
    ],
    [
      ['7', 'users'],
      ['7', 'users'],
    ],
    [[], []],
  ])('normalizeNumbers(%j) is %j', (toks, expected) => {
    expect(normalizeNumbers(toks)).toEqual(expected);
  });

  it.each([
    ['caching', 'cach'],
    ['cached', 'cach'],
    ['caches', 'cach'],
    ['cache', 'cach'],
    ['running', 'runn'],
    ['users', 'user'],
    ['takes', 'tak'],
    ['sing', 'sing'],
    ['red', 'red'],
    ['bus', 'bus'],
    ['make', 'make'],
    ['class', 'class'],
    ['process', 'process'],
    ['is', 'is'],
    ['', ''],
  ])('stem(%j) is %j', (word, expected) => {
    expect(stem(word)).toBe(expected);
  });

  it('keeps content stems without stopwords, in order, repeats included', () => {
    expect(contentStems('The caching layer')).toEqual(['cach', 'layer']);
    expect(contentStems('forty percent of users')).toEqual(['40%', 'user']);
    expect(contentStems('tell me about yourself', new Set(['tell', 'me', 'about']))).toEqual(['yourself']);
    expect(contentStems('the of and')).toEqual([]);
    expect(contentStems('Kafka Kafka')).toEqual(['kafka', 'kafka']);
  });
});

describe("v1's best_match, ported (test_answer_bank.py)", () => {
  const bank: [string, ...string[]][] = [
    ['Tell me about yourself', 'Walk me through your resume'],
    ['What is your greatest weakness?'],
    ['Why do you want to work here?'],
    ['What are your salary expectations?'],
    ['Tell me about a time you failed'],
    ['Where do you see yourself in five years?'],
    ['Do you have any questions for us?'],
    ['Why are you leaving your current job?'],
  ];
  const index = buildIndex(bank.map((phrasings, i) => entry(phrasings, `Answer ${i}`)));

  it.each<[string, string | null]>([
    ['So, could you tell me a little bit about yourself?', 'Tell me about yourself'],
    ['Tell me about yourself and your background', 'Tell me about yourself'],
    ['Walk me through your résumé.', 'Walk me through your resume'],
    ['WALK ME THROUGH YOUR RESUME', 'Walk me through your resume'],
    ["What's your greatest weakness?", 'What is your greatest weakness?'],
    ['Why do you want to work at Acme?', 'Why do you want to work here?'],
    ['What kind of salary are you expecting?', 'What are your salary expectations?'],
    ['Tell me about a time when you failed at something.', 'Tell me about a time you failed'],
    ['Where do you see yourself in 5 years?', 'Where do you see yourself in five years?'],
    ['Any questions about the role?', 'Do you have any questions for us?'],
    [
      "We're a payments company with 200 engineers. We use Kafka a lot. So, tell me about yourself.",
      'Tell me about yourself',
    ],
    ['Why did you leave your last job?', 'Why are you leaving your current job?'],
    // Conservative on purpose: different questions, synonyms and topics never match.
    ['How would you describe yourself in three words?', null],
    ['What would you say is your biggest weakness?', null],
    ['Tell me about a time you led a team', null],
    ['Tell me about a time you had a conflict with a coworker', null],
    ['How does Kafka guarantee ordering within a partition?', null],
    ['What are you looking for in your next role?', null],
    ['Explain the CAP theorem', null],
    ['', null],
    ['?!', null],
    ['um uh so', null],
  ])('matches %j to %j', (question, expected) => {
    const match = bestMatch(index, question);
    expect(match?.phrasing ?? null).toBe(expected);
    if (match) {
      expect(match.score).toBeGreaterThanOrEqual(0.6);
      expect(match.score).toBeLessThanOrEqual(1);
      expect(match.answer).toMatch(/^Answer /);
    }
  });

  it('skips disabled entries, keeps the bank order on a tie, and takes an empty bank', () => {
    const a = entry(['Tell me about yourself'], 'first', { id: 'a1' });
    const b = entry(['Tell me about yourself please'], 'second', { id: 'b2' });
    expect(bestMatch(buildIndex([a, b]), 'tell me about yourself')?.id).toBe('a1');
    expect(bestMatch(buildIndex([{ ...a, enabled: false }, b]), 'tell me about yourself')?.id).toBe('b2');
    expect(bestMatch(buildIndex([]), 'tell me about yourself')).toBeNull();
    expect(buildIndex([entry(['What?', 'How?'])])).toEqual([]);
  });

  it('wants the question to cover most of the phrasing, and to be mostly about it', () => {
    const weakness = buildIndex([entry(['What is your greatest weakness?'])]);
    expect(bestMatch(weakness, 'your biggest weakness?')).toBeNull();
    expect(bestMatch(weakness, 'your biggest weakness?', 0.1)).toBeNull();
    const intro = buildIndex([entry(['Tell me about yourself'])]);
    const wide = 'Tell me about yourself, your background and your hobbies';
    expect(bestMatch(intro, wide)).toBeNull();
    expect(bestMatch(intro, wide, 0.5)?.score).toBe(0.5);
    expect(coverage(stemsOf(wide), stemsOf('Tell me about yourself'))).toBe(1);
  });

  it('measures similarity symmetrically, within 0 and 1', () => {
    const [s1, s2] = [stemsOf('tell me about the payment ledger migration'), stemsOf('ledger migrations at Acme')];
    expect(similarity(s1, s2)).toBe(similarity(s2, s1));
    expect(similarity(s1, s2)).toBeGreaterThan(0);
    expect(similarity(s1, s2)).toBeLessThan(1);
    expect(similarity(new Set(), s1)).toBe(0);
    expect(similarity(s1, s1)).toBe(1);
  });

  it('matches more rephrasings: punctuation, numbers, the most specific entry, a long preamble, single words', () => {
    const more = buildIndex([
      entry(['Tell me about yourself'], 'intro', { id: 'intro' }),
      entry(['Where do you see yourself in five years?'], 'future', { id: 'future' }),
      entry(['Tell me about a time you failed'], 'fail', { id: 'fail' }),
      entry(['Tell me about a time you failed a deadline'], 'deadline', { id: 'deadline' }),
      entry(['What is your notice period?'], 'notice', { id: 'notice' }),
    ]);
    const preamble = Array.from(
      { length: 12 },
      () => "We're a fintech company building a ledger for small businesses.",
    ).join(' ');
    const rows: [string, string | null][] = [
      ['tell me about yourself!!!', 'intro'],
      ['TELL ME ABOUT YOURSELF', 'intro'],
      ['In 5 yrs where do you see yourself?', 'future'],
      ['Tell me about a time you failed a deadline', 'deadline'],
      ['Tell me about a time you failed', 'fail'],
      [`${preamble} So — tell me about yourself.`, 'intro'],
      ["What's your notice period like?", 'notice'],
      ['How long is your notice period?', 'notice'],
      ['???', null],
      ['yourself', 'intro'],
      ['period', null],
      ['Tell me about the deadline', null],
    ];
    expect(rows.map(([question]) => bestMatch(more, question)?.id ?? null)).toEqual(rows.map(([, id]) => id));
  });
});
