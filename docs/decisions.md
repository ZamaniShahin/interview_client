# Decisions: the client

What this repository settled, who settled it, and what was chosen while building.

- **Product decisions:** plans, the protocol, what is sent where, the stealth rules as requirements. They live in the backend's [decisions.md](../../backend/interview_backend/docs/decisions.md), which wins on any disagreement.
- **The open questions** (Q1–Q44) are numbered there too; [08-open-questions.md](08-open-questions.md) lists the ones that change the client.

**Rule:** a row goes in §1 only when a person decided it on a date. Choices made while writing code are recorded too, marked "taken in session, open to revision", so nobody mistakes them for team positions.

## 1. Settled

| Date | Decision | Who |
|---|---|---|
| 2026-11-05 | **The client's technical design is the plan** of the backend's `docs/client/README.md`, now this repository's [README](../README.md): Electron, TypeScript, electron-vite, Vue 3 + Pinia, SignalR in main, generated contracts, the stealth rules with tests | Shahin (backend decisions.md: "The design in docs/00–10 is the plan") |
| 2026-11-06 | **The UI uses a neutral placeholder until Sotto has a brand**: system fonts, grays, amber key words; nothing of ARN Fintech's design system | Shahin |
| 2026-11-06 | **Claude completes the UI design** ([design.md](design.md)), **then this skeleton**: "with this new ui, make the skeleton of client source code, base project, and components we want based the business we have, then make the claude.md of it and expected docs, to it could work independently" | Shahin |
| 2026-11-08 | **The next step is sign-in (1.10) and the hub connection (1.12)**, with **openid-client** as the README planned ("openid-client, as planned") | Shahin |
| 2026-11-09 | **The answers that change the client** ([backend decisions.md](../../backend/interview_backend/docs/decisions.md)). The app window as proposed (Q15). During a session neither a taskbar button nor a tray icon, as in v1, so no tray icon is built; what becomes of the `trayOnly` setting is settled with 1.13 (Q16). The placeholder look stays (Q14). The sound check is charged like any minute (Q12). Practice as in [design.md](design.md) (Q21–Q24). Claude builds 1.11, the rest of 1.12, 1.13, 1.14 and 2.13, in order (Q35). The level meter and the warning after about 20 s with no interviewer audio come with audio capture, 1.11 (Q18) | Shahin (asked with options) |
| 2026-11-09 | **1.13 adds its three packages as the README plans**: highlight.js (code colors in answers), Mermaid (diagrams, loaded only when an answer has one, strict mode) and Playwright (end-to-end tests of the real windows); exact versions at least two weeks old, from npmjs only | Shahin (asked with options) |
| 2026-11-09 | **1.14 stores on this computer in the encrypted database the README plans**: better-sqlite3-multiple-ciphers, one SQLite file in main, its key in safeStorage, the schema of backend docs/07 §5. 1.14 keeps the résumé, the job description, the settings and the first-run notice's acknowledgment there; history and the answer bank use the same database later | Shahin (asked with options) |
| 2026-11-09 | **2.13's plan cards come from the server's catalog** (`GET /api/v1/billing/catalog`): the plans and top-ups with their ids, names, minutes and limits, so the app hard-codes none of them. Prices stay on the payment page until Q3 is settled | Shahin (asked with options) |
| 2026-11-09 | **The remaining checkpoints add their planned packages** as the README lists them: @electron/fuses (4.1, build time only), pdfjs-dist and mammoth (3.10, reading PDF and Word files on the device) and electron-updater (4.2); exact versions at least two weeks old, from npm only. The coach engine (Q5) and Sentry stay separate questions | Shahin (asked with options) |
| 2026-11-09 | **Claude builds what is left before deployment** (backend decisions.md §1): the rest of Phase 3's client checkpoints and Phase 4's, in Claude's order, each with its tests | Shahin |

## 2. Taken in session while building the skeleton (open to revision)

| Date | Decision |
|---|---|
| 2026-11-06 | **Package versions:** exact pins, each at least two weeks old when added, from registry.npmjs.org only. Electron is 45.0.0 (2026-10-21); 45.2.3 came out 2026-11-04, so it is due by 2026-11-18 under the two-week security rule. TypeScript is 5.9.3 because typescript-eslint supports below 6.1; TypeScript 7 waits for it. `@types/node` follows Electron 45's Node 24 |
| 2026-11-06 | **Packages arrive with their checkpoints.** The skeleton adds only what it uses; openid-client, better-sqlite3-multiple-ciphers, highlight.js, Mermaid, pdfjs-dist, mammoth, electron-updater, @electron/fuses, Sentry and Playwright wait for theirs ([README](../README.md#tech-decisions), Status column) |
| 2026-11-06 | **Two windows**: the overlay, and an app window outside sessions (960 × 640, with a sidebar). The latter is the UI canvas's proposal for the backend's Q15. During a session the app window hides and the overlay is skipped from the taskbar (the `trayOnly` setting, on by default, Q16). There is no tray icon yet: it needs an icon. Q15 and Q16 were settled on 2026-11-09 (§1) |
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

## 5. Taken in session on 2026-11-09, syncing the contract (open to revision)

| Date | Decision |
|---|---|
| 2026-11-09 | **`EntitlementsUpdated` reads the account again in main and never reaches the overlay's state**: it is the account's event, with no `Seq`, so the reducer's events are `LiveClient`'s without it (`SessionEventName`) |
| 2026-11-09 | **The takeover is Home's "Start here"**, shown after a `session_active_elsewhere` refusal, under the server's own words. The server doesn't name the other device, so the canvas's "on *Laptop*" isn't shown. The consent box is still needed, and `TakeOver` is never sent otherwise |
| 2026-11-09 | **An ending's notice** (`SessionEnding`) sits under the strip, above being paused and below reconnecting. It keeps the server's seconds rather than counting down. The canvas words "No minutes left." and "The session ends in 30 seconds."; the other reasons got calm words of the same kind. An `inactive` notice goes once anything is heard, an answer starts, or a command is accepted |
| 2026-11-09 | **A low balance** shows the canvas's "10 minutes left." as the notice; passing the session's AI ceiling (`cost_tier_down`) only switches the strip's tier to fast, with no words of its own |

## 6. Taken in session on 2026-11-09, building audio capture and its upload (1.11, 1.12; open to revision)

| Date | Decision |
|---|---|
| 2026-11-09 | **The call's sound is captured by Chromium's display media with `audio: 'loopback'`**: what this computer plays, through Windows' loopback. No package and no native module. A hidden capture window does it, on its own session (`sotto-capture`), the only one allowed `display-capture` and `media`. The API hands over the screen too; its video track is stopped at once. The microphone isn't opened: it comes with its first user (the coach, 3.7) |
| 2026-11-09 | **Voice processing is off**: echo cancellation, noise suppression and automatic gain control, which Chromium applies to a captured track by default, would reshape the interviewer's voice before speech-to-text |
| 2026-11-09 | **Web Audio mixes down and resamples; an AudioWorklet frames.** The context runs at 24 kHz, and the worklet node takes one channel by the speaker rules (stereo becomes (L + R) / 2; 5.1 keeps its centre, where a voice sits). The worklet makes PCM16 frames of 100 ms (4,800 bytes), what `AudioFrame` carries (backend docs/03); with no input yet it frames silence |
| 2026-11-09 | **Frames reach main over a `MessageChannelMain` port, copied, not transferred.** Electron drops, without a word, a message that transfers an `ArrayBuffer` to a main-process port: found while checking 1.11 on Windows. Copying costs 48 kB a second. Main takes only 4,800-byte frames, and reads the page's statuses through `parse` (`audio-capture.ts`) with the reason cut to 64 characters, so the port needs no zod schema: main posts it, and nothing on it is a command |
| 2026-11-09 | **Capture runs with the session**: it starts once `StartSession` is accepted and stops when the session ends or closes. A lost or failed device is reopened after 1.5 s (v1's wait) |
| 2026-11-09 | **The meter** (Q18) shows the loudest of each 200 ms, on a 60 dB scale: –60 dBFS lies flat, 0 dBFS is full |
| 2026-11-09 | **The no-sound warning** (Q18) comes after 20 s with nothing heard since capture (re)opened, never after: once any sound has come, the device works, and an interviewer listening is quiet too. Sound means an RMS above 0.002 (about –54 dBFS). Its words, "No sound from this computer yet." and "Check that the call plays on this computer.", sit below being paused. A lost device says "Can't hear this computer's sound." and "Trying again…", above being paused and below an ending |
| 2026-11-09 | **The upload** streams each frame with its own `Seq` (from 0, per session) and its capture time. The newest 100 frames (10 s) go again after a resume, and the server drops those it has seen (backend docs/02 §4). Nothing goes while paused. The stream ends with its connection and is never completed first: SignalR would send the completion after the stop, which refuses it, as an unhandled rejection (in Electron's main, a warning) |
| 2026-11-09 | **A capture check for development builds**: `npm run build && node scripts/capture-check.mjs` captures 6 s through the real capture window and prints the frames, their rate and size, and the loudest level. On the computer that built 1.11: 57 frames in 6 s, all 4,800 bytes |
| 2026-11-09 | **The end-to-end test proves the upload** with the local stack's scripted speech-to-text, which reads a frame starting `SOTTO-SCRIPT ` as a line heard: the words come back as Heard, and Trigger answers them |

## 7. Taken in session on 2026-11-09, the device proof at connect (the rest of 1.12; open to revision)

The server's side of it is in the backend's decisions.md (2026-11-09, "The device proof at connect, as built").

| Date | Decision |
|---|---|
| 2026-11-09 | **Each connection opens with a proof of its own**, in the handshake's `X-Device-Proof` header: signed as a REST proof is, `GET` and the hub's path (`Protocol.HubPath`), bound to the token the connection carries. A new one for every connection, the first and each resume's, since the server takes a proof once |
| 2026-11-09 | **The words for a refusal at connect.** `device_not_registered`: "This computer was removed from your account. Restart Sotto to add it again." (at startup the app registers it again, J4). `device_proof_invalid`: "Sotto couldn't confirm this computer. Check that its clock is set right, then try again." (a proof is good for a minute either way of the server's clock). A proof this computer can't make, before it is registered, fails the start with the account's own words and opens no connection |
| 2026-11-09 | **The end-to-end test checks the refusal too**: a forged proof is refused by the local stack with `device_proof_invalid`, before the real session starts |

## 8. Taken in session on 2026-11-09, completing the overlay (1.13; open to revision)

The packages are Shahin's call (§1, 2026-11-09): highlight.js 11.12.0, Mermaid 12.2.0, and Playwright as `playwright-core` 1.64.1, which drives Electron's own binary and downloads no browser.

| Date | Decision |
|---|---|
| 2026-11-09 | **An answer renders in parts**, in the order the model wrote them (v1's `splitAnswer`): its prose as sanitized HTML, and each top-level code block and diagram as a component of its own. A code block then gets its Copy, and a drawn diagram stays drawn while the text after it streams in. Code inside a list item stays in the prose, colored, without Copy |
| 2026-11-09 | **Code is colored by highlight.js core with 20 languages** (bash, C, C++, C#, CSS, Go, Java, JavaScript, JSON, Kotlin, PHP, Python, Ruby, Rust, Scala, SQL, Swift, TypeScript, XML/HTML, YAML), in the canvas's four syntax tokens: keywords, types and built-ins, strings, comments. Anything else keeps the text color, and amber never appears in code. Another language shows uncolored, under its fence's word |
| 2026-11-09 | **Copy**, in a code block's head as the canvas draws it, copies the source as the model wrote it, never the colored HTML. Main writes the clipboard, since the overlay never takes focus (a new channel, `overlay:copy`, up to 100,000 characters). "Copied" shows for 1.5 s. Windows keeps the text with CRLF line ends |
| 2026-11-09 | **Diagrams, as v1 drew them**: Mermaid in its own chunk, loaded with the first diagram. Strict, with SVG labels (`htmlLabels: false`), in the base theme with the overlay's tokens, resolved by the browser into the `rgb()` Mermaid reads. One drawing at a time; the last 30 kept by source and colors; a theme change draws again. "Drawing the diagram…" holds the place until the fence closes. A source Mermaid can't read, or one the answer stopped in, shows as a "Diagram" code block |
| 2026-11-09 | **Tighter flowcharts than Mermaid's own** (node spacing 22, rank spacing 26, padding 8) at 14 px: a drawing wider than the overlay is scaled down to fit, and five boxes left to right came out at half size, too small to read during a call |
| 2026-11-09 | **Mermaid's SVG is sanitized again**: no `<title>` (a tooltip, stealth rule 2), no links, no `foreignObject`, no scripts or images, no `title` or `href` attributes. The preview's diagram names an `accTitle`, so the app tests see a real `<title>` dropped |
| 2026-11-09 | **Sanitizing leads with an invisible character** (U+2063), taken off after: under happy-dom, DOMPurify unwraps a fragment's first element, which Chromium never does, and the renderer tests should see what the app sees. happy-dom's DOMPurify also skips inside SVG, so the SVG is checked in the app tests |
| 2026-11-09 | **A long answer follows its newest line while the reader is within 24 px of the bottom**, a diagram finishing included. Scrolled up, the reader keeps their place and "New text below" offers the way down; taking it follows again. Another answer on screen starts at its top |
| 2026-11-09 | **The rounded corners: Windows 11's own**, 8 px. Checked on build 26200: Electron 45 rounds frameless windows, resizable or not (`roundedCorners`, now set explicitly). The canvas's 12 px would need a transparent window, without the system's shadow, for 4 px more. Windows 10 shows square corners. The 2026-11-06 row (§2), which took them for square, was wrong on Windows 11 |
| 2026-11-09 | **The `trayOnly` setting is gone** (Q16 settled it): during a session there is neither a taskbar button nor a tray icon, so there was nothing to choose. The overlay always skips the taskbar, and a source test holds it |
| 2026-11-09 | **The app tests** (`tests/app`, `node scripts/app-tests.mjs`) drive the built app's own windows with Playwright against the preview, the stand-in for the hub. They cover Mermaid under the app's Content Security Policy, the sanitized SVG, code colors and the clipboard (borrowed and given back), the stealth rules at run time, and the display affinity. Windows only. They leave a preview build in `out/` |
| 2026-11-09 | **Display affinity, as measured**: every window on screen reads `0x11` (WDA_EXCLUDEFROMCAPTURE). A hidden window reads 0, since Windows forgets it, and `0x11` again as soon as it shows (stealth.ts sets it on every show). The capture window is never shown. The app tests check exactly that, the overlay hidden and shown, and the app window shown as after a session |

## 9. Taken in session on 2026-11-09, building the first run (1.14; open to revision)

Storing on this computer in an encrypted database is Shahin's call (§1, 2026-11-09).

| Date | Decision |
|---|---|
| 2026-11-09 | **The database is better-sqlite3-multiple-ciphers 13.0.3** (2026-08-07, the newest). Its prebuilt N-API binaries ship inside the package, so nothing compiles on install (this computer has no Python for node-gyp), and the same binary loads in Node, for the tests, and in Electron 45. TypeScript finds its types through `paths` in `tsconfig.node.json`: the package's `exports` don't name them |
| 2026-11-09 | **One file, `sotto.db` in userData, in SQLCipher 4's format** (`cipher='sqlcipher'`, `legacy=4`), so support can open it with standard tools and the key. The key is 32 random bytes made once and kept as the `database-key` secret (safeStorage), given as a raw key, since a random key needs no passphrase stretching. WAL, foreign keys on. Signing out keeps it: the data is this computer's, not the session's |
| 2026-11-09 | **The schema grows by numbered migrations**, each in its own transaction with the `user_version` it brings, run once at open. A file from a newer app is refused, not guessed at; a migration that fails leaves the file as it was. Where the OS can't encrypt, the database lives in memory and nothing is written |
| 2026-11-09 | **Where each document lives** follows backend docs/07 §5: the résumé and the job description are `documents` rows (kinds `resume`, `jd`, with their length); the candidate's name and the notes are `settings` rows (`profile.name`, `profile.notes`), each a JSON value with when it was saved. A document saved empty, or as spaces only, is removed. Only migration 1's two tables exist: history and the answer bank add theirs with their checkpoints |
| 2026-11-09 | **Prepare edits the documents in place**: each row's first line and its count against the server's limit, then Edit (or Add) opens a box under it, with the limit named and nothing cut past it (as the ask bar does), and Save or Cancel. The prep doc stays "Not added": no command can send one yet, and the page promises documents are sent for a session |
| 2026-11-09 | **The settings are kept key by key** (`settings.<name>`) and restored over the defaults at start: a value that no longer reads, an old `trayOnly` say, is dropped and its default stands. This settles the 2026-11-06 row (§2) that kept them in memory until 3.13 |
| 2026-11-09 | **A session gets the documents right after it starts**: `SetContext` once, with empty fields sent as null, and AUTO asked for only when both the résumé and the job description are there (the server answers on its own only then). A refusal leaves the session running, answering when asked; a resume doesn't send them again, since the server kept them |
| 2026-11-09 | **Home's readiness comes from this computer**: "updated Nov 9" for the résumé, the job description's first line (60 characters at most), and "passed Nov 9" once the sound check has heard something |
| 2026-11-09 | **A database that can't be opened** (a file from a newer app, a lost key) doesn't stop the app: this run keeps everything in memory and says so on Home. The preview keeps sample documents in memory |
| 2026-11-09 | **The setup, as the canvas draws it** (F1), takes the whole app window, framed "Setup" with Minimize and Close only. It opens by itself until it has been finished once, starting at sign-in when the notice was already read. A notice whose words changed (a new `notice.version`) is asked alone. Help runs the whole setup again, or Test hiding alone. "First use" is this computer's OS user: the first run is kept in the encrypted database |
| 2026-11-09 | **The notice** is the canvas's words, version 1, kept with its version once "I understand" is chosen (`firstRun.notice`). Until then main refuses a session, pointing at Help. Its words wait for legal review (roadmap 4.8): a new wording raises the version and asks again |
| 2026-11-09 | **The sign-in step** waits for the browser, with "Open the page again" and "Copy the link" using the page main opened (remembered only while the browser has it). It moves on by itself once the account is read, and Back while waiting cancels. Signed in already, as on a second run, it says who, and Continue goes on |
| 2026-11-09 | **The sound check is a session of its own**, MANUAL and without documents, so nothing it hears is answered, heard in the setup window rather than the overlay. It starts only on "Start the sound check", since it is charged like any minute (Q12); words the canvas doesn't have say so ("It runs as a short session, so it uses session minutes like one."). It says "Hearing this computer's sound" only once live. Leaving the step ends the session, which does what v1's `clear_heard` did. The first words pass it (`firstRun.soundCheckAt`, Home's readiness), and the account is read again after. No consent box: it plays the user's own sound. A session and the check exclude each other. "AUTO and recording put back after" has nothing to do in v2: AUTO is per session, and recording comes with 3.12 |
| 2026-11-09 | **The hotkeys step shows the list main registers**, moved to `src/shared/hotkeys.ts` with the canvas's labels, so the two can't differ. Which set is right (v1's, now at hand, or the canvas's) is still the open question C1 |
| 2026-11-09 | **Test hiding follows the canvas, not v1**: the user checks a real share, since the overlay can't be seen in one's own share preview. "Show the overlay" opens the real overlay window, with all its protections, showing only a test card (`#hiding-test`), which calls nothing in main. "It's hidden" is kept (`firstRun.hidingTestedAt`). "I can see it in the share" shows the fixes, worded here: a call app's capture mode that shows every window, and Windows older than 10 version 2004. Finishing doesn't need the test |
| 2026-11-09 | **A database whose key is gone** (the secrets deleted, say) can never be read again: it is set aside as `sotto.db.unreadable-<time>`, kept, and a fresh one starts, with words on Home. Any other file that can't be opened, a newer app's, keeps the in-memory run, so going back to that app still finds it |
| 2026-11-09 | **The checks**: the app tests walk the setup from Help in the preview, including the sound check heard through its own session and the test card's window left out of captures; the preview starts as a finished setup. App test files run one at a time, since the app holds a single-instance lock. `scripts/app-drive.mjs` walks the whole setup on a fresh computer against the local stack, the sound check's session charged on the server |

## 10. Taken in session on 2026-11-09, building the account and plan screens (2.13; open to revision)

What the screens offer comes from the server's catalog, and the account's words from three facts the server now gives (whether a plan renews, the user's trial, the removals left): both are Shahin's calls (§1, and backend decisions.md §1, 2026-11-09).

| Date | Decision |
|---|---|
| 2026-11-09 | **Outside a session the app learns of a purchase by reading the account**, not over a hub connection kept open for it: every 3 s while a payment is waited for, at once when the window comes back into focus, and otherwise on focus after 30 s away. After 15 minutes the window says it is a long wait, once, and reads every 30 s until the user cancels. The server's push (`EntitlementsUpdated`) still reaches a running session |
| 2026-11-09 | **The plans keep the server's names** ("Credits", "Unlimited", "Trial"), not the design's placeholders ("Minutes"): the brand and the names are Q3 and Q14. A plan card says "Monthly · the price shows on the payment page" until prices are decided (Q3) |
| 2026-11-09 | **The plan's words come from one function** (`src/shared/plan-words.ts`), used by the sidebar, Home and Account, so the state always has a word (F10 · d) and every page says the same: "Credits plan · renews Dec 1", "ends Dec 1" with the tag "Cancelled · runs until Dec 1" once cancelled, "Payment due · Nov 9", a trial's "22 min · 9 days" and "Ends Nov 15", "No plan yet" or "The trial ended Nov 15". This fixes the sidebar's "No plan plan" |
| 2026-11-09 | **The trial is offered where it is first needed**: on Home without a plan (F9 · a), and at the setup's sound check, which is a charged session and so needs minutes. A refusal shows the server's words. The trial's request renews the sign-in first, so an email verified since sign-in counts (F2 · c). F2 · c's "Send it again" and "Use another email" aren't built: Keycloak sends the link at sign-up, and signing in again sends another |
| 2026-11-09 | **Top-ups are offered only on a plan that has minutes to add to**, a trial's included: the server refuses one without (`no_entitlement`), and Unlimited has nothing to add to. **A subscriber changes plan in the provider's portal** (Change plan opens it, as the server answers `already_subscribed` to a second checkout); anyone else picks a plan in the app |
| 2026-11-09 | **Only an `https` page the server returned opens in the browser**, and never during a session, since a browser shows in a share (stealth rule 7). The window then waits (F8 · b): "Open the page again" or Cancel, which stops waiting but cancels nothing at the provider |
| 2026-11-09 | **The after-call offer (F8 · a) shows only when the session ended for its minutes** (`credit_exhausted`): the top-up when the plan has minutes, another plan to someone without a paid one, the portal to a subscriber. "Not now" puts it away, as does the next session or a purchase. It doesn't say the interview is "saved in History": history is 3.9 |
| 2026-11-09 | **A purchase that arrived says so in one line** (F8 · c): "100 minutes added. They last until Nov 9, 2027." from the newest top-up lot, or "Credits plan started: 400 minutes a month." from the plan itself, never the balance, which holds what was left of a trial or a top-up |
| 2026-11-09 | **The account is read in order where it matters**: the minutes after the plan, and the ledger after the minutes, since reading the minutes grants a period that just started. A plan read as bought then always comes with its minutes; everything else is still read at once |
| 2026-11-09 | **The device limit (F3) takes the whole window**, framed as Setup, ahead of everything else, the setup included: until a computer is removed, this one can't sign in. Removing one there adds this computer in its place, in one step on the server (Q25); "Sign out instead" leaves. **The removal words** come from what the server says the cap leaves: "You can remove 2 more until Dec 6", and once used up, "The next removal is possible on Dec 6", with Remove disabled |
| 2026-11-09 | **The ledger and the computers each have a page under Account** (F10 · b, c), with "Account ›" to go back. The ledger pages by "Show earlier", 20 entries at a time; a read of the account in between starts it again from its first page. **Signing out asks first** (F10 · e), in the canvas's words |
| 2026-11-09 | **The preview plays the account's changes too** (`src/main/preview/billing.ts`): a top-up or a plan arrives 1.5 s after it is bought, the trial starts, a computer is removed and the ledger's earlier page comes, with no server, so `npm run dev:preview` and the app tests walk the flows |
| 2026-11-09 | **The checks**: unit tests for the words, the mapping, the account service's requests and proofs, and the wait for a payment (with fake timers); renderer tests for every screen and state; the app tests buy a top-up in the preview and watch it arrive; the end-to-end test runs the trial, a top-up, a plan, a cancellation, the portal and the device limit against the local stack, paying with the backend's `tools/local-purchase.mjs`; and `scripts/app-drive.mjs` does the same through the built app's own windows. The trial is once per computer, so on a computer that had one the drive checks the app's refusal and starts it from a stand-in |

## 11. Taken in session on 2026-11-09, a plan given by Sotto (2.16; open to revision)

The server's licence registry (backend 2.16, Shahin's request) puts a plan on an account with no payment. The entitlements say so (`licensed`), and the app follows.

| Date | Decision |
|---|---|
| 2026-11-09 | **A licensed plan says who gave it, not when it renews**: "Team plan · given by Sotto" (or "… given by Sotto until Jan 31"), the tag "Licence", and on Account "Given by Sotto, with no end: nothing to pay." It never renews, so the renewal words never show |
| 2026-11-09 | **A licensed account is offered nothing to buy**: no plan cards, no top-up, no trial, and "Change plan" only for a subscriber. The server refuses them too: a trial (`trial_not_available`) while any plan is in effect, and a checkout, of a plan or a top-up (`already_subscribed`), while a licence is (backend deep round over 2.16). Once the licence ends or is revoked, the account has no plan and the offers come back |
| 2026-11-09 | **The checks**: unit tests for the words and the mapping, a renderer test of Account with a licence (the sidebar's words included), and an end-to-end test against the local stack in which the backend's staff tools (`tools/staff.mjs`, with a session of the test's own through `SOTTO_STAFF_SESSION`) give a new email the Team plan before it signs up, then revoke it |

## 12. Taken in session on 2026-11-09, the server's connection limit (Q36; open to revision)

| Date | Decision |
|---|---|
| 2026-11-09 | **The limit has words of its own**: at connect, `rate_limited` can only be the user's three connections, so a refused start says "Sotto is connected on too many of your computers right now. Close it on one, or wait a minute, then try again." During a resume the app keeps trying, as for any refused connection, and a place comes free within 90 s. Checked by the hub driver's unit test of every connect refusal |

## 13. Taken in session on 2026-11-09, secret scanning (backend Q30; open to revision)

| Date | Decision |
|---|---|
| 2026-11-09 | **The client's first CI is a secret scan**: `.github/workflows/secrets.yml`, the same as the backend's (gitleaks 8.30.1, the release binary checked against its SHA-256, the whole history, findings redacted), on every push and pull request. Its history had no findings, so it needs no allowlist. The build, tests and signed releases (4.2) come with their own workflows |

## 14. Taken in session on 2026-11-09, the user's data (backend Q19; open to revision)

| Date | Decision |
|---|---|
| 2026-11-09 | **"Your data" is a card on the Account page**: "Save a copy" and "Delete account". The copy is read first, so a refusal comes before the save dialog, then saved where the user chooses as indented JSON. Main draws the save dialog, never during a session (stealth rule 7) |
| 2026-11-09 | **Deleting asks for the email typed again**, in a form drawn in place (no native dialog, which a share could see). The window holds only a masked email, so the server checks what was typed; the button waits until something is typed. A refusal keeps the form and what was typed, and the problem banner says why in the server's words. "Keep it" or Escape puts the form away and forgets what was typed. Deleted, main signs out |
| 2026-11-09 | **The checks**: unit tests for the requests and their proofs, the refusals passed on, and what the IPC takes; renderer tests for the card and the form; an end-to-end test against the local stack that saves the copy, is refused another email, deletes the account, and finds a fresh, empty one on the next read |
