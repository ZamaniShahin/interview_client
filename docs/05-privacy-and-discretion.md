# 05 — Privacy and discretion

Two promises the client keeps for the user:
- **private:** we keep no interview content;
- **invisible:** nobody on the call can tell Sotto is there.

Both are requirements, not polish. A slip in either one hurts the user in the middle of an interview.

## Where the data goes

### On the device

Kept in an encrypted local database, whose key the operating system protects. It holds:

| Data | Kept |
|---|---|
| Interviews: when, the candidate, the role, the company, the tier | always |
| Each question and its answer | always |
| Debrief results | when a debrief is run |
| Transcripts of the interview, both speakers | **only if the user opts in** |
| The answer bank (prepared answers, each with its phrasings and whether it's enabled) | always |
| The documents: résumé, job description, prep doc | always |
| Settings: name, notes, custom instructions, coach on or off, save transcripts or not… | always |
| Recordings, as audio files: the call on the left, the microphone on the right | **only if the user turns recording on** (off by default, [Consent](#consent)); each kept encrypted with its interview, written out as a WAV only when the user saves it, where they choose |

The user can delete one interview or all of them, and export an interview as an HTML report.

### To our server

Sent only for the live session or job that needs it, and **never stored**: the server holds it in memory while the session runs.

| What | When |
|---|---|
| The interviewer's audio: what the computer plays, **never the microphone** | during a live session |
| The documents' text: name, résumé, job description, notes, prep doc. Files are read on the device; only the text is sent | at the start of each session, and when they change |
| Typed questions, Tips, Study topics, pasted Results | when the user sends them |
| The enabled prepared answers and the custom instructions | with the session (Phase 3) |
| Screenshots the user selects | when attached (Phase 3) |
| Practice answers, as text, with talk time, words per minute and fillers | during practice (Phase 3) |
| An interview's questions, answers, transcript and speaking metrics | when the user asks for a debrief (Phase 3) |

- **What the server does keep** is about the account, never the interview:
  - the account and its sign-in;
  - the devices;
  - the plan and subscription;
  - the minutes ledger;
  - each session's facts: when, which device, how long, how it ended, minutes charged;
  - AI usage as numbers (tokens, cost);
  - a security log.
- **Its logs hold no content.** No question, answer, transcript, document or screenshot is ever logged.
- **One exception, Phase 3:** so a session can move to another server, the server may keep an encrypted copy of the running interview's text for at most 2 hours after the last activity.

### To OpenAI

Our server sends OpenAI what an answer needs, and nothing that says who the user is.

| Sent | Not sent |
|---|---|
| the candidate's documents and name, the interview so far, the question; the interviewer's audio, for speech-to-text. With Phase 3: the prep doc, the enabled prepared answers and custom instructions, screenshots for questions about the screen, and what practice and debriefs need | the account's email, user id or account id: nothing that ties a request to the account |

- **No account details:** answers carry only an anonymous code, made on our server, that lets OpenAI tell users apart for abuse monitoring. Speech-to-text carries nothing at all.
- **Every request asks OpenAI to store nothing,** and OpenAI doesn't train on API data.
- **OpenAI may keep requests for up to 30 days** in its abuse-monitoring logs, until it grants us zero data retention.

## The notice before the first session

Before the user's first live session, the client says plainly:
- what goes to OpenAI: the documents they load, what the interviewer says, the questions and the answers;
- that OpenAI may keep it for up to 30 days for abuse monitoring;
- that we store none of it.

How it works:
- **The user acknowledges it once.** It is asked again whenever the text changes, so the client must know which version of the text was acknowledged.
- **It is the first step of the setup wizard** ([02](02-journeys.md) J2). No live session starts without it.
- **It is needed before any outside user**, from the very first build given to anyone.
- **The final words need a lawyer** (roadmap 4.8). Until then, any wording is a draft.

## Consent

- **Every live session starts behind a checkbox:** "I have consent to record and transcribe this conversation". It is the competitor's practice, copied.
  - It is asked **every time**, and never remembered.
  - It is **skipped for practice**: no one else is on the call.
  - The wording waits for legal review, like the notice.
- **Recording is off by default.** When the user turns it on (after the checkbox), the app records the call, both sides, to audio files on the device. Nothing recorded leaves the device. The microphone is opened for it only while a session is recorded, and the overlay shows REC meanwhile.
- **The microphone never leaves the device.** It feeds only:
  - the on-device coach;
  - the echo gate, which keeps the interviewer's voice out of the coach;
  - the local recording;
  - practice answers, transcribed on the device and sent as text.

## Discretion: the stealth rules

The overlay must stay invisible to the other side of the call, and the user must never be caught out by the app. These rules come from v1, where each one was learned from a real failure. Every rule has an automated test in the client.

1. **Hidden from every capture.** Every window is excluded from screen sharing and recording, and this is re-applied each time a window is shown: Windows forgets it on every show.
2. **No tooltips.** A tooltip is a separate little window that a screen share *can* see. Name things with accessible labels instead; nothing may ever show a tooltip, vendored code and diagrams included.
3. **No native dropdowns.** A dropdown's list is a separate window too. Every list or menu is drawn inside the overlay.
4. **The pointer never changes shape over the overlay.** The pointer shows in a screen share: if it turned into a text cursor or a hand over empty-looking space, the interviewer would see it react to something invisible. One arrow pointer, everywhere.
5. **No window frame or resize border from the operating system.** The overlay is resized with a ◢ grip drawn inside it.
6. **Always on top, and never takes focus.** The overlay floats above the call and appears without taking focus, so the call app keeps the keyboard until the user clicks into the overlay.
7. **Nothing opens outside the overlay during a session:**
   - no dialog;
   - no system notification;
   - no new window;
   - no browser.

   File pickers and other system dialogs belong to setup, outside a session.
8. **Global hotkeys** work while the call app has the focus: the trigger (Ctrl+Enter) and the others carried over from v1, with fallbacks where a key combination is taken. v1's full list isn't in these docs yet ([08](08-open-questions.md)).

Two more, from the product's promise:
- **No sound, ever.** Warnings, endings and errors are silent and in the overlay.
- **🛡 Test hiding.** The wizard lets the user check for themselves, in a real screen share or capture, that the overlay doesn't show.

Out of scope: hiding the app's process or its name from the system.

## Security the user relies on

The client is built assuming it will be taken apart. What that means for the product:

- **Sign-in happens in the system browser**, never in a form inside the app.
- **The sign-in and the device key never leave the app's core process.** They are encrypted by the operating system for this user, and the screens never see them. A stolen sign-in is useless on another computer.
- **The screens have no network access.** Everything goes through the app's core process, to our server only.
- **Answers are untrusted text.**
  - They're shown as Markdown with HTML switched off, cleaned before display.
  - Diagrams are drawn in strict mode.
  - Links in an answer open nothing. The only pages the app opens are ours (sign-in, account, checkout, billing portal), and never during a session.
- **Builds are signed, and updates are checked.** The server can require an update ([02](02-journeys.md) J1).
- **Crash reports carry no content**: no questions, answers, documents or screenshots.

## Deleting and exporting

| | On the device | On our server |
|---|---|---|
| Export | the app exports the local history | account, usage and billing data, on request |
| Delete | one interview, or everything | deleting the account: sessions end, the subscription is cancelled, the sign-in is deleted, and everything is purged within 30 days; invoices and the ledger stay, pseudonymized, as the law requires |

Local data is the user's: the app deletes it on request, and deleting the account doesn't reach into the device.

**Built 2026-11-09 (Q19)**, on the Account page under "Your data":
- **Save a copy**: the server's copy of what it keeps (the profile and computers, the account, its plan, trials and licences, the minutes and ledger, the sessions' usage), saved where the user chooses, as one JSON file. What was said was never kept, so there is none of it.
- **Delete account**: the user types the account's email again, and the server checks it. It is refused while a paid plan will still be charged (cancel it in Manage billing first) or a live session runs, with the server's words. Deleted, the app signs out.
  - The server replaces what names the user at once rather than within 30 days, and keeps the ledger, naming no one.
  - The sign-in itself isn't deleted yet (backend Q39), so signing in again starts a fresh, empty account.
- Both need a registered computer, and neither works during a session: a save dialog would show in a share.
