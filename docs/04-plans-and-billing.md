# 04 — Plans and billing

What Sotto sells, how use is counted, and what the client shows. **Every number here is a server-side default**, for orientation only. The server sends the real values (the entitlements and the client configuration); never hard-code them, and never enforce anything with them.

## How it's sold

- **Accounts, not license keys.** A user signs in to an account, and the account has a plan. The server checks the plan on every action; the app's copy of it only drives what the screens show.
- **Subscriptions with live minutes**, plus **top-up packs**. Prices aren't decided yet (Q3, [08](08-open-questions.md)). For orientation, LockedIn AI sells 400 minutes a month for $69.99 and unlimited for $119.99.
- **A plan given by Sotto** (2.16): our staff can give an email a plan with no payment, for ourselves and for testers (the server's licence registry). It goes on the account once that email is verified. The app shows it as "given by Sotto", with its end if it has one, and offers nothing to buy, no trial and no top-up while it lasts. A licence revoked or ended leaves the account with no plan.
- **Personal accounts** first: one user, one seat. Team plans (an organization with several seats and an admin who invites people) come later.

## The plans (initial defaults)

| | Trial | Credits (monthly) | Unlimited (fair use) | Top-up pack |
|---|---|---|---|---|
| Live minutes | 30, once | 400 a month | not counted; fair use up to 60 h a month | + N minutes |
| Longest session | 10 min | 120 min | 120 min | — |
| Quality tiers | fast | fast + smart | fast + smart | — |
| Screenshots per question / per session | 5 / 10 | 5 / 100 | 5 / 100 | — |
| Interview memory (turns) | 30 | 100 | 100 | — |
| Practice | 1 session | at half the minute rate | included | — |
| Debriefs / answer drafts per month | 1 / 1 | 30 / 30 | 60 / 60 | — |
| Devices | 2 | 3 | 3 | — |

- **The trial lasts 14 days** and is started by the user ([02](02-journeys.md) J5). No plan at all still allows signing in, 2 devices and starting the trial; nothing that costs money works.
- **Open:** whether unused monthly minutes roll over (default: no), how long top-ups last (default: 12 months), and a yearly price.

## What is counted

| What | How | Charged to the user |
|---|---|---|
| Live session time | in minutes, every minute while the session is open, **paused included**. A started minute counts as a whole one | from minutes, on the trial and minutes plans; against the fair-use cap on Unlimited |
| Practice time | in minutes, at the plan's practice rate | as above |
| Debriefs and answer drafts | how many this month | as a quota, not money |
| AI usage (tokens, images, listening time) | by the server, for its own costs | never shown as money; it drives the session's cost ceiling and fair use |

- **A session never starts without at least a minute** (or fair use left on Unlimited).
- **A running interview beats perfect counting.** If our side has a problem mid-call, the session carries on, and the minutes are settled afterwards.

## Minutes

- **Minutes come in lots,** each with its own expiry:
  - a plan period's lot lasts until the period ends;
  - the trial's lasts as long as the trial;
  - a top-up's lasts 12 months.
- **The soonest-expiring minutes are used first.**
- **A new period's minutes replace what was left of the last one.** There is no rollover (the default of Q3).
- **When no plan with minutes is in effect,** plan minutes go and bought minutes stay. A suspension stops minutes from being used, but doesn't take them away.
- **The app can show:**
  - the minutes usable now;
  - each lot: where it came from (trial, plan, purchase, adjustment), how much is left, and when it expires;
  - the ledger, newest first: every grant, purchase, debit, refund, expiry and support adjustment, with the balance after each.

## The account's state

| State | Means | The app |
|---|---|---|
| none | no plan | offers the trial (if not used) and the plans |
| trialing | in the trial | shows the days and minutes left |
| active | a paid plan | shows the plan, the period's end and the minutes |
| past due | a payment failed, or a period ended without renewal: **3 days' grace**, then none | a calm banner, and the billing portal |
| suspended | fraud or abuse, after review | the state; nothing to retry |

- **A cancelled plan runs to the end of the period it was paid for.**
- **An upgrade applies at once.** A downgrade applies from the next answer of a running session.
- **Changes reach the app by themselves.** After a purchase, a renewal or a cancellation, the server tells the connected app, and the screens update without a restart.

## One live session per account

- **Only one live session runs at a time for an account**, on any of its devices. This is what makes sharing an account pointless during an interview.
- **Starting a second one asks first:** "You have a live session on *Laptop*. End it and start here?". Yes takes over, and the other session ends, saying it was opened elsewhere.
- **A session whose device crashed frees the account** after about a minute and a half.

## Devices

- **A limit per account, from the plan** (2 or 3), and at most **3 removals in 30 days**. Removing a device revokes it at once, for good.
- **The app lists the devices** (name, platform, app version, first and last seen), so the user can remove one when the limit is reached.

## Buying

- **In the browser.** The app gets a checkout link from the server and opens it; the payment provider's page takes the card. **We never see card details.**
- **The billing portal**, also in the browser, changes the plan or the payment method and cancels. Opening it needs this registered device.
- **The payment provider is Paddle** (Q1, decided 2026-11-08), as merchant of record: it sells on Sotto's behalf and handles the sales taxes, so its name is on the checkout and the receipt. The app only ever opens the links the server gives it.
- **What the server refuses:**
  - a second plan for a subscriber (`already_subscribed`): plans change in the portal;
  - a top-up without a plan that has minutes (`no_entitlement`);
  - any purchase where no provider is set up (`billing_unavailable`).
- **Never during a call.** Offers to buy or upgrade wait until the live session is over.

## Abuse, and why the rules look like this

The limits on devices, removals, sessions per account and trials exist because these products are shared and resold.

- **Signals the server watches:**
  - frequent takeovers;
  - use from many countries in a day;
  - all-day use;
  - removing devices at the cap;
  - repeated attempts to make answers repeat our rules;
  - chargebacks.
- **What follows, after review by our staff:** a warning, then limits, then suspension.
- **The client plays no part** beyond showing the states that result.
