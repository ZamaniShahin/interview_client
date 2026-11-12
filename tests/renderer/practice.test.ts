// @vitest-environment happy-dom
// The Practice page (Shahin, 2026-11-12, with the server's 3.3): starting a practice, answering by typing, the score
// and feedback, the summary and what comes after it; and practice in History (Q22, Q24): practices listed and opened
// with each answer's feedback, their two lowest retried, and any interviewer's question practised on its own.
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppApi } from '../../src/preload/api';
import { emptyPreferences, type BankEntry } from '../../src/shared/answer-bank';
import { initialAppState, type AppState } from '../../src/shared/app-state';
import {
  AnswerKind,
  PracticeDifficulty,
  PracticeFocus,
  PracticeQuestionSource,
  PracticeState,
  PracticeTurnKind,
  SessionEndReasons,
} from '../../src/shared/contracts/sotto-contracts';
import type { InterviewSummary, InterviewView } from '../../src/shared/history';
import {
  idlePractice,
  type PracticeStatusView,
  type PracticeSummaryView,
  type PracticeTurnView,
  type PracticeView,
} from '../../src/shared/practice';
import { useAppStore } from '../../src/renderer/app/app-store';
import HistoryPage from '../../src/renderer/app/pages/HistoryPage.vue';
import PracticePage from '../../src/renderer/app/pages/PracticePage.vue';
import { fakeAppApi } from './fake-app-api';

enableAutoUnmount(afterEach);

const withDocuments: AppState['documents'] = {
  ...initialAppState.documents,
  resume: 'Go, Kafka and ledgers.',
};

const bankEntry = (id: string, enabled = true): BankEntry => ({
  id,
  phrasings: [`Question ${id}`],
  answer: `Answer ${id}`,
  enabled,
  source: 'manual',
  updatedAt: 1,
});

/** The Practice page over main's state, with `view` as the practice main last sent. */
async function practicePage(
  view: PracticeView = idlePractice,
  state: Partial<AppState> = {},
  overrides: Partial<AppApi> = {},
) {
  setActivePinia(createPinia());
  const fake = fakeAppApi({ ...initialAppState, documents: withDocuments, ...state }, overrides);
  window.appApi = fake.api;
  const store = useAppStore();
  await store.load();
  fake.practice(view);
  const wrapper = mount(PracticePage);
  await flushPromises();
  return { wrapper, store, ...fake };
}

const button = (wrapper: ReturnType<typeof mount>, text: string) =>
  wrapper.findAll('button').find((b) => b.text() === text);

const status = (over: Partial<PracticeStatusView> = {}): PracticeStatusView => ({
  state: PracticeState.Answering,
  n: 1,
  mainN: 1,
  total: 3,
  focus: PracticeFocus.Mixed,
  difficulty: PracticeDifficulty.Medium,
  last: false,
  question: 'Why payments?',
  error: null,
  ...over,
});

const turn = (over: Partial<PracticeTurnView> = {}): PracticeTurnView => ({
  n: 1,
  mainN: 1,
  total: 3,
  kind: PracticeTurnKind.Main,
  question: 'Why payments?',
  source: PracticeQuestionSource.Model,
  difficulty: PracticeDifficulty.Medium,
  answer: null,
  feedback: null,
  ...over,
});

const live = (over: Partial<PracticeView> = {}): PracticeView => ({
  ...idlePractice,
  phase: 'live',
  status: status(),
  turns: [turn()],
  ...over,
});

const feedback = {
  score: 7,
  good: ['You named the result.'],
  improve: ['Put a number on it.'],
  modelAnswer: 'At Northwind I cut failed payments by 40%.',
  prepared: 'My own prepared answer.',
  raw: false,
};

const summary = (over: Partial<PracticeSummaryView> = {}): PracticeSummaryView => ({
  asked: 3,
  answered: 2,
  average: 6.5,
  turns: [
    { n: 1, kind: PracticeTurnKind.Main, question: 'Why payments?', source: 0, score: 8, answered: true },
    { n: 2, kind: PracticeTurnKind.Main, question: 'Tell me about a failure.', source: 0, score: 5, answered: true },
    { n: 3, kind: PracticeTurnKind.FollowUp, question: 'Make it concrete?', source: 0, score: null, answered: false },
  ],
  best: 1,
  worst: 2,
  talkSeconds: 0,
  wpm: null,
  fillers: 0,
  fillersPer100Words: null,
  focus: PracticeFocus.Behavioral,
  difficulty: PracticeDifficulty.Medium,
  tips: ['Put a number on it.', 'Start with the situation.'],
  ...over,
});

describe('starting a practice', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('starts five mixed questions by default, written from the documents', async () => {
    const { wrapper, api } = await practicePage();
    expect(wrapper.find('h1').text()).toBe('Practice');
    expect(wrapper.text()).toContain('The questions are written from your résumé and the job description.');
    await button(wrapper, 'Start practice')!.trigger('click');
    expect(api.practice).toHaveBeenCalledWith({
      type: 'start',
      start: { count: 5, focus: PracticeFocus.Mixed, questions: null },
    });
  });

  it('starts as many questions as chosen, on the focus chosen', async () => {
    const { wrapper, api } = await practicePage();
    await wrapper.find('input[type="range"]').setValue('3');
    await button(wrapper, 'Technical')!.trigger('click');
    await button(wrapper, 'Start practice')!.trigger('click');
    expect(api.practice).toHaveBeenCalledWith({
      type: 'start',
      start: { count: 3, focus: PracticeFocus.Technical, questions: null },
    });
  });

  it.each<[number, string, string]>([
    [1, 'Mixed', 'Your prepared answer can come up as one of the questions.'],
    [2, 'Behavioral', 'Your 2 prepared answers can come up: every other question is one of them.'],
    [2, 'Technical', 'Your prepared answers are left out of a technical practice.'],
  ])('says what %i prepared answers do on a %s practice', async (enabled, focus, words) => {
    const bank = [...Array.from({ length: enabled }, (_, i) => bankEntry(`e${i}`)), bankEntry('off', false)];
    const { wrapper } = await practicePage(idlePractice, { preferences: { ...emptyPreferences, bank } });
    if (focus !== 'Mixed') await button(wrapper, focus)!.trigger('click');
    expect(wrapper.text()).toContain(words);
  });

  it('waits for the résumé or the job description, and leads to Prepare', async () => {
    const { wrapper, store } = await practicePage(idlePractice, { documents: initialAppState.documents });
    expect(button(wrapper, 'Start practice')!.attributes('disabled')).toBeDefined();
    expect(wrapper.text()).toContain('Add your résumé or the job description in Prepare first');
    await button(wrapper, 'Open Prepare')!.trigger('click');
    expect(store.page).toBe('prepare');
  });

  it('starts with the job description alone too', async () => {
    const { wrapper } = await practicePage(idlePractice, {
      documents: { ...initialAppState.documents, jobDescription: 'Senior Backend Engineer' },
    });
    expect(button(wrapper, 'Start practice')!.attributes('disabled')).toBeUndefined();
  });

  it('says why it could not start', async () => {
    const { wrapper } = await practicePage({
      ...idlePractice,
      problem: { code: 'no_entitlement', message: "Your plan doesn't include practice interviews." },
    });
    expect(wrapper.find('[role="alert"]').text()).toBe("Your plan doesn't include practice interviews.");
  });
});

describe('a practice running', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('says the first question is being written while it starts, and lets nothing be stopped yet', async () => {
    const { wrapper } = await practicePage({ ...idlePractice, phase: 'starting' });
    expect(wrapper.find('[role="status"]').text()).toBe('Writing the first question…');
    expect(button(wrapper, 'Stop practice')!.attributes('disabled')).toBeDefined();
  });

  it('shows the question, where it is, and sends what was typed', async () => {
    const { wrapper, api } = await practicePage(live());
    expect(wrapper.text()).toContain('Question 1 of 3');
    expect(wrapper.text()).toContain('Medium');
    expect(wrapper.find('h2.question').text()).toBe('Why payments?');
    expect(wrapper.find('article').text()).toContain('Written for you');
    expect(button(wrapper, 'Send answer')!.attributes('disabled')).toBeDefined();

    await wrapper.find('textarea').setValue('Because payments have to add up.');
    await button(wrapper, 'Send answer')!.trigger('click');
    expect(api.practice).toHaveBeenCalledWith({ type: 'answer', text: 'Because payments have to add up.' });
  });

  it('sends with Ctrl+Enter, and never an empty answer', async () => {
    const { wrapper, api } = await practicePage(live());
    await wrapper.find('textarea').setValue('   ');
    await wrapper.find('textarea').trigger('keydown', { key: 'Enter', ctrlKey: true });
    expect(api.practice).not.toHaveBeenCalled();
    await wrapper.find('textarea').setValue('Ledgers.');
    await wrapper.find('textarea').trigger('keydown', { key: 'Enter', ctrlKey: true });
    expect(api.practice).toHaveBeenCalledWith({ type: 'answer', text: 'Ledgers.' });
  });

  it('says what the server said of an answer, and what refused it', async () => {
    const refused = vi.fn<AppApi['practice']>(async () => ({
      ok: false,
      code: 'not_in_session',
      message: 'No practice is running.',
    }));
    const { wrapper } = await practicePage(
      live({ status: status({ error: "I didn't catch an answer yet: say it out loud, or type it." }) }),
      {},
      { practice: refused },
    );
    expect(wrapper.text()).toContain("I didn't catch an answer yet: say it out loud, or type it.");
    await wrapper.find('textarea').setValue('Again.');
    await button(wrapper, 'Send answer')!.trigger('click');
    await flushPromises();
    expect(wrapper.findAll('[role="alert"]').map((a) => a.text())).toContain('No practice is running.');
  });

  it('says when only the start of a long answer is scored', async () => {
    const { wrapper } = await practicePage(live());
    await wrapper.find('textarea').setValue('a'.repeat(6_001));
    expect(wrapper.text()).toContain('Only the first 6,000 characters are scored.');
  });

  it('shows the answer sent while it is scored', async () => {
    const { wrapper, practice } = await practicePage(live());
    await wrapper.find('textarea').setValue('My answer.');
    practice(live({ status: status({ state: PracticeState.Scoring }) }));
    await flushPromises();
    expect(wrapper.find('.sent').text()).toBe('My answer.');
    expect(wrapper.find('[role="status"]').text()).toBe('Scoring your answer…');
  });

  it("shows the answer's score and feedback, then the next question", async () => {
    const { wrapper, api } = await practicePage(
      live({ status: status({ state: PracticeState.Feedback }), turns: [turn({ answer: 'My answer.', feedback })] }),
    );
    const section = wrapper.find('section[aria-label="Feedback"]');
    expect(section.find('.value').text()).toBe('7');
    expect(section.text()).toContain('/ 10');
    expect(section.text()).toContain('GoodYou named the result.');
    expect(section.text()).toContain('To improvePut a number on it.');
    expect(section.text()).toContain('A stronger answerAt Northwind I cut failed payments by 40%.');
    expect(section.text()).toContain('Your prepared answerMy own prepared answer.');
    expect(wrapper.find('.answered').text()).toContain('My answer.');
    await button(wrapper, 'Next question')!.trigger('click');
    expect(api.practice).toHaveBeenCalledWith({ type: 'next' });
  });

  it('offers the results after the last answer, not a next question', async () => {
    const { wrapper } = await practicePage(
      live({
        status: status({ state: PracticeState.Feedback, last: true }),
        turns: [turn({ answer: 'A.', feedback })],
      }),
    );
    expect(button(wrapper, 'See the results')).toBeDefined();
    expect(button(wrapper, 'Next question')).toBeUndefined();
  });

  it('draws a feedback with no score, and one the scorer gave in prose', async () => {
    const { wrapper } = await practicePage(
      live({
        status: status({ state: PracticeState.Feedback }),
        turns: [turn({ answer: 'A.', feedback: { ...feedback, score: null, good: [], raw: true, prepared: '' } })],
      }),
    );
    const section = wrapper.find('section[aria-label="Feedback"]');
    expect(section.text()).toContain('No score this time.');
    expect(section.text()).toContain('What the scorer said');
    expect(section.text()).not.toContain('Good');
    expect(section.text()).not.toContain('Your prepared answer');
  });

  it('names a follow-up, and empties the box for each new question', async () => {
    const { wrapper, practice } = await practicePage(live());
    await wrapper.find('textarea').setValue('Draft for the first.');
    practice(
      live({
        status: status({ n: 2 }),
        turns: [
          turn({ answer: 'A.', feedback }),
          turn({ n: 2, kind: PracticeTurnKind.FollowUp, question: 'Make it concrete?' }),
        ],
      }),
    );
    await flushPromises();
    expect(wrapper.text()).toContain('Follow-up to question 1');
    expect(wrapper.findAll('.tag').map((t) => t.text())).toContain('Follow-up');
    expect((wrapper.find('textarea').element as HTMLTextAreaElement).value).toBe('');
  });

  it('says the next question is being written, and offers to try again when it failed', async () => {
    const { wrapper, api, practice } = await practicePage(
      live({ status: status({ state: PracticeState.Preparing }), turns: [turn({ answer: 'A.', feedback })] }),
    );
    expect(wrapper.find('[role="status"]').text()).toBe('Writing the next question…');
    practice(live({ status: status({ state: PracticeState.Preparing, error: "Couldn't write the next question." }) }));
    await flushPromises();
    expect(wrapper.find('[role="alert"]').text()).toBe("Couldn't write the next question.");
    await button(wrapper, 'Try again')!.trigger('click');
    expect(api.practice).toHaveBeenCalledWith({ type: 'next' });
  });

  it('says the session is about to end, and the minutes left', async () => {
    const { wrapper } = await practicePage(
      live({ ending: { reason: SessionEndReasons.Inactive, secondsLeft: 60 }, minutesLeft: 41 }),
    );
    expect(wrapper.text()).toContain(
      'Nothing happened for a while. The session ends in a minute. Send your answer to keep going.',
    );
    expect(wrapper.text()).toContain('41 min left');
  });

  it('stops when asked', async () => {
    const { wrapper, api } = await practicePage(live());
    await button(wrapper, 'Stop practice')!.trigger('click');
    expect(api.practice).toHaveBeenCalledWith({ type: 'stop' });
  });
});

describe('a practice over', () => {
  beforeEach(() => setActivePinia(createPinia()));

  const done = (over: Partial<PracticeView> = {}): PracticeView => ({
    ...idlePractice,
    phase: 'done',
    summary: summary(),
    historyId: 41,
    ...over,
  });

  it('shows the average, each question with its score, the best and the lowest, and what to work on', async () => {
    const { wrapper } = await practicePage(done());
    expect(wrapper.find('.result .value').text()).toBe('6.5');
    expect(wrapper.find('.result').text()).toContain('2 of 3 questions answered · Behavioral · ended on medium');
    const rows = wrapper.findAll('ol[aria-label="Questions"] > li');
    expect(rows.map((r) => r.find('.score').text())).toEqual(['8', '5', 'Not answered']);
    expect(rows[0]!.text()).toContain('Best');
    expect(rows[1]!.text()).toContain('Lowest');
    expect(rows[2]!.text()).toContain('Follow-up');
    expect(wrapper.find('.tips').text()).toContain('Put a number on it.');
  });

  it('retries the two lowest, on the same focus', async () => {
    const { wrapper, api } = await practicePage(
      done({
        summary: summary({
          turns: [
            { n: 1, kind: 0, question: 'Strong one', source: 0, score: 9, answered: true },
            { n: 2, kind: 0, question: 'Weak one', source: 0, score: 3, answered: true },
            { n: 3, kind: 0, question: 'Middling one', source: 0, score: 5, answered: true },
          ],
        }),
      }),
    );
    await button(wrapper, 'Retry the 2 lowest')!.trigger('click');
    expect(api.practice).toHaveBeenCalledWith({
      type: 'start',
      start: { count: 2, focus: PracticeFocus.Behavioral, questions: ['Weak one', 'Middling one'] },
    });
  });

  it('offers no retry with fewer than two scored answers', async () => {
    const { wrapper } = await practicePage(
      done({ summary: summary({ turns: [{ n: 1, kind: 0, question: 'Only', source: 0, score: 6, answered: true }] }) }),
    );
    expect(button(wrapper, 'Retry the 2 lowest')).toBeUndefined();
    expect(button(wrapper, 'Practice again')!.classes()).toContain('primary');
  });

  it('goes back to the setup, or to the practice in History', async () => {
    const { wrapper, api, store } = await practicePage(done());
    await button(wrapper, 'Practice again')!.trigger('click');
    expect(api.practice).toHaveBeenCalledWith({ type: 'close' });
    await button(wrapper, 'See it in History')!.trigger('click');
    expect(store.page).toBe('history');
    expect(store.historyToOpen).toBe(41);
  });

  it('says a practice ended before its summary, and why', async () => {
    const { wrapper } = await practicePage(
      done({
        summary: null,
        historyId: null,
        turns: [turn({ answer: 'A.', feedback })],
        problem: { code: SessionEndReasons.CreditExhausted, message: 'The session ended: no minutes left.' },
      }),
    );
    expect(wrapper.find('[role="alert"]').text()).toBe('The session ended: no minutes left.');
    expect(wrapper.text()).toContain(
      'The practice ended before its summary. 1 answer and their feedback are kept in History.',
    );
    expect(button(wrapper, 'See it in History')).toBeUndefined();
  });
});

// ---- Practice in History ----------------------------------------------------------------------------------------

const start = Date.UTC(2026, 10, 12, 9);

const listed = (over: Partial<InterviewSummary> = {}): InterviewSummary => ({
  id: 7,
  kind: 'practice',
  startedAt: start,
  endedAt: start + 9 * 60_000,
  candidate: 'Sam Rivera',
  role: 'Senior Backend Engineer',
  endReason: SessionEndReasons.User,
  answers: 2,
  lines: 0,
  hasDebrief: false,
  average: 6.5,
  ...over,
});

const opened = (over: Partial<InterviewView> = {}): InterviewView => ({
  ...listed(),
  qa: [],
  transcript: [],
  debrief: null,
  practice: {
    focus: PracticeFocus.Behavioral,
    turns: [
      turn({ answer: 'Because ledgers.', feedback: { ...feedback, score: 8 } }),
      turn({
        n: 2,
        mainN: 2,
        question: 'Tell me about a failure.',
        answer: 'One deploy.',
        feedback: { ...feedback, score: 4 },
      }),
      turn({
        n: 3,
        mainN: 2,
        kind: PracticeTurnKind.FollowUp,
        question: 'Make it concrete?',
        answer: null,
        feedback: null,
      }),
    ],
    summary: summary(),
  },
  ...over,
});

async function historyPage(history: InterviewSummary[], open: InterviewView | null, state: Partial<AppState> = {}) {
  setActivePinia(createPinia());
  const fake = fakeAppApi(
    { ...initialAppState, history, ...state },
    { openInterview: vi.fn<AppApi['openInterview']>(async () => open) },
  );
  window.appApi = fake.api;
  const store = useAppStore();
  await store.load();
  return {
    store,
    ...fake,
    mount: async () => {
      const wrapper = mount(HistoryPage);
      await flushPromises();
      return wrapper;
    },
  };
}

describe('practice in History (Q22, Q24)', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('lists a practice as one, with what was answered and its average', async () => {
    const h = await historyPage([listed(), listed({ id: 8, role: '', average: null, answers: 1 })], null);
    const rows = (await h.mount()).findAll('ul[aria-label="Interviews"] li');
    expect(rows[0]!.text()).toContain('Practice · Senior Backend Engineer');
    expect(rows[0]!.text()).toContain('2 answered · average 6.5');
    expect(rows[0]!.find('.tag').text()).toBe('Practice');
    expect(rows[1]!.text()).toContain('Practice');
    expect(rows[1]!.text()).toContain('1 answered');
    expect(rows[1]!.text()).not.toContain('average');
  });

  it('opens a practice with its summary, and each question with the answer typed and its feedback', async () => {
    const h = await historyPage([listed()], opened());
    const wrapper = await h.mount();
    await wrapper.find('ul[aria-label="Interviews"] button').trigger('click');
    await flushPromises();
    expect(wrapper.find('.summary').text()).toContain('6.5');
    expect(wrapper.find('.summary').text()).toContain('Put a number on it.');
    const turns = wrapper.findAll('ol[aria-label="Practice questions"] > li');
    expect(turns).toHaveLength(3);
    expect(turns[0]!.find('.eyebrow').text()).toBe('Question 1 · Medium · Written for you');
    expect(turns[0]!.find('.said').text()).toBe('Because ledgers.');
    expect(turns[0]!.find('section[aria-label="Feedback"] .value').text()).toBe('8');
    expect(turns[2]!.find('.eyebrow').text()).toContain('Follow-up to question 2');
    expect(turns[2]!.text()).toContain('Not answered.');
    expect(wrapper.text()).not.toContain('Questions and answers');
  });

  it("retries a practice's two lowest from History, on its focus", async () => {
    const h = await historyPage([listed()], opened({ practice: { ...opened().practice!, summary: null } }));
    const wrapper = await h.mount();
    await wrapper.find('ul[aria-label="Interviews"] button').trigger('click');
    await flushPromises();
    await button(wrapper, 'Retry the 2 lowest')!.trigger('click');
    expect(h.api.practice).toHaveBeenCalledWith({
      type: 'start',
      start: { count: 2, focus: PracticeFocus.Behavioral, questions: ['Tell me about a failure.', 'Why payments?'] },
    });
    expect(h.store.page).toBe('practice');
  });

  it("practises any interviewer's question on its own, and never a tip or a study", async () => {
    const interview = opened({
      kind: 'interview',
      average: null,
      practice: null,
      qa: [
        {
          id: 1,
          askedAt: start,
          kind: AnswerKind.Spoken,
          question: 'How would you shard the ledger?',
          answer: 'By account.',
        },
        { id: 2, askedAt: start, kind: AnswerKind.Typed, question: '  Why Kafka?  ', answer: 'Ordering.' },
        { id: 3, askedAt: start, kind: AnswerKind.Tip, question: 'Shorter', answer: 'Sure.' },
        { id: 4, askedAt: start, kind: AnswerKind.Study, question: 'CAP theorem', answer: 'A long explainer.' },
      ],
    });
    const h = await historyPage([listed({ kind: 'interview', average: null })], interview);
    const wrapper = await h.mount();
    await wrapper.find('ul[aria-label="Interviews"] button').trigger('click');
    await flushPromises();
    const practise = wrapper.findAll('button').filter((b) => b.text() === 'Practice this question');
    expect(practise).toHaveLength(2);
    await practise[1]!.trigger('click');
    expect(h.api.practice).toHaveBeenCalledWith({
      type: 'start',
      start: { count: 1, focus: PracticeFocus.Mixed, questions: ['Why Kafka?'] },
    });
    expect(h.store.page).toBe('practice');
    expect(wrapper.text()).not.toContain('Practice questions');
  });

  it('opens what another page sent it to, once', async () => {
    const h = await historyPage([listed()], opened());
    h.store.historyToOpen = 7;
    const wrapper = await h.mount();
    expect(h.api.openInterview).toHaveBeenCalledWith(7);
    expect(h.store.historyToOpen).toBeNull();
    expect(wrapper.findAll('ol[aria-label="Practice questions"] > li')).toHaveLength(3);
  });
});
