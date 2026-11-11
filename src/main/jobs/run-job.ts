// A job on the server (backend 3.4: a debrief, prep drafts), from main: started with a POST that answers its id, then
// asked after until it is done. A failure arrives as the RestClient's ApiError, with the server's code; waiting past
// `jobWaitMs` is one of the client's own (`job_timeout`).
import { ApiError, type RestClient } from '../api/rest-client';

/** Asked again this long after "still running" (the server's Retry-After, backend `JobEndpoints.RetryAfterSeconds`). */
export const pollEveryMs = 2_000;

/** Waited at most: a debrief takes well under a minute, and the server forgets a job after 15. */
export const jobWaitMs = 5 * 60_000;

/** The client's own code for a job waited on too long. */
export const jobTimeoutCode = 'job_timeout';

export interface JobDependencies {
  rest: Pick<RestClient, 'get' | 'post'>;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

interface JobStarted {
  jobId: string;
}

interface JobView {
  jobId: string;
  kind: string;
  status: string;
  result: unknown;
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Starts the job at `path` with `body`, and answers its result once done. Throws an ApiError when it fails. */
export async function runJob(path: string, body: unknown, deps: JobDependencies): Promise<unknown> {
  const sleep = deps.sleep ?? wait;
  const now = deps.now ?? Date.now;
  const started = await deps.rest.post<JobStarted>(path, { body });
  if (typeof started?.jobId !== 'string') throw new ApiError(0, jobTimeoutCode, 'The server gave no job.');
  const deadline = now() + jobWaitMs;
  for (;;) {
    const job = await deps.rest.get<JobView>(`/api/v1/jobs/${encodeURIComponent(started.jobId)}`);
    if (job?.status === 'done') return job.result;
    if (now() >= deadline) throw new ApiError(0, jobTimeoutCode, 'The job took too long.');
    await sleep(pollEveryMs);
  }
}
