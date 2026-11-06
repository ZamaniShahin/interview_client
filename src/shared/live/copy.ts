// The overlay's words for states and endings, in one place (design handoff §10; the UI canvas, "Minutes and endings").
// Calm, brief, second person; no exclamation marks, no jargon.
import { SessionEndReasons } from '../contracts/sotto-contracts';
import type { LiveViewState } from './view-state';

const endings: Record<string, string> = {
  [SessionEndReasons.User]: 'Session ended.',
  [SessionEndReasons.CreditExhausted]: 'The session ended: no minutes left.',
  [SessionEndReasons.MaxLength]: "The session reached your plan's longest session.",
  [SessionEndReasons.Inactive]: 'The session ended: nothing was heard for a while.',
  [SessionEndReasons.OpenedElsewhere]: 'The session moved to another device.',
  [SessionEndReasons.CostLimit]: 'The session reached its limit.',
  [SessionEndReasons.Expired]: 'The connection was lost for too long. Start a new session to continue.',
  [SessionEndReasons.Suspended]: 'Your account is suspended.',
};

/** Why the session ended, in plain words. An unknown reason (a newer server) still reads calmly. */
export function endedText(reason: string | null): string {
  return (reason && endings[reason]) ?? 'Session ended.';
}

export type BannerIcon = 'attention' | 'info' | 'pause' | 'reconnect' | 'clock' | 'bolt';

export interface OverlayBanner {
  icon: BannerIcon;
  /** The bold first words. */
  lead: string;
  rest: string;
}

/**
 * The one banner the overlay shows under its strip, most important first. Ended sessions have their own panel, and a
 * failed or hidden answer says so in its card, so neither is here.
 */
export function overlayBanner(state: LiveViewState): OverlayBanner | null {
  if (state.phase === 'ended' || state.phase === 'idle') return null;
  if (state.phase === 'reconnecting') {
    return { icon: 'reconnect', lead: 'Reconnecting…', rest: "Your session is kept. Answers catch up when it's back." };
  }
  if (state.paused) return { icon: 'pause', lead: 'Paused.', rest: 'Minutes still count.' };
  if (state.listening === 'down') {
    return state.answers.length === 0 && !state.heard.finished
      ? { icon: 'attention', lead: "Listening isn't available right now.", rest: 'Type your questions; listening starts by itself when it can.' }
      : { icon: 'attention', lead: 'Listening is down.', rest: 'You can still type your question.' };
  }
  if (!state.autoAvailable) {
    return {
      icon: 'info',
      lead: 'Answers only when you ask.',
      rest: 'After the call, add your résumé and job description in Prepare to answer automatically.',
    };
  }
  if (state.notice) return { icon: 'info', lead: state.notice.text, rest: '' };
  return null;
}
