// @vitest-environment happy-dom
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AnswerBank from '../../src/renderer/app/components/AnswerBank.vue';
import InstructionsEditor from '../../src/renderer/app/components/InstructionsEditor.vue';
import { useAppStore } from '../../src/renderer/app/app-store';
import AnswerCard from '../../src/renderer/overlay/components/AnswerCard.vue';
import type { AppApi } from '../../src/preload/api';
import { emptyPreferences, type BankEntry, type PreferencesView } from '../../src/shared/answer-bank';
import { initialAppState } from '../../src/shared/app-state';
import { AnswerKind } from '../../src/shared/contracts/sotto-contracts';
import type { AnswerView } from '../../src/shared/live/view-state';
import { fakeAppApi } from './fake-app-api';

enableAutoUnmount(afterEach);

const entry = (id: string, phrasings: string[], over: Partial<BankEntry> = {}): BankEntry => ({
  id,
  phrasings,
  answer: `The answer to ${phrasings[0]}`,
  enabled: true,
  source: 'manual',
  updatedAt: 1,
  ...over,
});

/** The app store over main's state with these preferences; `overrides` stand in for main's answers. */
async function withPreferences(preferences: Partial<PreferencesView>, overrides: Partial<AppApi> = {}) {
  const { api, send } = fakeAppApi(
    { ...initialAppState, preferences: { ...emptyPreferences, ...preferences } },
    overrides,
  );
  window.appApi = api;
  await useAppStore().load();
  return { api, send };
}

const button = (wrapper: ReturnType<typeof mount>, text: string) =>
  wrapper.findAll('button').find((b) => b.text() === text)!;

describe('the 📌 card in an answer (3.8)', () => {
  const answer = (prepared: AnswerView['prepared']): AnswerView => ({
    id: 'a',
    question: 'Tell me about yourself',
    kind: AnswerKind.Spoken,
    instruction: null,
    text: 'The generated answer, still writing',
    ending: 'writing',
    failureMessage: null,
    startedAtMs: 0,
    screenshotIds: [],
    prepared,
  });
  const card = (prepared: AnswerView['prepared']) =>
    mount(AnswerCard, {
      props: {
        answer: answer(prepared),
        position: 1,
        total: 1,
        lookingBack: false,
        newWriting: false,
        stoppedBefore: null,
        now: 0,
        compact: false,
      },
    });

  it("shows the user's own answer at once, over the generated one, with the phrasing it matched", () => {
    const wrapper = card({ phrasing: 'Tell me about yourself', answer: 'I build payment systems.\nIn Go.' });

    const prepared = wrapper.find('section[aria-label="Your prepared answer"]');
    expect(prepared.text()).toContain('for “Tell me about yourself”');
    expect(prepared.find('.answer').text()).toBe('I build payment systems.\nIn Go.');
    expect(wrapper.text().indexOf('Your prepared answer')).toBeLessThan(wrapper.text().indexOf('The generated answer'));
  });

  it('shows their words as they wrote them: never HTML, never Markdown', () => {
    const wrapper = card({ phrasing: 'Q', answer: '<img src=x onerror=alert(1)> **bold**' });
    const prepared = wrapper.find('.answer');
    expect(prepared.text()).toBe('<img src=x onerror=alert(1)> **bold**');
    expect(prepared.find('img').exists()).toBe(false);
    expect(prepared.find('strong').exists()).toBe(false);
  });

  it('shows no card when nothing matched', () => {
    expect(card(null).find('section[aria-label="Your prepared answer"]').exists()).toBe(false);
  });
});

describe('custom instructions in Prepare (3.8)', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('shows what is kept, and keeps a change on Save', async () => {
    const setInstructions = vi.fn<AppApi['setInstructions']>(async () => ({ ok: true }));
    const { send } = await withPreferences({ instructions: 'Keep answers short.' }, { setInstructions });
    const wrapper = mount(InstructionsEditor);
    const box = wrapper.find('textarea');

    expect((box.element as HTMLTextAreaElement).value).toBe('Keep answers short.');
    expect(button(wrapper, 'Save').attributes('disabled')).toBeDefined();
    await box.setValue('Keep answers short. Mention Kubernetes.');
    await button(wrapper, 'Save').trigger('click');
    await flushPromises();
    send({
      ...initialAppState,
      preferences: { ...emptyPreferences, instructions: 'Keep answers short. Mention Kubernetes.' },
    });
    await flushPromises();

    expect(setInstructions).toHaveBeenCalledWith('Keep answers short. Mention Kubernetes.');
    expect(wrapper.find('[role="status"]').text()).toBe('Saved.');
  });

  it('removes them when emptied, and undoes a change', async () => {
    const setInstructions = vi.fn<AppApi['setInstructions']>(async () => ({ ok: true }));
    await withPreferences({ instructions: 'Old.' }, { setInstructions });
    const wrapper = mount(InstructionsEditor);

    await wrapper.find('textarea').setValue('Changed my mind.');
    await button(wrapper, 'Undo changes').trigger('click');
    expect((wrapper.find('textarea').element as HTMLTextAreaElement).value).toBe('Old.');

    await wrapper.find('textarea').setValue('   ');
    await button(wrapper, 'Save').trigger('click');
    expect(setInstructions).toHaveBeenCalledWith('');
  });

  it('names the limit past 4,000 characters, cuts nothing, and waits', async () => {
    const setInstructions = vi.fn<AppApi['setInstructions']>(async () => ({ ok: true }));
    await withPreferences({}, { setInstructions });
    const wrapper = mount(InstructionsEditor);

    await wrapper.find('textarea').setValue('i'.repeat(4_003));

    expect(wrapper.text()).toContain('Shorten it by 3 characters. Nothing has been cut.');
    expect(button(wrapper, 'Save').attributes('disabled')).toBeDefined();
  });

  it("says why they couldn't be kept", async () => {
    await withPreferences(
      {},
      {
        setInstructions: vi.fn(async () => ({
          ok: false as const,
          code: 'unavailable',
          message: "This computer's preferences can't be kept right now.",
        })),
      },
    );
    const wrapper = mount(InstructionsEditor);
    await wrapper.find('textarea').setValue('Short.');
    await button(wrapper, 'Save').trigger('click');
    await flushPromises();
    expect(wrapper.find('[role="alert"]').text()).toBe("This computer's preferences can't be kept right now.");
  });
});

describe('the answer bank in Prepare (3.8)', () => {
  beforeEach(() => setActivePinia(createPinia()));

  const bank = [
    entry('intro', ['Tell me about yourself', 'Walk me through your résumé', 'Who are you?']),
    entry('why', ['Why do you want to work here?'], { enabled: false }),
  ];

  it('lists each entry by its question, with how else it is asked, and counts what is on', async () => {
    await withPreferences({ bank });
    const wrapper = mount(AnswerBank);

    const rows = wrapper.findAll('.entry');
    expect(rows.map((r) => r.find('.question').text())).toEqual([
      'Tell me about yourself',
      'Why do you want to work here?',
    ]);
    expect(rows[0]!.find('.preview').text()).toBe('Also asked as 2 other ways');
    expect(rows[1]!.find('.preview').text()).toBe('The answer to Why do you want to work here?');
    expect(wrapper.text()).toContain('1 enabled · 2 / 100');
  });

  it('adds one, saying what is missing until it can be kept', async () => {
    const saveBankEntry = vi.fn<AppApi['saveBankEntry']>(async () => ({ ok: true }));
    await withPreferences({}, { saveBankEntry });
    const wrapper = mount(AnswerBank);

    expect(wrapper.text()).toContain('No prepared answers yet.');
    await button(wrapper, 'Add a prepared answer').trigger('click');
    const [questions, answer] = wrapper.findAll('textarea');
    await questions!.setValue('Why payments?\n\n  Why  fintech? ');
    expect(wrapper.text()).toContain('Add the answer.');
    expect(button(wrapper, 'Save').attributes('disabled')).toBeDefined();
    await answer!.setValue('Money moves.');
    await button(wrapper, 'Save').trigger('click');
    await flushPromises();

    expect(saveBankEntry).toHaveBeenCalledWith({
      id: null,
      phrasings: ['Why payments?', 'Why fintech?'],
      answer: 'Money moves.',
      enabled: true,
    });
    expect(wrapper.find('textarea').exists()).toBe(false);
  });

  it('edits one in its place, by its id', async () => {
    const saveBankEntry = vi.fn<AppApi['saveBankEntry']>(async () => ({ ok: true }));
    await withPreferences({ bank }, { saveBankEntry });
    const wrapper = mount(AnswerBank);

    await wrapper.find('button[aria-label="Edit “Tell me about yourself”"]').trigger('click');
    const [questions] = wrapper.findAll('textarea');
    expect((questions!.element as HTMLTextAreaElement).value).toBe(
      'Tell me about yourself\nWalk me through your résumé\nWho are you?',
    );
    await questions!.setValue('Tell me about yourself');
    await button(wrapper, 'Save').trigger('click');

    expect(saveBankEntry).toHaveBeenCalledWith({
      id: 'intro',
      phrasings: ['Tell me about yourself'],
      answer: 'The answer to Tell me about yourself',
      enabled: true,
    });
  });

  it('turns one on or off from the list, as it is', async () => {
    const saveBankEntry = vi.fn<AppApi['saveBankEntry']>(async () => ({ ok: true }));
    await withPreferences({ bank }, { saveBankEntry });
    const wrapper = mount(AnswerBank);

    await wrapper.findAll('[role="switch"]')[1]!.trigger('click');

    expect(saveBankEntry).toHaveBeenCalledWith({
      id: 'why',
      phrasings: ['Why do you want to work here?'],
      answer: 'The answer to Why do you want to work here?',
      enabled: true,
    });
  });

  it('deletes one only once asked to confirm', async () => {
    const removeBankEntry = vi.fn<AppApi['removeBankEntry']>(async () => ({ ok: true }));
    await withPreferences({ bank }, { removeBankEntry });
    const wrapper = mount(AnswerBank);

    await wrapper.find('button[aria-label="Delete “Why do you want to work here?”"]').trigger('click');
    expect(removeBankEntry).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain('Delete this prepared answer?');
    await wrapper
      .findAll('button')
      .filter((b) => b.text() === 'Delete')
      .at(-1)!
      .trigger('click');

    expect(removeBankEntry).toHaveBeenCalledWith('why');
  });

  it("says why an entry couldn't be kept, keeping the editor", async () => {
    await withPreferences(
      {},
      {
        saveBankEntry: vi.fn(async () => ({
          ok: false as const,
          code: 'invalid_input',
          message: 'The answer bank is full (100 answers): delete one first.',
        })),
      },
    );
    const wrapper = mount(AnswerBank);
    await button(wrapper, 'Add a prepared answer').trigger('click');
    const [questions, answer] = wrapper.findAll('textarea');
    await questions!.setValue('Q?');
    await answer!.setValue('A.');
    await button(wrapper, 'Save').trigger('click');
    await flushPromises();

    expect(wrapper.find('[role="alert"]').text()).toBe('The answer bank is full (100 answers): delete one first.');
    expect(wrapper.find('textarea').exists()).toBe(true);
  });

  it('offers no more once the bank holds 100', async () => {
    await withPreferences({ bank: Array.from({ length: 100 }, (_, i) => entry(`e${i}`, [`Q${i}?`])) });
    const wrapper = mount(AnswerBank);
    expect(button(wrapper, 'Add a prepared answer').attributes('disabled')).toBeDefined();
    expect(wrapper.text()).toContain('The bank is full: 100 answers.');
  });

  it('names a way to ask it past 300 characters, and seven ways', async () => {
    await withPreferences({});
    const wrapper = mount(AnswerBank);
    await button(wrapper, 'Add a prepared answer').trigger('click');
    const [questions, answer] = wrapper.findAll('textarea');
    await answer!.setValue('A.');

    await questions!.setValue(`Q?\n${'q'.repeat(301)}`);
    expect(wrapper.text()).toContain('shorten line 2');
    await questions!.setValue('1\n2\n3\n4\n5\n6\n7');
    expect(wrapper.text()).toContain('Up to 6 ways to ask it: remove 1.');
  });
});
