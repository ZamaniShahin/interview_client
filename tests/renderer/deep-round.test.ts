// @vitest-environment happy-dom
// The deep round over 3.6, 3.8 and 3.10 (Shahin's, 2026-11-11), on screen: the 📌 card in every ending of its answer,
// and the screenshots' images in every state main can leave them in.
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AnswerKind } from '../../src/shared/contracts/sotto-contracts';
import type { AnswerView } from '../../src/shared/live/view-state';
import AnswerCard from '../../src/renderer/overlay/components/AnswerCard.vue';
import AttachmentTray from '../../src/renderer/overlay/components/AttachmentTray.vue';
import ScreenshotStrip from '../../src/renderer/overlay/components/ScreenshotStrip.vue';
import { keepScreenshotImages } from '../../src/renderer/overlay/use-screenshots';

enableAutoUnmount(afterEach);

describe('the 📌 card in every ending of its answer (3.8)', () => {
  const prepared = { phrasing: 'Tell me about yourself', answer: 'I build payment systems.' };
  const card = (over: Partial<AnswerView>, compact = false) =>
    mount(AnswerCard, {
      props: {
        answer: {
          id: 'a',
          question: 'So, tell me about yourself',
          kind: AnswerKind.Spoken,
          instruction: null,
          text: 'The generated answer.',
          ending: 'done',
          failureMessage: null,
          startedAtMs: 0,
          screenshotIds: [],
          prepared,
          ...over,
        } satisfies AnswerView,
        position: 1,
        total: 1,
        lookingBack: false,
        newWriting: false,
        stoppedBefore: null,
        now: 0,
        compact,
      },
    });
  const pinned = (wrapper: ReturnType<typeof card>) => wrapper.find('section[aria-label="Your prepared answer"]');

  it.each<[AnswerView['ending'], string]>([
    ['writing', 'Writing…'],
    ['done', 'The generated answer.'],
    ['stopped', 'Stopped early'],
    ['failed', 'Try again'],
  ])('shows it over the generated answer when that is %s', (ending, shown) => {
    const wrapper = card({ ending, failureMessage: ending === 'failed' ? 'The answer stopped.' : null });
    expect(pinned(wrapper).text()).toContain('I build payment systems.');
    expect(wrapper.text()).toContain(shown);
    expect(wrapper.text().indexOf('Your prepared answer')).toBeLessThan(
      wrapper.text().indexOf('The generated answer.'),
    );
  });

  // Found by this round: a hidden answer took the user's own prepared answer with it.
  it('keeps it when the generated answer is hidden: the user’s own words, never the model’s', () => {
    const wrapper = card({ ending: 'hidden', text: '' });
    expect(pinned(wrapper).text()).toContain('I build payment systems.');
    expect(pinned(wrapper).text()).toContain('for “Tell me about yourself”');
    expect(wrapper.find('[role="status"]').text()).toBe("This answer can't be shown. Try asking another way.");
  });

  it('shows only the notice for a hidden answer that matched nothing', () => {
    const wrapper = card({ ending: 'hidden', text: '', prepared: null });
    expect(pinned(wrapper).exists()).toBe(false);
    expect(wrapper.find('[role="status"]').exists()).toBe(true);
  });

  it('shows it in the compact overlay too', () => {
    expect(pinned(card({}, true)).exists()).toBe(true);
  });

  it.each<[string, string]>([
    ['line breaks', 'First line.\nSecond line.'],
    ['Markdown, as written', '**Go** and `Kafka` in a [link](https://x.test)'],
    ['angle brackets', '<script>alert(1)</script> & <b>bold</b>'],
    ['a long answer', 'word '.repeat(800).trim()],
  ])('shows an answer with %s as plain text, as it was written', (_, text) => {
    const wrapper = card({ prepared: { phrasing: 'Q?', answer: text } });
    const shown = pinned(wrapper).find('.answer');
    expect(shown.text()).toBe(text);
    expect(shown.element.children).toHaveLength(0);
  });
});

describe('a screenshot’s image in every state main leaves it (3.6)', () => {
  const png = 'data:image/png;base64,iVBORw0KGgo=';

  function mainAnswers(answer: (id: string) => Promise<string | null>) {
    const screenshot = vi.fn(answer);
    (window as unknown as { overlayApi: unknown }).overlayApi = { screenshot };
    return screenshot;
  }

  beforeEach(() => keepScreenshotImages([]));

  it('under an answer, shows nothing and offers nothing while the image is on its way', async () => {
    let deliver: (url: string | null) => void = () => {};
    mainAnswers(() => new Promise((resolve) => (deliver = resolve)));
    const wrapper = mount(ScreenshotStrip, { props: { ids: ['shot-a-1'], canAttach: true } });
    expect(wrapper.find('img').exists()).toBe(false);
    expect(wrapper.text()).not.toContain('No longer kept');
    expect(wrapper.find('button').exists()).toBe(false);

    deliver(png);
    await flushPromises();
    expect(wrapper.find('img').attributes('src')).toBe(png);
    expect(wrapper.find('button').attributes('aria-label')).toBe('Attach screenshot 1 again, for your next question');
  });

  it.each<[string, () => Promise<string | null>]>([
    ['one main no longer keeps', async () => null],
    ['one main could not be asked for', async () => Promise.reject(new Error('gone'))],
  ])('under an answer, says %s is no longer kept, and offers nothing', async (_, answer) => {
    mainAnswers(answer);
    const wrapper = mount(ScreenshotStrip, { props: { ids: ['shot-a-1'], canAttach: true } });
    await flushPromises();
    expect(wrapper.text()).toContain('No longer kept');
    expect(wrapper.find('img').exists()).toBe(false);
    expect(wrapper.find('button').exists()).toBe(false);
  });

  it('under an answer, draws each of several in its own state, in order', async () => {
    mainAnswers(async (id) => (id === 'shot-gone-2' ? null : `${png}#${id}`));
    const wrapper = mount(ScreenshotStrip, {
      props: { ids: ['shot-a-1', 'shot-gone-2', 'shot-c-3'], canAttach: true },
    });
    await flushPromises();
    const items = wrapper.findAll('li');
    expect(items.map((li) => (li.find('img').exists() ? li.find('img').attributes('alt') : li.text()))).toEqual([
      'Screenshot 1',
      'No longer kept',
      'Screenshot 3',
    ]);
    expect(wrapper.findAll('button').map((b) => b.attributes('aria-label'))).toEqual([
      'Attach screenshot 1 again, for your next question',
      'Attach screenshot 3 again, for your next question',
    ]);
  });

  it('over the ask bar, keeps a place for an image on its way, and still offers to take it back', async () => {
    mainAnswers(() => new Promise(() => {}));
    const wrapper = mount(AttachmentTray, { props: { ids: ['shot-a-1'], max: 5, manual: true } });
    expect(wrapper.find('.missing').exists()).toBe(true);
    await wrapper.find('button').trigger('click');
    expect(wrapper.emitted('remove')).toEqual([['shot-a-1']]);
  });

  it.each<[number, number]>([
    [1, 1],
    [1, 5],
    [5, 5],
  ])('over the ask bar, counts %i of %i', (count, max) => {
    mainAnswers(async () => png);
    const ids = Array.from({ length: count }, (_, i) => `shot-${i}`);
    const wrapper = mount(AttachmentTray, { props: { ids, max, manual: false } });
    expect(wrapper.text()).toContain(`${count} of ${max}`);
    expect(wrapper.findAll('button').map((b) => b.attributes('aria-label'))).toEqual(
      ids.map((_, i) => `Remove screenshot ${i + 1}`),
    );
  });
});
