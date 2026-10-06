import { Container, Graphics, Rectangle, type DestroyOptions } from 'pixi.js';
import { audio, type SfxId } from '@/audio';
import { game } from '@/core/game';
import { haptic } from '@/core/haptics';
import { lerp } from '@/core/math';
import { Ease } from '@/core/tween';
import { drawIcon, type IconName } from './icons';
import type { Box } from './layoutMath';
import { backOut, motion, TweenBag } from './motion';
import { bindPress, inScrollHost, type PressBinding } from './press';
import { RarityPips } from './RarityPips';
import { cacheStatic, drawGlow, drawPill, glossGradient, refreshCache, vGradient } from './shapes';
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
  /** Colour of the lit tier steps and the tier-up glow (default: the brand gold). */
  accent?: number;
  /** Sound for a tier-up; false for silence (the caller plays its own). */
  tierSfx?: SfxId | false;
  onTap?: () => void;
}

interface TierLook {
  outline: number;
  width: number;
  rim: number;
}

/** Border per synergy tier: plain dark, bronze, silver, gold. */
const TIER_LOOK: readonly TierLook[] = [
  { outline: Color.outline, width: 5, rim: 0x8f7bd8 },
  { outline: 0x9a5a1c, width: 6, rim: 0xe9a35a },
  { outline: 0xb4c0d6, width: 6, rim: 0xffffff },
  { outline: 0xffd23f, width: 7, rim: 0xfff3b0 },
];

const BAR_W = 17;
const BAR_GAP = 5;
const BAR_H = [13, 21, 29] as const;
const BAR_BASE = 31;
const RIGHT_CX = 38;

/**
 * Compact class badge: class glyph on a medallion, the five rarity pips, and a three-step synergy
 * marker (rising bars, so the tier is readable without colour). A tier-up punches the chip and
 * flares a glow; a press dips and darkens it on the pointerdown frame. Origin = centre, about 168 x 76.
 */
export class ClassChip extends Container {
  readonly uiBox: Box = { x: -CLASS_CHIP_W / 2, y: -CLASS_CHIP_H / 2, w: CLASS_CHIP_W, h: CLASS_CHIP_H + 4 };
  readonly pips: RarityPips;

  private readonly bag = new TweenBag();
  /** Press / punch target. */
  private readonly body = new Container();
  private readonly plate = new Container();
  private readonly plateG = new Graphics();
  private readonly glow = new Graphics();
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
    this.accent = opts.accent ?? Color.primary;
    this.tierSfx = opts.tierSfx === undefined ? 'upgrade' : opts.tierSfx;
    this.tierValue = Math.max(0, Math.min(CLASS_TIERS, Math.floor(opts.tier ?? 0)));
    this.tapFn = opts.onTap ?? null;

    this.plate.addChild(this.plateG);
    this.drawPlate();

    // Medallion: the glyph sits on a round well so every class reads at the same weight.
    const med = new Graphics();
    const mx = -CLASS_CHIP_W / 2 + 42;
    med.circle(mx, 3, 31).fill({ color: 0x07030f, alpha: 0.35 });
    med.circle(mx, 0, 31).fill(vGradient(0x6a56b6, 0x34256b)).stroke({ width: 4, color: Color.outline, alignment: 1 });
    med.ellipse(mx - 4, -17, 17, 7).fill(glossGradient(0.3, 0.02));
    cacheStatic(med);
    const icon = drawIcon(opts.icon, 46);
    icon.position.set(mx, 0);

    this.glow.position.set(mx, 0);
    drawGlow(this.glow, 0, 0, 78, this.accent, 0.95);
    this.glow.blendMode = 'add';
    this.glow.alpha = 0;

    this.pips = new RarityPips({ owned: opts.owned, size: 13, gap: 5 });
    this.pips.position.set(RIGHT_CX, -22);

    const barsX = RIGHT_CX - (BAR_W * CLASS_TIERS + BAR_GAP * (CLASS_TIERS - 1)) / 2;
    for (let i = 0; i < CLASS_TIERS; i++) {
      const h = BAR_H[i] as number;
      const g = new Container();
      g.position.set(barsX + i * (BAR_W + BAR_GAP), BAR_BASE);
      const dim = new Graphics();
      dim.roundRect(0, -h, BAR_W, h, 4).fill({ color: 0x1a1034, alpha: 0.85 }).stroke({ width: 2.5, color: 0x5a49a0, alpha: 0.7 });
      const lit = new Graphics();
      lit.roundRect(0, -h, BAR_W, h, 4)
        .fill(vGradient(0xffe27a, this.accent))
        .stroke({ width: 3, color: Color.outline, alignment: 1 });
      lit.roundRect(3, -h + 2.5, BAR_W - 6, Math.max(3, h * 0.35), 2).fill(glossGradient(0.6, 0.1));
      g.addChild(dim, lit);
      this.bars.push({ g, lit, dim });
    }

    this.body.addChild(this.plate, this.glow, med, icon, this.pips);
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
        this.body.tint = 0xcfc6ea;
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
   * Move to synergy tier `n` (0..3). A rise celebrates: a scale punch, a glow flare and the new step
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
    const tier = this.tierValue;
    const w = CLASS_CHIP_W;
    const h = CLASS_CHIP_H;
    const look = TIER_LOOK[tier] as TierLook;
    // Each synergy step restyles the border (thickness and metal), not just its colour.
    drawPill(g, -w / 2, -h / 2, w, h, {
      top: tier >= CLASS_TIERS ? 0x5a3f8f : 0x45357f,
      bottom: tier >= CLASS_TIERS ? 0x3a2468 : 0x261a4d,
      outline: look.outline,
      outlineWidth: look.width,
      radius: 26,
      gloss: 0.16,
      rim: look.rim,
      shadow: { alpha: 0.35, spread: 8, offsetY: 5 },
    });
    if (tier >= CLASS_TIERS) {
      g.roundRect(-w / 2 - 4, -h / 2 - 4, w + 8, h + 8, 30).stroke({ width: 3, color: this.accent, alpha: 0.75 });
    }
    if (this.selectedFlag) {
      g.roundRect(-w / 2 - 3, -h / 2 - 3, w + 6, h + 6, 29).stroke({ width: 4, color: 0xffffff, alpha: 0.9 });
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
    this.bag.runKeyed(this.glow, {
      duration: 0.7,
      ease: Ease.cubicOut,
      onUpdate: (k) => {
        this.glow.alpha = 0.95 * (1 - k);
        this.glow.scale.set(lerp(0.6, 1.5, k));
      },
      onComplete: () => {
        this.glow.alpha = 0;
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
