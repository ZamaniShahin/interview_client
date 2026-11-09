// The preview's sample documents (`npm run dev:preview`): a candidate as the canvas shows one, kept in memory only.
import type { DocumentField } from '../../shared/documents';

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
