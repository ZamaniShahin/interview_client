// Plays the system browser on Keycloak's own pages, as a person would: signs a new user up, follows the verification
// email from Mailpit, and comes back to the client's loopback redirect, which the real loopback server answers. Ported
// from the backend's tools/signin-check.mjs (checkpoint 0.11). No packages: Node's fetch and a small cookie jar.

export interface SignUp {
  email: string;
  password: string;
  /** Where the local stack's Mailpit answers: http://localhost:8025. */
  mailpit: string;
}

interface Page {
  url: string;
  status: number;
  html: string;
}

const decodeHtml = (text: string) =>
  text
    .replace(/&amp;/g, '&')
    .replace(/&#x3D;/g, '=')
    .replace(/&#61;/g, '=')
    .replace(/&quot;/g, '"');

/** Signs a new user up from the authorization URL the client opened, and ends at the client's loopback. */
export async function signUpInBrowser(authorizationUrl: string, signUp: SignUp): Promise<void> {
  const redirectUri = new URL(authorizationUrl).searchParams.get('redirect_uri');
  if (!redirectUri) throw new Error('The authorization URL has no redirect_uri.');
  const browser = new ScriptedBrowser(redirectUri);

  let page = await browser.open(authorizationUrl);
  const register = /href="([^"]*login-actions\/registration[^"]*)"/.exec(page.html);
  if (!register) throw new Error(`No registration link on the sign-in page (HTTP ${page.status}).`);

  page = await browser.open(new URL(decodeHtml(register[1]!), page.url).href);
  const action = formAction(page.html, 'kc-register-form');
  if (!action) throw new Error('No registration form.');
  page = await browser.open(new URL(action, page.url).href, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      email: signUp.email,
      firstName: 'Client',
      lastName: 'Check',
      password: signUp.password,
      'password-confirm': signUp.password,
    }).toString(),
  });
  if (browser.cameBack) throw new Error('Signed in without verifying the email: verifyEmail is not enforced.');
  if (!/verify your email|email verification/i.test(page.html)) {
    throw new Error(
      `Unexpected page after registering (HTTP ${page.status}): ${pageErrors(page.html).join(' | ') || page.url}`,
    );
  }

  page = await browser.open(await verificationLink(signUp));
  // Keycloak may show a page ("Click here to proceed", "Back to application") before it redirects.
  for (let i = 0; i < 3 && !browser.cameBack; i++) {
    const next = /<a[^>]*href="([^"]+)"[^>]*>[^<]*(?:proceed|back to application)/i.exec(page.html);
    if (!next) break;
    page = await browser.open(new URL(decodeHtml(next[1]!), page.url).href);
  }
  if (!browser.cameBack) throw new Error(`Never came back to the app (HTTP ${page.status}): ${page.url}`);
}

class ScriptedBrowser {
  cameBack = false;
  private readonly cookies = new Map<string, string>();

  constructor(private readonly redirectUri: string) {}

  /** Follows redirects by hand, keeping Keycloak's cookies; the loopback redirect is delivered for real. */
  async open(url: string, init: RequestInit = {}): Promise<Page> {
    let request = init;
    for (let hop = 0; hop < 15; hop++) {
      if (url.startsWith(this.redirectUri)) {
        const response = await fetch(url);
        this.cameBack = true;
        return { url, status: response.status, html: await response.text() };
      }
      const response = await fetch(url, {
        ...request,
        redirect: 'manual',
        headers: { ...(request.headers as Record<string, string> | undefined), cookie: this.cookieHeader() },
      });
      this.keep(response);
      const location = response.headers.get('location');
      if (response.status >= 300 && response.status < 400 && location) {
        url = new URL(location, url).href;
        // A redirect after a POST is followed with a GET.
        request = {};
        continue;
      }
      return { url, status: response.status, html: await response.text() };
    }
    throw new Error('Too many redirects.');
  }

  private keep(response: Response): void {
    for (const cookie of response.headers.getSetCookie()) {
      const [pair, ...attributes] = cookie.split(';');
      const eq = pair!.indexOf('=');
      const name = pair!.slice(0, eq).trim();
      const value = pair!.slice(eq + 1).trim();
      const expired = value === '' || attributes.some((a) => /^\s*max-age=0\s*$/i.test(a));
      if (expired) this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
  }

  private cookieHeader(): string {
    return [...this.cookies].map(([name, value]) => `${name}=${value}`).join('; ');
  }
}

function formAction(html: string, id: string): string | null {
  const match =
    new RegExp(`<form[^>]*id="${id}"[^>]*action="([^"]+)"`).exec(html) ?? /<form[^>]*action="([^"]+)"/.exec(html);
  return match ? decodeHtml(match[1]!) : null;
}

function pageErrors(html: string): string[] {
  return [...html.matchAll(/(?:kc-feedback-text|input-error[^"]*|alert-[a-z]+)"[^>]*>\s*([^<]+)</g)]
    .map((match) => match[1]!.trim())
    .filter(Boolean);
}

async function verificationLink({ mailpit, email }: SignUp): Promise<string> {
  for (let attempt = 0; attempt < 30; attempt++) {
    const list = (await (await fetch(`${mailpit}/api/v1/messages`)).json()) as {
      messages?: { ID: string; To?: { Address: string }[] }[];
    };
    const message = list.messages?.find((m) => m.To?.some((to) => to.Address === email));
    if (message) {
      const full = (await (await fetch(`${mailpit}/api/v1/message/${message.ID}`)).json()) as {
        Text?: string;
        HTML?: string;
      };
      const link =
        /https?:\/\/\S*action-token\S*/.exec(full.Text ?? '')?.[0] ??
        /https?:\/\/[^"'\s<>]*action-token[^"'\s<>]*/.exec(decodeHtml(full.HTML ?? ''))?.[0];
      if (!link) throw new Error('The verification email has no link.');
      return link;
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  throw new Error('No verification email reached Mailpit within 30 s.');
}

/**
 * A staff access token for the local stack's staff host (the backend's 4.9 and 4.12), signed in as the staff realm's
 * seeded `admin` with the password the backend's AppHost generated, through `admin-portal` with PKCE, as
 * tools/staff.mjs --local-admin does. The loopback code is read from Keycloak's redirect; nothing listens there.
 */
export async function staffAccessToken({
  keycloak,
  password,
}: {
  keycloak: string;
  password: string;
}): Promise<string> {
  const issuer = `${keycloak}/realms/sotto-staff`;
  const redirectUri = `http://127.0.0.1:${49152 + Math.floor(Math.random() * 10_000)}/callback`;
  const verifier = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64url');
  const challenge = Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))).toString(
    'base64url',
  );
  const authorize = new URL(`${issuer}/protocol/openid-connect/auth`);
  authorize.search = new URLSearchParams({
    client_id: 'admin-portal',
    response_type: 'code',
    redirect_uri: redirectUri,
    scope: 'openid',
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state: 'e2e',
  }).toString();

  const cookies = new Map<string, string>();
  const keep = (response: Response) => {
    for (const cookie of response.headers.getSetCookie()) {
      const [pair] = cookie.split(';');
      const eq = pair!.indexOf('=');
      cookies.set(pair!.slice(0, eq).trim(), pair!.slice(eq + 1).trim());
    }
  };
  const cookieHeader = () => [...cookies].map(([name, value]) => `${name}=${value}`).join('; ');

  const login = await fetch(authorize, { redirect: 'manual', headers: { cookie: cookieHeader() } });
  keep(login);
  const action = formAction(await login.text(), 'kc-form-login');
  if (!action) throw new Error(`No staff sign-in form (HTTP ${login.status}).`);
  let response = await fetch(new URL(action, authorize).href, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded', cookie: cookieHeader() },
    body: new URLSearchParams({ username: 'admin', password, credentialId: '' }).toString(),
  });
  keep(response);
  let location = response.headers.get('location');
  for (let hop = 0; hop < 5 && location && !location.startsWith(redirectUri); hop++) {
    response = await fetch(new URL(location, authorize).href, {
      redirect: 'manual',
      headers: { cookie: cookieHeader() },
    });
    keep(response);
    location = response.headers.get('location');
  }
  const code = location?.startsWith(redirectUri) ? new URL(location).searchParams.get('code') : null;
  if (!code) throw new Error(`The staff sign-in never came back with a code (HTTP ${response.status}).`);

  const token = await fetch(`${issuer}/protocol/openid-connect/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: 'admin-portal',
      code,
      redirect_uri: redirectUri,
      code_verifier: verifier,
    }).toString(),
  });
  const body = (await token.json()) as { access_token?: string; error?: string };
  if (!token.ok || !body.access_token) throw new Error(`The staff token was refused: ${body.error ?? token.status}.`);
  return body.access_token;
}
