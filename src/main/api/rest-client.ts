// Calls to Sotto's REST API, from main only (renderers have no network). Every request carries the access token and
// this build's version; a device-bound one also carries a proof made for it. Failures arrive as problem details with a
// `code` from ErrorCodes, and leave here as an ApiError.
import { ErrorCodes, Protocol } from '../../shared/contracts/sotto-contracts';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export interface RestClientOptions {
  baseUrl: string;
  clientVersion: string;
  accessToken: (options?: { force?: boolean }) => Promise<string>;
  fetch?: typeof fetch;
}

export interface RequestOptions {
  body?: unknown;
  /** Makes the device proof for this request from the access token it will carry (proofs are single-use). */
  proof?: (accessToken: string) => Promise<string> | string;
}

export class RestClient {
  constructor(private readonly options: RestClientOptions) {}

  get<T>(path: string, options?: RequestOptions): Promise<T> {
    return this.send<T>('GET', path, options);
  }

  post<T>(path: string, options?: RequestOptions): Promise<T> {
    return this.send<T>('POST', path, options);
  }

  delete<T>(path: string, options?: RequestOptions): Promise<T> {
    return this.send<T>('DELETE', path, options);
  }

  private async send<T>(method: string, path: string, options: RequestOptions = {}, retried = false): Promise<T> {
    const token = await this.options.accessToken({ force: retried });
    const headers: Record<string, string> = {
      authorization: `Bearer ${token}`,
      accept: 'application/json',
      [Protocol.ClientVersionHeader]: this.options.clientVersion,
    };
    if (options.body !== undefined) headers['content-type'] = 'application/json';
    if (options.proof) headers[Protocol.DeviceProofHeader] = await options.proof(token);

    let response: Response;
    try {
      response = await (this.options.fetch ?? fetch)(new URL(path, this.options.baseUrl), {
        method,
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
      });
    } catch {
      throw new ApiError(0, ErrorCodes.Request.Unavailable, "Can't reach Sotto right now.");
    }

    if (response.ok) return (response.status === 204 ? undefined : await response.json()) as T;

    const problem = (await response.json().catch(() => null)) as { code?: string; detail?: string; title?: string } | null;
    const code = problem?.code ?? codeForStatus(response.status);
    // A token the server found expired (a clock behind, say): renew it once and try again, with a fresh proof.
    if (response.status === 401 && code === ErrorCodes.Identity.Unauthenticated && !retried) {
      return this.send<T>(method, path, options, true);
    }
    throw new ApiError(response.status, code, problem?.detail ?? problem?.title ?? response.statusText);
  }
}

function codeForStatus(status: number): string {
  if (status === 401) return ErrorCodes.Identity.Unauthenticated;
  if (status === 404) return ErrorCodes.Request.NotFound;
  if (status === 429) return ErrorCodes.Request.RateLimited;
  if (status >= 500) return ErrorCodes.Request.Unavailable;
  return ErrorCodes.Request.InvalidInput;
}
