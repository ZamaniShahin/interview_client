# Decisions: the client

What this repository settled, who settled it, and what was chosen while building.

- **Product decisions:** plans, the protocol, what is sent where, the stealth rules as requirements. They live in the backend's [decisions.md](../../backend/interview_backend/docs/decisions.md), which wins on any disagreement.
- **The open questions** (Q1–Q25) are numbered there too.

**Rule:** a row goes in §1 only when a person decided it on a date. Choices made while writing code are recorded too, marked "taken in session, open to revision", so nobody mistakes them for team positions.

## 1. Settled

| Date | Decision | Who |
|---|---|---|
| 2026-11-05 | **The client's technical design is the plan** of the backend's `docs/client/README.md`, now this repository's [README](../README.md): Electron, TypeScript, electron-vite, Vue 3 + Pinia, SignalR in main, generated contracts, the stealth rules with tests | Shahin (backend decisions.md: "The design in docs/00–10 is the plan") |
| 2026-11-06 | **The UI uses a neutral placeholder until Sotto has a brand**: system fonts, grays, amber key words; nothing of ARN Fintech's design system | Shahin |
| 2026-11-06 | **Claude completes the UI design** ([design.md](design.md)), **then this skeleton**: "with this new ui, make the skeleton of client source code, base project, and components we want based the business we have, then make the claude.md of it and expected docs, to it could work independently" | Shahin |
| 2026-11-08 | **The next step is sign-in (1.10) and the hub connection (1.12)**, with **openid-client** as the README planned ("openid-client, as planned") | Shahin |

## 2. Taken in session while building the skeleton (open to revision)

| Date | Decision |
|---|---|
| 2026-11-06 | **Package versions:** exact pins, each at least two weeks old when added, from registry.npmjs.org only. Electron is 45.0.0 (2026-10-21); 45.2.3 came out 2026-11-04, so it is due by 2026-11-18 under the two-week security rule. TypeScript is 5.9.3 because typescript-eslint supports below 6.1; TypeScript 7 waits for it. `@types/node` follows Electron 45's Node 24 |
| 2026-11-06 | **Packages arrive with their checkpoints.** The skeleton adds only what it uses; openid-client, better-sqlite3-multiple-ciphers, highlight.js, Mermaid, pdfjs-dist, mammoth, electron-updater, @electron/fuses, Sentry and Playwright wait for theirs ([README](../README.md#tech-decisions), Status column) |
| 2026-11-06 | **Two windows**: the overlay, and an app window outside sessions (960 × 640, with a sidebar). The latter is the UI canvas's proposal for the backend's Q15. During a session the app window hides and the overlay is skipped from the taskbar (the `trayOnly` setting, on by default, Q16). There is no tray icon yet: it needs an icon |
| 2026-11-06 | **A session controller in main** owns the overlay's view state and runs a pure reducer (`src/shared/live/reducer.ts`) over the hub's events. The overlay mirrors the whole state, sent at most every 33 ms. A driver feeds it: the hub at 1.12, or the scripted **preview** in development (`!app.isPackaged`) |
| 2026-11-06 | **IPC** is a fixed set of channels (`ipc-channels.ts`). Every payload is checked with zod in main and accepted only from its own window. Starting a session carries `consent: true`, so main refuses a start without the box ticked |
| 2026-11-06 | **Preloads are built whole** (`isolatedEntries`), so a sandboxed preload never needs a second file. They import no package. Every renderer is sandboxed (`app.enableSandbox()`) |
| 2026-11-06 | **The Content Security Policy** is set at build time: `connect-src 'none'` in a built app, plus the dev server's websocket in development. `style-src` allows inline styles, which Vue's component styles need |
| 2026-11-06 | **Answers render through markdown-it with links, images, tables and HTML disabled**, then DOMPurify (tags: paragraphs, lists, emphasis, code, spans). `***key words***` become `span.kw`; a heading reads as a bold line; a Mermaid fence shows as a "Diagram" code block until 1.13 |
| 2026-11-06 | **Compact is decided by the overlay's height** (under 300 px), so the hotkey, the button and the grip all just resize the window |
| 2026-11-06 | **Settings live in main, in memory**, until the local database (3.13). Theme, text size and opacity apply at once to both windows |
| 2026-11-06 | **Session hotkeys are global only while a session runs**, and released when it ends |
| 2026-11-06 | **The overlay's corners are square for now.** A frameless window that isn't transparent can't show the canvas's 12 px radius. Transparency, or Windows 11's rounded-corner attribute, is for 1.13 to weigh |
| 2026-11-06 | **The appId `com.sotto.desktop` is a placeholder** until the domain is chosen (backend Q4) |
| 2026-11-06 | **The text limits** (`src/shared/text-limits.ts`) mirror the server's, for counting and warning only. The server answers `invalid_input` / `too_long` past them |

## 3. Taken in session while building sign-in and the hub (1.10, 1.12; open to revision)

| Date | Decision |
|---|---|
| 2026-11-08 | **openid-client 6.8.8 is bundled into main**, with its two dependencies (jose 6.2.15, oauth4webapi 3.8.8): it ships as ES modules only, and main is CommonJS. The two-week rule was applied to the package added; jose 6.2.15 was 7 days old, taken as openid-client's dependency |
| 2026-11-08 | **The preview is opt-in:** `npm run dev:preview` (Vite's `--mode preview`) plays it; `npm run dev` talks to the local stack. A packaged build never has it |
| 2026-11-08 | **Stored on this computer**, each through `SecretStore`, encrypted with safeStorage in `userData/secrets/`: the refresh token, the device's private key (PKCS #8), the device id. Where the OS can't encrypt, they stay in memory and the sign-in lasts until the app quits. The access token is never stored |
| 2026-11-08 | **Sent at registration** (`POST /api/v1/devices`): the computer's host name as the device name (cut to the server's 100 characters), the platform, the app version, and a **fingerprint**: the SHA-256 of `sotto-device:` and Windows' `MachineGuid` (or, failing that, the host name, platform, CPU architecture and model). Only the hash leaves; the server peppers and hashes it again |
| 2026-11-08 | **A key the server refuses at registration** (`device_key_revoked`: the account removed this computer; `device_key_in_use`: another account holds it) **is replaced once**, and the computer registers as a new device (the journeys' J4) |
| 2026-11-08 | **The access token is renewed** when less than a minute is left, and once more after a `401 unauthenticated`, with a fresh device proof. A renewal that lands after signing out is revoked, not stored |
| 2026-11-08 | **Sign-in can be cancelled in the app** while the browser is open; the loopback waits 5 minutes at most. A cancel is not shown as a problem |
| 2026-11-08 | **The app window's problems:** one from reading the account clears when a read works; one from something the user did (sign in, start) stays until their next action |
| 2026-11-08 | **The email is shown masked** (`s•••@example.com`): the window may be on a shared screen outside a session |
| 2026-11-08 | **The session's tier is the plan's:** smart when the entitlements carry `smart_tier`, fast otherwise (backend Q17) |
| 2026-11-08 | **A session starts in AUTO only with both the résumé and the job description**, as Home says; until the documents arrive (1.14), it starts in MANUAL |
| 2026-11-08 | **A refused hub connection is read from its close.** The server accepts the handshake, then closes with `HubException: <code>` (`client_outdated`, `account_suspended`, `unauthenticated`); the app shows its own words for those codes |
| 2026-11-08 | **After a drop, the hub driver reconnects itself**, not SignalR's automatic reconnect: waits of 1, 2, 4, 8, then 10 s, a new access token and proof each time, `ResumeSession` with `LastSeq`, and a snapshot when the replay is incomplete. After 2 minutes (the server's suspend grace) the session ends as expired |
| 2026-11-08 | **The end-to-end check is a Vitest test** (`tests/e2e`, `SOTTO_E2E=1`) running main's modules in Node against the backend's AppHost, with a scripted browser ported from the backend's `tools/signin-check.mjs`. Playwright for the windows themselves stays with 1.13 |

## 4. Taken in session on 2026-11-09, keeping everything in the repository (open to revision)

Shahin asked for everything about the project to be in the repositories, so work can go on from another computer.

| Date | Decision |
|---|---|
| 2026-11-09 | **A copy of the UI canvas's own files** is kept in [design/canvas/](design/canvas/), taken from the canvas on claude.ai that day. The canvas stays the source ([design.md](design.md)) |
| 2026-11-09 | **The scripts that checked 1.10 and the design are kept in `scripts/`**, formatted and linted like the rest: `app-drive.mjs` (the built app through its own windows), `oidc-cjs-check.mjs`, `contrast.mjs`, `pick-versions.mjs`, `design-unbundle.mjs` and `design-split.mjs`. They had been scratch files on one computer |
| 2026-11-09 | **Claude Design's export stays out of the repositories**: it carries ARN Fintech's design system, which this product leaves out (backend decisions.md, 2026-11-05 and 2026-11-06). Shahin keeps the file; its practice screens are redrawn on these tokens before 3.3 is built |
