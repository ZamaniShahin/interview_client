# Sotto: design handoff

A brief for designing the UI and UX of Sotto's desktop app. It stands on its own: everything a designer needs is here. The other pages in this folder go deeper ([README](README.md)).

- **Written:** 2026-11-06.
- **Status of what's inside:**
  - Statements of how the product works are settled.
  - Anything marked *suggested* or *open* is for the design to propose.
  - Prices, plan names and legal wording are placeholders.

## 1. The product in one minute

**Sotto is a desktop copilot for live job interviews.**
- During a video call, it listens to the interviewer and works out when a question is finished.
- It then shows the candidate an answer to say, in the first person, in their own voice, grounded in their résumé.
- The answer appears in a small window that floats over the call and that the interviewer's screen share can't see.

**Who uses it**
- A job candidate in a remote interview on their own computer, in any call app (Zoom, Google Meet, Microsoft Teams).
- Every kind of question:
  - behavioral ("tell me about a conflict with a colleague");
  - technical ("how does Kafka keep messages in order?");
  - live coding, then fixing the code step by step;
  - system design ("design a URL shortener").
- The same person also uses Sotto **before** interviews (loading documents, preparing answers, mock interviews) and **after** them (history, a debrief).

**What it promises**

| Promise | Means |
|---|---|
| Fast | the first words of an answer appear about 1.5 s after the question ends, and stream in as they're written |
| Grounded | answers use the candidate's real background, and never invent employers, titles, dates or numbers |
| Invisible | the window never shows in a screen share or a recording, never takes focus from the call, and never makes a sound |
| Never fails mid-interview | a network drop or an outage becomes a status and a retry, never a dead end; typing still works when listening doesn't |
| Private | our server keeps no interview content; history stays on the computer, encrypted |

**Platform and language**
- A desktop app for Windows first; macOS later.
- It's built with web technology (Electron), so anything HTML and CSS can draw is possible, but **no native operating-system controls** ([§4](#4-hard-constraints)).
- The app and its answers are in English.

**The name** is a working name, from *sotto voce*: spoken quietly, for one listener. There is no logo, palette or type yet.

## 2. The moment we design for

A typical session:

- A backend engineer has a 45-minute technical interview on Zoom.
- Sotto's window sits just under the webcam, so reading looks like eye contact.
- The interviewer asks how they'd design a URL shortener. As the interviewer speaks, the words appear in the window, a phrase at a time.
- A second and a half after the question ends, an answer starts writing itself:
  - a few short spoken paragraphs;
  - the key words in amber;
  - a small diagram.
- The candidate glances at the amber words and talks through the design in their own words.
- When the interviewer interrupts with a follow-up, a new answer replaces the old one.
- Halfway through, the Wi-Fi drops for five seconds. The window says "Reconnecting…", then catches up. Nothing was lost.

**What this means for the design:**
- **The user is under stress and split in attention.** They read in glances while talking and keeping eye contact. Every element competes with the interviewer for attention.
- **During a call, nothing may need managing.** No questions, no choices, no setup. The window works by itself; the user's hands are for the call.
- **Zero surprise.** Nothing moves, flashes, beeps or opens unexpectedly. Problems are calm statuses.
- **Outside a call, the user has time.** Setup, preparation, account and history can be richer.

## 3. Design principles

1. **Glanceable.** Readable in a one-second glance while speaking: short paragraphs, generous type, key words in amber.
2. **Calm.** No alarms during a call. No red flashes, no shaking, no sounds. Problems are worded plainly, and most fix themselves.
3. **Invisible.** Nothing the app does may be seen by the other side of the call ([§4](#4-hard-constraints)).
4. **Never a dead end.** Every failure has a next step, usually automatic.
5. **Built for streaming.** Answers arrive in small pieces many times a second. The layout takes that without jumping.
6. **Quiet commerce.** No offers or upsells during a call. Buying happens after it, in the browser.
7. **Honest about data.** What goes where is said plainly, before the first session.

## 4. Hard constraints

These are not style choices. Each one comes from a real failure in v1, the tool Sotto grew from; breaking one shows the app to the interviewer.

| Constraint | Why | What it means for the design |
|---|---|---|
| **No tooltips** | a tooltip is a separate little window, and a screen share *can* see it | icon-only buttons must be obvious, or carry a visible label; help text is inline. Screen readers get accessible names, which show nothing |
| **No native dropdowns** | a dropdown's list is a separate window too | menus, selects and suggestions are drawn inside the window: segmented controls, inline lists, expanding panels |
| **The pointer never changes shape**, not even to a text I-beam or a hand | the pointer shows in a screen share; a pointer reacting to empty-looking space gives the app away | affordance comes from visual states alone: hover highlights, focus rings, field styling, a visible text caret |
| **No window frame from the operating system** | the window draws its own edges | custom chrome: an area to drag the window, a **◢ grip** (bottom-right) to resize it |
| **Always on top, and never takes focus by itself** | the call app keeps the keyboard until the user clicks into the window | it must be useful without any interaction. Show clearly when it has the keyboard, so the user knows where their typing goes |
| **Nothing opens outside the window during a session**: no system dialog, notification, new window or browser | anything outside is visible in a share | confirmations are inline. File pickers, purchases and sign-in happen only outside a session |
| **No sound, ever** | the interviewer would hear it | all feedback is visual |
| **Fonts, icons and images are bundled** | the app loads nothing from the internet at runtime | no web fonts or remote images |
| **Answers are plain Markdown, never HTML** | answers are untrusted text | design for the elements in [§7.3](#73-what-an-answer-contains), nothing richer |

The user can't see the window in their own share preview either. The setup wizard gives them proof: **🛡 Test hiding** asks them to start a real share and check.

## 5. Windows and surfaces

| Surface | What it is |
|---|---|
| **The overlay** | The product. A small window, always on top, without a system frame, movable and resizable, over any call app. It holds the live view, and settings and the practice panel too. |
| **The region selector** (later phase) | A full-screen layer that dims the screen while the user drags a rectangle around a coding problem or diagram. Hidden from capture too. |
| **The system browser** | Sign-in and sign-up, password and two-step codes, checkout, the billing portal. The sign-in pages are ours and can be themed to match the app (optional deliverable). Checkout and billing are the payment provider's pages. |
| **Open: a larger window outside sessions** | Should setup, the account, history and preparation get a roomier window when no session runs, or does everything live in the overlay? Propose. |
| **Open: taskbar and tray** | A full-screen share shows the taskbar. Should Sotto show there, or only in the tray, during a session? Propose. |

## 6. Information architecture

```
Overlay, during a session
├─ Status strip      state · AUTO/MANUAL · paused · listening · minutes left · tier
├─ Heard             the interviewer's words, towards the next question
├─ Answer            the question, how it was asked, the answer streaming in · history ‹ ›
├─ Ask bar           Question | Tip | Study | Result · text · send
└─ later phase       prepared answer 📌 · screenshots · coach strip · practice panel

Outside a session
├─ Home              start a session · documents ready? · minutes left
├─ Setup wizard      first run, and again from Help
├─ Documents         name · résumé · job description · notes · prep doc
├─ Preferences       custom instructions · answer bank
├─ Practice          mock interviews (later phase)
├─ History           interviews · questions and answers · transcript · debrief (later phase)
├─ Account           plan and state · minutes · devices · buy, top up, manage billing (in the browser) · sign out
└─ Settings
```

## 7. The overlay in detail

### 7.1 Regions and controls

| Region | Shows | Behavior |
|---|---|---|
| **Status strip** | the session's state; AUTO or MANUAL; paused; how listening is going (ok, reconnecting, down); minutes left on a minutes plan; the quality tier (fast or smart) | always visible during a session |
| **Heard** | the interviewer's finished phrases, then the phrase still being spoken | the live phrase updates many times a second; tell it apart from the finished words. When an answer starts, Heard starts over: the question moves to the answer, and the next words make a new one |
| **Answer** | the question as understood; how it was asked (spoken, typed, tip, study, result, screen); a Tip's note; then the answer | streams in; see [§7.3](#73-what-an-answer-contains) |
| **History ‹ ›** | the earlier answers of this interview | when a new answer starts while the user is looking back, show it, but don't yank them away |
| **Ask bar** | a mode switch (Question, Tip, Study, Result), a text box, send | used outside the heat of a question: typing a question, refining an answer, pasting an error |

**Controls the overlay needs:**
- start and end the session;
- AUTO ⇄ MANUAL;
- pause ⇄ resume;
- **the trigger**, "answer now": Ctrl+Enter, plus a visible control;
- Clear (start over: forget what was heard, the answer, the interview's memory);
- Clear heard (forget only the question being assembled);
- history back and forward;
- the ask bar's mode and send.

Later: capture a screen region, "ask about this screen", start practice.

**How the modes work, briefly:**
- **AUTO** (the default) answers when the server judges the question finished. Small talk isn't answered. It needs the résumé and the job description.
- **MANUAL** collects what is heard until the user presses the trigger.
- **The trigger:** with nothing new heard, it answers the same question again; with text in the ask bar, it answers that text.
- **A newer question always wins:** the answer being written stops, keeps what it showed, and is marked superseded.
- **Ask modes:**
  - **Question:** a typed question, answered as if the interviewer had asked it.
  - **Tip:** a note that rewrites the last answer ("shorter", "mention my Go work").
  - **Study:** a long explainer on a topic, for preparing.
  - **Result:** paste what running the last answer's code printed, or its error, and get the next step.

### 7.2 States to design

| # | State | What the user should see |
|---|---|---|
| 1 | No session | home: start a session; whether the résumé and job description are in (AUTO needs them); minutes left |
| 2 | Starting | a brief "starting…" |
| 3 | Live, nothing heard yet | quiet readiness: listening is on |
| 4 | Interviewer speaking | Heard filling in, the live phrase distinct |
| 5 | Answer streaming | the question, the kind, the text growing; a subtle sign it's still writing |
| 6 | Answer done | the full answer; history grows |
| 7 | A new question while streaming | the old answer stops and is marked superseded; the new one starts |
| 8 | Answer failed | what it showed stays, with a plain message such as "Try again" |
| 9 | Answer blocked | what it showed **disappears**, replaced by a neutral note: "This answer can't be shown. Try asking another way." |
| 10 | MANUAL | Heard piles up, with an obvious "answer now" (Ctrl+Enter) |
| 11 | AUTO unavailable | no résumé or job description: answers only when asked; say how to fix it, outside the call |
| 12 | Paused | audio ignored, typing still works, **minutes still count** |
| 13 | Listening reconnecting | "reconnecting…" next to listening; everything else normal |
| 14 | Listening down | "listening is down, you can still type"; it clears by itself when speech is heard again. At the start of a session: listening isn't available at all |
| 15 | Connection lost | "Reconnecting…", for up to 2 minutes; then everything catches up |
| 16 | Minutes running low | a quiet note at 10 and at 2 minutes left |
| 17 | Ending soon | a 30-second notice (no minutes left; the plan's longest session reached), or a 60-second one after 15 minutes of silence ("any command keeps it going") |
| 18 | Moved to the fast tier | a short notice: the session is near its cost limit |
| 19 | Ended | why, in plain words ([§10](#10-copy)); after the call, an offer to top up or upgrade when that's the reason |
| 20 | Typed text over its limit | the limit named, the text kept, nothing cut |
| 21 | Too many requests | wait a moment; it retries |
| 22 | Looking back in history | which answer this is (3 of 7), and a way back to live |

### 7.3 What an answer contains

Answers arrive as Markdown, written to be **said aloud**:
- **short paragraphs, in the first person;**
- **key words in *bold italic*,** shown in **amber** so the eye finds them while talking;
- **code** in blocks with the language named, for coding questions; sometimes more than one block;
- **one diagram**, a left-to-right flowchart, for system design questions, drawn inside the answer;
- **Study answers** are longer explainers, with lists and short bold lead-ins.

Nothing else: no tables, no images, no links that open.

**Streaming:**
- The text grows in small pieces many times a second.
- The first words come about 1.5 s after the question ends.
- A long answer outgrows the window: propose how the view follows the text without the reading position jumping under the user's eyes.

## 8. Flows

| # | Flow | Steps |
|---|---|---|
| F1 | **First run**, the setup wizard | 1. **What is recorded and sent where** (draft text in [§10](#10-copy)); acknowledged once, again when the text changes. No session without it. 2. **Sign in** (in the browser; the app waits: "Finish signing in in your browser"), and this computer is registered. 3. **Name, résumé, job description**: paste or type (file import later). 4. **The sound check**: play something with speech; the words appear live, proving the call's audio is captured. 5. **The hotkeys**, and 🛡 **Test hiding** |
| F2 | **Signing in, and its edges** | waiting for the browser; signed in; "Sign in again" (a running interview isn't interrupted); "An update is required" (blocking, with the update); "Verify your email" (needed for the trial) |
| F3 | **Too many devices** | the limit reached (2, or 3 on paid plans) → the device list (name, platform, app version, first and last seen) → remove one. At most 3 removals in 30 days; a removed device can't come back |
| F4 | **Starting a session** | the consent checkbox, ticked every time, never remembered → if another computer of the account has a live session: "You have a live session on *Laptop*. End it and start here?" → starting → live |
| F5 | **The live loop** | heard → the question ends → the answer streams → the candidate speaks → the next question replaces it |
| F6 | **Typing** | Question; Tip ("shorter"); Study (a topic); Result (pasting an error, getting the next step) |
| F7 | **Trouble** | the network drops → "Reconnecting…" → catches up; listening fails → reconnecting → down → "you can still type" → back by itself |
| F8 | **Running out** | 10 minutes left → 2 minutes → a 30-second notice → ended → after the call: top up, or upgrade → the browser → back in the app, the minutes appear by themselves |
| F9 | **The trial** | start the trial (once per person and computer; 14 days, 30 minutes) → days and minutes left → it ends → the plans |
| F10 | **The account** | the plan and its state; the minutes usable now; each lot with its source and expiry; the ledger; devices; manage billing (opens the browser); sign out |

**Later phase:**

| # | Flow | Steps |
|---|---|---|
| F11 | **Screenshots** | the region selector → attached to the next question (up to 5) → or "ask about this screen", with an optional hint |
| F12 | **Practice** | pick 1–10 questions and a focus → the server asks → the user answers aloud or typing → score and feedback → a follow-up for a weak answer → a summary. The copilot is paused meanwhile |
| F13 | **History and debrief** | the interviews → one interview's questions and answers (and the transcript, if kept) → ask for a debrief → feedback; export as a report; delete one or all |
| F14 | **Preparing** | documents (with character counts against limits); custom instructions; the answer bank: prepared answers, each with the phrasings it answers, enabled or not; drafts written by the server from the documents |
| F15 | **Coach and prepared answers, live** | a coach strip (the candidate's talk time, words per minute, fillers, which key words they used, a nudge to wrap up at 90 s); a 📌 card showing the user's own prepared answer at once, when the question matches one |

## 9. Content for mockups

All invented; use it to make the mocks realistic. Northwind is a fictional employer.

**Heard**, finished words then the live phrase:

> Okay, great. Next one. Can you walk me through how you'd design a URL shortener, like, for
> *millions of users a day?*

**A behavioral answer**

> **Q:** Tell me about a time you disagreed with a teammate. · *spoken*
>
> Sure. So at ***Northwind*** I was on the payments team, and a teammate wanted to rewrite our retry logic right before a ***release***.
>
> I thought that was risky, so instead of arguing in the channel I set up a quick call, and we went through the ***failure cases*** together. Honestly, we found two bugs in the old code, so we fixed those first and planned the rewrite for the next sprint.
>
> The release went out on time, and the rewrite later cut ***duplicate charges*** a lot. What I took from it is to move a disagreement to data early.

**A technical answer**

> **Q:** How does Kafka keep messages in order? · *spoken*
>
> So ***Kafka*** only guarantees order within a ***partition***, not across a topic. Producers pick the partition by ***key***, so all the events for one customer land in the same partition and stay in order.
>
> At Northwind we keyed order events by ***customer id*** for exactly that. The catch is ***rebalancing***: add partitions and keys can move, so we sized them up front.

**Live coding, then a Result**

> **Q:** Write a function that returns the first non-repeating character in a string. · *spoken*
>
> I'd do it in two passes: count every character, then return the first one with a ***count of one***. That's ***O(n)*** time.
>
> ```python
> from collections import Counter
>
> def first_unique(s: str) -> str | None:
>     counts = Counter(s)
>     for ch in s:
>         if counts[ch] == 1:
>             return ch
>     return None
> ```
>
> If every character repeats, it returns ***None***.

> **Q:** `TypeError: unsupported operand type(s) for |: 'type' and 'NoneType'` · *result*
>
> That means the interpreter is older than ***Python 3.10***, which added `str | None`. Swap the hint for ***Optional***:
>
> ```python
> from typing import Optional
>
> def first_unique(s: str) -> Optional[str]:
> ```
>
> Then run it again.

**System design, with its diagram**

> **Q:** Design a URL shortener for millions of users a day. · *spoken*
>
> So it's ***read-heavy***, maybe a hundred reads per write. I'd put a ***cache*** in front of a ***key-value store***, and make the short codes from a ***counter in base 62***, so they never collide.
>
> ```mermaid
> flowchart LR
>   U[User] --> LB[Load balancer] --> API[API servers]
>   API --> C[(Cache)]
>   API --> DB[(Key-value store)]
>   API --> ID[ID generator]
> ```
>
> Then I'd talk about ***expiry*** and ***analytics*** if we have time.

**A Tip**

> **Q:** Tell me about a time you disagreed with a teammate. · *tip: "shorter"*
>
> Sure. At ***Northwind*** a teammate wanted to rewrite our retry logic right before a ***release***. We walked through the ***failure cases*** together, fixed two bugs first, and shipped on time.

**A Study explainer**

> **Q:** Consistent hashing · *study*
>
> **What it is.** A way to spread keys over servers so that adding or removing one moves only a few keys.
> - **The ring.** Servers and keys are hashed onto the same circle; a key belongs to the next server clockwise.
> - **Virtual nodes.** Each server appears many times on the ring, which evens out the load.
> - **Where you'll meet it.** Caches, sharded databases, load balancers.

**Numbers to show.** All of these come from the server; they are today's defaults, not final.

| What | Example |
|---|---|
| Minutes left | 187 min |
| Trial | 14 days, 30 minutes; sessions up to 10 minutes |
| A minutes plan | 400 minutes a month; sessions up to 120 minutes |
| Unlimited | fair use, up to 60 hours a month |
| Top-up | +100 minutes, valid 12 months |
| Devices | 2 on the trial, 3 on paid plans; "Laptop · Windows 11 · 2.0.0 · last seen today" |
| Ledger | "+400 · plan minutes · Nov 1", "−42 · session · Nov 3", "+100 · top-up · Nov 4", "−18 · expired · Dec 1" |
| Text limits | question 4,000 characters; Tip 1,000; Study 4,000; Result 200,000 |
| Documents | name 200; résumé 50,000; job description 30,000; notes 5,000; prep doc 100,000 |
| Preferences | custom instructions 4,000; answer bank up to 100 entries |

Plan names and prices are placeholders: they're not decided.

## 10. Copy

**Tone:**
- calm, brief, plain words;
- second person;
- no exclamation marks, no blame, no jargon (no "STT", "token", "hub", "lease");
- never alarming during a call.

**Settled wording:**

| Where | Text |
|---|---|
| The consent checkbox before each session | "I have consent to record and transcribe this conversation" (the final words wait for legal review) |
| Another device has a live session | "You have a live session on *Laptop*. End it and start here?" |
| An answer was blocked | "This answer can't be shown. Try asking another way." |

**Suggested wording** (rewrite freely):

| Where | Text |
|---|---|
| Waiting for sign-in | "Finish signing in in your browser." |
| Connection lost | "Reconnecting…" |
| Listening reconnecting | "Listening: reconnecting…" |
| Listening down | "Listening is down. You can still type your question." |
| AUTO without documents | "Add your résumé and job description to answer automatically." |
| Paused | "Paused. Minutes still count." |
| Minutes low | "10 minutes left." |
| Ending soon | "No minutes left. The session ends in 30 seconds." |
| Inactive | "Nothing heard for 15 minutes. The session ends in a minute." |
| Ended: by the user | "Session ended." |
| Ended: no minutes | "The session ended: no minutes left." |
| Ended: longest session reached | "The session reached your plan's longest session." |
| Ended: no activity | "The session ended: nothing was heard for a while." |
| Ended: opened on another device | "The session moved to another device." |
| Ended: its cost limit | "The session reached its limit." |
| Ended: the connection didn't come back | "The connection was lost for too long. Start a new session to continue." |
| Ended: the account suspended | "Your account is suspended." |
| Update required | "An update is required to continue." |

**The first-run notice**, a draft for layout only, waiting for legal review:

> **Before your first session: what goes where**
> - **On this computer:** your history, documents and prepared answers, encrypted. Transcripts and recordings only if you turn them on.
> - **To Sotto's server:** the interviewer's voice (never your microphone), your documents' text and what you type. Used for the session, never stored.
> - **To OpenAI**, which writes the answers and transcribes the interviewer: your documents, what the interviewer says, the questions and the answers, with nothing that identifies you. OpenAI may keep them for up to 30 days to watch for abuse, then deletes them.
>
> [ I understand ]

## 11. Visual direction

**Settled:**
- **key words are amber,** as in v1;
- the window has **no system frame**, and resizes from a **◢ grip**.

Everything else is open.

**The context:**
- The window floats over video calls (mostly dark interfaces with faces), and in coding rounds over a code editor or a shared document.
- Screens range from a 1366 × 768 laptop to a 4K monitor, at 100–200% scaling.
- Windows 11 first.

**To explore:**
- a quiet brand that fits *sotto voce*: discreet, low-key, confident;
- dark, light or both;
- translucency. It doesn't matter for hiding (the window is excluded from captures either way), only for the user's comfort;
- a compact and an expanded size for the overlay, its default size and position;
- type made for reading in a glance: size, line length, spacing, a monospace for code;
- status colors that also work without color (icon or word);
- icons that explain themselves, since there are no tooltips.

**Accessibility:**
- contrast at least WCAG AA;
- full keyboard use;
- names for screen readers;
- reduced motion respected.

## 12. Deliverables

In priority order:

1. **Foundations:** color tokens (each theme proposed), type scale, spacing, radii, elevation, the amber key-word style, code and diagram styles, status styles.
2. **Components:**
   - the status strip; Heard; the answer card in each ending (done, superseded, failed, hidden); the kind badge; the history pager;
   - the ask bar with its mode switch; an in-window list or menu instead of a native dropdown; an inline confirmation;
   - buttons, toggles, fields without an I-beam pointer, calm banners;
   - the drag area and the ◢ grip; the wizard stepper;
   - a device row, a minutes-lot row, a ledger row, a plan card.
3. **The overlay in every state** of [§7.2](#72-states-to-design).
4. **Flows F1–F10**, the first version and the plans.
5. **The later phase:** F11–F15.
6. **Optional:**
   - the sign-in pages themed to match;
   - an app icon;
   - a small clickable prototype of the live loop (F5 with F7).

## 13. Not to design

- **Model pickers, API keys, provider settings:** none exist; the server chooses.
- **Card or password forms inside the app:** both happen in the browser.
- **System notifications, sounds, pop-up windows** during a session.
- **Anything that shows the assistant's own instructions.** The user edits only their custom instructions.
- **Mobile or web versions.**

## 14. Open points the design may propose

- The default size and position; compact and expanded modes.
- Light, dark, translucency.
- The hotkeys beyond Ctrl+Enter. v1's set isn't at hand yet.
- A larger window outside sessions, and taskbar or tray presence ([§5](#5-windows-and-surfaces)).
- Where minutes left and the tier show, and whether the user may pick the tier (fast or smart) where the plan allows: designed on the server, not scheduled.
- How a long answer scrolls while it streams.
- An indicator of the interviewer's audio level, with a warning when nothing has been heard for a while.
- The brand: logo, palette, type. The name stays Sotto for now.
