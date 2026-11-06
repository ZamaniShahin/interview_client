// Renders an answer's Markdown to safe HTML. Answers are untrusted text (design handoff §4): no raw HTML, no links
// that open, no images, no tables. Key words (***bold italic***) become amber spans. Every result is sanitized.
// Diagrams (```mermaid) show as a named code block until Mermaid arrives with the overlay checkpoint (1.13).
import DOMPurify from 'dompurify';
import MarkdownIt from 'markdown-it';

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
  ts: 'TypeScript',
  typescript: 'TypeScript',
  go: 'Go',
  java: 'Java',
  cs: 'C#',
  csharp: 'C#',
  sql: 'SQL',
  bash: 'Shell',
  sh: 'Shell',
  json: 'JSON',
  mermaid: 'Diagram',
};

md.renderer.rules.fence = (tokens, idx) => {
  const token = tokens[idx]!;
  const lang = token.info.trim().split(/\s+/)[0]?.toLowerCase() ?? '';
  const name = languageNames[lang] ?? (lang ? lang : 'Code');
  return (
    `<div class="code"><div class="code-head">${md.utils.escapeHtml(name)}</div>` +
    `<pre><code>${md.utils.escapeHtml(token.content)}</code></pre></div>\n`
  );
};

const keyWord = /<(em|strong)><(strong|em)>([^<]*)<\/\2><\/\1>/g;

export function renderAnswer(markdown: string): string {
  const html = md.render(markdown).replace(keyWord, (whole, outer: string, inner: string, text: string) =>
    outer !== inner ? `<span class="kw">${text}</span>` : whole,
  );
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['p', 'ul', 'ol', 'li', 'strong', 'em', 'code', 'pre', 'span', 'div', 'br', 'blockquote'],
    ALLOWED_ATTR: ['class'],
  });
}
