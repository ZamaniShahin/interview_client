// What may cross between the windows and main. Main checks every payload against these schemas and checks the
// sender (src/main/ipc/register.ts): a renderer is untrusted input. The channel names are in ipc-channels.ts.
import { z } from 'zod';
import { AskMode } from './contracts/sotto-contracts';
import { screenshotHintMaxChars, screenshotIdSchema } from './screenshots';
import { askLimits } from './text-limits';

export { IpcChannels } from './ipc-channels';

const askModeSchema = z.union([
  z.literal(AskMode.Question),
  z.literal(AskMode.Tip),
  z.literal(AskMode.Study),
  z.literal(AskMode.Result),
]);

/** The longest anything typed may be (a pasted Result); each mode's own limit is checked below. */
const maxTyped = askLimits[AskMode.Result];

export const overlayCommandSchema = z
  .discriminatedUnion('type', [
    z.object({ type: z.literal('ask'), mode: askModeSchema, text: z.string().trim().min(1).max(maxTyped) }),
    /** Answer now: the text if there is one, otherwise what was heard (or the same question again). */
    z.object({ type: z.literal('trigger'), text: z.string().max(askLimits[AskMode.Question]).nullable() }),
    z.object({ type: z.literal('setMode'), auto: z.boolean().nullable(), paused: z.boolean().nullable() }),
    z.object({ type: z.literal('clear') }),
    z.object({ type: z.literal('clearHeard') }),
    z.object({ type: z.literal('endSession') }),
    /** Look at an earlier answer, or follow the newest (null). Local: nothing goes to the server. */
    z.object({ type: z.literal('view'), index: z.number().int().min(0).nullable() }),
    /**
     * Capture a screen region (3.6): attached for the next answer, or in AUTO answered at once, with what was typed
     * as its note (`hint`). Main takes the picture: the overlay never sees the screen.
     */
    z.object({ type: z.literal('capture'), hint: z.string().trim().max(screenshotHintMaxChars).nullable() }),
    /** Take back a screenshot attached for the next answer. */
    z.object({ type: z.literal('detachScreenshot'), id: screenshotIdSchema }),
    /** Attach a kept screenshot again, so the model sees it again rather than only its notes (＋ under an answer). */
    z.object({ type: z.literal('reattachScreenshot'), id: screenshotIdSchema }),
  ])
  .superRefine((command, ctx) => {
    if (command.type === 'ask' && command.text.length > askLimits[command.mode]) {
      ctx.addIssue({ code: 'custom', path: ['text'], message: 'too_long' });
    }
  });
export type OverlayCommand = z.infer<typeof overlayCommandSchema>;

export const overlayWindowActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('compact'), on: z.boolean() }),
  z.object({ type: z.literal('hide') }),
  /** From the ◢ grip: the overlay has no OS resize border (stealth rule 5). */
  z.object({
    type: z.literal('resize'),
    width: z.number().int().min(360).max(4096),
    height: z.number().int().min(200).max(4096),
  }),
  /** Esc in the overlay: give the keyboard back, so typing goes to the call app again. */
  z.object({ type: z.literal('releaseKeyboard') }),
]);
export type OverlayWindowAction = z.infer<typeof overlayWindowActionSchema>;

/**
 * What an answer's Copy puts on the clipboard: a code block's source as the model wrote it. An answer is far shorter
 * than the limit; the limit only keeps a renderer from handing main anything at all.
 */
export const copyTextSchema = z.string().min(1).max(100_000);

/** A screenshot the overlay asks to see, by its id (3.6). */
export const screenshotRequestSchema = screenshotIdSchema;

/** The hotkeys main hands to the overlay to finish (3.6: the capture takes what was typed as its note). */
export type OverlayHotkey = 'capture';

/** The first-run notice's version the user read: main keeps it only when it is the current one. */
export const acknowledgeNoticeSchema = z.object({ version: z.number().int().positive() }).strict();

export const soundCheckActionSchema = z.enum(['start', 'stop']);
export type SoundCheckAction = z.infer<typeof soundCheckActionSchema>;

/** Test hiding: show the overlay with its test card, hide it, or record that the share left it out. */
export const hidingTestActionSchema = z.enum(['show', 'hide', 'hidden']);
export type HidingTestAction = z.infer<typeof hidingTestActionSchema>;

export const signInPageActionSchema = z.enum(['open', 'copy']);
export type SignInPageAction = z.infer<typeof signInPageActionSchema>;

export const appWindowActionSchema = z.enum(['minimize', 'maximize', 'close']);
export type AppWindowAction = z.infer<typeof appWindowActionSchema>;

/**
 * The consent box is part of the request: no session starts without it, and it is never remembered (§F4). `takeOver`
 * is the user's yes to ending the account's session on another device (`session_active_elsewhere`); never by default.
 */
export const startSessionSchema = z.object({ consent: z.literal(true), takeOver: z.boolean().optional() });
export type StartSessionRequest = z.infer<typeof startSessionSchema>;

/** What a command returns to a window: it worked, or a code from `ErrorCodes` and plain words. */
export type CommandResult = { ok: true } | { ok: false; code: string; message: string };

/** The ids the server's catalog uses (`credits_monthly`, `topup_100`): checked here only for shape; the server decides. */
const productIdSchema = z.string().regex(/^[a-z0-9_]{1,64}$/);

/** A plan or a top-up, exactly one, as `POST /api/v1/billing/checkout` takes it. */
export const purchaseSchema = z.union([
  z.object({ planId: productIdSchema }).strict(),
  z.object({ topUpId: productIdSchema }).strict(),
]);
export type PurchaseRequest = z.infer<typeof purchaseSchema>;

/** A device id as the server writes it (a UUID): it goes into a request path, so nothing else may. */
export const deviceIdSchema = z.uuid();

/** What deleting the account takes (Q19): something typed, no longer than an email can be; the server checks it is the email. */
export const deleteConfirmSchema = z.string().trim().min(1).max(320);

/** The purchase being waited for: open its page again, or stop waiting (F8 · b). */
export const paymentActionSchema = z.enum(['open', 'cancel']);
export type PaymentAction = z.infer<typeof paymentActionSchema>;

/** What the window has said and puts away: the after-call offer (F8 · a), or the quiet line (F8 · c). */
export const dismissSchema = z.enum(['offer', 'notice']);
export type DismissTarget = z.infer<typeof dismissSchema>;
