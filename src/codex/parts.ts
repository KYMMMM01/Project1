/**
 * The small pieces every codex page is built from: a cream sheet with its cut line, a heading that straddles its top edge, a table of
 * label and value rows, a bulleted list. Each builder places its pieces in a container at (0, 0) and says how tall it came out, so a
 * page is a stack of them. Sizes follow the kit's rules: text 24 px or more, 8 px steps, nothing on a border.
 */
import { Container, Graphics, type Text } from 'pixi.js';
import { Color, drawDashedInset, drawDashedLine, drawIcon, PaperLabel, paperSeed, paperShape, ProgressBar, uiLabel } from '@/ui';
import type { Row } from './foeText';

/** A sheet's text sits this far in from its edge, and rows are this far apart. */
export const PAD = 24;
const ROW_PAD = 16;
const SHEET_RADIUS = 28;
const DASH_INSET = 10;
/** How far a heading hangs over the sheet's top edge, and the room the sheet keeps for it. */
export const HEAD_OVER = 24;
const HEAD_ROOM = 40;

export interface Built {
  view: Container;
  h: number;
}

/** A cream sheet `w` x `h` with a teal cut line inside it (the same outline, moved inward). Origin = top-left. */
export function sheet(w: number, h: number, fill = Color.paperLight, dashed = true): Container {
  const view = new Container();
  const seed = paperSeed();
  const opts = { w, h, radius: SHEET_RADIUS, fill, seed, grain: false } as const;
  const paper = paperShape(opts);
  paper.position.set(w / 2, h / 2);
  view.addChild(paper);
  if (dashed) {
    const line = new Graphics();
    drawDashedInset(line, 0, 0, opts, DASH_INSET, { color: Color.teal, width: 2.5, dash: 9, gap: 7, alpha: 0.6, seed });
    view.addChild(line);
  }
  return view;
}

/** A torn label whose middle line lies on the sheet's top edge; `x` is where its left end starts. Origin of the result = its centre. */
export function heading(text: string, paper: number = Color.teal): PaperLabel {
  return new PaperLabel({ text, size: 30, paper, padX: 26, padY: 8, seed: 11 });
}

/** One block of the page: a sheet with a heading over its top edge and whatever `fill` puts inside. The inner part starts below the heading. */
export function section(w: number, title: string, fill: (inner: Container, width: number) => number): Built {
  const view = new Container();
  const inner = new Container();
  inner.position.set(PAD, HEAD_ROOM);
  const innerH = fill(inner, w - PAD * 2);
  const h = HEAD_ROOM + innerH + PAD;
  const label = heading(title);
  label.position.set(label.width / 2 + PAD, 0);
  view.addChild(sheet(w, h), inner, label);
  return { view, h };
}

/** Width of the label column of a table; the value column takes the rest. */
const LABEL_W = 220;
const COLUMN_GAP = 16;
const BAR_W = 168;
const BAR_H = 32;

/** Rows of `label  value (note)` separated by dashed lines. Returns the height used. */
export function table(inner: Container, width: number, rows: readonly Row[]): number {
  const valueX = LABEL_W + COLUMN_GAP;
  let y = 0;
  rows.forEach((row, i) => {
    const label = uiLabel(row.label, { size: 28, color: Color.inkSoft, anchorX: 0, anchorY: 0, wrap: LABEL_W, align: 'left', lineHeight: 34 });
    const barRoom = row.bar ? BAR_W + COLUMN_GAP : 0;
    const value = uiLabel(row.value, { size: 30, anchorX: 0, anchorY: 0, wrap: width - valueX - barRoom, align: 'left', lineHeight: 38 });
    let h = Math.max(label.height, value.height);
    label.position.set(0, y + ROW_PAD);
    value.position.set(valueX, y + ROW_PAD);
    inner.addChild(label, value);
    if (row.note) {
      const note = uiLabel(row.note, { size: 24, color: Color.inkSoft, anchorX: 0, anchorY: 0, wrap: width - valueX, align: 'left', lineHeight: 30 });
      note.position.set(valueX, y + ROW_PAD + value.height + 2);
      inner.addChild(note);
      h = Math.max(h, value.height + 2 + note.height);
    }
    if (row.bar) {
      const bar = new ProgressBar({ width: BAR_W, height: BAR_H, color: row.bar.kind === 'armor' ? 'gold' : 'blue', value: row.bar.pct / 100 });
      bar.position.set(width - BAR_W / 2, y + ROW_PAD + 20);
      inner.addChild(bar);
    }
    y += ROW_PAD * 2 + h;
    if (i < rows.length - 1) {
      const line = new Graphics();
      drawDashedLine(line, 0, y, width, y, { color: Color.kraftDark, width: 2, dash: 8, gap: 8, alpha: 0.5 });
      inner.addChild(line);
    }
  });
  return y;
}

/** A paragraph of text, left aligned. Returns its height. */
export function paragraph(inner: Container, width: number, text: string, y = 0, size = 26, color: number = Color.ink): number {
  const label = uiLabel(text, { size, color, anchorX: 0, anchorY: 0, wrap: width, align: 'left', lineHeight: Math.round(size * 1.4) });
  label.position.set(0, y);
  inner.addChild(label);
  return label.height;
}

/** Lines that each start with a small paw; returns the height used. */
export function bullets(inner: Container, width: number, lines: readonly string[], gap = 14): number {
  let y = 0;
  const textX = 44;
  for (const line of lines) {
    const label: Text = uiLabel(line, { size: 26, anchorX: 0, anchorY: 0, wrap: width - textX, align: 'left', lineHeight: 36 });
    label.position.set(textX, y);
    const paw = drawIcon('paw', 30, Color.teal);
    paw.position.set(14, y + 18);
    inner.addChild(paw, label);
    y += label.height + gap;
  }
  return Math.max(0, y - gap);
}
