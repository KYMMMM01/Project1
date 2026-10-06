import { Container, Graphics } from 'pixi.js';
import { cacheStatic, drawDashedRect, drawPaperFace, drawPaperShadow, paperSeed, tapeStrip } from '@/ui';
import { makeRng } from '@/ui/paperMath';
import { BOARD_H, BOARD_W, BOARD_X, BOARD_Y, CELL_COUNT, CELL_H, CELL_W, COLS } from '@/game/geometry';
import { cellPaper, type RugSkin } from './rugSkins';

/** Margin of the sheet around the 5 x 4 cells. */
export const RUG_PAD = 14;
export const RUG_X = BOARD_X - RUG_PAD;
export const RUG_Y = BOARD_Y - RUG_PAD;
export const RUG_W = BOARD_W + 2 * RUG_PAD;
export const RUG_H = BOARD_H + 2 * RUG_PAD;
const RADIUS = 30;
/** The dashed line sits this far inside the cut edge. */
const DASH_INSET = 8;
/** The pattern stays clear of the dashed line. */
const MARGIN = 14;
const CELL_INSET = 5;

const IX = RUG_PAD;
const IY = RUG_PAD;

type Pattern = (g: Graphics, ink: number, alpha: number) => void;

function stripes(g: Graphics, ink: number, alpha: number): void {
  const w = 34;
  for (let x = MARGIN; x + w <= RUG_W - MARGIN; x += w * 2) g.rect(x, MARGIN, w, RUG_H - 2 * MARGIN);
  g.fill({ color: ink, alpha });
}

function gingham(g: Graphics, ink: number, alpha: number): void {
  const w = 26;
  for (let x = MARGIN; x + w <= RUG_W - MARGIN; x += w * 2) g.rect(x, MARGIN, w, RUG_H - 2 * MARGIN);
  g.fill({ color: ink, alpha: alpha * 0.8 });
  for (let y = MARGIN; y + w <= RUG_H - MARGIN; y += w * 2) g.rect(MARGIN, y, RUG_W - 2 * MARGIN, w);
  g.fill({ color: ink, alpha: alpha * 0.8 });
}

function dots(g: Graphics, ink: number, alpha: number): void {
  const step = 40;
  for (let r = 0, y = MARGIN + 12; y < RUG_H - MARGIN - 6; r++, y += step * 0.8) {
    for (let x = MARGIN + 12 + (r % 2) * (step / 2); x < RUG_W - MARGIN - 6; x += step) g.circle(x, y, 7);
  }
  g.fill({ color: ink, alpha });
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

function paws(g: Graphics, ink: number, alpha: number): void {
  const rnd = makeRng(0x9a85);
  for (let r = 0, y = MARGIN + 18; y < RUG_H - MARGIN - 12; r++, y += 62) {
    for (let x = MARGIN + 18 + (r % 2) * 34; x < RUG_W - MARGIN - 14; x += 68) pawPrint(g, x + (rnd() - 0.5) * 8, y + (rnd() - 0.5) * 8, (rnd() - 0.5) * 1.2, 1.15);
  }
  g.fill({ color: ink, alpha });
}

function waves(g: Graphics, ink: number, alpha: number): void {
  const step = 30;
  for (let k = 0, y = MARGIN + 14; y < RUG_H - MARGIN - 8; k++, y += step) {
    g.moveTo(MARGIN, y + Math.sin(k * 0.9) * 5);
    for (let x = 8; x <= RUG_W - 2 * MARGIN; x += 8) g.lineTo(MARGIN + x, y + Math.sin((x / 54) * Math.PI * 2 + k * 0.9) * 5);
  }
  g.stroke({ width: 5, color: ink, alpha, cap: 'round', join: 'round' });
}

function star(g: Graphics, cx: number, cy: number, r: number, rot: number): void {
  const pts: number[] = [];
  for (let i = 0; i < 10; i++) {
    const a = rot + (i * Math.PI) / 5;
    const rad = i % 2 === 0 ? r : r * 0.45;
    pts.push(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad);
  }
  g.poly(pts);
}

function stars(g: Graphics, ink: number, alpha: number): void {
  const step = 54;
  let n = 0;
  for (let r = 0, y = MARGIN + 18; y < RUG_H - MARGIN - 10; r++, y += step * 0.86) {
    for (let x = MARGIN + 18 + (r % 2) * (step / 2); x < RUG_W - MARGIN - 12; x += step) star(g, x, y, n++ % 3 === 0 ? 11 : 8, -Math.PI / 2 + (n % 2) * 0.35);
  }
  g.fill({ color: ink, alpha });
}

function diamond(g: Graphics, ink: number, alpha: number): void {
  const hw = 34;
  const hh = 38;
  for (let j = 0, cy = MARGIN + hh; cy < RUG_H - MARGIN; j++, cy += hh * 2) {
    for (let cx = MARGIN + hw + (j % 2) * hw; cx < RUG_W - MARGIN; cx += hw * 2) g.poly([cx, cy - hh * 0.62, cx + hw * 0.62, cy, cx, cy + hh * 0.62, cx - hw * 0.62, cy]);
  }
  g.fill({ color: ink, alpha });
}

const PATTERNS: Record<RugSkin['pattern'], Pattern | null> = {
  plain: null,
  stripes,
  gingham,
  dots,
  paws,
  waves,
  stars,
  diamond,
};

/**
 * The board: a sheet of craft paper lying on the floor, built once from a skin and baked into one
 * texture. Hand-cut edge on a flat shadow, a flat pattern, a dashed line just inside, a strip of tape
 * at the top, and twenty slightly darker paper squares laid on it for the cells. Its origin is the
 * sheet's top-left corner at (RUG_X, RUG_Y) in field space.
 */
export function buildRug(skin: RugSkin): Container {
  const root = new Container();
  root.label = 'rug';
  const g = new Graphics();
  const sheet = { w: RUG_W, h: RUG_H, radius: RADIUS, fill: skin.paper, seed: paperSeed(), shadow: 10, shadowAlpha: 0.32 } as const;
  drawPaperShadow(g, 0, 0, sheet);
  drawPaperFace(g, 0, 0, sheet);
  const pattern = PATTERNS[skin.pattern];
  // The pattern shows between and around the cells at full strength and, laid over them again, as a whisper.
  pattern?.(g, skin.mark, 0.34);
  drawDashedRect(g, DASH_INSET, DASH_INSET, RUG_W - 2 * DASH_INSET, RUG_H - 2 * DASH_INSET, { radius: RADIUS - 6, color: skin.dash, width: 3.5 });

  const cell = cellPaper(skin);
  for (let c = 0; c < CELL_COUNT; c++) {
    const x = IX + (c % COLS) * CELL_W + CELL_INSET;
    const y = IY + Math.floor(c / COLS) * CELL_H + CELL_INSET;
    drawPaperFace(g, x, y, { w: CELL_W - 2 * CELL_INSET, h: CELL_H - 2 * CELL_INSET, radius: 20, fill: cell, seed: paperSeed(), wobble: 0.9, edgeWidth: 2, edgeAlpha: 0.32 });
  }
  pattern?.(g, skin.mark, 0.09);
  root.addChild(g);

  const tape = tapeStrip({ name: skin.tape, pattern: skin.tapePrint, w: 128, h: 36, angle: -3 });
  tape.position.set(RUG_W / 2, 1);
  root.addChild(tape);
  cacheStatic(root);
  return root;
}
