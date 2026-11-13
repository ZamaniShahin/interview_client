// A development stand-in for the hub. It plays a short interview into the overlay, and answers what is typed, so the
// UI can be built and checked without a server. Only `npm run dev:preview` uses it: a packaged build never does
// (index.ts). The real driver is hub-driver.ts.
import { randomUUID } from 'node:crypto';
import {
  AnswerKind,
  AskMode,
  ErrorCodes,
  InterviewTypes,
  SessionEndReasons,
  SpeechStates,
  type InterviewType,
} from '../../shared/contracts/sotto-contracts';
import type { CommandResult } from '../../shared/ipc';
import type { LiveAction, LiveEvent } from '../../shared/live/reducer';
import { PreviewPractice } from './preview-practice';
import type { SessionCommand, SessionDriver } from './session-controller';

interface ScriptedAnswer {
  question: string;
  kind: AnswerKind;
  instruction?: string | null;
  text: string;
  /** Stop streaming after this share of the text: the next question will take over. */
  cutAt?: number;
  /** The screenshots it reads (3.6). */
  screenshotIds?: string[];
}

/** What the preview answers about a screenshot. */
const fromScreen =
  'From your screenshot: this is ***Two Sum***. Keep a ***hash map*** of each number to its index, and for every ' +
  'number look up its ***complement*** first:\n\n```python\ndef two_sum(nums, target):\n    seen = {}\n' +
  '    for i, n in enumerate(nums):\n        if target - n in seen:\n            return [seen[target - n], i]\n' +
  '        seen[n] = i\n```\n\nThat is ***O(n)*** time and space.';

/** Screenshots a question can take in the preview, as the server's plans say (5). */
const previewMaxAttachments = 5;

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
    "- **The point.** Lists and short bold lead-ins.\n- **Where it goes.** Never into the interview's memory.",
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
  private interviewType: InterviewType = InterviewTypes.Technical;
  private ended = false;
  private heard = '';
  private lastQuestion = '';
  private answers = 0;
  /** The screenshots attached for the next answer (3.6). */
  private attached: string[] = [];
  /** The practice interviewer (the server's 3.3, scripted). */
  private readonly practice = new PreviewPractice({
    emit: (event) => this.emit(event),
    stamp: () => this.stamp(),
    at: (ms, run) => this.at(ms, run),
  });

  /** `interview: false` for a practice session: nobody speaks, the practice interviewer asks. */
  constructor(private readonly options: { interview?: boolean } = {}) {}

  async start(dispatch: (action: LiveAction) => void): Promise<CommandResult> {
    this.dispatch = dispatch;
    dispatch({ type: 'starting' });
    if (this.options.interview === false) {
      this.at(300, () => this.status());
      return { ok: true };
    }

    let t = 500;
    this.at(t, () => this.status());
    t = this.speak(t + 900, [
      ['Okay, great.', false],
      ['Okay, great. Next one.', true],
      ["Okay, great. Next one. Can you walk me through how you'd design", false],
      ["Okay, great. Next one. Can you walk me through how you'd design a URL shortener, like, for", false],
      [
        "Okay, great. Next one. Can you walk me through how you'd design a URL shortener, like, for millions of users a day?",
        true,
      ],
    ]);
    t = this.answer(t + 1500, {
      question: 'Design a URL shortener for millions of users a day.',
      kind: AnswerKind.Spoken,
      text: urlShortener,
    });
    t = this.speak(t + 3500, [
      ['Sorry, before that:', false],
      ['Sorry, before that: how would you handle hot keys in the cache?', true],
    ]);
    t = this.answer(t + 1500, {
      question: 'How would you handle hot keys in the cache?',
      kind: AnswerKind.Spoken,
      text: hotKeys,
      cutAt: 0.45,
    });
    t = this.speak(t + 300, [
      ['And if the cache goes down', false],
      ['And if the cache goes down completely?', true],
    ]);
    this.answer(t + 1200, {
      question: 'What happens if the cache goes down completely?',
      kind: AnswerKind.Spoken,
      text: cacheDown,
    });
    return { ok: true };
  }

  async command(command: SessionCommand): Promise<CommandResult> {
    if (this.ended) {
      return { ok: false, code: ErrorCodes.Session.SessionExpired, message: 'The session is over. Start a new one.' };
    }
    // The copilot is paused while practice runs, as the server's is (`practice_running`).
    if (
      this.practice.running &&
      (command.type === 'ask' || command.type === 'trigger' || command.type === 'screenshotQuery')
    ) {
      return {
        ok: false,
        code: ErrorCodes.Session.PracticeRunning,
        message: 'A practice interview is running: stop it to use the copilot.',
      };
    }
    switch (command.type) {
      case 'mockStart':
        return this.practice.start(command.count, command.focus, command.questions);
      case 'mockAnswer':
        return this.practice.answer(command.text);
      case 'mockNext':
        return this.practice.next();
      case 'mockStop':
        return this.practice.stop();
      case 'ask': {
        const tip = command.mode === AskMode.Tip;
        // A typed question or Tip takes the attached screenshots, its text their note; a Result never does.
        const shots = command.mode === AskMode.Result ? [] : this.takeAttached();
        this.answer(250, {
          question: tip ? this.lastQuestion || 'The last question' : command.text,
          kind: shots.length > 0 ? AnswerKind.Screen : kindOfMode[command.mode],
          instruction: tip ? command.text : null,
          text: shots.length > 0 ? fromScreen : cannedByMode[command.mode],
          screenshotIds: shots,
        });
        return { ok: true };
      }
      case 'trigger': {
        const shots = this.takeAttached();
        this.answer(250, {
          question: command.text ?? (this.heard || this.lastQuestion || 'The last question'),
          kind: shots.length > 0 ? AnswerKind.Screen : command.text ? AnswerKind.Typed : AnswerKind.Spoken,
          text: shots.length > 0 ? fromScreen : cannedByMode[AskMode.Question],
          screenshotIds: shots,
        });
        return { ok: true };
      }
      case 'attachScreenshot':
        if (!this.attached.includes(command.id)) {
          if (this.attached.length >= previewMaxAttachments) {
            return {
              ok: false,
              code: ErrorCodes.Request.TooLarge,
              message: 'This question has all the screenshots it can take.',
            };
          }
          this.attached = [...this.attached, command.id];
        }
        this.emitAttachments();
        return { ok: true };
      case 'detachScreenshot':
        this.attached = this.attached.filter((id) => id !== command.id);
        this.emitAttachments();
        return { ok: true };
      case 'screenshotQuery': {
        const shots = [...this.takeAttached(), command.id].slice(0, previewMaxAttachments);
        this.answer(250, {
          question: command.hint ? `About the screen: ${command.hint}` : 'What is on the screen',
          kind: AnswerKind.Screen,
          text: fromScreen,
          screenshotIds: shots,
        });
        return { ok: true };
      }
      case 'setMode':
        this.auto = command.auto ?? this.auto;
        this.paused = command.paused ?? this.paused;
        this.status();
        return { ok: true };
      case 'setInterviewType':
        // The server's echo (Q47): the strip flips on it.
        this.interviewType = command.interviewType;
        this.status();
        return { ok: true };
      case 'clear':
        this.emit({ name: 'cleared', e: this.stamp() });
        if (this.attached.length > 0) this.takeAttached();
        return { ok: true };
      case 'clearHeard':
        this.heard = '';
        return { ok: true };
      case 'endSession':
        // A practice running gives its summary first, as the server's does.
        this.practice.endWithSession();
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
        e: {
          ...this.stamp(),
          AnswerId: id,
          Question: a.question,
          Kind: a.kind,
          Instruction: a.instruction ?? null,
          ScreenshotIds: a.screenshotIds ?? [],
        },
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

  /** The attached screenshots, taken by the answer about to start: none wait any more. */
  private takeAttached(): string[] {
    const shots = this.attached;
    if (shots.length === 0) return shots;
    this.attached = [];
    this.emitAttachments();
    return shots;
  }

  private emitAttachments(): void {
    this.emit({
      name: 'attachments',
      e: { ...this.stamp(), Items: this.attached.map((Id) => ({ Id })), Max: previewMaxAttachments },
    });
  }

  private status(): void {
    this.emit({
      name: 'status',
      e: {
        ...this.stamp(),
        Auto: this.auto,
        Paused: this.paused,
        Stt: SpeechStates.Ok,
        InterviewType: this.interviewType,
      },
    });
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
