# 08 — Open questions

What isn't decided yet, what is assumed until it is, and what each answer would change in the client. Nothing here is a decision. When one is taken, it is recorded in the backend's `docs/decisions.md` with its date and who took it, and the pages here that depend on it are updated.

## Open decisions

The numbers are the backend's (`docs/decisions.md` §2). Settled there:
- Q1: the payment provider is Paddle (2026-11-08);
- Q11 and Q13;
- Q25: a computer at the device limit names the one it replaces as it registers (2026-11-08);
- Q26, the server's speech model.

Q21–Q24 (the practice design) and Q27–Q44 are open there too. The rows below are the ones that change something in the client.

| # | Question | Assumed until decided | What it changes in the client | Needed by |
|---|---|---|---|---|
| Q2 | The **cloud provider and region** | — | if we host in Europe, OpenAI keeps the data in Europe too, and the OpenAI notice can say so | the first deployment |
| Q3 | **Prices**, the trial's size, whether minutes roll over, how long top-ups last | the values in [04](04-plans-and-billing.md) | what the plan screens say, never their code: the values come from the server | Phase 2 |
| Q4 | The **domain** | none | the addresses of sign-in, account pages, downloads and updates (configuration) | the first deployment |
| Q5 | The **coach's speech engine** on the device: sherpa-onnx or Vosk | decided by a trial of both | the coach's accuracy, the app's size, its CPU use | Phase 3 |
| Q6 | How the **macOS** app captures the call's audio | a small native helper, if Electron's own support isn't enough | the macOS installer and the permissions it asks for | Phase 5 |
| Q7 | How the **sign-in pages** are themed | the sign-in server's built-in theme, with our styles | how closely sign-in, sign-up and the account pages can look like the app | before launch |
| Q8 | A **"bring your own key"** plan? | no | nothing: the app has no key or model settings | after launch |
| Q9 | Do **custom instructions outrank the assistant's rules**, as in v1? | no: they guide answers within the rules | how the custom instructions screen describes them | Phase 1's answer-quality checks |
| Q10 | Optional **cloud transcription of the microphone** for a more accurate coach? | no: the microphone never leaves the device | if yes: a new opt-in, and new privacy text and notice | Phase 3 |
| Q12 | Does the **sound check** cost live minutes? It runs as a live session | yes, like any session minute | the wizard says so, or doesn't need to | 2.4 |
| Q14 | **The brand:** logo, colors, type, voice. Sotto is a working name, and the domain is Q4 | the design proposes ([design-handoff](design-handoff.md)) | every screen | the overlay (1.13) |
| Q15 | **A larger window outside sessions** for the wizard, the account, devices and history, or everything inside the overlay? | the design proposes; three windows are planned: the overlay, the region selector, a hidden capture window | the app's structure | the first run (1.14) |
| Q16 | **Taskbar or tray** during a session? A full-screen share shows the taskbar | the design proposes; v1's behavior is checked once its source is at hand | discretion, and how the user finds the app again | the overlay (1.13) |
| Q17 | **Choosing the tier** (fast or smart, where the plan allows): designed on the server, not scheduled | the plan's tier, no choice | a control in the overlay or in settings | settings (3.13) |
| Q18 | **The audio level meter**, and a warning after about 20 s without the interviewer's audio. The client's technical design has them with audio capture; the roadmap lists the meter for after launch | with audio capture | the status, and the sound check | audio capture (1.11) |
| Q19 | **Deleting the account, and the server's export.** Designed, with no checkpoint, though the privacy policy will promise both | Phase 4, with the legal work | the account screen | before any outside user |
| Q20 | **Usage history** (sessions and minutes): designed, with no checkpoint | with 2.4, which records the sessions it lists; until then the minutes ledger | the account screen | the account screens (2.13) |
| Q31 | **`SessionMigrate`**: the server could tell the app to move before an instance stops. Today the connection closes and the app resumes on another instance, as after any drop | not sent | a handler that resumes at once, without waiting for the drop | no deadline |
| Q32 | **What OpenAI may be sent in Phase 3**: the prep doc, preferences and answer bank; the candidate's practice answers; an interview's transcript for the debrief | nothing new | the OpenAI notice in the first run, and what [05](05-privacy-and-discretion.md) promises | 3.2–3.4 |
| Q35 | **Who builds the client's next checkpoints** (1.11, the rest of 1.12, 1.13, 1.14, 2.13), and when | they wait for Shahin's go-ahead | everything left in [roadmap.md](roadmap.md) | Phase 1's exit |
| Q36 | **At most 3 hub connections per user** (backend docs/08 §5) | no limit | a fourth connection is refused, and the app says why | before launch |
| Q44 | **DPoP**: Keycloak supports it; turned on, the tokens are bound to a key the app holds | off | the app sends a DPoP proof when it gets tokens and with every call: a protocol change, made on both sides together | before launch (proposed: with 2.13) |

## Unknowns that aren't decisions

| # | What | Today | What it changes |
|---|---|---|---|
| C1 | **v1's hotkeys and overlay layout.** v1's source isn't on the machine these docs were written on (backend Q37), and the docs name only the trigger, Ctrl+Enter | read v1's `docs/PROTOCOL.md` §3 and `docs/ARCHITECTURE.md` §11–§12 when they're at hand | the wizard's hotkey step, the overlay's layout |
| C2 | **The wording** of the OpenAI notice and the consent checkbox | drafts; a lawyer reviews them before launch (roadmap 4.8) | the wizard, and starting a session |
