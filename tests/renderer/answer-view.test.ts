// @vitest-environment happy-dom
import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import AnswerBody from '../../src/renderer/overlay/components/AnswerBody.vue';
import AnswerCard from '../../src/renderer/overlay/components/AnswerCard.vue';
import AnswerCode from '../../src/renderer/overlay/components/AnswerCode.vue';
import AnswerDiagram from '../../src/renderer/overlay/components/AnswerDiagram.vue';
import type { DiagramDrawer } from '../../src/renderer/shared/diagram';
import { AnswerKind } from '../../src/shared/contracts/sotto-contracts';
import type { AnswerView } from '../../src/shared/live/view-state';

let copied: string[];
beforeEach(() => {
  copied = [];
  (window as unknown as { overlayApi: { copy: (text: string) => void } }).overlayApi = {
    copy: (text) => copied.push(text),
  };
});

describe("a code block's Copy (1.13)", () => {
  afterEach(() => vi.useRealTimers());

  const block = (code = 'print("swiss")\n') =>
    mount(AnswerCode, {
      props: { language: 'Python', code, html: '<span class="hljs-built_in">print</span>("swiss")\n' },
    });

  it('copies the source as the model wrote it, says so for a moment, then offers Copy again', async () => {
    vi.useFakeTimers();
    const wrapper = block();

    await wrapper.find('button').trigger('click');

    expect(copied).toEqual(['print("swiss")\n']);
    expect(wrapper.find('button').text()).toBe('Copied');
    vi.advanceTimersByTime(1500);
    await nextTick();
    expect(wrapper.find('button').text()).toBe('Copy');
  });

  it('shows the language and the colored text, and names the button for screen readers, with no tooltip', () => {
    const wrapper = block();
    expect(wrapper.find('.code-head').text()).toContain('Python');
    expect(wrapper.find('pre code .hljs-built_in').text()).toBe('print');
    expect(wrapper.find('button').attributes('aria-label')).toBe('Copy the Python code');
    expect(wrapper.find('[title]').exists()).toBe(false);
  });

  it('has nothing to copy for an empty block', async () => {
    const wrapper = block('');
    expect(wrapper.find('button').attributes('disabled')).toBeDefined();
    await wrapper.find('button').trigger('click');
    expect(copied).toEqual([]);
  });
});

/** A drawer whose drawing the test finishes: `finish(svg)`, or `finish(null)` for a source it can't draw. */
function fakeDrawer(ready?: string | null) {
  let finish: (svg: string | null) => void = () => {};
  const asked: string[] = [];
  const drawer: DiagramDrawer = {
    drawn: () => ready,
    draw: (source) => {
      asked.push(source);
      return new Promise((resolve) => (finish = resolve));
    },
  };
  return { drawer, asked, finish: (svg: string | null) => finish(svg) };
}

const source = 'flowchart LR\n  A[User] --> B[API]\n';

describe("an answer's diagram (1.13)", () => {
  it('holds its place with words while the diagram streams in, and draws nothing yet', () => {
    const fake = fakeDrawer();
    const wrapper = mount(AnswerDiagram, { props: { source, complete: false, writing: true, drawer: fake.drawer } });

    expect(wrapper.text()).toBe('Drawing the diagram…');
    expect(fake.asked).toEqual([]);
  });

  it('draws it once its fence has closed', async () => {
    const fake = fakeDrawer();
    const wrapper = mount(AnswerDiagram, { props: { source, complete: true, writing: true, drawer: fake.drawer } });
    expect(wrapper.text()).toBe('Drawing the diagram…');

    fake.finish('<svg><text>User</text></svg>');
    await flushPromises();

    expect(fake.asked).toEqual([source]);
    expect(wrapper.find('.dia[role="img"] svg text').text()).toBe('User');
  });

  it("shows its source as a Diagram code block, with Copy, when Mermaid can't draw it", async () => {
    const fake = fakeDrawer();
    const wrapper = mount(AnswerDiagram, { props: { source, complete: true, writing: false, drawer: fake.drawer } });

    fake.finish(null);
    await flushPromises();

    expect(wrapper.find('.code-head').text()).toContain('Diagram');
    expect(wrapper.find('pre code').text()).toBe(source.trimEnd());
    expect(wrapper.find('button').text()).toBe('Copy');
  });

  it('shows its source when the answer stopped in the middle of it', () => {
    const fake = fakeDrawer();
    const wrapper = mount(AnswerDiagram, { props: { source, complete: false, writing: false, drawer: fake.drawer } });

    expect(wrapper.find('.code-head').text()).toContain('Diagram');
    expect(fake.asked).toEqual([]);
  });

  it('uses a drawing it already has, without drawing again', () => {
    const fake = fakeDrawer('<svg><text>Kept</text></svg>');
    const wrapper = mount(AnswerDiagram, { props: { source, complete: true, writing: false, drawer: fake.drawer } });

    expect(wrapper.find('svg text').text()).toBe('Kept');
    expect(fake.asked).toEqual([]);
  });

  it('asks for the drawing again when the theme changes, since its colors may have', async () => {
    const fake = fakeDrawer();
    mount(AnswerDiagram, { props: { source, complete: true, writing: false, drawer: fake.drawer } });

    document.documentElement.classList.toggle('theme-light');
    await flushPromises();
    document.documentElement.classList.toggle('theme-light');
    await flushPromises();

    expect(fake.asked.length).toBe(3);
  });
});

describe("an answer's text, in parts (1.13)", () => {
  it('shows prose, then the code with its Copy, then a diagram still streaming', () => {
    const wrapper = mount(AnswerBody, {
      props: {
        text: 'Use a ***counter***.\n\n```python\nn += 1\n```\n\n```mermaid\nflowchart LR\n  A --> B',
        writing: true,
      },
    });

    const parts = wrapper.findAll('.answer > *');
    expect(parts.map((part) => part.classes()[0])).toEqual(['prose', 'code', 'dia']);
    expect(wrapper.find('.prose .kw').text()).toBe('counter');
    expect(wrapper.find('.code button').text()).toBe('Copy');
    expect(wrapper.find('.dia').text()).toBe('Drawing the diagram…');
  });
});

const answer = (text: string, id = 'a', ending: AnswerView['ending'] = 'writing'): AnswerView => ({
  id,
  question: 'How would you shard it?',
  kind: AnswerKind.Spoken,
  instruction: null,
  text,
  ending,
  failureMessage: null,
  startedAtMs: 0,
  screenshotIds: [],
  prepared: null,
});

describe('a long answer (1.13)', () => {
  const card = () => {
    const wrapper = mount(AnswerCard, {
      props: {
        answer: answer('First.'),
        position: 1,
        total: 1,
        lookingBack: false,
        newWriting: false,
        stoppedBefore: null,
        now: 0,
        compact: false,
      },
    });
    const body = wrapper.find('.body').element as HTMLElement;
    // happy-dom lays nothing out: the body is given a height and content taller than it.
    Object.defineProperty(body, 'clientHeight', { configurable: true, get: () => 200 });
    Object.defineProperty(body, 'scrollHeight', { configurable: true, get: () => 1000 });
    const scrollTo = async (top: number) => {
      body.scrollTop = top;
      await wrapper.find('.body').trigger('scroll');
    };
    return { wrapper, body, scrollTo };
  };

  it('follows the newest line while the reader is at the bottom', async () => {
    const { wrapper, body, scrollTo } = card();
    await scrollTo(800);

    await wrapper.setProps({ answer: answer('First. Then more.') });

    expect(body.scrollTop).toBe(1000);
    expect(wrapper.find('.below').exists()).toBe(false);
  });

  it('keeps the place of a reader who scrolled up, and offers the new text below', async () => {
    const { wrapper, body, scrollTo } = card();
    await scrollTo(100);

    await wrapper.setProps({ answer: answer('First. Then more.') });

    expect(body.scrollTop).toBe(100);
    expect(wrapper.find('.below').text()).toBe('New text below');
  });

  it('takes the reader down to the new text, and follows again', async () => {
    const { wrapper, body, scrollTo } = card();
    await scrollTo(100);
    await wrapper.setProps({ answer: answer('First. Then more.') });

    await wrapper.find('.below').trigger('click');
    await wrapper.setProps({ answer: answer('First. Then more. And more.') });

    expect(body.scrollTop).toBe(1000);
    expect(wrapper.find('.below').exists()).toBe(false);
  });

  it('lets the offer go once the reader scrolls back down', async () => {
    const { wrapper, scrollTo } = card();
    await scrollTo(100);
    await wrapper.setProps({ answer: answer('First. Then more.') });

    await scrollTo(790);

    expect(wrapper.find('.below').exists()).toBe(false);
  });

  it('starts another answer at its top, followed', async () => {
    const { wrapper, body, scrollTo } = card();
    await scrollTo(100);
    await wrapper.setProps({ answer: answer('First. Then more.') });

    await wrapper.setProps({ answer: answer('A new one.', 'b') });

    expect(body.scrollTop).toBe(0);
    expect(wrapper.find('.below').exists()).toBe(false);
  });
});
