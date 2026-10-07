import type { Graphics } from 'pixi.js';
import { Color } from '@/ui/theme';
import { Hue } from './palette';

/**
 * Hazard tape round a cell, the mark every hostile zone wears: slanted berry stripes on a cream band along the edge,
 * like the boss warning ribbon. Friendly zones have a plain cream rim with dashes, so friend and foe differ by the rim
 * before anyone reads the colour. Centred on the origin; draw it once and reuse the Graphics.
 */
export function drawHazardFrame(g: Graphics, w: number, h: number, band = 10, radius = 18): void {
  const x0 = -w / 2;
  const y0 = -h / 2;
  g.roundRect(x0 + band / 2, y0 + band / 2, w - band, h - band, radius).stroke({ width: band, color: Hue.cream });
  const step = band * 2.2;
  const lean = band;
  // Stripes only on the straight runs; the rounded corners stay a plain berry band so no stripe pokes out of a bend.
  const run = (ax: number, ay: number, dx: number, dy: number, nx: number, ny: number, length: number): void => {
    for (let s = radius; s + step * 0.5 < length - radius; s += step) {
      const px = ax + dx * s;
      const py = ay + dy * s;
      g.poly([px, py, px + dx * step * 0.5, py + dy * step * 0.5, px + dx * (step * 0.5 + lean) + nx * band, py + dy * (step * 0.5 + lean) + ny * band, px + dx * lean + nx * band, py + dy * lean + ny * band]);
    }
  };
  run(x0, y0, 1, 0, 0, 1, w);
  run(x0, y0 + h - band, 1, 0, 0, 1, w);
  run(x0, y0, 0, 1, 1, 0, h);
  run(x0 + w - band, y0, 0, 1, 1, 0, h);
  g.fill(Color.berry);
  // A thin berry line on the outer edge closes the band.
  g.roundRect(x0 + 1, y0 + 1, w - 2, h - 2, radius).stroke({ width: 2.4, color: Color.berry });
}
