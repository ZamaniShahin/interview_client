// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { removeTitles } from '../../src/renderer/shared/no-titles';

describe('stealth rule 2 at runtime', () => {
  it('removes a title that arrives later, and keeps its words for screen readers', async () => {
    const root = document.createElement('div');
    document.body.appendChild(root);
    removeTitles(root);

    const svg = document.createElement('span');
    svg.setAttribute('title', 'Load balancer');
    root.appendChild(svg);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(svg.hasAttribute('title')).toBe(false);
    expect(svg.getAttribute('aria-label')).toBe('Load balancer');
  });

  it('removes titles already on the page', () => {
    const root = document.createElement('div');
    root.innerHTML = '<p title="tip">text</p>';
    removeTitles(root);
    expect(root.querySelector('[title]')).toBeNull();
  });
});
