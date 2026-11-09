// The first run (1.14, the canvas's F1): v1's setup wizard re-made for v2, in five steps in the app window. It opens by
// itself until it has been finished once, and Help runs it again. Its texts are here, so main and the window agree on
// the version the user acknowledged: a new wording is a new version, and asks again.
import type { Problem } from './app-state';

/**
 * What goes where, the first step's words: the canvas's, from the handoff's §10 draft. "A draft for layout; the final
 * words wait for legal review" (roadmap 4.8). Change a word, raise the version: the notice is acknowledged again.
 */
export const notice = {
  version: 1,
  heading: 'Before your first session: what goes where',
  lede: 'A draft for layout; the final words wait for legal review.',
  rows: [
    {
      icon: 'computer',
      title: 'On this computer',
      body: 'Your history, documents and prepared answers, encrypted. Transcripts and recordings only if you turn them on.',
    },
    {
      icon: 'server',
      title: "To Sotto's server",
      body: "The interviewer's voice (never your microphone), your documents' text and what you type. Used for the session, never stored.",
    },
    {
      icon: 'cloud',
      title: 'To OpenAI, which writes the answers and transcribes the interviewer',
      body: 'Your documents, what the interviewer says, the questions and the answers, with nothing that identifies you. OpenAI may keep them for up to 30 days to watch for abuse, then deletes them.',
    },
  ],
} as const;

export const setupSteps = [
  'What goes where',
  'Sign in',
  'Your documents',
  'Sound check',
  'Hotkeys and hiding',
] as const;

export interface FirstRunView {
  /** The notice in its current version has been acknowledged: no live session starts before (J2). */
  acknowledged: boolean;
  /** The wizard has been finished once: until then it opens by itself. */
  finished: boolean;
  /** "It's hidden" was chosen in Test hiding. */
  hidingTested: boolean;
}

export const initialFirstRun: FirstRunView = { acknowledged: false, finished: false, hidingTested: false };

/** The sound check (step 4) as the setup window shows it: a short live session, heard here instead of the overlay. */
export interface SoundCheckView {
  phase: 'idle' | 'starting' | 'live' | 'ended';
  heard: { finished: string; live: string };
  /** The meter, as the overlay's: null until capture reports. */
  level: number | null;
  /** Nothing heard 20 s after capture opened (Q18's rule). */
  noSound: boolean;
  /** The capture device was lost; it is being reopened. */
  down: boolean;
  /** Words have come: the check passed. */
  heardSomething: boolean;
  startedAtMs: number | null;
  /** Why it couldn't start, or why it ended early, in the server's or the app's words. */
  problem: Problem | null;
}

export const idleSoundCheck: SoundCheckView = {
  phase: 'idle',
  heard: { finished: '', live: '' },
  level: null,
  noSound: false,
  down: false,
  heardSomething: false,
  startedAtMs: null,
  problem: null,
};
