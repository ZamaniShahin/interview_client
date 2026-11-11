# Roadmap: the client

The client's checkpoints, as a checklist. The numbers are the backend roadmap's (`../backend/interview_backend/docs/10-roadmap.md`), so one number names the same step in both repositories.
- What each one gives the user is in [06-scope-and-phases.md](06-scope-and-phases.md).
- A checkpoint is ticked with its date and its commit.

**Where it stands (2026-11-09):**
- done: C0, all of Phase 1 (1.10–1.14) and 2.13, the account and plan screens: everything backend Q35 asked for; then 2.16, a plan given by Sotto, the words for the server's connection limit, and 4.11, the user's data (a copy, and deleting the account);
- next: Phase 3, whose client checkpoints follow the server's (3.1–3.4);
- the contract is synced with the backend's (2026-11-09): the app handles `Usage`, `SessionEnding` and `EntitlementsUpdated`, and offers the takeover (`TakeOver`) on Home.

## The skeleton

- [x] **C0 The skeleton** (2026-11-06, `97a1bee`):
  - the base project;
  - the two windows with the stealth rules main applies;
  - the session controller, its reducer, and the development preview;
  - IPC checked with zod;
  - the settings;
  - the UI's components on the placeholder tokens;
  - the safe answer renderer;
  - the hub connection over the generated contract, not yet driven;
  - CLAUDE.md and these docs;
  - the checks: 60 tests in 10 files, lint with the stealth rules, type-checking, a build whose preloads are single files.

## Phase 1: the live core

- [x] **1.10 Sign-in** (2026-11-08, `3212ec9`, checked end to end against the local stack):
  - the system browser, PKCE, a loopback redirect, openid-client in main;
  - tokens in main, the refresh token in safeStorage, one refresh at a time;
  - the device key and its proofs;
  - `GET /api/v1/me` after sign-in;
  - the account read from REST into `AccountView`.
- [x] **1.11 The capture window** (2026-11-09, `c8ccfc0`; checked on Windows with `scripts/capture-check.mjs`, 57 frames in 6 s, and through the built app's own windows with `scripts/app-drive.mjs`):
  - Windows loopback → Web Audio (mono, 24 kHz) → AudioWorklet → PCM16 100 ms frames → a MessagePort to main;
  - the level meter fed, and the no-sound warning after 20 s (Q18);
  - a lost device reopened after 1.5 s, with words in the strip meanwhile.
- [x] **1.12 The hub connection in main** (2026-11-09, `58abf2f`): the `HubDriver`, over `createLiveTransport`.
  - [x] `StartSession` with a device proof (2026-11-08, `3212ec9`);
  - [x] `UploadAudio` streamed, with the 10 s ring buffer; nothing while paused; checked end to end against the local stack (2026-11-09, `c8ccfc0`);
  - [x] a device proof at connect too (backend docs/04 §6), built on both sides together: the client in `58abf2f`, the server in backend `459db08` (2026-11-09; checked end to end, a forged proof refused);
  - [x] `ResumeSession` with `LastSeq` after a drop, and a snapshot when the replay is incomplete (2026-11-08, `3212ec9`);
  - [x] the preview stays for development: `npm run dev:preview` (2026-11-08, `3212ec9`).
- [x] **1.13 The overlay, complete** (2026-11-09, `83a6009`; packages in `4cc3cac`; checked with the app tests, 5 of 5, three times):
  - Mermaid (lazy, strict, SVG labels) and highlight.js in answers, with Copy on code blocks;
  - following a long answer, with "New text below";
  - Playwright end to end against the preview, the stand-in for the hub (`node scripts/app-tests.mjs`);
  - the display-affinity test: `0x11` for every window on screen, and after hide and show;
  - the rounded corners decided: Windows 11's own (decisions §8), and no "tray only" setting (Q16).
- [x] **1.14 First run** (2026-11-09: the database `a65a9d2`, its package `5607cde`, the documents `ca36b88`, the setup `66108ed`; checked with the app tests and with `scripts/app-drive.mjs` on a fresh computer against the local stack):
  - the setup wizard, with the OpenAI notice, sign-in and the device;
  - the documents (with the local database);
  - the sound check, the hotkeys, and 🛡 Test hiding.

## Phase 2: plans and billing

- [x] **2.13 The account and plan screens** (2026-11-09, `16c81bd`, with the server's catalog and account facts in backend `4d69bce` and `f7f3496`; checked with the app tests, the end-to-end tests and `scripts/app-drive.mjs` against the local stack):
  - the session-ending messages, and the offer after a session that ran out of minutes (F8 · a);
  - the device list with removal, and the device limit met by removing one in this computer's place (F3);
  - buying in the browser from the server's catalog, the window waiting until the purchase shows (F8 · b, c), and the trial (F9);
  - reading the account again on return from the browser, and every few seconds while a payment is waited for (decisions §10).
- [x] **2.16 A plan given by Sotto** (2026-11-09, `9dd00c0`, with the server's licence registry in backend `3a51c5d` and its staff tools in `e42e956`; checked with the unit and renderer tests and an end-to-end test against the local stack): a licensed plan says "given by Sotto", with its end if it has one, and the app offers nothing to buy, no trial and no top-up while it lasts.

## Phase 3: everything v1 did

Built by Claude in Shahin's unattended run ("anything left before deployment", 2026-11-10 and 2026-11-11), each checkpoint on a branch of its own, built on the one before; the backend's branches through `feature/deep-round-3.3-3.4` are merged first, since the contract comes from them.

- [x] **3.6 The screenshot region selector** (2026-11-11, `f3b1838`, branch `feature/screenshot-selector`, on the server's 3.1; checked with the unit and renderer tests, the app tests against the real selector, 4 of 4, and the end-to-end tests against the local stack):
  - v1's selector, ported: the display under the pointer frozen into a window that never takes focus and is left out of captures; a click takes it all, a drag an area, Esc or a right-click nothing; only where Windows leaves protected windows out of captures (build 19041 and later);
  - the screenshot button and Ctrl+Shift+G: in AUTO asked about at once with what was typed as its note, in MANUAL attached for the next answer; the attached ones over the ask bar, and under each answer the ones it read, to attach again;
  - the images in main's memory only, never on disk, and attached again after the session moves to another server (decisions §15).
- [ ] 3.7 The speech coach, on the device (engine: Q5).
- [x] **3.8 The prepared-answer match 📌, on the device** (2026-11-11, `7dffc62`, branch `feature/answer-bank`, on 3.10's; with the preferences of the server's 3.2; checked with the unit and renderer tests, the app tests, 23 of 23, and the end-to-end tests against the local stack, 4 of 4):
  - Prepare's custom instructions and answer bank, kept on this computer (the `answer_bank` table of docs/07 §5, by migration 2), held to v1's entry rules;
  - the instructions and the enabled entries sent with each session (`SetPreferences`);
  - v1's `best_match`, ported and checked against v1's own tables, run in main as an answer starts, and the user's own answer shown at once in the 📌 card (decisions §17).
- [ ] 3.9 Local history and the debrief view.
- [x] **3.10 Reading documents (PDF, Word) on the device** (2026-11-11, `9d5bace`, branch `feature/documents`, on 3.6's; with the prep doc of the server's 3.2; checked with the unit and renderer tests and the app tests reading real files, 4 of 4):
  - "From a file" in Prepare for the résumé, the job description, the notes and the prep doc; the text read shows in the editor first, and a document over its limit comes back whole, its limit named;
  - files read by pdf.js and mammoth in a hidden, sandboxed window of their own, never in main; 20 MB, 500 pages and 20 s at most;
  - the prep doc kept with its file's name, cut at a line break past 100,000 characters as v1 cut it, and sent at a session's start (`SetPrepDoc`) (decisions §16).
- [ ] 3.11 The consent checkbox before each session. It is drawn, and main already refuses a start without it; this checkpoint is its final wording (4.8) and its tests end to end.
- [ ] 3.12 Recording, opt-in.
- [ ] 3.13 Settings, kept in the local database; hotkeys remappable.
- [ ] Practice (with the server's 3.3): Claude Design's practice screens redrawn on these tokens, following Q21–Q24 as answered on 2026-11-09 ([design.md](design.md)).

## Phase 4: ready for launch

- [ ] 4.1 Hardening:
  - @electron/fuses, ASAR integrity, the `app://` protocol;
  - the Content Security Policy reviewed;
  - Sentry without content.
- [ ] 4.2 Signed builds (cloud HSM) and staged automatic updates (electron-updater); `minClientVersion` honored.
- [x] **The server's connection limit, in words** (backend Q36, part of its 4.3; 2026-11-09, `1acf6b3`): a fourth connection at a time is refused with `rate_limited`, and a refused start says to close Sotto on another computer or wait a minute.
- [x] **4.11 Your data: a copy, and deleting the account** (backend Q19 and its 4.11; 2026-11-09, `d4da10b`, with the server's export and deletion in backend `c3a4a86`; checked with the unit and renderer tests and an end-to-end test against the local stack): the Account page saves a copy of what the server keeps, and deletes the account with its email typed again, then signs out.
