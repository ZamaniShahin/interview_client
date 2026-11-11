// @vitest-environment happy-dom
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CommandResult } from '../../src/shared/ipc';
import AskBar from '../../src/renderer/overlay/components/AskBar.vue';
import AttachmentTray from '../../src/renderer/overlay/components/AttachmentTray.vue';
import ScreenshotStrip from '../../src/renderer/overlay/components/ScreenshotStrip.vue';
import { keepScreenshotImages } from '../../src/renderer/overlay/use-screenshots';

/** Main's side of the images: each id's data URL, or null for one no longer kept. */
function mainKeeps(images: Record<string, string | null>) {
  const screenshot = vi.fn(async (id: string) => images[id] ?? null);
  (window as unknown as { overlayApi: unknown }).overlayApi = { screenshot };
  return screenshot;
}

const png = (n: number) => `data:image/png;base64,${btoa(String(n))}`;

// Each test's components go with it: one left mounted would ask main again for its images in the next test.
enableAutoUnmount(afterEach);
beforeEach(() => keepScreenshotImages([]));

describe('the screenshots waiting for the next answer (3.6)', () => {
  it('shows each, asking main for its image once, and how many of how many', async () => {
    const screenshot = mainKeeps({ 'shot-a': png(1), 'shot-b': png(2) });
    const wrapper = mount(AttachmentTray, { props: { ids: ['shot-a', 'shot-b'], max: 5, manual: true } });
    await flushPromises();

    expect(wrapper.findAll('img').map((img) => img.attributes('src'))).toEqual([png(1), png(2)]);
    expect(wrapper.findAll('img').map((img) => img.attributes('alt'))).toEqual(['Screenshot 1', 'Screenshot 2']);
    expect(wrapper.text()).toContain('2 of 5');
    await wrapper.setProps({ ids: ['shot-a', 'shot-b'], max: 5, manual: true });
    expect(screenshot).toHaveBeenCalledTimes(2);
  });

  it('says what comes next, in MANUAL and in AUTO', async () => {
    mainKeeps({});
    const wrapper = mount(AttachmentTray, { props: { ids: ['shot-a'], max: 5, manual: true } });
    expect(wrapper.text()).toContain('Ctrl+Enter answers with them; anything typed goes along as a note.');
    await wrapper.setProps({ manual: false });
    expect(wrapper.text()).toContain('for your next question, which reads them.');
  });

  it('takes one back by its id', async () => {
    mainKeeps({ 'shot-a': png(1), 'shot-b': png(2) });
    const wrapper = mount(AttachmentTray, { props: { ids: ['shot-a', 'shot-b'], max: 5, manual: true } });

    await wrapper.find('button[aria-label="Remove screenshot 2"]').trigger('click');

    expect(wrapper.emitted('remove')).toEqual([['shot-b']]);
  });

  it('names no button with a tooltip: only aria-labels (stealth rule 2)', () => {
    mainKeeps({});
    const wrapper = mount(AttachmentTray, { props: { ids: ['shot-a'], max: 5, manual: true } });
    expect(wrapper.html()).not.toMatch(/\stitle=/);
  });
});

describe('the screenshots an answer read (3.6)', () => {
  it('shows each, and offers to attach one again while there is room', async () => {
    mainKeeps({ 'shot-a': png(1) });
    const wrapper = mount(ScreenshotStrip, { props: { ids: ['shot-a'], canAttach: true } });
    await flushPromises();

    await wrapper.find('button[aria-label="Attach screenshot 1 again, for your next question"]').trigger('click');

    expect(wrapper.find('img').attributes('src')).toBe(png(1));
    expect(wrapper.emitted('attach')).toEqual([['shot-a']]);
  });

  it('offers nothing to attach without room, or for one no longer kept', async () => {
    mainKeeps({ 'shot-a': png(1) });
    const full = mount(ScreenshotStrip, { props: { ids: ['shot-a'], canAttach: false } });
    const gone = mount(ScreenshotStrip, { props: { ids: ['shot-gone'], canAttach: true } });
    await flushPromises();

    expect(full.find('button').exists()).toBe(false);
    expect(gone.find('button').exists()).toBe(false);
    expect(gone.text()).toContain('No longer kept');
  });

  it('lets go of an image nothing names any more, and asks again if it comes back', async () => {
    const screenshot = mainKeeps({ 'shot-a': png(1) });
    mount(ScreenshotStrip, { props: { ids: ['shot-a'], canAttach: true } });
    await flushPromises();

    keepScreenshotImages([]);
    mount(ScreenshotStrip, { props: { ids: ['shot-a'], canAttach: true } });
    await flushPromises();

    expect(screenshot).toHaveBeenCalledTimes(2);
  });
});

describe("the ask bar's screenshot button (3.6)", () => {
  const ok: CommandResult = { ok: true };
  const shoot = (wrapper: ReturnType<typeof mount>) => wrapper.find('button.shoot');

  it('is there only when the overlay can capture', () => {
    expect(
      mount(AskBar, { props: { send: vi.fn() } })
        .find('button.shoot')
        .exists(),
    ).toBe(false);
    expect(shoot(mount(AskBar, { props: { send: vi.fn(), capture: vi.fn() } })).exists()).toBe(true);
  });

  it('in AUTO, sends what is typed as the note, then empties the box', async () => {
    const capture = vi.fn().mockResolvedValue(ok);
    const wrapper = mount(AskBar, { props: { send: vi.fn(), capture } });
    await wrapper.find('textarea').setValue('  the second loop ');

    await shoot(wrapper).trigger('click');
    await flushPromises();

    expect(capture).toHaveBeenCalledWith('the second loop');
    expect((wrapper.find('textarea').element as HTMLTextAreaElement).value).toBe('');
  });

  it('in AUTO with nothing typed, sends no note', async () => {
    const capture = vi.fn().mockResolvedValue(ok);
    await shoot(mount(AskBar, { props: { send: vi.fn(), capture } })).trigger('click');
    expect(capture).toHaveBeenCalledWith(null);
  });

  it('in MANUAL, sends no note and keeps what is typed for the answer', async () => {
    const capture = vi.fn().mockResolvedValue(ok);
    const wrapper = mount(AskBar, { props: { send: vi.fn(), capture, manual: true } });
    await wrapper.find('textarea').setValue('why this loop');

    await shoot(wrapper).trigger('click');
    await flushPromises();

    expect(capture).toHaveBeenCalledWith(null);
    expect((wrapper.find('textarea').element as HTMLTextAreaElement).value).toBe('why this loop');
  });

  it('says why a screenshot made nothing, and nothing for a cancel', async () => {
    const capture = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, code: 'capture_blank', message: 'The screenshot came out blank.' })
      .mockResolvedValueOnce({ ok: false, code: 'capture_cancelled', message: '' });
    const wrapper = mount(AskBar, { props: { send: vi.fn(), capture } });

    await shoot(wrapper).trigger('click');
    await flushPromises();
    expect(wrapper.find('[role="status"]').text()).toBe('The screenshot came out blank.');

    await wrapper.setProps({
      capture: vi.fn().mockResolvedValue({ ok: false, code: 'capture_cancelled', message: '' }),
    });
    await shoot(wrapper).trigger('click');
    await flushPromises();
    expect(wrapper.find('[role="status"]').text()).toBe('The screenshot came out blank.');
  });

  it('keeps a note over 500 characters, and says so, capturing nothing', async () => {
    const capture = vi.fn().mockResolvedValue(ok);
    const wrapper = mount(AskBar, { props: { send: vi.fn(), capture } });
    await wrapper.find('textarea').setValue('n'.repeat(501));

    await shoot(wrapper).trigger('click');
    await flushPromises();

    expect(capture).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain("A screenshot's note is 500 characters at most.");
  });

  it('waits while the connection is gone or the session starts', () => {
    expect(
      shoot(mount(AskBar, { props: { send: vi.fn(), capture: vi.fn(), waiting: true } })).attributes('disabled'),
    ).toBeDefined();
    expect(
      shoot(mount(AskBar, { props: { send: vi.fn(), capture: vi.fn(), disabled: true } })).attributes('disabled'),
    ).toBeDefined();
  });

  it('says what pressing it does, in each mode, with its key', async () => {
    const wrapper = mount(AskBar, { props: { send: vi.fn(), capture: vi.fn(), manual: true } });
    expect(shoot(wrapper).attributes('aria-label')).toBe(
      'Screenshot of an area, for your next question (Ctrl+Shift+G)',
    );
    await wrapper.setProps({ manual: false });
    expect(shoot(wrapper).attributes('aria-label')).toContain('answered at once (Ctrl+Shift+G)');
  });

  it('with screenshots attached, answers with them, what is typed their note', async () => {
    const wrapper = mount(AskBar, { props: { send: vi.fn(), capture: vi.fn(), manual: true, attached: 2 } });
    const answer = wrapper.findAll('button').find((b) => b.text().startsWith('Answer'))!;
    expect(answer.text()).toContain('Answer with the screenshots');
    expect(wrapper.find('textarea').attributes('placeholder')).toBe('A note for the screenshots, if you like');
  });

  it('captures from the hotkey too, as the button does', async () => {
    const capture = vi.fn().mockResolvedValue(ok);
    const wrapper = mount(AskBar, { props: { send: vi.fn(), capture } });
    await wrapper.find('textarea').setValue('this one');

    await (wrapper.vm as unknown as { captureNow: () => Promise<void> }).captureNow();

    expect(capture).toHaveBeenCalledWith('this one');
  });
});
