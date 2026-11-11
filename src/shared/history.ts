// History (3.9, v1's db.py and history.py): each interview kept on this computer, encrypted, with the answers it was
// given and, when the user keeps transcripts, the interviewer's words; and its debrief, asked of the server (the 3.4
// jobs) and kept here too. Nothing of it goes anywhere but for a debrief the user asks for.
import { z } from 'zod';

/** One interview in the list: what it was and what it holds. */
export interface InterviewSummary {
  id: number;
  /** Epoch ms. */
  startedAt: number;
  endedAt: number | null;
  /** The candidate's name and the role, from the documents at its start; empty when there were none. */
  candidate: string;
  role: string;
  /** Why it ended (a `SessionEndReasons` value), or null while unknown. */
  endReason: string | null;
  answers: number;
  lines: number;
  hasDebrief: boolean;
}

/** One question and the answer it got, as the overlay showed it. */
export interface HistoryAnswer {
  id: number;
  askedAt: number;
  /** The answer's kind (`AnswerKind`). */
  kind: number;
  question: string;
  answer: string;
}

export interface TranscriptLine {
  at: number;
  speaker: 'interviewer' | 'candidate';
  text: string;
}

export interface InterviewView extends InterviewSummary {
  qa: HistoryAnswer[];
  transcript: TranscriptLine[];
  debrief: DebriefView | null;
}

/** An interview's id, as a window names it. */
export const interviewIdSchema = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);

const text = (max: number) => z.string().max(max);
const score = z.number().int().min(1).max(10).nullable();

/**
 * The debrief the server writes (backend 3.4, v1's `parse_debrief`, version 1), checked before it is kept or shown:
 * the server is trusted, its content is the model's. Bounded far past what the server makes.
 */
export const debriefSchema = z.object({
  version: z.number().int(),
  raw: z.boolean(),
  summary: text(20_000),
  scores: z
    .object({
      clarity: score,
      structure: score,
      technical: score,
      delivery: score,
      filler: score,
    })
    .nullable(),
  strengths: z.array(text(4_000)).max(20),
  improvements: z.array(text(4_000)).max(20),
  strongerAnswers: z.array(z.object({ question: text(4_000), answer: text(20_000) })).max(20),
  followUps: z.array(text(4_000)).max(20),
  thankYouEmail: text(20_000),
  metrics: z
    .object({
      words: z.number().int().min(0),
      fillers: z.number().int().min(0),
      fillersPer100Words: z.number().min(0),
      turns: z.number().int().min(0),
    })
    .nullable(),
});
export type DebriefResult = z.infer<typeof debriefSchema>;

export interface DebriefView extends DebriefResult {
  /** When it was kept, epoch ms. */
  createdAt: number;
}

/** The server's limits for a debrief (backend `StartDebriefValidator`). */
export const debriefLimits = {
  name: 200,
  role: 200,
  questions: 200,
  question: 4_000,
  answer: 20_000,
  lines: 5_000,
  line: 4_000,
} as const;

/** What `POST /api/v1/jobs/debrief` takes. */
export interface DebriefRequest {
  name: string | null;
  role: string | null;
  questions: { question: string; answer: string }[];
  transcript: { speaker: 'interviewer' | 'candidate'; text: string }[];
}

/** The first `max` characters, one fewer rather than half of a surrogate pair. */
export function cut(value: string, max: number): string {
  if (value.length <= max) return value;
  const end = /[\uD800-\uDBFF]/.test(value[max - 1] ?? '') ? max - 1 : max;
  return value.slice(0, end);
}

/**
 * An interview as a debrief is asked for: within the server's limits, so a long one is never refused. Past 200
 * questions the first are sent (the model reads v1's first 40); past 5,000 lines the start and the end, the middle
 * left out, as v1 left it out. Null when nothing was recorded: the server would refuse it.
 */
export function debriefRequestOf(interview: InterviewView): DebriefRequest | null {
  const questions = interview.qa
    .filter((qa) => qa.question.trim() !== '')
    .slice(0, debriefLimits.questions)
    .map((qa) => ({
      question: cut(qa.question, debriefLimits.question),
      answer: cut(qa.answer, debriefLimits.answer),
    }));
  let lines = interview.transcript.filter((line) => line.text.trim() !== '');
  if (lines.length > debriefLimits.lines) {
    const half = debriefLimits.lines / 2;
    lines = [...lines.slice(0, half), ...lines.slice(-half)];
  }
  const transcript = lines.map((line) => ({ speaker: line.speaker, text: cut(line.text, debriefLimits.line) }));
  if (questions.length === 0 && transcript.length === 0) return null;
  return {
    name: interview.candidate.trim() ? cut(interview.candidate.trim(), debriefLimits.name) : null,
    role: interview.role.trim() ? cut(interview.role.trim(), debriefLimits.role) : null,
    questions,
    transcript,
  };
}

/** The role an interview is listed by: the job description's first line, as Home names the job. */
export function roleOf(jobDescription: string): string {
  const first = jobDescription.split('\n').find((line) => line.trim() !== '') ?? '';
  return cut(first.trim(), 120);
}
