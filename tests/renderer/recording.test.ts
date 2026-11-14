// @vitest-environment happy-dom
// Recording (3.12, Q51) as the windows show it: the overlay strip's REC mark, and History's recording, listed, saved
// as a WAV where the user chooses, and deleted with its interview.
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppApi } from '../../src/preload/api';
import { initialAppState } from '../../src/shared/app-state';
import { AnswerKind, SessionEndReasons } from '../../src/shared/contracts/sotto-contracts';
import type { InterviewSummary, InterviewView } from '../../src/shared/history';
import type { RecordingState } from '../../src/shared/live/view-state';
import { useAppStore } from '../../src/renderer/app/app-store';
import HistoryPage from '../../src/renderer/app/pages/HistoryPage.vue';
import StatusStrip from '../../src/renderer/overlay/components/StatusStrip.vue';
import { fakeAppApi } from './fake-app-api';

enableAutoUnmount(afterEach);

describe("the strip's REC mark", () => {
  const strip = (recording?: RecordingState, paused = false) =>
    mount(StatusStrip, {
      props: {
        auto: true,
        autoAvailable: true,
        paused,
        interviewType: 'technical',
        disabled: false,
        minutesLeft: 30,
        tier: 'smart',
        ...(recording ? { recording } : {}),
      },
    });

  const held = 'Recording paused: nothing is recorded until you resume';

  it.each<[RecordingState | undefined, boolean, string | null, boolean, boolean]>([
    [undefined, false, null, false, false],
    [undefined, true, null, false, false],
    ['off', false, null, false, false],
    ['off', true, null, false, false],
    ['on', false, 'Recording the call and your microphone', false, false],
    ['call-only', false, 'Recording the call only: no microphone', true, false],
    // Paused, nothing is recorded (v1's Stop), whichever sides the recording has: REC stays in its place, held.
    ['on', true, held, false, true],
    ['call-only', true, held, false, true],
  ])('recording %s, paused %s, shows %j', (recording, paused, label, partial, isHeld) => {
    const wrapper = strip(recording, paused);
    const rec = wrapper.find('.rec');

    expect(rec.exists()).toBe(label !== null);
    if (label === null) return;
    expect(rec.text()).toBe('REC');
    expect(rec.attributes('aria-label')).toBe(label);
    expect(rec.classes().includes('partial')).toBe(partial);
    expect(rec.classes().includes('held')).toBe(isHeld);
    // Named, never by a tooltip: a tooltip is a window of its own, and shows in a share.
    expect(wrapper.html()).not.toContain('title=');
  });

  it.each<RecordingState>(['on', 'call-only'])(
    'recording %s: pausing and resuming changes the mark, never where it sits',
    async (recording) => {
      const wrapper = strip(recording);
      const place = () => wrapper.findAll('.stat').map((s) => s.classes().includes('rec'));
      const before = place();

      await wrapper.setProps({ paused: true });
      expect(place()).toEqual(before);
      expect(wrapper.get('.rec').classes()).toContain('held');

      await wrapper.setProps({ paused: false });
      expect(place()).toEqual(before);
      expect(wrapper.get('.rec').classes()).not.toContain('held');
      expect(wrapper.get('.rec').classes().includes('partial')).toBe(recording === 'call-only');
    },
  );
});

const start = new Date(2026, 10, 13, 9, 5).getTime();

const summary = (over: Partial<InterviewSummary> = {}): InterviewSummary => ({
  id: 1,
  kind: 'interview',
  average: null,
  startedAt: start,
  endedAt: start + 32 * 60_000,
  candidate: 'Sam Rivera',
  role: 'Senior Backend Engineer',
  endReason: SessionEndReasons.User,
  answers: 2,
  lines: 0,
  hasDebrief: false,
  ...over,
});

const whole = (over: Partial<InterviewView> = {}): InterviewView => ({
  ...summary(),
  practice: null,
  qa: [{ id: 1, askedAt: start, kind: AnswerKind.Spoken, question: 'Why Kafka?', answer: 'Ordering.' }],
  transcript: [],
  debrief: null,
  ...over,
});

async function page(history: InterviewSummary[], overrides: Partial<AppApi> = {}) {
  setActivePinia(createPinia());
  const fake = fakeAppApi({ ...initialAppState, history }, overrides);
  window.appApi = fake.api;
  await useAppStore().load();
  const wrapper = mount(HistoryPage);
  await flushPromises();
  return { wrapper, ...fake };
}

async function opened(view: InterviewView, overrides: Partial<AppApi> = {}) {
  const openInterview = vi.fn<AppApi['openInterview']>(async () => view);
  const result = await page([view], { openInterview, ...overrides });
  await result.wrapper.find('ul[aria-label="Interviews"] button').trigger('click');
  await flushPromises();
  return result;
}

const button = (wrapper: ReturnType<typeof mount>, text: string) =>
  wrapper.findAll('button').find((b) => b.text() === text);

describe("History's recordings", () => {
  beforeEach(() => setActivePinia(createPinia()));

  it.each<[number | null | undefined, boolean]>([
    [754, true],
    [2, true],
    [0, false],
    [null, false],
    [undefined, false],
  ])('lists an interview recorded for %s seconds with a Recording tag: %s', async (seconds, tagged) => {
    const { wrapper } = await page([summary({ recordingSeconds: seconds })]);

    const row = wrapper.find('ul[aria-label="Interviews"] li');
    expect(row.findAll('.tag').some((t) => t.text() === 'Recording')).toBe(tagged);
  });

  it('opens one with its recording: how long, which side is which, kept here encrypted, and a way to save it', async () => {
    const { wrapper } = await opened(whole({ recordingSeconds: 754 }));

    expect(button(wrapper, 'Save the recording…')).toBeDefined();
    expect(wrapper.text()).toContain('Recorded, 12:34: the call on the left, your microphone on the right.');
    expect(wrapper.text()).toContain('It stays on this computer, encrypted; saving writes a WAV file where you choose.');
  });

  it('opens one without a recording with no word of one', async () => {
    const { wrapper } = await opened(whole());

    expect(button(wrapper, 'Save the recording…')).toBeUndefined();
    expect(wrapper.text()).not.toContain('Recorded');
  });

  it('saves it through main, says Saved, and is ready to save again', async () => {
    const saveRecording = vi.fn<AppApi['saveRecording']>(async () => ({ ok: true }));
    const { wrapper } = await opened(whole({ recordingSeconds: 60 }), { saveRecording });

    await button(wrapper, 'Save the recording…')!.trigger('click');
    await flushPromises();

    expect(saveRecording).toHaveBeenCalledExactlyOnceWith(1);
    expect(wrapper.text()).toContain('Saved.');
    expect(button(wrapper, 'Save the recording…')!.attributes('disabled')).toBeUndefined();
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
  });

  it('says nothing when the user cancels the save dialog', async () => {
    const saveRecording = vi.fn<AppApi['saveRecording']>(async () => ({
      ok: false,
      code: 'cancelled',
      message: 'Not saved.',
    }));
    const { wrapper } = await opened(whole({ recordingSeconds: 60 }), { saveRecording });

    await button(wrapper, 'Save the recording…')!.trigger('click');
    await flushPromises();

    expect(wrapper.text()).not.toContain('Saved.');
    expect(wrapper.text()).not.toContain('Not saved.');
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
  });

  it.each([
    ['internal', "The recording couldn't be saved there. Try another folder."],
    ['not_found', 'This interview has no recording.'],
    ['already_in_session', 'This waits until the session ends.'],
  ])('says why it was not saved (%s), in main\'s words', async (code, message) => {
    const saveRecording = vi.fn<AppApi['saveRecording']>(async () => ({ ok: false, code, message }));
    const { wrapper } = await opened(whole({ recordingSeconds: 60 }), { saveRecording });

    await button(wrapper, 'Save the recording…')!.trigger('click');
    await flushPromises();

    expect(wrapper.find('[role="alert"]').text()).toBe(message);
    expect(wrapper.text()).not.toContain('Saved.');
  });

  it('shows it is saving, and takes no second click meanwhile', async () => {
    let finish: (value: { ok: true }) => void = () => {};
    const saveRecording = vi.fn<AppApi['saveRecording']>(() => new Promise((resolve) => (finish = resolve)));
    const { wrapper } = await opened(whole({ recordingSeconds: 60 }), { saveRecording });

    await button(wrapper, 'Save the recording…')!.trigger('click');
    const saving = button(wrapper, 'Saving the recording…')!;
    expect(saving.attributes('disabled')).toBeDefined();
    await saving.trigger('click');
    finish({ ok: true });
    await flushPromises();

    expect(saveRecording).toHaveBeenCalledOnce();
    expect(wrapper.text()).toContain('Saved.');
  });

  it('forgets Saved once another interview is opened, or the list', async () => {
    const saveRecording = vi.fn<AppApi['saveRecording']>(async () => ({ ok: true }));
    const { wrapper } = await opened(whole({ recordingSeconds: 60 }), { saveRecording });
    await button(wrapper, 'Save the recording…')!.trigger('click');
    await flushPromises();

    await button(wrapper, 'All interviews')!.trigger('click');
    await wrapper.find('ul[aria-label="Interviews"] button').trigger('click');
    await flushPromises();

    expect(wrapper.text()).not.toContain('Saved.');
  });

  it('asks before deleting, naming the recording that goes with it', async () => {
    const { wrapper } = await opened(whole({ recordingSeconds: 60 }));

    await button(wrapper, 'Delete')!.trigger('click');

    expect(wrapper.text()).toContain('Its answers, transcript, debrief and recording go from this computer.');
  });

  it('asks before deleting one without a recording, as before', async () => {
    const { wrapper } = await opened(whole());

    await button(wrapper, 'Delete')!.trigger('click');

    expect(wrapper.text()).toContain('Its answers, transcript and debrief go from this computer.');
  });

  it.each([
    [[summary({ id: 1, recordingSeconds: 60 }), summary({ id: 2 })], 'All 2 interviews go from this computer, with their debriefs and recordings.'],
    [[summary({ id: 1 }), summary({ id: 2 })], 'All 2 interviews go from this computer, with their debriefs.'],
  ])('asks before deleting all, naming recordings when any were kept', async (history, detail) => {
    const { wrapper } = await page(history);

    await button(wrapper, 'Delete all history')!.trigger('click');

    expect(wrapper.text()).toContain(detail);
  });
});
