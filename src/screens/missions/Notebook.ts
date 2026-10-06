/** The page of a notebook the mission rows are written on: ruled with dashed lines, a margin, punched holes, a label on top. */
import { Container, Graphics } from 'pixi.js';
import { Color, drawDashedLine, drawPaper, PaperLabel, paperSeed, type TapeName } from '@/ui';

export const NOTE_ROW_H = 160;
/** x of the margin line; check boxes sit left of it, the writing right of it. */
export const NOTE_MARGIN_X = 92;
const TOP = 56;
const FOOT = 16;

/** Origin = top-left of the page. Rows are laid at `rowY(i)` by whoever owns them. */
export class Notebook extends Container {
  readonly pageH: number;

  constructor(
    readonly pageW: number,
    rows: number,
    title: string,
    tape: TapeName = 'yellow',
  ) {
    super();
    const w = pageW;
    const h = TOP + rows * NOTE_ROW_H + FOOT;
    this.pageH = h;
    const seed = paperSeed();
    const g = new Graphics();
    drawPaper(g, 0, 0, { w, h, radius: 26, fill: Color.paper, seed, grain: true });
    // The margin line and the three punched holes, through which the floor shows.
    g.moveTo(NOTE_MARGIN_X, 28).lineTo(NOTE_MARGIN_X + 1.5, h - 24).stroke({ width: 3, color: Color.coral, alpha: 0.5, cap: 'round' });
    for (let i = 0; i < 3; i++) g.circle(13, h * (0.2 + 0.3 * i), 7.5).fill({ color: Color.woodDark, alpha: 0.8 });
    for (let i = 1; i < rows; i++) {
      const y = TOP + i * NOTE_ROW_H;
      drawDashedLine(g, NOTE_MARGIN_X + 16, y, w - 26, y, { seed: seed + i, width: 3 });
    }
    this.addChild(g);
    const label = new PaperLabel({ text: title, size: 32, paper: 'info', padX: 34, padY: 10, maxWidth: w - 360, tape });
    label.position.set(58 + label.uiBox.w / 2, 6);
    label.rotation = -0.02;
    this.addChild(label);
  }

  /** Top of row `i` inside the page. */
  rowY(i: number): number {
    return TOP + i * NOTE_ROW_H;
  }
}
