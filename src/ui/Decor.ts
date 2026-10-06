import { Container, Graphics, type DestroyOptions } from 'pixi.js';
import { audio } from '@/audio';
import { haptic } from '@/core/haptics';
import { TAU } from '@/core/math';
import { Ease } from '@/core/tween';
import { drawIcon } from './icons';
import { backOut, motion, TweenBag } from './motion';
import { gradient } from './shapes';
import { uiLabel } from './text';
import { Color } from './theme';
import type { Box } from './layoutMath';

/* ------------------------------------------------------------------ spinner */

export interface SpinnerOpts {
  size?: number;
  color?: number;
}

/** Ring of fading dots that rotates forever. Origin at the centre. */
export class LoadingSpinner extends Container {
  readonly uiBox: Box;
  private readonly ring = new Container();
  private readonly bag = new TweenBag();

  constructor(opts: SpinnerOpts = {}) {
    super();
    const size = opts.size ?? 64;
    const color = opts.color ?? 0xffffff;
    const dots = 12;
    const g = new Graphics();
    const R = size * 0.36;
    for (let i = 0; i < dots; i++) {
      const t = i / (dots - 1);
      const a = (i / dots) * TAU - Math.PI / 2;
      const r = size * (0.055 + 0.055 * t);
      g.circle(Math.cos(a) * R, Math.sin(a) * R, r + 1.5).fill({ color: Color.outline, alpha: 0.5 * (0.25 + t * 0.75) });
      g.circle(Math.cos(a) * R, Math.sin(a) * R, r).fill({ color, alpha: 0.2 + 0.8 * t });
    }
    this.ring.addChild(g);
    this.addChild(this.ring);
    this.uiBox = { x: -size / 2, y: -size / 2, w: size, h: size };
    this.bag.run({
      duration: 0.95,
      ease: Ease.linear,
      repeat: -1,
      onUpdate: (k) => {
        this.ring.rotation = k * TAU;
      },
    });
  }

  override destroy(options?: DestroyOptions): void {
    this.bag.killAll();
    super.destroy(options);
  }
}

/* ------------------------------------------------------------------ divider */

export interface DividerOpts {
  width: number;
  /** Optional text in the middle. Without it a small diamond ornament is drawn. */
  label?: string;
  color?: number;
}

/** Engraved horizontal rule: a dark groove with a light lip beneath it. */
export class Divider extends Container {
  readonly uiBox: Box;

  constructor(opts: DividerOpts) {
    super();
    const w = opts.width;
    const tint = opts.color ?? 0x000000;
    const g = new Graphics();
    let gap = 22;
    let text: ReturnType<typeof uiLabel> | null = null;
    if (opts.label) {
      text = uiLabel(opts.label, { size: 24, color: 0xcabfee, stroke: Color.outline, strokeWidth: 4 });
      gap = text.width / 2 + 18;
    }
    const half = w / 2;
    for (const side of [-1, 1]) {
      const x0 = side < 0 ? -half : gap;
      const x1 = side < 0 ? -gap : half;
      // Fade towards the outer end so the rule feels like it dissolves into the panel.
      g.roundRect(x0, -2, x1 - x0, 4, 2).fill({ color: tint, alpha: 0.4 });
      g.roundRect(x0, 2, x1 - x0, 2, 1).fill({ color: 0xffffff, alpha: 0.12 });
    }
    if (text) {
      this.addChild(g, text);
    } else {
      g.poly([0, -9, 9, 0, 0, 9, -9, 0]).fill(gradient([[0, 0xffe27a], [1, 0xf0a21e]])).stroke({ width: 3, color: Color.outline, join: 'round' });
      this.addChild(g);
    }
    this.uiBox = { x: -half, y: -12, w, h: 24 };
  }
}

/* -------------------------------------------------------------------- stars */

export interface StarsOpts {
  /** Slots shown, default 3. */
  count?: number;
  /** Diameter of a side star; the middle one is 1.25x. */
  size?: number;
  earned?: number;
}

/** 1-3 rating stars that pop in one at a time with a rising chime. */
export class Stars extends Container {
  readonly uiBox: Box;
  private readonly slots: { full: Container; ring: Graphics }[] = [];
  private readonly bag = new TweenBag();
  private shown = 0;

  constructor(opts: StarsOpts = {}) {
    super();
    const count = opts.count ?? 3;
    const size = opts.size ?? 110;
    const spacing = size * 0.92;
    for (let i = 0; i < count; i++) {
      const mid = (count - 1) / 2;
      const off = i - mid;
      const big = count === 3 && i === 1 ? 1.25 : 1;
      const holder = new Container();
      holder.position.set(off * spacing, count === 3 ? (big > 1 ? -size * 0.14 : size * 0.1) : 0);
      holder.rotation = count === 3 ? off * 0.2 : 0;
      const empty = drawIcon('star', size * big, 0x3b2c6e);
      empty.alpha = 0.9;
      const full = new Container();
      full.addChild(drawIcon('star', size * big));
      full.visible = false;
      const ring = new Graphics();
      ring.circle(0, 0, size * 0.42 * big).stroke({ width: 6, color: 0xfff2b0 });
      ring.visible = false;
      holder.addChild(empty, full, ring);
      this.addChild(holder);
      this.slots.push({ full, ring });
    }
    this.uiBox = { x: -spacing * (count / 2) - size * 0.1, y: -size * 0.8, w: spacing * count + size * 0.2, h: size * 1.4 };
    this.setEarned(opts.earned ?? 0, false);
  }

  get earned(): number {
    return this.shown;
  }

  /**
   * Fill the first `n` stars. Animated, each star lands 350 ms after the previous one; resolves when
   * the last one has settled. A smaller `n` clears the extra stars immediately.
   */
  async setEarned(n: number, animate = true): Promise<void> {
    const target = Math.max(0, Math.min(this.slots.length, Math.floor(n)));
    const from = this.shown;
    this.shown = target;
    if (!animate || motion.reduced) {
      this.slots.forEach((s, i) => {
        s.full.visible = i < target;
        s.full.scale.set(1);
        s.ring.visible = false;
      });
      return;
    }
    this.slots.forEach((s, i) => {
      if (i >= target) s.full.visible = false;
    });
    for (let i = from; i < target; i++) {
      const slot = this.slots[i];
      if (!slot) continue;
      const delay = (i - from) * 0.35;
      this.bag.call(delay, () => {
        slot.full.visible = true;
        audio.playStep('star', i);
        haptic('light');
        this.bag.run({
          duration: 0.42,
          ease: backOut(3),
          onUpdate: (k) => {
            slot.full.scale.set(0.2 + 0.8 * k);
            slot.full.rotation = (1 - k) * -0.7;
            slot.full.alpha = Math.min(1, k * 5);
          },
          onComplete: () => {
            slot.full.scale.set(1);
            slot.full.rotation = 0;
            slot.full.alpha = 1;
          },
        });
        slot.ring.visible = true;
        this.bag.run({
          duration: 0.4,
          ease: Ease.cubicOut,
          onUpdate: (k) => {
            slot.ring.scale.set(0.6 + k * 1.1);
            slot.ring.alpha = 0.9 * (1 - k);
          },
          onComplete: () => {
            slot.ring.visible = false;
          },
        });
      });
    }
    await this.bag.wait((target - from) * 0.35 + 0.45);
  }

  override destroy(options?: DestroyOptions): void {
    this.bag.killAll();
    super.destroy(options);
  }
}
