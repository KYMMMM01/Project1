import { Container, Graphics, Sprite, Texture, type Text } from 'pixi.js';
import { game } from '@/core/game';
import { haptic } from '@/core/haptics';
import type { Pool } from '@/core/pool';
import { Ease } from '@/core/tween';
import { TAU, clamp01, lighten, mixColor } from '@/core/math';
import { PaperLabel } from '@/ui/paper';
import { Color, Dim, Rarity } from '@/ui/theme';
import { label } from '@/ui/text';
import { backOutS } from './curves';
import { Hue } from './palette';
import type { FxSequence } from './handles';
import { hash01 } from './loops';
import { REDUCED, fxSettings } from './settings';
import { ScreenFx, Trauma, fxShake, screenFx } from './screen';
import { fxTex } from './textures';
import { makeSpritePool } from './rays';

/** Seconds of each phase of an awakening cut-in; everything else is derived from these. */
export interface CutInPlan {
  /** The dim overlay fades in over this long. */
  dimIn: number;
  /** Speed lines converge until this moment, which is also the flash and the banner's arrival. */
  impact: number;
  /** The banner slides in over this long, starting at `impact`. */
  slideIn: number;
  /** The banner starts leaving here. */
  exitAt: number;
  /** Length of the exit. */
  exit: number;
  /** Total running time. */
  total: number;
  /** Number of converging speed lines (0 under reduced motion). */
  lines: number;
}

/** The full cut-in is 1.6 s, the repeat version 0.8 s (guide 2.2.3); reduced motion shortens and drops the lines. */
export function awakeningPlan(short: boolean, reduced: boolean): CutInPlan {
  const k = reduced ? REDUCED.time : 1;
  const plan: CutInPlan = short
    ? { dimIn: 0.08, impact: 0.14, slideIn: 0.16, exitAt: 0.62, exit: 0.18, total: 0.8, lines: 16 }
    : { dimIn: 0.12, impact: 0.3, slideIn: 0.22, exitAt: 1.38, exit: 0.22, total: 1.6, lines: 28 };
  if (!reduced) return plan;
  return {
    dimIn: plan.dimIn * k,
    impact: plan.impact * k,
    slideIn: plan.slideIn * k,
    exitAt: plan.exitAt * k,
    exit: plan.exit * k,
    total: plan.total * k,
    lines: 0,
  };
}

/** Horizontal offset of the banner in units of the screen width: -1.1 (off left) -> 0 (home) -> +1.1 (off right). */
export function bannerOffset(t: number, p: CutInPlan): number {
  if (t < p.impact) return -1.1;
  if (t < p.impact + p.slideIn) return -1.1 * (1 - Ease.expoOut((t - p.impact) / p.slideIn));
  if (t < p.exitAt) return 0;
  return 1.1 * Ease.cubicIn(clamp01((t - p.exitAt) / p.exit));
}

/** Strength of the dim overlay in [0,1]: in over `dimIn`, held, out together with the banner. */
export function dimAmount(t: number, p: CutInPlan): number {
  const inn = clamp01(t / p.dimIn);
  const out = clamp01((t - p.exitAt) / p.exit);
  return inn * inn * (3 - 2 * inn) * (1 - out);
}

export interface AwakeningOpts {
  /** The 0.8 s version for repeats (guide: the second mythic of a run onward). */
  short?: boolean;
  /** Banner colour. Default the mythic rarity colour. */
  color?: number;
  /** Small line above the name, already translated ("MYTHIC", "수호신"). */
  tag?: string;
  /** Fired at the flash: swap the awakened unit in behind the banner. */
  onImpact?: () => void;
  /** Vibrate (Android) at the flash. Default true. */
  haptics?: boolean;
  /** Screen effects used for the flash. Default the shared instance. */
  screen?: ScreenFx;
}

/** Banner geometry in design px. */
const BAND_H = 270;
const SKEW = 34;
const PORTRAIT_H = 440;
/** Taps in the first moments are treated as leftovers of the press that started the awakening. */
const MIN_SKIP_TIME = 0.15;
const RING_SECONDS = 0.45;
/** Where the banner sits, as a fraction of the screen height, and how long a skipped banner takes to leave. */
const BANNER_Y = 0.4;
const SKIP_OUT_SECONDS = 0.18;

/**
 * The mythic awakening cut-in (guide 2.2.3), a paper collage: the floor dims warm brown, paper
 * streaks race into the centre, a warm flash, then a strip of the class colour slides across with the
 * cat's sticker popping in front of a flat paper sunburst and its name on a torn cream label; it holds
 * and slides out. Drawn on game.overlayLayer, timed on the real game clock so a hit-stop never stretches it.
 *
 * It never blocks: play() returns at once with a promise that settles when the cut-in is over, and
 * the game keeps running underneath. A tap anywhere skips to the exit. Only one plays at a time;
 * starting another ends the first immediately.
 */
export class AwakeningCutIn {
  private run: Run | null = null;
  private readonly lineSprites = makeSpritePool();

  /** True while a cut-in is on screen. */
  get playing(): boolean {
    return this.run !== null;
  }

  play(portrait: Texture, name: string, o: AwakeningOpts = {}): FxSequence {
    this.run?.finish();
    const plan = awakeningPlan(o.short === true, fxSettings.reducedMotion);
    const run: Run = new Run(this.lineSprites, portrait, name, plan, o, () => {
      if (this.run === run) this.run = null;
    });
    this.run = run;
    return Object.assign(run.done, { impact: plan.impact, duration: plan.total });
  }

  /** Jump to the exit now (what a tap does). Ignored while no cut-in plays. */
  skip(): void {
    this.run?.skip();
  }

  /** End any cut-in at once and free the shared sprites. */
  destroy(): void {
    this.run?.finish();
    this.lineSprites.drain((s) => s.destroy());
  }
}

class Run {
  readonly done: Promise<void>;
  private resolve!: () => void;
  private readonly layer = new Container();
  private readonly dim = new Sprite(Texture.WHITE);
  private readonly lines: Sprite[] = [];
  private readonly ring: Sprite;
  private readonly banner = new Container();
  private readonly burst: Sprite;
  private readonly portrait: Sprite;
  private readonly nameText: PaperLabel;
  private readonly tagText: Text;
  private readonly portraitBase: number;
  private readonly burstSize: number;
  private readonly hit = new Sprite(Texture.WHITE);
  private readonly off: () => void;
  private readonly screen: ScreenFx;
  private t = 0;
  private fired = false;
  private ended = false;
  private laidOutH = -1;
  /** Time of the skip tap (-1: none) and the banner / dim state it interrupted. */
  private skipAt = -1;
  private skipOffset = 0;
  private skipDim = 0;

  constructor(
    private readonly pool: Pool<Sprite>,
    portrait: Texture,
    name: string,
    private readonly plan: CutInPlan,
    private readonly o: AwakeningOpts,
    private readonly onEnd: () => void,
  ) {
    this.screen = o.screen ?? screenFx;
    const color = o.color ?? Rarity.mythic.color;
    this.done = new Promise<void>((res) => {
      this.resolve = res;
    });

    this.dim.tint = Dim.backdrop;
    this.dim.alpha = 0;
    this.layer.addChild(this.dim);

    const spark = fxTex('spark');
    for (let i = 0; i < plan.lines; i++) {
      const s = pool.get();
      s.texture = spark.texture;
      s.anchor.set(spark.ax, spark.ay);
      s.tint = i % 3 === 0 ? lighten(color, 0.6) : Hue.cream;
      s.alpha = 0;
      s.visible = true;
      this.layer.addChild(s);
      this.lines.push(s);
    }

    const ringTex = fxTex('ringThick');
    this.ring = pool.get();
    this.ring.texture = ringTex.texture;
    this.ring.anchor.set(ringTex.ax, ringTex.ay);
    this.ring.tint = Hue.cream;
    this.ring.alpha = 0;
    this.ring.visible = true;
    this.layer.addChild(this.ring);

    this.layer.addChild(this.banner);
    const left = -90;
    const right = game.w + 90;
    const strip = [left + SKEW, -BAND_H / 2, right + SKEW, -BAND_H / 2, right - SKEW, BAND_H / 2, left - SKEW, BAND_H / 2];
    const band = new Graphics();
    band.poly(strip.map((v, i) => (i % 2 === 1 ? v + 9 : v))).fill({ color: Color.shadow, alpha: 0.28 });
    band.poly(strip).fill(color);
    // Two strips of cream paper along the long edges, like the tape that holds the collage down.
    for (const edge of [-1, 1]) {
      const y = (edge * (BAND_H - 18)) / 2;
      band.poly([left + SKEW * -edge + 4, y - 5, right + SKEW * -edge - 4, y - 5, right + SKEW * -edge - 4, y + 5, left + SKEW * -edge + 4, y + 5]).fill(Hue.cream);
    }
    this.banner.addChild(band);

    const burstTex = fxTex('sun');
    this.burst = pool.get();
    this.burst.texture = burstTex.texture;
    this.burst.anchor.set(burstTex.ax, burstTex.ay);
    this.burst.tint = mixColor(color, Hue.cream, 0.6);
    this.burst.alpha = 1;
    this.burst.visible = true;
    this.burst.position.set(190, -10);
    this.burstSize = burstTex.w;
    this.burst.scale.set(430 / burstTex.w);
    this.banner.addChild(this.burst);

    this.portrait = new Sprite(portrait);
    this.portrait.anchor.set(0.5);
    const fit = Math.min(PORTRAIT_H / Math.max(1, portrait.height), 330 / Math.max(1, portrait.width));
    this.portraitBase = fit;
    this.portrait.scale.set(fit);
    this.portrait.position.set(190, -14);
    this.banner.addChild(this.portrait);

    this.nameText = new PaperLabel({ text: name, size: 58, paper: Color.paperLight, maxWidth: 380, minWidth: 220, torn: 'ends' });
    this.nameText.position.set(520, 26);
    this.banner.addChild(this.nameText);
    this.tagText = label(o.tag ?? '', { size: 30, onArt: true });
    this.tagText.position.set(520, -56);
    this.tagText.visible = o.tag !== undefined && o.tag !== '';
    this.banner.addChild(this.tagText);

    this.hit.eventMode = 'static';
    this.hit.alpha = 0;
    this.hit.on('pointerdown', () => this.skip());
    this.layer.addChild(this.hit);

    // Directly below the screen effects, so the impact flash washes over the banner as it arrives.
    const overlay = game.overlayLayer;
    overlay.addChildAt(this.layer, Math.max(0, overlay.getChildIndex(this.screen.layer)));
    this.layout();
    this.off = game.onUpdate((dt) => this.step(dt));
  }

  /** First tap: slide out from wherever the banner is. A second tap ends it at once. */
  skip(): void {
    if (this.ended || this.t < MIN_SKIP_TIME) return;
    if (this.skipAt >= 0) {
      this.finish();
      return;
    }
    this.skipAt = this.t;
    this.skipOffset = bannerOffset(this.t, this.plan);
    this.skipDim = dimAmount(this.t, this.plan);
    // The awakened unit must still appear, so the flash moment is never skipped, only its length.
    if (!this.fired) this.impact();
  }

  finish(): void {
    if (this.ended) return;
    this.ended = true;
    this.off();
    for (const s of this.lines) this.pool.release(s);
    this.lines.length = 0;
    this.pool.release(this.ring);
    this.pool.release(this.burst);
    this.layer.parent?.removeChild(this.layer);
    // The pooled sprites are already back in the pool; the rest (the caller's portrait texture excepted) dies with the layer.
    this.layer.destroy({ children: true });
    this.onEnd();
    this.resolve();
  }

  private impact(): void {
    this.fired = true;
    this.screen.flash(Hue.sun, 0.45, 160);
    fxShake(Trauma.t3);
    if (this.o.haptics !== false) haptic('heavy');
    this.o.onImpact?.();
  }

  private layout(): void {
    this.laidOutH = game.h;
    this.dim.width = game.w;
    this.dim.height = game.h;
    this.hit.width = game.w;
    this.hit.height = game.h;
    this.banner.y = game.h * BANNER_Y;
    this.ring.position.set(game.w / 2, game.h * BANNER_Y);
  }

  private step(dt: number): void {
    if (this.ended) return;
    this.t += dt;
    const p = this.plan;
    const skipping = this.skipAt >= 0;
    const out = skipping ? clamp01((this.t - this.skipAt) / SKIP_OUT_SECONDS) : 0;
    if (this.t >= p.total || out >= 1) {
      this.finish();
      return;
    }
    const t = this.t;
    if (!this.fired && t >= p.impact) this.impact();
    if (game.h !== this.laidOutH) this.layout();

    let offset: number;
    if (skipping) {
      offset = this.skipOffset + (1.1 - this.skipOffset) * Ease.cubicIn(out);
      this.dim.alpha = 0.6 * this.skipDim * (1 - out);
    } else {
      offset = bannerOffset(t, p);
      this.dim.alpha = 0.6 * dimAmount(t, p);
    }
    this.banner.x = offset * game.w;
    this.banner.visible = t >= p.impact || skipping;

    // Speed lines race from the screen edge towards the centre, stretching as they speed up.
    const cx = game.w / 2;
    const cy = game.h * BANNER_Y;
    const k = clamp01(t / p.impact);
    const reach = Math.hypot(game.w, game.h) * 0.5;
    const ek = Ease.cubicIn(k);
    for (let i = 0; i < this.lines.length; i++) {
      const s = this.lines[i] as Sprite;
      const a = ((i + hash01(i * 7.3) * 0.8) / this.lines.length) * TAU;
      const r = reach * (1 - 0.88 * ek) * (0.78 + 0.22 * hash01(i * 3.1));
      s.position.set(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
      // The streak's bright head points at the centre.
      s.rotation = a + Math.PI;
      s.scale.set((90 + 280 * ek) / 128, 1.1);
      s.alpha = t < p.impact && !skipping ? Math.min(1, k * 4) : 0;
    }

    const rp = clamp01((t - p.impact) / RING_SECONDS);
    if (t >= p.impact && rp < 1) {
      this.ring.alpha = 0.9 * (1 - rp) * (1 - rp);
      this.ring.scale.set((game.w * 1.1 * Ease.cubicOut(rp)) / 64);
    } else {
      this.ring.alpha = 0;
    }

    // The sticker pops in with a small overshoot and keeps creeping up while the banner holds; the
    // sunburst turns slowly behind it and the name label is stamped on a beat later.
    const hold = clamp01((t - p.impact) / (p.exitAt - p.impact));
    const pop = backOutS(clamp01((t - p.impact) / 0.22), 1.4);
    this.portrait.scale.set(this.portraitBase * (0.35 + 0.65 * pop) * (1 + 0.04 * hold));
    this.burst.rotation = fxSettings.reducedMotion ? 0 : t * 0.5;
    this.burst.scale.set((430 / this.burstSize) * (0.5 + 0.5 * pop));
    const np = clamp01((t - p.impact - 0.08) / 0.18);
    this.nameText.scale.set(1.35 - 0.35 * backOutS(np, 1.4));
    this.nameText.alpha = clamp01(np * 5);
    this.tagText.alpha = clamp01(np * 3);
  }
}

/** Shared instance: there is one overlay, so there is one cut-in at a time. */
export const awakeningCutIn = new AwakeningCutIn();
