import { Container, Graphics, Point, type BitmapText, type DestroyOptions } from 'pixi.js';
import { game } from '@/core/game';
import { mixColor } from '@/core/math';
import { Ease } from '@/core/tween';
import { countUpDuration, countUpValue, formatCount } from './countUp';
import { drawIcon, type IconName } from './icons';
import { IconButton } from './IconButton';
import type { Box } from './layoutMath';
import { motion, punch, shakeX, TweenBag } from './motion';
import { numberText } from './numbers';
import { drawPill } from './shapes';
import { Color } from './theme';

export interface CurrencyPillOpts {
  icon: IconName;
  amount?: number;
  width?: number;
  /** Shows a green + button on the right edge. */
  plus?: boolean;
  onPlus?: () => void;
  iconColor?: number;
}

const H = 72;

/**
 * HUD currency chip: coin-like icon, rolling number, optional "+" shop button. Origin = centre.
 * setAmount() counts up (0.4-0.8 s, ease-out) and punches the icon; shakeInsufficient() flashes it
 * red when a purchase is short.
 */
export class CurrencyPill extends Container {
  readonly uiBox: Box;
  private readonly view = new Container();
  private readonly bgG = new Graphics();
  private readonly iconHolder = new Container();
  private readonly num: BitmapText;
  private readonly plusBtn: IconButton | null;
  private readonly bag = new TweenBag();
  private w: number;
  private current: number;
  private fitArea = { x0: 0, x1: 0 };

  constructor(opts: CurrencyPillOpts) {
    super();
    this.w = opts.width ?? 208;
    this.current = Math.round(opts.amount ?? 0);
    this.uiBox = { x: -this.w / 2 - 8, y: -H / 2 - 4, w: this.w + 8, h: H + 14 };

    this.iconHolder.addChild(drawIcon(opts.icon, 66, opts.iconColor));
    this.num = numberText(34, 0xffffff, formatCount(this.current));
    this.view.addChild(this.bgG, this.num, this.iconHolder);
    this.addChild(this.view);

    if (opts.plus) {
      this.plusBtn = new IconButton({ icon: 'plus', style: 'success', size: 58 });
      this.plusBtn.onTap(opts.onPlus ?? null);
      this.addChild(this.plusBtn);
    } else {
      this.plusBtn = null;
    }
    this.relayout();
  }

  get amount(): number {
    return this.current;
  }

  onPlus(fn: (() => void) | null): this {
    this.plusBtn?.onTap(fn);
    return this;
  }

  setWidth(w: number): void {
    if (w === this.w) return;
    this.w = w;
    this.uiBox.x = -w / 2 - 8;
    this.uiBox.w = w + 8;
    this.relayout();
  }

  /** Change the shown amount; the number rolls up (or down) unless animate is false. */
  setAmount(value: number, animate = true): void {
    const to = Math.round(value);
    const from = this.current;
    this.current = to;
    this.bag.killKeyed(this.num);
    if (!animate || motion.reduced || from === to) {
      this.num.text = formatCount(to);
      this.fitNumber();
      return;
    }
    const shown = this.num;
    this.bag.runKeyed(shown, {
      duration: countUpDuration(to - from),
      ease: Ease.cubicOut,
      onUpdate: (k) => {
        shown.text = formatCount(countUpValue(from, to, k));
        this.fitNumber();
      },
      onComplete: () => {
        shown.text = formatCount(to);
        this.fitNumber();
      },
    });
    if (to > from) this.punchIcon();
  }

  /** Icon pop, used when an amount arrives (also call it as each flying coin lands). */
  punchIcon(): void {
    punch(this.bag, this.iconHolder, 0.28, 0.2);
  }

  /** "Not enough": shake and flash red for 0.2 s, then the caller can open the shop. */
  shakeInsufficient(): void {
    shakeX(this.bag, this.view, 0, 7, 3, 0.26);
    this.bag.runKeyed(this.view.scale, {
      duration: 0.3,
      ease: Ease.linear,
      onUpdate: (k) => {
        this.view.tint = mixColor(0xff6070, 0xffffff, k);
      },
      onComplete: () => {
        this.view.tint = 0xffffff;
      },
    });
  }

  /**
   * Centre of the icon in Pixi global (screen) coordinates, the target for fly-to-HUD effects. Convert
   * with game.overlayLayer.toLocal(p) to place a sprite on the overlay layer.
   */
  getIconGlobalPosition(out: Point = new Point()): Point {
    return this.iconHolder.getGlobalPosition(out);
  }

  override destroy(options?: DestroyOptions): void {
    this.bag.killAll();
    super.destroy(options);
  }

  private relayout(): void {
    const w = this.w;
    this.bgG.clear();
    drawPill(this.bgG, -w / 2, -H / 2, w, H, {
      top: 0x45357f,
      bottom: 0x261a4d,
      outline: Color.outline,
      outlineWidth: 5,
      gloss: 0.16,
      rim: 0x8f7bd8,
      shadow: { alpha: 0.35, spread: 8, offsetY: 5 },
    });
    this.iconHolder.position.set(-w / 2 + 12, -1);
    const plusW = this.plusBtn ? 62 : 14;
    this.fitArea = { x0: -w / 2 + 52, x1: w / 2 - plusW };
    this.fitNumber();
    if (this.plusBtn) this.plusBtn.position.set(w / 2 - 36, -2);
  }

  private fitNumber(): void {
    const avail = this.fitArea.x1 - this.fitArea.x0;
    this.num.scale.set(1);
    if (this.num.width > avail) this.num.scale.set(avail / this.num.width);
    this.num.position.set((this.fitArea.x0 + this.fitArea.x1) / 2, 1);
  }
}

export interface TopBarOpts {
  gap?: number;
  margin?: number;
}

/** Lays several currency pills in a row just below the notch (game.safeTop). Origin = (0, 0). */
export class TopBar extends Container {
  readonly pills: CurrencyPill[];
  private readonly gap: number;
  private readonly margin: number;

  constructor(pills: CurrencyPill[], opts: TopBarOpts = {}) {
    super();
    this.pills = pills;
    this.gap = opts.gap ?? 24;
    this.margin = opts.margin ?? 24;
    for (const p of pills) this.addChild(p);
    this.layout(game.w);
  }

  /** Height of the bar including the safe-area inset. */
  get barHeight(): number {
    return game.safeTop + 16 + H + 8;
  }

  layout(w: number): void {
    const n = this.pills.length;
    if (n === 0) return;
    const pw = Math.min(260, (w - this.margin * 2 - this.gap * (n - 1)) / n);
    const total = pw * n + this.gap * (n - 1);
    const x0 = (w - total) / 2;
    this.pills.forEach((p, i) => {
      p.setWidth(pw);
      p.position.set(x0 + pw / 2 + i * (pw + this.gap), game.safeTop + 16 + H / 2);
    });
  }
}
