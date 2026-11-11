// @vitest-environment happy-dom
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAppStore } from '../../src/renderer/app/app-store';
import { fakeAppApi } from './fake-app-api';
import PreparePage from '../../src/renderer/app/pages/PreparePage.vue';
import { initialAppState, type AppState } from '../../src/shared/app-state';
import type { CommandResult } from '../../src/shared/ipc';
import { emptyDocuments, type DocumentsView, type ReadDocumentResult } from '../../src/shared/documents';
import type { AppApi } from '../../src/preload/api';

/** Prepare over main's state, with the documents given; `setDocument` answers `answer`; `overrides` stand in for more. */
async function prepare(
  documents: Partial<DocumentsView> = {},
  answer: CommandResult = { ok: true },
  overrides: Partial<AppApi> = {},
) {
  const state: AppState = { ...initialAppState, documents: { ...emptyDocuments, ...documents } };
  const { api } = fakeAppApi(state, { setDocument: vi.fn(async () => answer), ...overrides });
  window.appApi = api;
  await useAppStore().load();
  const wrapper = mount(PreparePage);
  await flushPromises();
  const row = (label: string) => wrapper.findAll('.row').find((r) => r.find('.name').text() === label)!;
  const button = (text: string) => wrapper.findAll('button').find((b) => b.text() === text)!;
  /** The row's Edit or Add: the row has "From a file" first (3.10). */
  const edit = (label: string) =>
    row(label)
      .findAll('button')
      .find((b) => b.text() === 'Edit' || b.text() === 'Add')!;
  return { api, wrapper, row, button, edit };
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
    expect(
      row('Job description')
        .findAll('button')
        .map((b) => b.text()),
    ).toEqual(['From a file', 'Add']);
    expect(
      row('Résumé')
        .findAll('button')
        .map((b) => b.text()),
    ).toEqual(['From a file', 'Edit']);
    // A name is typed: there is no file to read it from.
    expect(
      row('Name')
        .findAll('button')
        .map((b) => b.text()),
    ).toEqual(['Edit']);
  });

  it('edits a document in place and keeps its whole text', async () => {
    const { api, wrapper, edit, button } = await prepare({ jobDescription: 'Senior Backend Engineer' });

    await edit('Job description').trigger('click');
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
    const { api, wrapper, edit, button } = await prepare({ notes: 'Old notes' });

    await edit('Notes').trigger('click');
    await wrapper.find('textarea').setValue('   ');
    await button('Save').trigger('click');

    expect(api.setDocument).toHaveBeenCalledWith({ field: 'notes', text: '' });
  });

  it('names the limit past it, cuts nothing, and keeps Save off', async () => {
    const { api, wrapper, edit, button } = await prepare();

    await edit('Name').trigger('click');
    await wrapper.find('textarea').setValue('x'.repeat(205));

    expect(wrapper.text()).toContain('Shorten it by 5 characters. Nothing has been cut.');
    expect(button('Save').attributes('disabled')).toBeDefined();
    await button('Save').trigger('click');
    expect(api.setDocument).not.toHaveBeenCalled();
  });

  it("keeps the editor open with main's words when the document can't be kept", async () => {
    const { wrapper, edit, button } = await prepare(
      {},
      { ok: false, code: 'unavailable', message: "This computer's documents can't be kept right now." },
    );

    await edit('Résumé').trigger('click');
    await wrapper.find('textarea').setValue('Backend engineer.');
    await button('Save').trigger('click');
    await flushPromises();

    expect(wrapper.find('[role="alert"]').text()).toBe("This computer's documents can't be kept right now.");
    expect(wrapper.find('textarea').exists()).toBe(true);
  });

  it('leaves the document as it was on Cancel', async () => {
    const { api, wrapper, row, edit, button } = await prepare({ resume: 'Kept.' });

    await edit('Résumé').trigger('click');
    await wrapper.find('textarea').setValue('Changed my mind.');
    await button('Cancel').trigger('click');

    expect(api.setDocument).not.toHaveBeenCalled();
    expect(wrapper.find('textarea').exists()).toBe(false);
    expect(row('Résumé').find('.preview').text()).toBe('Kept.');
  });
});

describe('documents read from a file (3.10)', () => {
  beforeEach(() => setActivePinia(createPinia()));

  const read = (result: ReadDocumentResult) => vi.fn<AppApi['readDocument']>(async () => result);
  const fromFile = (wrapper: ReturnType<typeof mount>, what: string) =>
    wrapper.find(`button[aria-label="Read the ${what} from a file"]`);

  it('opens what a file holds in the editor, to look over before it is kept', async () => {
    const readDocument = read({
      ok: true,
      text: 'Backend engineer, 7 years.\nGo and Kafka.',
      name: 'resume.pdf',
      cut: false,
    });
    const { api, wrapper, button } = await prepare({ resume: 'Old.' }, { ok: true }, { readDocument });

    await fromFile(wrapper, 'résumé').trigger('click');
    await flushPromises();

    expect(readDocument).toHaveBeenCalledWith('resume');
    expect((wrapper.find('textarea').element as HTMLTextAreaElement).value).toBe(
      'Backend engineer, 7 years.\nGo and Kafka.',
    );
    expect(api.setDocument).not.toHaveBeenCalled();
    await button('Save').trigger('click');
    await flushPromises();
    expect(api.setDocument).toHaveBeenCalledWith({
      field: 'resume',
      text: 'Backend engineer, 7 years.\nGo and Kafka.',
    });
  });

  it('says why a file gave nothing, keeping the document as it was, and nothing for a pick cancelled', async () => {
    const readDocument = vi
      .fn<AppApi['readDocument']>()
      .mockResolvedValueOnce({ ok: false, code: 'read_protected', message: 'That file is protected by a password.' })
      .mockResolvedValueOnce({ ok: false, code: 'read_cancelled', message: '' });
    const { wrapper, row } = await prepare({ jobDescription: 'Kept.' }, { ok: true }, { readDocument });

    await fromFile(wrapper, 'job description').trigger('click');
    await flushPromises();
    expect(wrapper.find('[role="alert"]').text()).toBe('That file is protected by a password.');
    expect(wrapper.find('textarea').exists()).toBe(false);
    expect(row('Job description').find('.preview').text()).toBe('Kept.');

    await fromFile(wrapper, 'job description').trigger('click');
    await flushPromises();
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
  });

  it('a document read over its limit opens whole, its limit named, and Save waits until it is shortened', async () => {
    const readDocument = read({ ok: true, text: 'n'.repeat(5_003), name: 'notes.txt', cut: false });
    const { api, wrapper, button } = await prepare({}, { ok: true }, { readDocument });

    await fromFile(wrapper, 'notes').trigger('click');
    await flushPromises();

    expect(wrapper.text()).toContain('Shorten it by 3 characters. Nothing has been cut.');
    expect(button('Save').attributes('disabled')).toBeDefined();
    expect(api.setDocument).not.toHaveBeenCalled();
  });

  it('reads one file at a time', async () => {
    let finish: (result: ReadDocumentResult) => void = () => {};
    const readDocument = vi.fn<AppApi['readDocument']>(() => new Promise((resolve) => (finish = resolve)));
    const { wrapper } = await prepare({}, { ok: true }, { readDocument });

    await fromFile(wrapper, 'résumé').trigger('click');

    expect(fromFile(wrapper, 'résumé').text()).toBe('Reading…');
    expect(fromFile(wrapper, 'notes').attributes('disabled')).toBeDefined();
    expect(fromFile(wrapper, 'prep doc').attributes('disabled')).toBeDefined();
    finish({ ok: false, code: 'read_cancelled', message: '' });
    await flushPromises();
    expect(fromFile(wrapper, 'notes').attributes('disabled')).toBeUndefined();
  });
});

describe('the prep doc (3.10)', () => {
  beforeEach(() => setActivePinia(createPinia()));

  const prep = (over: Partial<NonNullable<DocumentsView['prepDoc']>> = {}): DocumentsView['prepDoc'] => ({
    name: 'system-design.pdf',
    text: 'Caching\nLoad balancing',
    cut: false,
    savedAt: 1,
    ...over,
  });

  it('shows its file name and its count against 100,000, and says when only its start was kept', async () => {
    const { row, wrapper } = await prepare({ prepDoc: prep({ cut: true }) });

    expect(row('Prep doc').find('.preview').text()).toBe('system-design.pdf');
    expect(row('Prep doc').find('.num').text()).toBe('22 / 100,000');
    expect(wrapper.text()).toContain('Longer than 100,000 characters, so only its start is kept');
  });

  it("says what one is when there's none", async () => {
    const { row } = await prepare();
    expect(row('Prep doc').find('.preview').text()).toContain('Not added. A longer document to draw on');
    expect(
      row('Prep doc')
        .findAll('button')
        .map((b) => b.text()),
    ).toEqual(['From a file', 'Add']);
  });

  it('read from a file, keeps its name and whether it was cut', async () => {
    const readDocument = vi.fn<AppApi['readDocument']>(async () => ({
      ok: true,
      text: 'The start.',
      name: 'notes.docx',
      cut: true,
    }));
    const setPrepDoc = vi.fn<AppApi['setPrepDoc']>(async () => ({ ok: true }));
    const { wrapper, button } = await prepare({}, { ok: true }, { readDocument, setPrepDoc });

    await wrapper.find('button[aria-label="Read the prep doc from a file"]').trigger('click');
    await flushPromises();
    expect(wrapper.text()).toContain('notes.docx');
    expect(wrapper.text()).toContain('so it was cut at a line break');
    await button('Save').trigger('click');
    await flushPromises();

    expect(readDocument).toHaveBeenCalledWith('prepDoc');
    expect(setPrepDoc).toHaveBeenCalledWith({ text: 'The start.', name: 'notes.docx', cut: true });
  });

  it('edited, keeps its name and its cut; typed new, has neither', async () => {
    const setPrepDoc = vi.fn<AppApi['setPrepDoc']>(async () => ({ ok: true }));
    const kept = await prepare({ prepDoc: prep({ cut: true }) }, { ok: true }, { setPrepDoc });
    await kept.wrapper.find('button[aria-label="Edit the prep doc"]').trigger('click');
    await kept.wrapper.find('textarea').setValue('Caching, edited');
    await kept.button('Save').trigger('click');
    await flushPromises();
    expect(setPrepDoc).toHaveBeenCalledWith({ text: 'Caching, edited', name: 'system-design.pdf', cut: true });

    setActivePinia(createPinia());
    const typed = await prepare({}, { ok: true }, { setPrepDoc });
    await typed.wrapper.find('button[aria-label="Add the prep doc"]').trigger('click');
    await typed.wrapper.find('textarea').setValue('My own notes');
    await typed.button('Save').trigger('click');
    await flushPromises();
    expect(setPrepDoc).toHaveBeenLastCalledWith({ text: 'My own notes', name: '', cut: false });
  });

  it('emptied, is removed', async () => {
    const setPrepDoc = vi.fn<AppApi['setPrepDoc']>(async () => ({ ok: true }));
    const { wrapper, button } = await prepare({ prepDoc: prep() }, { ok: true }, { setPrepDoc });

    await wrapper.find('button[aria-label="Edit the prep doc"]').trigger('click');
    await wrapper.find('textarea').setValue('   ');
    await button('Save').trigger('click');
    await flushPromises();

    expect(setPrepDoc).toHaveBeenCalledWith({ text: '', name: '', cut: false });
  });

  it('typed past 100,000 characters is refused with the limit named: only a file is ever cut', async () => {
    const setPrepDoc = vi.fn<AppApi['setPrepDoc']>(async () => ({ ok: true }));
    const { wrapper, button } = await prepare({}, { ok: true }, { setPrepDoc });

    await wrapper.find('button[aria-label="Add the prep doc"]').trigger('click');
    await wrapper.find('textarea').setValue('p'.repeat(100_001));

    expect(wrapper.text()).toContain('Shorten it by 1 character. Nothing has been cut.');
    expect(button('Save').attributes('disabled')).toBeDefined();
    expect(setPrepDoc).not.toHaveBeenCalled();
  });
});
