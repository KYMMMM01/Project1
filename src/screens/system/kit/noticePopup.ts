/** One popup shape for every "something happened" message: hero art on a sunburst, text, optional reward chips, buttons. */
import { Container, Graphics, type DestroyOptions } from 'pixi.js';
import { TAU } from '@/core/math';
import { Ease } from '@/core/tween';
import type { BundlePart } from '@/meta/bundle';
import { Button } from '@/ui/Button';
import { drawIcon, type IconName } from '@/ui/icons';
import { motion, popIn, TweenBag } from '@/ui/motion';
import { Panel } from '@/ui/Panel';
import { Popup } from '@/ui/Popup';
import { drawGlow } from '@/ui/shapes';
import { fitLabel, uiLabel } from '@/ui/text';
import { Color, type ButtonStyleId } from '@/ui/theme';
import { RewardList } from './rewardChip';

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
  /** Hero art, centred on its origin, about 150 px. */
  hero: Container;
  lines?: readonly string[];
  rows?: readonly NoticeRow[];
  /** Small dim lines under the rows and chips ("and 3 more"). */
  footnote?: readonly string[];
  parts?: readonly BundlePart[];
  buttons: readonly NoticeButton<R>[];
  dismissResult: R;
  backdropClose?: boolean;
  priority?: number;
}

const W = 620;
const HERO_AREA = 230;
const ROW_H = 104;

/** Origin of the content = screen centre. Results come from the button that was pressed. */
export class NoticePopup<R> extends Popup<R> {
  private readonly bag = new TweenBag();
  private readonly rays = new Graphics();
  private readonly raysHost = new Container();
  private readonly hero: Container;
  private readonly pulsing: Button[] = [];

  constructor(o: NoticeOpts<R>) {
    super({ dismissResult: o.dismissResult, backdropClose: o.backdropClose ?? false, priority: o.priority ?? 3, dim: 1.1 });
    this.hero = o.hero;
    const innerW = W - 90;
    let y = 96 + HERO_AREA;

    const lines = (o.lines ?? []).map((text) =>
      uiLabel(text, { size: 28, wrap: innerW, lineHeight: 38, strokeWidth: 5, shadow: false }),
    );
    const rows: Container[] = (o.rows ?? []).map((r) => this.makeRow(r, innerW));
    const notes = (o.footnote ?? []).map((text) => uiLabel(text, { size: 24, color: Color.textDim, wrap: innerW, strokeWidth: 4, shadow: false }));
    const chips = o.parts && o.parts.length > 0 ? new RewardList(o.parts, { direction: 'row', size: 64, fontSize: 32, gap: 28, maxWidth: 220 }) : null;
    const btnH = 104;
    const stack = o.buttons.length > 2;
    const total =
      lines.reduce((n, l) => n + l.height + 10, 0) +
      rows.length * ROW_H +
      (chips ? chips.uiBox.h + 20 : 0) +
      notes.reduce((n, l) => n + l.height + 8, 0) +
      (stack ? o.buttons.length * (btnH + 16) : btnH + 16);
    const h = y + total + 40;
    const panel = new Panel({ width: W, height: h, title: o.title });

    // The sunburst lives inside the panel, clipped to its rounded body, so it reads as light on the card.
    const clip = new Graphics();
    clip.roundRect(0, 0, W, h, 34).fill(Color.white);
    this.raysHost.mask = clip;
    this.rays.position.set(W / 2, 96 + HERO_AREA / 2);
    this.drawRays(420);
    this.raysHost.addChild(this.rays);
    this.hero.position.set(W / 2, 96 + HERO_AREA / 2);
    panel.content.addChild(this.raysHost, clip, this.hero);
    this.body.addChild(panel);

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
      chips.position.set(W / 2, y + 10 + chips.uiBox.h / 2);
      panel.content.addChild(chips);
      y += chips.uiBox.h + 20;
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
    this.setContentSize(W + 80, h + 90);
  }

  private makeRow(r: NoticeRow, w: number): Container {
    const c = new Container();
    const icon = drawIcon(r.icon, 64);
    icon.position.set(40, ROW_H / 2);
    const name = uiLabel(r.title, { size: 32, anchorX: 0, anchorY: 1, strokeWidth: 5 });
    name.position.set(96, ROW_H / 2 + 2);
    fitLabel(name, w - 110, 32);
    const text = uiLabel(r.text, { size: 24, color: Color.textDim, anchorX: 0, anchorY: 0, strokeWidth: 4, shadow: false });
    text.position.set(96, ROW_H / 2 + 6);
    fitLabel(text, w - 110, 24);
    c.addChild(icon, name, text);
    return c;
  }

  private drawRays(r: number): void {
    const g = this.rays;
    const count = 12;
    for (let i = 0; i < count; i++) {
      const a0 = (i / count) * TAU;
      const a1 = a0 + (TAU / count) * 0.4;
      g.poly([0, 0, Math.cos(a0) * r, Math.sin(a0) * r, Math.cos(a1) * r, Math.sin(a1) * r]).fill({ color: Color.primary, alpha: 0.34 });
    }
    drawGlow(g, 0, 0, r * 0.4, Color.gold, 0.7);
    g.blendMode = 'add';
    g.alpha = 0.55;
  }

  override onOpened(): void {
    if (!motion.reduced) {
      popIn(this.bag, this.hero, { from: 0.3, duration: 0.34, delay: 0.08 });
      this.bag.run({
        duration: 36,
        ease: Ease.linear,
        repeat: -1,
        onUpdate: (k) => {
          this.rays.rotation = k * TAU;
        },
      });
    }
    for (const b of this.pulsing) b.startPulse({ times: 4 });
  }

  override destroy(options?: DestroyOptions): void {
    this.bag.killAll();
    for (const b of this.pulsing) b.stopPulse();
    super.destroy(options);
  }
}
