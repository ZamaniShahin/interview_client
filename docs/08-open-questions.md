# 08 — Open questions

What isn't decided yet, what is assumed until it is, and what each answer would change in the client. Nothing here is a decision. When one is taken, it is recorded in the backend's `docs/decisions.md` with its date and who took it, and the pages here that depend on it are updated.

## Open decisions

The numbers are the backend's (`docs/decisions.md` §2). Settled there:
- Q1: the payment provider is Paddle (2026-11-08);
- Q11 and Q13;
- Q25: a computer at the device limit names the one it replaces as it registers (2026-11-08);
- Q26, the server's speech model;
- on 2026-11-09:
  - Q12: the sound check is charged like any session minute;
  - Q14: the neutral placeholder stays until there is a brand;
  - Q15: a 960 × 640 window with a sidebar outside sessions;
  - Q16: no taskbar button and no tray icon during a session, as v1;
  - Q21–Q24: the practice design's points (see [design.md](design.md));
  - Q32: what OpenAI may be sent in Phase 3, the three items below it in the backend's decisions;
  - Q33: screenshots checked by a header reader on the server;
  - Q35: Claude builds 1.11, the rest of 1.12, 1.13, 1.14 and 2.13, in order;
  - Q37: v1's source is on GitHub (`ZamaniShahin/interview_app`);
  - Q18: the level meter and the no-audio warning come with audio capture (1.11);
- on 2026-11-12, Q50: practice is drawn now, from the protocol and v1's mock interview, and redrawn from Claude Design's export once it is at hand ([decisions.md](decisions.md) §24).
- on 2026-11-13:
  - Q44: DPoP is on: the tokens are bound to a key made at each sign-in, and every request carries a proof from it ([decisions.md](decisions.md) §26);
  - Q47: v1 0.3.0 and 0.4.0's answers are ported whole: the interview type switched in the overlay, gap fillers, no auto-scroll;
  - Q51: recording goes ahead as proposed (3.12);
  - Q52: the server hears every interviewer, as v1 0.3.0, so a long question is cut in pieces and a trigger pressed while it is still being said waits for its end.

Q27–Q51 are open there too, apart from the ones above. The rows below are the ones that change something in the client.

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
| Q17 | **Choosing the tier** (fast or smart, where the plan allows): designed on the server, not scheduled | the plan's tier, no choice | a control in the overlay or in settings | settings (3.13) |
| Q19 | **Deleting the account, and the server's export.** Designed, with no checkpoint, though the privacy policy will promise both | Phase 4, with the legal work | the account screen | before any outside user |
| Q20 | **Usage history** (sessions and minutes): designed, with no checkpoint | with 2.4, which records the sessions it lists; until then the minutes ledger | the account screen | the account screens (2.13) |
| Q31 | **`SessionMigrate`**: the server could tell the app to move before an instance stops. Today the connection closes and the app resumes on another instance, as after any drop | not sent | a handler that resumes at once, without waiting for the drop | no deadline |
| Q36 | **At most 3 hub connections per user** (backend docs/08 §5) | no limit | a fourth connection is refused, and the app says why | before launch |
| Q49 | **How strict the 📌 match is** (3.8). It is v1's `best_match`, ported unchanged: an F1 of 0.6 over content words, with 60% of the phrasing covered. The deep round found it gives a prepared answer to a different question that shares most of its words: "where do you see the company in five years" gets the answer to "…yourself in five years", and "how did you cut costs by forty percent" the one to "…cut latency by forty percent". Be stricter than v1 (a higher threshold, or every content word of the phrasing required)? | v1's, as built; proposed: keep it until real sessions show how often it misfires | the 📌 card shows less often, and never for a near miss | before launch |

## Unknowns that aren't decisions

| # | What | Today | What it changes |
|---|---|---|---|
| C1 | **v1's hotkeys and overlay layout.** These docs name only the trigger, Ctrl+Enter. v1's source is now known to be on GitHub, `ZamaniShahin/interview_app` (backend Q37) | read v1's `docs/PROTOCOL.md` §3 and `docs/ARCHITECTURE.md` §11–§12, now at hand, before 1.13 | the wizard's hotkey step, the overlay's layout |
| C2 | **The wording** of the OpenAI notice and the consent checkbox | drafts; a lawyer reviews them before launch (roadmap 4.8) | the wizard, and starting a session |
