import { Container, Graphics } from 'pixi.js';
import { Ease } from '@/core/tween';
import { damp } from '@/core/math';
import { FIELD_H, FIELD_W, cellCenterX, cellCenterY } from '@/game/geometry';

const SEGMENTS = 120;

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

/** Soft translucent disc with an outline marking how far a cat reaches; clipped to the field so a long range never spills over the HUD. */
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
    const pts: number[] = [];
    for (let i = 0; i < SEGMENTS; i++) {
      const a = (i / SEGMENTS) * Math.PI * 2;
      pts.push(cx + Math.cos(a) * this.range, cy + Math.sin(a) * this.range);
    }
    const clipped = clipPolygonToRect(pts, FIELD_W, FIELD_H);
    if (clipped.length >= 6) g.poly(clipped).fill({ color: 0xfff3c4, alpha: 0.075 });
    const inside = (x: number, y: number): boolean => x >= 0 && x <= FIELD_W && y >= 0 && y <= FIELD_H;
    for (let i = 0; i < SEGMENTS; i++) {
      const ax = pts[i * 2] as number;
      const ay = pts[i * 2 + 1] as number;
      const bx = pts[((i + 1) % SEGMENTS) * 2] as number;
      const by = pts[((i + 1) % SEGMENTS) * 2 + 1] as number;
      if (i % 2 === 0 && inside(ax, ay) && inside(bx, by)) g.moveTo(ax, ay).lineTo(bx, by);
    }
    g.stroke({ width: 4, color: 0xfff3c4, alpha: 0.75, cap: 'round' });
  }

  destroy(): void {
    this.layer.removeChild(this.view);
    this.view.destroy({ children: true });
  }
}
