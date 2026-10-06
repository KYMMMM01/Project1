import { Container, Graphics } from 'pixi.js';
import { cacheStatic, drawShadow } from '@/ui';
import { BOARD_H, BOARD_W, BOARD_X, BOARD_Y, CELL_COUNT, CELL_H, CELL_W, COLS, ROWS } from '@/game/geometry';
import { darken, lighten } from '@/core/math';
import { perimeterDashes, type RugSkin } from './rugSkins';

/** Margin of the mat around the 5 x 4 cells; it is also the width of the outer band. */
export const RUG_PAD = 12;
export const RUG_X = BOARD_X - RUG_PAD;
export const RUG_Y = BOARD_Y - RUG_PAD;
export const RUG_W = BOARD_W + 2 * RUG_PAD;
export const RUG_H = BOARD_H + 2 * RUG_PAD;
const RADIUS = 30;

const IX = RUG_PAD;
const IY = RUG_PAD;

type Pattern = (g: Graphics, skin: RugSkin) => void;

function stripes(g: Graphics, skin: RugSkin): void {
  const w = 36;
  for (let i = 0; i * w < BOARD_W; i += 2) g.rect(IX + (i + 1) * w, IY, w, BOARD_H);
  g.fill({ color: skin.alt, alpha: 0.65 });
  for (let i = 0; i * w < BOARD_W; i++) g.rect(IX + i * w + w - 1.5, IY, 3, BOARD_H);
  g.fill({ color: skin.accent, alpha: 0.12 });
}

function checks(g: Graphics, skin: RugSkin): void {
  const w = CELL_W / 2;
  const h = CELL_H / 2;
  for (let r = 0; r < ROWS * 2; r++) for (let c = 0; c < COLS * 2; c++) if ((r + c) % 2 === 1) g.rect(IX + c * w, IY + r * h, w, h);
  g.fill({ color: skin.alt, alpha: 0.6 });
}

function dots(g: Graphics, skin: RugSkin): void {
  const sx = CELL_W / 2;
  const sy = CELL_H / 2;
  for (let r = 0; r < ROWS * 2; r++) {
    for (let c = 0; c < COLS * 2; c++) {
      const x = IX + (c + 0.5 + (r % 2) * 0.5) * sx;
      if (x > IX + BOARD_W - 8) continue;
      g.circle(x, IY + (r + 0.5) * sy, 6);
    }
  }
  g.fill({ color: skin.accent, alpha: 0.5 });
}

function pawPrint(g: Graphics, x: number, y: number, rot: number, s: number): void {
  const c = Math.cos(rot);
  const n = Math.sin(rot);
  const at = (px: number, py: number): [number, number] => [x + (px * c - py * n) * s, y + (px * n + py * c) * s];
  const [mx, my] = at(0, 3);
  g.ellipse(mx, my, 8.5 * s, 7 * s);
  for (const [tx, ty] of [[-9.5, -4], [-3.4, -10], [3.4, -10], [9.5, -4]] as const) {
    const [px, py] = at(tx, ty);
    g.ellipse(px, py, 3.6 * s, 4.4 * s);
  }
}

function paws(g: Graphics, skin: RugSkin): void {
  // Prints walk across the cell boundaries (under the cats' feet is where they would be hidden).
  for (let r = 1; r < ROWS; r++) {
    for (let c = 0; c <= COLS; c++) {
      const x = IX + c * CELL_W + (r % 2 === 0 ? 0 : CELL_W / 2);
      if (x < IX + 20 || x > IX + BOARD_W - 20) continue;
      pawPrint(g, x, IY + r * CELL_H, (c + r) % 2 === 0 ? 0.35 : -0.35, 1.1);
    }
  }
  g.fill({ color: skin.accent, alpha: 0.42 });
}

function waves(g: Graphics, skin: RugSkin): void {
  const step = 28;
  for (let k = 0; k * step < BOARD_H - 10; k++) {
    const y = IY + 18 + k * step;
    g.moveTo(IX, y + Math.sin(k * 0.9) * 5);
    for (let x = 6; x <= BOARD_W; x += 6) g.lineTo(IX + x, y + Math.sin((x / 54) * Math.PI * 2 + k * 0.9) * 5);
  }
  g.stroke({ width: 6, color: skin.alt, alpha: 0.7, cap: 'round', join: 'round' });
  for (let k = 0; k * step < BOARD_H - 10; k++) {
    const y = IY + 18 + k * step + 9;
    g.moveTo(IX, y + Math.sin(k * 0.9) * 5);
    for (let x = 6; x <= BOARD_W; x += 6) g.lineTo(IX + x, y + Math.sin((x / 54) * Math.PI * 2 + k * 0.9) * 5);
  }
  g.stroke({ width: 2.5, color: skin.accent, alpha: 0.35, cap: 'round', join: 'round' });
}

function star(g: Graphics, cx: number, cy: number, r: number, inner: number, rot: number): void {
  const pts: number[] = [];
  for (let i = 0; i < 10; i++) {
    const a = rot + (i * Math.PI) / 5;
    const rad = i % 2 === 0 ? r : inner;
    pts.push(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad);
  }
  g.poly(pts);
}

function stars(g: Graphics, skin: RugSkin): void {
  const sx = CELL_W / 2;
  const sy = CELL_H / 2;
  let n = 0;
  for (let r = 0; r < ROWS * 2; r++) {
    for (let c = 0; c < COLS * 2; c++) {
      const x = IX + (c + 0.5 + (r % 2) * 0.5) * sx;
      if (x > IX + BOARD_W - 10) continue;
      const big = (n++ % 3) === 0;
      star(g, x, IY + (r + 0.5) * sy, big ? 9 : 6, big ? 4 : 2.6, -Math.PI / 2 + (n % 2) * 0.3);
    }
  }
  g.fill({ color: skin.accent, alpha: 0.48 });
}

function diamond(g: Graphics, skin: RugSkin): void {
  const hw = CELL_W / 4;
  const hh = CELL_H / 4;
  const rhombus = (cx: number, cy: number): void => {
    g.poly([cx, cy - hh, cx + hw, cy, cx, cy + hh, cx - hw, cy]);
  };
  for (let j = 0; j < ROWS * 2; j++) for (let i = 0; i < COLS * 2; i++) rhombus(IX + hw + i * hw * 2, IY + hh + j * hh * 2);
  g.fill({ color: skin.alt, alpha: 0.62 });
  for (let j = 1; j < ROWS * 2; j++) for (let i = 1; i < COLS * 2; i++) rhombus(IX + i * hw * 2, IY + j * hh * 2);
  g.stroke({ width: 2.2, color: skin.accent, alpha: 0.42, join: 'round' });
}

const PATTERNS: Record<RugSkin['pattern'], Pattern | null> = {
  plain: null,
  stripes,
  checks,
  dots,
  paws,
  waves,
  stars,
  diamond,
};

/**
 * The mat under the board, drawn once from a skin and baked into one texture: soft drop shadow,
 * an outer band with stitching, a calm pattern, and twenty faint inset tiles. Its origin is the
 * mat's top-left corner at (RUG_X, RUG_Y) in field space.
 */
export function buildRug(skin: RugSkin): Container {
  const root = new Container();
  root.label = 'rug';
  const g = new Graphics();
  drawShadow(g, 0, 0, RUG_W, RUG_H, RADIUS, { alpha: 0.5, spread: 20, offsetY: 12 });
  g.roundRect(0, 0, RUG_W, RUG_H, RADIUS).fill(skin.border);
  g.roundRect(0, 0, RUG_W, RUG_H, RADIUS).stroke({ width: 2.5, color: lighten(skin.border, 0.35), alpha: 0.5, alignment: 1 });
  g.roundRect(RUG_PAD, RUG_PAD, BOARD_W, BOARD_H, 12).fill(skin.base);
  // Fine weave: horizontal threads at a whisper of contrast keep large areas from looking flat.
  for (let y = IY + 3; y < IY + BOARD_H; y += 7) g.rect(IX, y, BOARD_W, 1.6);
  g.fill({ color: darken(skin.base, 0.5), alpha: 0.08 });
  PATTERNS[skin.pattern]?.(g, skin);
  // Band bevel: a light inner lip and a dark inner shadow where the field meets the band.
  g.roundRect(RUG_PAD, RUG_PAD, BOARD_W, BOARD_H, 12).stroke({ width: 5, color: darken(skin.border, 0.4), alpha: 0.5, alignment: 1 });
  g.roundRect(RUG_PAD - 1, RUG_PAD - 1, BOARD_W + 2, BOARD_H + 2, 13).stroke({ width: 2, color: lighten(skin.border, 0.45), alpha: 0.35 });

  const dashes = perimeterDashes(RUG_W - 12, RUG_H - 12, RADIUS - 6, 9, 7);
  for (const d of dashes) g.moveTo(6 + d.x0, 6 + d.y0).lineTo(6 + d.x1, 6 + d.y1);
  g.stroke({ width: 3, color: skin.stitch, alpha: 0.9, cap: 'round' });

  // Twenty inset tiles: a dark recess with a light lower lip, so they read as pockets, not buttons.
  for (let c = 0; c < CELL_COUNT; c++) {
    const x = IX + (c % COLS) * CELL_W + 5;
    const y = IY + Math.floor(c / COLS) * CELL_H + 5;
    g.roundRect(x, y, CELL_W - 10, CELL_H - 10, 16).fill({ color: 0x000000, alpha: 0.13 });
  }
  for (let c = 0; c < CELL_COUNT; c++) {
    const x = IX + (c % COLS) * CELL_W + 5;
    const y = IY + Math.floor(c / COLS) * CELL_H + 5;
    g.roundRect(x, y, CELL_W - 10, CELL_H - 10, 16).stroke({ width: 3, color: 0x000000, alpha: 0.14, alignment: 1 });
    g.roundRect(x + 1.5, y + 2.5, CELL_W - 13, CELL_H - 13, 15).stroke({ width: 1.8, color: 0xffffff, alpha: 0.09 });
  }
  root.addChild(g);
  cacheStatic(root);
  return root;
}
