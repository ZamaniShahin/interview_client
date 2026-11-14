// Real files for the document tests (3.10), made here rather than kept as binaries: a PDF with its pages' lines, and a
// Word document (.docx, a zip) with its paragraphs and a table.
import { crc32 } from 'node:zlib';

/** A PDF with one page per entry, each a list of lines in Helvetica (WinAnsi: Latin-1 letters such as é). */
export function pdfOf(pages: string[][]): Uint8Array {
  const objects: string[] = [];
  const pageIds = pages.map((_, i) => 4 + i * 2);
  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objects[2] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pages.length} >>`;
  objects[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
  pages.forEach((lines, i) => {
    const pageId = pageIds[i]!;
    const stream = lines
      .map((line, n) => `BT /F1 12 Tf 72 ${720 - n * 16} Td (${line.replace(/[\\()]/g, (c) => `\\${c}`)}) Tj ET`)
      .join('\n');
    objects[pageId] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${pageId + 1} 0 R /Resources << /Font << /F1 3 0 R >> >> >>`;
    objects[pageId + 1] = `<< /Length ${latin1(stream).length} >>\nstream\n${stream}\nendstream`;
  });
  let out = '%PDF-1.4\n';
  const offsets: number[] = [];
  for (let id = 1; id < objects.length; id++) {
    offsets[id] = latin1(out).length;
    out += `${id} 0 obj\n${objects[id]}\nendobj\n`;
  }
  const xref = latin1(out).length;
  out += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let id = 1; id < objects.length; id++) out += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`;
  out += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return latin1(out);
}

/** Latin-1 bytes, as a PDF's Helvetica text is written. */
function latin1(text: string): Uint8Array {
  return Uint8Array.from(text, (c) => c.charCodeAt(0) & 0xff);
}

/** A zip of these files, stored, not compressed: what a .docx is. */
export function zipOf(files: Record<string, string>): Uint8Array {
  const encoder = new TextEncoder();
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  for (const [name, text] of Object.entries(files)) {
    const nameBytes = encoder.encode(name);
    const data = encoder.encode(text);
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, nameBytes, data);
    centrals.push(central, nameBytes);
    offset += 30 + nameBytes.length + data.length;
  }
  const centralSize = centrals.reduce((n, b) => n + b.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(files).length, 8);
  end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  return new Uint8Array(Buffer.concat([...locals, ...centrals, end]));
}

const escapeXml = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** A Word document: its paragraphs, then a table of rows of cells. */
export function docxOf(paragraphs: string[], table: string[][] = []): Uint8Array {
  const rows = table.map((row) => `<w:tr>${row.map((cell) => `<w:tc>${word.p(cell)}</w:tc>`).join('')}</w:tr>`).join('');
  return docxWith(paragraphs.map((text) => word.p(text)).join('') + (rows ? `<w:tbl>${rows}</w:tbl>` : ''));
}

/** A cell of {@link word.table}: its paragraphs (or raw XML, a table inside it), and how it is merged. */
export interface WordCell {
  text?: string | string[];
  xml?: string;
  /** Columns it spans (Word's gridSpan). */
  colSpan?: number;
  /** Merged down: the cell that starts the merge, or one that continues the one above (Word's vMerge). */
  mergeDown?: 'restart' | 'continue';
}

/** The body XML of a Word document, built as Word writes it. */
export const word = {
  /** A paragraph; a tab ("\t") and a line break ("\n") in the text are written as Word's own. */
  p(text: string): string {
    const runs = text
      .split(/(\t|\n)/)
      .filter((part) => part.length > 0)
      .map((part) =>
        part === '\t' ? '<w:tab/>' : part === '\n' ? '<w:br/>' : `<w:t xml:space="preserve">${escapeXml(part)}</w:t>`,
      )
      .join('');
    return `<w:p><w:r>${runs}</w:r></w:p>`;
  },
  /** A paragraph holding a page break, between two words. */
  pageBreak(before: string, after: string): string {
    return `<w:p><w:r><w:t>${escapeXml(before)}</w:t><w:br w:type="page"/><w:t>${escapeXml(after)}</w:t></w:r></w:p>`;
  },
  /** A paragraph with a link in it. */
  link(before: string, linked: string, after: string): string {
    return (
      `<w:p><w:r><w:t xml:space="preserve">${escapeXml(before)}</w:t></w:r>` +
      `<w:hyperlink w:anchor="here"><w:r><w:t>${escapeXml(linked)}</w:t></w:r></w:hyperlink>` +
      `<w:r><w:t xml:space="preserve">${escapeXml(after)}</w:t></w:r></w:p>`
    );
  },
  /** A table: rows of cells, each a text or a {@link WordCell}. */
  table(rows: (string | WordCell)[][]): string {
    const cell = (c: string | WordCell) => {
      const spec = typeof c === 'string' ? { text: c } : c;
      const props =
        (spec.colSpan && spec.colSpan > 1 ? `<w:gridSpan w:val="${spec.colSpan}"/>` : '') +
        (spec.mergeDown === 'restart' ? '<w:vMerge w:val="restart"/>' : spec.mergeDown === 'continue' ? '<w:vMerge/>' : '');
      const texts = spec.text === undefined ? [] : Array.isArray(spec.text) ? spec.text : [spec.text];
      const content = (spec.xml ?? '') + texts.map((t) => word.p(t)).join('');
      return `<w:tc>${props ? `<w:tcPr>${props}</w:tcPr>` : ''}${content || '<w:p/>'}</w:tc>`;
    };
    return `<w:tbl>${rows.map((row) => `<w:tr>${row.map(cell).join('')}</w:tr>`).join('')}</w:tbl>`;
  },
};

/** A Word document whose body is this XML (paragraphs and tables, from {@link word}). */
export function docxWith(body: string): Uint8Array {
  return docxOfDocument(
    '<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' +
      body +
      '</w:body></w:document>',
  );
}

/** A Word document whose word/document.xml is this, whole: python-docx's, say (scripts/v1-docx-cases.py). */
export function docxOfDocument(documentXml: string): Uint8Array {
  return zipOf({
    '[Content_Types].xml':
      '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
    '_rels/.rels':
      '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
    'word/document.xml': documentXml,
  });
}
