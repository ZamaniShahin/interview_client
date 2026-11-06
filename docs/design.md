# The UI design

Where the design lives, what it holds, and which code draws each part.

## The canvas

**Sotto UI**: https://claude.ai/artifact/CVB8eNKEogsxZ8nYmUxDvT
- Private to its owner; share it from its Share menu.
- Drawn on 2026-11-06 from [design-handoff.md](design-handoff.md). Claude completed it after Claude Design's export covered only practice and history (backend decisions.md, 2026-11-06).

| Board | Holds |
|---|---|
| Foundations | the color tokens (dark and light, contrast measured), type, space, radii, elevation, focus, answers (key words, code, diagram), statuses, motion, icons |
| Components · the overlay | the window (anatomy, the keyboard ring, compact, sizes), the status strip in 9 states, Heard, the answer card in each ending, the kind badge, the history pager, the ask bar, the More menu, confirmations |
| Components · the app | buttons, toggles, the list that replaces dropdowns, fields, banners, the inline confirmation, the wizard stepper, the sidebar, device, minutes-lot and ledger rows, plan cards |
| Overlay · 4 boards | the 22 states of the handoff's §7.2, state 01 being Home |
| Flows F1–F10 | first run, signing in and devices, starting and typing, running out and the trial, the account and Settings |
| Later phase | F11 (screenshots), F14 (Prepare), F15 (the coach strip and the 📌 card) |

- **Practice (F12) and its history (F13)** are in Claude Design's export of 2026-11-06, which is not in this repository.
- That export is styled with ARN Fintech's design system and must be redrawn on these tokens before it is built.
- Its open points are the backend's Q21–Q24.

## The placeholder look

Not a brand (backend decisions.md, 2026-11-06; the brand is Q14):
- system fonts: Segoe UI, Cascadia Mono;
- grays;
- amber for key words, and for nothing else.

The values are in [`src/renderer/shared/styles/tokens.css`](../src/renderer/shared/styles/tokens.css), identical to the canvas.
- **Theme:** dark is the default, light is in Settings. `<html>` carries `theme-dark` or `theme-light`.
- **Answer size:** `text-s` or `text-l` sets it.

## Proposals the design makes

They are logged as taken in session in the backend's decisions.md, open to revision:
- **The overlay's size:** 420 × 600, first placed top centre under the webcam.
- **Compact view:** 420 × 236, the bar and the answer only; the overlay switches to it below 300 px tall.
- **Expanded size:** 560 × 760.
- **A window outside sessions:** 960 × 640, with a sidebar (Q15).
- **The tray only during a session** (Q16).
- **The status strip** has two rows: the bar (state, listening, More) and the strip (AUTO/MANUAL, pause, minutes, tier).
- **Hotkeys:** Ctrl+Enter (settled), plus Ctrl+Shift with Space, A, P, ←/→, M and H.
- **A long answer** follows the newest line only while you are at the bottom; otherwise "New text below" is offered.
- **The listening meter** sits beside "Listening" (Q18).

## Where each part is drawn

| Part | Component |
|---|---|
| The overlay, its layout and states | `src/renderer/overlay/OverlayApp.vue` |
| Bar (drag area, state, listening) | `overlay/components/OverlayBar.vue`, `ListeningMeter.vue` |
| Strip (AUTO/MANUAL, pause, minutes, tier) | `overlay/components/StatusStrip.vue` |
| The banner under the strip, and its words | `overlay/components/OverlayBanner.vue`; `src/shared/live/copy.ts` |
| Heard | `overlay/components/HeardPanel.vue` |
| The answer card and its endings | `overlay/components/AnswerCard.vue`, `AnswerBody.vue`, `KindBadge.vue`, `HistoryPager.vue` |
| The ask bar | `overlay/components/AskBar.vue` |
| More menu | `overlay/components/MoreMenu.vue` |
| ◢ grip | `overlay/components/ResizeGrip.vue` |
| Shared primitives | `renderer/shared/components/`: `SButton`, `SIconButton`, `SSegmented`, `SSwitch`, `SCheckbox`, `SOptionList`, `STextArea`, `SBanner`, `SConfirm`, `SStepper`, `SKbd`, `SIcon` |
| The window: chrome, sidebar, pages | `renderer/app/AppShell.vue`, `components/WindowChrome.vue`, `SideNav.vue`, `pages/` |
| Account rows, plan cards | `app/components/DeviceRow.vue`, `MinutesLotRow.vue`, `LedgerRow.vue`, `PlanCard.vue` |
| Answer Markdown | `renderer/shared/markdown.ts`, `styles/answer.css` |
| Icons | `renderer/shared/icons.ts` |

What the overlay shows comes from one pure function: `src/shared/live/reducer.ts`, with its tests in `tests/unit/live-reducer.test.ts`. A new state on the canvas usually means a new case there, then words in `copy.ts`.
