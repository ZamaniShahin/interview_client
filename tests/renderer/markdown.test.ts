// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { renderAnswer } from '../../src/renderer/shared/markdown';

function render(markdown: string): HTMLElement {
  const root = document.createElement('div');
  root.innerHTML = renderAnswer(markdown);
  return root;
}

describe("an answer's Markdown", () => {
  it('turns key words into amber spans', () => {
    const root = render('So ***Kafka*** only guarantees order within a ***partition***.');
    expect([...root.querySelectorAll('span.kw')].map((s) => s.textContent)).toEqual(['Kafka', 'partition']);
  });

  it('keeps plain bold as bold', () => {
    expect(render('**What it is.** A way to spread keys.').querySelector('strong')?.textContent).toBe('What it is.');
  });

  it('shows raw HTML as text and never runs it', () => {
    const root = render('<script>alert(1)</script><img src=x onerror=alert(1)>');
    expect(root.querySelector('script')).toBeNull();
    expect(root.querySelector('img')).toBeNull();
    expect(root.textContent).toContain('<script>');
  });

  it('never makes a link or loads an image', () => {
    const root = render('[open me](https://example.com) and ![pic](https://example.com/x.png) and https://example.com');
    expect(root.querySelector('a')).toBeNull();
    expect(root.querySelector('img')).toBeNull();
  });

  it('names a code block by its language and keeps its text', () => {
    const root = render('```python\nprint("swiss")\n```');
    expect(root.querySelector('.code-head')?.textContent).toBe('Python');
    expect(root.querySelector('pre code')?.textContent).toBe('print("swiss")\n');
  });

  it('shows a diagram as a named block until Mermaid arrives', () => {
    expect(render('```mermaid\nflowchart LR\n  A --> B\n```').querySelector('.code-head')?.textContent).toBe('Diagram');
  });

  it('leaves table syntax as text', () => {
    expect(render('| a | b |\n|---|---|\n| 1 | 2 |').querySelector('table')).toBeNull();
  });
});
