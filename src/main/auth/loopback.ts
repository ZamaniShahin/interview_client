// Where the browser comes back to after sign-in (RFC 8252): a one-shot HTTP server on the loopback address, on any
// free port. Keycloak's `desktop` client accepts any port on http://127.0.0.1/callback (backend docs/04 §10).
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

export interface Loopback {
  redirectUri: string;
  /** The URL the browser came back with: `code` and `state`, or `error`. */
  callback: Promise<URL>;
  close(): void;
}

const signedInPage =
  '<!doctype html><html lang="en"><meta charset="utf-8"><title>Sotto</title>' +
  '<body style="font:15px system-ui,sans-serif;margin:48px;color:#27272a">' +
  '<p>You can close this tab and go back to Sotto.</p></body></html>';

export async function startLoopback(timeoutMs = 5 * 60_000): Promise<Loopback> {
  let resolveCallback!: (url: URL) => void;
  let rejectCallback!: (error: Error) => void;
  const callback = new Promise<URL>((resolve, reject) => {
    resolveCallback = resolve;
    rejectCallback = reject;
  });
  // A caller that gives up early never awaits it; that must not crash main.
  callback.catch(() => {});

  let port = 0;
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', `http://127.0.0.1:${port}`);
    if (request.method !== 'GET' || url.pathname !== '/callback') {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
    response.end(signedInPage);
    resolveCallback(url);
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });
  port = (server.address() as AddressInfo).port;

  const timer = setTimeout(() => rejectCallback(new Error('Sign-in took too long.')), timeoutMs);
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    clearTimeout(timer);
    rejectCallback(new Error('Sign-in was cancelled.'));
    server.close();
    // The browser may hold a keep-alive connection open; nothing more is listened for.
    server.closeIdleConnections();
  };
  void callback.then(close, close);

  return { redirectUri: `http://127.0.0.1:${port}/callback`, callback, close };
}
