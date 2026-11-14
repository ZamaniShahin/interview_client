/// <reference lib="dom" />
// Documents read from files in the built app, against the preview (3.10): main's file dialog stood in for, the file
// read in the hidden documents window by pdf.js and mammoth under the app's own Content Security Policy, its text shown
// in Prepare to look over, then kept. And the prep doc, cut as v1 cut it. Only the dialog is played: the rest is the app.
//
//   node scripts/app-tests.mjs      builds the preview into out/, then runs this (SOTTO_APP=1); Windows only
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ElectronApplication, Page } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { docxOf, pdfOf } from '../unit/document-fixtures';
import { launch, page, runAppTests as run } from './windows';

describe.skipIf(!run)('documents from files in the built app, against the preview (3.10)', { timeout: 90_000 }, () => {
  let app: ElectronApplication;
  let home: Page;
  let folder: string;

  /** The next file the dialog "picks": main's dialog answers with this path. */
  async function willPick(name: string, bytes: Uint8Array): Promise<void> {
    const path = join(folder, name);
    writeFileSync(path, bytes);
    await app.evaluate(({ dialog }, picked) => {
      dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [picked] })) as typeof dialog.showOpenDialog;
    }, path);
  }

  const row = (label: string) =>
    home.locator('.doc').filter({ has: home.locator('.name', { hasText: new RegExp(`^${label}$`) }) });

  beforeAll(async () => {
    folder = mkdtempSync(join(tmpdir(), 'sotto-documents-'));
    app = await launch();
    home = await page(app, 'app/index.html');
    await home.getByRole('button', { name: 'Prepare', exact: true }).click();
    await home.getByRole('heading', { name: 'Prepare' }).waitFor();
  }, 60_000);

  afterAll(async () => {
    await app?.close();
    rmSync(folder, { recursive: true, force: true });
  });

  it('reads a PDF résumé into the editor, then keeps what was saved', async () => {
    await willPick('resume.pdf', pdfOf([['Sam Rivera', 'Backend engineer, Payments'], ['Kafka, Go']]));

    await home.getByRole('button', { name: 'Read the résumé from a file' }).click();
    const editor = row('Résumé').locator('textarea');
    await editor.waitFor({ timeout: 20_000 });
    expect(await editor.inputValue()).toBe('Sam Rivera\nBackend engineer, Payments\n\nKafka, Go');

    await row('Résumé').getByRole('button', { name: 'Save' }).click();
    await expect.poll(() => row('Résumé').locator('.preview').textContent()).toBe('Sam Rivera');
  });

  it('reads a Word job description, its table included', async () => {
    await willPick(
      'job.docx',
      docxOf(
        ['Senior Backend Engineer'],
        [
          ['Go', 'required'],
          ['Kafka', 'nice to have'],
        ],
      ),
    );

    await home.getByRole('button', { name: 'Read the job description from a file' }).click();
    const editor = row('Job description').locator('textarea');
    await editor.waitFor({ timeout: 20_000 });

    // v1's way since 2026-11-14: a line each paragraph, a line each row, its cells joined by " | ".
    expect(await editor.inputValue()).toBe('Senior Backend Engineer\nGo | required\nKafka | nice to have');
  });

  it("says why a file gave nothing: one that isn't what its name says", async () => {
    await row('Job description').getByRole('button', { name: 'Cancel' }).click();
    await willPick('broken.pdf', new TextEncoder().encode('%PDF-1.4 and then nothing at all'));

    await home.getByRole('button', { name: 'Read the notes from a file' }).click();

    await row('Notes').getByRole('alert').waitFor({ timeout: 20_000 });
    expect(await row('Notes').getByRole('alert').textContent()).toContain("Couldn't read that file.");
  });

  it('cuts a long prep doc at a line break, keeps its name, and says so', async () => {
    const lines = Array.from({ length: 4_000 }, (_, i) => `Line ${i + 1}: ${'x'.repeat(30)}`);
    await willPick('system-design.txt', new TextEncoder().encode(lines.join('\n')));

    await home.getByRole('button', { name: 'Read the prep doc from a file' }).click();
    const editor = row('Prep doc').locator('textarea');
    await editor.waitFor({ timeout: 20_000 });
    const text = await editor.inputValue();
    expect(text.length).toBeLessThanOrEqual(100_000);
    expect(text.endsWith(lines[Math.floor(text.split('\n').length) - 1]!)).toBe(true);
    expect(await row('Prep doc').textContent()).toContain('so it was cut at a line break');

    await row('Prep doc').getByRole('button', { name: 'Save' }).click();
    await expect.poll(() => row('Prep doc').locator('.preview').textContent()).toBe('system-design.txt');
    expect(await row('Prep doc').textContent()).toContain('only its start is kept');
  });
});
