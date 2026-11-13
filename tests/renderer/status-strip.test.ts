// @vitest-environment happy-dom
// The overlay's strip (Q47 adds TECH / INTRO): the switch shows the type the server last said, a click asks for the
// other one and flips nothing itself, and at the overlay's narrowest every control still fits.
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import StatusStrip from '../../src/renderer/overlay/components/StatusStrip.vue';

type Props = InstanceType<typeof StatusStrip>['$props'];

const strip = (props: Partial<Props> = {}) =>
  mount(StatusStrip, {
    props: {
      auto: true,
      autoAvailable: true,
      paused: false,
      interviewType: 'technical',
      disabled: false,
      minutesLeft: 42,
      tier: 'smart',
      ...props,
    } as Props,
  });

const typeButtons = (wrapper: ReturnType<typeof strip>) =>
  wrapper.get('[aria-label="Interview type"]').findAll('button');

describe("the strip's interview type", () => {
  it.each([
    ['technical', ['true', 'false']],
    ['intro', ['false', 'true']],
  ] as const)('shows %s as the chosen one', (interviewType, pressed) => {
    const buttons = typeButtons(strip({ interviewType }));

    expect(buttons.map((b) => b.text())).toEqual(['TECH', 'INTRO']);
    expect(buttons.map((b) => b.attributes('aria-pressed'))).toEqual(pressed);
  });

  it.each([
    ['technical', 1, 'intro'],
    ['intro', 0, 'technical'],
  ] as const)('on %s, a click on the other asks for %s', async (interviewType, other, asked) => {
    const wrapper = strip({ interviewType });

    await typeButtons(wrapper)[other]!.trigger('click');

    expect(wrapper.emitted('setInterviewType')).toEqual([[asked]]);
  });

  it('asks for nothing when the chosen one is clicked again', async () => {
    const wrapper = strip({ interviewType: 'intro' });

    await typeButtons(wrapper)[1]!.trigger('click');

    expect(wrapper.emitted('setInterviewType')).toBeUndefined();
  });

  it('flips nothing by itself: what it shows changes only with its prop, the server word', async () => {
    const wrapper = strip({ interviewType: 'technical' });
    await typeButtons(wrapper)[1]!.trigger('click');

    expect(typeButtons(wrapper).map((b) => b.attributes('aria-pressed'))).toEqual(['true', 'false']);
    await wrapper.setProps({ interviewType: 'intro' });
    expect(typeButtons(wrapper).map((b) => b.attributes('aria-pressed'))).toEqual(['false', 'true']);
  });

  it('is disabled with the other controls, and asks for nothing then', async () => {
    const wrapper = strip({ disabled: true });

    expect(typeButtons(wrapper).every((b) => b.attributes('disabled') !== undefined)).toBe(true);
    await typeButtons(wrapper)[1]!.trigger('click');
    expect(wrapper.emitted('setInterviewType')).toBeUndefined();
  });

  it('can be changed in MANUAL and while paused alike', async () => {
    const wrapper = strip({ auto: false, paused: true });

    await typeButtons(wrapper)[1]!.trigger('click');

    expect(wrapper.emitted('setInterviewType')).toEqual([['intro']]);
  });
});

describe("the strip's other controls, with the switch in", () => {
  it('keeps AUTO / MANUAL and pause working', async () => {
    const wrapper = strip();

    await wrapper.get('[aria-label="Answer mode"]').findAll('button')[1]!.trigger('click');
    await wrapper.get('button[aria-label="Pause"]').trigger('click');

    expect(wrapper.emitted('setAuto')).toEqual([[false]]);
    expect(wrapper.emitted('togglePause')).toEqual([[]]);
  });

  it('names Pause and Resume for screen readers even when narrow shows their icon only, and has no tooltip', () => {
    const paused = strip({ paused: true });
    const running = strip();

    expect(paused.get('button[aria-label="Resume"]').text()).toBe('Resume');
    expect(running.get('button[aria-label="Pause"]').text()).toBe('Pause');
    expect(running.html()).not.toContain('title=');
  });

  it('marks what narrow hides: the words of Pause and the tier, never a control', () => {
    const wrapper = strip({ tier: 'fast' });

    expect(wrapper.findAll('.word').map((w) => w.text())).toEqual(['Pause']);
    expect(wrapper.find('.tier').text()).toContain('Fast');
    expect(wrapper.find('[aria-label="Interview type"]').classes()).not.toContain('tier');
  });
});
