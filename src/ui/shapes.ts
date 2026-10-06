import { FillGradient, type Container, type Graphics } from 'pixi.js';
import { game } from '@/core/game';
import { clamp } from '@/core/math';
import { Color } from './theme';
import { rgba, shade } from './colors';

/* ---------------------------------------------------------------- gradients */

type StopColor = number | string;
export type GradStop = readonly [offset: number, color: StopColor];

const gradientCache = new Map<string, FillGradient>();

/**
 * Shared vertical/horizontal gradient. 'local' texture space stretches it over each shape's own
 * bounds, so one instance serves every size, and sharing keeps the GPU texture count tiny (each
 * FillGradient owns a texture and, per Pixi, must otherwise be destroyed by hand).
 */
export function gradient(stops: readonly GradStop[], horizontal = false): FillGradient {
  const key = (horizontal ? 'h' : 'v') + stops.map((s) => s[0] + ':' + s[1]).join('|');
  let g = gradientCache.get(key);
  if (!g) {
    g = new FillGradient({
      type: 'linear',
      start: { x: 0, y: 0 },
      end: horizontal ? { x: 1, y: 0 } : { x: 0, y: 1 },
      colorStops: stops.map((s) => ({ offset: s[0], color: s[1] })),
      textureSpace: 'local',
      textureSize: 128,
    });
    gradientCache.set(key, g);
  }
  return g;
}

export function vGradient(top: number, bottom: number): FillGradient {
  return gradient([
    [0, top],
    [1, bottom],
  ]);
}

export function vGradient3(top: number, mid: number, bottom: number, midAt = 0.5): FillGradient {
  return gradient([
    [0, top],
    [midAt, mid],
    [1, bottom],
  ]);
}

/** White fading out downward: the glossy "glass" highlight that sits on the upper half of a face. */
export function glossGradient(topAlpha: number, bottomAlpha = topAlpha * 0.2): FillGradient {
  return gradient([
    [0, rgba(0xffffff, topAlpha)],
    [1, rgba(0xffffff, bottomAlpha)],
  ]);
}

/** Radial glow: opaque colour at the centre fading to transparent at the edge. */
export function glowGradient(color: number, centerAlpha = 1): FillGradient {
  const key = 'r' + color + ':' + centerAlpha;
  let g = gradientCache.get(key);
  if (!g) {
    g = new FillGradient({
      type: 'radial',
      center: { x: 0.5, y: 0.5 },
      innerRadius: 0,
      outerCenter: { x: 0.5, y: 0.5 },
      outerRadius: 0.5,
      colorStops: [
        { offset: 0, color: rgba(color, centerAlpha) },
        { offset: 1, color: rgba(color, 0) },
      ],
      textureSpace: 'local',
      textureSize: 128,
    });
    gradientCache.set(key, g);
  }
  return g;
}

/** Soft round glow (selected tab, legendary aura). */
export function drawGlow(g: Graphics, cx: number, cy: number, r: number, color: number, alpha = 0.8): void {
  g.circle(cx, cy, r).fill(glowGradient(color, alpha));
}

/* ------------------------------------------------------------------ caching */

/** Texture density for baked UI: matches device pixels per design px with a little supersampling. */
export function bakeResolution(): number {
  const r = game.app?.renderer.resolution ?? 1;
  return clamp(r * game.scale * 1.25, 1, 2);
}

/** Bake a static container into one texture. Call refreshCache() after changing its children. */
export function cacheStatic(c: Container): void {
  c.cacheAsTexture({ resolution: bakeResolution(), antialias: true });
}

/** Bake on first call, re-bake afterwards: for static art that is occasionally redrawn (a restyle, a resize). */
export function refreshCache(c: Container): void {
  if (c.isCachedAsTexture) c.updateCacheTexture();
  else cacheStatic(c);
}

/* ------------------------------------------------------------------- shapes */

export interface ShadowOpts {
  /** Peak opacity at the centre of the shadow. */
  alpha?: number;
  offsetY?: number;
  /** How far the soft edge reaches beyond the shape. */
  spread?: number;
  color?: number;
}

/** Soft drop shadow built from stacked translucent rounded rects (no blur filter, so it can be baked). */
export function drawShadow(
  g: Graphics,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  o: ShadowOpts = {},
): void {
  const alpha = o.alpha ?? 0.4;
  const spread = o.spread ?? 14;
  const off = o.offsetY ?? 8;
  const color = o.color ?? 0x07030f;
  const layers = 6;
  for (let i = 0; i < layers; i++) {
    const grow = spread * (1 - i / layers);
    g.roundRect(x - grow, y - grow * 0.55 + off, w + grow * 2, h + grow * 2 * 0.85, r + grow).fill({
      color,
      alpha: (alpha / layers) * 1.25,
    });
  }
}

export interface BevelOpts {
  radius: number;
  /** Face gradient. */
  top: number;
  base?: number;
  bottom: number;
  rimTop: number;
  rimBottom: number;
  outline?: number;
  outlineWidth?: number;
  /** Bevel thickness between outline and face. */
  rim?: number;
  /** Opacity of the glossy highlight over the upper half (0 disables). */
  gloss?: number;
  /** Dark slab under the face; its visible strip is `depth` px tall. */
  lip?: { depth: number; color: number };
  shadow?: ShadowOpts | false;
}

/** Shadow and lip slab: the part of a bevel button that stays put while its face is pressed down. */
export function drawBevelBase(
  g: Graphics,
  x: number,
  y: number,
  w: number,
  h: number,
  o: BevelOpts,
): void {
  const r = Math.min(o.radius, w / 2, h / 2);
  const ow = o.outlineWidth ?? 5;
  const lipDepth = o.lip?.depth ?? 0;
  if (o.shadow !== false) {
    drawShadow(g, x, y + lipDepth, w, h, r, { alpha: 0.38, spread: 12, ...o.shadow, offsetY: o.shadow?.offsetY ?? 6 });
  }
  if (o.lip) {
    g.roundRect(x, y + lipDepth, w, h, r)
      .fill(o.lip.color)
      .stroke({ width: ow, color: o.outline ?? Color.outline, alignment: 1, join: 'round' });
  }
}

/**
 * The signature chunky face: thick outline, a light-to-dark bevel rim, a gradient body and a glossy
 * highlight over the upper half. (x, y, w, h) is the face rectangle.
 */
export function drawBevelFace(
  g: Graphics,
  x: number,
  y: number,
  w: number,
  h: number,
  o: BevelOpts,
): void {
  const r = Math.min(o.radius, w / 2, h / 2);
  const ow = o.outlineWidth ?? 5;
  g.roundRect(x, y, w, h, r)
    .fill(vGradient(o.rimTop, o.rimBottom))
    .stroke({ width: ow, color: o.outline ?? Color.outline, alignment: 1, join: 'round' });

  const rim = o.rim ?? 3;
  const ins = ow + rim;
  const iw = w - ins * 2;
  const ih = h - ins * 2 - rim * 0.6;
  const ir = Math.max(2, r - ins * 0.75);
  const body = o.base !== undefined ? vGradient3(o.top, o.base, o.bottom, 0.45) : vGradient(o.top, o.bottom);
  g.roundRect(x + ins, y + ins, iw, ih, ir).fill(body);

  const gloss = o.gloss ?? 0.3;
  if (gloss > 0) {
    g.roundRect(x + ins + 3, y + ins + 2, iw - 6, ih * 0.46, Math.max(2, ir - 2)).fill(
      glossGradient(gloss, gloss * 0.12),
    );
  }
}

/** Base + face in one Graphics, for chunky shapes that do not animate (card plates, static buttons). */
export function drawBevelRect(
  g: Graphics,
  x: number,
  y: number,
  w: number,
  h: number,
  o: BevelOpts,
): void {
  drawBevelBase(g, x, y, w, h, o);
  drawBevelFace(g, x, y, w, h, o);
}

export interface PillOpts {
  top: number;
  bottom: number;
  outline?: number;
  outlineWidth?: number;
  gloss?: number;
  shadow?: ShadowOpts | false;
  /** Inner 1-2px light edge along the top, for the "soft plastic" feel. */
  rim?: number;
  radius?: number;
}

/** Capsule (or any radius) with gradient, outline and gloss: currency chips, tags, toasts. */
export function drawPill(
  g: Graphics,
  x: number,
  y: number,
  w: number,
  h: number,
  o: PillOpts,
): void {
  const r = Math.min(o.radius ?? h / 2, h / 2, w / 2);
  const ow = o.outlineWidth ?? 4;
  if (o.shadow !== false) drawShadow(g, x, y, w, h, r, { alpha: 0.32, spread: 8, offsetY: 5, ...o.shadow });
  g.roundRect(x, y, w, h, r)
    .fill(vGradient(o.top, o.bottom))
    .stroke({ width: ow, color: o.outline ?? Color.outline, alignment: 1, join: 'round' });
  const gloss = o.gloss ?? 0.28;
  if (gloss > 0) {
    const gh = (h - ow * 2) * 0.46;
    g.roundRect(x + ow + 3, y + ow + 2, w - ow * 2 - 6, gh, Math.max(2, r - ow - 3)).fill(
      glossGradient(gloss, gloss * 0.1),
    );
  }
  if (o.rim) {
    g.roundRect(x + ow, y + ow, w - ow * 2, h - ow * 2, Math.max(2, r - ow)).stroke({
      width: 2,
      color: o.rim,
      alpha: 0.5,
      alignment: 0,
    });
  }
}

/* ------------------------------------------------------------------- panels */

export type PanelVariant = 'default' | 'light' | 'inset' | 'gold';

export interface PanelPalette {
  top: number;
  bottom: number;
  rim: number;
  outline: number;
  /** Colour readable on this surface. */
  text: number;
  textDim: number;
}

export const PanelColors: Record<PanelVariant, PanelPalette> = {
  default: { top: 0x4f3d99, bottom: 0x33256b, rim: 0x7b68c8, outline: 0x140a2e, text: 0xffffff, textDim: 0xcabfee },
  light: { top: 0xfffaf0, bottom: 0xf1dcb4, rim: 0xffffff, outline: 0x3a2150, text: 0x3a2150, textDim: 0x7d6794 },
  inset: { top: 0x1a1034, bottom: 0x26194a, rim: 0x5a49a0, outline: 0x0e0720, text: 0xffffff, textDim: 0xb9add6 },
  gold: { top: 0x4f3d99, bottom: 0x33256b, rim: 0xffe9a0, outline: 0x4d2a00, text: 0xffffff, textDim: 0xcabfee },
};

export interface PanelDrawOpts {
  radius?: number;
  shadow?: boolean;
}

/** (x, y, w, h) is the panel's outer rectangle. */
export function drawPanel(
  g: Graphics,
  x: number,
  y: number,
  w: number,
  h: number,
  variant: PanelVariant = 'default',
  o: PanelDrawOpts = {},
): void {
  const c = PanelColors[variant];
  const r = Math.min(o.radius ?? 36, w / 2, h / 2);
  const wantShadow = o.shadow ?? variant !== 'inset';

  if (variant === 'inset') {
    // A recessed well: darker than its surroundings, lit from below by a thin light lip.
    g.roundRect(x, y + 4, w, h, r).fill(c.rim);
    g.roundRect(x, y, w, h, r)
      .fill(vGradient(c.top, c.bottom))
      .stroke({ width: 4, color: c.outline, alignment: 1 });
    g.roundRect(x + 4, y + 4, w - 8, Math.min(h * 0.3, 60), Math.max(2, r - 4)).fill(
      gradient([
        [0, rgba(0x000000, 0.5)],
        [1, rgba(0x000000, 0)],
      ]),
    );
    return;
  }

  if (wantShadow) drawShadow(g, x, y, w, h, r, { alpha: 0.5, spread: 20, offsetY: 12 });

  if (variant === 'gold') {
    const f = 11;
    g.roundRect(x, y, w, h, r)
      .fill(gradient([[0, 0xfff1a8], [0.45, 0xffc83a], [1, 0xd9861a]]))
      .stroke({ width: 6, color: c.outline, alignment: 1, join: 'round' });
    g.roundRect(x + 6, y + 6, w - 12, h - 12, r - 6).stroke({ width: 3, color: 0xfffbe0, alpha: 0.7, alignment: 0 });
    g.roundRect(x + f, y + f, w - f * 2, h - f * 2, Math.max(6, r - f + 4))
      .fill(vGradient(c.top, c.bottom))
      .stroke({ width: 5, color: c.outline, alignment: 1 });
    g.roundRect(x + f + 5, y + f + 4, w - f * 2 - 10, (h - f * 2) * 0.22, Math.max(4, r - f - 2)).fill(glossGradient(0.14, 0.02));
    return;
  }

  g.roundRect(x, y, w, h, r)
    .fill(vGradient(c.top, c.bottom))
    .stroke({ width: 6, color: c.outline, alignment: 1, join: 'round' });
  // Inner bevel: a lit edge on top and a deeper tone along the bottom make the slab feel thick.
  g.roundRect(x + 6, y + 6, w - 12, h - 12, Math.max(4, r - 6)).stroke({
    width: 3,
    color: c.rim,
    alpha: variant === 'light' ? 0.9 : 0.55,
    alignment: 1,
  });
  g.roundRect(x + 9, y + h - 20, w - 18, 12, 6).fill({
    color: variant === 'light' ? 0xc79b5c : 0x180c3a,
    alpha: variant === 'light' ? 0.28 : 0.4,
  });
  g.roundRect(x + 9, y + 9, w - 18, Math.min(h * 0.18, 70), Math.max(4, r - 9)).fill(glossGradient(0.13, 0.0));
}

export interface RibbonColors {
  face: number;
  faceTop: number;
  tail: number;
  tailDark: number;
}

/**
 * A banner with swallow-tail ends folded behind it: the title ribbon of a popup. (x, y) is the
 * top-left of the central face; tails extend `tail` px past each side and sit 14 px lower.
 */
export function drawRibbon(
  g: Graphics,
  x: number,
  y: number,
  w: number,
  h: number,
  c: RibbonColors,
  tail = 36,
): void {
  const ow = 5;
  const drop = 14;
  const notch = 22;
  const inner = 34;
  // Back tails first (so the face overlaps them), each with a swallow-tail notch on the outside.
  const leftTail = [
    x + inner, y + drop,
    x - tail, y + drop,
    x - tail + notch, y + h / 2 + drop,
    x - tail, y + h + drop,
    x + inner, y + h + drop,
  ];
  const rightTail = [
    x + w - inner, y + drop,
    x + w + tail, y + drop,
    x + w + tail - notch, y + h / 2 + drop,
    x + w + tail, y + h + drop,
    x + w - inner, y + h + drop,
  ];
  g.poly(leftTail).fill(vGradient(c.tail, c.tailDark)).stroke({ width: ow, color: Color.outline, join: 'round' });
  g.poly(rightTail).fill(vGradient(c.tail, c.tailDark)).stroke({ width: ow, color: Color.outline, join: 'round' });
  // Dark folds where the tails tuck under the face.
  g.poly([x + 4, y + h, x + inner + 4, y + h, x + inner + 4, y + h + drop]).fill(c.tailDark).stroke({ width: ow, color: Color.outline, join: 'round' });
  g.poly([x + w - 4, y + h, x + w - inner - 4, y + h, x + w - inner - 4, y + h + drop]).fill(c.tailDark).stroke({ width: ow, color: Color.outline, join: 'round' });

  g.roundRect(x, y, w, h, 16)
    .fill(vGradient(c.faceTop, c.face))
    .stroke({ width: ow, color: Color.outline, alignment: 1, join: 'round' });
  g.roundRect(x + ow + 3, y + ow + 2, w - (ow + 3) * 2, (h - ow * 2) * 0.46, 10).fill(glossGradient(0.32, 0.04));
  g.roundRect(x + ow, y + h - ow - 7, w - ow * 2, 4, 2).fill({ color: shade(c.face, -0.25), alpha: 0.55 });
}
