// @vitest-environment happy-dom
// Prep drafts in Prepare's answer bank (3.9): asked for, shown while written, each kept or skipped, and why not.
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppApi } from '../../src/preload/api';
import { emptyPreferences, maxBankEntries, type BankEntry } from '../../src/shared/answer-bank';
import { initialAppState } from '../../src/shared/app-state';
import type { DraftsView } from '../../src/shared/drafts';
import { useAppStore } from '../../src/renderer/app/app-store';
import DraftList from '../../src/renderer/app/components/DraftList.vue';
import { fakeAppApi } from './fake-app-api';

enableAutoUnmount(afterEach);

const waiting: DraftsView = {
  writing: false,
  items: [
    { id: 1, phrasings: ['Why payments?', 'Why fintech?'], answer: 'Money moving is a promise kept.' },
    { id: 2, phrasings: ['On call?'], answer: 'I write the runbook.' },
  ],
};

async function list(drafts: DraftsView, overrides: Partial<AppApi> = {}, bank: BankEntry[] = []) {
  const fake = fakeAppApi({ ...initialAppState, drafts, preferences: { ...emptyPreferences, bank } }, overrides);
  window.appApi = fake.api;
  await useAppStore().load();
  return { wrapper: mount(DraftList), ...fake };
}

const button = (wrapper: ReturnType<typeof mount>, label: string) =>
  wrapper.findAll('button').find((b) => b.text() === label || b.attributes('aria-label') === label);

describe('prep drafts in Prepare (3.9)', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('offers to draft answers, saying what it does and that the plan counts it', async () => {
    const writeDrafts = vi.fn<AppApi['writeDrafts']>(async () => ({ ok: true }));
    const { wrapper } = await list({ writing: false, items: [] }, { writeDrafts });
    expect(wrapper.text()).toContain('nothing goes into the bank until you do');
    expect(wrapper.text()).toContain('Your plan counts each time you ask.');
    await button(wrapper, 'Draft answers')!.trigger('click');
    expect(writeDrafts).toHaveBeenCalledTimes(1);
    expect(wrapper.find('ul[aria-label="Drafted answers"]').exists()).toBe(false);
  });

  it('says while drafts are being written', async () => {
    const { wrapper } = await list({ writing: true, items: [] });
    expect(button(wrapper, 'Writing drafts…')!.attributes('disabled')).toBeDefined();
  });

  it('says why no drafts came', async () => {
    const { wrapper } = await list(
      { writing: false, items: [] },
      {
        writeDrafts: async () => ({
          ok: false,
          code: 'required',
          message: 'Add your résumé or the job description first: the drafts are written from them.',
        }),
      },
    );
    await button(wrapper, 'Draft answers')!.trigger('click');
    await flushPromises();
    expect(wrapper.find('[role="alert"]').text()).toBe(
      'Add your résumé or the job description first: the drafts are written from them.',
    );
  });

  it('shows each draft with how else it is asked, as text, and offers more', async () => {
    const { wrapper } = await list({
      writing: false,
      items: [{ id: 1, phrasings: ['<b>Q</b>?', 'Also?'], answer: '<img src=x onerror=alert(1)>' }],
    });
    const item = wrapper.find('ul[aria-label="Drafted answers"] li');
    expect(item.find('.question').text()).toBe('<b>Q</b>?');
    expect(item.text()).toContain('Also asked: Also?');
    expect(item.find('img').exists()).toBe(false);
    expect(button(wrapper, 'Draft more')).toBeDefined();
  });

  it('keeps or skips each by its id', async () => {
    const keepDraft = vi.fn<AppApi['keepDraft']>(async () => ({ ok: true }));
    const skipDraft = vi.fn<AppApi['skipDraft']>(async () => ({ ok: true }));
    const { wrapper } = await list(waiting, { keepDraft, skipDraft });
    await button(wrapper, 'Keep “Why payments?”')!.trigger('click');
    await button(wrapper, 'Skip “On call?”')!.trigger('click');
    expect(keepDraft).toHaveBeenCalledWith(1);
    expect(skipDraft).toHaveBeenCalledWith(2);
  });

  it('says beside the draft why it could not be kept', async () => {
    const { wrapper } = await list(waiting, {
      keepDraft: async () => ({ ok: false, code: 'invalid_input', message: 'Add the answer.' }),
    });
    await button(wrapper, 'Keep “On call?”')!.trigger('click');
    await flushPromises();
    const items = wrapper.findAll('ul[aria-label="Drafted answers"] li');
    expect(items[1]!.find('[role="alert"]').text()).toBe('Add the answer.');
    expect(items[0]!.find('[role="alert"]').exists()).toBe(false);
  });

  it(`asks for and keeps nothing more once the bank holds ${maxBankEntries}`, async () => {
    const bank = Array.from({ length: maxBankEntries }, (_, i) => ({
      id: `e${i}`,
      phrasings: [`Q${i}?`],
      answer: 'A.',
      enabled: true,
      source: 'manual' as const,
      updatedAt: 1,
    }));
    const { wrapper } = await list(waiting, {}, bank);
    expect(button(wrapper, 'Draft more')!.attributes('disabled')).toBeDefined();
    expect(button(wrapper, 'Keep “Why payments?”')!.attributes('disabled')).toBeDefined();
    expect(button(wrapper, 'Skip “Why payments?”')!.attributes('disabled')).toBeUndefined();
  });
});
