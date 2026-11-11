// The server's jobs (backend 3.4), as the app window words them: a debrief of an interview, or drafts for the answer
// bank. Main runs them; a window learns how one went in these words, never in a status code.
import { ErrorCodes } from './contracts/sotto-contracts';

export type JobKind = 'debrief' | 'drafts';

const what: Record<JobKind, { one: string; many: string }> = {
  debrief: { one: 'a debrief', many: 'debriefs' },
  drafts: { one: 'drafts', many: 'drafts' },
};

/** Why a job made nothing, in the app window's words, from the server's code (or the client's `job_timeout`). */
export function jobFailureText(kind: JobKind, code: string): string {
  const { one, many } = what[kind];
  switch (code) {
    case ErrorCodes.Licensing.QuotaExceeded:
      return `You've had all the ${many} your plan gives this month.`;
    case ErrorCodes.Licensing.NoEntitlement:
      return `Your plan doesn't include ${many}.`;
    case ErrorCodes.Request.RateLimited:
      return 'Too many at once. Try again in a minute.';
    case ErrorCodes.Request.Unavailable:
    case ErrorCodes.Ai.ProviderUnavailable:
      return `Sotto can't write ${one} right now. Try again in a few minutes.`;
    case ErrorCodes.Request.NotFound:
      return `Writing ${one} took too long and it was lost. Ask again.`;
    case 'job_timeout':
      return `Writing ${one} is taking longer than it should. Try again later.`;
    case ErrorCodes.Identity.Unauthenticated:
      return `Sign in to ask for ${one}.`;
    default:
      return `Couldn't ask for ${one}. Try again.`;
  }
}
