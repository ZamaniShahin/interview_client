// Draws an answer's diagrams (```mermaid) with Mermaid, as v1 did (its ARCHITECTURE.md, "Rendering"):
// - loaded only when an answer has a diagram, being by far the largest part of the overlay;
// - strict, with labels drawn as SVG text, never HTML (`htmlLabels: false`), in the overlay's own colors;
// - one drawing at a time, since Mermaid's renders trip over each other when they overlap;
// - each result kept by its source and colors (the last 30), because an answer re-renders as it streams;
// - a source Mermaid can't read is remembered too, and shows as its code block.
// What Mermaid draws is sanitized once more: SVG only, no <title> (a tooltip, stealth rule 2), no links, no HTML.
import DOMPurify from 'dompurify';

/** The overlay's colors, as Mermaid's base theme takes them. */
export interface DiagramPalette {
  dark: boolean;
  surface1: string;
  surface2: string;
  line2: string;
  text0: string;
  text1: string;
  text2: string;
  font: string;
}

/** The part of Mermaid's API this uses: a fake stands in for it in tests. */
export interface MermaidApi {
  initialize(config: Record<string, unknown>): void;
  /** `false` for a source it can't read (with `suppressErrors`). */
  parse(text: string, options: { suppressErrors: true }): Promise<unknown>;
  render(id: string, text: string): Promise<{ svg: string }>;
}

export interface DiagramDrawer {
  /** The drawing of `source` in today's colors: its SVG, `null` when it can't be drawn, `undefined` until it is. */
  drawn(source: string): string | null | undefined;
  /** Draws `source` once, however often it is asked for, after the drawings already asked for. */
  draw(source: string): Promise<string | null>;
}

const kept = 30;

export function createDiagramDrawer(load: () => Promise<MermaidApi>, readPalette: () => DiagramPalette): DiagramDrawer {
  const drawings = new Map<string, string | null>();
  const pending = new Map<string, Promise<string | null>>();
  let queue: Promise<unknown> = Promise.resolve();
  let mermaid: Promise<MermaidApi> | null = null;
  let drawn = 0;

  const keyOf = (source: string, palette: DiagramPalette) => `${JSON.stringify(palette)}\n${source}`;

  const remember = (key: string, svg: string | null) => {
    drawings.set(key, svg);
    if (drawings.size > kept) drawings.delete(drawings.keys().next().value!);
  };

  async function render(source: string, palette: DiagramPalette): Promise<string | null> {
    mermaid ??= load().catch((error: unknown) => {
      // A chunk that failed to load is tried again with the next diagram.
      mermaid = null;
      throw error;
    });
    const api = await mermaid;
    api.initialize(configFor(palette));
    if ((await api.parse(source, { suppressErrors: true })) === false) return null;
    const id = `sotto-diagram-${++drawn}`;
    try {
      return clean((await api.render(id, source)).svg);
    } finally {
      // Mermaid measures in a hidden element of its own; one a failed render leaves behind is removed.
      document.getElementById(`d${id}`)?.remove();
    }
  }

  return {
    drawn: (source) => drawings.get(keyOf(source, readPalette())),
    draw(source) {
      const palette = readPalette();
      const key = keyOf(source, palette);
      if (drawings.has(key)) return Promise.resolve(drawings.get(key)!);
      const running = pending.get(key);
      if (running) return running;

      const job = queue
        .then(() => render(source, palette))
        .catch(() => null)
        .then((svg) => {
          remember(key, svg);
          pending.delete(key);
          return svg;
        });
      queue = job;
      pending.set(key, job);
      return job;
    },
  };
}

/** Mermaid's settings for one drawing: strict, SVG labels, and the overlay's colors in the base theme. */
export function configFor(palette: DiagramPalette): Record<string, unknown> {
  const { surface1, surface2, line2, text0, text1, text2, font } = palette;
  return {
    startOnLoad: false,
    securityLevel: 'strict',
    htmlLabels: false,
    theme: 'base',
    fontFamily: font,
    // Tighter than Mermaid's spacing: a drawing wider than the overlay is scaled down to fit, text and all, and a
    // left-to-right flowchart of five boxes would otherwise come out at half size.
    flowchart: { nodeSpacing: 22, rankSpacing: 26, padding: 8, diagramPadding: 4 },
    themeVariables: {
      darkMode: palette.dark,
      background: surface1,
      fontFamily: font,
      fontSize: '14px',
      primaryColor: surface2,
      primaryTextColor: text0,
      primaryBorderColor: line2,
      secondaryColor: surface2,
      secondaryTextColor: text0,
      secondaryBorderColor: line2,
      tertiaryColor: surface1,
      tertiaryTextColor: text1,
      tertiaryBorderColor: line2,
      mainBkg: surface2,
      nodeBorder: line2,
      nodeTextColor: text0,
      lineColor: text2,
      textColor: text1,
      titleColor: text0,
      clusterBkg: surface1,
      clusterBorder: line2,
      edgeLabelBackground: surface1,
      actorBkg: surface2,
      actorBorder: line2,
      actorTextColor: text0,
      actorLineColor: text2,
      signalColor: text2,
      signalTextColor: text1,
      labelBoxBkgColor: surface2,
      labelBoxBorderColor: line2,
      labelTextColor: text0,
      noteBkgColor: surface2,
      noteBorderColor: line2,
      noteTextColor: text1,
    },
  };
}

/** Leads the SVG while it is sanitized, as markdown.ts does: under happy-dom, DOMPurify unwraps a first element. */
const lead = '⁣';

/** Mermaid's SVG, sanitized: no title (a tooltip), no links, no embedded HTML, no script. */
export function clean(svg: string): string {
  const cleaned = DOMPurify.sanitize(lead + svg, {
    USE_PROFILES: { svg: true, svgFilters: true },
    FORBID_TAGS: ['title', 'a', 'foreignObject', 'script', 'image'],
    FORBID_ATTR: ['title', 'href', 'xlink:href'],
  });
  return cleaned.startsWith(lead) ? cleaned.slice(lead.length) : cleaned;
}

/**
 * The overlay's colors, resolved by the browser: a token like `rgb(255 255 255 / 14%)` comes back as the
 * `rgba(255, 255, 255, 0.14)` Mermaid's color functions read.
 */
export function readPalette(): DiagramPalette {
  const probe = document.createElement('span');
  probe.style.display = 'none';
  document.body.append(probe);
  try {
    const color = (token: string) => {
      probe.style.color = `var(${token})`;
      return getComputedStyle(probe).color;
    };
    return {
      dark: !document.documentElement.classList.contains('theme-light'),
      surface1: color('--surface-1'),
      surface2: color('--surface-2'),
      line2: color('--line-2'),
      text0: color('--text-0'),
      text1: color('--text-1'),
      text2: color('--text-2'),
      font: getComputedStyle(document.documentElement).getPropertyValue('--font-sans').trim(),
    };
  } finally {
    probe.remove();
  }
}

/** The overlay's drawer: Mermaid comes in its own chunk, loaded with the first diagram. */
export const diagrams: DiagramDrawer = createDiagramDrawer(
  async () => (await import('mermaid')).default as unknown as MermaidApi,
  readPalette,
);
