# 03 — The live interview

What happens during a live session, as the user sees it and as the client must handle it. The server decides everything described here; the client shows it, and sends what the user does.

## The overlay

One small window floats over the call, always on top. It never takes focus from the call app, and it is hidden from screen shares and recordings ([05](05-privacy-and-discretion.md)). Its parts:

| Part | Shows |
|---|---|
| **Status** | the session's state, AUTO or MANUAL, paused, how listening is going, minutes left on a minutes plan, the quality tier |
| **Heard** | what the interviewer has said towards the next question: the finished pieces, then the phrase still being spoken, updated many times a second |
| **Answer** | the question being answered, with how it was asked, then the answer as it streams in |
| **History ‹ ›** | the earlier answers of this interview, to step back and forth |
| **Ask bar** | a text box with the modes Question, Tip, Study and Result |
| **Coach strip** (Phase 3) | the candidate's own talk time, words per minute, fillers, and which key words of the answer they used; a nudge to wrap up at 90 s |
| **Prepared answer 📌** (built 2026-11-11, 3.8) | when the question matches one of the candidate's prepared answers (v1's match, on this computer), that answer at once, while the generated one is written |
| **Screenshots** (Phase 3) | the screenshots attached to the next question |
| **Practice panel** (Phase 3) | the mock interview ([02](02-journeys.md) J9) |

- **The planned windows** are the overlay, the screenshot region selector, and a hidden window that captures audio.
- **Settings and the practice panel** live inside the overlay.
- **During a session, nothing opens a new window** ([05](05-privacy-and-discretion.md)).
- **Open:** whether the wizard, the account pages and history get a larger window of their own outside a session ([08](08-open-questions.md)).

## A session's life

| State | Means | The user sees |
|---|---|---|
| Starting | the session is being set up | a moment of "starting…" |
| Live | listening and answering | the overlay at work |
| Paused | the user paused it | "paused". Audio is ignored, typed questions still work, and **minutes keep counting** |
| Suspended | the app lost its connection | "reconnecting…". The server waits 2 minutes; answers that fall due meanwhile are still written, and arrive on reconnect |
| Ended | it's over, for a reason (below) | a short, calm message; history keeps what was answered |

- **One session per account at a time**, across all its devices ([02](02-journeys.md) J7, takeover).
- **A session belongs to the device that started it.** Only that device can pick it up again after a drop.

## From speech to an answer

- **Only the interviewer is heard.** The app sends what the computer plays (the call's audio), never the microphone. The server transcribes it; the client shows it in Heard.
- **Questions are assembled on the server.** The interviewer often pauses mid-question; the pieces are joined until the question is finished. A long silence starts a new question.
- **AUTO** (the default): the server answers on its own once the question seems finished. It waits a little after the interviewer stops, longer when the question sounds unfinished. Talk that isn't a question (small talk, "okay, great") isn't answered. AUTO needs the résumé and the job description ([02](02-journeys.md) J6).
- **MANUAL:** everything heard piles up until the user presses the **trigger** (Ctrl+Enter). Switching to MANUAL cancels an automatic answer that was about to start.
- **The trigger**, in either mode:
  - with nothing new heard, it answers the same question again;
  - with nothing heard at all, it does nothing;
  - with text typed in the ask bar, it answers that text instead.
- **The newest question wins.** A new question cancels the answer still being written. The cancelled answer keeps what it showed, and is marked as superseded.
- **Clear** starts over: it forgets what was heard, the answer being written, and the interview's memory.
- **Clear heard** forgets only the question being assembled. The wizard's sound check uses it.

## The ask bar

| Mode | What it does | Limit |
|---|---|---|
| **Question** | answers a typed question as if the interviewer had asked it | 4,000 characters |
| **Tip** | writes the last answer again, shaped by the user's note ("shorter", "mention my Go work"). With nothing to refine, the note is answered as a question | 1,000 characters |
| **Study** | a long explainer on a topic, for preparing: lists and bold are fine here. It is never kept in the interview's memory | 4,000 characters |
| **Result** | for live coding: paste what running the last answer's code printed, or the error, and get the next step. Long output is fine; the server keeps its start and end | 200,000 characters |

Over a limit, the command is refused with the field named; nothing is cut silently.

## Screenshots (built 2026-11-11, 3.6)

- **The user selects a region of the screen** (a coding problem, a diagram) with the region selector: the screenshot button beside Answer, or Ctrl+Shift+G. The display under the pointer freezes; a click takes all of it, a drag an area, Esc or a right-click nothing. Up to the plan's number per question (5), each at most 2 MB (the app makes PNG or JPEG, at most 2,048 px on the long edge and 1.5 MB).
- **In MANUAL it waits, attached** to the next question, over the ask bar; Answer (or Ctrl+Enter) takes it, what is typed its note.
- **In AUTO it is asked about at once**, what is typed going as its note (500 characters at most).
- **The plan caps screenshots per session.** The latest screen turns' images are sent again with later questions; older ones are remembered as text notes the server writes.
- **The client keeps the screenshots, in memory only**, so the overlay can show them and attach them again if the session moves to another server. Under an answer are the screenshots it read, each to attach again (＋). The choices are in [decisions.md](decisions.md) §15.

## Answers

- **One answer at a time:** it starts (the question, how it was asked, a Tip's note), streams in pieces, and ends in one of four ways:

  | End | Means | The client |
  |---|---|---|
  | Done | finished cleanly | keeps it in history; the interview remembers it |
  | Cancelled | a newer question took over | keeps what was shown, marked as superseded |
  | Failed | the model couldn't finish (`provider_unavailable`…) | keeps what was shown, with the plain message the server sent ("Try again") |
  | Blocked | it was repeating our assistant's rules (`output_blocked`) | **hides what it had shown of that answer**, with a short neutral note |

  Only a clean finish is remembered by the interview.
- **How it was asked** is shown with the question: spoken, typed, tip, study, result, or screen.
- **What arrives is Markdown, written to be said aloud:**
  - short paragraphs, in the first person;
  - **key words in bold italic** (`***like this***`), which the overlay shows in **amber** so the eye finds them while talking, and which the coach checks against what the candidate said;
  - **code** in fenced blocks, with the language named, for coding questions; one block per file or language;
  - **one diagram** in a fenced `mermaid` block (a left-to-right flowchart) for system design;
  - **Study** answers: a longer explainer with lists and short bold lead-ins.

  Render it safely: no HTML from an answer, ever ([05](05-privacy-and-discretion.md)).
- **Memory:**
  - every answer is written knowing the interview so far, up to the plan's memory size;
  - new documents (a new résumé, job description, name or notes) start a new interview, and the memory goes;
  - Clear wipes it too;
  - an answer still streaming when the memory is wiped isn't remembered.
- **The quality tier** (fast or smart) comes from the plan, and the user can't choose it yet: a choice is designed but not scheduled ([08](08-open-questions.md)). When the plan allows smart, answers use it. Near the session's cost ceiling, the server moves to fast and says so in a notice.

## Listening's health

Speech-to-text can fail; the session doesn't. The status shows one of three states:

| State | Means | The user sees |
|---|---|---|
| ok | listening | nothing special |
| reconnecting | listening failed twice in a row; it's coming back within seconds | "reconnecting…" next to listening |
| degraded | listening keeps failing, or isn't available | that listening is down and **typed questions still work**. It clears by itself once speech is heard again |

- **A single short drop is never shown:** the server bridges it, and nothing said in those seconds is lost.
- **When the session starts degraded,** listening isn't available at all; tell the user plainly.

## Network drops

- **The app reconnects by itself.** It keeps the last ~10 s of audio and sends them again, so the server drops what it already has and nothing is lost.
- **On reconnect, the server sends what the app missed,** and the screen catches up. When too much was missed, the app redraws the whole session from a snapshot instead.
- **After 2 minutes without the app,** the session ends as expired. Minutes already counted stay counted.
- **A server restart** moves the session: the app is told to reconnect, and does, quickly.
- **What the user sees:** "reconnecting…", then captions and answers catch up. Never an error dialog.

## How a session ends

The server says why, and the app says it in plain words, discreetly: no sound, no new window. Offers to top up or upgrade wait until after the call.

| Reason | Means | Before it |
|---|---|---|
| `user` | the user ended it | — |
| `credit_exhausted` | no minutes left | warnings at 10 and 2 minutes left, then a 30-second notice |
| `max_length` | the plan's longest session was reached | a 30-second notice |
| `inactive` | 15 minutes with nothing heard and no command | a 60-second notice; any command cancels it |
| `opened_elsewhere` | the user started a session on another device and took over | — |
| `cost_limit` | the session reached its cost ceiling | at 80%, the move to the fast tier, with a notice |
| `expired` | the app didn't come back in time after a drop | — |
| `suspended` | the account was suspended | — |

An answer already being written when a session must end is allowed to finish, up to 30 s.

**Today** the server ends sessions only as `user` and `expired`. The other reasons and their warnings come with leases (2.3) and minute metering (2.4); their names are already fixed ([06](06-scope-and-phases.md)).

## Errors the user can meet

Every error carries a code (for the app) and a plain message (for a person). The ones that matter during a session:

| Code | Means | The app |
|---|---|---|
| `not_in_session` | a command came before any session | starts or resumes one |
| `already_in_session` | this connection already has a session | uses it |
| `session_expired` | the session is over, or was never this user's | offers a new one |
| `session_active_elsewhere` (planned, with 2.3) | another device holds the account's live session | offers the takeover |
| `no_entitlement` | the plan doesn't include live sessions | shows the plans, after the call |
| `credit_exhausted` | no minutes left | shows top-up and upgrade, after the call |
| `invalid_input` + `too_long` | a typed question, tip or result is over its limit | says which, keeps the text |
| `rate_limited` | too many commands too fast | waits and retries |
| `provider_unavailable` | the model or listening can't be reached right now | the server's plain message; try again |
| `output_blocked` | an answer was stopped | hides that answer |

## Speed

- **The first words appear about 1.5 s after the question is judged finished** (3 s at worst, 95% of the time), and the same after a trigger. The judging itself adds a short wait after the interviewer stops; that wait is the product's behavior, not overhead.
- **Show each piece the moment it arrives** (one frame, at most).
