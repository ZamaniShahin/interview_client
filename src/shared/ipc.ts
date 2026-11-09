// What may cross between the windows and main. Main checks every payload against these schemas and checks the
// sender (src/main/ipc/register.ts): a renderer is untrusted input. The channel names are in ipc-channels.ts.
import { z } from 'zod';
import { AskMode } from './contracts/sotto-contracts';
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
