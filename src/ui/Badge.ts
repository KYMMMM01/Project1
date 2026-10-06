import { Container, Graphics, type DestroyOptions, type Text } from 'pixi.js';
import { Ease } from '@/core/tween';
import { backOut, motion, TweenBag } from './motion';
import { drawPaper, drawPaperFace, paperSeed } from './paper';
import { uiLabel } from './text';
import { Color } from './theme';
import type { Box } from './layoutMath';

/** `true` = plain dot, a number = count (0 hides it), `undefined`/`false` = hidden. */
export type BadgeValue = number | boolean | undefined;

export interface BadgeOpts {
  value?: BadgeValue;
  /** Counts above this show as "9+" (the house rule: one digit, then a plus). */
  maxCount?: number;
  /** Diameter of the dot; a counted badge is `size * 1.4` tall. */
  size?: number;
}

/**
 * Notification dot / counter: coral paper on a cream ring. Origin is the centre of the dot. Pops in with an overshoot and
 * shrinks away when cleared; it never relies on colour alone because the count is printed on it.
 */
export class Badge extends Container {
  readonly uiBox: Box = { x: 0, y: 0, w: 0, h: 0 };
  private readonly bg = new Graphics();
  private readonly ring = new Graphics();
  private text: Text | null = null;
  private readonly bag = new TweenBag();
  private readonly maxCount: number;
  private readonly size: number;
  private current: BadgeValue = undefined;
  private readonly seed = paperSeed();

  constructor(opts: BadgeOpts = {}) {
    super();
    this.maxCount = opts.maxCount ?? 9;
    this.size = opts.size ?? 22;
    this.addChild(this.ring, this.bg);
    this.visible = false;
    this.set(opts.value, false);
  }

  get value(): BadgeValue {
    return this.current;
  }

  set(value: BadgeValue, animate = true): void {
    const shown = value === true || (typeof value === 'number' && value > 0);
    const wasShown = this.visible && this.scale.x > 0.01;
    this.current = shown ? value : undefined;
    if (shown) this.render(value);
    this.bag.killAll();
    if (shown) {
      this.visible = true;
      if (!animate || motion.reduced) {
        this.scale.set(1);
      } else if (!wasShown) {
        this.scale.set(0);
        this.bag.run({
          duration: 0.24,
          ease: backOut(2.6),
          onUpdate: (k) => this.scale.set(k),
          onComplete: () => this.scale.set(1),
        });
      } else {
        // Count changed while visible: a small bump.
        this.bag.run({
          duration: 0.18,
          ease: Ease.linear,
          onUpdate: (k) => this.scale.set(1 + 0.25 * Math.sin(k * Math.PI)),
          onComplete: () => this.scale.set(1),
        });
      }
    } else if (animate && wasShown && !motion.reduced) {
      this.bag.run({
        duration: 0.12,
        ease: Ease.cubicIn,
        onUpdate: (k) => this.scale.set(1 - k),
        onComplete: () => {
          this.visible = false;
        },
      });
    } else {
      this.visible = false;
    }
  }

  /** Attention pulse for "claimable" states: three soft beats, then rest. */
  pulse(times = 3): void {
    if (motion.reduced || !this.visible) return;
    this.bag.killAll();
    this.bag.run({
      duration: 1.2 * times,
      ease: Ease.linear,
      onUpdate: (k) => this.scale.set(1 + 0.12 * Math.max(0, Math.sin(k * Math.PI * 2 * times - Math.PI / 2) * 0.5 + 0.5)),
      onComplete: () => this.scale.set(1),
    });
  }

  private render(value: BadgeValue): void {
    const d = this.size;
    this.bg.clear();
    this.ring.clear();
    if (this.text) {
      this.text.destroy();
      this.text = null;
    }
    let w = d;
    let h = d;
    if (typeof value === 'number') {
      const str = value > this.maxCount ? `${this.maxCount}+` : String(value);
      this.text = uiLabel(str, { size: 22, color: Color.inkDeep });
      h = Math.round(d * 1.4);
      w = Math.max(h, Math.ceil(this.text.width) + 18);
    }
    const kind = w === h ? 'circle' : 'pill';
    // cream ring (so the dot reads on any paper) -> coral body
    drawPaper(this.ring, -w / 2 - 4, -h / 2 - 4, { w: w + 8, h: h + 8, kind, fill: Color.paper, edge: false, shadow: 3, grain: false, seed: this.seed, wobble: 0.5 });
    drawPaperFace(this.bg, -w / 2, -h / 2, { w, h, kind, fill: Color.coral, edge: Color.coralDark, grain: false, seed: this.seed + 1, wobble: 0.6 });
    if (this.text) {
      this.text.position.set(0, 1);
      this.addChild(this.text);
    }
    this.uiBox.x = -w / 2 - 4;
    this.uiBox.y = -h / 2 - 4;
    this.uiBox.w = w + 8;
    this.uiBox.h = h + 11;
  }

  override destroy(options?: DestroyOptions): void {
    this.bag.killAll();
    super.destroy(options);
  }
}
