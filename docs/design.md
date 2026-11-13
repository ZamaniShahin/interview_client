# The UI design

Where the design lives, what it holds, and which code draws each part.

## The canvas

**Sotto UI**: https://claude.ai/artifact/CVB8eNKEogsxZ8nYmUxDvT
- Private to its owner; share it from its Share menu.
- Drawn on 2026-11-06 from [design-handoff.md](design-handoff.md). Claude completed it after Claude Design's export covered only practice and history (backend decisions.md, 2026-11-06).
- **A copy of its own files** is in [design/canvas/](design/canvas/), taken on 2026-11-09 (unchanged since 2026-11-06), so the design travels with the code:
  - the boards (`*.dc.html`), `sotto.css` and `canvas.json`;
  - they render only inside the canvas, whose page belongs to the Design artifact type;
  - the canvas stays the source: change it there, then copy the files again.

| Board | Holds |
|---|---|
| Foundations | the color tokens (dark and light, contrast measured), type, space, radii, elevation, focus, answers (key words, code, diagram), statuses, motion, icons |
| Components · the overlay | the window (anatomy, the keyboard ring, compact, sizes), the status strip in 9 states, Heard, the answer card in each ending, the kind badge, the history pager, the ask bar, the More menu, confirmations |
| Components · the app | buttons, toggles, the list that replaces dropdowns, fields, banners, the inline confirmation, the wizard stepper, the sidebar, device, minutes-lot and ledger rows, plan cards |
| Overlay · 4 boards | the 22 states of the handoff's §7.2, state 01 being Home |
| Flows F1–F10 | first run, signing in and devices, starting and typing, running out and the trial, the account and Settings |
| Later phase | F11 (screenshots), F14 (Prepare), F15 (the coach strip and the 📌 card) |

- **Practice (F12) and its history (F13)** are in Claude Design's export of 2026-11-06, which is not in this repository. On 2026-11-12 Shahin chose to build them before it is at hand (backend Q50): the Practice page and practice in History are drawn from the protocol and v1's mock interview on these tokens and components ([decisions.md](decisions.md) §24), to be redrawn from the export.
- That export is styled with ARN Fintech's design system and must be redrawn on these tokens before it is built. For that reason it stays out of both repositories: Shahin keeps the file (`Sotto — interview practice.html`). `scripts/design-unbundle.mjs` and `scripts/design-split.mjs` make it readable.
- Its open points were settled on 2026-11-09 (backend Q21–Q24), and the redrawn screens follow them:
  - a follow-up comes at a score of 4 or less, not below 7;
  - "Retry the 2 lowest" and "Practice this question" stay: `MockStart` takes chosen questions;
  - there is no Study page outside sessions: Study stays in the overlay's ask bar;
  - practice sessions, with their scores, join the one history, and a practice debrief counts against the monthly debrief quota.

## The placeholder look

Not a brand (backend decisions.md, 2026-11-06). The brand is Q14, and on 2026-11-09 Shahin chose to keep this placeholder until there is one:
- system fonts: Segoe UI, Cascadia Mono;
- grays;
- amber for key words, and for nothing else.

The values are in [`src/renderer/shared/styles/tokens.css`](../src/renderer/shared/styles/tokens.css): the canvas's, but for the glass and the refinements that came with it (Shahin, 2026-11-12; [decisions.md](decisions.md) §23). The canvas keeps its own values until it is redrawn.
- **Theme:** dark is the default, light is in Settings. `<html>` carries `theme-dark` or `theme-light`, and the theme tints what Windows draws too (the app window's frame and frosted glass).
- **Answer size:** `text-s` or `text-l` sets it.
- **The glass**, so the user sees what is behind Sotto. `<html>` carries `glass` when there is some, and `frosted` too when Windows blurs it:
  - the **overlay's is clear**, on every Windows: a transparent window, as v1's was, so the call app behind it shows through sharp and can be read;
  - the **app window's is frosted** where Windows 11 (22H2 and later) draws its acrylic behind it, and is none elsewhere: that window is never over the call;
  - the window's own background, `--window`, is the one layer that fades: it is painted on `<body>` at the opacity chosen for that window in Settings (30–100%); text, icons and controls stay solid;
  - surfaces 1–3, `--selected` and `--code` are light tints over it, and `--surface-0`, what matched the window, is clear. Never paint a surface of its own over the window: layers stacked on the glass turn it milky, and over clear glass they hide what was to be read;
  - menus and popovers are `--menu`, nearly solid, blurring what is under them;
  - with Windows' transparency effects off, a frosted window is solid again; the clear overlay keeps its opacity;
  - Windows draws the clear overlay no corners or edge, so its page does: `--radius-window`, the canvas's 12 px, with the edge along it;
  - without glass, every value is solid.
- **Corners, edges, motion:** `--radius-window` 12 px (the overlay), `--radius-card` 14, `--radius-control` 8, `--radius-chip` 6; `--highlight`, the light on a raised layer's top edge (an inset 1 px shadow), and `--primary-highlight` on the primary button's; `--press` (`scale(0.97)`, 100 ms) as a control is pressed; `--ease-out` for every change of state, over 150 ms.

## Proposals the design makes

They are logged as taken in session in the backend's decisions.md, open to revision:
- **The overlay's size:** 420 × 600, first placed top centre under the webcam.
- **Compact view:** 420 × 236, the bar and the answer only; the overlay switches to it below 300 px tall.
- **Expanded size:** 560 × 760.
- **A window outside sessions:** 960 × 640, with a sidebar (Q15, decided by Shahin on 2026-11-09).
- ~~The tray only during a session~~: Shahin chose otherwise on 2026-11-09 (Q16). During a session there is neither a taskbar button nor a tray icon, as in v1, so the app is reached only by its hotkeys.
- **The status strip** has two rows: the bar (state, listening, More) and the strip (AUTO/MANUAL, pause, TECH/INTRO since 2026-11-13, minutes, tier).
- **Hotkeys:** Ctrl+Enter (settled), plus Ctrl+Shift with Space, A, P, ←/→, M and H.
- **A long answer** follows the newest line only while you are at the bottom; otherwise "New text below" is offered.
- **The listening meter** sits beside "Listening" (Q18).

## Where each part is drawn

| Part | Component |
|---|---|
| The overlay, its layout and states | `src/renderer/overlay/OverlayApp.vue` |
| Bar (drag area, state, listening) | `overlay/components/OverlayBar.vue`, `ListeningMeter.vue` |
| Strip (AUTO/MANUAL, pause, TECH/INTRO, minutes, tier) | `overlay/components/StatusStrip.vue` |
| The banner under the strip, and its words | `overlay/components/OverlayBanner.vue`; `src/shared/live/copy.ts` |
| Heard | `overlay/components/HeardPanel.vue` |
| The answer card and its endings, and "New text below" | `overlay/components/AnswerCard.vue`, `AnswerBody.vue`, `KindBadge.vue`, `HistoryPager.vue` |
| An answer's code block, its syntax colors and Copy | `overlay/components/AnswerCode.vue`; `src/renderer/shared/markdown.ts`; `styles/answer.css` |
| An answer's diagram | `overlay/components/AnswerDiagram.vue`; `src/renderer/shared/diagram.ts` (Mermaid in the overlay's colors) |
| The ask bar | `overlay/components/AskBar.vue` |
| More menu | `overlay/components/MoreMenu.vue` |
| ◢ grip | `overlay/components/ResizeGrip.vue` |
| Shared primitives | `renderer/shared/components/`: `SButton`, `SIconButton`, `SSegmented`, `SSwitch`, `SSlider`, `SCheckbox`, `SOptionList`, `STextArea`, `SBanner`, `SConfirm`, `SStepper`, `SKbd`, `SIcon` |
| The window: chrome, sidebar, pages | `renderer/app/AppShell.vue`, `components/WindowChrome.vue`, `SideNav.vue`, `pages/` |
| Account rows, plan cards | `app/components/DeviceRow.vue`, `MinutesLotRow.vue`, `LedgerRow.vue`, `PlanCard.vue`, `PlanPicker.vue` |
| The account (F10), its ledger and computers pages | `app/pages/AccountPage.vue`; the plan's words in `src/shared/plan-words.ts`, the removal's in `device-words.ts` |
| Running out and buying (F8): the offer, waiting in the browser, the line after | `app/components/AfterCallOffer.vue`, `TopUpOffer.vue`, `PaymentWait.vue`; Home's banner |
| The trial (F9) | `app/components/TrialOffer.vue` on Home; the setup's sound check (`app/setup/SetupSoundCheck.vue`) |
| Too many devices (F3) | `app/DeviceLimitScreen.vue` |
| Answer Markdown | `renderer/shared/markdown.ts`, `styles/answer.css` |
| Icons | `renderer/shared/icons.ts` |

What the overlay shows comes from one pure function: `src/shared/live/reducer.ts`, with its tests in `tests/unit/live-reducer.test.ts`. A new state on the canvas usually means a new case there, then words in `copy.ts`.
