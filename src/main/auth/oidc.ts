// OpenID Connect against Keycloak, through openid-client (README, "Login"): the authorization code flow with PKCE
// (S256) in the system browser, a loopback redirect, refresh and revocation. A public client: no secret exists. The
// code exchange and every refresh carry a DPoP proof from the sign-in's key, which the realm binds the tokens to (Q44).
import * as client from 'openid-client';
import type { DpopKey } from './dpop';

export interface Tokens {
  accessToken: string;
  refreshToken: string;
  /** When the access token expires, in Unix milliseconds. */
  expiresAt: number;
  email: string | null;
  name: string | null;
}

/** What the sign-in session needs of OpenID Connect; a fake stands in for it in tests. */
export interface OidcPort {
  authorizationUrl(redirectUri: string): Promise<{ url: string; verifier: string; state: string }>;
  /** Exchanges the code the browser came back with; checks the state and the ID token. The tokens are bound to `key`. */
  exchange(callback: URL, verifier: string, state: string, key: DpopKey): Promise<Tokens>;
  /** Renews the tokens with a proof from `key`, the one they are bound to. */
  refresh(refreshToken: string, key: DpopKey): Promise<Tokens>;
  revoke(refreshToken: string): Promise<void>;
}

/** The refresh token was refused: rotated and reused, revoked, or expired. Sign in again (README, "Token storage"). */
export class SignInExpired extends Error {
  constructor() {
    super('The sign-in has ended. Sign in again.');
  }
}

export interface OidcOptions {
  issuer: string;
  clientId: string;
  scopes: string;
  /** Only for the local Keycloak, on http://localhost. A release talks to HTTPS only. */
  allowHttp: boolean;
  now?: () => number;
}

export class OpenIdClient implements OidcPort {
  private config: Promise<client.Configuration> | null = null;

  constructor(private readonly options: OidcOptions) {}

  async authorizationUrl(redirectUri: string): Promise<{ url: string; verifier: string; state: string }> {
    const config = await this.configuration();
    const verifier = client.randomPKCECodeVerifier();
    const state = client.randomState();
    const url = client.buildAuthorizationUrl(config, {
      redirect_uri: redirectUri,
      scope: this.options.scopes,
      code_challenge: await client.calculatePKCECodeChallenge(verifier),
      code_challenge_method: 'S256',
      state,
    });
    return { url: url.href, verifier, state };
  }

  async exchange(callback: URL, verifier: string, state: string, key: DpopKey): Promise<Tokens> {
    const config = await this.configuration();
    const response = await client.authorizationCodeGrant(
      config,
      callback,
      { pkceCodeVerifier: verifier, expectedState: state, idTokenExpected: true },
      undefined,
      { DPoP: client.getDPoPHandle(config, await key.cryptoKeyPair()) },
    );
    return this.toTokens(response, null);
  }

  async refresh(refreshToken: string, key: DpopKey): Promise<Tokens> {
    const config = await this.configuration();
    try {
      const response = await client.refreshTokenGrant(config, refreshToken, undefined, {
        DPoP: client.getDPoPHandle(config, await key.cryptoKeyPair()),
      });
      return this.toTokens(response, refreshToken);
    } catch (error) {
      if (error instanceof client.ResponseBodyError && error.error === 'invalid_grant') throw new SignInExpired();
      throw error;
    }
  }

  async revoke(refreshToken: string): Promise<void> {
    await client.tokenRevocation(await this.configuration(), refreshToken, { token_type_hint: 'refresh_token' });
  }

  private configuration(): Promise<client.Configuration> {
    this.config ??= client
      .discovery(
        new URL(this.options.issuer),
        this.options.clientId,
        undefined,
        client.None(),
        this.options.allowHttp ? { execute: [client.allowInsecureRequests] } : undefined,
      )
      .catch((error: unknown) => {
        // A failed discovery (offline, say) is tried again next time rather than remembered.
        this.config = null;
        throw error;
      });
    return this.config;
  }

  private toTokens(
    response: client.TokenEndpointResponse & client.TokenEndpointResponseHelpers,
    previousRefreshToken: string | null,
  ): Tokens {
    const claims = response.claims();
    const refreshToken = response.refresh_token ?? previousRefreshToken;
    if (!refreshToken) throw new Error('The sign-in returned no refresh token (is offline_access granted?).');
    const now = this.options.now?.() ?? Date.now();
    return {
      accessToken: response.access_token,
      refreshToken,
      expiresAt: now + (response.expiresIn() ?? 60) * 1000,
      email: typeof claims?.['email'] === 'string' ? claims['email'] : null,
      name: typeof claims?.['name'] === 'string' ? claims['name'] : null,
    };
  }
}
