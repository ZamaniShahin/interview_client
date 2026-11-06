# 06 — Scope and phases

What the client builds, in which order, and what the server can already do for it. The phases and their numbered checkpoints are the backend's roadmap (`docs/10-roadmap.md`); the numbers name the same steps in both repositories. Client work runs alongside the server's from Phase 1.

## Phase 1: the live core, and the client's first version

Goal: an internal user runs a real mock interview end to end on Windows.

| # | Client checkpoint | What it gives the user |
|---|---|---|
| 1.10 | **Sign-in**: the system browser, then back to the app | an account on this computer, staying signed in |
| 1.11 | **Capturing the call's audio** on Windows: what the computer plays, never the microphone | the interviewer is heard |
| 1.12 | **The live connection**, owned by the app's core process, reconnecting by itself | a session that survives network drops |
| 1.13 | **The overlay**: Heard, the answer, answer history ‹ ›, the ask bar, the status; **the stealth rules, each with its test** | the product itself |
| 1.14 | **First run**: the setup wizard, with the OpenAI notice, sign-in and device, name / résumé / job description, the sound check, the hotkeys and 🛡 Test hiding | a new user set up in minutes, and told what is sent where |

- **Documents in Phase 1** are typed or pasted. Reading PDF and Word files comes in 3.10.
- **Exit:**
  - an internal user runs a real mock call end to end on Windows;
  - the first words of an answer appear within 3 s, 95% of the time, against the real AI provider.

## Phase 2: plans and billing

| # | Checkpoint | Side |
|---|---|---|
| 2.3 | **One live session per account, with takeover** | server |
| 2.4 | **Minutes charged during a session**, the warnings, the session-ending reasons, the cost ceiling with its move to the fast tier | server |
| 2.7 | **A real payment provider**, in test mode (waits on Q1) | server |
| 2.9 | **Account changes pushed to the app** (after a purchase, a renewal, a cancellation) | server |
| 2.12 | **Abuse signals** | server |
| 2.13 | **Account and plan screens, the session-ending messages, the device list, the upgrade links** | client |

**Exit, in staging:**
- buying leads to minutes, then a session that uses them, and the session ends at zero;
- a takeover from a second device works.

## Phase 3: everything v1 did

| # | Client checkpoint | Server side it needs |
|---|---|---|
| 3.6 | **The screenshot region selector**, ported from v1 | 3.1 screenshots |
| 3.7 | **The speech coach**, on the device (engine still to pick, Q5) | — |
| 3.8 | **The prepared-answer match** 📌, on the device | 3.2 preferences |
| 3.9 | **Local history and the debrief view** | 3.4 jobs |
| 3.10 | **Reading documents** (PDF, Word) on the device | 3.2 the prep doc |
| 3.11 | **The consent checkbox** before each session | — |
| 3.12 | **Recording**, opt-in | — |
| 3.13 | **Settings** | — |

Also on the server in Phase 3: practice (3.3), and resuming a session on another server (3.5).

**Exit:**
- v1's manual smoke test passes on v2;
- a server killed mid-interview, and the session carries on elsewhere.

## Phase 4: ready for launch

- **The client hardened:** locked-down Electron, integrity checks, the content security policy reviewed (4.1).
- **Signed builds and automatic updates**, rolled out in stages; the server can require a minimum version (4.2).
- **An external penetration test**, the desktop client included (4.7).
- **The legal texts:** privacy policy, terms, acceptable use, and the wording of the consent checkbox and the OpenAI notice (4.8).

## Phase 5: launch, then by demand

- **Public beta, then general availability.**
- **Then, as users ask:**
  - team plans (organizations, seats, invitations);
  - the macOS client;
  - Microsoft and LinkedIn sign-in;
  - an optional encrypted sync of the answer bank and settings;
  - more languages than English;
  - v1's own never-built ideas: an audio level meter, tip buttons, company / role / coding-language fields, per-company presets, remapping hotkeys.

## What the server can do today

As of 2026-11-06 (backend checkpoint 1.9).

**Accounts and devices**
- Sign-in through Keycloak, with the user created on the first call. A suspended account is refused at once.
- A verified email required for the trial.
- The minimum client version, refusing older builds.
- Devices: registering this computer, listing, removing (the limit and the removal cap), proof that a request comes from this device.

**Plans and minutes**
- The plan and its limits, with a signed copy for the app to display.
- Starting the trial.
- The minutes: the balance in lots, and the ledger.
- Checkout and billing-portal links, **with a development stand-in for the payment provider only**.

**Live sessions**
- Start, resume after a drop (same server, within 2 minutes), end.
- The call's audio, transcribed by OpenAI, with listening's health (ok, reconnecting, degraded).
- Name, résumé, job description and notes for the interview.
- AUTO and MANUAL, pause, the trigger, the four ask modes, Clear and Clear heard.
- Answers streamed by OpenAI, the newest question winning, a redraw from a snapshot after a long drop.
- The output filter, which stops an answer that repeats the assistant's rules.

## Not on the server yet

| Missing | Until it comes, the client… | Comes with |
|---|---|---|
| One session per account, takeover | can run sessions on two devices at once | 2.3 |
| Minutes charged, warnings, most session-ending reasons (today only `user` and `expired`), the cost ceiling | shows the balance, which sessions don't use yet | 2.4 |
| Account changes pushed to the app | reads the account again, for instance when the user comes back from the browser | 2.9 |
| A real payment provider | buys only against the development stand-in | 2.7 (Q1) |
| Screenshots, the prep doc, custom instructions, the answer bank in answers | — | 3.1, 3.2 |
| Practice; debriefs and prepared-answer drafts | — | 3.3, 3.4 |
| A session moving to another server | — | 3.5 |
| Choosing the quality tier (fast or smart, where the plan allows) | uses the plan's tier, without a choice | designed, not on the roadmap yet ([08](08-open-questions.md)) |
| Usage history (sessions and minutes) | shows the minutes ledger | designed, not on the roadmap yet |
| Deleting the account, and the server's export | — | designed, not on the roadmap yet ([08](08-open-questions.md)) |
