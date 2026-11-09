import { describe, expect, it } from 'vitest';
import { NoSoundWatch, noSoundAfterMs } from '../../src/main/capture/no-sound-watch';

describe("the warning that the call's sound isn't reaching Sotto (Q18)", () => {
  it('comes after about 20 s with nothing heard since capture opened', () => {
    expect(noSoundAfterMs).toBe(20_000);
    const watch = new NoSoundWatch();
    watch.opened(0);

    expect(watch.frame(false, 19_900)).toBe(false);
    expect(watch.frame(false, 20_000)).toBe(true);
  });

  it('comes on its own clock too, when no frame arrives at all', () => {
    const watch = new NoSoundWatch();
    watch.opened(1_000);

    expect(watch.warning(20_999)).toBe(false);
    expect(watch.warning(21_000)).toBe(true);
  });

  it('never comes once something was heard: an interviewer listening to a long answer is quiet too', () => {
    const watch = new NoSoundWatch();
    watch.opened(0);
    watch.frame(true, 500);

    expect(watch.frame(false, 60_000)).toBe(false);
    expect(watch.warning(600_000)).toBe(false);
  });

  it('goes away as soon as a sound comes', () => {
    const watch = new NoSoundWatch();
    watch.opened(0);
    expect(watch.frame(false, 25_000)).toBe(true);

    expect(watch.frame(true, 25_100)).toBe(false);
  });

  it('starts over when capture reopens, since the device may have changed', () => {
    const watch = new NoSoundWatch();
    watch.opened(0);
    watch.frame(true, 100);

    watch.opened(30_000);

    expect(watch.warning(49_999)).toBe(false);
    expect(watch.warning(50_000)).toBe(true);
  });

  it('says nothing while capture is closed', () => {
    const watch = new NoSoundWatch();
    expect(watch.warning(100_000)).toBe(false);

    watch.opened(0);
    watch.closed();
    expect(watch.frame(false, 100_000)).toBe(false);
  });
});
