# Decisions: the client

What this repository settled, who settled it, and what was chosen while building.

- **Product decisions:** plans, the protocol, what is sent where, the stealth rules as requirements. They live in the backend's [decisions.md](../../backend/interview_backend/docs/decisions.md), which wins on any disagreement.
- **The open questions** (Q1–Q24) are numbered there too.

**Rule:** a row goes in §1 only when a person decided it on a date. Choices made while writing code are recorded too, marked "taken in session, open to revision", so nobody mistakes them for team positions.

## 1. Settled

| Date | Decision | Who |
|---|---|---|
| 2026-11-05 | **The client's technical design is the plan** of the backend's `docs/client/README.md`, now this repository's [README](../README.md): Electron, TypeScript, electron-vite, Vue 3 + Pinia, SignalR in main, generated contracts, the stealth rules with tests | Shahin (backend decisions.md: "The design in docs/00–10 is the plan") |
| 2026-11-06 | **The UI uses a neutral placeholder until Sotto has a brand**: system fonts, grays, amber key words; nothing of ARN Fintech's design system | Shahin |
| 2026-11-06 | **Claude completes the UI design** ([design.md](design.md)), **then this skeleton**: "with this new ui, make the skeleton of client source code, base project, and components we want based the business we have, then make the claude.md of it and expected docs, to it could work independently" | Shahin |

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
