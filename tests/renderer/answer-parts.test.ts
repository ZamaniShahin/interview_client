// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { highlightCode, languageName, renderAnswer, renderAnswerParts } from '../../src/renderer/shared/markdown';

const html = (markup: string) => {
  const root = document.createElement('div');
  root.innerHTML = markup;
  return root;
};

describe("an answer's code, in the canvas's syntax colors (1.13)", () => {
  it('colors a language highlight.js knows, and keeps the source as written', () => {
    const root = html(renderAnswer('```python\nfrom typing import Optional\n# why\ns = "x"\n```'));
    expect(root.querySelector('pre code')?.textContent).toBe('from typing import Optional\n# why\ns = "x"\n');
    expect([...root.querySelectorAll('.hljs-keyword')].map((k) => k.textContent)).toEqual(['from', 'import']);
    expect(root.querySelector('.hljs-comment')?.textContent).toBe('# why');
    expect(root.querySelector('.hljs-string')?.textContent).toBe('"x"');
  });

  it.each([
    ['py', 'Python'],
    ['ts', 'TypeScript'],
    ['cpp', 'C++'],
    ['cs', 'C#'],
    ['rs', 'Rust'],
    ['kt', 'Kotlin'],
    ['yml', 'YAML'],
    ['sh', 'Shell'],
    ['elixir', 'elixir'],
    ['', 'Code'],
  ])('names a %s block as "%s"', (fence, name) => {
    expect(languageName(fence)).toBe(name);
  });

  it('leaves a language it has no colors for uncolored, but escaped', () => {
    const colored = highlightCode('<b>defmodule</b>', 'elixir');
    expect(colored).toBe('&lt;b&gt;defmodule&lt;/b&gt;');
    expect(highlightCode('<b>', 'mermaid')).toBe('&lt;b&gt;');
  });

  it('never lets code become markup, however it is written', () => {
    const root = html(
      renderAnswer('```javascript\n</code></pre><img src=x onerror=alert(1)><script>alert(1)</script>\n```'),
    );
    expect(root.querySelector('img')).toBeNull();
    expect(root.querySelector('script')).toBeNull();
    expect(root.querySelector('pre code')?.textContent).toContain('<script>');
  });
});

describe('an answer in parts, as the overlay draws it (1.13)', () => {
  it('keeps the order the model wrote: prose, code, prose, diagram, prose', () => {
    const parts = renderAnswerParts(
      'So ***cache*** it.\n\n```go\nfunc main() {}\n```\n\nThen:\n\n```mermaid\nflowchart LR\n  A --> B\n```\n\nThat is all.',
    );
    expect(parts.map((p) => p.kind)).toEqual(['prose', 'code', 'prose', 'diagram', 'prose']);
    expect(parts[0]).toMatchObject({ kind: 'prose', html: expect.stringContaining('<span class="kw">cache</span>') });
    expect(parts[1]).toMatchObject({ kind: 'code', language: 'Go', code: 'func main() {}\n' });
    expect(parts[3]).toEqual({ kind: 'diagram', source: 'flowchart LR\n  A --> B\n', complete: true });
  });

  it('gives a code part its source as written, for Copy, and its colors as sanitized HTML', () => {
    const [part] = renderAnswerParts('```python\ndef f(): return "<b>"\n```');
    expect(part).toMatchObject({ kind: 'code', code: 'def f(): return "<b>"\n' });
    const root = html(part!.kind === 'code' ? part!.html : '');
    expect(root.querySelector('b')).toBeNull();
    expect(root.querySelector('.hljs-keyword')?.textContent).toBe('def');
  });

  it('leaves code inside a list item in the prose, where it belongs', () => {
    const parts = renderAnswerParts('- First:\n\n  ```python\n  x = 1\n  ```\n- Second.');
    expect(parts.map((p) => p.kind)).toEqual(['prose']);
    expect(html(parts[0]!.kind === 'prose' ? parts[0]!.html : '').querySelector('.code .hljs-number')).not.toBeNull();
  });

  it('has nothing to show for an empty answer', () => {
    expect(renderAnswerParts('')).toEqual([]);
  });

  it.each([
    ['still streaming, no closing fence', '```mermaid\nflowchart LR\n  A --> B', false],
    ['only its opening line so far', '```mermaid', false],
    ['closed', '```mermaid\nflowchart LR\n  A --> B\n```', true],
    ['closed, nothing after', '```mermaid\nA --> B\n```\n', true],
    ['closed with spaces after the marker', '```mermaid\nA --> B\n```   ', true],
    ['closed by a longer marker', '```mermaid\nA --> B\n`````', true],
    ['not closed by a shorter marker', '````mermaid\nA --> B\n```', false],
    ['not closed by a line that names a language', '```mermaid\nA --> B\n```js', false],
    ['closed with tildes', '~~~mermaid\nA --> B\n~~~', true],
    ['not closed by backticks after tildes', '~~~mermaid\nA --> B\n```', false],
    ['closed, with Windows line ends', '```mermaid\r\nA --> B\r\n```\r\n', true],
  ])('knows a diagram is complete only once its fence closes: %s', (_, markdown, complete) => {
    const [part] = renderAnswerParts(markdown);
    expect(part).toMatchObject({ kind: 'diagram', complete });
  });

  it('shows raw HTML in prose as text, as the whole renderer does', () => {
    const [part] = renderAnswerParts('<script>alert(1)</script> and **bold**');
    const root = html(part!.kind === 'prose' ? part!.html : '');
    expect(root.querySelector('script')).toBeNull();
    expect(root.textContent).toContain('<script>');
    expect(root.querySelector('strong')?.textContent).toBe('bold');
  });
});

describe('what the sanitizer gives back', () => {
  it('keeps the first element whole, as Chromium does (DOMPurify under happy-dom unwraps it otherwise)', () => {
    expect(html(renderAnswer('First.\n\nSecond.')).querySelectorAll('p')).toHaveLength(2);
    const [code] = renderAnswerParts('```python\ndef f(): pass\n```');
    expect(code!.kind === 'code' && code!.html.startsWith('<span class="hljs-keyword">def</span>')).toBe(true);
  });
});
