// The deep round over Word files (3.10, 2026-11-14), with v1 as the judge: random documents python-docx wrote, each
// read by v1's own context_store._extract_docx (scripts/v1-docx-cases.py runs v1's function as it is, and keeps its
// answers in fixtures/v1-docx-cases.json). The app must read every one exactly as v1 does; the documents must hold
// every feature the generator makes, and v1's answers every kind of line a Word file can give.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { normalizeText } from '../../src/main/documents/document-file';
import { docxText } from '../../src/renderer/documents/extract';
import { docxOfDocument } from './document-fixtures';

interface V1Case {
  name: string;
  features: string[];
  documentXml: string;
  v1: string;
}

const judged = JSON.parse(readFileSync(new URL('./fixtures/v1-docx-cases.json', import.meta.url), 'utf8')) as {
  seed: number;
  cases: V1Case[];
};

/** What one line of v1's answer is. */
function kindOf(line: string): string {
  if (line.length === 0) return 'an empty line';
  if (line.includes(' | ')) return 'a row of several cells';
  return 'a line of its own';
}

describe("Word files as v1's own reader reads them", () => {
  it.each(judged.cases.map((c) => [c.name, c] as const))('%s reads as v1 reads it', async (_, c) => {
    const text = await docxText(docxOfDocument(c.documentXml));
    expect(text).toBe(c.v1);
    // And what the app keeps of it is what it keeps of v1's.
    expect(normalizeText(text)).toBe(normalizeText(c.v1));
  });

  it('the documents hold every feature the generator makes, several times over', () => {
    const seen = new Map<string, number>();
    for (const c of judged.cases) for (const f of c.features) seen.set(f, (seen.get(f) ?? 0) + 1);

    for (const feature of [
      'paragraph',
      'empty paragraph',
      'tab',
      'line break',
      'table',
      'empty cell',
      'a repeated text',
      'a cell of two paragraphs',
      'merged across',
      'merged down',
      'merged across and down',
    ])
      expect(seen.get(feature) ?? 0, feature).toBeGreaterThanOrEqual(3);
  });

  it("v1's answers hold every kind of line a Word file gives", () => {
    const lines = judged.cases.flatMap((c) => c.v1.split('\n'));
    const kinds = new Set(lines.map(kindOf));

    expect([...kinds].sort()).toEqual(['a line of its own', 'a row of several cells', 'an empty line']);
    expect(lines.some((l) => l.includes('\t'))).toBe(true);
    // A merged cell is kept once: no row repeats a cell beside itself.
    for (const line of lines.filter((l) => l.includes(' | '))) {
      const cells = line.split(' | ');
      cells.slice(1).forEach((cell, i) => expect(cell === cells[i] && !line.includes('a | b')).toBe(false));
    }
    // Some answers are nothing at all (a document of empty paragraphs and cells), most are something.
    expect(judged.cases.filter((c) => c.v1.length > 0).length).toBeGreaterThan(judged.cases.length / 2);
  });
});
