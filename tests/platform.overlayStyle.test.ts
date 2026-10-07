/**
 * The dev ad and purchase sheets are cut paper like the rest of the game. A stylesheet cannot read the Pixi kit,
 * so the tokens are copied by hand into devOverlayStyle.ts: these tests keep the copy equal to src/ui/theme.ts
 * and keep the look flat (no blur, no outline, no glow, nothing glossy), readable and touchable.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { hasString } from '@/core/i18n';
import { CLOSE_MS } from '@/platform/adapters/devOverlay';
import { AD_PLACEMENT_IDS } from '@/platform/adPolicy';
import { DIM_ALPHA, OVERLAY_CSS, PAPER } from '@/platform/adapters/devOverlayStyle';
import { Color, Dim, TapeColors } from '@/ui/theme';

const hex = (n: number): string => '#' + n.toString(16).padStart(6, '0');

/** Where each copied token comes from in the kit; the Record type fails to compile when a token has no source. */
const KIT: Record<keyof typeof PAPER, number> = {
  ink: Color.ink,
  inkSoft: Color.inkSoft,
  inkDeep: Color.inkDeep,
  paper: Color.paper,
  kraft: Color.kraft,
  kraftDark: Color.kraftDark,
  track: Color.track,
  shadow: Color.shadow,
  coral: Color.coral,
  teal: Color.teal,
  tealDark: Color.tealDark,
  mustard: Color.mustard,
  berryDark: Color.berryDark,
  pressTint: Color.pressTint,
  dimBase: Dim.backdrop,
  tapeSky: TapeColors.sky.base,
  tapeSkyMark: TapeColors.sky.mark,
  tapePink: TapeColors.pink.base,
  tapePinkMark: TapeColors.pink.mark,
};

const channels = (h: string): number[] => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

/** The token block is the declaration list at the top of `.lp-root`; everything after it must use `var(--x)`. */
const [VAR_BLOCK = '', RULES = ''] = OVERLAY_CSS.split(';position:fixed');

/** Top-level pieces of `s` split on `sep` (parentheses nest, so `calc(a*b)` and `rgba(1,2,3,.4)` stay whole). */
function splitTop(s: string, sep: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of s) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (depth === 0 && ch === sep) {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out.map((x) => x.trim()).filter((x) => x.length > 0);
}

/** Every `box-shadow` / `drop-shadow` layer as its list of space-separated parts. */
function shadowLayers(css: string): string[][] {
  const bodies: string[] = [];
  for (const m of css.matchAll(/box-shadow:([^;}]*)/g)) bodies.push(m[1] ?? '');
  for (const m of css.matchAll(/drop-shadow\(/g)) {
    let i = (m.index ?? 0) + m[0].length;
    let depth = 1;
    let body = '';
    while (i < css.length && depth > 0) {
      const ch = css[i++] ?? '';
      if (ch === '(') depth++;
      if (ch === ')') depth--;
      if (depth > 0) body += ch;
    }
    bodies.push(body);
  }
  return bodies.flatMap((b) => splitTop(b, ',').map((layer) => splitTop(layer, ' ').filter((p) => p !== 'inset')));
}

describe('dev overlay look: paper tokens', () => {
  it('copies every colour from the kit', () => {
    for (const [name, value] of Object.entries(PAPER)) {
      expect(value, name).toBe(hex(KIT[name as keyof typeof PAPER]));
    }
    expect(DIM_ALPHA).toBe(Dim.backdropAlpha);
  });

  it('declares each token once, as a custom property, and uses colours only through them', () => {
    for (const name of Object.keys(PAPER)) {
      const css = '--' + name.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase()) + ':';
      expect(VAR_BLOCK.split(css).length - 1, css).toBe(1);
    }
    expect(RULES.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).toEqual([]);
  });

  it('builds every rgba() from a token colour', () => {
    const known = new Set(Object.values(PAPER).map((h) => channels(h).join(',')));
    const used = [...OVERLAY_CSS.matchAll(/rgba\((\d+),(\d+),(\d+),/g)].map((m) => `${m[1]},${m[2]},${m[3]}`);
    expect(used.length).toBeGreaterThan(0);
    for (const rgb of used) expect(known.has(rgb), rgb).toBe(true);
  });

  it('presses a paper by the kit tint and mutes the disabled one toward cream', () => {
    const tint = channels(PAPER.pressTint);
    const press = (h: string): string =>
      '#' +
      channels(h)
        .map((v, i) => Math.round((v * (tint[i] ?? 255)) / 255).toString(16).padStart(2, '0'))
        .join('');
    expect(OVERLAY_CSS).toContain(`--coral-press:${press(PAPER.coral)}`);
    expect(OVERLAY_CSS).toContain(`--kraft-press:${press(PAPER.kraft)}`);
    const mutedMatch = /--muted:#([0-9a-f]{6})/.exec(OVERLAY_CSS);
    const muted = channels('#' + (mutedMatch?.[1] ?? '000000'));
    const kraft = channels(PAPER.kraft);
    const paper = channels(PAPER.paper);
    muted.forEach((v, i) => {
      expect(v).toBeGreaterThanOrEqual(Math.min(kraft[i] ?? 0, paper[i] ?? 0));
      expect(v).toBeLessThanOrEqual(Math.max(kraft[i] ?? 0, paper[i] ?? 0));
    });
  });

  it('puts the warm-brown dim behind the sheet, never black or purple', () => {
    expect(OVERLAY_CSS).toContain(`--dim:rgba(${channels(PAPER.dimBase).join(',')},${DIM_ALPHA})`);
    expect(OVERLAY_CSS).not.toContain('rgba(11,6,24');
  });
});

describe('dev overlay look: flat paper', () => {
  it('has no blur, glow, outline text, text shadow or blend mode', () => {
    expect(OVERLAY_CSS).not.toMatch(/blur\(/);
    expect(OVERLAY_CSS).not.toMatch(/text-stroke|paint-order|text-shadow|mix-blend-mode|backdrop-filter/);
    // The only filter is the 0-blur drop-shadow that follows the cut edge.
    expect(OVERLAY_CSS.match(/filter:[^;}]*/g)?.every((f) => /^filter:drop-shadow\(/.test(f))).toBe(true);
  });

  it('draws every shadow flat: a zero blur radius', () => {
    const layers = shadowLayers(OVERLAY_CSS);
    expect(layers.length).toBeGreaterThan(5);
    for (const parts of layers) expect(parts[2], parts.join(' ')).toMatch(/^0(px)?$/);
  });

  it('never fades light with a vertical lighting ramp (no gloss)', () => {
    expect(OVERLAY_CSS).not.toMatch(/linear-gradient\(180deg|linear-gradient\(to bottom/);
    expect(OVERLAY_CSS).not.toMatch(/inset 0 [^;]*rgba\(255,255,255/);
  });
});

describe('dev overlay look: hooks, touch and motion', () => {
  it('styles every class the overlay code and QA scripts hook into', () => {
    const src = readFileSync(new URL('../src/platform/adapters/devOverlay.ts', import.meta.url), 'utf8');
    const classes = new Set([...src.matchAll(/\blp-[a-z]+(?:-[a-z]+)*/g)].map((m) => m[0]));
    classes.delete('lp-overlay'); // the root's id, not a class
    expect(classes.size).toBeGreaterThan(15);
    for (const c of classes) expect(OVERLAY_CSS, c).toContain('.' + c);
    expect(OVERLAY_CSS).toContain('.lp-btn[data-lp="claim"]');
  });

  it('keeps every referenced keyframe defined', () => {
    const defined = new Set([...OVERLAY_CSS.matchAll(/@keyframes (lp-[a-z-]+)/g)].map((m) => m[1]));
    const used = [...OVERLAY_CSS.matchAll(/animation:(lp-[a-z-]+)/g)].map((m) => m[1]);
    expect(used.length).toBeGreaterThan(8);
    for (const name of used) expect(defined.has(name), name).toBe(true);
  });

  it('keeps buttons at or above the touch minimum and text at or above 24 design px', () => {
    const buttons = [...OVERLAY_CSS.matchAll(/\.lp-(primary|neutral)\{min-height:max\(\d+px,calc\(var\(--u\)\*(\d+)px\)\)/g)];
    expect(buttons.map((m) => m[1])).toEqual(['primary', 'neutral']);
    for (const m of buttons) expect(Number(m[2]), m[1]).toBeGreaterThanOrEqual(m[1] === 'primary' ? 120 : 88);
    const sizes = [...OVERLAY_CSS.matchAll(/font-size:max\(\d+px,calc\(var\(--u\)\*(\d+)px\)\)/g)].map((m) => Number(m[1]));
    expect(sizes.length).toBeGreaterThanOrEqual(6);
    for (const px of sizes) expect(px).toBeGreaterThanOrEqual(24);
  });

  it('finishes every exit animation before the overlay root is removed', () => {
    const exits = [...OVERLAY_CSS.matchAll(/\.lp-out[^{]*\{[^}]*animation:lp-[a-z-]+ (\.\d+)s/g)].map((m) => Number(m[1]) * 1000);
    expect(exits.length).toBeGreaterThanOrEqual(3);
    for (const ms of exits) expect(ms).toBeLessThanOrEqual(CLOSE_MS);
  });

  it('follows the game setting, not the OS flag: .lp-calm stops every animation and transition', () => {
    expect(OVERLAY_CSS).not.toContain('prefers-reduced-motion');
    expect(OVERLAY_CSS).toMatch(/\.lp-calm \*[^{]*\{animation:none!important;transition:none!important\}/);
  });

  it('never blocks a tap behind an entrance animation (only the closing root and the tape ignore the pointer)', () => {
    const rules = OVERLAY_CSS.split('}').filter((r) => r.includes('pointer-events:none'));
    for (const r of rules) expect(r, r).toMatch(/\.lp-out|lp-grab|::after/);
  });
});

describe('dev overlay text', () => {
  it('names every ad placement, so the sheet never shows a raw id', () => {
    for (const id of AD_PLACEMENT_IDS) expect(hasString('platform.placement.' + id), id).toBe(true);
  });
});
