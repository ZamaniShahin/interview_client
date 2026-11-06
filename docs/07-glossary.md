# 07 — Glossary

The product's words, as these docs and the app use them. Where a word means two things, both are named.

## The product

| Term | Meaning |
|---|---|
| **Sotto** | The product's working name, from *sotto voce*: spoken quietly, for one listener. It may change before launch; the code keeps it as a codename. |
| **v1 / v2** | v1 is the personal tool Sotto grew from: a Python backend and an Electron overlay, run with the user's own OpenAI key. v2 is the commercial product. |
| **Candidate / user** | The person using Sotto in their interview. |
| **Interviewer** | The other side of the call. Only their voice is sent to the server. |
| **Terminal** | What the client is: it captures, shows and stores locally, and decides nothing that matters for money or security. |
| **Overlay** | The small always-on-top window over the call, hidden from screen shares. |

## The live interview

| Term | Meaning |
|---|---|
| **Live session** (or session) | One live interview in the app, from Start to End. |
| **Heard** | What the interviewer has said since the last answer: the question being assembled, finished pieces then the phrase still being spoken. |
| **End of question** | The moment the server judges a question finished. AUTO answers then. |
| **AUTO** | The server answers on its own when a question ends. The default; it needs the résumé and the job description. |
| **MANUAL** | Nothing is answered until the user presses the trigger. |
| **Trigger** | Ctrl+Enter: answer now. It answers what was heard, or the text typed in the ask bar. |
| **Ask bar** | The text box with four modes: Question, Tip, Study, Result. |
| **Question** (mode) | A typed question, answered as if the interviewer had asked it. |
| **Tip** | A note that rewrites the last answer ("shorter", "mention my Go work"). |
| **Study** | A long explainer on a topic, for preparing. Never kept in the interview's memory. |
| **Result** | What running the last answer's code printed, or its error; the answer is the next step. For live coding. |
| **How it was asked** | Shown with every question: spoken, typed, tip, study, result, or screen. |
| **Key words** | Words the answer marks in ***bold italic***, shown in amber so the eye finds them while talking. The coach checks them against what the candidate said. |
| **Superseded** | An answer cut short because a newer question took over. It keeps what it showed. |
| **Blocked** | An answer stopped because it was repeating the assistant's rules. The app hides it. |
| **Memory** | The interview so far (questions and answers), which every answer is written with. Its size comes from the plan. |
| **Turn** | One question and its answer in the memory. A **screen turn** also carries screenshots. |
| **Clear** | Start over: forget what was heard, the answer being written, and the memory. |
| **Clear heard** | Forget only the question being assembled. |
| **Paused** | A session that ignores audio for now. Typed questions still work, and minutes still count. |
| **Suspended** (session) | A session waiting for the app to come back after a network drop, for up to 2 minutes. Not to be confused with a suspended *account*. |
| **Resume** | The app picking its session up again after a drop. The server sends what was missed, or a **snapshot** of the whole session when too much was missed. |
| **Listening's health** | ok, reconnecting or degraded: how speech-to-text is doing, shown in the status. |
| **Notice** | A short message from the server during a session, such as a move to the fast tier. Also: the 30-second notice before a session ends. Not the OpenAI notice. |
| **End reason** | Why a session ended: user, credit_exhausted, max_length, inactive, opened_elsewhere, cost_limit, expired, suspended. |
| **Screenshot** / **region selector** | A part of the screen the user selects and attaches to the next question (Phase 3). |
| **Screen notes** | Text the server writes about older screenshots, so they stay in memory without being sent again. |

## Before and after

| Term | Meaning |
|---|---|
| **Documents** | Name, résumé, job description, notes, and the prep doc. Read on the device; only their text is sent. |
| **Prep doc** | A document the candidate prepared for this interview, up to 100,000 characters. |
| **Custom instructions** | The user's standing wishes for answers ("keep answers short"), up to 4,000 characters. |
| **Answer bank** | The candidate's prepared answers, each with the phrasings it answers. Stored on the device; the enabled ones are sent for the interview. |
| **Prepared-answer match** 📌 | When a question matches a prepared answer, that answer is shown at once, while the generated one is written. Done on the device. |
| **Prepared-answer drafts** | Prepared answers the server drafts from the documents, as a job. |
| **Coach** | The speech coach: the candidate's talk time, words per minute, fillers, which key words they used, and a nudge to wrap up at 90 s. It listens to the microphone, on the device only. |
| **Echo gate** | Keeps the interviewer's voice, played by the speakers, out of the coach. |
| **Practice** | A mock interview: the server asks, the user answers aloud or by typing, the server scores and gives feedback. |
| **Debrief** | The server's review of a finished interview, kept in the local history. A job. |
| **Job** | A one-shot task the server runs outside a live session (a debrief, prepared-answer drafts), counted against a monthly quota. |
| **History** | The interviews kept on the device, encrypted: questions, answers, debriefs, and transcripts when the user opts in. |
| **Setup wizard** | The five steps of the first run. It can be run again from Help. |
| **Sound check** | The wizard step that shows a live transcript, proving the call's audio is captured. |

## Plans and money

| Term | Meaning |
|---|---|
| **Account** | Who pays: for now one person. Later also an organization. |
| **Seat** | One user's right to use the account's plan. A personal account has one. |
| **Plan** | What's for sale: the trial, a minutes plan, Unlimited. |
| **Entitlement** | What the account may do right now: its plan, limits and state, as the server resolves it. The app's copy is for display only. |
| **Entitlement state** | none, trialing, active, past due (3 days' grace), suspended. |
| **Trial** | 14 days and 30 live minutes, once per person and per computer, started by the user. |
| **Minutes** (credits) | Prepaid live time. Kept in **lots**, each with its own expiry; the soonest to expire is used first. |
| **Top-up** | A pack of extra minutes, bought once, valid for 12 months (default). |
| **Ledger** | The list of every change to the minutes: grants, purchases, debits, refunds, expiries, adjustments. It is never edited. |
| **Fair use** | Unlimited's ceiling: up to 60 hours a month (default). |
| **Tier** | Answer quality: fast or smart. The server maps it to a model; the app never names one. |
| **Cost ceiling** | A limit on what one session may cost us. At 80% the session moves to the fast tier; at 100% it ends (`cost_limit`). |
| **Checkout** / **billing portal** | The payment provider's pages, opened in the browser: to buy, or to change the plan, the card, or cancel. |
| **Takeover** | Starting a session on this device when another device of the account has one running. The other session ends as `opened_elsewhere`. |
| **Lease** | The server's record that a seat has a live session running. One at a time. |

## Accounts, devices and trust

| Term | Meaning |
|---|---|
| **Sign-in** | Done in the system browser, with email and password, a passkey or Google, and optional two-step codes. |
| **Device** | An installed app registered to the account, with its own key. The plan limits how many. |
| **Device key** | A key made on the computer at the first sign-in. It proves requests come from this installation. |
| **Removal cap** | At most 3 device removals in 30 days. |
| **Suspended** (account) | An account stopped for fraud or abuse, after review. Everything is refused. |
| **Minimum client version** | The oldest app the server still accepts (`client_outdated` below it). |
| **Error code** | The short name the server gives every refusal (`credit_exhausted`), for the app to act on, with a plain message for a person. |

## Discretion and privacy

| Term | Meaning |
|---|---|
| **Stealth rules** | The eight rules that keep the overlay invisible to the other side of the call ([05](05-privacy-and-discretion.md)). |
| **Content protection** | The operating system's setting that keeps a window out of screen shares and recordings. |
| **🛡 Test hiding** | The wizard's check that the overlay doesn't show in a real share. |
| **The OpenAI notice** | The first-run text on what goes to OpenAI and how long it may be kept, acknowledged once and again when it changes. |
| **Consent checkbox** | "I have consent to record and transcribe this conversation", ticked before every live session (not practice). |
| **Recording** | An audio file of the call, both sides, on the device only. Off by default. |
