import { Container, Graphics, Rectangle, type DestroyOptions } from 'pixi.js';
import { audio, type SfxId } from '@/audio';
import { game } from '@/core/game';
import { haptic } from '@/core/haptics';
import { lerp, mixColor } from '@/core/math';
import { Ease } from '@/core/tween';
import { drawIcon, type IconName } from './icons';
import type { Box } from './layoutMath';
import { backOut, motion, TweenBag } from './motion';
import { bindPress, inScrollHost, type PressBinding } from './press';
import { RarityPips } from './RarityPips';
import { drawDashedRect, drawPaper, paperSeed, tapeStrip } from './paper';
import { cacheStatic, refreshCache } from './shapes';
import { HOLD_DELAY } from './Tooltip';
import { Color, Hit } from './theme';

export const CLASS_CHIP_W = 168;
export const CLASS_CHIP_H = 76;
/** Synergy steps a class can reach. */
export const CLASS_TIERS = 3;

export interface ClassChipOpts {
  /** Class glyph (class_warrior, class_ranger, class_mage, class_trickster or any other icon). */
  icon: IconName;
  /** Which rarities of this class the player owns, in rarity order (common ... mythic). */
  owned?: readonly boolean[];
  /** Synergy tier reached, 0..3. */
  tier?: number;
  /** Colour of the lit tier steps and the tier-up ring (default: mustard). */
  accent?: number;
  /** Sound for a tier-up; false for silence (the caller plays its own). */
  tierSfx?: SfxId | false;
  onTap?: () => void;
}

interface TierLook {
  edge: number;
  width: number;
  alpha: number;
}

/** Border per synergy tier: plain kraft line, then a bronze, a silver and a mustard paper border. */
const TIER_LOOK: readonly TierLook[] = [
  { edge: Color.kraftDark, width: 2, alpha: 0.5 },
  { edge: 0xb8845a, width: 4, alpha: 0.95 },
  { edge: 0x9ea8b4, width: 4, alpha: 0.95 },
  { edge: Color.mustardDark, width: 5, alpha: 1 },
];

const BAR_W = 17;
const BAR_GAP = 5;
const BAR_H = [13, 21, 29] as const;
const BAR_BASE = 31;
const RIGHT_CX = 38;

/**
 * Compact class badge: class glyph on a paper medallion, the five rarity pips, and a three-step synergy
 * marker (rising bars, so the tier is readable without colour). A tier-up punches the chip and
 * sends out a ring; a press dips and darkens it on the pointerdown frame. Origin = centre, about 168 x 76.
 */
export class ClassChip extends Container {
  readonly uiBox: Box = { x: -CLASS_CHIP_W / 2, y: -CLASS_CHIP_H / 2, w: CLASS_CHIP_W, h: CLASS_CHIP_H + 4 };
  readonly pips: RarityPips;

  private readonly bag = new TweenBag();
  /** Press / punch target. */
  private readonly body = new Container();
  private readonly plate = new Container();
  private readonly plateG = new Graphics();
  private readonly ring = new Graphics();
  private readonly seed = paperSeed();
  private selTape: Graphics | null = null;
  private readonly bars: { g: Container; lit: Graphics; dim: Graphics }[] = [];
  private readonly press: PressBinding;
  private readonly accent: number;
  private readonly tierSfx: SfxId | false;
  private tierValue: number;
  private selectedFlag = false;
  private tapFn: (() => void) | null;
  private deferSfx = false;
  private downAt = 0;

  constructor(opts: ClassChipOpts) {
    super();
    this.accent = opts.accent ?? Color.mustard;
    this.tierSfx = opts.tierSfx === undefined ? 'upgrade' : opts.tierSfx;
    this.tierValue = Math.max(0, Math.min(CLASS_TIERS, Math.floor(opts.tier ?? 0)));
    this.tapFn = opts.onTap ?? null;

    this.plate.addChild(this.plateG);
    this.drawPlate();

    // Medallion: the glyph sits on a round well so every class reads at the same weight.
    const med = new Graphics();
    const mx = -CLASS_CHIP_W / 2 + 42;
    drawPaper(med, mx - 31, -31, { w: 62, h: 62, kind: 'circle', fill: mixColor(this.accent, 0xffffff, 0.55), edge: Color.kraftDark, shadow: 3, grain: false, seed: this.seed + 1 });
    cacheStatic(med);
    const icon = drawIcon(opts.icon, 46);
    icon.position.set(mx, 0);

    this.ring.position.set(mx, 0);
    this.ring.circle(0, 0, 40).stroke({ width: 6, color: this.accent });
    this.ring.alpha = 0;

    this.pips = new RarityPips({ owned: opts.owned, size: 13, gap: 5 });
    this.pips.position.set(RIGHT_CX, -22);

    const barsX = RIGHT_CX - (BAR_W * CLASS_TIERS + BAR_GAP * (CLASS_TIERS - 1)) / 2;
    for (let i = 0; i < CLASS_TIERS; i++) {
      const h = BAR_H[i] as number;
      const g = new Container();
      g.position.set(barsX + i * (BAR_W + BAR_GAP), BAR_BASE);
      const dim = new Graphics();
      dim.roundRect(0, -h, BAR_W, h, 4).fill({ color: Color.paperDim, alpha: 0.9 }).stroke({ width: 2.5, color: Color.kraftDark, alpha: 0.6 });
      const lit = new Graphics();
      lit.roundRect(0, -h, BAR_W, h, 4).fill(this.accent).stroke({ width: 2.5, color: Color.mustardDark, alpha: 0.7, alignment: 0 });
      g.addChild(dim, lit);
      this.bars.push({ g, lit, dim });
    }

    this.body.addChild(this.plate, this.ring, med, icon, this.pips);
    for (const b of this.bars) this.body.addChild(b.g);
    this.addChild(this.body);
    this.paintTier(this.tierValue, -1);

    this.eventMode = 'static';
    this.cursor = 'pointer';
    const hh = Math.max(Hit.min, CLASS_CHIP_H);
    this.hitArea = new Rectangle(-CLASS_CHIP_W / 2, -hh / 2, CLASS_CHIP_W, hh);
    this.press = bindPress(this, {
      down: () => {
        this.bag.killKeyed(this.body);
        this.body.y = 3;
        this.body.scale.set(0.95);
        this.body.tint = 0xece0d0;
        haptic('tap');
        this.downAt = game.time;
        this.deferSfx = inScrollHost(this);
        if (!this.deferSfx && this.tapFn) audio.play('ui_click');
      },
      up: (released) => {
        this.body.tint = 0xffffff;
        // A hold long enough to raise the tooltip is a "what is this?" gesture, not a tap.
        const fire = released && game.time - this.downAt < HOLD_DELAY;
        this.release(released);
        if (!fire) return;
        if (this.deferSfx && this.tapFn) audio.play('ui_click');
        this.tapFn?.();
      },
    });
  }

  get tier(): number {
    return this.tierValue;
  }

  get selected(): boolean {
    return this.selectedFlag;
  }

  /** Set (or clear with null) the tap handler. */
  onTap(fn: (() => void) | null): this {
    this.tapFn = fn;
    return this;
  }

  /** Update the owned rarities; newly lit pips pop. */
  setOwned(owned: readonly boolean[], animate = true): void {
    this.pips.set(owned, animate);
  }

  /** Highlight the chip as the active filter. */
  setSelected(v: boolean): void {
    if (v === this.selectedFlag) return;
    this.selectedFlag = v;
    this.drawPlate();
  }

  /**
   * Move to synergy tier `n` (0..3). A rise celebrates: a scale punch, an expanding ring and the new step
   * popping in. Falling or an unanimated change just repaints.
   */
  setTier(n: number, animate = true): void {
    const next = Math.max(0, Math.min(CLASS_TIERS, Math.floor(n)));
    const prev = this.tierValue;
    if (next === prev) return;
    this.tierValue = next;
    this.drawPlate();
    const rising = next > prev && animate;
    this.paintTier(next, rising && !motion.reduced ? prev : -1);
    if (rising) this.celebrate();
  }

  override destroy(options?: DestroyOptions): void {
    this.press.dispose();
    this.bag.killAll();
    this.tapFn = null;
    super.destroy(options);
  }

  /* ------------------------------------------------------------- internals */

  private drawPlate(): void {
    const g = this.plateG;
    g.clear();
    this.selTape?.destroy();
    this.selTape = null;
    const tier = this.tierValue;
    const w = CLASS_CHIP_W;
    const h = CLASS_CHIP_H;
    const look = TIER_LOOK[tier] as TierLook;
    // Each synergy step restyles the border (thickness and colour), not just its colour.
    drawPaper(g, -w / 2, -h / 2, { w, h, radius: 26, fill: Color.paperLight, edge: look.edge, edgeWidth: look.width, edgeAlpha: look.alpha, shadow: 5, grain: false, seed: this.seed });
    if (tier >= CLASS_TIERS) {
      drawDashedRect(g, -w / 2 + 7, -h / 2 + 7, w - 14, h - 14, { radius: 20, color: this.accent, width: 2.5, dash: 9, gap: 7, seed: this.seed + 2 });
    }
    if (this.selectedFlag) {
      drawDashedRect(g, -w / 2 - 6, -h / 2 - 6, w + 12, h + 12, { radius: 32, color: Color.teal, width: 3.5, seed: this.seed + 3 });
      const tape = tapeStrip({ name: 'sky', w: 46, h: 18, angle: -22, pattern: 'dots', seed: this.seed });
      tape.position.set(-w / 2 + 22, -h / 2 + 2);
      this.plate.addChild(tape);
      this.selTape = tape;
    }
    refreshCache(this.plate);
  }

  /** Light the bars up to `tier`; bars at index `popFrom` and above (when >= 0) pop in. */
  private paintTier(tier: number, popFrom: number): void {
    const ease = backOut(3);
    this.bars.forEach((b, i) => {
      const on = i < tier;
      b.lit.visible = on;
      b.dim.visible = !on;
      this.bag.killKeyed(b.g);
      b.g.scale.set(1);
      if (on && popFrom >= 0 && i >= popFrom) {
        b.g.scale.set(1, 0.2);
        this.bag.runKeyed(b.g, {
          duration: 0.34,
          delay: 0.08 + (i - popFrom) * 0.08,
          ease: Ease.linear,
          onUpdate: (k) => b.g.scale.set(1, 0.2 + 0.8 * ease(k)),
          onComplete: () => b.g.scale.set(1),
        });
      }
    });
  }

  private celebrate(): void {
    if (this.tierSfx) audio.play(this.tierSfx);
    haptic('medium');
    if (motion.reduced) return;
    this.bag.runKeyed(this.body, {
      duration: 0.38,
      ease: Ease.linear,
      // Fast attack to +16 %, springy settle.
      onUpdate: (k) => this.body.scale.set(1 + 0.16 * Math.sin(Math.min(1, k * 1.1) * Math.PI) * (1 - 0.3 * k)),
      onComplete: () => this.body.scale.set(1),
    });
    this.bag.runKeyed(this.ring, {
      duration: 0.6,
      ease: Ease.cubicOut,
      onUpdate: (k) => {
        this.ring.alpha = 0.9 * (1 - k);
        this.ring.scale.set(lerp(0.8, 1.9, k));
      },
      onComplete: () => {
        this.ring.alpha = 0;
      },
    });
  }

  private release(bounce: boolean): void {
    const body = this.body;
    const y0 = body.y;
    const s0 = body.scale.x;
    if (motion.reduced || y0 === 0) {
      body.y = 0;
      body.scale.set(1);
      return;
    }
    const spring = backOut(2.4);
    this.bag.runKeyed(body, {
      duration: bounce ? 0.18 : 0.1,
      ease: Ease.linear,
      onUpdate: (k) => {
        body.y = lerp(y0, 0, Ease.quadOut(k));
        body.scale.set(lerp(s0, 1, bounce ? spring(k) : Ease.quadOut(k)));
      },
      onComplete: () => {
        body.y = 0;
        body.scale.set(1);
      },
    });
  }
}
