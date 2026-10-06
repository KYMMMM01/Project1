import { Container, Graphics } from 'pixi.js';
import { Ease } from '@/core/tween';
import { damp } from '@/core/math';
import { Color } from '@/ui';
import { FIELD_H, FIELD_W, cellCenterX, cellCenterY } from '@/game/geometry';

const FILL_SEGMENTS = 96;
const DASH = 15;
const GAP = 11;
const CHORDS = 3;

/** Sutherland-Hodgman clip of a flat [x0, y0, x1, y1, ...] polygon against the rectangle 0..w x 0..h. */
export function clipPolygonToRect(points: number[], w: number, h: number): number[] {
  let poly = points;
  const edges: Array<(x: number, y: number) => number> = [
    (x) => x,
    (x) => w - x,
    (_x, y) => y,
    (_x, y) => h - y,
  ];
  for (const inside of edges) {
    const out: number[] = [];
    const n = poly.length / 2;
    for (let i = 0; i < n; i++) {
      const ax = poly[i * 2] as number;
      const ay = poly[i * 2 + 1] as number;
      const bx = poly[((i + 1) % n) * 2] as number;
      const by = poly[((i + 1) % n) * 2 + 1] as number;
      const da = inside(ax, ay);
      const db = inside(bx, by);
      if (da >= 0) out.push(ax, ay);
      if (da >= 0 !== db >= 0) {
        const t = da / (da - db);
        out.push(ax + (bx - ax) * t, ay + (by - ay) * t);
      }
    }
    poly = out;
    if (poly.length < 6) break;
  }
  return poly;
}

/** A dashed teal circle with a faint flat fill marking how far a cat reaches; clipped to the field so a long range never spills over the HUD. */
export class RangeRing {
  readonly view = new Container();
  private readonly g = new Graphics();
  private cell = -1;
  private range = 0;
  private alphaNow = 0;
  private alphaTarget = 0;

  constructor(private readonly layer: Container) {
    this.view.label = 'range-ring';
    this.view.eventMode = 'none';
    this.view.addChild(this.g);
    this.view.visible = false;
    layer.addChild(this.view);
  }

  /** Show the ring for the unit in `cell` with the given reach; calling again with new numbers redraws. */
  show(cell: number, range: number): void {
    this.alphaTarget = 1;
    if (cell === this.cell && Math.abs(range - this.range) < 0.5) return;
    this.cell = cell;
    this.range = range;
    this.draw();
  }

  hide(): void {
    this.alphaTarget = 0;
  }

  update(dt: number): void {
    if (this.alphaNow === this.alphaTarget) return;
    this.alphaNow = damp(this.alphaNow, this.alphaTarget, 0.05, dt);
    if (Math.abs(this.alphaNow - this.alphaTarget) < 0.01) this.alphaNow = this.alphaTarget;
    this.view.visible = this.alphaNow > 0;
    this.view.alpha = Ease.quadOut(this.alphaNow);
    // The ring is only redrawn on show(); once faded out, forget the cell so the next show() redraws.
    if (this.alphaNow === 0) this.cell = -1;
  }

  private draw(): void {
    const g = this.g;
    g.clear();
    const cx = cellCenterX(this.cell);
    const cy = cellCenterY(this.cell);
    const r = this.range;
    const fill: number[] = [];
    for (let i = 0; i < FILL_SEGMENTS; i++) {
      const a = (i / FILL_SEGMENTS) * Math.PI * 2;
      fill.push(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    }
    const clipped = clipPolygonToRect(fill, FIELD_W, FIELD_H);
    if (clipped.length >= 6) g.poly(clipped).fill({ color: Color.teal, alpha: 0.11 });
    // Dashes of a fixed length whatever the range; a chord only counts where it lies on the field.
    const inside = (x: number, y: number): boolean => x >= 0 && x <= FIELD_W && y >= 0 && y <= FIELD_H;
    const dashes = Math.max(8, Math.round((Math.PI * 2 * r) / (DASH + GAP)));
    const span = (DASH / (DASH + GAP)) * ((Math.PI * 2) / dashes);
    for (let i = 0; i < dashes; i++) {
      const a0 = (i / dashes) * Math.PI * 2;
      let px = cx + Math.cos(a0) * r;
      let py = cy + Math.sin(a0) * r;
      for (let k = 1; k <= CHORDS; k++) {
        const a = a0 + (span * k) / CHORDS;
        const x = cx + Math.cos(a) * r;
        const y = cy + Math.sin(a) * r;
        if (inside(px, py) && inside(x, y)) g.moveTo(px, py).lineTo(x, y);
        px = x;
        py = y;
      }
    }
    g.stroke({ width: 4, color: Color.tealDark, alpha: 0.85, cap: 'round', join: 'round' });
  }

  destroy(): void {
    this.layer.removeChild(this.view);
    this.view.destroy({ children: true });
  }
}
