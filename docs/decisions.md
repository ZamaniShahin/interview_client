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
