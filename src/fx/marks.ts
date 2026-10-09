/**
 * Small paper stickers shared by the playfield (baked into textures) and the HUD (drawn on cards): the crosshair on an enemy
 * the laser has marked, the paw of a tossed summon and the badge of a buffed cat.
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

/** What a trickster's neighbour effect does for the cat that receives it: attack speed, damage, or a ward against wet and zap cells. */
export type BuffMarkKind = 'speed' | 'damage' | 'ward';

/**
 * The badge of a buffed cat: a rounded square in the trickster's mustard with a cream rim and a dark glyph, so it reads apart from the round
 * stickers (the sun, the toys' arrows, the class and rank tags). `r` is the half width of the whole sticker, rim included.
 */
export function drawBuffMark(g: Graphics, r: number, kind: BuffMarkKind): void {
  const k = r / 12;
  g.roundRect(-r + 1.5, -r + 3, 2 * r, 2 * r, r * 0.55).fill({ color: Color.shadow, alpha: 0.3 });
  g.roundRect(-r, -r, 2 * r, 2 * r, r * 0.55).fill(CREAM);
  g.roundRect(-r + 2 * k, -r + 2 * k, 2 * r - 4 * k, 2 * r - 4 * k, r * 0.55 - 2 * k).fill(Color.mustard).stroke({ width: 1.1 * k, color: Color.mustardDark });
  const ink = Color.inkDeep;
  switch (kind) {
    case 'speed':
      for (const dx of [-3.1, 2.7]) g.moveTo((dx - 2.5) * k, -5.2 * k).lineTo((dx + 2.5) * k, 0).lineTo((dx - 2.5) * k, 5.2 * k);
      g.stroke({ width: 2.5 * k, color: ink, cap: 'round', join: 'round' });
      break;
    case 'damage':
      for (const dx of [-3.7, 0, 3.7]) g.moveTo((dx - 2) * k, -5.6 * k).lineTo((dx + 2) * k, 5.6 * k);
      g.stroke({ width: 2.1 * k, color: ink, cap: 'round' });
      break;
    case 'ward':
      g.moveTo(0, -6.4 * k)
        .lineTo(5.4 * k, -4.4 * k)
        .lineTo(5 * k, 1.4 * k)
        .quadraticCurveTo(3.8 * k, 5 * k, 0, 7 * k)
        .quadraticCurveTo(-3.8 * k, 5 * k, -5 * k, 1.4 * k)
        .lineTo(-5.4 * k, -4.4 * k)
        .closePath()
        .fill(ink);
      g.moveTo(-2.2 * k, 0.4 * k).lineTo(-0.5 * k, 2.4 * k).lineTo(2.6 * k, -2 * k).stroke({ width: 1.8 * k, color: CREAM, cap: 'round', join: 'round' });
      break;
  }
}
