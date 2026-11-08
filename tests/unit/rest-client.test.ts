import { describe, expect, it } from 'vitest';
import { ApiError, RestClient } from '../../src/main/api/rest-client';
import { ErrorCodes, Protocol } from '../../src/shared/contracts/sotto-contracts';

interface Sent {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | undefined;
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

/** Plays the server: answers each request in turn, and keeps what it was sent. */
function server(...answers: (Response | Error)[]) {
  const sent: Sent[] = [];
  const fetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    sent.push({
      url: String(input),
      method: init?.method ?? 'GET',
      headers: init?.headers as Record<string, string>,
      body: init?.body as string | undefined,
    });
    const answer = answers.shift();
    if (!answer) throw new Error('No answer left.');
    if (answer instanceof Error) throw answer;
    return answer;
  };
  return { sent, fetch: fetch as typeof globalThis.fetch };
}

function client(fetch: typeof globalThis.fetch, tokens: string[] = ['token-1', 'token-2']) {
  const asked: (boolean | undefined)[] = [];
  const rest = new RestClient({
    baseUrl: 'http://api.test',
    clientVersion: '0.1.0',
    accessToken: async (options) => {
      asked.push(options?.force);
      return tokens[asked.length - 1] ?? 'token-last';
    },
    fetch,
  });
  return { rest, asked };
}

describe("the REST client in main", () => {
  it('sends the access token and the client version, and reads JSON back', async () => {
    const { sent, fetch } = server(json(200, { id: 'u1' }));
    const { rest } = client(fetch);

    const me = await rest.get<{ id: string }>('/api/v1/me');

    expect(me).toEqual({ id: 'u1' });
    expect(sent[0]).toMatchObject({ url: 'http://api.test/api/v1/me', method: 'GET', body: undefined });
    expect(sent[0]!.headers).toMatchObject({
      authorization: 'Bearer token-1',
      accept: 'application/json',
      [Protocol.ClientVersionHeader]: '0.1.0',
    });
  });

  it('sends a body as JSON', async () => {
    const { sent, fetch } = server(json(201, { id: 'd1' }));
    const { rest } = client(fetch);

    await rest.post('/api/v1/devices', { body: { name: 'Work laptop' } });

    expect(sent[0]!.method).toBe('POST');
    expect(sent[0]!.headers['content-type']).toBe('application/json');
    expect(sent[0]!.body).toBe('{"name":"Work laptop"}');
  });

  it('adds a device proof made for the token the request carries', async () => {
    const { sent, fetch } = server(json(200, {}));
    const { rest } = client(fetch);

    await rest.get('/api/v1/devices/current', { proof: (token) => `proof-for-${token}` });

    expect(sent[0]!.headers[Protocol.DeviceProofHeader]).toBe('proof-for-token-1');
  });

  it("turns a problem into an error with the server's code and words", async () => {
    const { fetch } = server(
      json(409, { title: 'Conflict', detail: 'This account can have 3 devices.', code: ErrorCodes.Identity.DeviceLimitReached }),
    );
    const { rest } = client(fetch);

    const error = await rest.post('/api/v1/devices', { body: {} }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 409, code: 'device_limit_reached', message: 'This account can have 3 devices.' });
  });

  it('names the code from the status when the answer has none', async () => {
    const { fetch } = server(new Response('Bad gateway', { status: 502, statusText: 'Bad Gateway' }));
    const { rest } = client(fetch);

    await expect(rest.get('/api/v1/me')).rejects.toMatchObject({ status: 502, code: ErrorCodes.Request.Unavailable });
  });

  it("says Sotto can't be reached when the request doesn't get through", async () => {
    const { fetch } = server(new TypeError('fetch failed'));
    const { rest } = client(fetch);

    await expect(rest.get('/api/v1/me')).rejects.toMatchObject({ status: 0, code: ErrorCodes.Request.Unavailable });
  });

  it('renews the token once after a 401, with a fresh proof', async () => {
    const { sent, fetch } = server(json(401, { code: ErrorCodes.Identity.Unauthenticated }), json(200, { ok: 1 }));
    const { rest, asked } = client(fetch);

    const result = await rest.get('/api/v1/devices/current', { proof: (token) => `proof-for-${token}` });

    expect(result).toEqual({ ok: 1 });
    expect(asked).toEqual([false, true]);
    expect(sent.map((s) => s.headers.authorization)).toEqual(['Bearer token-1', 'Bearer token-2']);
    expect(sent.map((s) => s.headers[Protocol.DeviceProofHeader])).toEqual(['proof-for-token-1', 'proof-for-token-2']);
  });

  it('gives up after a second 401', async () => {
    const unauthenticated = () => json(401, { code: ErrorCodes.Identity.Unauthenticated, title: 'Unauthorized' });
    const { sent, fetch } = server(unauthenticated(), unauthenticated());
    const { rest } = client(fetch);

    await expect(rest.get('/api/v1/me')).rejects.toMatchObject({ status: 401, code: ErrorCodes.Identity.Unauthenticated });
    expect(sent).toHaveLength(2);
  });

  it('does not retry a 401 that is about the device', async () => {
    const { sent, fetch } = server(json(401, { code: ErrorCodes.Identity.DeviceNotRegistered, detail: 'Register again.' }));
    const { rest } = client(fetch);

    await expect(rest.get('/api/v1/devices/current')).rejects.toMatchObject({ code: ErrorCodes.Identity.DeviceNotRegistered });
    expect(sent).toHaveLength(1);
  });
});
