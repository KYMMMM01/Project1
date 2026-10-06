/** The settings form is a stack of paper sheets, each with a label across its top edge and rows divided by dashed lines. */
import { Container, Graphics } from 'pixi.js';
import { cacheStatic, drawDashedLine, PaperLabel, paperSeed, type ButtonStyleId } from '@/ui';
import { paperSheet } from './kit/sheets';

export interface FormRow {
  height: number;
  /** Fill `row` (origin = the row's top-left) for a sheet `w` wide. */
  draw(row: Container, w: number): void;
}

export interface FormSheet {
  view: Container;
  /** Height of the sheet itself; the label above it needs `LABEL_OVERHANG` more. */
  height: number;
}

/** How far the title label rises above its sheet. */
export const LABEL_OVERHANG = 34;
const TOP = 52;
const FOOT = 10;

/** A cream sheet with `rows` laid out one under another. Origin = top-left of the sheet. */
export function formSheet(w: number, title: string, rows: readonly FormRow[], ribbon: ButtonStyleId = 'info'): FormSheet {
  const body = rows.reduce((n, r) => n + r.height, 0);
  const h = TOP + body + FOOT;
  const view = new Container();
  const rules = new Graphics();
  view.addChild(paperSheet(w, h, { radius: 28, seed: paperSeed() }), rules);
  let y = TOP;
  rows.forEach((row, i) => {
    const holder = new Container();
    holder.position.set(0, y);
    row.draw(holder, w);
    view.addChild(holder);
    y += row.height;
    if (i < rows.length - 1) drawDashedLine(rules, 28, y, w - 28, y, { width: 2.5, alpha: 0.6, seed: i + 3 });
  });
  cacheStatic(rules);
  const label = new PaperLabel({ text: title, size: 34, paper: ribbon, padX: 40, padY: 11, minWidth: 220, maxWidth: w - 120 });
  label.position.set(w / 2, 4);
  view.addChild(label);
  return { view, height: h };
}
