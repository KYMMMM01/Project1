/**
 * Textures the playfield bakes in code (no image files): rank tags, class stickers, cell papers and
 * outlines, status stickers and projectile shapes. Each is drawn once into a texture so thousands of
 * sprites batch into few draws. Everything is flat paper: cream sticker borders, a thin ink edge, a
 * flat warm shadow, no gloss and no light. They live for the whole session.
 */
import { Container, Graphics, Rectangle, Texture } from 'pixi.js';
import { game } from '@/core/game';
import { CLASS_HUE } from '@/fx/palette';
import { TAU, mixColor } from '@/core/math';
import { Color, RARITY_ORDER, Rarity, TapeColors, drawDashedRect, drawIcon, drawPaperFace, type IconName, type RarityId } from '@/ui';
import type { ClassId } from '@/game/api';
import { CELL_H, CELL_W } from '@/game/geometry';
import type { ProjectileShape } from './projectileLooks';

const CLASS_ICON: Record<ClassId, IconName> = {
  warrior: 'class_warrior',
  ranger: 'class_ranger',
  mage: 'class_mage',
  trickster: 'class_trickster',
};

const INK = Color.ink;
const CREAM = Color.paperLight;

/** Render `draw` into a texture covering `w` x `h` design px centred on the origin. */
function bake(draw: Container, w: number, h: number, resolution = 2): Texture {
  const frame = new Rectangle(-Math.ceil(w / 2), -Math.ceil(h / 2), Math.ceil(w), Math.ceil(h));
  const tex = game.app.renderer.generateTexture({ target: draw, frame, resolution, antialias: true });
  draw.destroy({ children: true });
  return tex;
}

function gfx(draw: (g: Graphics) => void): Graphics {
  const g = new Graphics();
  draw(g);
  return g;
}

/** A round sticker: flat shadow, cream border, coloured face. Glyphs go on top in the caller. */
function disc(g: Graphics, r: number, fill: number): void {
  g.circle(1.5, 3, r + 2).fill({ color: Color.shadow, alpha: 0.3 });
  g.circle(0, 0, r + 2).fill(CREAM);
  g.circle(0, 0, r - 0.5).fill(fill);
}

/** A shape with a cream sticker border and a thin ink edge; `build` issues the path again for each pass. */
function piece(g: Graphics, build: (g: Graphics) => Graphics, fill: number): void {
  build(g).stroke({ width: 7, color: CREAM, join: 'round', cap: 'round' });
  build(g).fill(fill).stroke({ width: 1.8, color: INK, join: 'round', cap: 'round' });
}

/** A straight bar with the same sticker border. */
function bar(g: Graphics, x0: number, y0: number, x1: number, y1: number, width: number, color: number): void {
  g.moveTo(x0, y0).lineTo(x1, y1).stroke({ width: width + 6.5, color: CREAM, cap: 'round' });
  g.moveTo(x0, y0).lineTo(x1, y1).stroke({ width: width + 2.6, color: INK, cap: 'round' });
  g.moveTo(x0, y0).lineTo(x1, y1).stroke({ width, color, cap: 'round' });
}

/** Dashes round an ellipse (the dash covers `frac` of each period). */
function dashedEllipse(g: Graphics, cx: number, cy: number, rx: number, ry: number, count: number, frac: number, width: number, color: number): void {
  for (let i = 0; i < count; i++) {
    const a0 = (i / count) * TAU;
    const span = (frac / count) * TAU;
    for (let k = 0; k <= 3; k++) {
      const a = a0 + (span * k) / 3;
      const x = cx + Math.cos(a) * rx;
      const y = cy + Math.sin(a) * ry;
      if (k === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
  }
  g.stroke({ width, color, cap: 'round' });
}

function starPoints(r: number, inner: number, points: number, rot: number): number[] {
  const pts: number[] = [];
  for (let i = 0; i < points * 2; i++) {
    const a = rot + (i * Math.PI) / points;
    const rad = i % 2 === 0 ? r : inner;
    pts.push(Math.cos(a) * rad, Math.sin(a) * rad);
  }
  return pts;
}

export type CellGlyph = 'merge' | 'swap' | 'blocked' | 'move';
export type StatusSticker = 'slow' | 'freeze' | 'burn' | 'poison' | 'rage';

export interface FieldArt {
  /** A flat ellipse of the shadow colour; sprites set its opacity. */
  shadow: Texture;
  /** The rank tag under a cat's feet: a paper tag in the rarity hue with one pip per rank. */
  rank: Record<RarityId, Texture>;
  badge: Record<ClassId, Texture>;
  glyph: Record<CellGlyph, Texture>;
  /** Berry sticker with a slash, over a cat that cannot act. */
  noAct: Texture;
  /** A cell-sized paper (white, tint it) and its dashed outline (white, tint it). */
  tileFill: Texture;
  tileRing: Texture;
  /** Dashed round ring and dashed ground ellipse (white, tint them). */
  ring: Texture;
  groundRing: Texture;
  /** Flat dashed bubble over a hazard-shielded cat. */
  shield: Texture;
  status: Record<StatusSticker, Texture>;
  mark: { elite: Texture; boss: Texture };
  /** The paper star that circles a stunned enemy. */
  star: Texture;
  /** Kraft strip an enemy's health bar is painted into (9-slice). */
  barTrack: Texture;
  projectile: Record<ProjectileShape, Texture>;
}

let cached: FieldArt | null = null;

export function fieldArt(): FieldArt {
  if (cached) return cached;
  cached = {
    shadow: bake(gfx((g) => g.ellipse(0, 0, 40, 11).fill(Color.shadow)), 84, 24),
    rank: bakeRanks(),
    badge: bakeBadges(),
    glyph: bakeGlyphs(),
    noAct: bake(
      gfx((g) => {
        disc(g, 11, Color.berry);
        g.circle(0, 0, 6.2).stroke({ width: 2.6, color: CREAM });
        g.moveTo(-4.4, 4.4).lineTo(4.4, -4.4).stroke({ width: 2.6, color: CREAM, cap: 'round' });
      }),
      36,
      36,
    ),
    tileFill: bake(
      gfx((g) => drawPaperFace(g, -(CELL_W - 10) / 2, -(CELL_H - 10) / 2, { w: CELL_W - 10, h: CELL_H - 10, radius: 20, fill: Color.white, wobble: 0.9, edge: false, seed: 0x7117 })),
      CELL_W,
      CELL_H,
    ),
    tileRing: bake(
      gfx((g) => drawDashedRect(g, -(CELL_W - 14) / 2, -(CELL_H - 14) / 2, CELL_W - 14, CELL_H - 14, { radius: 24, color: Color.white, width: 4, dash: 15, gap: 10, seed: 0x7118 })),
      CELL_W,
      CELL_H,
    ),
    ring: bake(gfx((g) => dashedEllipse(g, 0, 0, 56, 56, 12, 0.56, 6, Color.white)), 128, 128),
    groundRing: bake(gfx((g) => dashedEllipse(g, 0, 0, 62, 24, 14, 0.55, 5, Color.white)), 136, 56),
    shield: bake(
      gfx((g) => {
        g.ellipse(0, 4, 46, 52).fill({ color: TapeColors.sky.base, alpha: 0.26 });
        g.ellipse(0, 4, 46, 52).stroke({ width: 4, color: CREAM });
      }),
      100,
      112,
    ),
    status: bakeStatus(),
    mark: {
      elite: bake(
        gfx((g) => {
          disc(g, 11, Color.mustard);
          g.poly(starPoints(8, 3.4, 5, -Math.PI / 2)).fill(CREAM).stroke({ width: 1.4, color: INK, join: 'round' });
        }),
        36,
        36,
      ),
      boss: bake(
        (() => {
          const c = new Container();
          c.addChild(gfx((g) => disc(g, 14, Color.berry)));
          c.addChild(drawIcon('crown', 17, CREAM, { cache: false }));
          return c;
        })(),
        44,
        44,
      ),
    },
    star: bake(
      gfx((g) => piece(g, (p) => p.poly(starPoints(14, 6.2, 5, -Math.PI / 2)), Color.mustard)),
      44,
      44,
    ),
    barTrack: bake(gfx((g) => g.roundRect(-20, -6, 40, 12, 6).fill(Color.track).stroke({ width: 1.8, color: Color.kraftDark })), 44, 16),
    projectile: bakeProjectiles(),
  };
  return cached;
}

function bakeRanks(): Record<RarityId, Texture> {
  const out = {} as Record<RarityId, Texture>;
  RARITY_ORDER.forEach((id, index) => {
    const r = Rarity[id];
    const pips = index + 1;
    const w = 24 + pips * 13;
    const g = new Graphics();
    g.roundRect(-w / 2 + 1, -13 + 3, w, 26, 13).fill({ color: Color.shadow, alpha: 0.3 });
    g.roundRect(-w / 2, -13, w, 26, 13).fill(r.color).stroke({ width: 2.5, color: r.dark });
    // One pip per rank, so the rank never rests on the hue alone.
    for (let i = 0; i < pips; i++) g.circle((i - (pips - 1) / 2) * 13, 0, 4.8).fill(CREAM).stroke({ width: 1.5, color: r.dark });
    out[id] = bake(g, w + 8, 36);
  });
  return out;
}

function bakeBadges(): Record<ClassId, Texture> {
  const out = {} as Record<ClassId, Texture>;
  for (const id of Object.keys(CLASS_HUE) as ClassId[]) {
    const c = new Container();
    c.addChild(gfx((g) => disc(g, 14, CLASS_HUE[id])));
    c.addChild(drawIcon(CLASS_ICON[id], 16, CREAM, { cache: false }));
    out[id] = bake(c, 40, 40);
  }
  return out;
}

function bakeGlyphs(): Record<CellGlyph, Texture> {
  const sticker = (fill: number, glyph: (g: Graphics) => void): Texture =>
    bake(
      gfx((g) => {
        disc(g, 15, fill);
        glyph(g);
      }),
      44,
      44,
    );
  return {
    merge: sticker(Color.leaf, (g) => g.poly([0, -9, 9, 0, 3.6, 0, 3.6, 9, -3.6, 9, -3.6, 0, -9, 0]).fill(CREAM)),
    swap: sticker(Color.mustard, (g) => {
      g.poly([-10, -3.6, -2, -9, -2, -5.2, 9, -5.2, 9, -2, -2, -2, -2, 1.6]).fill(CREAM);
      g.poly([10, 3.6, 2, 9, 2, 5.2, -9, 5.2, -9, 2, 2, 2, 2, -1.6]).fill(CREAM);
    }),
    blocked: sticker(Color.berry, (g) => {
      g.moveTo(-6, -6).lineTo(6, 6).moveTo(6, -6).lineTo(-6, 6).stroke({ width: 4, color: CREAM, cap: 'round' });
    }),
    move: sticker(Color.teal, (g) => {
      g.circle(0, 0, 7).stroke({ width: 3, color: CREAM });
      g.circle(0, 0, 2.4).fill(CREAM);
    }),
  };
}

function bakeStatus(): Record<StatusSticker, Texture> {
  const sticker = (fill: number, glyph: (g: Graphics) => void): Texture =>
    bake(
      gfx((g) => {
        disc(g, 11, fill);
        glyph(g);
      }),
      36,
      36,
    );
  return {
    slow: sticker(Color.teal, (g) => {
      g.circle(0, 0, 6).stroke({ width: 2.2, color: CREAM });
      g.moveTo(0, -3.4).lineTo(0, 0).lineTo(3, 2).stroke({ width: 2.2, color: CREAM, cap: 'round', join: 'round' });
    }),
    freeze: sticker(TapeColors.sky.base, (g) => {
      for (let i = 0; i < 3; i++) {
        const a = (i * Math.PI) / 3;
        g.moveTo(Math.cos(a) * -6.4, Math.sin(a) * -6.4).lineTo(Math.cos(a) * 6.4, Math.sin(a) * 6.4);
      }
      g.stroke({ width: 2.2, color: CREAM, cap: 'round' });
    }),
    burn: sticker(Color.coral, (g) => {
      g.moveTo(0, -7).quadraticCurveTo(7, -1, 4.6, 4).quadraticCurveTo(0, 8, -4.6, 4).quadraticCurveTo(-6, -1, 0, -7).fill(CREAM);
      g.circle(0, 3.6, 2.4).fill(Color.mustard);
    }),
    poison: sticker(Color.leaf, (g) => {
      g.moveTo(0, -7).quadraticCurveTo(7, 1, 4.4, 4.6).quadraticCurveTo(0, 8, -4.4, 4.6).quadraticCurveTo(-7, 1, 0, -7).fill(CREAM);
    }),
    rage: sticker(Color.berry, (g) => {
      g.roundRect(-1.8, -7, 3.6, 9, 1.8).fill(CREAM);
      g.circle(0, 5, 2.1).fill(CREAM);
    }),
  };
}

function bakeProjectiles(): Record<ProjectileShape, Texture> {
  const metal = mixColor(Color.paperDim, Color.ink, 0.25);
  return {
    pebble: bake(gfx((g) => piece(g, (p) => p.circle(0, 0, 6.5), mixColor(Color.kraftDark, Color.ink, 0.3))), 26, 26),
    arrow: bake(
      gfx((g) => {
        bar(g, -16, 0, 10, 0, 2.6, Color.kraft);
        piece(g, (p) => p.poly([9, -5, 19, 0, 9, 5]), metal);
        piece(g, (p) => p.poly([-18, -5, -11, -1, -11, 1, -18, 5, -15, 0]), Color.coral);
      }),
      52,
      26,
    ),
    shuriken: bake(
      gfx((g) => {
        piece(g, (p) => p.poly(starPoints(12, 4, 4, Math.PI / 4)), metal);
        g.circle(0, 0, 2.6).fill(INK);
      }),
      36,
      36,
    ),
    bullet: bake(gfx((g) => piece(g, (p) => p.roundRect(-11, -3.6, 22, 7.2, 3.6), Color.mustard)), 36, 22),
    starArrow: bake(
      gfx((g) => {
        piece(g, (p) => p.poly(starPoints(12, 5.2, 5, -Math.PI / 2)), Color.mustard);
        g.circle(0, 0, 3).fill(CREAM);
      }),
      38,
      38,
    ),
    snowball: bake(gfx((g) => piece(g, (p) => p.circle(0, 0, 9), TapeColors.sky.base)), 32, 32),
    fireball: bake(
      gfx((g) => {
        piece(g, (p) => p.circle(0, 0, 9), Color.coral);
        g.circle(0, 0, 5).fill(Color.mustard);
      }),
      32,
      32,
    ),
    bell: bake(
      gfx((g) => {
        piece(g, (p) => p.moveTo(-8, 6).quadraticCurveTo(-8, -9, 0, -9).quadraticCurveTo(8, -9, 8, 6).closePath(), Color.mustard);
        g.circle(0, 9, 2.8).fill(Color.mustardDark);
      }),
      34,
      34,
    ),
    bone: bake(
      gfx((g) => {
        bar(g, -12, 0, 10, 0, 4.4, Color.paperLight);
        for (const [x, y] of [[-14, -4], [-14, 4], [12, -4], [12, 4]] as const) piece(g, (p) => p.circle(x, y, 3.2), Color.paperLight);
      }),
      52,
      28,
    ),
    note: bake(
      gfx((g) => {
        bar(g, 1.8, 7, 1.8, -9, 2.4, Color.berry);
        bar(g, 1.8, -9, 8, -2, 2.4, Color.berry);
        piece(g, (p) => p.ellipse(-3, 8, 5.4, 4), Color.berry);
      }),
      34,
      38,
    ),
    flask: bake(
      gfx((g) => {
        piece(g, (p) => p.roundRect(-3.2, -9, 6.4, 8, 1.5), Color.paperLight);
        piece(g, (p) => p.circle(0, 3, 8), Color.leaf);
        piece(g, (p) => p.roundRect(-4, -11, 8, 3.5, 1.5), Color.kraftDark);
      }),
      32,
      36,
    ),
    coin: bake(
      gfx((g) => {
        piece(g, (p) => p.circle(0, 0, 9.5), Color.mustard);
        g.circle(0, 0, 5.6).stroke({ width: 1.6, color: Color.mustardDark });
      }),
      32,
      32,
    ),
    orb: bake(gfx((g) => piece(g, (p) => p.circle(0, 0, 7), CREAM)), 28, 28),
  };
}
