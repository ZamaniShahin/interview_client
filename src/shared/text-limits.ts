// How long typed text may be, so the ask bar and the documents can count and warn before sending.
// The server checks every request and answers `invalid_input` with `too_long` past these: it stays the judge.
// The numbers mirror the backend's (docs/03-protocol.md §6, the design handoff's §9).
import { AskMode } from './contracts/sotto-contracts';

export const askLimits: Readonly<Record<AskMode, number>> = {
  [AskMode.Question]: 4_000,
  [AskMode.Tip]: 1_000,
  [AskMode.Study]: 4_000,
  [AskMode.Result]: 200_000,
};

export const documentLimits = {
  name: 200,
  resume: 50_000,
  jobDescription: 30_000,
  notes: 5_000,
  prepDoc: 100_000,
} as const;

export interface LimitState {
  length: number;
  limit: number;
  /** Characters past the limit; 0 when it fits. */
  over: number;
  /** The count appears from 90% of the limit, so it never clutters a short question. */
  showCount: boolean;
  /** Names the limit and promises nothing was cut (the handoff's state 20); null when the text fits. */
  message: string | null;
}

export function formatCount(n: number): string {
  return n.toLocaleString('en-US');
}

export function limitState(text: string, limit: number): LimitState {
  const length = text.length;
  const over = Math.max(0, length - limit);
  return {
    length,
    limit,
    over,
    showCount: length >= limit * 0.9,
    message: over > 0 ? `Shorten it by ${formatCount(over)} character${over === 1 ? '' : 's'}. Nothing has been cut.` : null,
  };
}
