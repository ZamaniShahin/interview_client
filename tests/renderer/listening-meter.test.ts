// @vitest-environment happy-dom
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import ListeningMeter from '../../src/renderer/overlay/components/ListeningMeter.vue';

const heights = (props: { level?: number | null; flat?: boolean }) =>
  mount(ListeningMeter, { props })
    .findAll('i')
    .map((bar) => bar.attributes('style'));

describe('the listening meter', () => {
  it('holds still before capture reports a level', () => {
    expect(heights({ level: null })).toEqual(['height: 5px;', 'height: 9px;', 'height: 12px;', 'height: 7px;']);
  });

  it("follows the call's level, from flat to full", () => {
    expect(heights({ level: 0 })).toEqual(['height: 3px;', 'height: 3px;', 'height: 3px;', 'height: 3px;']);
    expect(heights({ level: 1 })).toEqual(['height: 5px;', 'height: 9px;', 'height: 12px;', 'height: 7px;']);
    expect(heights({ level: 0.5 })).toEqual(['height: 3px;', 'height: 5px;', 'height: 6px;', 'height: 4px;']);
  });

  it('stays inside its box whatever the level says', () => {
    expect(heights({ level: 7 })).toEqual(heights({ level: 1 }));
    expect(heights({ level: -1 })).toEqual(heights({ level: 0 }));
  });

  it('lies flat while nothing is listened to', () => {
    expect(heights({ level: 0.9, flat: true })).toEqual([
      'height: 3px;',
      'height: 3px;',
      'height: 3px;',
      'height: 3px;',
    ]);
  });
});
