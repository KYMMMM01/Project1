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
import { Light, drawPaw, drawSunMark, drawTargetMark } from '@/fx';
import { RING_LOOKS, RING_SIZES, type RingLook } from './shieldRing';

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
/** What an area is doing to an enemy standing in it: a small tag on the enemy that says so (one per area kind). */
export type ZoneMark = 'frost' | 'brew' | 'void' | 'haste' | 'heal';

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
  /** Flat dashed ring round a hazard-shielded cat (opaque paper, like the selection and range rings). */
  shield: Texture;
  status: Record<StatusSticker, Texture>;
  zoneMark: Record<ZoneMark, Texture>;
  mark: { elite: Texture; boss: Texture };
  /** The paper star that circles a stunned enemy. */
  star: Texture;
  /** Kraft strip an enemy's health bar is painted into (9-slice). */
  barTrack: Texture;
  /** The sun sticker of a sunbeam cell's corner and of a cat standing in the light. */
  sunMark: Texture;
  /** The coral crosshair on an enemy the laser has marked. */
  targetMark: Texture;
  /** The rings of an enemy's shield, baked at each of `RING_SIZES` in each look: indexed by size. */
  shieldRing: Readonly<Record<RingLook, readonly Texture[]>>;
  /** The sticker a summon tosses from the button to its cell, in the rarity's colour (the colour comes first). */
  toss: Record<RarityId, Texture>;
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
    shield: bake(gfx((g) => dashedEllipse(g, 0, 4, 46, 52, 14, 0.62, 5, TapeColors.sky.base)), 100, 112),
    status: bakeStatus(),
    zoneMark: bakeZoneMarks(),
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
    sunMark: bake(gfx((g) => drawSunMark(g, 19)), 48, 48),
    targetMark: bake(gfx((g) => drawTargetMark(g, 19)), 48, 48),
    shieldRing: bakeShieldRings(),
    toss: bakeTosses(),
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

function bakeTosses(): Record<RarityId, Texture> {
  const out = {} as Record<RarityId, Texture>;
  for (const id of RARITY_ORDER) {
    const c = new Container();
    c.addChild(
      gfx((g) => {
        disc(g, 25, Rarity[id].color);
        g.circle(0, 0, 25).stroke({ width: 2, color: Rarity[id].dark });
      }),
      gfx((g) => drawPaw(g, 1.5)),
    );
    out[id] = bake(c, 64, 64);
  }
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

/** Round tags a little bigger than the status stickers, in the area's own paper, each with a glyph that is not a status glyph. */
function bakeZoneMarks(): Record<ZoneMark, Texture> {
  const tag = (fill: number, glyph: (g: Graphics) => void): Texture =>
    bake(
      gfx((g) => {
        disc(g, 13, fill);
        glyph(g);
      }),
      40,
      40,
    );
  return {
    // A six-armed paper flake with a dot at the end of each arm.
    frost: tag(mixColor(TapeColors.sky.base, Rarity.rare.color, 0.35), (g) => {
      for (let i = 0; i < 3; i++) {
        const a = (i * Math.PI) / 3 + Math.PI / 6;
        g.moveTo(Math.cos(a) * -7, Math.sin(a) * -7).lineTo(Math.cos(a) * 7, Math.sin(a) * 7);
      }
      g.stroke({ width: 2, color: CREAM, cap: 'round' });
      for (let i = 0; i < 6; i++) g.circle(Math.cos((i * Math.PI) / 3 + Math.PI / 6) * 7.6, Math.sin((i * Math.PI) / 3 + Math.PI / 6) * 7.6, 1.5).fill(CREAM);
    }),
    // Two bubbles, a big one and a small one.
    brew: tag(Color.leaf, (g) => {
      g.circle(-1.5, 1.5, 5.4).stroke({ width: 2.2, color: CREAM });
      g.circle(4.6, -4.6, 2.5).stroke({ width: 1.8, color: CREAM });
    }),
    // A spiral winding in.
    void: tag(Color.inkSoft, (g) => {
      for (let i = 0; i <= 28; i++) {
        const k = i / 28;
        const a = k * Math.PI * 3.4;
        const r = 7.6 * (1 - k * 0.86);
        if (i === 0) g.moveTo(Math.cos(a) * r, Math.sin(a) * r);
        else g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      g.stroke({ width: 2.2, color: CREAM, cap: 'round', join: 'round' });
    }),
    // Two chevrons: faster.
    haste: tag(Color.coral, (g) => {
      for (const dx of [-3.4, 2.6]) g.moveTo(dx - 2.4, -5.4).lineTo(dx + 2.4, 0).lineTo(dx - 2.4, 5.4);
      g.stroke({ width: 2.6, color: CREAM, cap: 'round', join: 'round' });
    }),
    // A plus: mended.
    heal: tag(Color.berry, (g) => {
      g.moveTo(-6, 0).lineTo(6, 0).moveTo(0, -6).lineTo(0, 6).stroke({ width: 3, color: CREAM, cap: 'round' });
    }),
  };
}

/**
 * The rings of a shield (`shieldRing.ts`): a dark-brown line with a cobalt line inside it and a very faint cobalt tint; dashed when the
 * shield is nearly gone; lit (a pale line) for the instant after a hit.
 */
function bakeShieldRings(): Record<RingLook, Texture[]> {
  const out: Record<RingLook, Texture[]> = { whole: [], dashed: [], lit: [] };
  for (const look of RING_LOOKS) {
    for (const size of RING_SIZES) {
      const r = size / 2 - 3;
      out[look].push(
        bake(
          gfx((g) => {
            if (look !== 'dashed') g.circle(0, 0, r).fill({ color: Light.shield, alpha: 0.07 });
            const line = (width: number, color: number): void => {
              if (look === 'dashed') {
                const count = 12;
                for (let i = 0; i < count; i++) {
                  const a0 = (i / count) * TAU;
                  g.moveTo(Math.cos(a0) * r, Math.sin(a0) * r).arc(0, 0, r, a0, a0 + (0.5 / count) * TAU);
                }
              } else g.circle(0, 0, r);
              g.stroke({ width, color, cap: 'round', join: 'round' });
            };
            line(5.4, INK);
            line(2.6, look === 'lit' ? Light.shieldRim : Light.shield);
          }),
          size + 8,
          size + 8,
        ),
      );
    }
  }
  return out;
}
