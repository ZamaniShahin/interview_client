// What a session's history keeps (3.9), read from each step of the live state: an answer once it is over, the
// interviewer's words as each phrase is final, and the end. Pure, so main and the tests run the same code; a step the
// reducer ignored (a resume's replay of events already applied) keeps nothing twice.
import type { LiveAction } from './reducer';
import type { AnswerView, LiveViewState } from './view-state';

export type HistoryEvent =
  /** An answer is over (done, or stopped with something written): kept with its question. */
  | { type: 'answered'; answer: AnswerView }
  /** A phrase the interviewer finished, new since the last one. */
  | { type: 'heard'; text: string; atMs: number }
  | { type: 'ended'; reason: string | null };

/** The endings worth keeping: an answer the user saw. Failed and hidden ones showed nothing to keep. */
const kept = (answer: AnswerView) =>
  (answer.ending === 'done' || answer.ending === 'stopped') && answer.text.trim() !== '';

export function historyEvents(before: LiveViewState, after: LiveViewState, action: LiveAction): HistoryEvent[] {
  if (before === after) return [];
  const events: HistoryEvent[] = [];

  // The final transcript carries the question so far: what is new is what follows the last final, or all of it once
  // Heard started over (an answer began, or Clear).
  if (action.type === 'event' && action.event.name === 'transcriptFinal' && after.lastSeq > before.lastSeq) {
    const previous = before.heard.finished;
    const now = action.event.e.Text;
    const fresh = previous && now.startsWith(previous) ? now.slice(previous.length) : now;
    if (fresh.trim()) events.push({ type: 'heard', text: fresh.trim(), atMs: action.event.e.AtMs });
  }

  if (before.answers !== after.answers) {
    const was = new Map(before.answers.map((a) => [a.id, a]));
    for (const answer of after.answers) {
      const earlier = was.get(answer.id);
      if (kept(answer) && !(earlier && kept(earlier))) events.push({ type: 'answered', answer });
    }
  }

  if (after.phase === 'ended' && before.phase !== 'ended') events.push({ type: 'ended', reason: after.endReason });
  return events;
}
