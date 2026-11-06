// @vitest-environment happy-dom
import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import { AskMode } from '../../src/shared/contracts/sotto-contracts';
import AskBar from '../../src/renderer/overlay/components/AskBar.vue';

const answerButton = (wrapper: ReturnType<typeof mount>) =>
  wrapper.findAll('button').find((b) => b.text().startsWith('Answer'))!;

describe('the ask bar', () => {
  it('names the limit, keeps the text and waits, when a Tip is too long', async () => {
    const send = vi.fn().mockResolvedValue(true);
    const wrapper = mount(AskBar, { props: { send } });
    await wrapper.findAll('button').find((b) => b.text() === 'Tip')!.trigger('click');
    await wrapper.find('textarea').setValue('x'.repeat(1_001));

    expect(wrapper.text()).toContain('Shorten it by 1 character. Nothing has been cut.');
    expect(answerButton(wrapper).attributes('disabled')).toBeDefined();
    expect((wrapper.find('textarea').element as HTMLTextAreaElement).value).toHaveLength(1_001);
  });

  it('sends what is typed with Ctrl+Enter, in the chosen mode, and empties the box', async () => {
    const send = vi.fn().mockResolvedValue(true);
    const wrapper = mount(AskBar, { props: { send } });
    await wrapper.find('textarea').setValue('What is a mutex?');
    await wrapper.find('textarea').trigger('keydown', { key: 'Enter', ctrlKey: true });
    await vi.waitFor(() => expect(send).toHaveBeenCalledWith(AskMode.Question, 'What is a mutex?'));
    await vi.waitFor(() => expect((wrapper.find('textarea').element as HTMLTextAreaElement).value).toBe(''));
  });

  it('is the trigger when nothing is typed', async () => {
    const send = vi.fn().mockResolvedValue(true);
    const wrapper = mount(AskBar, { props: { send, manual: true } });
    expect(answerButton(wrapper).text()).toContain('Answer what was heard');
    await answerButton(wrapper).trigger('click');
    expect(send).toHaveBeenCalledWith(AskMode.Question, '');
  });

  it('keeps what is typed when the connection is gone, and says so', async () => {
    const wrapper = mount(AskBar, { props: { send: vi.fn(), waiting: true } });
    await wrapper.find('textarea').setValue('kept');
    expect(answerButton(wrapper).attributes('disabled')).toBeDefined();
    expect(wrapper.text()).toContain('Anything you type is kept.');
  });
});
