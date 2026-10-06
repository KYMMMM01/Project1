import { FillGradient, Container, Graphics, type Texture } from 'pixi.js';
import { game } from '@/core/game';
import { clamp, mixColor } from '@/core/math';
import { Color } from './theme';
import { rgba } from './colors';
import { drawPaper, drawPaperFace, drawPaperShadow, edgeTone, type PaperOpts } from './paper';
import { hash32, paintPath, type TornSides } from './paperMath';

/* ---------------------------------------------------------------- gradients */

type StopColor = number | string;
export type GradStop = readonly [offset: number, color: StopColor];

const gradientCache = new Map<string, FillGradient>();

/**
 * Shared vertical/horizontal gradient. 'local' texture space stretches it over each shape's own
 * bounds, so one instance serves every size, and sharing keeps the GPU texture count tiny (each
 * FillGradient owns a texture and, per Pixi, must otherwise be destroyed by hand). The paper kit uses
 * gradients only for scene fades (a vignette over artwork), never on a piece of paper.
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

/**
 * Retired: the kit is matte, so there is no glossy highlight to paint. Kept so older call sites still
 * compile; it returns a fully transparent gradient. Delete the highlight shape where you find one.
 */
export function glossGradient(_topAlpha: number, _bottomAlpha?: number): FillGradient {
  return gradient([
    [0, rgba(0xffffff, 0)],
    [1, rgba(0xffffff, 0)],
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

/** Soft round light over artwork or a dim (a burst behind a reward). Never on a kit component. */
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
  /** Strength of the old soft shadow; the flat paper shadow maps it to 12-30 % alpha. */
  alpha?: number;
  /** Vertical offset; its sign says which side the shadow falls on. Mapped to 3-7 px. */
  offsetY?: number;
  /** Accepted for old call sites; a flat shadow has no soft edge. */
  spread?: number;
}

/**
 * Flat warm-brown shadow of a rounded rectangle, offset below it: the piece-of-paper-on-a-table
 * shadow. (x, y, w, h) is the rectangle that casts it, r its corner radius.
 */
export function drawShadow(g: Graphics, x: number, y: number, w: number, h: number, r: number, o: ShadowOpts = {}): void {
  const off = o.offsetY ?? 6;
  const dy = Math.sign(off || 1) * clamp(Math.abs(off) * 0.8, 3, 7);
  const alpha = clamp((o.alpha ?? 0.4) * 0.55, 0.12, 0.3);
  drawPaperShadow(g, x, y, { w, h, radius: r, fill: Color.shadow, shadow: dy, shadowAlpha: alpha });
}

/* ------------------------------------------------------------------- panels */

export type PanelVariant = 'default' | 'light' | 'inset' | 'gold' | 'kraft';

export interface PanelPalette {
  fill: number;
  edge: number;
  /** Colour readable on this surface. */
  text: number;
  textDim: number;
}

export const PanelColors: Record<PanelVariant, PanelPalette> = {
  default: { fill: Color.panel, edge: edgeTone(Color.panel), text: Color.ink, textDim: Color.inkSoft },
  light: { fill: Color.panelLight, edge: edgeTone(Color.panelLight), text: Color.ink, textDim: Color.inkSoft },
  inset: { fill: Color.paperDim, edge: mixColor(Color.paperDim, Color.shadow, 0.4), text: Color.ink, textDim: Color.inkSoft },
  gold: { fill: Color.panel, edge: Color.mustardDark, text: Color.ink, textDim: Color.inkSoft },
  kraft: { fill: Color.kraft, edge: Color.kraftDark, text: Color.ink, textDim: 0x5c4030 },
};

export interface PanelDrawOpts {
  radius?: number;
  shadow?: boolean;
  /** Sides torn instead of cut. */
  torn?: TornSides;
  seed?: number;
}

/** A sheet of paper. (x, y, w, h) is its outer rectangle. */
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
  const radius = Math.min(o.radius ?? 32, w / 2, h / 2);
  const piece: PaperOpts = { w, h, radius, fill: c.fill, edge: c.edge, torn: o.torn, seed: o.seed };

  if (variant === 'inset') {
    // A recessed well: darker than the sheet it sits in, no shadow, a firmer rim.
    drawPaperFace(g, x, y, { ...piece, grain: false });
    g.roundRect(x + 5, y + 5, w - 10, h - 10, Math.max(4, radius - 5)).stroke({ width: 2, color: c.edge, alpha: 0.22 });
    return;
  }

  const lifted = o.shadow ?? true;
  if (variant === 'gold') {
    // Mustard backing sheet with a cream sheet laid on it: reads as a card with a coloured border.
    drawPaper(g, x, y, { ...piece, fill: Color.mustard, edge: Color.mustardDark, shadow: lifted ? 5 : false, grain: false });
    const f = 10;
    drawPaperFace(g, x + f, y + f, { ...piece, w: w - f * 2, h: h - f * 2, radius: Math.max(6, radius - f + 4), seed: (o.seed ?? 0) + 7 });
    return;
  }
  drawPaper(g, x, y, { ...piece, shadow: lifted ? 5 : false });
}

/* -------------------------------------------------------------------- pills */

export interface PillOpts {
  /** The paper colour is the middle of these two (a flat tone: the kit draws no gradients on paper). */
  top: number;
  bottom: number;
  /** Colour of the thin line just inside the cut. */
  outline?: number;
  /** Accepted for old call sites; the line is always thin. */
  outlineWidth?: number;
  /** Accepted for old call sites; the kit is matte. */
  gloss?: number;
  /** Accepted for old call sites; ignored. */
  rim?: number;
  shadow?: ShadowOpts | false;
  radius?: number;
  seed?: number;
}

/** Capsule (or any radius) cut from paper: chips, tags, strips. */
export function drawPill(g: Graphics, x: number, y: number, w: number, h: number, o: PillOpts): void {
  const radius = Math.min(o.radius ?? h / 2, h / 2, w / 2);
  const fill = mixColor(o.top, o.bottom, 0.5);
  drawPaper(g, x, y, {
    w,
    h,
    radius,
    fill,
    edge: o.outline ?? edgeTone(fill),
    seed: o.seed,
    shadow: o.shadow === false ? false : 5,
  });
}

/* -------------------------------------------------------------- painted fills */

const paintCache = new Map<string, Texture>();

/**
 * A brush-painted bar of one flat colour baked once into a texture (round left cap, uneven leading
 * edge on the right), meant for a 9-slice whose caps are h / 2 wide: stretching it keeps both ends and
 * never rebuilds geometry, so a bar or slider can follow a finger every frame.
 */
export function paintTexture(color: number, h: number): Texture {
  const key = `${color}:${h}`;
  let tex = paintCache.get(key);
  if (tex) return tex;
  const w = Math.max(h * 3, 24);
  const c = new Container();
  const g = new Graphics();
  g.poly(paintPath(w, h, hash32(color, Math.round(h), 0xba7))).fill(color);
  c.addChild(g);
  tex = game.app.renderer.generateTexture({ target: c, resolution: Math.max(2, bakeResolution()), antialias: true });
  c.destroy({ children: true });
  paintCache.set(key, tex);
  return tex;
}
