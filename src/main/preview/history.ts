// The preview's jobs (`npm run dev:preview`, 3.9): no server, so a debrief and prep drafts answer these after a
// moment, as the server's would (backend 3.4, v1's shapes). Development only.
import type { DebriefResult } from '../../shared/history';

/** How long the preview's debrief takes: long enough to see "Writing your debrief…". */
export const previewDebriefMs = 1_500;

export const previewDebrief: DebriefResult = {
  version: 1,
  raw: false,
  summary:
    'A steady system-design round. You framed the URL shortener well and handled the cache questions with real ' +
    'numbers from Northwind; the failure case needed a clearer fallback plan.',
  scores: { clarity: 8, structure: 7, technical: 8, delivery: null, filler: null },
  strengths: [
    'Opened the design with the read-to-write ratio before drawing anything.',
    'Used the Northwind hot-key story as evidence, with its numbers.',
  ],
  improvements: [
    'Say what happens to writes while the cache is down, not only reads.',
    'Name the trade-off of each choice in one sentence before moving on.',
  ],
  strongerAnswers: [
    {
      question: 'What happens if the cache goes down completely?',
      answer:
        'Reads fall through to the database, so first I would shed load: serve the hottest keys from a small local ' +
        'cache and rate-limit the rest. Writes are unaffected, since the database is the source of truth.',
    },
  ],
  followUps: ['How would you warm a new cache node?', 'How do you expire a short link?'],
  thankYouEmail:
    'Hi Priya,\n\nThank you for the conversation today. I enjoyed working through the shortener design with you, ' +
    'and the cache questions in particular.\n\nBest,\nSam',
  metrics: null,
};

/** The preview's prep drafts: two likely questions, with answers in the candidate's voice. */
export const previewDrafts: { drafts: { phrasings: string[]; answer: string }[] } = {
  drafts: [
    {
      phrasings: ['Why do you want to work on payments?', 'What draws you to fintech?'],
      answer:
        'Money moving is a promise kept to someone. At Northwind I took duplicate charges to zero with idempotency ' +
        'keys, and I want to keep doing that kind of work, where correctness is the product.',
    },
    {
      phrasings: ['How do you handle being on call?'],
      answer:
        'I write the runbook while I fix the thing. At Northwind our pages dropped by a third once every alert had a ' +
        'first step written next to it.',
    },
  ],
};
