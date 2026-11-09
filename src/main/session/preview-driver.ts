// A development stand-in for the hub. It plays a short interview into the overlay, and answers what is typed, so the
// UI can be built and checked without a server. Only `npm run dev:preview` uses it: a packaged build never does
// (index.ts). The real driver is hub-driver.ts.
import { randomUUID } from 'node:crypto';
import { AnswerKind, AskMode, SessionEndReasons, SpeechStates, ErrorCodes } from '../../shared/contracts/sotto-contracts';
import type { CommandResult } from '../../shared/ipc';
import type { LiveAction, LiveEvent } from '../../shared/live/reducer';
import type { SessionCommand, SessionDriver } from './session-controller';

interface ScriptedAnswer {
  question: string;
  kind: AnswerKind;
  instruction?: string | null;
  text: string;
  /** Stop streaming after this share of the text: the next question will take over. */
  cutAt?: number;
}

const kindOfMode: Record<AskMode, AnswerKind> = {
  [AskMode.Question]: AnswerKind.Typed,
  [AskMode.Tip]: AnswerKind.Tip,
  [AskMode.Study]: AnswerKind.Study,
  [AskMode.Result]: AnswerKind.Result,
};

// The diagram names a title, as a model may: Mermaid draws it as an SVG <title>, a tooltip the overlay must drop (the
// app tests check it, tests/app).
const urlShortener =
  "So it's ***read-heavy***, maybe a hundred reads per write. I'd put a ***cache*** in front of a ***key-value store***, " +
  'and make the short codes from a ***counter in base 62***, so they never collide.\n\n' +
  '```mermaid\nflowchart LR\n  accTitle: How a short link is served\n' +
  '  U[User] --> LB[Load balancer] --> API[API servers]\n  API --> C[(Cache)]\n' +
  '  API --> DB[(Key-value store)]\n  API --> ID[ID generator]\n```\n\n' +
  "Then I'd talk about ***expiry*** and ***analytics*** if we have time.";

const hotKeys =
  "For ***hot keys*** I'd first add a small ***local cache*** on each API server with a short TTL, so the busiest codes " +
  "never reach the shared cache. If one key is still too hot, I'd ***replicate*** it across a few cache nodes and read " +
  'from one at random.';

const cacheDown =
  "Then reads fall through to the ***key-value store***, so I'd size it to take the full read load for a while, and put " +
  'a ***circuit breaker*** in front of the cache so we degrade instead of falling over.';

const cannedByMode: Record<AskMode, string> = {
  [AskMode.Question]:
    'Sure, here is the answer. In a real session it streams in from the server, with the ***key words*** in amber.',
  [AskMode.Tip]: 'Sure. Here is the same answer, ***shorter***, the way the tip asked.',
  [AskMode.Study]:
    '**What it is.** A study explainer arrives here, longer than an answer.\n\n' +
    '- **The point.** Lists and short bold lead-ins.\n- **Where it goes.** Never into the interview\'s memory.',
  [AskMode.Result]:
    'That means the interpreter is older than ***Python 3.10***. Swap the hint for ***Optional***:\n\n' +
    '```python\nfrom typing import Optional\n\ndef first_unique(s: str) -> Optional[str]:\n```\n\nThen run it again.',
};

const deltaEveryMs = 45;
const charsPerDelta = 14;

export class PreviewDriver implements SessionDriver {
  private seq = 0;
  private timers: ReturnType<typeof setTimeout>[] = [];
  private dispatch: (action: LiveAction) => void = () => {};
  private auto = true;
  private paused = false;
  private ended = false;
  private heard = '';
  private lastQuestion = '';
  private answers = 0;

  async start(dispatch: (action: LiveAction) => void): Promise<CommandResult> {
    this.dispatch = dispatch;
    dispatch({ type: 'starting' });

    let t = 500;
    this.at(t, () => this.status());
    t = this.speak(t + 900, [
      ['Okay, great.', false],
      ['Okay, great. Next one.', true],
      ["Okay, great. Next one. Can you walk me through how you'd design", false],
      ["Okay, great. Next one. Can you walk me through how you'd design a URL shortener, like, for", false],
      ["Okay, great. Next one. Can you walk me through how you'd design a URL shortener, like, for millions of users a day?", true],
    ]);
    t = this.answer(t + 1500, { question: 'Design a URL shortener for millions of users a day.', kind: AnswerKind.Spoken, text: urlShortener });
    t = this.speak(t + 3500, [
      ['Sorry, before that:', false],
      ['Sorry, before that: how would you handle hot keys in the cache?', true],
    ]);
    t = this.answer(t + 1500, { question: 'How would you handle hot keys in the cache?', kind: AnswerKind.Spoken, text: hotKeys, cutAt: 0.45 });
    t = this.speak(t + 300, [
      ['And if the cache goes down', false],
      ['And if the cache goes down completely?', true],
    ]);
    this.answer(t + 1200, { question: 'What happens if the cache goes down completely?', kind: AnswerKind.Spoken, text: cacheDown });
    return { ok: true };
  }

  async command(command: SessionCommand): Promise<CommandResult> {
    if (this.ended) {
      return { ok: false, code: ErrorCodes.Session.SessionExpired, message: 'The session is over. Start a new one.' };
    }
    switch (command.type) {
      case 'ask': {
        const tip = command.mode === AskMode.Tip;
        this.answer(250, {
          question: tip ? this.lastQuestion || 'The last question' : command.text,
          kind: kindOfMode[command.mode],
          instruction: tip ? command.text : null,
          text: cannedByMode[command.mode],
        });
        return { ok: true };
      }
      case 'trigger':
        this.answer(250, {
          question: command.text ?? (this.heard || this.lastQuestion || 'The last question'),
          kind: command.text ? AnswerKind.Typed : AnswerKind.Spoken,
          text: cannedByMode[AskMode.Question],
        });
        return { ok: true };
      case 'setMode':
        this.auto = command.auto ?? this.auto;
        this.paused = command.paused ?? this.paused;
        this.status();
        return { ok: true };
      case 'clear':
        this.emit({ name: 'cleared', e: this.stamp() });
        return { ok: true };
      case 'clearHeard':
        this.heard = '';
        return { ok: true };
      case 'endSession':
        this.end(SessionEndReasons.User);
        return { ok: true };
    }
  }

  dispose(): void {
    for (const timer of this.timers) clearTimeout(timer);
    this.timers = [];
  }

  private end(reason: string): void {
    this.dispose();
    this.ended = true;
    this.emit({ name: 'sessionEnded', e: { ...this.stamp(), Reason: reason } });
  }

  /** Schedules partial and final transcripts, one every 600 ms; returns when the last one lands. */
  private speak(start: number, lines: [string, boolean][]): number {
    let t = start;
    for (const [text, final] of lines) {
      this.at(t, () => this.transcript(text, final));
      t += 600;
    }
    return t;
  }

  /** Schedules an answer's start, its pieces and its end; returns when it ends (or stops streaming). */
  private answer(start: number, a: ScriptedAnswer): number {
    const id = randomUUID();
    const stopAt = a.cutAt ? Math.floor(a.text.length * a.cutAt) : a.text.length;
    let t = start;
    this.at(t, () => {
      this.lastQuestion = a.question;
      this.heard = '';
      this.answers += 1;
      this.emit({
        name: 'answerStart',
        e: { ...this.stamp(), AnswerId: id, Question: a.question, Kind: a.kind, Instruction: a.instruction ?? null },
      });
    });
    for (let i = 0; i < stopAt; i += charsPerDelta) {
      t += deltaEveryMs;
      const piece = a.text.slice(i, Math.min(i + charsPerDelta, stopAt));
      this.at(t, () => this.emit({ name: 'answerDelta', e: { ...this.stamp(), AnswerId: id, Text: piece } }));
    }
    if (a.cutAt) {
      // The server says so when a newer question takes over; the overlay marks it Stopped early.
      this.at(t + 1800, () => this.emit({ name: 'answerCancelled', e: { ...this.stamp(), AnswerId: id } }));
    } else {
      t += deltaEveryMs;
      this.at(t, () => this.emit({ name: 'answerDone', e: { ...this.stamp(), AnswerId: id } }));
    }
    return t;
  }

  private status(): void {
    this.emit({ name: 'status', e: { ...this.stamp(), Auto: this.auto, Paused: this.paused, Stt: SpeechStates.Ok } });
  }

  private transcript(text: string, final: boolean): void {
    if (this.paused) return;
    this.heard = text;
    if (final) this.emit({ name: 'transcriptFinal', e: { ...this.stamp(), Text: text } });
    else this.emit({ name: 'transcriptPartial', e: { ...this.stamp(), Text: text } });
  }

  private stamp(): { Seq: number; AtMs: number } {
    this.seq += 1;
    return { Seq: this.seq, AtMs: Date.now() };
  }

  private emit(event: LiveEvent): void {
    this.dispatch({ type: 'event', event });
  }

  private at(ms: number, run: () => void): void {
    this.timers.push(setTimeout(run, ms));
  }
}
