// Drives the built Sotto client through its own windows, against the backend's local stack, with nobody at the
// computer: how 1.10 was checked "through the built app's own windows" (docs/roadmap.md). Electron runs with its
// debugging ports open: the driver clicks and types in the app window and the overlay over Chrome's DevTools protocol,
// and stands in for the system browser (shell.openExternal is replaced in main, and Keycloak's pages are played by a
// scripted browser). Everything else is the real app.
//
//   npm run build
//   node scripts/app-drive.mjs . app-drive.log      # the app's own output goes to the log
//
// Needs the backend's local stack running (`dotnet run --project src/Sotto.AppHost` there), Windows, and Electron's
// binary (`npm run dev` or `npm start` downloads it once). Purchases are paid the way the provider would, by the
// backend's tools/local-purchase.mjs (the backend is found next to this repository, or at SOTTO_BACKEND). It signs Sotto out on this computer before it starts and
// again at the end, so don't run it where a real sign-in must be kept. Each run leaves one test user
// (app-drive-<time>@example.com) in the local Keycloak and database. It reads the UI's words, so a change of wording
// can break it.
import { execFileSync, spawn } from 'node:child_process';
import crypto from 'node:crypto';
import { createWriteStream, existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const [clientDir, logPath] = process.argv.slice(2);
const KC = 'http://localhost:8080/realms/sotto';
const MAILPIT = 'http://localhost:8025';
const API = 'http://localhost:5180';
const CLIENT_ID = 'desktop';
const BACKEND = process.env.SOTTO_BACKEND || join(clientDir ?? '.', '..', 'backend', 'interview_backend');

const step = (msg) => console.log(`\n== ${msg}`);
const note = (...a) => console.log('  ', ...a);
const fail = (msg) => {
  throw new Error(msg);
};
/** Fails the run with `msg` unless `value` holds. */
const must = (value, msg) => value || fail(msg);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
/** The minutes as Home shows them: a plan's "187 min left", or a trial's "30 min · 14 days" (F9 · b). */
const minutesShown = /\d+ min left|\d+ min · \d+ days?/;

async function waitFor(what, fn, timeoutMs = 30_000, everyMs = 250) {
  const end = Date.now() + timeoutMs;
  let last;
  while (Date.now() < end) {
    try {
      const value = await fn();
      if (value) return value;
    } catch (error) {
      last = error;
    }
    await sleep(everyMs);
  }
  throw new Error(`Timed out waiting for ${what}${last ? ` (${last.message})` : ''}`);
}

// ---- A scripted browser on Keycloak's pages ----------------------------------------------------------------------
const b64url = (buf) => Buffer.from(buf).toString('base64url');
const sha256 = (s) => crypto.createHash('sha256').update(s).digest();
const decodeHtml = (s) =>
  s
    .replace(/&amp;/g, '&')
    .replace(/&#x3D;/g, '=')
    .replace(/&#61;/g, '=')
    .replace(/&quot;/g, '"');

class Browser {
  constructor(stopAt) {
    this.stopAt = stopAt;
    this.jar = new Map();
  }

  async open(url, init = {}) {
    for (let hop = 0; hop < 15; hop++) {
      if (url.startsWith(this.stopAt)) return { callback: url };
      const res = await fetch(url, {
        ...init,
        redirect: 'manual',
        headers: { ...(init.headers ?? {}), cookie: this.cookieHeader() },
      });
      this.keep(res);
      const location = res.headers.get('location');
      if (res.status >= 300 && res.status < 400 && location) {
        url = new URL(location, url).href;
        init = {};
        continue;
      }
      return { url, status: res.status, html: await res.text() };
    }
    fail('too many redirects');
  }

  keep(res) {
    for (const c of res.headers.getSetCookie()) {
      const [pair, ...attrs] = c.split(';');
      const eq = pair.indexOf('=');
      const name = pair.slice(0, eq).trim();
      const value = pair.slice(eq + 1).trim();
      if (value === '' || attrs.some((a) => /^\s*max-age=0\s*$/i.test(a))) this.jar.delete(name);
      else this.jar.set(name, value);
    }
  }

  cookieHeader() {
    return [...this.jar].map(([k, v]) => `${k}=${v}`).join('; ');
  }
}

function formAction(html, id) {
  const m =
    html.match(new RegExp(`<form[^>]*id="${id}"[^>]*action="([^"]+)"`)) ?? html.match(/<form[^>]*action="([^"]+)"/);
  return m ? decodeHtml(m[1]) : null;
}

const form = (body) => ({
  method: 'POST',
  headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams(body).toString(),
});

async function verificationLink(email) {
  for (let i = 0; i < 30; i++) {
    const list = await (await fetch(`${MAILPIT}/api/v1/messages`)).json();
    const msg = list.messages?.find((m) => m.To?.some((t) => t.Address === email));
    if (msg) {
      const full = await (await fetch(`${MAILPIT}/api/v1/message/${msg.ID}`)).json();
      const m =
        (full.Text ?? '').match(/https?:\/\/\S*action-token\S*/) ??
        decodeHtml(full.HTML ?? '').match(/https?:\/\/[^"'\s<>]*action-token[^"'\s<>]*/);
      return m?.[0] ?? fail('no link in the verification email');
    }
    await sleep(1000);
  }
  fail('no verification email');
}

/**
 * A new user with a verified email and no plan yet, made outside the app: the app's own button starts the trial. A
 * trial is once per computer too, so on a computer that already had one, `trialOutside` starts it from a stand-in.
 */
async function createUser() {
  const discovery = await (await fetch(`${KC}/.well-known/openid-configuration`)).json();
  const redirect = `http://127.0.0.1:${49152 + crypto.randomInt(10000)}/callback`;
  const verifier = b64url(crypto.randomBytes(32));
  const auth = new URL(discovery.authorization_endpoint);
  auth.search = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: 'code',
    redirect_uri: redirect,
    scope: 'openid email profile offline_access',
    code_challenge: b64url(sha256(verifier)),
    code_challenge_method: 'S256',
    state: b64url(crypto.randomBytes(16)),
  }).toString();
  const browser = new Browser(redirect);
  let page = await browser.open(auth.href);
  const reg = page.html.match(/href="([^"]*login-actions\/registration[^"]*)"/) ?? fail('no registration link');
  page = await browser.open(new URL(decodeHtml(reg[1]), page.url).href);
  const email = `app-drive-${Date.now()}@example.com`;
  const password = `Drv-${b64url(crypto.randomBytes(12))}9!`;
  page = await browser.open(
    new URL(formAction(page.html, 'kc-register-form') ?? fail('no registration form'), page.url).href,
    form({ email, firstName: 'App', lastName: 'Drive', password, 'password-confirm': password }),
  );
  if (page.callback) fail('signed in without verifying the email');
  page = await browser.open(await verificationLink(email));
  for (let i = 0; i < 3 && !page.callback; i++) {
    const next = page.html?.match(/<a[^>]*href="([^"]+)"[^>]*>[^<]*(?:proceed|back to application)/i);
    if (!next) break;
    page = await browser.open(new URL(decodeHtml(next[1]), page.url).href);
  }
  if (!page.callback) fail('never came back from the verification');
  const code = new URL(page.callback).searchParams.get('code');
  const tokenRes = await fetch(
    discovery.token_endpoint,
    form({
      grant_type: 'authorization_code',
      client_id: CLIENT_ID,
      code,
      redirect_uri: redirect,
      code_verifier: verifier,
    }),
  );
  const tokens = await tokenRes.json();
  if (!tokenRes.ok) fail(`token: ${JSON.stringify(tokens)}`);
  note('user:', email, '| no plan yet: the app starts the trial');

  /** The trial from a stand-in computer, removed again after, so the app's computer stays the account's only one. */
  async function trialOutside() {
    const api = (path, init = {}) =>
      fetch(`${API}${path}`, {
        ...init,
        headers: { authorization: `Bearer ${tokens.access_token}`, ...(init.headers ?? {}) },
      });
    const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
    const { kty, crv, x, y } = publicKey.export({ format: 'jwk' });
    const proof = (htm, htu, keyHeader) => {
      const header = { alg: 'ES256', typ: 'sotto-device-proof+jwt', ...keyHeader };
      const payload = {
        htm,
        htu,
        iat: Math.floor(Date.now() / 1000),
        jti: b64url(crypto.randomBytes(24)),
        ath: b64url(sha256(tokens.access_token)),
      };
      const input = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
      return `${input}.${b64url(crypto.sign('sha256', Buffer.from(input), { key: privateKey, dsaEncoding: 'ieee-p1363' }))}`;
    };
    let res = await api('/api/v1/devices', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-device-proof': proof('POST', '/api/v1/devices', { jwk: { kty, crv, x, y } }),
      },
      body: JSON.stringify({
        name: 'Driver',
        platform: 'windows',
        appVersion: '0.1.0',
        fingerprint: crypto.randomBytes(32).toString('hex'),
      }),
    });
    const device = await res.json();
    if (res.status !== 201) fail(`device: ${res.status} ${JSON.stringify(device)}`);
    res = await api('/api/v1/me/trial', {
      method: 'POST',
      headers: { 'x-device-proof': proof('POST', '/api/v1/me/trial', { kid: device.id }) },
    });
    const trial = await res.json();
    if (!res.ok) fail(`trial: ${res.status} ${JSON.stringify(trial)}`);
    res = await api(`/api/v1/devices/${device.id}`, {
      method: 'DELETE',
      headers: { 'x-device-proof': proof('DELETE', `/api/v1/devices/${device.id}`, { kid: device.id }) },
    });
    note('trial started outside the app:', trial.planName, trial.state, '| stand-in computer removed:', res.status);
  }

  return { email, password, trialOutside };
}

// ---- Chrome's DevTools protocol, over Node's WebSocket -------------------------------------------------------------
class Cdp {
  static async connect(url) {
    const ws = new WebSocket(url);
    await new Promise((resolve, reject) => {
      ws.onopen = resolve;
      ws.onerror = () => reject(new Error(`cannot connect to ${url}`));
    });
    return new Cdp(ws);
  }

  constructor(ws) {
    this.ws = ws;
    this.next = 0;
    this.pending = new Map();
    ws.onmessage = (m) => {
      const msg = JSON.parse(m.data);
      const waiter = msg.id && this.pending.get(msg.id);
      if (!waiter) return;
      this.pending.delete(msg.id);
      if (msg.error) waiter.reject(new Error(msg.error.message));
      else waiter.resolve(msg.result);
    };
    ws.onclose = () => {
      for (const waiter of this.pending.values()) waiter.reject(new Error('target closed'));
      this.pending.clear();
    };
  }

  send(method, params = {}) {
    const id = ++this.next;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }

  async eval(expression) {
    const r = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
      includeCommandLineAPI: true,
    });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
    return r.result.value;
  }

  close() {
    this.ws.close();
  }
}

const targets = async (port) => (await fetch(`http://127.0.0.1:${port}/json/list`)).json();

async function connectMain() {
  const target = await waitFor('the main process inspector', async () => (await targets(9229))[0]);
  return Cdp.connect(target.webSocketDebuggerUrl);
}

async function connectPage(part) {
  const target = await waitFor(`the ${part} page`, async () =>
    (await targets(9222)).find((t) => t.type === 'page' && t.url.includes(part)),
  );
  const page = await Cdp.connect(target.webSocketDebuggerUrl);
  await waitFor(`the ${part} page to render`, () =>
    page.eval('document.readyState === "complete" && document.body.innerText.length > 0'),
  );
  return page;
}

const textOf = (page) => page.eval('document.body.innerText');
const clickButton = (page, label) =>
  page.eval(`(() => {
    const b = [...document.querySelectorAll('button')].find((b) => !b.disabled && b.innerText.trim().startsWith(${JSON.stringify(label)}));
    if (!b) return false;
    b.click();
    return true;
  })()`);

let app = null;

function launch(tag) {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const out = createWriteStream(logPath, { flags: 'a' });
  out.write(`\n=== launch ${tag} ${new Date().toISOString()}\n`);
  const child = spawn(
    join(clientDir, 'node_modules/electron/dist/electron.exe'),
    ['--inspect=9229', '--remote-debugging-port=9222', clientDir],
    {
      cwd: clientDir,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  child.stdout.pipe(out, { end: false });
  child.stderr.pipe(out, { end: false });
  child.exited = new Promise((resolve) => child.once('exit', resolve));
  app = child;
  return child;
}

async function quit(main) {
  await main
    .eval(`(process.mainModule ? process.mainModule.require('electron') : require('electron')).app.quit()`)
    .catch(() => {});
  await Promise.race([app.exited, sleep(10_000)]);
  if (app.exitCode === null) app.kill();
  await sleep(500);
}

/** The system browser, as far as the app can tell: main's shell.openExternal records the URL instead. */
async function stubBrowser(main) {
  return main.eval(`(() => {
    const { shell, app } = process.mainModule ? process.mainModule.require('electron') : require('electron');
    globalThis.__opened = [];
    shell.openExternal = async (url) => { globalThis.__opened.push(url); };
    return app.getPath('userData');
  })()`);
}

// ---- The run -------------------------------------------------------------------------------------------------------
async function run() {
  // Each run starts as a new computer: signed out, and with no database, so the first run's setup opens by itself.
  const appData = process.env.APPDATA ?? fail('no APPDATA');
  rmSync(join(appData, 'Sotto', 'secrets'), { recursive: true, force: true });
  for (const suffix of ['', '-wal', '-shm']) rmSync(join(appData, 'Sotto', `sotto.db${suffix}`), { force: true });

  step('A user with a verified email and no plan yet (outside the app)');
  const { email, password, trialOutside } = await createUser();

  step('Launch 1: the first run, its setup opening by itself');
  launch('1');
  let main = await connectMain();
  const userData = await stubBrowser(main);
  note('userData:', userData);
  let home = await connectPage('app/index.html');
  await waitFor('the notice', async () => (await textOf(home)).includes('Before your first session: what goes where'));
  note('Setup, step 1:', (await textOf(home)).match(/To OpenAI[^\n]*/)?.[0]);
  must(await clickButton(home, 'I understand'), 'no I understand');

  step("Sign in, the setup's step 2");
  await waitFor('the sign-in step', async () =>
    (await textOf(home)).includes('Sign in, or create an account, in your browser.'),
  );
  must(await clickButton(home, 'Sign in'), 'no Sign in button');
  const url = await waitFor(
    'the app to open the sign-in page',
    () => main.eval('globalThis.__opened[0] ?? null'),
    20_000,
  );
  const signInUrl = new URL(url);
  note(
    'opened:',
    signInUrl.origin + signInUrl.pathname,
    '| PKCE:',
    signInUrl.searchParams.get('code_challenge_method'),
    '| redirect:',
    signInUrl.searchParams.get('redirect_uri'),
  );
  await waitFor('"Finish signing in in your browser."', async () =>
    (await textOf(home)).includes('Finish signing in in your browser.'),
  );
  note('Setup says: Finish signing in in your browser.');
  const browser = new Browser(signInUrl.searchParams.get('redirect_uri'));
  let page = await browser.open(url);
  const login = formAction(page.html, 'kc-form-login') ?? fail(`no login form (HTTP ${page.status})`);
  page = await browser.open(new URL(login, page.url).href, form({ username: email, password, credentialId: '' }));
  if (!page.callback) fail(`the login did not come back (HTTP ${page.status}) ${page.url}`);
  const back = await fetch(page.callback);
  note(
    "the app's loopback answered",
    back.status,
    (await back.text()).includes('You can close this tab') ? '"You can close this tab…"' : '',
  );
  await waitFor(
    'the setup to move on by itself',
    async () => (await textOf(home)).includes('Answers are grounded in these.'),
    30_000,
  );
  note('Setup, step 3: Your documents (skipped)');
  must(await clickButton(home, 'Skip for now'), 'no Skip for now');

  step('The trial, started from the setup: the sound check is a session, and needs minutes (F9 · a)');
  must(await clickButton(home, 'Start the trial'), 'no Start the trial at the sound check');
  const outcome = await waitFor(
    'the trial to start, or the server to refuse it',
    async () => {
      const shown = await textOf(home);
      if (shown.includes('Start the sound check')) return 'started';
      return /already used[^\n]*/.exec(shown)?.[0] ?? null;
    },
    30_000,
  );
  if (outcome === 'started') {
    note('the trial started from the app: the step now offers the sound check');
  } else {
    // Once per person and per computer: this computer had a trial in an earlier run, and the app says the server's words.
    note('the app says:', outcome);
    await trialOutside();
    await home.eval('window.appApi.refresh()');
    await waitFor(
      'the sound check, with the trial',
      async () => (await textOf(home)).includes('Start the sound check'),
      30_000,
    );
  }

  step('The sound check, a session of its own on the server');
  must(await clickButton(home, 'Start the sound check'), 'no Start the sound check');
  await waitFor(
    "the sound check's session",
    async () => (await textOf(home)).includes("Hearing this computer's sound"),
    30_000,
  );
  note("Setup, step 4: Hearing this computer's sound (the local stack's scripted speech-to-text ignores real sound)");
  must(await clickButton(home, 'Continue'), 'no Continue on the sound check');
  await waitFor('the hotkeys', async () => (await textOf(home)).includes('Your hands stay on the call'));
  must(await clickButton(home, 'Continue'), 'no Continue on the hotkeys');
  await waitFor('Test hiding', async () => (await textOf(home)).includes('Check it once with a real share.'));
  must(await clickButton(home, 'Skip the test'), 'no Skip the test');

  await waitFor('the account on Home', async () => minutesShown.test(await textOf(home)), 30_000);
  const signedIn = await textOf(home);
  note(
    'Home minutes card:',
    signedIn.match(minutesShown)?.[0],
    '|',
    signedIn.match(/(Ends [^\n]*)/)?.[1] ?? signedIn.match(/([^\n]* plan[^\n]*)/)?.[1],
  );
  note('the line:', signedIn.match(/(Your trial has started[^\n]*)/)?.[1] ?? 'none');

  step('The account page');
  must(await clickButton(home, 'Account'), 'no Account in the sidebar');
  await waitFor('the account page', async () => /Minutes you can use now/i.test(await textOf(home)));
  const account = await textOf(home);
  note('who:', account.match(/([^\n]*•••@example\.com)/)?.[1]);
  note(
    'plan:',
    account.match(/Plan\s*\n([^\n]+)/i)?.[1],
    '| computers:',
    account.match(/Computers\s*\n([^\n]+)/i)?.[1],
  );
  note('computers card:', account.match(/(This computer[^\n]*)/)?.[1]);
  must(await clickButton(home, 'Home'), 'no Home in the sidebar');

  step('What this computer stored');
  const secrets = join(userData, 'secrets');
  for (const name of ['refresh-token', 'device-key', 'device-id']) {
    const file = join(secrets, `${name}.bin`);
    const bytes = existsSync(file) ? readFileSync(file) : null;
    const plain =
      bytes &&
      (bytes.includes(Buffer.from('eyJ')) ||
        bytes.includes(Buffer.from('PRIVATE KEY')) ||
        /[0-9a-f]{8}-[0-9a-f]{4}-/.test(bytes.toString('latin1')));
    note(
      `${name}.bin:`,
      bytes
        ? `${bytes.length} bytes, ${plain ? 'READABLE AS PLAIN TEXT' : 'encrypted (no token, key or id readable)'}`
        : 'missing',
    );
  }

  step('Launch 2: the stored sign-in comes back without the browser');
  await quit(main);
  launch('2');
  main = await connectMain();
  await stubBrowser(main);
  home = await connectPage('app/index.html');
  await waitFor('the account on Home after restart', async () => minutesShown.test(await textOf(home)), 30_000);
  note(
    'Home after restart:',
    (await textOf(home)).match(minutesShown)?.[0],
    '| browser opened:',
    await main.eval('globalThis.__opened.length'),
    'times',
  );

  step('A live session from Home');
  must(
    await home.eval(
      `(() => { const box = document.querySelector('input[type=checkbox]'); box.click(); return box.checked; })()`,
    ),
    'the consent box did not tick',
  );
  must(await clickButton(home, 'Start session'), 'Start session is not enabled');
  const overlay = await connectPage('overlay/index.html');
  await waitFor('the session to start', async () => /MANUAL|AUTO/.test(await textOf(overlay)), 20_000);
  note('overlay strip:', (await textOf(overlay)).split('\n').filter(Boolean).slice(0, 6).join(' | '));

  // 1.11: the call's sound is captured while the session runs, and the strip's meter follows it. The meter holds still
  // at 5, 9, 12 and 7 px until the first frame reaches main, so leaving that proves frames flow; silence lays it at
  // 3 px, sound raises it.
  const capturing = await waitFor(
    'the capture window',
    async () => (await targets(9222)).find((t) => t.type === 'page' && t.url.includes('capture/index.html')),
    10_000,
  );
  note('capture window open:', capturing.url.split('/').slice(-2).join('/'));
  const meterBars = () =>
    overlay.eval(`(() => {
      const m = document.querySelector('.meter:not(.flat)');
      return m ? [...m.querySelectorAll('i')].map((i) => parseInt(i.style.height, 10)) : null;
    })()`);
  await waitFor(
    'the meter to follow a level',
    async () => {
      const bars = await meterBars();
      return bars && bars.join() !== '5,9,12,7';
    },
    10_000,
  );
  // How loud, over two seconds: it depends on what this computer plays, so it is noted, not checked.
  let tallest = [3, 3, 3, 3];
  for (let i = 0; i < 10; i++) {
    const bars = await meterBars();
    if (bars && bars[2] > tallest[2]) tallest = bars;
    await sleep(200);
  }
  note('meter follows a level; tallest bars in 2 s:', tallest.map((h) => `${h}px`).join(' '));

  await overlay.eval(`(() => {
    const t = document.querySelector('textarea');
    t.focus();
    t.value = 'What is a mutex?';
    t.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  })()`);
  must(await clickButton(overlay, 'Answer'), 'no Answer button');
  await waitFor('the answer', async () => (await textOf(overlay)).includes('Sure, here is the answer.'), 30_000);
  note('answer shown:', (await textOf(overlay)).match(/(Sure, here is the answer\.)/)?.[1]);

  step('End the session from the overlay');
  must(
    await overlay.eval(
      `(() => { const b = document.querySelector('button[aria-label="More"]'); b?.click(); return !!b; })()`,
    ),
    'no More button',
  );
  must(await clickButton(overlay, 'End session'), 'no End session in More');
  await waitFor('the confirmation', () => overlay.eval(`!!document.querySelector('.confirm-slot')`));
  must(
    await overlay.eval(`(() => {
    const b = [...document.querySelectorAll('.confirm-slot button')].find((b) => b.innerText.includes('End session'));
    b?.click();
    return !!b;
  })()`),
    'no End session in the confirmation',
  );
  const ended = await waitFor(
    'the ended state',
    () => overlay.eval(`document.querySelector('.ended')?.innerText ?? null`),
    15_000,
  );
  note('overlay says:', ended.replace(/\s+/g, ' ').trim());
  await waitFor(
    'the capture window to close with the session',
    async () => !(await targets(9222)).some((t) => t.url.includes('capture/index.html')),
    10_000,
  );
  note('capture window closed');
  must(
    await overlay.eval(
      `(() => { const b = [...document.querySelectorAll('.ended-foot button')].find((b) => b.innerText.includes('Close')); b?.click(); return !!b; })()`,
    ),
    'no Close',
  );
  await waitFor(
    'the overlay to close',
    async () => !(await targets(9222)).some((t) => t.url.includes('overlay/index.html')),
    10_000,
  );
  note('overlay closed; the app window is back:', await home.eval('document.visibilityState'));

  step('The ledger after the session');
  must(await clickButton(home, 'Account'), 'no Account in the sidebar');
  await waitFor('the account page', async () => /Minutes you can use now/i.test(await textOf(home)));
  must(await clickButton(home, 'The ledger'), 'no The ledger');
  await waitFor('the ledger', async () => (await textOf(home)).includes('Every change to your minutes, newest first.'));
  const ledger = (await textOf(home))
    .split('Every change to your minutes, newest first.')[1]
    ?.trim()
    .split('\n')
    .filter(Boolean)
    .slice(0, 12);
  note(ledger?.join(' | '));
  must(await clickButton(home, 'Account ›'), 'no Account ›');
  await waitFor('the account page', async () => /Minutes you can use now/i.test(await textOf(home)));

  // 2.13: buying in the browser. The stubbed browser keeps each page the app opens; the purchase tool pays it.
  const opened = () => main.eval('globalThis.__opened.slice()');
  const pay = (url, ...args) =>
    execFileSync(process.execPath, [join(BACKEND, 'tools', 'local-purchase.mjs'), url, ...args], {
      encoding: 'utf8',
    }).trim();
  const nextOpened = async (what, count) => waitFor(what, async () => (await opened())[count] ?? null, 20_000);

  step('A top-up, bought in the browser: the window waits, and the minutes arrive by themselves (F8 · b, c)');
  let seen = (await opened()).length;
  must(await clickButton(home, 'Top up +100 minutes'), 'no Top up +100 minutes');
  const topUpUrl = await nextOpened('the checkout page to open', seen++);
  must(topUpUrl.startsWith('https://'), `opened a page that is not https: ${topUpUrl}`);
  note('opened:', new URL(topUpUrl).origin + new URL(topUpUrl).pathname.split('/').slice(0, 2).join('/') + '/…');
  await waitFor('the window to wait for the payment', async () =>
    (await textOf(home)).includes('Finish in your browser.'),
  );
  note('the window says: Finish in your browser. | the provider:', pay(topUpUrl).split('\n').join(' | '));
  await waitFor(
    'the minutes to arrive by themselves',
    async () => /100 minutes added\. They last until/.test(await textOf(home)),
    30_000,
  );
  note('the window says:', (await textOf(home)).match(/100 minutes added\.[^\n]*/)?.[0]);
  must(await clickButton(home, 'OK'), 'no OK on the line');

  step('A plan, chosen in the app and bought in the browser (F9 · c)');
  must(await clickButton(home, 'Change plan'), 'no Change plan');
  await waitFor('the plans', async () => (await textOf(home)).includes('Choose Credits'));
  note(
    'cards:',
    (await textOf(home)).match(/400 minutes a month[^\n]*/)?.[0],
    '|',
    (await textOf(home)).match(/Fair use[^\n]*/)?.[0],
  );
  must(await clickButton(home, 'Choose Credits'), 'no Choose Credits');
  const planUrl = await nextOpened('the checkout page to open', seen++);
  note('the provider:', pay(planUrl).split('\n').join(' | '));
  await waitFor('the plan to arrive by itself', async () => /Credits plan started/.test(await textOf(home)), 30_000);
  const onPlan = await textOf(home);
  note(
    'the window says:',
    onPlan.match(/Credits plan started[^\n]*/)?.[0],
    '| plan:',
    onPlan.match(/Credits Active/)?.[0],
    '| minutes now:',
    // The trial's minutes end with it: the plan's month and the top-up's minutes are what is left.
    onPlan.match(/Minutes you can use now\s*\n\s*(\d+ min)/i)?.[1],
  );
  must(/Minutes you can use now\s*\n\s*500 min/i.test(onPlan), "the plan's minutes are not with the top-up's");
  must(await clickButton(home, 'OK'), 'no OK on the line');

  step("Manage billing: the provider's portal, in the browser");
  must(await clickButton(home, 'Manage billing'), 'no Manage billing');
  const portalUrl = await nextOpened('the portal to open', seen);
  note('opened:', new URL(portalUrl).origin + '/portal/…');

  step('Sign out, after the confirmation (F10 · e)');
  must(await clickButton(home, 'Sign out'), 'no Sign out');
  await waitFor('the confirmation', async () => (await textOf(home)).includes('Sign out of Sotto on this computer?'));
  must(
    await home.eval(`(() => {
      const b = [...document.querySelectorAll('.confirm button')].find((b) => b.innerText.trim() === 'Sign out');
      b?.click();
      return !!b;
    })()`),
    'no Sign out in the confirmation',
  );
  await waitFor('"Not signed in."', async () => (await textOf(home)).includes('Not signed in.'));
  note(
    'Account says: Not signed in. Stored now:',
    ['refresh-token', 'device-key', 'device-id']
      .map((n) => `${n} ${existsSync(join(secrets, `${n}.bin`)) ? 'kept' : 'gone'}`)
      .join(', '),
  );

  await quit(main);
  // The test user's device key must not stay behind as this computer's identity.
  rmSync(secrets, { recursive: true, force: true });
  note('removed', secrets);
  console.log('\nALL STEPS PASSED');
}

run().catch(async (error) => {
  console.error(`\nFAILED: ${error.message}`);
  if (app && app.exitCode === null) app.kill();
  process.exit(1);
});
