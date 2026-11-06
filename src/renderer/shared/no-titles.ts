// Stealth rule 2: no `title` attributes, anywhere. A tooltip is a separate little window, and a screen share can see
// it. The lint rules stop them in our templates; this catches any that arrive another way (an SVG from a library,
// vendored code), and keeps the name for screen readers.
export function removeTitles(root: HTMLElement): MutationObserver {
  const strip = (el: Element) => {
    const title = el.getAttribute('title');
    if (title === null) return;
    if (!el.hasAttribute('aria-label') && title) el.setAttribute('aria-label', title);
    el.removeAttribute('title');
  };
  root.querySelectorAll('[title]').forEach(strip);

  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (m.type === 'attributes' && m.target instanceof Element) strip(m.target);
      m.addedNodes.forEach((node) => {
        if (node instanceof Element) {
          strip(node);
          node.querySelectorAll('[title]').forEach(strip);
        }
      });
    }
  });
  observer.observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ['title'] });
  return observer;
}
