// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import {
  configFor,
  createDiagramDrawer,
  type DiagramPalette,
  type MermaidApi,
} from '../../src/renderer/shared/diagram';

const dark: DiagramPalette = {
  dark: true,
  surface1: 'rgb(26, 26, 29)',
  surface2: 'rgb(36, 36, 40)',
  line2: 'rgba(255, 255, 255, 0.14)',
  text0: 'rgb(244, 244, 245)',
  text1: 'rgb(228, 228, 231)',
  text2: 'rgb(161, 161, 170)',
  font: "'Segoe UI', sans-serif",
};
const light: DiagramPalette = { ...dark, dark: false, surface1: 'rgb(255, 255, 255)' };

/** Plays Mermaid: draws `<svg><text>source</text></svg>` after a moment, and can't read a source saying "nonsense". */
function fakeMermaid() {
  const calls = { load: 0, parse: 0, render: 0, initialize: [] as Record<string, unknown>[], overlap: 0 };
  let rendering = 0;
  const api: MermaidApi = {
    initialize: (config) => void calls.initialize.push(config),
    parse: async (text) => {
      calls.parse++;
      return text.includes('nonsense') ? false : { diagramType: 'flowchart' };
    },
    render: async (id, text) => {
      calls.render++;
      rendering++;
      calls.overlap = Math.max(calls.overlap, rendering);
      await new Promise((resolve) => setTimeout(resolve, 5));
      rendering--;
      if (text.includes('explode')) {
        const leftover = document.createElement('div');
        leftover.id = `d${id}`;
        document.body.append(leftover);
        throw new Error('Mermaid fell over.');
      }
      // Mermaid escapes the text it draws.
      return {
        svg: `<svg id="${id}"><text>${text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</text></svg>`,
      };
    },
  };
  const load = async () => {
    calls.load++;
    return api;
  };
  return { api, calls, load };
}

describe("an answer's diagrams, as Mermaid draws them (1.13)", () => {
  it('loads Mermaid with the first diagram, and draws each source once, however often it is asked for', async () => {
    const mermaid = fakeMermaid();
    const drawer = createDiagramDrawer(mermaid.load, () => dark);
    expect(drawer.drawn('A --> B')).toBeUndefined();
    expect(mermaid.calls.load).toBe(0);

    const [first, second] = await Promise.all([drawer.draw('A --> B'), drawer.draw('A --> B')]);
    const third = await drawer.draw('A --> B');

    expect(first).toContain('<text>A --&gt; B</text>');
    expect(second).toBe(first);
    expect(third).toBe(first);
    expect(drawer.drawn('A --> B')).toBe(first);
    expect(mermaid.calls).toMatchObject({ load: 1, render: 1 });
  });

  it('draws one diagram at a time: Mermaid trips over overlapping renders', async () => {
    const mermaid = fakeMermaid();
    const drawer = createDiagramDrawer(mermaid.load, () => dark);

    await Promise.all(['A --> B', 'B --> C', 'C --> D', 'D --> E'].map((source) => drawer.draw(source)));

    expect(mermaid.calls.render).toBe(4);
    expect(mermaid.calls.overlap).toBe(1);
  });

  it("remembers a source Mermaid can't read, without drawing it, so it shows as its code block", async () => {
    const mermaid = fakeMermaid();
    const drawer = createDiagramDrawer(mermaid.load, () => dark);

    expect(await drawer.draw('nonsense here')).toBeNull();
    expect(drawer.drawn('nonsense here')).toBeNull();
    expect(await drawer.draw('nonsense here')).toBeNull();
    expect(mermaid.calls).toMatchObject({ parse: 1, render: 0 });
  });

  it('gives up on a drawing that fails, and clears what Mermaid left behind', async () => {
    const mermaid = fakeMermaid();
    const drawer = createDiagramDrawer(mermaid.load, () => dark);

    expect(await drawer.draw('A --> explode')).toBeNull();

    expect(document.querySelector('[id^="dsotto-diagram-"]')).toBeNull();
    expect(await drawer.draw('A --> B')).toContain('<svg');
  });

  it('tries loading Mermaid again with the next diagram when it failed to load', async () => {
    const mermaid = fakeMermaid();
    let loads = 0;
    const drawer = createDiagramDrawer(
      async () => {
        if (++loads === 1) throw new Error('The chunk failed to load.');
        return mermaid.api;
      },
      () => dark,
    );

    expect(await drawer.draw('A --> B')).toBeNull();
    expect(await drawer.draw('B --> C')).toContain('<text>B --&gt; C</text>');
    expect(loads).toBe(2);
  });

  it('keeps the last 30 drawings, and draws an older one again when it comes back', async () => {
    const mermaid = fakeMermaid();
    const drawer = createDiagramDrawer(mermaid.load, () => dark);
    for (let i = 0; i < 31; i++) await drawer.draw(`A --> N${i}`);

    expect(drawer.drawn('A --> N0')).toBeUndefined();
    expect(drawer.drawn('A --> N1')).toBeDefined();
    expect(drawer.drawn('A --> N30')).toBeDefined();
    await drawer.draw('A --> N0');
    expect(mermaid.calls.render).toBe(32);
  });

  it('draws again in the other colors once the theme changes', async () => {
    const mermaid = fakeMermaid();
    let palette = dark;
    const drawer = createDiagramDrawer(mermaid.load, () => palette);
    await drawer.draw('A --> B');

    palette = light;
    expect(drawer.drawn('A --> B')).toBeUndefined();
    await drawer.draw('A --> B');

    expect(mermaid.calls.render).toBe(2);
    expect(mermaid.calls.initialize.at(-1)).toMatchObject({
      themeVariables: { background: 'rgb(255, 255, 255)', darkMode: false },
    });
  });

  it('asks Mermaid for strict drawings with SVG labels, in the overlay colors', () => {
    expect(configFor(dark)).toMatchObject({
      startOnLoad: false,
      securityLevel: 'strict',
      htmlLabels: false,
      theme: 'base',
      themeVariables: {
        darkMode: true,
        primaryColor: dark.surface2,
        primaryBorderColor: dark.line2,
        primaryTextColor: dark.text0,
        lineColor: dark.text2,
        fontFamily: dark.font,
      },
    });
  });
});
