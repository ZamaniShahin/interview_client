# CLAUDE.md: Sotto desktop client

Guidance for coding agents working in this repository. **Sotto** (working name) is a desktop copilot for live job interviews. This repository is its Windows client (macOS later): the overlay, sign-in, audio capture, the local history.

The server, in `../backend/interview_backend`, holds the intelligence: the prompts, AI keys, the live pipeline, accounts, licensing, billing. **Do not write there unless asked.**

## Read first

1. [README.md](README.md): tech decisions, processes and windows, the stealth rules, how to run.
2. [docs/README.md](docs/README.md): the product and business docs, in reading order.
3. [docs/design.md](docs/design.md): the UI design (the canvas), the tokens, and which component draws which part.
4. [docs/decisions.md](docs/decisions.md): the client's own choices. Product decisions live in the backend's `docs/decisions.md`, which wins on any disagreement.
5. [docs/roadmap.md](docs/roadmap.md): the client's checkpoints. The numbers are the backend roadmap's.

**Don't record decisions nobody took.** If you write "we use X" into a doc, the next session believes it.
- A real decision goes in `docs/decisions.md`, with the date and who decided.
- A choice you make while coding goes there marked "taken in session, open to revision".
- Everything else is an option, and the doc must say so.

## Layout

```
src/main/        Electron's core process: windows/ (the stealth rules, the hidden capture window), ipc/ (every
                 handler), auth/ (sign-in, the encrypted secrets), device/ (the key, its proofs, the fingerprint), api/
                 (REST), account/ (the account, this computer's registration, waiting for a payment), session/ (the controller, its
                 drivers, the hotkeys, the sound check), connection/ (the hub transport), capture/ (the call's sound:
                 its frames, the meter, the no-sound watch, the capture check), storage/ (the encrypted database,
                 its migrations, the store over it), preview/ (development data, and the account's changes played on
                 it), settings.
src/preload/     overlay.ts, app.ts: each window's only bridge to main; api.ts types them. capture.ts hands the capture
                 page its port. Sandboxed: no packages.
src/renderer/    overlay/ (the product), app/ (the window outside sessions), capture/ (the hidden page and its
                 AudioWorklet), shared/ (components, styles, icons, the answer renderer). app/setup/ is the first
                 run's wizard.
src/shared/      Runs in main, preloads and renderers, so no Electron and no DOM: contracts/ (generated, never edited),
                 ipc.ts and ipc-channels.ts, live/ (view state, reducer, the overlay's words), audio/ (PCM16 frames
                 and levels), documents, first-run (the notice's words and version), hotkeys, text-limits, settings,
                 account, plan-words and device-words (the account's words, one function each, for every page).
tests/           unit/ (Node), renderer/ (happy-dom and @vue/test-utils), stealth/ (the rules readable in the source),
                 e2e/ (against the backend's local stack; skipped unless SOTTO_E2E=1), app/ (the built app's windows
                 under Playwright, against the preview; skipped unless SOTTO_APP=1).
scripts/         sync-contracts.mjs: copies the hub's contract from the backend. Checks run by hand, each with its usage
                 in its first lines: app-drive.mjs (the built app driven through its own windows, against the local
                 stack; it signs this computer out), capture-check.mjs (6 s of this computer's sound through the real
                 capture window), app-tests.mjs (builds the preview and runs tests/app), oidc-cjs-check.mjs,
                 contrast.mjs (the palette's WCAG ratios), pick-versions.mjs (the two-week rule), design-unbundle.mjs
                 and design-split.mjs (reading a Claude Design export).
docs/            The product docs (01–08), the design handoff, design.md (and design/canvas/, a copy of the canvas's
                 files), decisions.md, roadmap.md.
```

## Commands

```bash
npm install
npm run dev              # the app against the backend's local stack, with hot reload; the first run downloads
                         # Electron's binary (about 100 MB)
npm run dev:preview      # the app with no server: a scripted interview and a sample account
npm run check            # type-check main and renderer, lint, test: run it before saying anything works
SOTTO_E2E=1 npx vitest run tests/e2e   # sign-in, the device, the account, a live session and buying, against the local stack
npm run build            # out/
node scripts/capture-check.mjs         # after a build: 6 s of this computer's sound, captured for real (play something)
node scripts/app-tests.mjs             # the built app's windows under Playwright, against the preview (Windows; leaves a preview build in out/)
npm run dist:win         # an unsigned NSIS installer in dist/, for internal use
npm run contracts:sync   # copy the backend's contracts/sotto-contracts.ts; contracts:check fails if they differ
```

**Launching from a tool hosted in VS Code** (an agent's shell, a task runner) inherits `ELECTRON_RUN_AS_NODE=1` from VS Code's extension host. Electron then runs as plain Node, and main fails at `app.isPackaged`. Start it with `env -u ELECTRON_RUN_AS_NODE npm run dev`. A normal terminal doesn't have the variable.

**The app tests drive the built app on the real desktop.** Run them with the screen unlocked (the screenshot selector's tests capture the desktop), with nobody using the mouse (the selector covers the whole screen and a real click ends it: decisions §23), and with no other Sotto open: the app keeps one instance, so a preview left open makes each launch quit at once. An `npm run dev:preview` started from an agent's background shell can outlive the shell's stop, its electron-vite relaunching Electron: end that process tree before the app tests.

**Never capture the screen** to check how a window looks: a capture once caught another app's window. `node scripts/ui-shots.mjs` takes pictures of the built app's own pages only (over a painted backdrop, for the glass), and what Windows draws for a window (its backdrop, whether it is layered, its dark mode) is read from Windows itself (`windowLook` in tests/app/windows.ts). How the glass looks on a real screen is Shahin's to see. `node scripts/selector-probe.mjs` opens the screenshot selector again and again, touching nothing, and records what reaches it, for a selector test that fails.

**`npm run dev` needs the backend's local stack** (`dotnet run --project src/Sotto.AppHost` there; README, "Talking to a local backend"). Sign in on Home, in the browser, then start a session: it runs on the server, over the hub.

**`npm run dev:preview` needs no server.** It plays a scripted interview with a sample account:
- open Home, tick the consent box, and press Start session;
- the overlay opens and plays it;
- what you type is answered with a canned reply.

While a session runs, its hotkeys are global (Ctrl+Enter answers, Ctrl+Shift+H hides the overlay, and the rest). They are released when the session ends. A packaged build never runs the preview.

## Rules that are easy to break

1. **The stealth rules** ([README](README.md#stealth-rules-requirements-each-with-a-test)). Breaking one shows the overlay in the interviewer's screen share.
   - Every window goes through `keepOutOfCapture`.
   - No `title` attribute anywhere, on components too: name things with `aria-label`.
   - No native select, menu, dialog or tooltip.
   - The pointer never changes: one global cursor rule, in `base.css`.
   - The overlay has `frame: false` and `resizable: false`, and is shown with `showInactive()`.
   - Nothing opens outside the protected windows during a session.

   ESLint and `tests/stealth` check what can be read from the source. Never weaken them to make something pass.
2. **Main owns every connection.**
   - Renderers run sandboxed, with no Node and `connect-src 'none'`.
   - Tokens, the refresh token and the device key never leave main.
3. **Every IPC payload is checked in main**, against the zod schemas in `src/shared/ipc.ts`, and only from the window it belongs to (`src/main/ipc/register.ts`). A new channel needs four things:
   - its name in `ipc-channels.ts`;
   - its schema in `ipc.ts`;
   - its handler in `register.ts`;
   - its type in `preload/api.ts`.

   The capture window is the exception: it has no channel of its own. Main posts it a `MessagePort` (`capturePort`), and checks what comes back (`src/main/capture/audio-capture.ts`): `parse` takes only the page's fixed messages, and only frames of exactly 4,800 bytes are kept.
4. **A preload imports no package.** A sandboxed preload can load nothing but Electron's own modules, so it imports `electron`, the channel names and types, and nothing else. electron-vite builds each preload as one file (`isolatedEntries`). After a build, `out/preload/*.js` should `require` only `electron`.
5. **The contract is generated by the backend.** `src/shared/contracts/sotto-contracts.ts` is a copy (`npm run contracts:sync`); never edit it.
   - Field keys are the C# names, and case-sensitive.
   - Error codes are published.
   - A protocol change starts in the backend.
6. **Never in this repo or the built app:** prompts, AI keys, model ids, the rules that decide when a question ends, or plan limits used to enforce anything. The text limits here only count and warn; the server is the judge.
7. **Answers are untrusted Markdown.** Render them only through `src/renderer/shared/markdown.ts`: no HTML, no links, no images, and DOMPurify on the result. Diagrams go through `src/renderer/shared/diagram.ts`: Mermaid in strict mode with SVG labels, its SVG sanitized again (no `<title>`, links or HTML).
   - `v-html` appears only in the answer's components (`AnswerBody.vue`, `AnswerCode.vue`, `AnswerDiagram.vue`), each with its reason on the `eslint-disable` line; `tests/stealth` checks both.
   - DOMPurify under happy-dom unwraps a fragment's first element and doesn't sanitize inside SVG. So sanitizing leads with an invisible character, and what Mermaid draws is checked in the app tests (Chromium), not the renderer tests.
8. **The client is a terminal.** It shows what the server decides; it decides nothing that matters for money or security.
9. **No sound during a live session.** Practice may read questions aloud: the one exception, open to revision.
10. **No interview content in logs**: no transcripts, answers, documents or screenshots. States and codes only.
11. **The preview is development only**: an unpackaged build started with `--mode preview` (`npm run dev:preview`). No code path that pretends to be the server ships.
12. **Sign-in state lives in main.** The refresh token, the device key and the device id are kept only through `SecretStore`, encrypted with safeStorage; where the OS can't encrypt, nothing is written and the sign-in lasts until the app quits. Keycloak's refresh tokens rotate, so every renewal goes through `AuthSession` (one at a time, the new token stored before use).
13. **This computer's data lives in the encrypted database** (`src/main/storage`, 1.14), where backend docs/07 §5 puts it. The schema changes only by a new migration in `schema.ts`: a released one never changes. Keep what is stored to what the decisions name (the documents, the settings, the first run); storing more is an "Ask first".

## Conventions

- TypeScript strict. Vue 3 `<script setup lang="ts">`, Pinia stores. Shared primitives are prefixed `S` (`SButton`, `SSegmented`).
- Comments explain *why*.
- **The UI's words** are calm and brief: second person, no exclamation marks, no jargon (handoff §10). The overlay's words live in `src/shared/live/copy.ts`.
- **Colors come only from the tokens** (`src/renderer/shared/styles/tokens.css`). Amber is for key words only. A status is an icon and a word, never color alone.
- **Tests:**
  - logic gets unit tests (reducer, schemas, words);
  - components get renderer tests;
  - the stealth rules get the source checks.
  - Tests are named as sentences.
  - What only a real Chromium shows goes in the app tests (`tests/app`, Playwright against the preview): Mermaid, the clipboard, the display affinity, the stealth rules at run time.
- **Packages:**
  - exact versions (`.npmrc`), from registry.npmjs.org only;
  - at least two weeks old when added;
  - Electron's security releases taken within two weeks.
- Commits: Conventional Commits.

**Ask first before:**
- adding a package;
- changing what is stored on the device, or sent to the server or a third party;
- changing the contract (it's the backend's);
- weakening a stealth rule or the Content Security Policy;
- writing to the backend repository.

## Working with Shahin

How Shahin works with agents, the same in both repositories. This was kept in one computer's agent memory and moved here on 2026-11-09, so it holds on any computer.
- **Everything about the project lives in the repositories**, never only in a scratch folder or an agent's memory, since he works from more than one computer (his request, 2026-11-09):
  - questions go into docs/08-open-questions.md;
  - choices go into docs/decisions.md;
  - scripts worth running again go into `scripts/`;
  - then commit and push.
- **Ask decisions in the question dialog**, not in prose, and tag the options:
  - **(Recommended)** on the one you would pick, listed first;
  - **(Cleanest)** on the most principled, least tangled one;
  - **(Fastest)** on the least work or the quickest result.

  One option may carry several tags; never invent an option to fill a tag. Each question must stand on its own, since the dialog may be all he sees.
- **Work he hands over is yours to decide.** Once he says "complete it yourself", decide its details, log each in docs/decisions.md as taken in session, and say so in one line. Still ask about what "Ask first" lists, and about brand, scope or process choices.
- **One branch per task, and merging only on his word.** This and the next rule were in his user-level files on his first PC (`~/.claude/CLAUDE.md` and his git-commit skill) and are copied here on 2026-11-12, so they hold on any computer:
  - before changing a tracked file for a new task, make a branch for it in each repository it touches, with the same name in each: `feature/<name>` or `bugfix/<name>`, lowercase letters, digits and `- . _` only, from a fresh `origin/development` (`git fetch origin`, then `git switch -c <branch> --no-track origin/development`). Never work on `development` itself, nor go on with an old branch;
  - push the branch once the work is committed. When he says to merge, fast-forward `development` to the branch in each repository and push it, then commit on the branch the roadmaps' note that it is in `development`, and fast-forward again;
- **Commits, in his format:** Conventional Commits, a lowercase imperative subject, and a body that says what was wrong or why the change exists, what was done and why that way, and what was checked, honestly: what ran and what didn't. Write the message to a file and commit with `git commit -F`, staging files by path. **Claude is never a co-author:** no `Co-Authored-By` trailer, no "Generated with" line. After each commit, `git log -1 --format=%B | grep -i -E 'co-authored-by|anthropic|claude code'` must print nothing (both repositories).
- **An unattended run** ("go for all of the roadmap", "no interrupt, keep the questions for tomorrow"):
  - ask nothing, and take the checkpoints in your recommended order;
  - for each checkpoint: its tests, then `npm run check` (and the end-to-end test against the local stack where it applies), then commit and push, then record the commit in docs/roadmap.md;
  - an open question takes the default the docs assume, logged as taken in session;
  - what needs his say (anything under "Ask first") goes into [docs/08-open-questions.md](docs/08-open-questions.md) for his return.
- **Run his deep test round** every two or three checkpoints of such a run, not only at the end:
  1. map every feature built since the last round;
  2. write tests that trigger each one, and check that every feature is covered before running any;
  3. widen each test with more data points around it, as oversampling makes new points from existing ones;
  4. run them and fix what fails;
  5. study each test's output, then add tests until every possible output and result has its own test;
  6. run them, fix what fails, then commit and push.
