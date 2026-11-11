// The preview's sample documents (`npm run dev:preview`): a candidate as the canvas shows one, kept in memory only.
import type { BankEntryInput } from '../../shared/answer-bank';
import type { DocumentField } from '../../shared/documents';

/** A prepared answer the scripted interview asks for ("hot keys in the cache"), so the 📌 card shows (3.8). */
export const previewBank: BankEntryInput[] = [
  {
    id: null,
    phrasings: ['How would you handle hot keys?', 'What do you do about a hot key in a cache?'],
    answer:
      'At Northwind one merchant made 30% of our reads. I added a short local cache on each API server, then spread ' +
      'that key across three cache nodes. Cache CPU dropped by half.',
    enabled: true,
  },
];

export const previewDocuments: Record<DocumentField, string> = {
  name: 'Sam Rivera',
  resume:
    'Backend engineer, 7 years. Northwind (2021–now): payments platform in Go and Kafka. Moved retries to idempotent ' +
    'keys, which cut duplicate charges to zero. Before that: Contoso, order pipeline in C#.',
  jobDescription:
    'Senior Backend Engineer, Payments\nYou will own the ledger service and its reconciliation jobs, on call one week ' +
    'in six.',
  notes: 'Interviewer: Priya, platform lead. Ask about on-call.',
};
