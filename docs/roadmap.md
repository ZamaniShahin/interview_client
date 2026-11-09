# Roadmap: the client

The client's checkpoints, as a checklist. The numbers are the backend roadmap's (`../backend/interview_backend/docs/10-roadmap.md`), so one number names the same step in both repositories.
- What each one gives the user is in [06-scope-and-phases.md](06-scope-and-phases.md).
- A checkpoint is ticked with its date and its commit.

**Where it stands (2026-11-09):**
- done: C0 and all of Phase 1 (1.10–1.14);
- Claude builds 2.13, the account and plan screens, next (backend Q35, decided 2026-11-09);
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

- [ ] **2.13 The account and plan screens:**
  - the session-ending messages (from `SessionEnded`, `SessionEnding` and `Usage` once the hub carries them, 2.4);
  - the device list with removal;
  - the upgrade and top-up links (the browser);
  - reading the account again on return from the browser (until 2.9 pushes it).

## Phase 3: everything v1 did

- [ ] 3.6 The screenshot region selector.
- [ ] 3.7 The speech coach, on the device (engine: Q5).
- [ ] 3.8 The prepared-answer match 📌, on the device.
- [ ] 3.9 Local history and the debrief view.
- [ ] 3.10 Reading documents (PDF, Word) on the device.
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
