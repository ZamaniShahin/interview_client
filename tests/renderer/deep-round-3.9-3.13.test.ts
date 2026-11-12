// @vitest-environment happy-dom
// The deep round over 3.9, 3.13 and 4.1 (Shahin's, 2026-11-11), on screen: the History page with many interviews,
// the debrief's words in every count, and the hotkey editor's every refusal.
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { initialAppState } from '../../src/shared/app-state';
import { SessionEndReasons } from '../../src/shared/contracts/sotto-contracts';
import type { DebriefView as Debrief, InterviewSummary } from '../../src/shared/history';
import { useAppStore } from '../../src/renderer/app/app-store';
import DebriefView from '../../src/renderer/app/components/DebriefView.vue';
import HotkeySettings from '../../src/renderer/app/components/HotkeySettings.vue';
import HistoryPage from '../../src/renderer/app/pages/HistoryPage.vue';
import { fakeAppApi } from './fake-app-api';

enableAutoUnmount(afterEach);
beforeEach(() => setActivePinia(createPinia()));

const start = new Date(2026, 10, 11, 9, 0).getTime();
const summary = (id: number, over: Partial<InterviewSummary> = {}): InterviewSummary => ({
  id,
  kind: 'interview',
  average: null,
  startedAt: start - id * 3_600_000,
  endedAt: start - id * 3_600_000 + 25 * 60_000,
  candidate: '',
  role: `Role ${id}`,
  endReason: SessionEndReasons.User,
  answers: id,
  lines: 0,
  hasDebrief: id % 2 === 0,
  ...over,
});

describe('the History page with many interviews (3.9)', () => {
  it('lists fifty, each with its own words, in the order main keeps them', async () => {
    const history = Array.from({ length: 50 }, (_, i) => summary(i + 1));
    window.appApi = fakeAppApi({ ...initialAppState, history }).api;
    await useAppStore().load();
    const wrapper = mount(HistoryPage);
    await flushPromises();
    const rows = wrapper.findAll('ul[aria-label="Interviews"] li');
    expect(rows).toHaveLength(50);
    expect(rows[0]!.text()).toContain('Role 1');
    expect(rows[0]!.text()).toContain('1 answer');
    expect(rows[1]!.text()).toContain('2 answers');
    expect(rows.filter((r) => r.text().includes('Debrief'))).toHaveLength(25);
    await wrapper.findAll('button').find((b) => b.text() === 'Delete all history')!.trigger('click');
    expect(wrapper.text()).toContain('All 50 interviews go from this computer');
  });

  it.each(Object.values(SessionEndReasons).filter((r) => r !== SessionEndReasons.User))(
    'says how an interview that ended for %s ended',
    async (reason) => {
      window.appApi = fakeAppApi({ ...initialAppState, history: [summary(1, { endReason: reason })] }).api;
      await useAppStore().load();
      const wrapper = mount(HistoryPage);
      await flushPromises();
      expect(wrapper.find('ul[aria-label="Interviews"] li').text()).toMatch(/ended|moved/);
    },
  );

  it('says nothing of how it ended for one the user ended, or one still open', async () => {
    window.appApi = fakeAppApi({
      ...initialAppState,
      history: [summary(1), summary(2, { endReason: null, endedAt: null })],
    }).api;
    await useAppStore().load();
    const wrapper = mount(HistoryPage);
    await flushPromises();
    const rows = wrapper.findAll('ul[aria-label="Interviews"] li').map((r) => r.text());
    expect(rows[0]).not.toMatch(/ended|moved/);
    expect(rows[1]).not.toContain('min');
  });
});

describe('a debrief’s words, in every count (3.9)', () => {
  const debrief: Debrief = {
    version: 1,
    raw: false,
    summary: 'S.',
    scores: { clarity: 10, structure: 1, technical: 5, delivery: 9, filler: 2 },
    strengths: [],
    improvements: [],
    strongerAnswers: [],
    followUps: [],
    thankYouEmail: '',
    metrics: null,
    createdAt: start,
  };

  it.each<[{ words: number; fillers: number; fillersPer100Words: number; turns: number }, string]>([
    [
      { words: 1, fillers: 0, fillersPer100Words: 0, turns: 1 },
      'You said 1 word in 1 turn, with 0.0 filler words in every 100.',
    ],
    [
      { words: 0, fillers: 0, fillersPer100Words: 0, turns: 0 },
      'You said 0 words in 0 turns, with 0.0 filler words in every 100.',
    ],
    [
      { words: 12345, fillers: 500, fillersPer100Words: 4.05, turns: 99 },
      'You said 12,345 words in 99 turns, with 4.0 filler words in every 100.',
    ],
  ])('words the counts %j', (metrics, words) => {
    expect(mount(DebriefView, { props: { debrief: { ...debrief, metrics } } }).text()).toContain(words);
  });

  it('shows all five scores the model gave, in their order, each out of 10', () => {
    const scores = mount(DebriefView, { props: { debrief } })
      .findAll('ul[aria-label="Scores"] li')
      .map((li) => li.text());
    expect(scores).toEqual([
      'Clarity10/10',
      'Structure1/10',
      'Technical depth5/10',
      'Delivery9/10',
      'Few filler words2/10',
    ]);
  });
});

describe('the hotkey editor’s every refusal (3.13)', () => {
  const press = (
    code: string,
    mods: Partial<{ ctrlKey: boolean; altKey: boolean; shiftKey: boolean; metaKey: boolean }> = {},
  ) => window.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true, ...mods }));

  async function listening(action = 'Answer now') {
    const wrapper = mount(HotkeySettings, { props: { changed: {} } });
    await wrapper
      .findAll('button')
      .find((b) => b.attributes('aria-label') === `Change “${action}”`)!
      .trigger('click');
    return wrapper;
  }

  it.each<[string, Partial<{ ctrlKey: boolean; altKey: boolean; shiftKey: boolean; metaKey: boolean }>, string | null]>(
    [
      ['F9', {}, 'Add Ctrl or Alt.'],
      ['F9', { metaKey: true }, 'Add Ctrl or Alt.'],
      ['F9', { ctrlKey: true }, null],
      ['Digit1', { ctrlKey: true }, 'Add Shift or Alt: other apps use Ctrl with a letter for their own keys.'],
      ['Digit1', { ctrlKey: true, altKey: true }, null],
      ['Tab', { altKey: true }, 'Windows keeps that one for itself.'],
      ['Space', { altKey: true }, 'Windows keeps that one for itself.'],
      ['ArrowLeft', { ctrlKey: true, shiftKey: true }, '“Earlier answer” has that one.'],
    ],
  )('says of %s with %j: %j', async (code, mods, problem) => {
    const wrapper = await listening();
    press(code, mods);
    await flushPromises();
    const alert = wrapper.find('[role="alert"]');
    expect(alert.exists() ? alert.text() : null).toBe(problem);
    const save = wrapper.findAll('button').find((b) => b.text() === 'Save')!;
    expect(save.attributes('disabled') !== undefined).toBe(problem !== null);
  });

  it('keeps listening through modifiers alone and keys it doesn’t offer, then takes a real one', async () => {
    const wrapper = await listening();
    for (const code of ['ShiftLeft', 'ControlLeft', 'AltLeft', 'Numpad3', 'CapsLock'])
      press(code, { ctrlKey: true, altKey: true });
    await flushPromises();
    expect(wrapper.text()).toContain('Press the new keys, with Ctrl or Alt.');
    press('KeyJ', { ctrlKey: true, altKey: true });
    await flushPromises();
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
  });

  it('takes the last keys pressed, not the first', async () => {
    const wrapper = await listening();
    press('KeyS', { ctrlKey: true });
    press('KeyS', { ctrlKey: true, altKey: true });
    await flushPromises();
    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Save')!
      .trigger('click');
    expect(wrapper.emitted('save')).toEqual([[{ trigger: 'CommandOrControl+Alt+S' }]]);
  });
});
