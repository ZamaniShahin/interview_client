# Sotto client: product and business docs

What a developer of the Sotto desktop client needs to know about the product: what it is and who it's for, every user journey, the live interview experience and its states, the plans the client sells, and what the product promises about privacy and discretion.

- **Audience:** developers and coding agents building the desktop client.
- **Not here:** contracts and protocol (the hub's methods, events and field names). They are in `src/shared/contracts/sotto-contracts.ts`, copied from the backend's generated `contracts/sotto-contracts.ts` (`npm run contracts:sync`).
- **Source of truth:** the backend repository's design, in `../../backend/interview_backend/docs/` (what is settled, and by whom, is in its `decisions.md`). These pages restate it from the client's side. When they disagree, the backend docs win: fix these.
- **Written:** 2026-11-06, from the backend design as of checkpoint 1.9.

## Reading order

| Doc | Read it to know |
|---|---|
| [01-product.md](01-product.md) | what Sotto is, its promise, the principles the client lives by, what is out of scope |
| [02-journeys.md](02-journeys.md) | every journey, from installing the app to buying minutes |
| [03-live-interview.md](03-live-interview.md) | the live overlay: how speech becomes an answer, every mode, and every state the user can see |
| [04-plans-and-billing.md](04-plans-and-billing.md) | plans, the trial, minutes, devices, purchases, and what happens when something runs out |
| [05-privacy-and-discretion.md](05-privacy-and-discretion.md) | what stays on the device and what leaves it, consent, and the stealth rules |
| [06-scope-and-phases.md](06-scope-and-phases.md) | what the client builds in which phase, and what the server can already do |
| [07-glossary.md](07-glossary.md) | the product's words |
| [08-open-questions.md](08-open-questions.md) | business and product questions not decided yet, and what each one changes in the client |
| [design-handoff.md](design-handoff.md) | the brief for designing the client's UI and UX in Claude Design |
| [design.md](design.md) | the UI design itself: the canvas, the tokens, and which component draws which part |
| [decisions.md](decisions.md) | what the client settled, and the choices taken while building it |
| [roadmap.md](roadmap.md) | the client's checkpoints, as a checklist |

## Rules for this repository

These hold from the first commit (backend `docs/client/README.md`, 08-security):

- **Never in this repository or the built app:** prompts, AI provider keys, model names, the rules that decide when a question is finished, or plan limits used to enforce anything. If a feature seems to need one of these, it belongs on the server.
- **The client is a terminal.** It shows what the server decides; it decides nothing that matters for money or security.
- **The stealth rules are requirements, each with a test** ([05](05-privacy-and-discretion.md)). Breaking one shows the overlay to the interviewer.

The client's technical design (Electron, Vue, sign-in, audio capture, the local database, signing and updates) is this repository's [README](../README.md), moved from the backend on 2026-11-06. Agents start with [CLAUDE.md](../CLAUDE.md).
