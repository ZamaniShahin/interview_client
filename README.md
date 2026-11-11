# Sotto: desktop client

The desktop app for Sotto. It's a **terminal**:
- it signs the user in;
- it captures the interviewer's audio and screenshots;
- it shows answers in an overlay that screen shares can't see;
- it keeps the user's history on the device.

All the intelligence (prompts, AI keys, question detection, licensing) is on the server ([backend docs](../backend/interview_backend/docs/README.md)).

**Never in this repo or the built app:** prompts, AI provider keys, model ids, end-of-question rules, plan limits used for enforcement. If a change needs one of these, it belongs on the server.

> Moved here on 2026-11-06 from the backend's `docs/client/README.md`, where it was staged. That copy is kept in sync until it is deleted. Agents: read [CLAUDE.md](CLAUDE.md) first.

## Getting started

```bash
npm install
npm run dev           # against the backend's local stack; the first run downloads Electron's binary (about 100 MB)
npm run dev:preview   # no server: a scripted interview and a sample account, for work on the UI
npm run check         # type-check, lint, test
node scripts/app-tests.mjs   # the built app's windows under Playwright, against the preview (Windows)
```

Node 24 runs everything. Node 24.15 or later also avoids an engine warning from a build tool (`nopt`, via electron-builder).

`npm run dev` talks to the backend's local stack ([below](#talking-to-a-local-backend)):
- **Sign in** on Home: the browser opens Keycloak's page, and the app carries on when you're done;
- tick the consent box and press **Start session**: the session runs on the server, over the hub;
- the session listens to this computer's sound, and the strip's meter follows it. Heard shows its words only when the AppHost has an OpenAI key: the scripted stand-ins ignore real sound. Answers also come from what you type.

`npm run dev:preview` plays a scripted interview instead of the server:
- tick the consent box on Home and press **Start session**;
- the overlay plays the interview, and answers what you type with a canned reply;
- while it runs, the session hotkeys are global (Ctrl+Enter answers; Ctrl+Shift+H hides the overlay).

A packaged build never runs the preview.

## Where it stands

**The skeleton, 2026-11-06** ([docs/roadmap.md](docs/roadmap.md)):
- **The two windows**, each with its own chrome:
  - the overlay, frameless, always on top, out of captures, shown without focus;
  - the window for outside sessions.
- **The session controller in main.** It runs the reducer that turns the hub's events into what the overlay shows.
- **IPC:** fixed channels, checked with zod, sender-checked.
- **Settings**, owned by main.
- **The UI's components**, on the placeholder design tokens ([docs/design.md](docs/design.md)), and the safe answer renderer.
- **The hub connection**, built over the generated contract but not yet driven: that is 1.12.
- **The checks:** typecheck, lint with the stealth rules, unit, renderer and stealth tests, and a build whose preloads are single sandbox-safe files.

**Sign-in and the hub, 2026-11-08** (1.10, and 1.12 but for the audio):
- **Sign-in** in the system browser: openid-client, PKCE, a loopback redirect. It comes back at startup without the browser, renews one refresh at a time, and can be cancelled or signed out.
- **This computer's key and its proofs.** The first sign-in registers the computer; a computer the account removed registers again with a new key.
- **The account**, read from REST: the plan, the minutes and their lots, the ledger, the devices.
- **A live session over the hub:** `StartSession` with a device proof, the overlay's commands, and after a drop `ResumeSession` with `LastSeq`, redrawing from a snapshot when the replay is incomplete. Past the server's 2 minutes, the session ends.
- **An end-to-end test** against the local stack, opt-in ([below](#talking-to-a-local-backend)).

**The contract synced, 2026-11-09:** the session's minutes (`Usage`) and its endings (`SessionEnding`), the account's `EntitlementsUpdated`, and the takeover on Home.

**Audio capture and its upload, 2026-11-09** (1.11, and 1.12's upload; [details](#audio-capture-details-111)):
- **This computer's sound**, captured as it plays, framed for the server, and streamed up `UploadAudio`; the newest 10 s go again after a resume.
- **The meter and the warnings** (Q18): the strip's meter follows the sound; a warning when nothing has been heard for 20 s; a lost device reopened, with words while it is.

**The device proof at connect, 2026-11-09** (the rest of 1.12): every hub connection opens with this computer's proof in its handshake, so a sign-in copied to another machine can't even connect.

**The overlay, complete, 2026-11-09** (1.13; [docs/decisions.md](docs/decisions.md) §8):
- **Answers in parts:** prose, each code block in the canvas's syntax colors with its Copy, and each diagram drawn by Mermaid in the overlay's colors once its fence closes.
- **A long answer** follows its newest line while you are at the bottom; scrolled up, "New text below" offers the way down.
- **The app tests** drive the built app's own windows with Playwright against the preview: diagrams under the Content Security Policy, the clipboard, the stealth rules at run time, and every window's display affinity, after hide and show too.
- **Windows 11 rounds the windows' corners**; there is no "tray only" setting any more (Q16).

**The first run, 2026-11-09** (1.14; [docs/decisions.md](docs/decisions.md) §9):
- **The setup wizard**, opening by itself until it has been finished once: what goes where, sign-in, the documents, the sound check, the hotkeys and Test hiding. Help runs it again.
- **This computer's encrypted database** (SQLCipher's format, its key in safeStorage): the documents, the settings and the first run, kept across restarts. Prepare edits the documents.
- **A session gets the documents** (`SetContext`), so AUTO answers once the résumé and the job description are there.

**The account and plan screens, 2026-11-09** (2.13; [docs/decisions.md](docs/decisions.md) §10):
- **What is for sale** comes from the server's catalog: plan cards, the top-up, the trial. No price until it is decided (Q3).
- **Buying happens in the browser**, and the window waits: the minutes or the plan arrive by themselves, said in one line. The billing portal opens the same way.
- **The plan's words**, the same everywhere: renewing, cancelled, payment due, the trial's days and minutes, no plan.
- **The trial** on Home, and at the setup's sound check; **the offer after a session that ran out of minutes**.
- **The computers**, removed after asking, with the removals left; **the device limit**, met by removing one in this computer's place.
- **The ledger**, paged by "Show earlier"; signing out asks first.

**Not yet:** the microphone (with the coach, 3.7), history's HTML report (v1's history.py), packaging hardening. The answer bank came with 3.8 and history with 3.9 (2026-11-11), in the same database.

## Tech decisions

"Added" means the package is in `package.json` now. The rest arrive with the checkpoint that needs them.

| Area | Decision | Why | Not chosen | Status |
|---|---|---|---|---|
| Shell | **Electron**, the latest supported major version; Chromium security updates within 2 weeks | v1's stealth behavior is proven on Electron (`setContentProtection`, the window levels); Chromium's audio stack | Tauri (WebView2 differences; v1's stealth work would have to be redone) | added (45) |
| Language | **TypeScript** (strict) everywhere: main, preloads, renderers | one language with the generated server contracts | JavaScript (v1) | added (5.9: typescript-eslint supports below 6.1) |
| Build | **electron-vite** (Vite for main, preload and renderer) | fast dev server and HMR; one config | webpack, Electron Forge's bundlers | added |
| UI framework | **Vue 3** (Composition API) + **Pinia** for state | the team's framework | React | added |
| Component library | **none inside overlay windows**; small custom components | every control must follow the stealth rules (no `title`, no native `<select>` popup, no cursor changes); a library fights them | Vuetify in the overlay (fine for a future web admin) | built |
| Server connection | **@microsoft/signalr** + MessagePack protocol, **in the main process** | tokens never reach a renderer; an overlay reload doesn't drop the session | the connection in the renderer | built (1.12): the proof at connect, the commands, the audio upload, the resume |
| Contracts | TypeScript types **generated** from the server's C# hub interfaces (`src/shared/contracts/`, never hand-edited), copied from the backend's `contracts/sotto-contracts.ts` by `npm run contracts:sync`. Field keys are the C# names, as on the wire | a misspelled message or field fails at compile time | v1's hand-matched strings | built |
| Login | **OIDC auth code + PKCE in the system browser** with a loopback redirect, via **openid-client** (panva) in main | RFC 8252; no password form inside the app | an embedded login window | added (6.8.8), bundled into main (it ships as ES modules only) |
| Token storage | refresh token + device private key encrypted with Electron **safeStorage**; access token in memory only. Refresh tokens rotate, and **sending an old one ends the sign-in** (checked on Keycloak 26.6.4, backend [04](../backend/interview_backend/docs/04-identity-keycloak.md) §10): refresh one request at a time, store each new refresh token before using it, and treat `invalid_grant` as "sign in again" | OS-user-bound encryption (DPAPI or Keychain) | keytar (archived), plain files | built |
| Device key | ECDSA P-256 made with Node `crypto`; device proof = a compact JWS per request: device-bound REST calls, each hub connection, `StartSession` and `ResumeSession` (backend [04](../backend/interview_backend/docs/04-identity-keycloak.md) §6) | binds tokens to this installation | — | built |
| Audio capture | hidden **capture window**: Windows system audio via `setDisplayMediaRequestHandler({audio: 'loopback'})`, mic via `getUserMedia`; Web Audio mixes down and resamples to 24 kHz, and an **AudioWorklet** makes PCM16 100 ms frames | no Python sidecar; Chromium handles devices | v1's Python `soundcard` | built for the loopback (1.11); the mic with the coach (3.7) |
| macOS audio | **open (Q6)**: Electron's own loopback support if enough, otherwise a small native helper | — | — | Phase 5 |
| Coach transcription | **on the device**: sherpa-onnx or Vosk, picked by a spike (Q5); the mic never leaves the machine | privacy, zero server cost | cloud STT for the mic | 3.7 |
| Markdown | **markdown-it** (`html: false`) + **DOMPurify**; **highlight.js**; **Mermaid** (lazy, `securityLevel: "strict"`) | a safe, standard renderer for model output | v1's hand-written renderer | built (1.13): highlight.js 11.12 (20 languages, the canvas's syntax colors), Mermaid 12.2 loaded with the first diagram |
| Documents | **pdfjs-dist** (PDF text) + **mammoth** (`.docx`, tables included: v1 KNOWN_ISSUES #11); only the extracted text is sent | no PDF parser on the server | parsing on the server | 3.10 |
| Local data | **SQLite**, encrypted (**better-sqlite3-multiple-ciphers**, SQLCipher-compatible), in main; key in safeStorage. Schema in backend [07](../backend/interview_backend/docs/07-data-model.md) §5 | history and answer bank stay on the device, encrypted | plain JSON / SQLite (v1) | built (1.14): better-sqlite3-multiple-ciphers 13.0.3, the documents, settings and first run; history and the answer bank come later |
| Validation | **zod** schemas for every IPC payload and local settings | untrusted renderer input | — | added |
| Packaging | **electron-builder**: NSIS (Windows x64) first, DMG next | used by v1; mature | — | added (unsigned) |
| Updates | **electron-updater** from our CDN bucket, staged rollout; the server's `minClientVersion` forces upgrades | patched or old builds stop working | manual installers (v1) | 4.2 |
| Signing | Windows **Authenticode** through a cloud HSM signing service; macOS **Developer ID + notarization** | trust, SmartScreen, Gatekeeper; required for updates | unsigned (v1) | 4.2 |
| Hardening | **@electron/fuses**, ASAR integrity, `app://` protocol, CSP, sandbox (backend [08](../backend/interview_backend/docs/08-security.md) §4) | the client can't be turned against its user | obfuscation as a control | CSP and sandbox built; the rest at 4.1 |
| Errors | **Sentry** Electron SDK, PII scrubbing, no content | crash visibility | — | Phase 4 |
| Tests | **Vitest** (unit), **Playwright** for Electron (end to end), v1's stealth checks ported | v1's renderer/selector tests encode the stealth rules | — | Vitest added; Playwright (`playwright-core` 1.64) drives the built app against the preview (`node scripts/app-tests.mjs`, 1.13) |
| Lint / format | ESLint (typescript-eslint, eslint-plugin-vue) + Prettier; custom lint rules: no `title` attribute, no `<select>`, no `cursor` CSS | the stealth rules are checked as the code is written | — | added; the cursor check is a test |

## Processes and windows

```
main process (Node, TypeScript)
├─ auth: openid-client, loopback server, token refresh, safeStorage, device key + proofs          (1.10)
├─ connection: SignalR hub (MessagePack), REST client, reconnect + ResumeSession                  (1.12)
├─ session: the controller, owning the overlay's view state; its driver is the hub (1.12), or the
│           scripted preview in development
├─ windows: overlay, app window, selector (3.6), capture (hidden, 1.11); global hotkeys while a session runs
├─ local DB: encrypted SQLite (history, answer bank, documents, settings)
├─ coach: on-device STT + metrics (or in a utilityProcess if the CPU cost shows)                   (3.7)
└─ updater, Sentry                                                                                 (Phase 4)
      │ IPC (fixed channels, zod-validated, sender-checked)        │ MessagePort (audio frames)
overlay window (Vue): Heard, Answer, history ‹ ›, ask bar,     capture window (hidden, never shown):
  status, More, practice panel, coach strip — NO network,        loopback + mic → AudioWorklet → frames
  NO Node
app window (Vue): Home, Prepare, Practice, History, Account,   selector window: v1's region selector, its own
  Settings, Help — outside sessions; NO network, NO Node          least-privilege preload
```

- **The main process owns every network connection.** Renderers have `connect-src 'none'` (the build sets the Content Security Policy). Events arrive from the hub in main and go to the overlay over IPC. Audio frames go from the capture window to main through a `MessagePort`, copied (Electron drops a message that transfers a buffer to main), then up the hub stream.
- **Only the interviewer's (loopback) audio is uploaded.** The mic feeds only the on-device coach, the echo gate, the local recording, and practice answers (as text).
- **The app window** (backend decisions.md, Q15, decided 2026-11-09 as the UI canvas proposed): outside a session the app gets a roomier window, 960 × 640 with a sidebar; during one it steps aside for the overlay.

## Stealth rules: requirements, each with a test

Ported from v1 (`ui/main.js`, KNOWN_ISSUES #12–#13). Break one and the overlay shows up in the interviewer's screen share.

1. **Out of captures.** Every window goes through `keepOutOfCapture(w)`: `setContentProtection(true)` now **and on every `show` event** (Windows resets it on each show).
   - Built in `src/main/windows/stealth.ts`; unit-tested, and the source check finds every window.
   - The app tests read `GetWindowDisplayAffinity` = `0x11` for every window on screen, and again after hide and show (1.13). Windows forgets a hidden window's affinity: that is why it is set on every show.
2. **No `title` attributes anywhere** (tooltips are separate, capturable windows). Use `aria-label`.
   - Lint forbids `title` in templates, components included.
   - A MutationObserver strips any that appear (`src/renderer/shared/no-titles.ts`).
3. **No native dropdowns.** No `<select>` (its popup list is a separate window): segmented controls and in-window lists instead. Lint forbids it.
4. **The pointer never changes over the app:** one global `cursor: default !important` in `base.css`, no other `cursor` rule. A source test keeps it the only one.
5. **No OS resize border** on the overlay (`resizable: false`); a ◢ grip resizes it through main.
6. **Always on top** at the `"screen-saver"` level, shown with `showInactive()`, so it never takes focus from the call app.
7. **Nothing opens outside the protected windows during a session.**
   - No new windows, no navigation away, no native menus, no spell-check menus.
   - Native dialogs only during setup, with always-on-top dropped.
8. **Global hotkeys**, registered only while a session runs.
   - Ctrl+Enter is settled; the others are the canvas's proposal ([Settings](docs/design.md)).
   - v1's PROTOCOL.md §3 and its collision notes apply once at hand.

## Audio capture details (1.11)

Built 2026-11-09 for the interviewer's side; the choices are in [docs/decisions.md](docs/decisions.md) §6.
- **The capture window** (`src/main/windows/capture-window.ts`, `src/renderer/capture/`) is hidden and never shown, on its own session, the only one allowed to capture. It asks Chromium for display media with `audio: 'loopback'`: what this computer plays. The screen's video track that comes with it is stopped at once. Echo cancellation, noise suppression and automatic gain control are off.
- **Framing:** Web Audio mixes down to one channel (speaker rules) and resamples to 24 kHz; an AudioWorklet converts float → PCM16 and cuts 100 ms frames (4,800 bytes; `src/shared/audio/frames.ts`).
- **To main** over a `MessageChannelMain` port, the frames copied: Electron drops a message that transfers a buffer to a main-process port. Main takes only 4,800-byte frames (`src/main/capture/audio-capture.ts`).
- **Up the hub:** `UploadAudio` streams each frame with its `Seq` and capture time. The newest 100 frames (10 s) are kept and sent again after a resume; the server drops those it has seen. Nothing goes while paused.
- **Device switched or unplugged** → reopen after 1.5 s (v1 behavior); meanwhile the strip says "Can't hear this computer's sound."
- **The meter and the no-sound warning** (Q18; v1 roadmap Q1: "no captions and no errors" was v1's silent failure). The strip's meter (`ListeningMeter.vue`) shows the loudest of each 200 ms. After 20 s with nothing heard since capture opened, the strip says "No sound from this computer yet." (`src/main/capture/no-sound-watch.ts`).
- **On a real computer:** `npm run build && node scripts/capture-check.mjs` captures 6 s and prints what arrived. Play something first.
- **Echo gate (for the coach, 3.7):** while the loopback level is above the threshold (v1 `COACH_ECHO_RMS` 0.008, hold 0.6 s), feed silence to the coach. During practice read-aloud, gate up to 60 s (v1 `MOCK_TTS_MAX_S`).

## Features that run on the device

- **Coach:** port `coach.py` + `textnorm.py`: talk time, wpm (after 10 s), fillers, key-term coverage from the answer's `***bold italic***` words, a wrap-up nudge at 90 s. Turn reset rules as in v1.
- **Prepared-answer match:** port `answer_bank.best_match` (content stems, F1 ≥ 0.6, coverage ≥ 60%). It runs on `AnswerStart` for spoken, typed and trigger questions, and shows the 📌 card.
- **History:** interviews, Q&A, optional transcripts, debrief results; an HTML report export (port `history.py`).
- **Documents:** parse, clip the prep doc at 100k characters at a line break (v1 `clip_prep_doc`), and send the text with `SetContext` / `SetPrepDoc`.
- **Recording** (opt-in, after the consent checkbox): local WAV of loopback + mic, as v1's `recorder.py`.
- **First run** (built in 1.14; [docs/decisions.md](docs/decisions.md) §9): v1's setup wizard (its ARCHITECTURE.md "Setup wizard", PROTOCOL.md "First-run setup wizard"), re-made for v2. It opens by itself until it has been finished once, and can be re-run from Help. Its steps:
  1. **What is recorded and sent where**, now including what goes to OpenAI and how long OpenAI may keep it (backend [06](../backend/interview_backend/docs/06-ai-gateway.md) §10 rule 7). The user acknowledges it once, and again when the text changes. This step is needed before any outside user.
  2. **Sign in and register this device.** This replaces v1's key, provider and speech-to-text steps: v2 has no keys or models on the device.
  3. **Name, résumé and job description**, kept on this computer; a session sends them (`SetContext`).
  4. **The sound check:** live transcripts on screen, proving that the call's audio plays through the default output device.
     - It runs as a short live session of its own, in MANUAL and without documents, so nothing it hears is answered; its words show in the setup window, not the overlay.
     - It starts only when asked, since it is charged like any session minute (Q12, decided 2026-11-09).
     - Leaving the step ends that session, so its words never join a real question (what v1's `clear_heard` did).
  5. **The key hotkeys** and 🛡 Test hiding: a real share, while the overlay window shows a test card.

## Release process (Phase 4)

1. CI on a tag: build → unit + e2e tests → stealth tests on a Windows runner → electron-builder → sign (cloud HSM) → upload to the update bucket as a **staged** release.
2. Rollout 10% → 50% → 100%, watching Sentry crash-free sessions and answer-failure rates.
3. If a release is bad: stop the rollout. If it's dangerous: raise `minClientVersion` on the server.

## Talking to a local backend

Run `dotnet run --project src/Sotto.AppHost` in the backend repo (it needs Docker 25+). Then:

| Setting | Local value | Environment variable |
|---|---|---|
| API base URL | `http://localhost:5180` (REST under `/api/v1`; the hub at `/hubs/live`) | `SOTTO_API_BASE_URL` |
| OIDC issuer | `http://localhost:8080/realms/sotto` | `SOTTO_OIDC_ISSUER` |
| OIDC client | `desktop` (public; PKCE S256 required; redirect `http://127.0.0.1:<any port>/callback`) | `SOTTO_OIDC_CLIENT_ID` |
| Scopes | `openid email profile offline_access` | — |
| First call after sign-in | `GET /api/v1/me` creates the user record | — |

`npm run dev` uses these values. Register a test user on Keycloak's login page; the verification email lands in Mailpit (http://localhost:8025).

**The end-to-end check** runs main's own modules against the stack, with a scripted browser on Keycloak's pages:

```bash
SOTTO_E2E=1 npx vitest run tests/e2e
```

- It signs a new user up, verifying the email through Mailpit, then registers the computer and starts the trial.
- Then it gets an answer in a live session over the hub, ends it, renews the sign-in and signs out.
- Each run leaves one user behind. `SOTTO_OIDC_ISSUER`, `SOTTO_API_BASE_URL` and `SOTTO_MAILPIT_URL` point it elsewhere.
- A second test (2.13) buys: the trial, a top-up and a plan, a cancellation, the portal, and the device limit. It pays with the backend's `tools/local-purchase.mjs`, found next to this repository (`../backend/interview_backend`) or at `SOTTO_BACKEND`.

**Buying on the local stack.** Its payment provider is a stand-in: the checkout page the app opens (`https://billing.local.invalid/checkout/…`) answers nothing. Copy that address and pay it the way the provider would, with a signed webhook:

```bash
node <backend>/tools/local-purchase.mjs '<checkout url>'
```

The window, waiting for the payment, shows the minutes or the plan a moment later. `--status canceled --subscription <id>` (the id the first run printed) plays a later state of a plan.

## v1 references

v1 is at `D:\Codes\Personal\inverview_app`. Read these before touching windows, capture or the answer view:
- its `docs/ARCHITECTURE.md` §11–§12 (main process and renderer);
- its `docs/PROTOCOL.md` §2–§3 (IPC and hotkeys);
- its `docs/KNOWN_ISSUES.md` #12–#14.
