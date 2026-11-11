// Where the client connects. Locally these are the backend AppHost's defaults (README, "Talking to a local backend");
// a release build sets them at build time. Nothing here is secret: the OIDC client is public and uses PKCE.
export interface ClientConfig {
  apiBaseUrl: string;
  oidcIssuer: string;
  oidcClientId: string;
  scopes: string;
  /** The update feed (4.2): where newer installers and their latest.yml are. None until the domain is chosen (Q4). */
  updateUrl: string | null;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ClientConfig {
  return {
    apiBaseUrl: env['SOTTO_API_BASE_URL'] ?? 'http://localhost:5180',
    oidcIssuer: env['SOTTO_OIDC_ISSUER'] ?? 'http://localhost:8080/realms/sotto',
    oidcClientId: env['SOTTO_OIDC_CLIENT_ID'] ?? 'desktop',
    scopes: 'openid email profile offline_access',
    updateUrl: env['SOTTO_UPDATE_URL'] || null,
  };
}
