# 01 — The product

## What Sotto is

Sotto is a desktop copilot for live job interviews. During a video call it listens to the interviewer, works out when a question is finished, and shows the candidate an answer to say: in the first person, in their own voice, grounded in their résumé. The answer appears in a small overlay that floats over the call, which the interviewer's screen share can't see.

- **Name:** Sotto is the working name, from *sotto voce*: spoken quietly, for one listener. The domain isn't chosen yet.
- **v1 and v2:** Sotto is version 2 of a personal tool that worked (v1: a Python backend and an Electron overlay, run with the user's own OpenAI key). v2 turns it into a commercial product, with accounts, plans and payments, and moves the intelligence to our server.

## Who uses it

- **A job candidate in a remote interview**, on their own computer, in any call app (Zoom, Google Meet, Microsoft Teams…). Windows first; macOS later.
- **Every kind of interview question:**
  - behavioral and HR ("tell me about a conflict with a colleague");
  - technical ("how does Kafka keep messages in order?");
  - live coding ("write a function that…", then running the code step by step);
  - system design ("design a URL shortener").
- **Under pressure.** They glance at the answer while keeping eye contact, and every second and every distraction counts.
- **In English.** Answers are always in English, whatever language the question was asked in.

The same person also uses Sotto **before** interviews (loading their documents, preparing answers, practicing with mock interviews) and **after** them (history, debriefs).

## The promise

1. **Fast.** The first words of an answer appear about 1.5 s after the question is judged finished (3 s at worst, 95% of the time). The same applies from the moment the user presses the trigger. Answers stream: they render as they arrive.
2. **Grounded.** Answers build on the candidate's real background (résumé, job description, prep doc, notes, prepared answers). They never invent employers, job titles, dates or numbers.
3. **Invisible.** The overlay never shows up in a screen share or a recording, never steals focus from the call, and never makes a sound.
4. **Never fails mid-interview.** A dropped network, a speech-to-text outage or a server restart becomes a status, a retry or a resume, never a dead end. When listening fails, typed questions still work.
5. **Private.** The server keeps no interview content after the session. History stays on the device, encrypted.

## How it works, seen from the client

- **The client is a terminal.** It:
  - signs the user in;
  - captures the interviewer's audio, from what the computer plays, never from the microphone;
  - captures the screenshots the user selects;
  - shows the answers;
  - keeps the user's history and prepared answers on the device.
- **Everything else is on the server:** the prompts, the AI provider keys, speech-to-text, deciding when a question is finished, writing the answers, licensing and metering. Nothing secret is in the app; assume it will be taken apart, and know that this changes nothing.
- **One live connection** carries an interview both ways: audio goes up; what was heard and the answers come down. It survives a network drop: the client reconnects, and the server sends what was missed.
- **The AI provider is OpenAI**, for answers and for speech-to-text. The user never picks a model; at most a quality tier (fast or smart), where their plan allows it.
- **Accounts, not license keys.** Nothing works without signing in to an account with a plan, and every action is checked on the server. A cracked client is a user interface that still needs a paid account.

## Principles the client lives by

| Principle | What it means for the client |
|---|---|
| The client is a terminal, not a brain | No prompts, keys, model names, end-of-question rules or license logic in the app. The plan limits it shows are for display; the server enforces them. |
| Never fail during a live interview | Every failure is a status, a retry or a resume. Nothing blocks the overlay, and nothing asks the user a question during a call that can wait until after it. |
| Latency is a feature | Render each piece of an answer the moment it arrives; add no round trip of our own. |
| Store nothing by default | Recording is off by default; transcripts are kept only if the user opts in; everything kept locally is encrypted. |
| Discretion rules are requirements | The stealth rules ([05](05-privacy-and-discretion.md)) ship with tests. Breaking one shows the overlay to the interviewer. |

## Out of scope

- Web or mobile clients: the desktop app only.
- Answering offline. Without our server there are no answers; the on-device speech coach still works offline.
- A human helper on the call, crowd-sourced questions, an online-assessment helper, or hiding the app's process name.
- Languages other than English. That is a later, deliberate change.

## The market

- **The reference competitor is LockedIn AI.** Its prices informed the first shape of the plans ([04](04-plans-and-billing.md)), and its consent checkbox before each session is copied ([05](05-privacy-and-discretion.md)).
- **Sotto competes on the pipeline:** speed, accurate end-of-question timing, grounded answers and the client's discretion. Not on the wording of its prompts, which anyone could copy.
