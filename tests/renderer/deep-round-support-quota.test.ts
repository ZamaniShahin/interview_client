// @vitest-environment happy-dom
// The deep round of 2026-11-14 over what the windows show of that day's work: History's words for every way a session
// ends, support's among them (decisions §32), and the Practice page's for every way a start is refused, the trial's
// used-up practice among them (backend Q48).
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, describe, expect, it } from 'vitest';
import { initialAppState, type AppState } from '../../src/shared/app-state';
import { ErrorCodes, SessionEndReasons } from '../../src/shared/contracts/sotto-contracts';
import type { InterviewSummary } from '../../src/shared/history';
import { idlePractice, type PracticeView } from '../../src/shared/practice';
import { endedText } from '../../src/shared/live/copy';
import { useAppStore } from '../../src/renderer/app/app-store';
import HistoryPage from '../../src/renderer/app/pages/HistoryPage.vue';
import PracticePage from '../../src/renderer/app/pages/PracticePage.vue';
import { fakeAppApi } from './fake-app-api';

enableAutoUnmount(afterEach);

const start = new Date(2026, 10, 14, 14, 5).getTime();

const summary = (over: Partial<InterviewSummary> = {}): InterviewSummary => ({
  id: 1,
  kind: 'interview',
  average: null,
  startedAt: start,
  endedAt: start + 32 * 60_000,
  candidate: 'Sam Rivera',
  role: 'Senior Backend Engineer, Payments',
  endReason: SessionEndReasons.User,
  answers: 2,
  lines: 0,
  hasDebrief: false,
  ...over,
});

async function history(items: InterviewSummary[]) {
  setActivePinia(createPinia());
  const fake = fakeAppApi({ ...initialAppState, history: items });
  window.appApi = fake.api;
  await useAppStore().load();
  const wrapper = mount(HistoryPage);
  await flushPromises();
  return wrapper;
}

/** History's words for each ending; a session the user ended needs none. */
const historyWords: Record<string, string | null> = {
  [SessionEndReasons.User]: null,
  [SessionEndReasons.CreditExhausted]: 'ended when the minutes ran out',
  [SessionEndReasons.MaxLength]: 'ended at the longest a session runs',
  [SessionEndReasons.Inactive]: 'ended after a quiet spell',
  [SessionEndReasons.OpenedElsewhere]: 'moved to another computer',
  [SessionEndReasons.CostLimit]: "ended at the session's limit",
  [SessionEndReasons.Expired]: 'ended when the connection was lost',
  [SessionEndReasons.Suspended]: 'ended when the account was suspended',
  [SessionEndReasons.Support]: 'ended by support',
};
const allWords = Object.values(historyWords).filter((w): w is string => w !== null);

describe('History, for every way a session ends', () => {
  it('has words for every reason the contract has, and no two alike', () => {
    expect(Object.keys(historyWords).sort()).toEqual(Object.values(SessionEndReasons).sort());
    expect(new Set(allWords).size).toBe(allWords.length);
  });

  it.each(Object.entries(historyWords))('words an interview that ended as %s', async (reason, words) => {
    const wrapper = await history([summary({ endReason: reason })]);
    const row = wrapper.find('ul[aria-label="Interviews"] li').text();

    for (const other of allWords.filter((w) => w !== words)) expect(row).not.toContain(other);
    if (words) expect(row).toContain(words);
    expect(row).toContain('32 min');
  });

  it.each<[string, string | null]>([
    ['a reason a newer server sends', 'paused_forever'],
    ['no reason', null],
  ])('words nothing of an ending for %s, and lists the interview all the same', async (_, reason) => {
    const wrapper = await history([summary({ endReason: reason as InterviewSummary['endReason'] })]);
    const row = wrapper.find('ul[aria-label="Interviews"] li').text();

    for (const words of allWords) expect(row).not.toContain(words);
    expect(row).toContain('Senior Backend Engineer, Payments');
    expect(endedText(reason)).toBe('Session ended.');
  });

  it("tells support's ending from a suspension's, in History and in the overlay", async () => {
    const wrapper = await history([
      summary({ id: 2, endReason: SessionEndReasons.Support }),
      summary({ id: 1, endReason: SessionEndReasons.Suspended }),
    ]);
    const rows = wrapper.findAll('ul[aria-label="Interviews"] li').map((r) => r.text());

    expect(rows.some((r) => r.includes('ended by support') && !r.includes('suspended'))).toBe(true);
    expect(rows.some((r) => r.includes('ended when the account was suspended'))).toBe(true);
    expect(endedText(SessionEndReasons.Support)).toContain('You can start another');
    expect(endedText(SessionEndReasons.Suspended)).not.toContain('start another');
  });
});

describe('the Practice page, for every way a start is refused', () => {
  async function practicePage(view: PracticeView) {
    setActivePinia(createPinia());
    const state: Partial<AppState> = {
      documents: { ...initialAppState.documents, resume: 'Go, Kafka and ledgers.' },
    };
    const fake = fakeAppApi({ ...initialAppState, ...state });
    window.appApi = fake.api;
    await useAppStore().load();
    fake.practice(view);
    const wrapper = mount(PracticePage);
    await flushPromises();
    return wrapper;
  }

  it.each<[string, string, string]>([
    [
      "the trial's practice used",
      ErrorCodes.Licensing.QuotaExceeded,
      'The trial includes one practice interview, already used. Choose a plan to practise more.',
    ],
    ['no practice on the plan', ErrorCodes.Licensing.NoEntitlement, "Your plan doesn't include practice interviews."],
    [
      'no documents on the server',
      ErrorCodes.Session.NoContext,
      'Load your résumé or the job description first: practice questions are written from them.',
    ],
    ['a session running', ErrorCodes.Session.AlreadyInSession, 'End the session first.'],
    [
      'a practice still ending',
      ErrorCodes.Session.PracticeRunning,
      'The last practice is still ending. Try again in a moment.',
    ],
    ['signed out', ErrorCodes.Identity.Unauthenticated, 'Sign in first.'],
  ])('says why when %s, and lets it be tried again', async (_, code, message) => {
    const wrapper = await practicePage({ ...idlePractice, problem: { code, message } });

    expect(wrapper.findAll('[role="alert"]').map((a) => a.text())).toEqual([message]);
    const startButton = wrapper.findAll('button').find((b) => b.text() === 'Start practice');
    expect(startButton!.attributes('disabled')).toBeUndefined();
  });

  it('says nothing went wrong when nothing did', async () => {
    const wrapper = await practicePage(idlePractice);
    expect(wrapper.findAll('[role="alert"]')).toHaveLength(0);
  });
});
