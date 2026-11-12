# Roadmap: the client

The client's checkpoints, as a checklist. The numbers are the backend roadmap's (`../backend/interview_backend/docs/10-roadmap.md`), so one number names the same step in both repositories.
- What each one gives the user is in [06-scope-and-phases.md](06-scope-and-phases.md).
- A checkpoint is ticked with its date and its commit.

**Where it stands (2026-11-12):**
- done: C0, all of Phase 1 (1.10–1.14) and 2.13, the account and plan screens: everything backend Q35 asked for; then 2.16, a plan given by Sotto, the words for the server's connection limit, and 4.11, the user's data (a copy, and deleting the account);
- `development` holds the whole of Shahin's unattended run since 2026-11-12 (`ae755b5`), checked there: `npm run check`, the app tests and the end-to-end tests against the local stack; then the screenshot selector's settle time (`263250b`), which those app tests led to;
- Phase 3 in Shahin's unattended run: 3.6, 3.10 and 3.8 done, then their deep round, then 3.9, 3.13 and 4.1 and their deep round, then 4.2's updates. What is left waits on Shahin: 3.12 (Q51) (practice waits on Claude Design's export, 3.7 on Q5, 3.11 on 4.8's wording);
- then, at Shahin's request, the glass (`f380818`, then `1439a27`; branch `feature/glass-ui`, in `development` since 2026-11-12, `cb4f3a4`): each window's background see-through at the opacity set in Settings, the text solid, the overlay on clear glass so the call app behind it can be read, the app window frosted by Windows 11's acrylic, and a more refined look (decisions §23);
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
  - the images in main's memory only, never on disk, and attached again after the session moves to another server (decisions §15);
  - fixed on 2026-11-12 (`263250b`, branch `bugfix/selector-settle`): the selector takes no press for its first 400 ms, so a double-click on the screenshot button, or a stray click as it appears, never takes the whole screen; checked with the app tests, 30 of 30, three runs in a row.
- [ ] 3.7 The speech coach, on the device (engine: Q5).
- [x] **3.8 The prepared-answer match 📌, on the device** (2026-11-11, `7dffc62`, branch `feature/answer-bank`, on 3.10's; with the preferences of the server's 3.2; checked with the unit and renderer tests, the app tests, 23 of 23, and the end-to-end tests against the local stack, 4 of 4):
  - Prepare's custom instructions and answer bank, kept on this computer (the `answer_bank` table of docs/07 §5, by migration 2), held to v1's entry rules;
  - the instructions and the enabled entries sent with each session (`SetPreferences`);
  - v1's `best_match`, ported and checked against v1's own tables, run in main as an answer starts, and the user's own answer shown at once in the 📌 card (decisions §17).
- [x] **3.9 Local history and the debrief view** (2026-11-11: history `a48a175`, prep drafts `4c2a59c`, branch `feature/history`, on the deep round's; with the jobs of the server's 3.4; checked with the unit and renderer tests, the app tests, 28 of 28, and the end-to-end tests against the local stack, 4 of 4):
  - each live session kept on this computer as it goes: its answers once over, the interviewer's words while "Keep transcripts" is on, its end (docs/07 §5's tables, by migration 3);
  - History lists them and opens one whole; deleting one or all waits for a confirmation;
  - a debrief written by the server only when asked, kept with the interview, and shown: scores, strengths, what to do better, stronger answers, follow-ups, a thank-you email to copy;
  - prep drafts in Prepare's answer bank, written by the server from the documents, each kept in the bank or skipped (decisions §19). v1's HTML report is not built yet.
- [x] **3.10 Reading documents (PDF, Word) on the device** (2026-11-11, `9d5bace`, branch `feature/documents`, on 3.6's; with the prep doc of the server's 3.2; checked with the unit and renderer tests and the app tests reading real files, 4 of 4):
  - "From a file" in Prepare for the résumé, the job description, the notes and the prep doc; the text read shows in the editor first, and a document over its limit comes back whole, its limit named;
  - files read by pdf.js and mammoth in a hidden, sandboxed window of their own, never in main; 20 MB, 500 pages and 20 s at most;
  - the prep doc kept with its file's name, cut at a line break past 100,000 characters as v1 cut it, and sent at a session's start (`SetPrepDoc`) (decisions §16).
- [ ] 3.11 The consent checkbox before each session. It is drawn, and main already refuses a start without it; this checkpoint is its final wording (4.8) and its tests end to end.
- [ ] 3.12 Recording, opt-in. Waits on Shahin's go-ahead (Q51): it opens the microphone and keeps call audio on the disk.
- [x] **3.13 Settings, kept in the local database; hotkeys remappable** (2026-11-11, `d65b8ca`, branch `feature/settings-hotkeys`, on 3.9's; checked with the unit and renderer tests and the app tests, 30 of 30):
  - the settings were kept since 1.14; each session hotkey is now changed in Settings by pressing the new keys, checked as pressed (Ctrl or Alt; a second modifier with a letter; never one Windows keeps or another action's), kept, and put back one or all;
  - main registers the keys in effect, and the setup and the overlay name them (decisions §20).
- [x] **The glass: each window's background, its opacity set in Settings** (Shahin's request, 2026-11-12, `f380818`, then `1439a27` once he saw it; branch `feature/glass-ui`, on `development`; checked with `npm run check`, 2,027 tests, and the app tests, 32 of 32):
  - the overlay on clear glass, as v1's: a transparent window on every Windows, its background at the opacity chosen (30–100%), so the call app behind it shows through sharp and can be read, Sotto's text solid; its corners and edge drawn by its page;
  - the app window on frosted glass where Windows 11 22H2 or later draws its acrylic, at a slider of its own, and solid elsewhere; the theme tints what Windows draws, read from Windows itself in the app tests;
  - no window faded as a whole any more, the text with it;
  - the look refined on the apple-design skill's principles, used and not installed: corners, edges, press feedback, motion (decisions §23, [design.md](design.md));
  - not seen by Claude: either glass on a real screen, which needs a person to look; nor a Windows 10 computer.
- [ ] Practice (with the server's 3.3): Claude Design's practice screens redrawn on these tokens, following Q21–Q24 as answered on 2026-11-09 ([design.md](design.md)).

Tests, deep round over 3.6, 3.8 and 3.10 (2026-11-11, `a46422b`, branch `feature/deep-round-3.6-3.8-3.10`): every feature mapped and triggered again, widened with data points, every outcome given a test; 533 tests more (1,380 in all), the app tests 23 of 23, end to end 4 of 4, the server now asked what it holds after a start. Two fixes: a page break or a vertical tab in a file no longer runs the words either side together, and the 📌 card stays when the generated answer is hidden. One question for Shahin: how strict the 📌 match is (Q49). Decisions §18.

Tests, deep round over 3.9, 3.13 and 4.1 (2026-11-11, `cb3befb`, branch `feature/deep-round-3.9-3.13-4.1`): every feature mapped and triggered again, widened with data points at and past each limit, every outcome given a test; 226 tests more (1,867 in all). No defect found, no product code changed. The screenshot selector's flaky app test (decisions §21) stays recorded.

## Phase 4: ready for launch

- [x] **4.1 Hardening** (2026-11-11, `9f47f02`, branch `feature/hardening`, on 3.13's; checked with the unit tests, the app tests, the capture check, and a packaged build checked by `scripts/package-check.mjs` and `scripts/asar-pages-check.mjs`):
  - the built pages served from `app://sotto/`, in every session that loads one;
  - Electron's fuses flipped by electron-builder, the ASAR's integrity embedded in the executable, and only main's packages in the installer;
  - the Content Security Policy reviewed: nothing to change (decisions §21);
  - [ ] Sentry without content: waits for Shahin's say on what may be sent to it.
- [ ] **4.2 Signed builds (cloud HSM) and staged automatic updates (electron-updater); `minClientVersion` honored.**
  - [x] automatic updates from a feed, staged by the feed, installed on quit or on "Restart to update" outside a session, and an outdated version (`client_outdated`) shown how far the new one has come (2026-11-11, `4f55298`, branch `feature/updates`, on the deep round's; decisions §22). The feed's address waits on the domain (Q4);
  - [ ] signing: waits on the cloud HSM.
- [x] **The server's connection limit, in words** (backend Q36, part of its 4.3; 2026-11-09, `1acf6b3`): a fourth connection at a time is refused with `rate_limited`, and a refused start says to close Sotto on another computer or wait a minute.
- [x] **4.11 Your data: a copy, and deleting the account** (backend Q19 and its 4.11; 2026-11-09, `d4da10b`, with the server's export and deletion in backend `c3a4a86`; checked with the unit and renderer tests and an end-to-end test against the local stack): the Account page saves a copy of what the server keeps, and deletes the account with its email typed again, then signs out.
