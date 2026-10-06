import { Point, type Container } from 'pixi.js';
import { game } from '@/core/game';
import {
  anchorPosition,
  gridLayout,
  safeRect,
  stackLayout,
  type Align,
  type Anchor,
  type Box,
  type Justify,
  type SafeRect,
} from './layoutMath';

export type { Align, Anchor, Box, Justify, SafeRect } from './layoutMath';

/**
 * Nominal footprint of an item in its own local space (scaled). Components publish `uiBox`; for any
 * other display object the measured local bounds are used.
 */
export function boxOf(item: Container): Box {
  const sx = item.scale.x;
  const sy = item.scale.y;
  const own = (item as { uiBox?: Box }).uiBox;
  if (own) {
    const x0 = own.x * sx;
    const x1 = (own.x + own.w) * sx;
    const y0 = own.y * sy;
    const y1 = (own.y + own.h) * sy;
    return { x: Math.min(x0, x1), y: Math.min(y0, y1), w: Math.abs(x1 - x0), h: Math.abs(y1 - y0) };
  }
  const b = item.getLocalBounds();
  const x0 = b.minX * sx;
  const x1 = b.maxX * sx;
  const y0 = b.minY * sy;
  const y1 = b.maxY * sy;
  return { x: Math.min(x0, x1), y: Math.min(y0, y1), w: Math.abs(x1 - x0), h: Math.abs(y1 - y0) };
}

export interface StackOpts {
  gap?: number;
  /** Cross-axis alignment of each item (default 'center'). */
  align?: Align;
  /** Top-left corner of the laid-out block (default 0,0). */
  x?: number;
  y?: number;
  /** Fixed main-axis length to distribute over with `justify`. */
  length?: number;
  justify?: Justify;
  /** Fixed cross-axis length (defaults to the largest item). */
  cross?: number;
}

export interface Extent {
  w: number;
  h: number;
}

function applyStack(items: readonly Container[], axis: 'x' | 'y', o: StackOpts): Extent {
  const boxes = items.map(boxOf);
  const r = stackLayout(boxes, axis, o.gap ?? 0, o.align ?? 'center', o.cross, o.length, o.justify ?? 'start');
  const ox = o.x ?? 0;
  const oy = o.y ?? 0;
  items.forEach((it, i) => {
    const p = r.positions[i];
    if (p) it.position.set(ox + p.x, oy + p.y);
  });
  return { w: r.w, h: r.h };
}

/** Lay items out left to right; returns the block's size. */
export function hstack(items: readonly Container[], o: StackOpts = {}): Extent {
  return applyStack(items, 'x', o);
}

/** Lay items out top to bottom; returns the block's size. */
export function vstack(items: readonly Container[], o: StackOpts = {}): Extent {
  return applyStack(items, 'y', o);
}

export interface GridOpts {
  cols: number;
  gapX?: number;
  gapY?: number;
  alignX?: Align;
  alignY?: Align;
  cellW?: number;
  cellH?: number;
  x?: number;
  y?: number;
}

/** Row-major grid. Returns the block's size. */
export function grid(items: readonly Container[], o: GridOpts): Extent {
  const boxes = items.map(boxOf);
  const r = gridLayout(boxes, o.cols, o.gapX ?? 0, o.gapY ?? 0, o.alignX ?? 'center', o.alignY ?? 'center', o.cellW, o.cellH);
  const ox = o.x ?? 0;
  const oy = o.y ?? 0;
  items.forEach((it, i) => {
    const p = r.positions[i];
    if (p) it.position.set(ox + p.x, oy + p.y);
  });
  return { w: r.w, h: r.h };
}

/** The usable screen area: inside the notch / home-indicator insets, minus `margin`. */
export function safeArea(margin = 0): SafeRect {
  return safeRect(game.w, game.h, game.safeTop, game.safeBottom, margin);
}

export interface AnchorOpts {
  margin?: number;
  offsetX?: number;
  offsetY?: number;
  /** false anchors to the raw screen edge instead of the safe area. */
  safe?: boolean;
}

/** Pin an item to a screen anchor, respecting the safe area. Call from the scene's resize(). */
export function anchorTo(item: Container, anchor: Anchor, o: AnchorOpts = {}): void {
  const m = o.margin ?? 0;
  const area = o.safe === false ? safeRect(game.w, game.h, 0, 0, m) : safeArea(m);
  const p = anchorPosition(area, boxOf(item), anchor, o.offsetX ?? 0, o.offsetY ?? 0);
  item.position.set(p.x, p.y);
}

/** Pin an item inside an arbitrary rectangle. */
export function anchorIn(item: Container, rect: SafeRect, anchor: Anchor, offsetX = 0, offsetY = 0): void {
  const p = anchorPosition(rect, boxOf(item), anchor, offsetX, offsetY);
  item.position.set(p.x, p.y);
}

const tmp = new Point();

/** Pixi global (screen) point -> design coordinates (the units everything in this kit is laid out in). */
export function toDesign(global: Point, out: Point = new Point()): Point {
  game.root.toLocal(global, undefined, tmp);
  out.set(tmp.x, tmp.y);
  return out;
}
