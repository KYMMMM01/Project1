/**
 * Small paper stickers shared by the playfield (baked into textures) and the HUD (drawn on cards): the sun that
 * marks a sunbeam cell and the cat standing in it, and the crosshair on an enemy the laser has marked.
 * Flat paper only: a cream rim, flat ink-free shapes, a flat shadow. The origin is the sticker's centre.
 */
import type { Graphics } from 'pixi.js';
import { TAU } from '@/core/math';
import { Color } from '@/ui/theme';

const CREAM = Color.paperLight;

function rim(g: Graphics, r: number): void {
  g.circle(1.5, 3, r).fill({ color: Color.shadow, alpha: 0.3 });
  g.circle(0, 0, r).fill(CREAM);
}

/** A cream round sticker with eight warm rays round a mustard sun; `r` is the sticker's outer radius. */
export function drawSunMark(g: Graphics, r: number): void {
  rim(g, r);
  const rays = 8;
  for (let i = 0; i < rays; i++) {
    const a = (i / rays) * TAU + TAU / 16;
    const half = 0.2;
    g.poly([
      Math.cos(a - half) * r * 0.5, Math.sin(a - half) * r * 0.5,
      Math.cos(a) * r * 0.9, Math.sin(a) * r * 0.9,
      Math.cos(a + half) * r * 0.5, Math.sin(a + half) * r * 0.5,
    ]).fill(Color.mustardDark);
  }
  g.circle(0, 0, r * 0.46).fill(Color.mustard).stroke({ width: Math.max(1.2, r * 0.07), color: Color.mustardDark });
}

/** A coral round sticker with a cream crosshair: "the laser is on this one". */
export function drawTargetMark(g: Graphics, r: number): void {
  rim(g, r);
  g.circle(0, 0, r - r * 0.12).fill(Color.coral);
  g.circle(0, 0, r * 0.5).stroke({ width: r * 0.13, color: CREAM });
  g.circle(0, 0, r * 0.12).fill(CREAM);
  for (let i = 0; i < 4; i++) {
    const a = (i * TAU) / 4;
    g.moveTo(Math.cos(a) * r * 0.66, Math.sin(a) * r * 0.66).lineTo(Math.cos(a) * r * 0.9, Math.sin(a) * r * 0.9);
  }
  g.stroke({ width: r * 0.13, color: CREAM, cap: 'round' });
}

/** A paw print in cream, for the sticker that is tossed onto a cell (its coloured face is drawn by the caller). */
export function drawPaw(g: Graphics, s: number): void {
  g.ellipse(0, 3 * s, 6.4 * s, 5.2 * s);
  for (const [x, y] of [[-7, -2.6], [-2.6, -7.6], [2.6, -7.6], [7, -2.6]] as const) g.ellipse(x * s, y * s, 2.6 * s, 3.2 * s);
  g.fill(CREAM);
}
