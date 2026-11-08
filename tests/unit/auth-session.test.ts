import { beforeEach, describe, expect, it } from 'vitest';
import { AuthSession, NotSignedIn, SignInCancelled } from '../../src/main/auth/auth-session';
import type { Loopback } from '../../src/main/auth/loopback';
import { SignInExpired, type OidcPort, type Tokens } from '../../src/main/auth/oidc';
import { MemorySecretStore } from '../../src/main/auth/secret-store';

let clock = 1_000_000;

function tokens(name: string, lifetimeMs = 300_000): Tokens {
  return {
    accessToken: `access-${name}`,
    refreshToken: `refresh-${name}`,
    expiresAt: clock + lifetimeMs,
    email: 'sam@example.com',
    name: 'Sam Rivera',
  };
}

/** Plays Keycloak: counts refreshes, and answers them as the test says. */
class FakeOidc implements OidcPort {
  readonly refreshed: string[] = [];
  readonly revoked: string[] = [];
  readonly exchanged: { callback: URL; verifier: string; state: string }[] = [];
  answerRefresh: () => Promise<Tokens> = async () => tokens(`r${this.refreshed.length}`);

  async authorizationUrl(redirectUri: string) {
    return { url: `http://id.test/auth?redirect_uri=${encodeURIComponent(redirectUri)}`, verifier: 'the-verifier', state: 'the-state' };
  }

  async exchange(callback: URL, verifier: string, state: string): Promise<Tokens> {
    this.exchanged.push({ callback, verifier, state });
    return tokens('signed-in');
  }

  refresh(refreshToken: string): Promise<Tokens> {
    this.refreshed.push(refreshToken);
    return this.answerRefresh();
  }

  async revoke(refreshToken: string): Promise<void> {
    this.revoked.push(refreshToken);
  }
}

/** Plays the browser coming back to the loopback. */
class FakeLoopback implements Loopback {
  readonly redirectUri = 'http://127.0.0.1:50000/callback';
  readonly callback: Promise<URL>;
  closed = false;
  private resolve!: (url: URL) => void;
  private reject!: (error: Error) => void;

  constructor() {
    this.callback = new Promise<URL>((resolve, reject) => {
      this.resolve = resolve;
      this.reject = reject;
    });
    this.callback.catch(() => {});
  }

  comeBack(query: string): void {
    this.resolve(new URL(`${this.redirectUri}?${query}`));
  }

  close(): void {
    this.closed = true;
    this.reject(new Error('closed'));
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('the sign-in on this computer', () => {
  let oidc: FakeOidc;
  let secrets: MemorySecretStore;
  let loopback: FakeLoopback;
  let opened: string[];
  let auth: AuthSession;

  const openBrowser = async (url: string) => {
    opened.push(url);
  };

  beforeEach(() => {
    clock = 1_000_000;
    oidc = new FakeOidc();
    secrets = new MemorySecretStore();
    loopback = new FakeLoopback();
    opened = [];
    auth = new AuthSession({ oidc, secrets, loopback: async () => loopback, now: () => clock });
  });

  it('starts signed out when nothing is stored', async () => {
    await auth.restore();

    expect(auth.current).toEqual({ status: 'signed-out' });
    expect(oidc.refreshed).toEqual([]);
  });

  it('signs back in at startup with the stored refresh token, and keeps the new one', async () => {
    await secrets.set('refresh-token', 'refresh-stored');

    await auth.restore();

    expect(oidc.refreshed).toEqual(['refresh-stored']);
    expect(auth.current).toEqual({ status: 'signed-in', email: 'sam@example.com', name: 'Sam Rivera' });
    expect(await secrets.get('refresh-token')).toBe('refresh-r1');
  });

  it('says the sign-in ended when Keycloak refuses the refresh token, and forgets it', async () => {
    await secrets.set('refresh-token', 'refresh-stored');
    oidc.answerRefresh = () => Promise.reject(new SignInExpired());

    await auth.restore();

    expect(auth.current).toEqual({ status: 'expired' });
    expect(await secrets.get('refresh-token')).toBeNull();
  });

  it("keeps the sign-in when Keycloak can't be reached, to try again later", async () => {
    await secrets.set('refresh-token', 'refresh-stored');
    oidc.answerRefresh = () => Promise.reject(new TypeError('fetch failed'));

    await auth.restore();

    expect(auth.current).toEqual({ status: 'unreachable' });
    expect(await secrets.get('refresh-token')).toBe('refresh-stored');
  });

  it('signs in through the browser and the loopback, with the state and verifier it began with', async () => {
    const views: string[] = [];
    auth.onChange((view) => views.push(view.status));

    const signingIn = auth.signIn(openBrowser);
    await flush();
    expect(opened).toEqual([`http://id.test/auth?redirect_uri=${encodeURIComponent(loopback.redirectUri)}`]);
    expect(auth.current).toEqual({ status: 'signing-in' });

    loopback.comeBack('code=the-code&state=the-state');
    await signingIn;

    expect(oidc.exchanged).toHaveLength(1);
    expect(oidc.exchanged[0]).toMatchObject({ verifier: 'the-verifier', state: 'the-state' });
    expect(oidc.exchanged[0]!.callback.searchParams.get('code')).toBe('the-code');
    expect(auth.current).toEqual({ status: 'signed-in', email: 'sam@example.com', name: 'Sam Rivera' });
    expect(await secrets.get('refresh-token')).toBe('refresh-signed-in');
    expect(loopback.closed).toBe(true);
    expect(views).toEqual(['signing-in', 'signed-in']);
  });

  it('runs one sign-in at a time', async () => {
    const first = auth.signIn(openBrowser);
    const second = auth.signIn(openBrowser);
    await flush();

    expect(second).toBe(first);
    expect(opened).toHaveLength(1);
    loopback.comeBack('code=c&state=the-state');
    await first;
  });

  it('treats a refusal on the sign-in page as cancelled, and goes back to where it was', async () => {
    const signingIn = auth.signIn(openBrowser);
    await flush();

    loopback.comeBack('error=access_denied');

    await expect(signingIn).rejects.toBeInstanceOf(SignInCancelled);
    expect(auth.current).toEqual({ status: 'signed-out' });
  });

  it('stops waiting for the browser when the user cancels', async () => {
    await secrets.set('refresh-token', 'refresh-stored');
    oidc.answerRefresh = () => Promise.reject(new SignInExpired());
    await auth.restore();
    const signingIn = auth.signIn(openBrowser);
    await flush();

    auth.cancelSignIn();

    await expect(signingIn).rejects.toBeInstanceOf(SignInCancelled);
    expect(auth.current).toEqual({ status: 'expired' });
    expect(oidc.exchanged).toEqual([]);
  });

  it('reports any other failure from the sign-in page as it is', async () => {
    const signingIn = auth.signIn(openBrowser);
    await flush();

    loopback.comeBack('error=server_error');

    await expect(signingIn).rejects.toThrow('Sign-in failed: server_error.');
    expect(auth.current).toEqual({ status: 'signed-out' });
  });

  it('hands out the access token until it is about to expire, then renews it once for everyone waiting', async () => {
    await secrets.set('refresh-token', 'refresh-stored');
    await auth.restore();
    expect(await auth.accessToken()).toBe('access-r1');
    expect(oidc.refreshed).toHaveLength(1);

    // Less than a minute left.
    clock += 250_000;
    const [a, b] = await Promise.all([auth.accessToken(), auth.accessToken()]);

    expect(a).toBe('access-r2');
    expect(b).toBe('access-r2');
    expect(oidc.refreshed).toEqual(['refresh-stored', 'refresh-r1']);
  });

  it('renews the access token on demand, after the server refused one', async () => {
    await secrets.set('refresh-token', 'refresh-stored');
    await auth.restore();

    expect(await auth.accessToken({ force: true })).toBe('access-r2');
  });

  it('has no access token for anyone when nobody is signed in', async () => {
    await expect(auth.accessToken()).rejects.toBeInstanceOf(NotSignedIn);
  });

  it('signs out: forgets the refresh token here and tells Keycloak', async () => {
    await secrets.set('refresh-token', 'refresh-stored');
    await auth.restore();

    await auth.signOut();

    expect(auth.current).toEqual({ status: 'signed-out' });
    expect(await secrets.get('refresh-token')).toBeNull();
    expect(oidc.revoked).toEqual(['refresh-r1']);
    await expect(auth.accessToken()).rejects.toBeInstanceOf(NotSignedIn);
  });

  it('is not signed back in by a renewal that lands after signing out', async () => {
    await secrets.set('refresh-token', 'refresh-stored');
    const late = deferred<Tokens>();
    oidc.answerRefresh = () => late.promise;
    const pending = auth.accessToken();
    await flush();

    await auth.signOut();
    late.resolve(tokens('late'));

    await expect(pending).rejects.toBeInstanceOf(NotSignedIn);
    expect(auth.current).toEqual({ status: 'signed-out' });
    expect(await secrets.get('refresh-token')).toBeNull();
    expect(oidc.revoked).toEqual(['refresh-stored', 'refresh-late']);
  });
});
