// The prepared-answer match (3.8), on this computer: v1's answer_bank.best_match over its textnorm, ported. When a
// question is answered, the user's own prepared answer for it shows at once (📌), while the generated one is written.
// Lenient on purpose: what was said (speech-to-text: no punctuation, numbers spelled out) against what was written.
// Pure and cheap: the index is built once per bank, and a match is set operations.

/** v1's textnorm.STOPWORDS. */
const stopwords = new Set([
  'a',
  'an',
  'the',
  'of',
  'to',
  'and',
  'or',
  'in',
  'on',
  'for',
  'with',
  'my',
  'our',
  'at',
  'by',
  'from',
  'as',
  'is',
  'it',
  'its',
  'this',
  'that',
  'we',
  'i',
]);

/** v1's answer_bank._QUESTION_WORDS: question scaffolding that says nothing about which question it is. */
const questionWords = new Set([
  'what',
  'whats',
  'why',
  'how',
  'when',
  'where',
  'which',
  'who',
  'whom',
  'whose',
  'do',
  'does',
  'did',
  'doing',
  'is',
  'are',
  'was',
  'were',
  'be',
  'been',
  'am',
  'can',
  'could',
  'would',
  'will',
  'should',
  'may',
  'might',
  'must',
  'shall',
  'you',
  'your',
  'youre',
  'yours',
  'me',
  'us',
  'tell',
  'say',
  'talk',
  'give',
  'share',
  'describe',
  'explain',
  'walk',
  'through',
  'about',
  'so',
  'okay',
  'ok',
  'well',
  'now',
  'little',
  'bit',
  'please',
  'kind',
  'sort',
  'some',
  'something',
  'anything',
  'any',
  'have',
  'has',
  'had',
  'get',
  'got',
  'like',
  'just',
  'really',
  'think',
  'let',
  'lets',
  'go',
  'ahead',
  'also',
  'then',
  'there',
  'here',
  'if',
  'um',
  'uh',
  'one',
  'great',
]);

/** v1's MATCH_THRESHOLD: the F1 of content stems needed to show an answer at once. */
export const matchThreshold = 0.6;
/** v1's MIN_COVERAGE: and the question must cover this share of the phrasing's words. */
export const minCoverage = 0.6;

const units: Record<string, number> = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
};
const scales: Record<string, number> = { thousand: 1_000, million: 1_000_000, billion: 1_000_000_000 };

/** v1's textnorm.tokens: lower-case word and number tokens, accents folded, apostrophes dropped, "10,000" as one. */
export function tokens(text: string): string[] {
  let t = (text ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/\p{Mn}/gu, '');
  t = t.replace(/’/g, "'").replace(/'/g, '');
  t = t.replace(/(?<=\d),(?=\d{3}\b)/g, '');
  t = t.replace(/(?<=\d)\s+%/g, '%');
  return t.match(/\d+(?:\.\d+)?%?|[a-z]+/g) ?? [];
}

const isDigits = (w: string) => /^\d+$/.test(w);

/** v1's textnorm.normalize_numbers: spelled-out numbers as digits, "forty percent" as "40%". */
export function normalizeNumbers(toks: string[]): string[] {
  const out: string[] = [];
  let total = 0;
  let current = 0;
  let inNumber = false;
  const flush = () => {
    if (inNumber) out.push(String(total + current));
    total = 0;
    current = 0;
    inNumber = false;
  };
  for (let i = 0; i < toks.length; i++) {
    const w = toks[i]!;
    const next = toks[i + 1] ?? '';
    if (w in units) {
      current += units[w]!;
      inNumber = true;
    } else if (isDigits(w) && !inNumber && (next in scales || next === 'hundred')) {
      // "2 million" (written) equals "two million" (said): 2000000 both ways.
      current = Number(w);
      inNumber = true;
    } else if (w === 'hundred' && inNumber) {
      current = (current || 1) * 100;
    } else if (w in scales && inNumber) {
      total += (current || 1) * scales[w]!;
      current = 0;
    } else if (w === 'and' && inNumber && i + 1 < toks.length && toks[i + 1]! in units) {
      continue;
    } else if (w === 'percent' || w === 'pct') {
      flush();
      const last = out[out.length - 1];
      if (last !== undefined && /\d$/.test(last)) out[out.length - 1] = `${last}%`;
      else out.push(w);
    } else {
      flush();
      out.push(w);
    }
  }
  flush();
  return out;
}

/** v1's textnorm.stem: very light, so "caching", "cached", "caches" and "cache" agree. */
export function stem(w: string): string {
  for (const [suffix, minLength] of [
    ['ing', 6],
    ['ed', 5],
    ['es', 5],
    ['s', 4],
    ['e', 5],
  ] as const) {
    if (w.length >= minLength && w.endsWith(suffix) && !(suffix === 's' && w.endsWith('ss')))
      return w.slice(0, -suffix.length);
  }
  return w;
}

/** v1's textnorm.content_stems: the normalised, stemmed tokens without stopwords (and any extra ones), in order. */
export function contentStems(text: string, extraStopwords: ReadonlySet<string> = new Set()): string[] {
  return normalizeNumbers(tokens(text))
    .filter((t) => !stopwords.has(t) && !extraStopwords.has(t))
    .map(stem);
}

/** v1's answer_bank._stems: a text's content stems, without question scaffolding either. */
export function stemsOf(text: string): Set<string> {
  return new Set(contentStems(text, questionWords));
}

/** Equal stems, or one a prefix of the other once both are 4 letters or more ("manag" / "management"). */
function same(a: string, b: string): boolean {
  return a === b || (Math.min(a.length, b.length) >= 4 && (a.startsWith(b) || b.startsWith(a)));
}

/** The share of the phrasing's stems the question contains. */
export function coverage(question: Set<string>, phrasing: Set<string>): number {
  if (phrasing.size === 0) return 0;
  let covered = 0;
  for (const p of phrasing) if ([...question].some((q) => same(p, q))) covered += 1;
  return covered / phrasing.size;
}

/** The F1 of the two stem sets: how much of the phrasing the question covers, against how much of it is about else. */
export function similarity(question: Set<string>, phrasing: Set<string>): number {
  if (question.size === 0 || phrasing.size === 0) return 0;
  const recall = coverage(question, phrasing);
  if (!recall) return 0;
  let precise = 0;
  for (const q of question) if ([...phrasing].some((p) => same(p, q))) precise += 1;
  const precision = precise / question.size;
  return (2 * recall * precision) / (recall + precision);
}

function score(question: Set<string>, phrasing: Set<string>): number {
  return coverage(question, phrasing) >= minCoverage ? similarity(question, phrasing) : 0;
}

const key = (stems: Set<string>) => [...stems].sort().join(' ');

/**
 * The whole question, each sentence, and the last two sentences: so context given first ("we're a payments company…
 * so, tell me about yourself") doesn't drown the question itself.
 */
function candidates(question: string): Set<string>[] {
  const sentences = (question.match(/[^.?!]+[.?!]?/g) ?? []).map((s) => s.trim()).filter(Boolean);
  const texts = [question, ...sentences];
  if (sentences.length > 2) texts.push(sentences.slice(-2).join(' '));
  const out: Set<string>[] = [];
  const seen = new Set<string>();
  for (const text of texts) {
    const stems = stemsOf(text);
    if (stems.size > 0 && !seen.has(key(stems))) {
      seen.add(key(stems));
      out.push(stems);
    }
  }
  return out;
}

export interface MatchEntry {
  id: string;
  phrasings: string[];
  answer: string;
  enabled: boolean;
}

export interface PreparedMatch {
  id: string;
  /** The phrasing the question matched. */
  phrasing: string;
  answer: string;
  score: number;
}

export type MatchIndex = { entry: MatchEntry; phrasing: string; stems: Set<string> }[];

/** v1's build_index: every phrasing of every enabled entry, its stems made once. */
export function buildIndex(entries: Iterable<MatchEntry>): MatchIndex {
  const index: MatchIndex = [];
  for (const entry of entries) {
    if (!entry.enabled) continue;
    for (const phrasing of entry.phrasings) {
      const stems = stemsOf(phrasing);
      if (stems.size > 0) index.push({ entry, phrasing, stems });
    }
  }
  return index;
}

/** v1's best_match: the prepared answer for the question, or null. Ties keep the earlier entry, in the bank's order. */
export function bestMatch(index: MatchIndex, question: string, threshold = matchThreshold): PreparedMatch | null {
  const asked = candidates(question ?? '');
  let best: MatchIndex[number] | null = null;
  let bestScore = 0;
  for (const item of index) {
    const s = Math.max(0, ...asked.map((c) => score(c, item.stems)));
    if (s > bestScore) {
      best = item;
      bestScore = s;
    }
  }
  if (!best || bestScore < threshold) return null;
  return {
    id: best.entry.id,
    phrasing: best.phrasing,
    answer: best.entry.answer,
    score: Math.round(bestScore * 100) / 100,
  };
}
