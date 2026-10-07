/**
 * Pure layout maths (no Pixi) behind hstack / vstack / grid and the safe-area anchors. A `Box` is the
 * nominal footprint of an item in its OWN local space: components are origin-centred, so a 200x100
 * button reports { x: -100, y: -50, w: 200, h: 100 } and the layout shifts its position accordingly.
 */
export type Align = 'start' | 'center' | 'end';
export type Justify = 'start' | 'center' | 'end' | 'space-between' | 'space-around';

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Point2 {
  x: number;
  y: number;
}

export interface StackResult {
  /** Item origin positions, in input order. */
  positions: Point2[];
  /** Overall extent of the laid-out content. */
  w: number;
  h: number;
}

function alignOffset(align: Align, free: number): number {
  return align === 'start' ? 0 : align === 'center' ? free / 2 : free;
}

/**
 * Lay boxes out along one axis starting at (0,0). `align` positions each item on the cross axis
 * inside the tallest/widest item (or `crossSize` when given). `mainSize` plus `justify` spread the
 * items over a fixed main-axis extent instead of packing them by `gap`.
 */
export function stackLayout(
  boxes: readonly Box[],
  axis: 'x' | 'y',
  gap: number,
  align: Align = 'center',
  crossSize?: number,
  mainSize?: number,
  justify: Justify = 'start',
): StackResult {
  const horizontal = axis === 'x';
  const n = boxes.length;
  let mainTotal = 0;
  let crossMax = 0;
  for (const b of boxes) {
    mainTotal += horizontal ? b.w : b.h;
    crossMax = Math.max(crossMax, horizontal ? b.h : b.w);
  }
  const cross = crossSize ?? crossMax;

  let gapActual = gap;
  let cursor = 0;
  const packed = mainTotal + gap * Math.max(0, n - 1);
  if (mainSize !== undefined && n > 0) {
    const free = mainSize - mainTotal;
    switch (justify) {
      case 'start':
        break;
      case 'center':
        cursor = (mainSize - packed) / 2;
        break;
      case 'end':
        cursor = mainSize - packed;
        break;
      case 'space-between':
        gapActual = n > 1 ? free / (n - 1) : 0;
        cursor = n > 1 ? 0 : free / 2;
        break;
      case 'space-around':
        gapActual = free / n;
        cursor = gapActual / 2;
        break;
    }
  }

  const positions: Point2[] = [];
  for (const b of boxes) {
    const main = horizontal ? b.w : b.h;
    const own = horizontal ? b.h : b.w;
    const crossPos = alignOffset(align, cross - own);
    if (horizontal) positions.push({ x: cursor - b.x, y: crossPos - b.y });
    else positions.push({ x: crossPos - b.x, y: cursor - b.y });
    cursor += main + gapActual;
  }
  const mainExtent = mainSize ?? packed;
  return horizontal ? { positions, w: mainExtent, h: cross } : { positions, w: cross, h: mainExtent };
}

export interface GridResult {
  positions: Point2[];
  w: number;
  h: number;
  rows: number;
  cellW: number;
  cellH: number;
}

/** Row-major grid. Cell size defaults to the largest item; items are aligned inside their cell. */
export function gridLayout(
  boxes: readonly Box[],
  cols: number,
  gapX: number,
  gapY: number,
  alignX: Align = 'center',
  alignY: Align = 'center',
  cellW?: number,
  cellH?: number,
): GridResult {
  const c = Math.max(1, Math.floor(cols));
  let maxW = 0;
  let maxH = 0;
  for (const b of boxes) {
    maxW = Math.max(maxW, b.w);
    maxH = Math.max(maxH, b.h);
  }
  const cw = cellW ?? maxW;
  const ch = cellH ?? maxH;
  const rows = Math.ceil(boxes.length / c);
  const positions: Point2[] = [];
  for (let i = 0; i < boxes.length; i++) {
    const b = boxes[i] as Box;
    const col = i % c;
    const row = Math.floor(i / c);
    const cx = col * (cw + gapX) + alignOffset(alignX, cw - b.w) - b.x;
    const cy = row * (ch + gapY) + alignOffset(alignY, ch - b.h) - b.y;
    positions.push({ x: cx, y: cy });
  }
  const usedCols = Math.min(c, boxes.length);
  return {
    positions,
    w: usedCols > 0 ? usedCols * cw + (usedCols - 1) * gapX : 0,
    h: rows > 0 ? rows * ch + (rows - 1) * gapY : 0,
    rows,
    cellW: cw,
    cellH: ch,
  };
}

export interface SafeRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The area a HUD may use: the design rect minus notch / home-indicator insets and a margin. */
export function safeRect(
  w: number,
  h: number,
  safeTop: number,
  safeBottom: number,
  margin = 0,
): SafeRect {
  return {
    x: margin,
    y: safeTop + margin,
    w: Math.max(0, w - margin * 2),
    h: Math.max(0, h - safeTop - safeBottom - margin * 2),
  };
}

export type Anchor =
  | 'top-left'
  | 'top'
  | 'top-right'
  | 'left'
  | 'center'
  | 'right'
  | 'bottom-left'
  | 'bottom'
  | 'bottom-right';

/** Where to put the origin of a box so that its nominal footprint hugs `anchor` inside `area`. */
export function anchorPosition(
  area: SafeRect,
  box: Box,
  anchor: Anchor,
  offsetX = 0,
  offsetY = 0,
): Point2 {
  const left = anchor.endsWith('left') || anchor === 'left';
  const right = anchor.endsWith('right') || anchor === 'right';
  const top = anchor.startsWith('top');
  const bottom = anchor.startsWith('bottom');
  const px = left ? area.x : right ? area.x + area.w - box.w : area.x + (area.w - box.w) / 2;
  const py = top ? area.y : bottom ? area.y + area.h - box.h : area.y + (area.h - box.h) / 2;
  return { x: px - box.x + offsetX, y: py - box.y + offsetY };
}

export interface ScaffoldRects {
  /** Full-bleed header: reaches up under the notch, so its height includes the top inset. */
  titleBar: SafeRect;
  /** Where the body (scroll viewport) lives: between the header and the action bar / screen bottom. */
  body: SafeRect;
  /** Full-bleed footer reaching down under the home indicator, or null when the screen has none. */
  actionBar: SafeRect | null;
  /** Extra scroll length after the last row so content clears the home indicator when there is no action bar. */
  bottomInset: number;
}

/**
 * Rectangles of a full-screen scaffold in design space: a header of `titleH` below the top inset, an
 * optional footer of `actionH` above the bottom inset, and the body between them. Pure, so the
 * safe-area rules are unit-testable.
 */
export function scaffoldLayout(
  w: number,
  h: number,
  safeTop: number,
  safeBottom: number,
  titleH: number,
  actionH: number,
): ScaffoldRects {
  const titleBar = { x: 0, y: 0, w, h: safeTop + titleH };
  const actionBar = actionH > 0 ? { x: 0, y: h - actionH - safeBottom, w, h: actionH + safeBottom } : null;
  const bodyBottom = actionBar ? actionBar.y : h;
  return {
    titleBar,
    body: { x: 0, y: titleBar.h, w, h: Math.max(0, bodyBottom - titleBar.h) },
    actionBar,
    bottomInset: actionBar ? 0 : safeBottom,
  };
}

/** Fixed measures of the bottom tab bar, in the bar's own space (y 0 = the top of its box, the torn edge sits at `strip`). */
export const TAB_BAR = {
  h: 128,
  strip: 22,
  /** Centre line of a tab's label and the half of its 24 px text height. */
  labelY: 102,
  labelHalf: 14,
  /** Top of an ordinary selected tab's paper, and of the raised hero tab's (it has to hold its disc as well). */
  paperTop: -30,
  heroPaperTop: -58,
  /** How far the paper is cut below the bar's bottom edge: past the screen, so no bottom edge is ever visible. */
  bleed: 40,
} as const;

/**
 * The cream paper behind a selected tab, relative to the tab's own origin (its centre line, bar top). It runs from above the
 * torn edge to `bleed` below the bar including the safe-area inset (`barH`), so the icon and the label sit on it whole.
 */
export function tabPaperBox(cell: number, barH: number, featured: boolean): Box {
  const w = cell - (featured ? 8 : 16);
  const top = featured ? TAB_BAR.heroPaperTop : TAB_BAR.paperTop;
  return { x: -w / 2, y: top, w, h: barH + TAB_BAR.bleed - top };
}
