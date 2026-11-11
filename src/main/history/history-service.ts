// History as the app window uses it (3.9): the list, one interview whole, deleting, and asking the server for a
// debrief (its 3.4 job), which is kept with the interview. The debrief is the one time history leaves this computer,
// and only when the user asks for it.
import { ErrorCodes } from '../../shared/contracts/sotto-contracts';
import { debriefRequestOf, debriefSchema, type InterviewSummary, type InterviewView } from '../../shared/history';
import type { CommandResult } from '../../shared/ipc';
import { jobFailureText } from '../../shared/jobs';
import { ApiError } from '../api/rest-client';
import type { HistoryStore } from '../storage/history-store';

export interface HistoryServiceDependencies {
  /** The history kept on this computer, or null while it can't be had. */
  store: () => HistoryStore | null;
  /** The interview a running session is keeping, if any: its debrief waits for its end. */
  running: () => number | null;
  /** Runs a job on the server (run-job.ts): its result, or an ApiError. */
  job: (path: string, body: unknown) => Promise<unknown>;
  /** The list, or the debriefs being written, changed. */
  changed: (view: { history: InterviewSummary[]; debriefing: number[] }) => void;
  now?: () => number;
}

const noHistory: CommandResult = {
  ok: false,
  code: ErrorCodes.Request.Unavailable,
  message: "This computer's history can't be read right now.",
};

const gone: CommandResult = {
  ok: false,
  code: ErrorCodes.Request.NotFound,
  message: 'That interview is no longer kept.',
};

export class HistoryService {
  private readonly writing = new Set<number>();

  constructor(private readonly deps: HistoryServiceDependencies) {}

  get debriefing(): number[] {
    return [...this.writing];
  }

  list(): InterviewSummary[] {
    return this.deps.store()?.list() ?? [];
  }

  open(id: number): InterviewView | null {
    return this.deps.store()?.get(id) ?? null;
  }

  delete(id: number): CommandResult {
    const store = this.deps.store();
    if (!store) return noHistory;
    if (this.deps.running() === id) {
      return { ok: false, code: ErrorCodes.Session.AlreadyInSession, message: 'This interview is still running.' };
    }
    store.delete(id);
    this.announce();
    return { ok: true };
  }

  /** Deletes every interview but the one a session is keeping. */
  clear(): CommandResult {
    const store = this.deps.store();
    if (!store) return noHistory;
    const running = this.deps.running();
    for (const interview of store.list()) if (interview.id !== running) store.delete(interview.id);
    this.announce();
    return { ok: true };
  }

  /** Asks the server for the interview's debrief, and keeps it with the interview. Answers once it is kept. */
  async debrief(id: number): Promise<CommandResult> {
    const store = this.deps.store();
    if (!store) return noHistory;
    const interview = store.get(id);
    if (!interview) return gone;
    if (this.deps.running() === id) {
      return {
        ok: false,
        code: ErrorCodes.Session.AlreadyInSession,
        message: 'This interview is still running: ask for its debrief once it ends.',
      };
    }
    if (this.writing.has(id)) {
      // The client's own code, as a capture's are: the server never sees this one.
      return { ok: false, code: 'debrief_running', message: 'Its debrief is being written.' };
    }
    const request = debriefRequestOf(interview);
    if (!request) {
      return { ok: false, code: ErrorCodes.Field.Required, message: 'Nothing was kept of this interview to debrief.' };
    }

    this.writing.add(id);
    this.announce();
    try {
      const parsed = debriefSchema.safeParse(await this.deps.job('/api/v1/jobs/debrief', request));
      if (!parsed.success) {
        return {
          ok: false,
          code: ErrorCodes.Request.Internal,
          message: "The debrief came back in a form Sotto can't read. Ask again.",
        };
      }
      // Deleted while it was written: nothing to keep it with.
      if (!store.saveDebrief(id, parsed.data, (this.deps.now ?? Date.now)())) return gone;
      return { ok: true };
    } catch (error) {
      const code = error instanceof ApiError ? error.code : ErrorCodes.Request.Unavailable;
      return { ok: false, code, message: jobFailureText('debrief', code) };
    } finally {
      this.writing.delete(id);
      this.announce();
    }
  }

  private announce(): void {
    this.deps.changed({ history: this.list(), debriefing: this.debriefing });
  }
}
