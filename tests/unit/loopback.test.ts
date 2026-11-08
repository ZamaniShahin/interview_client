import { afterEach, describe, expect, it } from 'vitest';
import { startLoopback, type Loopback } from '../../src/main/auth/loopback';

describe('the loopback redirect the browser comes back to', () => {
  let loopback: Loopback | null = null;

  afterEach(() => {
    loopback?.close();
    loopback = null;
  });

  it('listens on 127.0.0.1, on a free port, at /callback', async () => {
    loopback = await startLoopback();

    expect(loopback.redirectUri).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/callback$/);
  });

  it('hands over what the browser came back with, and tells the browser the tab can close', async () => {
    loopback = await startLoopback();

    const response = await fetch(`${loopback.redirectUri}?code=the-code&state=the-state`);

    expect(response.status).toBe(200);
    expect(await response.text()).toContain('You can close this tab');
    const url = await loopback.callback;
    expect(url.searchParams.get('code')).toBe('the-code');
    expect(url.searchParams.get('state')).toBe('the-state');
  });

  it('answers nothing but a GET of the callback', async () => {
    loopback = await startLoopback();

    expect((await fetch(new URL('/favicon.ico', loopback.redirectUri))).status).toBe(404);
    expect((await fetch(loopback.redirectUri, { method: 'POST' })).status).toBe(404);
  });

  it('stops listening once the browser came back', async () => {
    loopback = await startLoopback();
    await (await fetch(`${loopback.redirectUri}?code=c&state=s`)).text();
    await loopback.callback;

    await expect(fetch(`${loopback.redirectUri}?code=again&state=s`)).rejects.toThrow();
  });

  it('stops waiting when closed', async () => {
    loopback = await startLoopback();

    loopback.close();

    await expect(loopback.callback).rejects.toThrow('cancelled');
  });

  it('gives up when the browser takes too long', async () => {
    loopback = await startLoopback(20);

    await expect(loopback.callback).rejects.toThrow('too long');
  });
});
