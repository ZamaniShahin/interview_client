// @vitest-environment happy-dom
// The History page (3.9): the interviews kept on this computer, one opened whole, its debrief asked for and shown,
// and deleting, one or all, each after a confirmation drawn in place.
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppApi } from '../../src/preload/api';
import { initialAppState } from '../../src/shared/app-state';
import { AnswerKind, SessionEndReasons } from '../../src/shared/contracts/sotto-contracts';
import type { DebriefView as Debrief, InterviewSummary, InterviewView } from '../../src/shared/history';
import { useAppStore } from '../../src/renderer/app/app-store';
import DebriefView from '../../src/renderer/app/components/DebriefView.vue';
import HistoryPage from '../../src/renderer/app/pages/HistoryPage.vue';
import { fakeAppApi } from './fake-app-api';

enableAutoUnmount(afterEach);

const start = new Date(2026, 10, 11, 14, 5).getTime();

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

const debrief: Debrief = {
  version: 1,
  raw: false,
  summary: 'A steady round.',
  scores: { clarity: 8, structure: 7, technical: null, delivery: null, filler: null },
  strengths: ['Clear framing.'],
  improvements: ['Name the trade-offs.'],
  strongerAnswers: [{ question: 'Why Kafka?', answer: 'Ordering per key, and replay.' }],
  followUps: ['How would you shard it?'],
  thankYouEmail: 'Hi Priya,\n\nThank you.',
  metrics: null,
  createdAt: start + 40 * 60_000,
};

const whole = (over: Partial<InterviewView> = {}): InterviewView => ({
  ...summary(),
  practice: null,
  qa: [
    {
      id: 1,
      askedAt: start,
      kind: AnswerKind.Spoken,
      question: 'Why Kafka?',
      answer: 'For ***ordering***: <img src=x onerror=alert(1)>',
    },
    { id: 2, askedAt: start + 60_000, kind: AnswerKind.Tip, question: 'Breathe', answer: '- slow down\n- smile' },
  ],
  transcript: [],
  debrief: null,
  ...over,
});

async function page(history: InterviewSummary[], overrides: Partial<AppApi> = {}, debriefing: number[] = []) {
  setActivePinia(createPinia());
  const fake = fakeAppApi({ ...initialAppState, history, debriefing }, overrides);
  window.appApi = fake.api;
  await useAppStore().load();
  const wrapper = mount(HistoryPage);
  await flushPromises();
  return { wrapper, ...fake };
}

const button = (wrapper: ReturnType<typeof mount>, text: string) =>
  wrapper.findAll('button').find((b) => b.text() === text);

describe('the History page (3.9)', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('says what it keeps, and that there is nothing yet', async () => {
    const { wrapper } = await page([]);
    expect(wrapper.find('h1').text()).toBe('History');
    expect(wrapper.text()).toContain('No interviews yet. Each session you run is kept here.');
    expect(button(wrapper, 'Delete all history')).toBeUndefined();
  });

  it('lists each interview by its role, when, how long, why it ended and what it holds', async () => {
    const { wrapper } = await page([
      summary({ id: 2, hasDebrief: true, lines: 12 }),
      summary({ id: 1, role: '', endReason: SessionEndReasons.CreditExhausted, answers: 1, endedAt: start + 20_000 }),
    ]);
    const rows = wrapper.findAll('ul[aria-label="Interviews"] li');
    expect(rows).toHaveLength(2);
    expect(rows[0]!.text()).toContain('Senior Backend Engineer, Payments');
    expect(rows[0]!.text()).toContain('32 min');
    expect(rows[0]!.text()).toContain('2 answers · 12 lines heard');
    expect(rows[0]!.text()).toContain('Debrief');
    expect(rows[1]!.text()).toContain('Interview');
    expect(rows[1]!.text()).toContain('under a minute');
    expect(rows[1]!.text()).toContain('ended when the minutes ran out');
    expect(rows[1]!.text()).toContain('1 answer');
  });

  it('says which debriefs are being written', async () => {
    const { wrapper } = await page([summary()], {}, [1]);
    expect(wrapper.find('ul[aria-label="Interviews"]').text()).toContain('Writing debrief…');
  });

  it('opens one whole: its answers drawn safely, in order, with their kinds', async () => {
    const openInterview = vi.fn<AppApi['openInterview']>(async () => whole());
    const { wrapper } = await page([summary()], { openInterview });
    await wrapper.find('ul[aria-label="Interviews"] button').trigger('click');
    await flushPromises();
    expect(openInterview).toHaveBeenCalledWith(1);
    expect(wrapper.find('h1').text()).toBe('Senior Backend Engineer, Payments');
    const exchanges = wrapper.findAll('ol[aria-label="Questions and answers"] > li');
    expect(exchanges.map((e) => e.find('.eyebrow').text())).toEqual(['Heard', 'Tip']);
    expect(exchanges[0]!.find('.question').text()).toBe('Why Kafka?');
    // Markdown through markdown.ts: the key word drawn, the HTML never.
    expect(exchanges[0]!.find('img').exists()).toBe(false);
    expect(exchanges[0]!.text()).toContain('ordering');
    expect(exchanges[1]!.findAll('li')).toHaveLength(2);
    expect(wrapper.text()).not.toContain('What the interviewer said');
  });

  it('shows the interviewer’s words when they were kept', async () => {
    const openInterview = vi.fn<AppApi['openInterview']>(async () =>
      whole({ transcript: [{ at: start, speaker: 'interviewer', text: 'Tell me about yourself.' }] }),
    );
    const { wrapper } = await page([summary()], { openInterview });
    await wrapper.find('ul[aria-label="Interviews"] button').trigger('click');
    await flushPromises();
    expect(wrapper.find('ol[aria-label="Transcript"]').text()).toBe('Tell me about yourself.');
  });

  it('asks for a debrief, saying what is sent, and says why one could not be had', async () => {
    const debriefCall = vi.fn<AppApi['debrief']>(async () => ({
      ok: false,
      code: 'quota_exceeded',
      message: "You've had all the debriefs your plan gives this month.",
    }));
    const { wrapper } = await page([summary()], { openInterview: async () => whole(), debrief: debriefCall });
    await wrapper.find('ul[aria-label="Interviews"] button').trigger('click');
    await flushPromises();
    expect(wrapper.text()).toContain('The server reads its questions, answers and transcript once to write it');
    await button(wrapper, 'Get a debrief')!.trigger('click');
    await flushPromises();
    expect(debriefCall).toHaveBeenCalledWith(1);
    expect(wrapper.find('[role="alert"]').text()).toBe("You've had all the debriefs your plan gives this month.");
  });

  it('shows the debrief being written, then the debrief, once main keeps it', async () => {
    let view = whole();
    const { wrapper, send } = await page([summary()], { openInterview: async () => view }, [1]);
    await wrapper.find('ul[aria-label="Interviews"] button').trigger('click');
    await flushPromises();
    expect(button(wrapper, 'Writing your debrief…')!.attributes('disabled')).toBeDefined();

    view = whole({ debrief, hasDebrief: true });
    send({ ...initialAppState, history: [summary({ hasDebrief: true })], debriefing: [] });
    await flushPromises();
    expect(wrapper.find('section[aria-label="Debrief"]').exists()).toBe(true);
    expect(button(wrapper, 'Write the debrief again')).toBeDefined();
  });

  it('deletes one only once asked to confirm, and goes back to the list', async () => {
    const deleteInterview = vi.fn<AppApi['deleteInterview']>(async () => ({ ok: true }));
    const { wrapper } = await page([summary()], { openInterview: async () => whole(), deleteInterview });
    await wrapper.find('ul[aria-label="Interviews"] button').trigger('click');
    await flushPromises();
    await button(wrapper, 'Delete')!.trigger('click');
    expect(wrapper.text()).toContain('Delete this interview?');
    expect(deleteInterview).not.toHaveBeenCalled();
    await wrapper
      .findAll('button')
      .filter((b) => b.text() === 'Delete')
      .at(-1)!
      .trigger('click');
    await flushPromises();
    expect(deleteInterview).toHaveBeenCalledWith(1);
    expect(wrapper.find('h1').text()).toBe('History');
  });

  it('deletes all only once asked to confirm, naming how many go', async () => {
    const clearHistory = vi.fn<AppApi['clearHistory']>(async () => ({ ok: true }));
    const { wrapper } = await page([summary({ id: 1 }), summary({ id: 2 })], { clearHistory });
    await button(wrapper, 'Delete all history')!.trigger('click');
    expect(wrapper.text()).toContain('All 2 interviews go from this computer, with their debriefs.');
    await button(wrapper, 'Delete all')!.trigger('click');
    await flushPromises();
    expect(clearHistory).toHaveBeenCalledTimes(1);
  });

  it('goes back to the list', async () => {
    const { wrapper } = await page([summary()], { openInterview: async () => whole() });
    await wrapper.find('ul[aria-label="Interviews"] button').trigger('click');
    await flushPromises();
    await button(wrapper, 'All interviews')!.trigger('click');
    expect(wrapper.find('ul[aria-label="Interviews"]').exists()).toBe(true);
  });
});

describe('a debrief, shown (3.9)', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('shows each part the model gave, and only the scores it gave', () => {
    const wrapper = mount(DebriefView, { props: { debrief } });
    expect(wrapper.text()).toContain('A steady round.');
    expect(wrapper.findAll('ul[aria-label="Scores"] li').map((li) => li.text())).toEqual([
      'Clarity8/10',
      'Structure7/10',
    ]);
    for (const part of [
      'What went well',
      'What to do better',
      'Stronger answers',
      'Questions to expect next',
      'A thank-you email',
    ]) {
      expect(wrapper.text()).toContain(part);
    }
    expect(wrapper.text()).not.toContain('came back without its parts');
  });

  it('leaves out every part the model left empty', () => {
    const wrapper = mount(DebriefView, {
      props: {
        debrief: {
          ...debrief,
          scores: null,
          strengths: [],
          improvements: [],
          strongerAnswers: [],
          followUps: [],
          thankYouEmail: ' ',
        },
      },
    });
    expect(wrapper.find('ul[aria-label="Scores"]').exists()).toBe(false);
    expect(wrapper.findAll('h3')).toHaveLength(0);
  });

  it('says how the candidate spoke, when their words were counted', () => {
    const wrapper = mount(DebriefView, {
      props: { debrief: { ...debrief, metrics: { words: 1234, fillers: 38, fillersPer100Words: 3.08, turns: 18 } } },
    });
    expect(wrapper.text()).toContain('You said 1,234 words in 18 turns, with 3.1 filler words in every 100.');
  });

  it('says when it came back without its parts', () => {
    const wrapper = mount(DebriefView, { props: { debrief: { ...debrief, raw: true } } });
    expect(wrapper.text()).toContain('The debrief came back without its parts: here it is as it was written.');
  });

  it('shows the model’s words as text, never HTML', () => {
    const wrapper = mount(DebriefView, {
      props: { debrief: { ...debrief, summary: '<img src=x onerror=alert(1)> **bold**' } },
    });
    expect(wrapper.find('img').exists()).toBe(false);
    expect(wrapper.text()).toContain('<img src=x onerror=alert(1)> **bold**');
  });

  it('copies the thank-you email through main, and says so', async () => {
    const fake = fakeAppApi(initialAppState);
    window.appApi = fake.api;
    const wrapper = mount(DebriefView, { props: { debrief } });
    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Copy the email')!
      .trigger('click');
    expect(fake.api.copy).toHaveBeenCalledWith('Hi Priya,\n\nThank you.');
    expect(wrapper.find('[role="status"]').text()).toBe('Copied.');
  });
});
