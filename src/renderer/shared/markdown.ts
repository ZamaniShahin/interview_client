// Renders an answer's Markdown to safe HTML. Answers are untrusted text (design handoff §4): no raw HTML, no links
// that open, no images, no tables. Key words (***bold italic***) become amber spans; code is colored by highlight.js in
// the canvas's four syntax colors (styles/answer.css). Every result is sanitized.
//
// The overlay renders an answer in parts (`renderAnswerParts`): its prose, and each top-level code block and diagram on
// its own, so a code block gets its Copy and a drawn diagram stays drawn while the text after it streams in (v1's
// `splitAnswer`). `renderAnswer` renders the whole as HTML, a diagram as its named code block.
import DOMPurify from 'dompurify';
import hljs from 'highlight.js/lib/core';
import bash from 'highlight.js/lib/languages/bash';
import c from 'highlight.js/lib/languages/c';
import cpp from 'highlight.js/lib/languages/cpp';
import csharp from 'highlight.js/lib/languages/csharp';
import css from 'highlight.js/lib/languages/css';
import go from 'highlight.js/lib/languages/go';
import java from 'highlight.js/lib/languages/java';
import javascript from 'highlight.js/lib/languages/javascript';
import json from 'highlight.js/lib/languages/json';
import kotlin from 'highlight.js/lib/languages/kotlin';
import php from 'highlight.js/lib/languages/php';
import python from 'highlight.js/lib/languages/python';
import ruby from 'highlight.js/lib/languages/ruby';
import rust from 'highlight.js/lib/languages/rust';
import scala from 'highlight.js/lib/languages/scala';
import sql from 'highlight.js/lib/languages/sql';
import swift from 'highlight.js/lib/languages/swift';
import typescript from 'highlight.js/lib/languages/typescript';
import xml from 'highlight.js/lib/languages/xml';
import yaml from 'highlight.js/lib/languages/yaml';
import MarkdownIt, { type Token } from 'markdown-it';

// The languages of coding interviews, and what their fences are called; anything else is shown uncolored.
for (const [name, language] of Object.entries({
  bash,
  c,
  cpp,
  csharp,
  css,
  go,
  java,
  javascript,
  json,
  kotlin,
  php,
  python,
  ruby,
  rust,
  scala,
  sql,
  swift,
  typescript,
  xml,
  yaml,
})) {
  hljs.registerLanguage(name, language);
}

const md = new MarkdownIt({ html: false, linkify: false, typographer: false, breaks: false });
// What an answer never contains: a link would open a browser mid-interview, an image would load from the network.
// Their syntax shows as plain text instead. (true: a rule name a later markdown-it drops is no error.)
md.disable(['link', 'autolink', 'image', 'table', 'html_block', 'html_inline'], true);

// Answers have no headings; if one slips in, it reads as a bold line rather than a title.
md.renderer.rules.heading_open = () => '<p><strong>';
md.renderer.rules.heading_close = () => '</strong></p>\n';

const languageNames: Record<string, string> = {
  py: 'Python',
  python: 'Python',
  js: 'JavaScript',
  javascript: 'JavaScript',
  jsx: 'JavaScript',
  ts: 'TypeScript',
  typescript: 'TypeScript',
  tsx: 'TypeScript',
  go: 'Go',
  golang: 'Go',
  java: 'Java',
  cs: 'C#',
  csharp: 'C#',
  c: 'C',
  cpp: 'C++',
  'c++': 'C++',
  rust: 'Rust',
  rs: 'Rust',
  kotlin: 'Kotlin',
  kt: 'Kotlin',
  swift: 'Swift',
  ruby: 'Ruby',
  rb: 'Ruby',
  php: 'PHP',
  scala: 'Scala',
  sql: 'SQL',
  bash: 'Shell',
  sh: 'Shell',
  shell: 'Shell',
  json: 'JSON',
  yaml: 'YAML',
  yml: 'YAML',
  html: 'HTML',
  xml: 'XML',
  css: 'CSS',
  mermaid: 'Diagram',
};

/** A code block's language as its fence names it, lower-cased: `python`, `ts`, `mermaid`, or empty. */
const fenceLanguage = (token: Token) => token.info.trim().split(/\s+/)[0]?.toLowerCase() ?? '';

/** What a code block's head says: the language's own name, the fence's word, or "Code". */
export const languageName = (fence: string) => languageNames[fence] ?? (fence || 'Code');

/** A code block's text as HTML: colored when highlight.js knows the language, escaped either way. */
export function highlightCode(code: string, fence: string): string {
  const language = fence && fence !== 'mermaid' && hljs.getLanguage(fence) ? fence : null;
  return language ? hljs.highlight(code, { language, ignoreIllegals: true }).value : md.utils.escapeHtml(code);
}

md.renderer.rules.fence = (tokens, idx) => {
  const token = tokens[idx]!;
  const fence = fenceLanguage(token);
  return (
    `<div class="code"><div class="code-head">${md.utils.escapeHtml(languageName(fence))}</div>` +
    `<pre><code>${highlightCode(token.content, fence)}</code></pre></div>\n`
  );
};

const keyWord = /<(em|strong)><(strong|em)>([^<]*)<\/\2><\/\1>/g;

/** Leads every fragment sanitized, and is taken off after: see `sanitize`. */
const lead = '⁣';

/**
 * Sanitizes rendered HTML: the tags prose and code use, and classes alone (key words, highlight.js's colors). The
 * fragment is sanitized behind an invisible character, so that it never starts with an element: under happy-dom (the
 * renderer tests) DOMPurify unwraps a fragment's first element, which Chromium never does. Both then give the same.
 */
function sanitize(html: string): string {
  const clean = DOMPurify.sanitize(lead + html, {
    ALLOWED_TAGS: ['p', 'ul', 'ol', 'li', 'strong', 'em', 'code', 'pre', 'span', 'div', 'br', 'blockquote'],
    ALLOWED_ATTR: ['class'],
    ALLOW_DATA_ATTR: false,
  });
  return clean.startsWith(lead) ? clean.slice(lead.length) : clean;
}

function finish(html: string): string {
  return sanitize(
    html.replace(keyWord, (whole, outer: string, inner: string, text: string) =>
      outer !== inner ? `<span class="kw">${text}</span>` : whole,
    ),
  );
}

export function renderAnswer(markdown: string): string {
  return finish(md.render(markdown));
}

export type AnswerPart =
  /** Paragraphs, lists and quotes, with any code nested in them: sanitized HTML. */
  | { kind: 'prose'; html: string }
  /** A top-level code block: its language's name, its source as written (what Copy copies), and that source colored. */
  | { kind: 'code'; language: string; code: string; html: string }
  /** A top-level ```mermaid block. `complete` once its closing fence has arrived: only then can it be drawn. */
  | { kind: 'diagram'; source: string; complete: boolean };

/** A fence is closed when its last line is a closing marker: the same character, at least as many, nothing after. */
function isClosed(token: Token, lines: string[]): boolean {
  const end = token.map?.[1];
  if (end === undefined || end - (token.map?.[0] ?? end) < 2) return false;
  const last = lines[end - 1] ?? '';
  const marker = token.markup[0] === '~' ? '~' : '`';
  const closing = new RegExp(`^ {0,3}\\${marker}{${token.markup.length},}[ \\t]*$`);
  return closing.test(last);
}

/** The answer in parts, in the order the model wrote them (see the top of this file). */
export function renderAnswerParts(markdown: string): AnswerPart[] {
  const env = {};
  const tokens = md.parse(markdown, env);
  // Split as markdown-it reads lines, which it normalizes: a CRLF must not hide a closing fence.
  const lines = markdown.split(/\r\n?|\n/);
  const parts: AnswerPart[] = [];
  let prose: Token[] = [];
  const flush = () => {
    if (prose.length === 0) return;
    parts.push({ kind: 'prose', html: finish(md.renderer.render(prose, md.options, env)) });
    prose = [];
  };

  for (const token of tokens) {
    if (token.type !== 'fence' || token.level !== 0) {
      prose.push(token);
      continue;
    }
    flush();
    const fence = fenceLanguage(token);
    if (fence === 'mermaid') {
      parts.push({ kind: 'diagram', source: token.content, complete: isClosed(token, lines) });
    } else {
      parts.push({
        kind: 'code',
        language: languageName(fence),
        code: token.content,
        html: sanitize(highlightCode(token.content, fence)),
      });
    }
  }
  flush();
  return parts;
}
