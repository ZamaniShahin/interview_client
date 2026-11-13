// @vitest-environment happy-dom
// The deep round over Q47 in the overlay's components (2026-11-13): the strip in every state it can be in, and the
// answer card under long random runs of growth and scrolling, which must never move the reader (v1 0.4.0).
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { AnswerKind } from '../../src/shared/contracts/sotto-contracts';
import type { AnswerView } from '../../src/shared/live/view-state';
import AnswerCard from '../../src/renderer/overlay/components/AnswerCard.vue';
import StatusStrip from '../../src/renderer/overlay/components/StatusStrip.vue';

type StripProps = InstanceType<typeof StatusStrip>['$props'];

const states: StripProps[] = [];
for (const auto of [true, false])
  for (const autoAvailable of [true, false])
    for (const paused of [true, false])
      for (const interviewType of ['technical', 'intro'] as const)
        for (const disabled of [true, false])
          for (const tier of [null, 'fast', 'smart'] as const)
            for (const minutesLeft of [null, 0, 10, 11, 120])
              states.push({ auto, autoAvailable, paused, interviewType, disabled, tier, minutesLeft } as StripProps);

describe('the strip in every state', () => {
  it.each(states.map((s, i) => [i, s] as const))('state %i draws what it is', async (_, props) => {
    const wrapper = mount(StatusStrip, { props });
    const mode = wrapper.get('[aria-label="Answer mode"]').findAll('button');
    const type = wrapper.get('[aria-label="Interview type"]').findAll('button');

    // AUTO or MANUAL: AUTO shows only when it can work.
    const autoShown = props.auto && props.autoAvailable;
    expect(mode.map((b) => b.attributes('aria-pressed'))).toEqual([String(autoShown), String(!autoShown)]);
    expect(mode[0]!.attributes('disabled') !== undefined).toBe(props.disabled || !props.autoAvailable);
    expect(mode[1]!.attributes('disabled') !== undefined).toBe(props.disabled);

    // Pause or Resume, by name, never by tooltip.
    const pause = wrapper.get(`button[aria-label="${props.paused ? 'Resume' : 'Pause'}"]`);
    expect(pause.attributes('disabled') !== undefined).toBe(props.disabled);
    expect(wrapper.html()).not.toContain('title=');

    // TECH or INTRO: the server's word.
    expect(type.map((b) => b.text())).toEqual(['TECH', 'INTRO']);
    expect(type.map((b) => b.attributes('aria-pressed'))).toEqual(
      props.interviewType === 'technical' ? ['true', 'false'] : ['false', 'true'],
    );
    expect(type.every((b) => (b.attributes('disabled') !== undefined) === props.disabled)).toBe(true);

    // A click asks only for the other type, and only when the strip can be used.
    await type[props.interviewType === 'technical' ? 1 : 0]!.trigger('click');
    await type[props.interviewType === 'technical' ? 0 : 1]!.trigger('click');
    expect(wrapper.emitted('setInterviewType')).toEqual(
      props.disabled ? undefined : [[props.interviewType === 'technical' ? 'intro' : 'technical']],
    );

    // Minutes and tier.
    const stats = wrapper.findAll('.stat').map((s) => s.text());
    expect(stats.includes(`${props.minutesLeft} min`)).toBe(props.minutesLeft !== null);
    if (props.minutesLeft !== null) {
      expect(wrapper.find('.stat.num').classes().includes('on')).toBe(props.minutesLeft <= 10);
    }
    expect(stats.includes('Fast')).toBe(props.tier === 'fast');
    expect(stats.includes('Smart')).toBe(props.tier === 'smart');
  });
});

/** A seeded generator (mulberry32). */
function generator(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const answer = (text: string, id = 'a'): AnswerView => ({
  id,
  question: 'How does it scale?',
  kind: AnswerKind.Spoken,
  instruction: null,
  text,
  ending: 'writing',
  failureMessage: null,
  startedAtMs: 0,
  screenshotIds: [],
  prepared: null,
});

describe('the answer card under random growth and scrolling', () => {
  it.each(Array.from({ length: 30 }, (_, i) => i + 1))('run %i never moves the reader', async (seed) => {
    const random = generator(seed);
    const wrapper = mount(AnswerCard, {
      props: {
        answer: answer('A'),
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
    let height = 600;
    Object.defineProperty(body, 'clientHeight', { configurable: true, get: () => 200 });
    Object.defineProperty(body, 'scrollHeight', { configurable: true, get: () => height });
    let text = 'A';
    let reader = 0;
    let offered = false;
    const atBottom = () => height - reader - 200 < 24;

    for (let step = 0; step < 40; step++) {
      const r = random();
      if (r < 0.5) {
        // The answer grows.
        text += ' more';
        height += Math.floor(random() * 120);
        await wrapper.setProps({ answer: answer(text) });
        if (!atBottom()) offered = true;
      } else if (r < 0.8) {
        // The reader scrolls by hand.
        reader = Math.floor(random() * Math.max(height - 200, 1));
        body.scrollTop = reader;
        await wrapper.find('.body').trigger('scroll');
        if (atBottom()) offered = false;
      } else if (wrapper.find('.below').exists()) {
        // The reader takes the offer: down once.
        await wrapper.find('.below').trigger('click');
        reader = height;
        offered = false;
      }

      expect(body.scrollTop).toBe(reader);
      expect(wrapper.find('.below').exists()).toBe(offered);
    }
  });
});
