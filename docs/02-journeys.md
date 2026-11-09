# 02 — User journeys

Every journey the client supports, in the order a new user meets them. The live interview itself has its own page ([03](03-live-interview.md)), and the plans and their rules have theirs ([04](04-plans-and-billing.md)).

## J1. Install and update

- **Install** from a signed installer (Windows first; macOS later). Unsigned builds are not shipped.
- **Updates** arrive by themselves, signed, rolled out to a share of users at a time.
- **Update required:** the server refuses clients below a minimum version (`client_outdated`). The app then says that an update is required and offers it. Nothing else works until it's done, so an old or patched build stops working.

## J2. First run: the setup wizard

It opens by itself on first use, and can be run again from Help. Five steps:

1. **What is recorded and sent where.** What stays on the device, what goes to our server, and what goes to OpenAI and how long OpenAI may keep it ([05](05-privacy-and-discretion.md)). The user acknowledges it once, and again whenever the text changes. **No live session starts before this acknowledgement.** It is required before any outside user.
2. **Sign in, and register this device** (J3, J4). There are no API keys or model choices to set: v2 has none on the device.
3. **Name, résumé and job description** (J6): the minimum for answers that sound like the candidate.
4. **The sound check.**
   - The live transcript appears on screen, proving that the call's audio plays through the computer's default output device.
   - Automatic answering and recording stay off while the wizard is open, and come back after.
   - Leaving the sound check clears what it heard, so its words never join the first real question.
   - It runs as a live session and is charged like any session minute (Q12, decided 2026-11-09).
5. **The hotkeys**, and **🛡 Test hiding**: the user checks that the overlay doesn't show in a screen share or a capture.

## J3. Sign up and sign in

- **In the system browser**, never in the app: the app opens the browser at our sign-in page and waits, saying so ("finish signing in in your browser"). After sign-in the browser says the tab can be closed, and the app carries on.
- **Ways to sign in at launch:**
  - email and password, with email verification required;
  - passkeys;
  - Google;
  - optional two-step codes (TOTP).

  Microsoft and LinkedIn may come later.
- **Sign-up** happens on the same pages: registration, email verification, accepting the terms.
- **Email verification is required.** The sign-in pages ask for it at sign-up, and the server checks it too: the trial needs a verified email (`email_not_verified`). The app says so and points to the email.
- **Staying signed in:** for weeks, without asking again. A session idle for 30 days ends, and 90 days is the most.
- **"Sign in again"** appears when the sign-in can't be renewed. A live interview already running keeps going regardless.
- **Sign out** forgets the sign-in on this computer and keeps the device registered.
- **Password, two-step codes and signed-in sessions** are managed on the account pages in the browser, linked from the app.

## J4. This device

- **The first sign-in on a computer registers it as a device**, without the user doing anything. The app makes a key that ties the sign-in to this installation, so a stolen sign-in is useless on another machine.
- **Each account has a device limit:** 2 with no plan or on the trial, 3 on paid plans, all from the server. At the limit (`device_limit_reached`), the app shows the user's devices and lets them remove one.
- **Removing devices is capped** at 3 in 30 days (`device_removal_limit_reached`); rotating devices is a common way to share accounts. A removed device can't come back: that computer registers again as a new device.
- **Each device shows** its name, platform, app version, and when it was first and last seen.
- **The app checks at startup that it is still registered.** If it isn't (removed from another device), it registers again or explains the limit.

## J5. The free trial

- **Started by the user**, from the app, on a registered device with a verified email.
- **14 days and 30 live minutes**, with the trial's limits: shorter sessions, the fast tier only, fewer screenshots and less memory, one practice session, one debrief and one set of prepared-answer drafts ([04](04-plans-and-billing.md)).
- **Once per person and once per computer.** A second try gets `trial_already_used`, which deliberately doesn't say which of the two it was. An account that already has a plan gets `trial_not_available`.
- **When it ends,** the account has no plan: the app still signs in and keeps its history, but live sessions, practice and the AI jobs need a plan.

## J6. Before an interview

- **The documents:**

  | Document | Size | Notes |
  |---|---|---|
  | Name | 200 characters | goes with the documents, never into our rules |
  | Résumé | 50,000 characters | |
  | Job description | 30,000 characters | |
  | Notes | 5,000 characters | anything else to keep in mind |
  | Prep doc | 100,000 characters | a document prepared for this interview; when longer, the app warns and cuts it at a line break |

  - Files are read **on the device**: PDF and Word, tables included. Only the extracted text is sent.
  - Typing or pasting text is fine too. Nothing over a limit is cut silently, apart from the prep doc.
- **Automatic answering needs the résumé and the job description.** Without both, answers would be generic, so the app only answers when asked.
- **New documents mean a new interview.** Setting a new résumé, job description, name or notes wipes the interview's memory. Changing the prep doc or the preferences keeps it.
- **Preferences:**
  - **custom instructions**, up to 4,000 characters, such as "keep answers short" or "mention my Kubernetes work";
  - **the answer bank**: prepared answers, each with the phrasings it answers. The enabled ones go into every answer's context: at most 100 entries, 4,000 characters each, about 12,000 characters in all.
- **Prepared-answer drafts:** the server can draft prepared answers from the documents, as a one-shot job with a monthly quota.
- **The bank lives on the device.** Only the enabled entries are sent, for the interview.

## J7. The live interview

[03](03-live-interview.md) has the details. In short:

1. **Start a session.** The app asks for consent ("I have consent to record and transcribe this conversation") every time; it is never remembered.
2. **The server checks**, at once: a plan with live sessions, minutes left, no other live session on the account, and that the device is this user's.
3. **Another device has a live session?** The app asks: "You have a live session on *Laptop*. End it and start here?" Yes takes it over, and the other one ends, saying it was opened elsewhere.
4. **During the interview,** the overlay shows what is heard and the answers, and keeps working through network drops.
5. **Ending.** The user ends it, or a limit does: minutes, the plan's longest session, 15 minutes with nothing happening, the other device, or the account. Messages about it are discreet: no sound, no new window. Offers to top up or upgrade wait until after the call.

## J8. After an interview

- **History, on the device and encrypted.**
  - It keeps the interviews, each question and its answer, the debrief and, only if the user opts in, the transcript.
  - It can be exported as an HTML report, and deleted one interview at a time or all at once.
- **The debrief.** The server reviews an interview from its questions, answers, transcript and speaking metrics, then returns feedback. It is a one-shot job with a monthly quota. The result is kept in the local history, never on the server.

## J9. Practice: mock interviews

- **The server plays the interviewer:**
  - the user picks how many questions (1 to 10) and a focus;
  - the server asks a question, the user answers, and the server scores the answer and gives feedback;
  - then the next question, and a summary at the end.
- **It adapts:**
  - a weak answer gets one follow-up;
  - a strong one makes the next question harder;
  - a weak follow-up makes it easier.
- **Enabled prepared answers seed some of the questions**, except with a technical focus.
- **The user answers aloud or by typing.** Speech is transcribed on the device, with talk time, words per minute and fillers; only the text and those numbers go to the server. The server never hears the candidate.
- **While practice runs, the copilot is paused:** no answers, and the interviewer audio is ignored.
- **Practice costs minutes at the plan's practice rate** ([04](04-plans-and-billing.md)). Nothing from it is stored on the server.
- **No consent checkbox for practice:** there is no other person on it.

## J10. Buying, upgrading, managing billing

- **Plans and top-ups are bought in the browser.** The app asks the server for a checkout link and opens it. The provider's page takes the payment.
- **Back in the app,** the new plan and minutes appear by themselves: the server tells the connected app when the account changes. No restart, no "refresh".
- **Rules the server applies:**
  - a subscriber can't buy a second plan (`already_subscribed`); plans are changed in the billing portal;
  - top-ups need a plan that has minutes (`no_entitlement`);
  - where no payment provider is set up, purchases answer `billing_unavailable`.
- **The billing portal**, in the browser, changes the plan, the payment method and cancels. Opening it needs this registered device.
- **Never mid-call.** An offer to buy only ever appears outside a live session.

## J11. When minutes run low or out

1. **A quiet warning** when 10 minutes are left, and again at 2.
2. **A 30-second notice** before the session ends for lack of minutes. An answer already being written may finish.
3. **The session ends**, and after the call the app offers a top-up or an upgrade.

Without minutes, a new session doesn't start: the app says so and offers the same choices.

## J12. Account, trust and the edges

- **Suspended account** (fraud or abuse, after review): everything is refused at once, and a live session ends saying the account is suspended. The app shows the state; there is nothing to retry.
- **Deleting the account:**
  - from the app; the server then ends sessions, cancels the subscription, deletes the sign-in, and purges the account within 30 days;
  - accounting records stay, pseudonymized, as the law requires;
  - local data is the user's to delete from the app.
- **Exporting:** the app exports what is on the device, and the server exports account, usage and billing data.
- **Usage history:** sessions and minutes, from the server. The minutes ledger shows every grant, purchase, debit, refund and expiry.
