// Prep drafts (3.9, the server's 3.4 job): what is asked for, what comes back, and every outcome of writing, keeping
// and skipping them.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  emptyPreferences,
  maxPhrasingChars,
  maxPhrasings,
  type BankEntry,
  type PreferencesView,
} from '../../src/shared/answer-bank';
import { ErrorCodes } from '../../src/shared/contracts/sotto-contracts';
import { emptyDocuments, type DocumentsView } from '../../src/shared/documents';
import { draftCount, draftLimits, draftsRequestOf, draftsResultSchema, type DraftsView } from '../../src/shared/drafts';
import { jobFailureText } from '../../src/shared/jobs';
import { ApiError } from '../../src/main/api/rest-client';
import { DraftsService } from '../../src/main/jobs/drafts-service';
import { openDatabase } from '../../src/main/storage/local-database';
import { LocalStore } from '../../src/main/storage/local-store';
import { migrations } from '../../src/main/storage/schema';

const documents = (over: Partial<DocumentsView> = {}): DocumentsView => ({
  ...emptyDocuments,
  name: 'Sam Rivera',
  resume: 'Go and Kafka.',
  jobDescription: 'Senior Backend Engineer.',
  notes: '',
  ...over,
});

const entry = (phrasings: string[], over: Partial<BankEntry> = {}): BankEntry => ({
  id: 'e',
  phrasings,
  answer: 'A.',
  enabled: true,
  source: 'manual',
  updatedAt: 1,
  ...over,
});

const preferences = (bank: BankEntry[] = []): PreferencesView => ({ ...emptyPreferences, bank });

describe('the drafts asked for (3.9)', () => {
  it('sends the documents, the questions the bank holds, and how many', () => {
    expect(draftsRequestOf(documents(), preferences([entry(['Why us?', 'Why here?']), entry(['Why Go?'])]))).toEqual({
      name: 'Sam Rivera',
      resume: 'Go and Kafka.',
      jobDescription: 'Senior Backend Engineer.',
      notes: null,
      prepared: ['Why us?', 'Why Go?'],
      count: draftCount,
    });
  });

  it.each<[string, Partial<DocumentsView>, boolean]>([
    ['a résumé and a job description', {}, true],
    ['a résumé alone', { jobDescription: '' }, true],
    ['a job description alone', { resume: ' ' }, true],
    ['neither', { resume: '', jobDescription: '\n' }, false],
    ['only a name and notes', { resume: '', jobDescription: '', notes: 'Ask about on-call.' }, false],
  ])('asks with %s: %s', (_, over, asks) => {
    expect(draftsRequestOf(documents(over), preferences()) !== null).toBe(asks);
  });

  it('sends no name or notes it does not have', () => {
    expect(draftsRequestOf(documents({ name: '  ', notes: '' }), preferences())).toMatchObject({
      name: null,
      notes: null,
    });
  });

  it(`sends at most ${draftLimits.prepared} questions already prepared, each within ${draftLimits.preparedChars} characters`, () => {
    const bank = [
      entry(['q'.repeat(draftLimits.preparedChars)]),
      entry(['q'.repeat(draftLimits.preparedChars + 1)]),
      entry(['   ']),
      ...Array.from({ length: 120 }, (_, i) => entry([`Question ${i}?`])),
    ];
    const prepared = draftsRequestOf(documents(), preferences(bank))!.prepared;
    expect(prepared.length).toBeLessThanOrEqual(draftLimits.prepared);
    expect(prepared[0]).toBe('q'.repeat(draftLimits.preparedChars));
    expect(prepared).not.toContain('q'.repeat(draftLimits.preparedChars + 1));
    for (const question of prepared) expect(question.length).toBeLessThanOrEqual(draftLimits.preparedChars);
  });

  it('reads the server’s drafts, and refuses anything else', () => {
    expect(draftsResultSchema.safeParse({ drafts: [] }).success).toBe(true);
    expect(draftsResultSchema.safeParse({ drafts: [{ phrasings: ['Q?'], answer: 'A.' }] }).success).toBe(true);
    for (const bad of [
      null,
      {},
      { drafts: 'none' },
      { drafts: [{ phrasings: [], answer: 'A.' }] },
      { drafts: [{ phrasings: ['Q?'] }] },
      { drafts: [{ phrasings: 'Q?', answer: 'A.' }] },
      { drafts: Array.from({ length: 51 }, () => ({ phrasings: ['Q?'], answer: 'A.' })) },
    ]) {
      expect(draftsResultSchema.safeParse(bad).success).toBe(false);
    }
  });
});

describe('drafts written, kept and skipped (3.9)', () => {
  let views: DraftsView[];
  let kept: unknown[];
  let job: ReturnType<typeof vi.fn<(path: string, body: unknown) => Promise<unknown>>>;
  let keepAnswer: { ok: true } | { ok: false; problem: string };
  let docs: DocumentsView | null;
  let service: DraftsService;

  const drafts = (...questions: string[]) => ({
    drafts: questions.map((q) => ({ phrasings: [q, `${q} (again)`], answer: `About ${q}` })),
  });

  beforeEach(() => {
    views = [];
    kept = [];
    keepAnswer = { ok: true };
    docs = documents();
    job = vi.fn(async () => drafts('Why payments?', 'On call?'));
    service = new DraftsService({
      documents: () => docs,
      preferences: () => preferences([entry(['Why us?'])]),
      job,
      keep: (input) => {
        kept.push(input);
        return keepAnswer;
      },
      changed: (view) => views.push(view),
    });
  });

  it('asks the server, and holds what it wrote, each under an id of its own, saying while it writes', async () => {
    expect(await service.write()).toEqual({ ok: true });
    expect(job).toHaveBeenCalledWith(
      '/api/v1/jobs/prep-drafts',
      expect.objectContaining({ prepared: ['Why us?'], count: draftCount }),
    );
    expect(service.view.items.map((d) => [d.id, d.phrasings[0]])).toEqual([
      [1, 'Why payments?'],
      [2, 'On call?'],
    ]);
    expect(views.map((v) => v.writing)).toEqual([true, false]);
  });

  it('asks for others the next time: the drafts still waiting count as prepared, and the new ones join them', async () => {
    await service.write();
    job.mockResolvedValueOnce(drafts('Why Go?'));
    await service.write();
    expect(job.mock.calls[1]![1]).toMatchObject({ prepared: ['Why us?', 'Why payments?', 'On call?'] });
    expect(service.view.items.map((d) => d.id)).toEqual([1, 2, 3]);
  });

  it('asks once while drafts are being written', async () => {
    let finish: (value: unknown) => void = () => {};
    job.mockImplementationOnce(() => new Promise((resolve) => (finish = resolve)));
    const first = service.write();
    expect(await service.write()).toMatchObject({ ok: false, code: 'drafts_running' });
    finish(drafts('Q?'));
    expect(await first).toEqual({ ok: true });
    expect(job).toHaveBeenCalledTimes(1);
  });

  it('asks nothing without a résumé or a job description, and says what to add', async () => {
    docs = documents({ resume: '', jobDescription: '' });
    expect(await service.write()).toEqual({
      ok: false,
      code: ErrorCodes.Field.Required,
      message: 'Add your résumé or the job description first: the drafts are written from them.',
    });
    expect(job).not.toHaveBeenCalled();
  });

  it('asks nothing while the documents cannot be read', async () => {
    docs = null;
    expect(await service.write()).toMatchObject({ ok: false, code: ErrorCodes.Request.Unavailable });
  });

  it('leaves out a draft with no question or no answer', async () => {
    job.mockResolvedValueOnce({
      drafts: [
        { phrasings: ['  '], answer: 'An answer.' },
        { phrasings: ['A question?'], answer: ' ' },
        { phrasings: [' Kept? ', ''], answer: ' Kept. ' },
      ],
    });
    await service.write();
    expect(service.view.items).toEqual([{ id: 1, phrasings: ['Kept?'], answer: 'Kept.' }]);
  });

  it.each([
    ErrorCodes.Licensing.QuotaExceeded,
    ErrorCodes.Licensing.NoEntitlement,
    ErrorCodes.Ai.ProviderUnavailable,
    'job_timeout',
  ])('words a job that failed with %s, and holds nothing new', async (code) => {
    job.mockRejectedValueOnce(new ApiError(503, code, 'x'));
    expect(await service.write()).toEqual({ ok: false, code, message: jobFailureText('drafts', code) });
    expect(service.view).toEqual({ writing: false, items: [] });
  });

  it('holds nothing it cannot read', async () => {
    job.mockResolvedValueOnce({ drafts: 'none' });
    expect(await service.write()).toMatchObject({ ok: false, code: ErrorCodes.Request.Internal });
    expect(service.view.items).toEqual([]);
  });

  it('keeps a draft in the bank as written, enabled, then lets it go', async () => {
    await service.write();
    expect(service.keep(1)).toEqual({ ok: true });
    expect(kept).toEqual([
      { id: null, phrasings: ['Why payments?', 'Why payments? (again)'], answer: 'About Why payments?', enabled: true },
    ]);
    expect(service.view.items.map((d) => d.id)).toEqual([2]);
  });

  it(`keeps the first ${maxPhrasings} ways to ask it that fit the bank, ${maxPhrasingChars} characters each`, async () => {
    job.mockResolvedValueOnce({
      drafts: [
        {
          phrasings: ['First?', 'x'.repeat(maxPhrasingChars + 1), ...Array.from({ length: 8 }, (_, i) => `Way ${i}?`)],
          answer: 'A.',
        },
      ],
    });
    await service.write();
    service.keep(1);
    const input = kept[0] as { phrasings: string[] };
    expect(input.phrasings).toHaveLength(maxPhrasings);
    expect(input.phrasings[0]).toBe('First?');
    expect(input.phrasings).not.toContain('x'.repeat(maxPhrasingChars + 1));
  });

  it('keeps a draft the bank refuses waiting, with the bank’s words', async () => {
    await service.write();
    keepAnswer = { ok: false, problem: 'The answer bank is full (100 answers): delete one first.' };
    expect(service.keep(1)).toEqual({
      ok: false,
      code: ErrorCodes.Request.InvalidInput,
      message: 'The answer bank is full (100 answers): delete one first.',
    });
    expect(service.view.items.map((d) => d.id)).toEqual([1, 2]);
  });

  it('skips a draft, and says when a draft is no longer there', async () => {
    await service.write();
    expect(service.skip(2)).toEqual({ ok: true });
    expect(service.view.items.map((d) => d.id)).toEqual([1]);
    expect(service.skip(2)).toMatchObject({ ok: false, code: ErrorCodes.Request.NotFound });
    expect(service.keep(2)).toMatchObject({ ok: false, code: ErrorCodes.Request.NotFound });
    expect(kept).toEqual([]);
  });

  it('keeps a draft in the bank on this computer, marked as drafted', async () => {
    const local = new LocalStore(openDatabase(null, null, migrations));
    const own = new DraftsService({
      documents: () => local.documents(),
      preferences: () => local.preferences(),
      job: async () => drafts('Why payments?'),
      keep: (input) => {
        const saved = local.saveBankEntry(input, 'draft');
        return saved.ok ? { ok: true } : saved;
      },
      changed: () => {},
    });
    local.setDocument('resume', 'Go and Kafka.');
    await own.write();
    expect(own.keep(1)).toEqual({ ok: true });
    expect(local.bank()).toMatchObject([
      { phrasings: ['Why payments?', 'Why payments? (again)'], source: 'draft', enabled: true },
    ]);
  });
});
