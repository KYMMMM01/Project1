/**
 * A paper coupon: a strip of coloured paper with torn short ends and a dashed perforation, a round
 * stub with a glyph on the left and the offer on the right. The whole coupon is the button (it dips
 * and darkens on the pointerdown frame like every tappable card). Used for the result screen's offers.
 */
import { Container, Graphics } from 'pixi.js';
import {
  ButtonPalettes,
  Color,
  drawDashedLine,
  drawIcon,
  drawPaper,
  fitLabel,
  LoadingSpinner,
  paperSeed,
  uiLabel,
  type ButtonStyleId,
  type IconName,
} from '@/ui';
import { PressCard } from './kit';

export interface CouponOpts {
  w: number;
  h: number;
  paper: ButtonStyleId;
  icon: IconName;
  label: string;
  /** Second line: a price, a count, the way it is paid. */
  sub?: string;
  onTap: () => void;
}

const STUB = 124;

export class Coupon extends PressCard {
  private readonly art = new Container();
  private readonly face = new Graphics();
  private readonly spinner = new LoadingSpinner({ size: 56 });
  private readonly seed = paperSeed();
  private readonly w: number;
  private readonly h: number;
  private paper: ButtonStyleId;
  private readonly glyph: Container;
  private readonly body: Container;

  constructor(opts: CouponOpts) {
    super(opts.w, opts.h, opts.onTap);
    this.w = opts.w;
    this.h = opts.h;
    this.paper = opts.paper;
    this.glyph = drawIcon(opts.icon, 54);
    this.glyph.position.set(-opts.w / 2 + STUB / 2, 0);
    this.body = new Container();
    this.spinner.visible = false;
    this.art.addChild(this.face, this.glyph, this.body);
    this.addChild(this.art, this.spinner);
    this.setText(opts.label, opts.sub);
  }

  setText(label: string, sub?: string): void {
    for (const c of this.body.removeChildren()) c.destroy({ children: true });
    const ink = ButtonPalettes[this.paper].ink;
    const x = -this.w / 2 + STUB + 24;
    const room = this.w - STUB - 48;
    const main = uiLabel(label, { size: 38, color: ink, anchorX: 0, align: 'left' });
    fitLabel(main, room, 38, 0.65);
    main.position.set(x, sub ? -18 : 0);
    this.body.addChild(main);
    if (sub) {
      const line = uiLabel(sub, { size: 26, color: ink, anchorX: 0, align: 'left' });
      fitLabel(line, room, 26, 0.8);
      line.position.set(x, 24);
      this.body.addChild(line);
    }
    this.draw();
  }

  /** A used coupon: plain kraft, no more taps. */
  setSpent(label: string): void {
    this.paper = 'kraft';
    this.setEnabled(false);
    this.setText(label);
    this.glyph.alpha = 0.5;
  }

  setBusy(v: boolean): void {
    this.setEnabled(!v);
    this.spinner.visible = v;
    this.body.alpha = v ? 0.25 : 1;
    this.glyph.alpha = v ? 0.25 : 1;
  }

  private draw(): void {
    const pal = ButtonPalettes[this.paper];
    const g = this.face;
    g.clear();
    drawPaper(g, -this.w / 2, -this.h / 2, { w: this.w, h: this.h, radius: 14, fill: pal.base, edge: pal.lip, torn: ['left', 'right'], seed: this.seed, grain: false });
    // The stub: a cream round patch under the glyph, then the perforation that divides it from the offer.
    drawPaper(g, -this.w / 2 + STUB / 2 - 36, -36, { w: 72, h: 72, kind: 'circle', fill: Color.paperLight, edge: pal.lip, shadow: 3, grain: false, seed: this.seed + 1 });
    drawDashedLine(g, -this.w / 2 + STUB, -this.h / 2 + 14, -this.w / 2 + STUB, this.h / 2 - 14, { color: pal.lip, width: 3, dash: 10, gap: 8 });
  }
}
