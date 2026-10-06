/**
 * Textures the playfield bakes in code (no image files): rarity bases, class badges, cell glyphs and
 * projectile shapes. Each is drawn once into a texture so thousands of sprites batch into few draws.
 * They live for the whole session; the set is a few dozen small textures.
 */
import { Container, Graphics, Rectangle, Texture } from 'pixi.js';
import { game } from '@/core/game';
import { Color, RARITY_ORDER, Rarity, drawIcon, type IconName, type RarityId } from '@/ui';
import type { ClassId } from '@/game/api';
import { CELL_H, CELL_W } from '@/game/geometry';
import type { ProjectileShape } from './projectileLooks';

export const CLASS_COLOR: Record<ClassId, number> = {
  warrior: 0xff7a45,
  ranger: 0x4fc86a,
  mage: 0x4f9bff,
  trickster: 0xe45ccf,
};

const CLASS_ICON: Record<ClassId, IconName> = {
  warrior: 'class_warrior',
  ranger: 'class_ranger',
  mage: 'class_mage',
  trickster: 'class_trickster',
};

const OUTLINE = Color.outline;

/** Render `build`'s drawing into a texture covering `w` x `h` design px centred on the origin. */
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

/** A white glyph with a dark outline: tint it to recolour the white part while the outline stays dark. */
function outlined(g: Graphics, pts: number[]): void {
  g.poly(pts).fill(0xffffff).stroke({ width: 4, color: OUTLINE, join: 'round' });
}

export type CellGlyph = 'arrowUp' | 'swap' | 'blocked' | 'move';

export interface FieldArt {
  /** Base disc under a unit, by rarity. */
  base: Record<RarityId, Texture>;
  badge: Record<ClassId, Texture>;
  glyph: Record<CellGlyph, Texture>;
  /** Slashed circle shown over a unit that cannot act. */
  noAct: Texture;
  /** Rounded cell-sized shapes: a solid fill, a bright outline and four corner brackets. */
  tileFill: Texture;
  tileFrame: Texture;
  brackets: Texture;
  /** Dome outline over a hazard-shielded cell. */
  shield: Texture;
  projectile: Record<ProjectileShape, Texture>;
}

let cached: FieldArt | null = null;

export function fieldArt(): FieldArt {
  if (cached) return cached;
  cached = {
    base: bakeBases(),
    badge: bakeBadges(),
    glyph: bakeGlyphs(),
    noAct: bake(
      gfx((g) => {
        g.circle(0, 0, 11).fill({ color: 0x2a1746, alpha: 0.85 }).stroke({ width: 3.5, color: 0xff5a6a });
        g.moveTo(-7, 7).lineTo(7, -7).stroke({ width: 3.5, color: 0xff5a6a, cap: 'round' });
      }),
      32,
      32,
    ),
    tileFill: bake(gfx((g) => g.roundRect(-CELL_W / 2 + 4, -CELL_H / 2 + 4, CELL_W - 8, CELL_H - 8, 16).fill(0xffffff)), CELL_W, CELL_H),
    tileFrame: bake(
      gfx((g) => {
        g.roundRect(-CELL_W / 2 + 5, -CELL_H / 2 + 5, CELL_W - 10, CELL_H - 10, 16).stroke({ width: 9, color: 0xffffff, alpha: 0.3 });
        g.roundRect(-CELL_W / 2 + 5, -CELL_H / 2 + 5, CELL_W - 10, CELL_H - 10, 16).stroke({ width: 4.5, color: 0xffffff });
      }),
      CELL_W,
      CELL_H,
    ),
    brackets: bakeBrackets(),
    shield: bake(
      gfx((g) => {
        g.ellipse(0, 4, 46, 52).fill({ color: 0x9ad8ff, alpha: 0.13 });
        g.ellipse(0, 4, 46, 52).stroke({ width: 3, color: 0xdff4ff, alpha: 0.7 });
        g.ellipse(-14, -26, 14, 8).fill({ color: 0xffffff, alpha: 0.35 });
      }),
      100,
      112,
    ),
    projectile: bakeProjectiles(),
  };
  return cached;
}

function bakeBases(): Record<RarityId, Texture> {
  const out = {} as Record<RarityId, Texture>;
  RARITY_ORDER.forEach((id, index) => {
    const r = Rarity[id];
    const g = new Graphics();
    g.ellipse(0, 0, 42, 15).fill({ color: r.color, alpha: 0.22 });
    g.ellipse(0, 0, 35, 12).fill({ color: r.dark, alpha: 0.92 });
    g.ellipse(0, -1, 31, 9).fill({ color: r.color, alpha: 0.55 });
    g.ellipse(0, 0, 35, 12).stroke({ width: 2.5, color: r.light, alpha: 0.9 });
    // Rarity is also counted in dots along the front rim, so it never rests on colour alone.
    for (let i = 0; i <= index; i++) {
      const x = (i - index / 2) * 9;
      g.circle(x, 8.2, 2.3).fill({ color: r.light, alpha: 0.95 });
    }
    out[id] = bake(g, 88, 36);
  });
  return out;
}

function bakeBadges(): Record<ClassId, Texture> {
  const out = {} as Record<ClassId, Texture>;
  for (const id of Object.keys(CLASS_COLOR) as ClassId[]) {
    const c = new Container();
    c.addChild(
      gfx((g) => {
        g.circle(0, 1.5, 14).fill({ color: OUTLINE, alpha: 0.45 });
        g.circle(0, 0, 13).fill(CLASS_COLOR[id]).stroke({ width: 2.5, color: 0xffffff });
        g.circle(-3, -4, 6).fill({ color: 0xffffff, alpha: 0.28 });
      }),
    );
    const icon = drawIcon(CLASS_ICON[id], 17, 0xffffff, { cache: false });
    c.addChild(icon);
    out[id] = bake(c, 34, 34);
  }
  return out;
}

function bakeGlyphs(): Record<CellGlyph, Texture> {
  return {
    arrowUp: bake(gfx((g) => outlined(g, [0, -16, 15, 1, 6, 1, 6, 15, -6, 15, -6, 1, -15, 1])), 40, 44),
    swap: bake(
      gfx((g) => {
        outlined(g, [-16, -6, -2, -15, -2, -9, 15, -9, 15, -3, -2, -3, -2, 3]);
        outlined(g, [16, 6, 2, 15, 2, 9, -15, 9, -15, 3, 2, 3, 2, -3]);
      }),
      44,
      40,
    ),
    blocked: bake(
      gfx((g) => {
        g.moveTo(-9, -9).lineTo(9, 9).moveTo(9, -9).lineTo(-9, 9).stroke({ width: 10, color: OUTLINE, cap: 'round' });
        g.moveTo(-9, -9).lineTo(9, 9).moveTo(9, -9).lineTo(-9, 9).stroke({ width: 5, color: 0xffffff, cap: 'round' });
      }),
      36,
      36,
    ),
    move: bake(
      gfx((g) => {
        g.circle(0, 0, 13).stroke({ width: 8, color: OUTLINE, alpha: 0.9 });
        g.circle(0, 0, 13).stroke({ width: 4, color: 0xffffff });
        g.circle(0, 0, 4.5).fill(0xffffff).stroke({ width: 2.5, color: OUTLINE });
      }),
      40,
      40,
    ),
  };
}

function bakeBrackets(): Texture {
  const g = new Graphics();
  const hw = CELL_W / 2 - 7;
  const hh = CELL_H / 2 - 7;
  const len = 20;
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      g.moveTo(sx * hw, sy * (hh - len)).lineTo(sx * hw, sy * hh).lineTo(sx * (hw - len), sy * hh);
    }
  }
  g.stroke({ width: 9, color: OUTLINE, alpha: 0.85, cap: 'round', join: 'round' });
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      g.moveTo(sx * hw, sy * (hh - len)).lineTo(sx * hw, sy * hh).lineTo(sx * (hw - len), sy * hh);
    }
  }
  g.stroke({ width: 5, color: 0xffffff, cap: 'round', join: 'round' });
  return bake(g, CELL_W, CELL_H);
}

function bakeProjectiles(): Record<ProjectileShape, Texture> {
  const star = (g: Graphics, r: number, inner: number, points: number, rot: number): void => {
    const pts: number[] = [];
    for (let i = 0; i < points * 2; i++) {
      const a = rot + (i * Math.PI) / points;
      const rad = i % 2 === 0 ? r : inner;
      pts.push(Math.cos(a) * rad, Math.sin(a) * rad);
    }
    g.poly(pts);
  };
  return {
    pebble: bake(
      gfx((g) => {
        g.circle(0, 0, 6.5).fill(0x8d8478).stroke({ width: 2, color: 0x3d362f });
        g.circle(-2, -2.2, 2.2).fill({ color: 0xffffff, alpha: 0.55 });
      }),
      18,
      18,
    ),
    arrow: bake(
      gfx((g) => {
        g.moveTo(-17, 0).lineTo(11, 0).stroke({ width: 4.5, color: OUTLINE, cap: 'round' });
        g.moveTo(-17, 0).lineTo(11, 0).stroke({ width: 2, color: 0xd8b98a, cap: 'round' });
        g.poly([9, -5.5, 19, 0, 9, 5.5]).fill(0xe9eef5).stroke({ width: 2, color: OUTLINE, join: 'round' });
        g.poly([-18, -5, -11, -1, -11, 1, -18, 5, -15, 0]).fill(0xff6b6b).stroke({ width: 1.5, color: OUTLINE, join: 'round' });
      }),
      44,
      18,
    ),
    shuriken: bake(
      gfx((g) => {
        star(g, 12, 4, 4, Math.PI / 4);
        g.fill(0xcfd6e2).stroke({ width: 2, color: OUTLINE, join: 'round' });
        g.circle(0, 0, 2.6).fill(0x3a3f55);
      }),
      28,
      28,
    ),
    bullet: bake(
      gfx((g) => {
        g.roundRect(-11, -3.6, 22, 7.2, 3.6).fill(0xffe9a0).stroke({ width: 2, color: 0xb86a00 });
        g.roundRect(-9, -1.6, 14, 2.4, 1.2).fill({ color: 0xffffff, alpha: 0.85 });
      }),
      28,
      14,
    ),
    starArrow: bake(
      gfx((g) => {
        star(g, 12, 5.2, 5, -Math.PI / 2);
        g.fill(0xffd84a).stroke({ width: 2.4, color: 0xa65b00, join: 'round' });
        g.circle(0, 0, 3).fill({ color: 0xffffff, alpha: 0.9 });
      }),
      30,
      30,
    ),
    snowball: bake(
      gfx((g) => {
        g.circle(0, 0, 9).fill(0xf2f8ff).stroke({ width: 2, color: 0x6fa8e0 });
        g.circle(3, 3.5, 5.5).fill({ color: 0xbcd8f4, alpha: 0.7 });
        g.circle(-3, -3.2, 2.6).fill({ color: 0xffffff, alpha: 0.95 });
      }),
      24,
      24,
    ),
    fireball: bake(
      gfx((g) => {
        g.circle(0, 0, 9).fill(0xff8a1f).stroke({ width: 2, color: 0xa63a00 });
        g.circle(0, 0, 5.6).fill(0xffd24a);
        g.circle(-1.2, -1.4, 2.6).fill(0xfffbe0);
      }),
      24,
      24,
    ),
    bell: bake(
      gfx((g) => {
        g.moveTo(-8, 6).quadraticCurveTo(-8, -9, 0, -9).quadraticCurveTo(8, -9, 8, 6).closePath().fill(0xffcf3f).stroke({ width: 2, color: 0xa65b00, join: 'round' });
        g.roundRect(-9.5, 5, 19, 4, 2).fill(0xf2a91d).stroke({ width: 1.8, color: 0xa65b00 });
        g.circle(0, 10, 2.8).fill(0xa65b00);
        g.ellipse(-3, -2, 1.8, 4).fill({ color: 0xffffff, alpha: 0.7 });
      }),
      26,
      26,
    ),
    bone: bake(
      gfx((g) => {
        g.moveTo(-14, 0).lineTo(11, 0).stroke({ width: 4.5, color: OUTLINE, cap: 'round' });
        g.moveTo(-14, 0).lineTo(11, 0).stroke({ width: 2.2, color: 0xf6efe0, cap: 'round' });
        for (const x of [-8, -3, 2]) {
          g.moveTo(x, -5.5).lineTo(x, 5.5).stroke({ width: 4, color: OUTLINE, cap: 'round' });
          g.moveTo(x, -5.5).lineTo(x, 5.5).stroke({ width: 1.8, color: 0xf6efe0, cap: 'round' });
        }
        g.poly([-14, 0, -20, -6, -20, 6]).fill(0xf6efe0).stroke({ width: 2, color: OUTLINE, join: 'round' });
        g.circle(13, 0, 4).fill(0xf6efe0).stroke({ width: 2, color: OUTLINE });
      }),
      44,
      20,
    ),
    note: bake(
      gfx((g) => {
        g.ellipse(-3, 8, 5.4, 4).fill(0xff7ad9).stroke({ width: 2, color: OUTLINE });
        g.moveTo(1.8, 7).lineTo(1.8, -9).stroke({ width: 4, color: OUTLINE, cap: 'round' });
        g.moveTo(1.8, 7).lineTo(1.8, -9).stroke({ width: 2, color: 0xff7ad9, cap: 'round' });
        g.moveTo(1.8, -9).quadraticCurveTo(9, -6, 8, 1).stroke({ width: 4, color: OUTLINE, cap: 'round' });
        g.moveTo(1.8, -9).quadraticCurveTo(9, -6, 8, 1).stroke({ width: 2, color: 0xff7ad9, cap: 'round' });
      }),
      26,
      30,
    ),
    flask: bake(
      gfx((g) => {
        g.circle(0, 3, 8).fill(0x8cf06a).stroke({ width: 2, color: OUTLINE });
        g.roundRect(-3.2, -9, 6.4, 8, 1.5).fill(0xdff4ff).stroke({ width: 2, color: OUTLINE });
        g.roundRect(-4, -11, 8, 3.5, 1.5).fill(0xb98a54).stroke({ width: 1.6, color: OUTLINE });
        g.circle(-2.5, 1, 2.4).fill({ color: 0xffffff, alpha: 0.7 });
      }),
      24,
      28,
    ),
    coin: bake(
      gfx((g) => {
        g.circle(0, 0, 9.5).fill(0xffd23f).stroke({ width: 2, color: 0xa65b00 });
        g.circle(0, 0, 6).stroke({ width: 1.6, color: 0xe09b10 });
        g.moveTo(-2, -3).lineTo(-2, 3).moveTo(2, -3).lineTo(2, 3).stroke({ width: 1.6, color: 0xc27a08, cap: 'round' });
        g.circle(-3, -3.5, 2).fill({ color: 0xffffff, alpha: 0.7 });
      }),
      24,
      24,
    ),
    orb: bake(
      gfx((g) => {
        g.circle(0, 0, 7).fill(0xffffff).stroke({ width: 2, color: OUTLINE });
        g.circle(-2, -2, 2.4).fill({ color: 0xffffff, alpha: 0.9 });
      }),
      20,
      20,
    ),
  };
}
