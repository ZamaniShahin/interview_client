// @vitest-environment happy-dom
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAppStore } from '../../src/renderer/app/app-store';
import { fakeAppApi } from './fake-app-api';
import PreparePage from '../../src/renderer/app/pages/PreparePage.vue';
import { initialAppState, type AppState } from '../../src/shared/app-state';
import type { CommandResult } from '../../src/shared/ipc';
import { emptyDocuments, type DocumentsView } from '../../src/shared/documents';

/** Prepare over main's state, with the documents given; `setDocument` answers `answer`. */
async function prepare(documents: Partial<DocumentsView> = {}, answer: CommandResult = { ok: true }) {
  const state: AppState = { ...initialAppState, documents: { ...emptyDocuments, ...documents } };
  const { api } = fakeAppApi(state, { setDocument: vi.fn(async () => answer) });
  window.appApi = api;
  await useAppStore().load();
  const wrapper = mount(PreparePage);
  await flushPromises();
  const row = (label: string) => wrapper.findAll('.row').find((r) => r.find('.name').text() === label)!;
  const button = (text: string) => wrapper.findAll('button').find((b) => b.text() === text)!;
  return { api, wrapper, row, button };
}

describe("Prepare's documents (1.14)", () => {
  beforeEach(() => setActivePinia(createPinia()));

  it("shows each document's first line and its count against the server's limit", async () => {
    const { row } = await prepare({
      resume: 'Backend engineer, 7 years.\nNorthwind, Go and Kafka.',
      name: 'Sam Rivera',
    });

    expect(row('Résumé').find('.preview').text()).toBe('Backend engineer, 7 years.');
    expect(row('Résumé').find('.num').text()).toBe('51 / 50,000');
    expect(row('Name').find('.num').text()).toBe('10 / 200');
    expect(row('Job description').find('.preview').text()).toBe('Not added');
    expect(row('Job description').find('button').text()).toBe('Add');
    expect(row('Résumé').find('button').text()).toBe('Edit');
  });

  it('edits a document in place and keeps its whole text', async () => {
    const { api, wrapper, row, button } = await prepare({ jobDescription: 'Senior Backend Engineer' });

    await row('Job description').find('button').trigger('click');
    const box = wrapper.find('textarea');
    expect((box.element as HTMLTextAreaElement).value).toBe('Senior Backend Engineer');
    await box.setValue('Senior Backend Engineer, Payments\nOwn the ledger.');
    await button('Save').trigger('click');
    await flushPromises();

    expect(api.setDocument).toHaveBeenCalledWith({
      field: 'jobDescription',
      text: 'Senior Backend Engineer, Payments\nOwn the ledger.',
    });
    expect(wrapper.find('textarea').exists()).toBe(false);
  });

  it('removes a document saved as nothing but spaces', async () => {
    const { api, wrapper, row, button } = await prepare({ notes: 'Old notes' });

    await row('Notes').find('button').trigger('click');
    await wrapper.find('textarea').setValue('   ');
    await button('Save').trigger('click');

    expect(api.setDocument).toHaveBeenCalledWith({ field: 'notes', text: '' });
  });

  it('names the limit past it, cuts nothing, and keeps Save off', async () => {
    const { api, wrapper, row, button } = await prepare();

    await row('Name').find('button').trigger('click');
    await wrapper.find('textarea').setValue('x'.repeat(205));

    expect(wrapper.text()).toContain('Shorten it by 5 characters. Nothing has been cut.');
    expect(button('Save').attributes('disabled')).toBeDefined();
    await button('Save').trigger('click');
    expect(api.setDocument).not.toHaveBeenCalled();
  });

  it("keeps the editor open with main's words when the document can't be kept", async () => {
    const { wrapper, row, button } = await prepare(
      {},
      { ok: false, code: 'unavailable', message: "This computer's documents can't be kept right now." },
    );

    await row('Résumé').find('button').trigger('click');
    await wrapper.find('textarea').setValue('Backend engineer.');
    await button('Save').trigger('click');
    await flushPromises();

    expect(wrapper.find('[role="alert"]').text()).toBe("This computer's documents can't be kept right now.");
    expect(wrapper.find('textarea').exists()).toBe(true);
  });

  it('leaves the document as it was on Cancel', async () => {
    const { api, wrapper, row, button } = await prepare({ resume: 'Kept.' });

    await row('Résumé').find('button').trigger('click');
    await wrapper.find('textarea').setValue('Changed my mind.');
    await button('Cancel').trigger('click');

    expect(api.setDocument).not.toHaveBeenCalled();
    expect(wrapper.find('textarea').exists()).toBe(false);
    expect(row('Résumé').find('.preview').text()).toBe('Kept.');
  });

  it("can't add a prep doc yet: nothing sends one", async () => {
    const { row } = await prepare();
    expect(row('Prep doc').find('button').attributes('disabled')).toBeDefined();
  });
});
