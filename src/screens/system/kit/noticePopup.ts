/** One popup shape for every "something happened" message: a small paper note with one sticker, a few lines, optional reward stickers and the buttons. */
import { Container, Graphics, type DestroyOptions } from 'pixi.js';
import type { BundlePart } from '@/meta/bundle';
import {
  Button,
  Color,
  cacheStatic,
  drawDashedLine,
  drawIcon,
  fitLabel,
  motion,
  Panel,
  Popup,
  popIn,
  TweenBag,
  uiLabel,
  type ButtonStyleId,
  type IconName,
  type TapeName,
} from '@/ui';
import { RewardList } from './rewardChip';
import { stickerTilt } from './parts';
import { stickerDisc } from './sheets';

export interface NoticeButton<R> {
  label: string;
  style: ButtonStyleId;
  result: R;
  /** Pulse the button a few times once the popup is open. */
  pulse?: boolean;
}

export interface NoticeRow {
  icon: IconName;
  title: string;
  text: string;
}

export interface NoticeOpts<R> {
  title: string;
  /** The sticker's picture, centred on its origin, about 120 px. */
  hero: Container;
  lines?: readonly string[];
  rows?: readonly NoticeRow[];
  /** Small soft lines under the rows and stickers ("and 3 more"). */
  footnote?: readonly string[];
  parts?: readonly BundlePart[];
  buttons: readonly NoticeButton<R>[];
  dismissResult: R;
  backdropClose?: boolean;
  priority?: number;
  tape?: TapeName;
}

const W = 600;
const HERO = 190;
const ROW_H = 100;

/** Origin of the content = screen centre. Results come from the button that was pressed. */
export class NoticePopup<R> extends Popup<R> {
  private readonly bag = new TweenBag();
  private readonly sticker = new Container();
  private readonly pulsing: Button[] = [];

  constructor(o: NoticeOpts<R>) {
    super({ dismissResult: o.dismissResult, backdropClose: o.backdropClose ?? false, priority: o.priority ?? 3 });
    const innerW = W - 90;
    const top = 100;
    let y = top + HERO + 22;

    const lines = (o.lines ?? []).map((text) => uiLabel(text, { size: 28, wrap: innerW, lineHeight: 38 }));
    const rows: Container[] = (o.rows ?? []).map((r, i, all) => this.makeRow(r, innerW, i < all.length - 1));
    const notes = (o.footnote ?? []).map((text) => uiLabel(text, { size: 24, color: Color.inkSoft, wrap: innerW }));
    const chips = o.parts && o.parts.length > 0 ? new RewardList(o.parts, { direction: 'row', size: 72, fontSize: 34, gap: 32, maxWidth: 230 }) : null;
    const btnH = 104;
    const stack = o.buttons.length > 2;
    const total =
      lines.reduce((n, l) => n + l.height + 10, 0) +
      rows.length * ROW_H +
      (chips ? chips.uiBox.h + 24 : 0) +
      notes.reduce((n, l) => n + l.height + 8, 0) +
      (stack ? o.buttons.length * (btnH + 16) : btnH + 16);
    const h = y + total + 44;
    const panel = new Panel({ width: W, height: h, title: o.title, torn: 'bottom', tape: o.tape ?? 'sky' });

    const disc = stickerDisc(HERO, 1);
    const art = o.hero;
    this.sticker.addChild(disc, art);
    this.sticker.rotation = stickerTilt(3);
    this.sticker.position.set(W / 2, top + HERO / 2 + 4);
    panel.content.addChild(this.sticker);

    for (const l of lines) {
      l.position.set(W / 2, y + l.height / 2);
      panel.content.addChild(l);
      y += l.height + 10;
    }
    rows.forEach((r) => {
      r.position.set((W - innerW) / 2, y);
      panel.content.addChild(r);
      y += ROW_H;
    });
    if (chips) {
      chips.position.set(W / 2, y + 12 + chips.uiBox.h / 2);
      panel.content.addChild(chips);
      y += chips.uiBox.h + 24;
    }
    for (const l of notes) {
      l.position.set(W / 2, y + 4 + l.height / 2);
      panel.content.addChild(l);
      y += l.height + 8;
    }
    y += 16;
    const n = o.buttons.length;
    const bw = stack || n === 1 ? 440 : (innerW - 20) / 2;
    o.buttons.forEach((b, i) => {
      const btn = new Button({ label: b.label, style: b.style, width: bw, height: btnH, fontSize: 40 });
      if (stack) btn.position.set(W / 2, y + btnH / 2 + i * (btnH + 16));
      else btn.position.set(W / 2 + (i - (n - 1) / 2) * (bw + 20), y + btnH / 2);
      btn.onTap(() => this.close(b.result));
      panel.content.addChild(btn);
      if (b.pulse) this.pulsing.push(btn);
    });
    this.body.addChild(panel);
    this.setContentSize(W + 80, h + 90);
  }

  /** A small sticker, a name and a line of what it is, on a ruled line. */
  private makeRow(r: NoticeRow, w: number, rule: boolean): Container {
    const c = new Container();
    const disc = stickerDisc(68, 2);
    disc.position.set(40, ROW_H / 2 - 2);
    const icon = drawIcon(r.icon, 42);
    icon.position.copyFrom(disc.position);
    const name = uiLabel(r.title, { size: 30, anchorX: 0, anchorY: 1 });
    name.position.set(92, ROW_H / 2 + 2);
    fitLabel(name, w - 104, 30);
    const text = uiLabel(r.text, { size: 24, color: Color.inkSoft, anchorX: 0, anchorY: 0 });
    text.position.set(92, ROW_H / 2 + 6);
    fitLabel(text, w - 104, 24);
    c.addChild(disc, icon, name, text);
    if (rule) {
      const line = new Graphics();
      drawDashedLine(line, 8, ROW_H - 2, w - 8, ROW_H - 2, { width: 2.5 });
      cacheStatic(line);
      c.addChild(line);
    }
    return c;
  }

  override onOpened(): void {
    if (!motion.reduced) popIn(this.bag, this.sticker, { from: 0.3, duration: 0.34, delay: 0.08 });
    for (const b of this.pulsing) b.startPulse({ times: 4 });
  }

  override destroy(options?: DestroyOptions): void {
    this.bag.killAll();
    for (const b of this.pulsing) b.stopPulse();
    super.destroy(options);
  }
}
