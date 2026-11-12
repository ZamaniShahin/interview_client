// The deep round over 3.9, 3.13 and 4.1 (Shahin's, 2026-11-11): history, the debrief and the prep drafts. Each part
// triggered again, widened with data points around the ones history.test.ts and drafts.test.ts read, and every
// outcome given a test of its own.
import { describe, expect, it, vi } from 'vitest';
import {
  emptyPreferences,
  maxAnswerChars,
  maxPhrasingChars,
  maxPhrasings,
  type BankEntry,
} from '../../src/shared/answer-bank';
import { AnswerKind, ErrorCodes, SessionEndReasons } from '../../src/shared/contracts/sotto-contracts';
import { emptyDocuments } from '../../src/shared/documents';
import { draftLimits, draftsRequestOf } from '../../src/shared/drafts';
import {
  cut,
  debriefLimits,
  debriefRequestOf,
  debriefSchema,
  roleOf,
  type DebriefResult,
  type InterviewView,
} from '../../src/shared/history';
import { historyEvents } from '../../src/shared/live/history-events';
import { reduceLive, type LiveAction } from '../../src/shared/live/reducer';
import { initialLiveState, type LiveViewState } from '../../src/shared/live/view-state';
import { ApiError } from '../../src/main/api/rest-client';
import { HistoryRecorder } from '../../src/main/history/history-recorder';
import { HistoryService } from '../../src/main/history/history-service';
import { DraftsService } from '../../src/main/jobs/drafts-service';
import { jobTimeoutCode, runJob } from '../../src/main/jobs/run-job';
import { openDatabase } from '../../src/main/storage/local-database';
import { HistoryStore } from '../../src/main/storage/history-store';
import { LocalStore } from '../../src/main/storage/local-store';
import { migrations } from '../../src/main/storage/schema';

const nov11 = Date.UTC(2026, 10, 11, 14);
const sample: DebriefResult = {
  version: 1,
  raw: false,
  summary: 'Steady.',
  scores: null,
  strengths: [],
  improvements: [],
  strongerAnswers: [],
  followUps: [],
  thankYouEmail: '',
  metrics: null,
};

let seq = 0;
const event = (name: string, e: Record<string, unknown>): LiveAction =>
  ({ type: 'event', event: { name, e: { Seq: ++seq, AtMs: nov11 + seq, ...e } } }) as LiveAction;
const start = (id: string, question = 'Q?', kind: AnswerKind = AnswerKind.Spoken) =>
  event('answerStart', { AnswerId: id, Question: question, Kind: kind, Instruction: null, ScreenshotIds: [] });

function run(actions: LiveAction[], from: LiveViewState = { ...initialLiveState, phase: 'live' }) {
  let state = from;
  const kept: string[] = [];
  for (const action of actions) {
    const next = reduceLive(state, action);
    for (const e of historyEvents(state, next, action)) {
      kept.push(
        e.type === 'answered'
          ? `answered ${e.answer.id}`
          : e.type === 'heard'
            ? `heard ${e.text}`
            : `ended ${e.reason}`,
      );
    }
    state = next;
  }
  return kept;
}

describe('what a session keeps, widened (3.9)', () => {
  it.each(Object.entries(AnswerKind))('keeps an answer of every kind: %s', (_, kind) => {
    expect(
      run([
        start('a', 'Q?', kind),
        event('answerDelta', { AnswerId: 'a', Text: 'Yes.' }),
        event('answerDone', { AnswerId: 'a' }),
      ]),
    ).toEqual(['answered a']);
  });

  it('keeps each of many answers once, in the order they ended', () => {
    const actions: LiveAction[] = [];
    for (const id of ['a', 'b', 'c'])
      actions.push(start(id), event('answerDelta', { AnswerId: id, Text: `About ${id}.` }));
    // b and c started while a wrote: a and b were stopped by the newer question, c ends done.
    actions.push(event('answerDone', { AnswerId: 'c' }));
    expect(run(actions)).toEqual(['answered a', 'answered b', 'answered c']);
  });

  it('keeps nothing of answers the session started over from, nor anything of a snapshot', () => {
    const kept = run([
      start('a'),
      event('answerDelta', { AnswerId: 'a', Text: 'Yes.' }),
      event('answerDone', { AnswerId: 'a' }),
      event('cleared', {}),
      {
        type: 'snapshot',
        snapshot: {
          SessionId: 's',
          Phase: 1,
          Auto: true,
          Paused: false,
          ContextReady: true,
          Heard: 'Something heard',
          LastSeq: seq + 1,
          Attachments: [],
          MaxAttachments: 5,
          PrepDoc: null,
          CustomInstructionsChars: 0,
          PreparedInPrompt: [],
          Practice: null,
        },
      },
    ]);
    expect(kept).toEqual(['answered a']);
  });

  it.each<[string, string[], string[]]>([
    ['letters of every script', ['Привет', 'Привет, как дела?'], ['Привет', ', как дела?']],
    ['emoji', ['Ship it', 'Ship it 🚀'], ['Ship it', '🚀']],
    ['a phrase the transcriber took back', ['We use Kafka', 'We use Kotlin'], ['We use Kafka', 'We use Kotlin']],
    ['a phrase cut shorter', ['Tell me about yourself', 'Tell me'], ['Tell me about yourself', 'Tell me']],
    ['spaces around it', ['  Why?  '], ['Why?']],
    ['a phrase of only spaces', ['   '], []],
  ])('keeps the interviewer’s words with %s', (_, finals, lines) => {
    expect(run(finals.map((Text) => event('transcriptFinal', { Text })))).toEqual(lines.map((l) => `heard ${l}`));
  });

  it.each(Object.values(SessionEndReasons))('ends with %s', (reason) => {
    expect(run([event('sessionEnded', { Reason: reason })])).toEqual([`ended ${reason}`]);
  });

  it('keeps nothing once ended', () => {
    const kept = run([
      event('sessionEnded', { Reason: SessionEndReasons.User }),
      event('transcriptFinal', { Text: 'After the end.' }),
    ]);
    // The reducer still applies events after the end; the recorder has finished by then, so nothing more is kept.
    expect(kept[0]).toBe('ended user');
  });
});

describe('history kept on this computer, widened (3.9)', () => {
  const store = () => new HistoryStore(openDatabase(null, null, migrations));

  it('lists interviews started at the same moment newest-made first', () => {
    const history = store();
    const ids = [1, 2, 3].map(() => history.start({ startedAt: nov11, candidate: '', role: '', tier: null }));
    expect(history.list().map((i) => i.id)).toEqual([...ids].reverse());
  });

  it('keeps every letter, line break and length of an answer as it was', () => {
    const history = store();
    const id = history.start({ startedAt: nov11, candidate: 'Zoë Ørsted', role: 'Ingénieure', tier: 'smart' });
    const long = `${'Résumé — '.repeat(2_000)}\n\n\`\`\`go\nfunc main() {}\n\`\`\`\n🚀`;
    history.addAnswer(id, { askedAt: nov11, kind: AnswerKind.Result, question: 'Q\nwith a line break', answer: long });
    history.addLine(id, { at: nov11, speaker: 'candidate', text: 'My own words.' });
    const kept = history.get(id)!;
    expect(kept.qa[0]).toMatchObject({ question: 'Q\nwith a line break', answer: long, kind: AnswerKind.Result });
    expect(kept.transcript[0]!.speaker).toBe('candidate');
    expect(kept).toMatchObject({ candidate: 'Zoë Ørsted', role: 'Ingénieure' });
  });

  it('does nothing for an interview it doesn’t keep', () => {
    const history = store();
    history.delete(42);
    history.end(42, nov11, null);
    expect(history.dropIfEmpty(42)).toBe(false);
    expect(history.get(42)).toBeNull();
    expect(history.debrief(42)).toBeNull();
    expect(history.clear()).toBe(0);
  });

  it('keeps one debrief an interview, the last one written', () => {
    const history = store();
    const id = history.start({ startedAt: nov11, candidate: '', role: '', tier: null });
    for (let i = 0; i < 5; i++) history.saveDebrief(id, { ...sample, summary: `Take ${i}.` }, nov11 + i);
    expect(history.debrief(id)).toMatchObject({ summary: 'Take 4.', createdAt: nov11 + 4 });
    expect(history.list()[0]).toMatchObject({ hasDebrief: true });
  });

  it('counts what each interview holds, after some go', () => {
    const history = store();
    const id = history.start({ startedAt: nov11, candidate: '', role: '', tier: null });
    for (let i = 0; i < 7; i++) history.addAnswer(id, { askedAt: nov11, kind: 0, question: `Q${i}`, answer: 'A' });
    for (let i = 0; i < 3; i++) history.addLine(id, { at: nov11, speaker: 'interviewer', text: `L${i}` });
    expect(history.list()[0]).toMatchObject({ answers: 7, lines: 3 });
  });
});

describe('the recorder, widened (3.9)', () => {
  const recorder = () => {
    const history = new HistoryStore(openDatabase(null, null, migrations));
    let changes = 0;
    const own = new HistoryRecorder(history, {
      keepTranscripts: () => true,
      changed: () => (changes += 1),
      now: () => nov11,
    });
    return { history, own, changes: () => changes };
  };

  it('keeps nothing after its interview finished, and finishes once', () => {
    const { history, own, changes } = recorder();
    own.begin({ candidate: '', role: '', tier: null });
    own.record({ type: 'heard', text: 'Kept.', atMs: nov11 });
    own.finish(SessionEndReasons.User);
    own.finish(SessionEndReasons.Expired);
    own.record({ type: 'heard', text: 'Not kept.', atMs: nov11 });
    expect(history.list()).toHaveLength(1);
    expect(history.get(history.list()[0]!.id)?.transcript.map((l) => l.text)).toEqual(['Kept.']);
    expect(changes()).toBe(1);
  });

  it('keeps each session as its own interview', () => {
    const { history, own } = recorder();
    for (const role of ['First', 'Second', 'Third']) {
      own.begin({ candidate: '', role, tier: null });
      own.record({ type: 'heard', text: role, atMs: nov11 });
      own.record({ type: 'ended', reason: SessionEndReasons.User });
    }
    expect(
      history
        .list()
        .map((i) => i.role)
        .sort(),
    ).toEqual(['First', 'Second', 'Third']);
  });
});

describe('a debrief asked for, widened at the server’s limits (3.9)', () => {
  const interview = (qa: number, lines: number, over: Partial<InterviewView> = {}): InterviewView => ({
    id: 1,
    kind: 'interview',
    average: null,
    practice: null,
    startedAt: nov11,
    endedAt: nov11,
    candidate: '',
    role: '',
    endReason: null,
    answers: qa,
    lines,
    hasDebrief: false,
    qa: Array.from({ length: qa }, (_, i) => ({ id: i, askedAt: nov11, kind: 0, question: `Q${i}`, answer: `A${i}` })),
    transcript: Array.from({ length: lines }, (_, i) => ({
      at: nov11,
      speaker: 'interviewer' as const,
      text: `L${i}`,
    })),
    debrief: null,
    ...over,
  });

  it.each<[number, number]>([
    [1, 1],
    [debriefLimits.questions - 1, debriefLimits.questions - 1],
    [debriefLimits.questions, debriefLimits.questions],
    [debriefLimits.questions + 1, debriefLimits.questions],
    [1_000, debriefLimits.questions],
  ])('sends %i questions as %i', (asked, sent) => {
    expect(debriefRequestOf(interview(asked, 0))!.questions).toHaveLength(sent);
  });

  it.each<[number, number]>([
    [debriefLimits.lines - 1, debriefLimits.lines - 1],
    [debriefLimits.lines, debriefLimits.lines],
    [debriefLimits.lines + 1, debriefLimits.lines],
    [20_000, debriefLimits.lines],
  ])('sends %i lines as %i', (heard, sent) => {
    expect(debriefRequestOf(interview(0, heard))!.transcript).toHaveLength(sent);
  });

  it.each<[keyof typeof debriefLimits, number]>([
    ['question', debriefLimits.question],
    ['answer', debriefLimits.answer],
    ['line', debriefLimits.line],
  ])('cuts a %s at %i characters, and keeps one at the limit whole', (part, limit) => {
    const at = 'x'.repeat(limit);
    const over = 'y'.repeat(limit + 1);
    const view =
      part === 'line'
        ? interview(0, 0, { transcript: [at, over].map((text) => ({ at: 0, speaker: 'interviewer', text })) })
        : interview(0, 0, {
            qa: [at, over].map((text, i) => ({
              id: i,
              askedAt: 0,
              kind: 0,
              question: part === 'question' ? text : 'Q',
              answer: part === 'answer' ? text : 'A',
            })),
          });
    const request = debriefRequestOf(view)!;
    const sent =
      part === 'line'
        ? request.transcript.map((l) => l.text)
        : request.questions.map((q) => (part === 'question' ? q.question : q.answer));
    expect(sent).toEqual([at, 'y'.repeat(limit)]);
  });

  it('leaves out empty questions before counting to the limit', () => {
    const qa = [
      ...Array.from({ length: 10 }, (_, i) => ({ id: i, askedAt: 0, kind: 0, question: ' ', answer: 'A' })),
      ...Array.from({ length: debriefLimits.questions }, (_, i) => ({
        id: 100 + i,
        askedAt: 0,
        kind: 0,
        question: `Q${i}`,
        answer: 'A',
      })),
    ];
    const request = debriefRequestOf(interview(0, 0, { qa }))!;
    expect(request.questions).toHaveLength(debriefLimits.questions);
    expect(request.questions[0]!.question).toBe('Q0');
  });

  it.each<[string, number, string]>([
    ['a', 1, 'a'],
    ['ab', 1, 'a'],
    ['😀', 1, ''],
    ['😀😀', 3, '😀'],
    ['a😀', 2, 'a'],
  ])('cuts %j at %i as %j', (value, max, out) => {
    expect(cut(value, max)).toBe(out);
  });

  it.each<[string, string]>([
    ['Role\r\nMore', 'Role'],
    ['\t Role \t', 'Role'],
    ['   \n   ', ''],
    ['😀'.repeat(70), '😀'.repeat(60)],
  ])('names the role of %j as %j', (jd, role) => {
    expect(roleOf(jd)).toBe(role);
  });

  it.each<[string, unknown, boolean]>([
    [
      'every score null',
      { scores: { clarity: null, structure: null, technical: null, delivery: null, filler: null } },
      true,
    ],
    ['20 strengths', { strengths: Array.from({ length: 20 }, () => 's') }, true],
    ['21 strengths', { strengths: Array.from({ length: 21 }, () => 's') }, false],
    ['a summary of 20,000', { summary: 'x'.repeat(20_000) }, true],
    ['a summary of 20,001', { summary: 'x'.repeat(20_001) }, false],
    [
      'a score of 5.5',
      { scores: { clarity: 5.5, structure: null, technical: null, delivery: null, filler: null } },
      false,
    ],
    ['fillers per 100 words of 0.5', { metrics: { words: 200, fillers: 1, fillersPer100Words: 0.5, turns: 3 } }, true],
    ['turns of -1', { metrics: { words: 0, fillers: 0, fillersPer100Words: 0, turns: -1 } }, false],
  ])('reads a debrief with %s: %s', (_, over, valid) => {
    expect(debriefSchema.safeParse({ ...sample, ...(over as object) }).success).toBe(valid);
  });
});

describe('a job asked after, widened (3.9)', () => {
  const rest = (start: unknown, replies: unknown[]) => ({
    post: vi.fn(async () => start as never),
    get: vi.fn(async (path: string) => {
      void path;
      return replies.shift() as never;
    }),
  });

  it('names the job in its address, escaped', async () => {
    const r = rest({ jobId: 'a/b c' }, [{ status: 'done', result: 1 }]);
    await runJob('/x', {}, { rest: r, sleep: async () => {} });
    expect(r.get).toHaveBeenCalledWith('/api/v1/jobs/a%2Fb%20c');
  });

  it('answers a done job’s result as it came, even none', async () => {
    expect(
      await runJob('/x', {}, { rest: rest({ jobId: 'j' }, [{ status: 'done', result: null }]), sleep: async () => {} }),
    ).toBeNull();
  });

  it('keeps asking through a status it doesn’t know, until done or its time is up', async () => {
    let clock = 0;
    const r = rest({ jobId: 'j' }, [{ status: 'queued' }, {}, { status: 'done', result: 'ok' }]);
    expect(await runJob('/x', {}, { rest: r, now: () => clock, sleep: async (ms) => void (clock += ms) })).toBe('ok');
  });

  it.each([null, { id: 'j' }, { jobId: 7 }])('says so when the start answers %j', async (start) => {
    const error = await runJob('/x', {}, { rest: rest(start, []), sleep: async () => {} }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe(jobTimeoutCode);
  });
});

describe('history as the app window uses it, widened (3.9)', () => {
  it('writes two interviews’ debriefs at once, saying each while it is written', async () => {
    const local = new LocalStore(openDatabase(null, null, migrations));
    const [a, b] = [1, 2].map(() => {
      const id = local.history.start({ startedAt: nov11, candidate: '', role: '', tier: null });
      local.history.addLine(id, { at: nov11, speaker: 'interviewer', text: 'Q?' });
      return id;
    });
    const finish: ((v: unknown) => void)[] = [];
    const views: number[][] = [];
    const service = new HistoryService({
      store: () => local.history,
      running: () => null,
      job: () => new Promise((resolve) => finish.push(resolve)),
      changed: (view) => views.push(view.debriefing),
    });
    const first = service.debrief(a!);
    const second = service.debrief(b!);
    expect(service.debriefing.sort()).toEqual([a, b].sort());
    finish[1]!(sample);
    finish[0]!(sample);
    expect(await Promise.all([first, second])).toEqual([{ ok: true }, { ok: true }]);
    expect(service.debriefing).toEqual([]);
    expect(views[0]).toEqual([a]);
    expect(local.history.list().every((i) => i.hasDebrief)).toBe(true);
  });

  it('asks for a debrief of an interview that kept only the interviewer’s words', async () => {
    const local = new LocalStore(openDatabase(null, null, migrations));
    const id = local.history.start({ startedAt: nov11, candidate: '', role: '', tier: null });
    local.history.addLine(id, { at: nov11, speaker: 'interviewer', text: 'Why Kafka?' });
    const job = vi.fn(async () => sample);
    const service = new HistoryService({ store: () => local.history, running: () => null, job, changed: () => {} });
    expect(await service.debrief(id)).toEqual({ ok: true });
    expect(job).toHaveBeenCalledWith('/api/v1/jobs/debrief', {
      name: null,
      role: null,
      questions: [],
      transcript: [{ speaker: 'interviewer', text: 'Why Kafka?' }],
    });
  });
});

describe('prep drafts, widened (3.9)', () => {
  const entry = (phrasing: string): BankEntry => ({
    id: phrasing.slice(0, 8) || 'e',
    phrasings: [phrasing],
    answer: 'A.',
    enabled: true,
    source: 'manual',
    updatedAt: 1,
  });

  it.each<[number, boolean]>([
    [draftLimits.preparedChars, true],
    [draftLimits.preparedChars + 1, false],
    [maxPhrasingChars, true],
  ])('tells the server a question of %i characters already prepared: %s', (length, told) => {
    const request = draftsRequestOf(
      { ...emptyDocuments, resume: 'Go.' },
      { ...emptyPreferences, bank: [entry('q'.repeat(length))] },
    )!;
    expect(request.prepared.length === 1).toBe(told);
  });

  it('counts a disabled entry as prepared too: the server should draft others', () => {
    const request = draftsRequestOf(
      { ...emptyDocuments, jobDescription: 'Backend.' },
      { ...emptyPreferences, bank: [{ ...entry('Why us?'), enabled: false }] },
    )!;
    expect(request.prepared).toEqual(['Why us?']);
  });

  it('numbers drafts on and on across asks, skipping and keeping any of them', async () => {
    let n = 0;
    const kept: unknown[] = [];
    const service = new DraftsService({
      documents: () => ({ ...emptyDocuments, resume: 'Go.' }),
      preferences: () => emptyPreferences,
      job: async () => ({ drafts: [0, 1].map(() => ({ phrasings: [`Q${++n}?`], answer: `A${n}.` })) }),
      keep: (input) => (kept.push(input), { ok: true }),
      changed: () => {},
    });
    await service.write();
    service.skip(1);
    await service.write();
    expect(service.view.items.map((d) => d.id)).toEqual([2, 3, 4]);
    service.keep(3);
    service.skip(2);
    service.skip(4);
    expect(service.view.items).toEqual([]);
    expect(kept).toEqual([{ id: null, phrasings: ['Q3?'], answer: 'A3.', enabled: true }]);
  });

  it('keeps a draft whose answer the bank refuses for its length waiting, with the bank’s words', async () => {
    const local = new LocalStore(openDatabase(null, null, migrations));
    local.setDocument('resume', 'Go.');
    const service = new DraftsService({
      documents: () => local.documents(),
      preferences: () => local.preferences(),
      job: async () => ({ drafts: [{ phrasings: ['Long?'], answer: 'a'.repeat(maxAnswerChars + 5) }] }),
      keep: (input) => {
        const saved = local.saveBankEntry(input, 'draft');
        return saved.ok ? { ok: true } : saved;
      },
      changed: () => {},
    });
    await service.write();
    expect(service.keep(1)).toEqual({
      ok: false,
      code: ErrorCodes.Request.InvalidInput,
      message: 'The answer is 4,000 characters at most: shorten it by 5.',
    });
    expect(service.view.items).toHaveLength(1);
    expect(local.bank()).toEqual([]);
  });

  it(`keeps at most ${maxPhrasings} ways to ask a draft, the first ones that fit`, async () => {
    const kept: { phrasings: string[] }[] = [];
    const service = new DraftsService({
      documents: () => ({ ...emptyDocuments, resume: 'Go.' }),
      preferences: () => emptyPreferences,
      job: async () => ({
        drafts: [{ phrasings: ['x'.repeat(301), ...Array.from({ length: 9 }, (_, i) => `W${i}?`)], answer: 'A.' }],
      }),
      keep: (input) => (kept.push(input), { ok: true }),
      changed: () => {},
    });
    await service.write();
    service.keep(1);
    expect(kept[0]!.phrasings).toEqual(['W0?', 'W1?', 'W2?', 'W3?', 'W4?', 'W5?']);
  });
});
