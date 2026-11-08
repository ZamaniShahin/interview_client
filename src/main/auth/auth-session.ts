// Who is signed in on this computer, and a valid access token on demand. The access token lives in memory only; the
// refresh token is kept encrypted (SecretStore). Keycloak rotates refresh tokens and ends the sign-in when an old one
// is used again (backend docs/04 §10), so refreshes run one at a time and each new refresh token is stored before use.
import type { AuthView } from '../../shared/app-state';
import type { Loopback } from './loopback';
import { SignInExpired, type OidcPort, type Tokens } from './oidc';
import type { SecretStore } from './secret-store';

export class NotSignedIn extends Error {
  constructor() {
    super('Not signed in.');
  }
}

/** The user stopped the sign-in: in the app, or on the sign-in page. Not a problem to report. */
export class SignInCancelled extends Error {
  constructor() {
    super('Sign-in was cancelled.');
  }
}

export interface AuthSessionDependencies {
  oidc: OidcPort;
  secrets: SecretStore;
  loopback: () => Promise<Loopback>;
  now?: () => number;
}

/** An access token is renewed when less than this is left of it, so a request never carries one about to expire. */
const renewBeforeMs = 60_000;

export class AuthSession {
  private tokens: Tokens | null = null;
  private refreshing: Promise<Tokens> | null = null;
  private signingIn: Promise<void> | null = null;
  private loopback: Loopback | null = null;
  private cancelled = false;
  /** Moves on at each sign-out, so tokens that arrive for an earlier sign-in are dropped, not stored. */
  private epoch = 0;
  private view: AuthView = { status: 'signed-out' };
  private readonly listeners = new Set<(view: AuthView) => void>();

  constructor(private readonly deps: AuthSessionDependencies) {}

  get current(): AuthView {
    return this.view;
  }

  onChange(listener: (view: AuthView) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** At startup: a stored refresh token signs the user back in without the browser. */
  async restore(): Promise<void> {
    const refreshToken = await this.deps.secrets.get('refresh-token');
    if (!refreshToken) {
      this.set({ status: 'signed-out' });
      return;
    }
    try {
      await this.refreshWith(refreshToken);
    } catch (error) {
      // Refused: refreshWith said "expired". Anything else (offline, Keycloak down): keep the token and try later.
      if (!(error instanceof SignInExpired) && !(error instanceof NotSignedIn)) this.set({ status: 'unreachable' });
    }
  }

  /** Signs in through the system browser; `openBrowser` is the only thing that leaves the app. */
  signIn(openBrowser: (url: string) => Promise<void>): Promise<void> {
    this.signingIn ??= this.runSignIn(openBrowser).finally(() => {
      this.signingIn = null;
    });
    return this.signingIn;
  }

  /** Stops waiting for the browser (its tab was closed, say): the pending `signIn` fails with `SignInCancelled`. */
  cancelSignIn(): void {
    if (!this.loopback) return;
    this.cancelled = true;
    this.loopback.close();
  }

  /** A valid access token, renewed first when it is about to expire (or when `force`d after a 401). */
  async accessToken(options: { force?: boolean } = {}): Promise<string> {
    const now = this.deps.now?.() ?? Date.now();
    if (this.tokens && !options.force && this.tokens.expiresAt - now > renewBeforeMs) return this.tokens.accessToken;
    const refreshToken = this.tokens?.refreshToken ?? (await this.deps.secrets.get('refresh-token'));
    if (!refreshToken) throw new NotSignedIn();
    return (await this.refreshWith(refreshToken)).accessToken;
  }

  async signOut(): Promise<void> {
    this.epoch += 1;
    this.cancelSignIn();
    const refreshToken = this.tokens?.refreshToken ?? (await this.deps.secrets.get('refresh-token'));
    this.tokens = null;
    await this.deps.secrets.delete('refresh-token');
    this.set({ status: 'signed-out' });
    // Best effort: signed out here even if Keycloak can't be told.
    if (refreshToken) await this.deps.oidc.revoke(refreshToken).catch(() => {});
  }

  private async runSignIn(openBrowser: (url: string) => Promise<void>): Promise<void> {
    const before = this.view;
    const epoch = this.epoch;
    this.cancelled = false;
    this.set({ status: 'signing-in' });
    let loopback: Loopback | null = null;
    try {
      loopback = await this.deps.loopback();
      this.loopback = loopback;
      const { url, verifier, state } = await this.deps.oidc.authorizationUrl(loopback.redirectUri);
      await openBrowser(url);
      const callback = await loopback.callback;
      const error = callback.searchParams.get('error');
      if (error === 'access_denied') throw new SignInCancelled();
      if (error) throw new Error(`Sign-in failed: ${error}.`);
      await this.accept(await this.deps.oidc.exchange(callback, verifier, state), epoch);
    } catch (error) {
      if (this.view.status === 'signing-in') this.set(before);
      throw this.cancelled ? new SignInCancelled() : error;
    } finally {
      this.loopback = null;
      loopback?.close();
    }
  }

  private refreshWith(refreshToken: string): Promise<Tokens> {
    const epoch = this.epoch;
    this.refreshing ??= (async () => {
      try {
        const tokens = await this.deps.oidc.refresh(refreshToken);
        await this.accept(tokens, epoch);
        return tokens;
      } catch (error) {
        if (error instanceof SignInExpired && epoch === this.epoch) {
          this.tokens = null;
          await this.deps.secrets.delete('refresh-token');
          this.set({ status: 'expired' });
        }
        throw error;
      } finally {
        this.refreshing = null;
      }
    })();
    return this.refreshing;
  }

  /** Stores the new refresh token before anything uses the new tokens: losing it would end the sign-in. */
  private async accept(tokens: Tokens, epoch: number): Promise<void> {
    if (epoch !== this.epoch) {
      // Signed out while these were on their way: they must not sign the user back in.
      await this.deps.oidc.revoke(tokens.refreshToken).catch(() => {});
      throw new NotSignedIn();
    }
    await this.deps.secrets.set('refresh-token', tokens.refreshToken);
    const previous = this.view.status === 'signed-in' ? this.view : null;
    this.tokens = tokens;
    this.set({
      status: 'signed-in',
      email: tokens.email ?? previous?.email ?? '',
      name: tokens.name ?? previous?.name ?? null,
    });
  }

  private set(view: AuthView): void {
    this.view = view;
    for (const listener of this.listeners) listener(view);
  }
}
