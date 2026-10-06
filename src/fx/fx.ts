import { Container, type Sprite } from 'pixi.js';
import { game } from '@/core/game';
import { haptic, type HapticId } from '@/core/haptics';
import { Ease, type Tween, type Tweener } from '@/core/tween';
import { TAU, darken, lighten, rand } from '@/core/math';
import { Color, RARITY_ORDER, Rarity } from '@/ui/theme';
import { buildBolt, boltPointCount } from './bolt';
import type { TimeFreeze } from './freeze';
import { FloatingNumbers, type NumStyle, type NumberOpts } from './numbers';
import { EmitterGroup, type FxHandle } from './handles';
import { ParticleSystem, type BurstMods, type EmitDef } from './particles';
import { hitFlash } from './juice';
import { Rays, makeRayPool, type RaysOpts } from './rays';
import { FX_TIERS, REDUCED, fxSettings, motionSeconds, setFxSettings, type FxTier } from './settings';
import { ScreenFx, Trauma, fxShake, screenFx } from './screen';
import { ensureFxTextures } from './textures';

const W = 0xffffff;
const PI = Math.PI;

export interface FxOpts {
  /** Main colour; presets derive highlight and shadow tones from it. */
  color?: number;
  /** Size / reach multiplier. Default 1. */
  scale?: number;
}

export interface HitSparkOpts extends FxOpts {
  /** Direction the attack was travelling (radians). Sparks spray back against it. Omit for a radial pop. */
  angle?: number;
}

export interface SlashOpts extends FxOpts {
  /** Direction the crescent bulges towards (radians). Default up-left. */
  angle?: number;
}

export interface ShockwaveOpts extends FxOpts {
  /** Final radius in design px. Default 150. */
  radius?: number;
  /** Seconds before it starts. */
  delay?: number;
}

export interface CoinOpts extends FxOpts {
  count?: number;
}

export interface CritOpts extends FxOpts {
  /** Target is a boss or elite: adds the small T1 camera shake (plain crits never shake the screen). */
  strong?: boolean;
}

export interface SummonOpts extends FxOpts {
  /**
   * Fired at the visual impact moment: reveal the unit here. Always asynchronous: it runs at
   * `timeline.impact` seconds on the Fx's Tweener (the next frame for tier 0), never before
   * summonReveal returns, so `const tl = fx.summonReveal(..., { onImpact })` may use `tl` inside it.
   */
  onImpact?: () => void;
  /**
   * Short version for repeated reveals (the second mythic of a run, rapid multi-pulls): plays the
   * epic-sized recipe in the tier's colours, with no charge-up, flash, hit-stop or big shake.
   */
  quick?: boolean;
}

/** When a composite effect peaks and when it is over, in seconds from the call. */
export interface FxTimeline {
  /** Moment of impact: reveal the unit, drop the loot, hide the boss. */
  impact: number;
  /** Seconds until the effect has fully played out. */
  duration: number;
}

export type SummonTimeline = FxTimeline;

export interface BossDeathOpts extends FxOpts {
  /** Radius of the area the mini explosions scatter over, design px. Default 80. */
  radius?: number;
  /** The boss sprite: it flickers white and red while it dies. */
  target?: Sprite;
  /** Fired at the final blast, when the boss should disappear. */
  onFinal?: () => void;
}

export interface WaveClearOpts {
  /** Peggle-style finish: half-speed gameplay for 0.2 s after the last kill. */
  slowMo?: boolean;
}

export interface ConfettiOpts {
  count?: number;
  /** Width of the emission strip; default the whole design width. */
  width?: number;
  /** Centre of the strip. Default the middle of the screen. */
  x?: number;
  y?: number;
  palette?: readonly number[];
}

export interface LightningOpts extends FxOpts {
  /** Number of side branches. Default 2. */
  branches?: number;
  /** Core thickness in design px. Default 5. */
  thickness?: number;
}

export interface FxCreateOpts {
  /** Live particle cap. Default 700. */
  budget?: number;
  /** Screen effects used by the big reveals. Default the shared instance. */
  screen?: ScreenFx;
  /** Hit-stop used by tier 3+ reveals and the boss / wave presets; omit for none. */
  freeze?: TimeFreeze;
  /** Vibrate (Android) on big moments, per the guide's per-event patterns. Default true. */
  haptics?: boolean;
}

const CONFETTI_PALETTE: readonly number[] = [0xff4d7a, 0xffd23f, 0x4ee3ff, 0xb26bff, 0x7dff6b, 0xffffff];

/** Tier -> rarity colours (research guide 3.7). */
function tierStyle(tier: number): (typeof Rarity)[keyof typeof Rarity] {
  return Rarity[RARITY_ORDER[Math.max(0, Math.min(4, Math.floor(tier)))] as keyof typeof Rarity];
}

/**
 * The per-scene effects facade. Create one with the container effects should live in (design-space
 * coordinates) and the Tweener that should drive effect timelines; call update(dt) from the scene.
 * Every preset is fire-and-forget (or returns a handle for looping effects) and honours fxSettings.
 */
export class Fx {
  readonly root = new Container();
  readonly ps: ParticleSystem;
  readonly numbers: FloatingNumbers;
  private readonly back = new Container();
  private readonly rayPool = makeRayPool();
  private readonly rayList: Rays[] = [];
  private readonly timers: Tween[] = [];
  private readonly screen: ScreenFx;
  private readonly freeze: TimeFreeze | undefined;
  private readonly haptics: boolean;
  private readonly bolt = new Float32Array(2 * boltPointCount(4));
  private readonly boltB = new Float32Array(2 * boltPointCount(3));

  constructor(
    target: Container,
    private readonly tweens: Tweener,
    o: FxCreateOpts = {},
  ) {
    ensureFxTextures();
    this.root.label = 'fx';
    this.root.eventMode = 'none';
    target.addChild(this.root);
    this.root.addChild(this.back);
    this.ps = new ParticleSystem(this.root, o.budget ?? 700);
    this.numbers = new FloatingNumbers(this.root);
    this.screen = o.screen ?? screenFx;
    this.freeze = o.freeze;
    this.haptics = o.haptics ?? true;
  }

  update(dt: number): void {
    this.ps.update(dt);
    this.numbers.update(dt);
    for (let i = this.rayList.length - 1; i >= 0; i--) {
      const r = this.rayList[i] as Rays;
      r.update(dt);
      if (!r.alive) this.rayList.splice(i, 1);
    }
  }

  /** Remove every live effect immediately. */
  clear(): void {
    this.ps.clear();
    this.numbers.clear();
    for (const r of this.rayList) r.dispose();
    this.rayList.length = 0;
    for (const t of this.timers) t.kill();
    this.timers.length = 0;
  }

  destroy(): void {
    this.clear();
    this.numbers.destroy();
    this.ps.destroy();
    this.root.destroy({ children: true });
  }

  stats(): ReturnType<ParticleSystem['stats']> & { numbers: number; rays: number; timers: number } {
    return { ...this.ps.stats(), numbers: this.numbers.count, rays: this.rayList.length, timers: this.timers.length };
  }

  /** Apply a device quality tier: particle multiplier plus this Fx's particle and number caps. */
  applyTier(tier: FxTier): void {
    const t = FX_TIERS[tier];
    setFxSettings({ quality: t.quality });
    this.ps.budget.cap = t.particles;
    this.numbers.cap = t.numbers;
  }

  /** Floating combat number; see FloatingNumbers.show. */
  number(x: number, y: number, value: number | string, style: NumStyle = 'damage', o?: NumberOpts): void {
    this.numbers.show(x, y, value, style, o);
  }

  private after(seconds: number, fn: () => void): void {
    for (let i = this.timers.length - 1; i >= 0; i--) if (!(this.timers[i] as Tween).alive) this.timers.splice(i, 1);
    this.timers.push(this.tweens.call(seconds, fn));
  }

  private burst(def: EmitDef, x: number, y: number, mods?: BurstMods): void {
    this.ps.burst(def, x, y, mods);
  }

  private buzz(id: HapticId): void {
    if (this.haptics) haptic(id);
  }

  /* ---- combat hits -------------------------------------------------------------------------- */

  hitSpark(x: number, y: number, o: HitSparkOpts = {}): void {
    const c = o.color ?? 0xffd96b;
    const hi = lighten(c, 0.75);
    const m: BurstMods = { scale: o.scale ?? 1 };
    const aimed = o.angle !== undefined;
    this.burst(
      {
        tex: 'spark', prio: 0, count: 7, life: [0.16, 0.28], speed: [300, 600],
        dir: aimed ? (o.angle as number) + PI : 'out', spread: aimed ? 0.85 : PI,
        drag: 5, alignVel: true, stretch: 0.0026, size: [30, 48], sizeEnd: [9, 12],
        colors: [W, hi, c], fadeIn: 0, fadeOut: 0.55,
      },
      x, y, m,
    );
    this.burst(
      {
        tex: 'starburst', prio: 0, count: 1, life: 0.12, size: [62, 76], sizeEnd: [34, 40],
        rot: [0, TAU], colors: [W, hi], fadeIn: 0, fadeOut: 0.8, sizeEase: Ease.cubicOut,
      },
      x, y, m,
    );
    this.burst(
      { tex: 'glow', prio: 0, count: 1, life: 0.14, size: 54, sizeEnd: 92, colors: [W, c], alpha: 0.85, fadeIn: 0, fadeOut: 0.85, sizeEase: Ease.cubicOut },
      x, y, m,
    );
    this.burst(
      { tex: 'dot', prio: 0, count: 3, life: [0.16, 0.26], speed: [60, 180], drag: 4, size: [6, 10], sizeEnd: 2, colors: [W, c], fadeIn: 0 },
      x, y, m,
    );
  }

  critBurst(x: number, y: number, o: CritOpts = {}): void {
    if (o.strong) fxShake(Trauma.t1);
    const c = o.color ?? 0xffc933;
    const hi = lighten(c, 0.7);
    const deep = 0xff7a1a;
    const m: BurstMods = { scale: o.scale ?? 1 };
    this.burst(
      {
        tex: 'star', prio: 2, count: 1, life: 0.24, size: 26, sizeEnd: 112, rot: [-0.3, 0.3], spin: [-1.4, 1.4],
        colors: [W, hi, c], sizeEase: Ease.cubicOut, fadeIn: 0, fadeOut: 0.45,
      },
      x, y, m,
    );
    this.burst(
      { tex: 'starburst', prio: 2, count: 1, life: 0.2, size: 60, sizeEnd: 170, rot: [0, TAU], colors: [W, hi], sizeEase: Ease.cubicOut, fadeIn: 0, fadeOut: 0.7 },
      x, y, m,
    );
    this.shockwave(x, y, { color: c, radius: 100 * (o.scale ?? 1), scale: 1 });
    this.burst(
      {
        tex: 'spark', prio: 2, count: 12, life: [0.22, 0.42], speed: [340, 740], drag: 4.2, alignVel: true, stretch: 0.0022,
        size: [28, 46], sizeEnd: [8, 10], colors: [W, hi, deep], fadeIn: 0, fadeOut: 0.55,
      },
      x, y, m,
    );
    this.burst(
      {
        tex: 'sparkle', prio: 2, count: 4, life: [0.4, 0.62], speed: [50, 190], drag: 2.5, size: [26, 44], sizeEnd: [6, 10],
        spin: [-3, 3], rot: [0, TAU], colors: [W, c], fadeIn: 0.1, fadeOut: 0.5,
      },
      x, y, m,
    );
  }

  slashArc(x: number, y: number, o: SlashOpts = {}): void {
    const c = o.color ?? 0xffffff;
    const tint = lighten(c, 0.4);
    const s = o.scale ?? 1;
    const ang = o.angle ?? -2.4;
    const px = Math.cos(ang + PI / 2);
    const py = Math.sin(ang + PI / 2);
    // Three claw marks: a long centre stroke flanked by two shorter ones, each a hair later.
    const marks: ReadonlyArray<readonly [number, number, number]> = [
      [0, 1, 0],
      [-46 * s, 0.78, 0.025],
      [46 * s, 0.78, 0.05],
    ];
    for (const [off, k, delay] of marks) {
      this.burst(
        {
          tex: 'slash', prio: 1, count: 1, life: 0.26, delay,
          size: 40 * k, sizeEnd: 52 * k, sizeY: 150 * k, sizeYEnd: 176 * k,
          rot: ang, spin: 0.9, sizeEase: Ease.expoOut, colors: [W, tint, c], fadeIn: 0.05, fadeOut: 0.62,
        },
        x + px * off, y + py * off, { scale: s },
      );
    }
    this.burst(
      {
        tex: 'spark', prio: 1, count: 6, life: [0.14, 0.26], speed: [220, 460], dir: ang, spread: 0.9, drag: 5, alignVel: true,
        stretch: 0.002, size: [20, 32], sizeEnd: [6, 8], colors: [W, tint], fadeIn: 0, fadeOut: 0.5,
      },
      x, y, { scale: s },
    );
  }

  shockwave(x: number, y: number, o: ShockwaveOpts = {}): void {
    const c = o.color ?? 0xffffff;
    const r = (o.radius ?? 150) * (o.scale ?? 1);
    const d = o.delay ?? 0;
    this.burst(
      {
        tex: 'ringThick', prio: 1, count: 1, life: 0.46, delay: d, size: 28, sizeEnd: r * 2, sizeEase: Ease.cubicOut,
        colors: [lighten(c, 0.6), c], alpha: 0.85, fadeIn: 0, fadeOut: 0.8,
      },
      x, y,
    );
    this.burst(
      {
        tex: 'ring', prio: 1, count: 1, life: 0.52, delay: d, size: 24, sizeEnd: r * 2.2, sizeEase: Ease.quartOut,
        colors: [W, lighten(c, 0.35)], alpha: 0.95, fadeIn: 0, fadeOut: 0.7,
      },
      x, y,
    );
  }

  explosion(x: number, y: number, o: FxOpts = {}): void {
    const s = o.scale ?? 1;
    const c = o.color ?? 0xff8a2a;
    const hot = lighten(c, 0.65);
    const m: BurstMods = { scale: s };
    this.burst(
      { tex: 'glow', prio: 2, count: 1, life: 0.26, size: 50, sizeEnd: 210, colors: [W, hot, c], alpha: 0.85, sizeEase: Ease.cubicOut, fadeIn: 0, fadeOut: 0.7 },
      x, y, m,
    );
    this.burst(
      { tex: 'starburst', prio: 2, count: 1, life: 0.18, size: 90, sizeEnd: 220, rot: [0, TAU], colors: [W, hot], alpha: 0.9, sizeEase: Ease.cubicOut, fadeIn: 0, fadeOut: 0.6 },
      x, y, m,
    );
    this.shockwave(x, y, { color: c, radius: 135, scale: s });
    // Fire: additive puffs that cool from white-yellow through orange to dark red.
    this.burst(
      {
        tex: 'smoke', prio: 2, count: 7, life: [0.32, 0.55], shape: { type: 'circle', r: 22 }, speed: [40, 150], drag: 3,
        size: [60, 88], sizeEnd: [110, 150], rot: [0, TAU], spin: [-1, 1], colors: [lighten(c, 0.4), c, darken(c, 0.7)], alpha: 0.85, fadeIn: 0.05, fadeOut: 0.6,
      },
      x, y, m,
    );
    this.burst(
      {
        tex: 'dot', prio: 1, count: 18, life: [0.5, 1.0], speed: [160, 560], drag: 1.6, gravity: 520, size: [6, 13], sizeEnd: 2,
        colors: [W, 0xffc34a, 0xff4a1a], fadeIn: 0, fadeOut: 0.5,
      },
      x, y, m,
    );
    this.burst(
      {
        tex: 'shard', blend: 'normal', prio: 1, count: 6, life: [0.55, 0.9], speed: [180, 460], gravity: 900, drag: 0.6, size: [14, 24],
        sizeEnd: [8, 12], spin: [-9, 9], rot: [0, TAU], colors: [darken(c, 0.3), darken(c, 0.65)], fadeIn: 0, fadeOut: 0.4,
      },
      x, y, m,
    );
    this.burst(
      {
        tex: 'smoke', blend: 'normal', prio: 1, count: 7, life: [0.8, 1.25], shape: { type: 'circle', r: 26 }, speed: [30, 110], drag: 1.6,
        gravity: -45, size: [56, 80], sizeEnd: [120, 168], rot: [0, TAU], spin: [-0.6, 0.6], colors: [0x4a3d52, 0x2a2133], alpha: 0.6,
        fadeIn: 0.15, fadeOut: 0.6, delay: [0.05, 0.14],
      },
      x, y, m,
    );
  }

  deathPuff(x: number, y: number, o: FxOpts = {}): void {
    const c = o.color ?? 0xb7c2d0;
    const m: BurstMods = { scale: o.scale ?? 1 };
    this.burst(
      { tex: 'glow', prio: 1, count: 1, life: 0.16, size: 50, sizeEnd: 100, colors: [W, lighten(c, 0.6)], alpha: 0.8, fadeIn: 0, fadeOut: 0.8, sizeEase: Ease.cubicOut },
      x, y, m,
    );
    this.burst(
      {
        tex: 'smoke', blend: 'normal', prio: 1, count: 6, life: [0.4, 0.68], shape: { type: 'circle', r: 12 }, speed: [40, 140], drag: 3,
        gravity: -26, size: [34, 48], sizeEnd: [72, 100], rot: [0, TAU], spin: [-1.5, 1.5],
        colors: [lighten(c, 0.5), c, darken(c, 0.45)], alpha: 0.85, fadeIn: 0.06, fadeOut: 0.65,
      },
      x, y, m,
    );
    this.burst(
      {
        tex: 'shard', blend: 'normal', prio: 1, count: 6, life: [0.45, 0.72], speed: [170, 360], gravity: 760, drag: 0.7, size: [14, 24],
        sizeEnd: [8, 12], spin: [-10, 10], rot: [0, TAU], colors: [lighten(c, 0.2), c, darken(c, 0.4)], fadeIn: 0, fadeOut: 0.45,
      },
      x, y, m,
    );
    this.burst(
      { tex: 'ring', prio: 1, count: 1, life: 0.26, size: 18, sizeEnd: 100, colors: [W, lighten(c, 0.4)], alpha: 0.8, fadeIn: 0, fadeOut: 0.8, sizeEase: Ease.cubicOut },
      x, y, m,
    );
  }

  coinBurst(x: number, y: number, o: CoinOpts = {}): void {
    const m: BurstMods = { scale: o.scale ?? 1, count: (o.count ?? 10) / 10 };
    const gold = o.color ?? Color.gold;
    this.burst(
      { tex: 'glow', prio: 1, count: 1, life: 0.2, size: 40, sizeEnd: 120, colors: [W, gold], alpha: 0.8, fadeIn: 0, fadeOut: 0.8, sizeEase: Ease.cubicOut },
      x, y, { scale: o.scale ?? 1 },
    );
    this.burst(
      {
        tex: 'coin', blend: 'normal', prio: 1, count: 10, life: [0.7, 1.05], speed: [280, 540], dir: -PI / 2, spread: 0.95, gravity: 1500,
        drag: 0.4, flip: [9, 17], spin: [-2, 2], size: [28, 36], colors: [lighten(gold, 0.25), gold], fadeIn: 0, fadeOut: 0.28,
      },
      x, y, m,
    );
    this.burst(
      {
        tex: 'sparkle', prio: 1, count: 6, life: [0.35, 0.6], speed: [70, 230], drag: 3, size: [18, 30], sizeEnd: [4, 8], spin: [-4, 4],
        rot: [0, TAU], colors: [W, lighten(gold, 0.5), gold], fadeIn: 0.1, fadeOut: 0.5,
      },
      x, y, { scale: o.scale ?? 1 },
    );
  }

  /**
   * Inward suck, then an outward star burst in the merged tier's colour, with the guide's small
   * (3 px) board shake at the moment of impact.
   */
  mergeBurst(x: number, y: number, color: number = Color.primary, scale = 1): void {
    const hi = lighten(color, 0.55);
    const m: BurstMods = { scale };
    const suck = 0.17;
    this.after(suck, () => {
      fxShake(0.41);
      this.buzz('light');
    });
    this.burst(
      {
        tex: 'glow', prio: 2, count: 16, life: [0.13, 0.2], shape: { type: 'ring', r: 120, width: 30 }, size: [30, 44], sizeEnd: [10, 16],
        colors: [hi, color], alpha: 0.9, fadeIn: 0.1, fadeOut: 0.2, converge: { swirl: 34, ease: Ease.cubicIn },
      },
      x, y, m,
    );
    this.burst(
      {
        tex: 'spark', prio: 2, count: 12, life: [0.13, 0.18], shape: { type: 'ring', r: 105, width: 40 }, size: [34, 54], sizeEnd: [12, 18],
        alignVel: true, stretch: 0.0006, colors: [W, hi], fadeIn: 0.1, fadeOut: 0.2, converge: { swirl: -26, ease: Ease.cubicIn },
      },
      x, y, m,
    );
    this.burst(
      { tex: 'glow', prio: 2, count: 1, life: 0.24, delay: suck, size: 50, sizeEnd: 210, colors: [W, hi, color], sizeEase: Ease.cubicOut, fadeIn: 0, fadeOut: 0.75 },
      x, y, m,
    );
    this.burst(
      {
        tex: 'star', prio: 2, count: 8, life: [0.45, 0.72], delay: suck, speed: [220, 480], drag: 3.2, size: [26, 44], sizeEnd: [6, 10],
        spin: [-5, 5], rot: [0, TAU], colors: [W, color, darken(color, 0.3)], fadeIn: 0, fadeOut: 0.5,
      },
      x, y, m,
    );
    this.burst(
      {
        tex: 'sparkle', prio: 2, count: 9, life: [0.5, 0.85], delay: suck, speed: [90, 280], drag: 2.6, size: [18, 32], sizeEnd: [4, 8],
        spin: [-3, 3], rot: [0, TAU], colors: [W, hi], fadeIn: 0.1, fadeOut: 0.5,
      },
      x, y, m,
    );
    this.shockwave(x, y, { color, radius: 130, scale, delay: suck });
  }

  /* ---- summon reveals ----------------------------------------------------------------------- */

  /**
   * Gacha / summon reveal that escalates with rarity tier 0 (common) .. 4 (mythic). The tier's colour
   * is visible from the very first frame ("colour first, identity later"); higher tiers then charge
   * for longer (inward light, a swelling core) before an impact with more layers, shake, flash and
   * hit-stop. Reveal the unit in `onImpact` / at `timeline.impact`.
   */
  summonReveal(x: number, y: number, tier: number, o: SummonOpts = {}): FxTimeline {
    const t = Math.max(0, Math.min(4, Math.floor(tier)));
    const rs = tierStyle(t);
    const c = o.color ?? rs.color;
    const s = o.scale ?? 1;
    const recipe = o.quick ? Math.min(t, 2) : t;
    let timeline: FxTimeline;
    if (recipe === 0) timeline = this.summonCommon(x, y, c, rs.light, s);
    else if (recipe === 1) timeline = this.summonRare(x, y, c, rs.light, rs.glow, s);
    else if (recipe === 2) timeline = this.summonEpic(x, y, c, rs.light, rs.glow, s);
    else if (recipe === 3) timeline = this.summonLegendary(x, y, c, rs.light, rs.glow, s);
    else timeline = this.mythic(x, y, c, s);

    if (o.quick && t >= 3) this.quickFinish(x, y, c, rs.light, s, t === 4);
    const onImpact = o.onImpact;
    if (onImpact) this.after(Math.max(0, timeline.impact), onImpact);
    return timeline;
  }

  private summonCommon(x: number, y: number, c: number, hi: number, s: number): FxTimeline {
    const m: BurstMods = { scale: s };
    this.burst(
      {
        tex: 'smoke', blend: 'normal', prio: 1, count: 6, life: [0.32, 0.5], shape: { type: 'circle', r: 10 }, speed: [40, 120], drag: 3,
        gravity: -30, size: [24, 34], sizeEnd: [52, 72], rot: [0, TAU], colors: [0xf1f4f8, c], alpha: 0.55, fadeIn: 0.1, fadeOut: 0.6,
      },
      x, y + 10, m,
    );
    this.burst(
      { tex: 'ring', prio: 1, count: 1, life: 0.3, size: 20, sizeEnd: 120, colors: [W, c], alpha: 0.8, fadeIn: 0, fadeOut: 0.8, sizeEase: Ease.cubicOut },
      x, y, m,
    );
    this.burst(
      { tex: 'dot', prio: 1, count: 6, life: [0.25, 0.4], speed: [80, 210], drag: 3, size: [5, 9], sizeEnd: 2, colors: [W, hi], fadeIn: 0 },
      x, y, m,
    );
    this.buzz('tap');
    return { impact: 0, duration: 0.55 };
  }

  private summonRare(x: number, y: number, c: number, hi: number, glow: number, s: number): FxTimeline {
    const impact = 0.06;
    const m: BurstMods = { scale: s, delay: impact };
    this.groundGlow(x, y + 28, c, hi, s, 0.5, 1);
    this.shockwave(x, y, { color: c, radius: 135, scale: s, delay: impact });
    this.burst(
      {
        tex: 'sparkle', prio: 1, count: 9, life: [0.5, 0.9], speed: [80, 240], dir: -PI / 2, spread: 1.7, drag: 2, gravity: -30,
        size: [16, 28], sizeEnd: [4, 8], spin: [-3, 3], rot: [0, TAU], colors: [W, glow, c], fadeIn: 0.1, fadeOut: 0.5,
      },
      x, y, m,
    );
    this.burst(
      { tex: 'glow', prio: 1, count: 1, life: 0.16, size: 60, sizeEnd: 130, colors: [W, hi], alpha: 0.8, fadeIn: 0, fadeOut: 0.8 },
      x, y, m,
    );
    this.buzz('light');
    return { impact, duration: 0.95 };
  }

  private summonEpic(x: number, y: number, c: number, hi: number, glow: number, s: number): FxTimeline {
    const impact = 0.12;
    const m: BurstMods = { scale: s, delay: impact };
    this.groundGlow(x, y + 30, c, hi, s, 0.6, 1.2);
    // Anticipation: a handful of motes streams in while the cell swells (the caller squashes it).
    this.burst(
      {
        tex: 'glow', prio: 2, count: 8, life: [0.09, impact], shape: { type: 'ring', r: 110, width: 30 }, size: [24, 34], sizeEnd: [8, 12],
        colors: [hi, c], alpha: 0.9, fadeIn: 0.1, fadeOut: 0.2, converge: { swirl: 26, ease: Ease.cubicIn },
      },
      x, y, { scale: s },
    );
    this.pillar(x, y + 34, c, glow, s, 96, 400, 0.62, impact);
    this.shockwave(x, y, { color: c, radius: 175, scale: s, delay: impact });
    this.burst(
      {
        tex: 'sparkle', prio: 2, count: 12, life: [0.6, 1.1], speed: [90, 300], dir: -PI / 2, spread: 1.0, drag: 1.4, gravity: 90,
        shape: { type: 'rect', w: 70, h: 10 }, size: [18, 32], sizeEnd: [4, 8], spin: [-3, 3], rot: [0, TAU],
        colors: [W, glow, c], fadeIn: 0.1, fadeOut: 0.5,
      },
      x, y + 20, m,
    );
    this.burst(
      { tex: 'glow', prio: 2, count: 1, life: 0.2, size: 70, sizeEnd: 170, colors: [W, glow, c], alpha: 0.9, fadeIn: 0, fadeOut: 0.8 },
      x, y, m,
    );
    this.after(impact, () => {
      this.rays(x, y, { color: glow, radius: 250 * s, duration: 0.9, alpha: 0.45, count: 6 });
      fxShake(Trauma.t2 * 0.9);
      this.buzz('light');
    });
    return { impact, duration: 1.15 };
  }

  private summonLegendary(x: number, y: number, c: number, hi: number, glow: number, s: number): FxTimeline {
    const impact = 0.22;
    const m: BurstMods = { scale: s, delay: impact };
    this.groundGlow(x, y + 30, c, hi, s, 0.75, 1.5);
    // Anticipation: the colour is known, the cell contracts, light is sucked in, the edges warm up.
    this.burst(
      {
        tex: 'glow', prio: 2, count: 12, life: [0.16, impact], shape: { type: 'ring', r: 170, width: 40 }, size: [28, 40], sizeEnd: [8, 14],
        colors: [hi, c], alpha: 0.9, fadeIn: 0.1, fadeOut: 0.2, converge: { swirl: 40, ease: Ease.cubicIn },
      },
      x, y, { scale: s },
    );
    this.screen.vignettePulse(glow, 0.18, 500, 1);
    this.pillar(x, y + 36, c, glow, s, 140, 560, 0.8, impact);
    this.shockwave(x, y, { color: c, radius: 240, scale: s, delay: impact });
    this.shockwave(x, y, { color: hi, radius: 170, scale: s, delay: impact + 0.1 });
    this.burst(
      {
        tex: 'sparkle', prio: 2, count: 16, life: [0.9, 1.7], delay: [0.1, 0.55], shape: { type: 'rect', w: 380, h: 30 }, speed: [30, 110],
        dir: PI / 2, spread: 0.5, gravity: 130, drag: 0.5, size: [16, 34], sizeEnd: [4, 8], spin: [-3, 3], rot: [0, TAU],
        colors: [W, glow, c], fadeIn: 0.15, fadeOut: 0.5,
      },
      x, y - 280 * s, m,
    );
    this.burst(
      {
        tex: 'star', prio: 2, count: 8, life: [0.55, 0.9], speed: [200, 520], drag: 2.8, size: [26, 46], sizeEnd: [6, 10], spin: [-5, 5],
        rot: [0, TAU], colors: [W, hi, c], fadeIn: 0, fadeOut: 0.5,
      },
      x, y, m,
    );
    this.burst(
      { tex: 'glow', prio: 2, count: 1, life: 0.28, size: 90, sizeEnd: 260, colors: [W, hi, c], alpha: 0.95, fadeIn: 0, fadeOut: 0.8 },
      x, y, m,
    );
    this.after(impact, () => {
      this.rays(x, y, { color: glow, radius: 440 * s, duration: 1.5, alpha: 0.5, count: 10 });
      this.screen.flash(c, 0.25, 100);
      fxShake(Trauma.t3 * 0.9);
      this.freeze?.freeze(0.05, 0);
      this.buzz('medium');
    });
    return { impact, duration: 1.8 };
  }

  /** What the short version of a legendary / mythic reveal adds on top of the epic recipe. */
  private quickFinish(x: number, y: number, c: number, hi: number, s: number, mythic: boolean): void {
    const m: BurstMods = { scale: s, delay: 0.12 };
    this.burst(
      {
        tex: 'star', prio: 2, count: 8, life: [0.5, 0.85], speed: [200, 480], drag: 2.8, size: [26, 44], sizeEnd: [6, 10], spin: [-5, 5],
        rot: [0, TAU], colors: [W, hi, c], fadeIn: 0, fadeOut: 0.5,
      },
      x, y, m,
    );
    if (mythic) {
      this.burst(
        {
          tex: 'confetti', blend: 'normal', prio: 2, count: 18, life: [0.9, 1.4], speed: [200, 560], drag: 1.7, gravity: 640, flip: [8, 16],
          spin: [-8, 8], rot: [0, TAU], size: [14, 22], palette: CONFETTI_PALETTE, colors: [W], fadeIn: 0, fadeOut: 0.3,
        },
        x, y, m,
      );
    }
  }

  private mythic(x: number, y: number, c: number, s: number): FxTimeline {
    const rs = tierStyle(4);
    const hi = rs.light;
    const glow = rs.glow;
    // 80 ms slow-down + 300 ms spiral charge (guide 2.2.3 S0 + S1), impact at 380 ms.
    const charge = 0.38;
    const m: BurstMods = { scale: s };
    // Anticipation: light streams in from a wide ring while a core swells.
    this.burst(
      {
        tex: 'glow', prio: 3, count: 20, life: [0.26, 0.34], delay: [0, 0.04], shape: { type: 'ring', r: 290, width: 70 }, size: [32, 50], sizeEnd: [10, 18],
        colors: [hi, c, W], alpha: 0.9, fadeIn: 0.12, fadeOut: 0.2, converge: { swirl: 70, ease: Ease.cubicIn },
      },
      x, y, m,
    );
    this.burst(
      {
        tex: 'sparkle', prio: 3, count: 14, life: [0.26, 0.32], delay: [0.02, 0.06], shape: { type: 'ring', r: 240, width: 60 }, size: [20, 32], sizeEnd: [6, 10],
        spin: [-6, 6], rot: [0, TAU], colors: [W, hi], fadeIn: 0.1, fadeOut: 0.15, converge: { swirl: -60, ease: Ease.cubicIn },
      },
      x, y, m,
    );
    // Radial speed lines: twelve streaks racing into the centre.
    this.burst(
      {
        tex: 'spark', prio: 3, count: 12, life: [0.3, 0.36], delay: [0, 0.02], shape: { type: 'ring', r: 330, width: 50 }, size: [70, 110], sizeEnd: [24, 36],
        alignVel: true, stretch: 0.0006, colors: [W, hi], alpha: 0.85, fadeIn: 0.1, fadeOut: 0.25, converge: { ease: Ease.cubicIn },
      },
      x, y, m,
    );
    this.burst(
      { tex: 'glow', prio: 3, count: 1, life: charge, size: 24, sizeEnd: 150, colors: [hi, W], alpha: 0.85, sizeEase: Ease.quadIn, fadeIn: 0.2, fadeOut: 0.05 },
      x, y, m,
    );
    this.rays(x, y, { color: glow, radius: 520 * s, duration: 2.0, alpha: 0.55, count: 14, speed: 0.5, fade: 0.4 });
    this.groundGlow(x, y + 30, c, hi, s, 0.9, 1.9, charge);

    // Impact.
    this.burst(
      { tex: 'glow', prio: 3, count: 1, life: 0.34, delay: charge, size: 90, sizeEnd: 340, colors: [W, hi, c], alpha: 1, sizeEase: Ease.cubicOut, fadeIn: 0, fadeOut: 0.8 },
      x, y, m,
    );
    this.burst(
      { tex: 'starburst', prio: 3, count: 1, life: 0.3, delay: charge, size: 160, sizeEnd: 420, rot: [0, TAU], colors: [W, hi], sizeEase: Ease.cubicOut, fadeIn: 0, fadeOut: 0.7 },
      x, y, m,
    );
    this.pillar(x, y + 40, c, W, s, 190, 720, 0.95, charge);
    this.shockwave(x, y, { color: c, radius: 330, scale: s, delay: charge });
    this.shockwave(x, y, { color: W, radius: 250, scale: s, delay: charge + 0.2 });
    this.burst(
      {
        tex: 'star', prio: 3, count: 14, life: [0.6, 1.0], delay: charge, speed: [260, 700], drag: 2.6, size: [30, 54], sizeEnd: [8, 14], spin: [-6, 6],
        rot: [0, TAU], colors: [W, hi, c], fadeIn: 0, fadeOut: 0.5,
      },
      x, y, m,
    );
    this.burst(
      {
        tex: 'confetti', blend: 'normal', prio: 3, count: 44, life: [1.3, 2.1], delay: charge, speed: [260, 820], drag: 1.7, gravity: 640, flip: [8, 16],
        spin: [-8, 8], rot: [0, TAU], size: [14, 22], palette: CONFETTI_PALETTE, colors: [W], fadeIn: 0, fadeOut: 0.3,
      },
      x, y, m,
    );
    this.burst(
      {
        tex: 'sparkle', prio: 3, count: 30, life: [0.9, 1.7], delay: [charge, charge + 0.35], shape: { type: 'rect', w: 420, h: 520 }, speed: [10, 60],
        dir: -PI / 2, spread: PI, gravity: -10, size: [16, 36], sizeEnd: [4, 8], spin: [-3, 3], rot: [0, TAU], colors: [W, glow, c], fadeIn: 0.2, fadeOut: 0.5,
      },
      x, y, m,
    );
    this.after(charge, () => {
      this.screen.flash(W, 0.45, 160);
      fxShake(Trauma.t5);
      this.freeze?.freezeThenSlow(0.12, 0.3, 0.3);
      this.buzz('jackpot');
    });
    return { impact: charge, duration: 2.4 };
  }

  /** Flat additive ellipse under a summoned unit; hints the colour before anything else happens. */
  private groundGlow(x: number, y: number, c: number, hi: number, s: number, alpha: number, widthK: number, delay = 0): void {
    this.burst(
      {
        tex: 'glow', prio: 1, count: 1, life: 0.55, delay, size: 150 * widthK, sizeEnd: 190 * widthK, sizeY: 64 * widthK, sizeYEnd: 80 * widthK,
        colors: [hi, c], alpha, fadeIn: 0.15, fadeOut: 0.7,
      },
      x, y, { scale: s },
    );
  }

  /** Vertical light column rising from (x,y) with a bright narrow core. */
  private pillar(x: number, y: number, c: number, core: number, s: number, width: number, height: number, alpha: number, delay = 0): void {
    this.burst(
      {
        tex: 'pillar', prio: 2, count: 1, life: 0.62, delay, size: width, sizeEnd: width * 0.45, sizeY: height * 0.3, sizeYEnd: height,
        sizeEase: Ease.cubicOut, colors: [W, core, c], alpha, fadeIn: 0.06, fadeOut: 0.65,
      },
      x, y, { scale: s },
    );
    this.burst(
      {
        tex: 'pillar', prio: 2, count: 1, life: 0.46, delay, size: width * 0.34, sizeEnd: width * 0.12, sizeY: height * 0.4, sizeYEnd: height * 1.1,
        sizeEase: Ease.cubicOut, colors: [W, W], alpha: alpha, fadeIn: 0.04, fadeOut: 0.7,
      },
      x, y, { scale: s },
    );
  }

  levelUp(x: number, y: number, o: FxOpts = {}): void {
    this.buzz('medium');
    const c = o.color ?? Color.gold;
    const hi = lighten(c, 0.6);
    const m: BurstMods = { scale: o.scale ?? 1 };
    for (let i = 0; i < 2; i++) {
      this.burst(
        {
          tex: 'ring', prio: 2, count: 1, life: 0.7, delay: i * 0.14, size: 70, sizeEnd: 250, sizeY: 26, sizeYEnd: 90, speed: 70, dir: -PI / 2, spread: 0,
          sizeEase: Ease.cubicOut, colors: [W, hi, c], alpha: 0.95, fadeIn: 0, fadeOut: 0.6,
        },
        x, y + 30 - i * 40, m,
      );
    }
    this.pillar(x, y + 40, c, c, o.scale ?? 1, 90, 320, 0.7);
    this.burst(
      {
        tex: 'plus', prio: 2, count: 8, life: [0.8, 1.2], delay: [0, 0.3], shape: { type: 'rect', w: 130, h: 30 }, speed: [70, 150], dir: -PI / 2,
        spread: 0.4, drag: 0.4, size: [20, 30], sizeEnd: [14, 20], colors: [W, hi, c], fadeIn: 0.15, fadeOut: 0.5,
      },
      x, y + 10, m,
    );
    this.burst(
      {
        tex: 'sparkle', prio: 2, count: 12, life: [0.6, 1.1], delay: [0, 0.3], shape: { type: 'rect', w: 140, h: 40 }, speed: [60, 190], dir: -PI / 2,
        spread: 0.6, drag: 0.8, size: [14, 26], sizeEnd: [4, 8], spin: [-3, 3], rot: [0, TAU], colors: [W, hi], fadeIn: 0.1, fadeOut: 0.5,
      },
      x, y + 10, m,
    );
    this.burst(
      { tex: 'glow', prio: 2, count: 1, life: 0.3, size: 60, sizeEnd: 200, colors: [W, hi, c], alpha: 0.9, fadeIn: 0, fadeOut: 0.8 },
      x, y, m,
    );
  }

  /* ---- wave & boss moments ------------------------------------------------------------------ */

  /**
   * Boss warning (guide B-01): two red edge pulses at 1 Hz, about a second of low rumble and dust
   * sifting down from the top edge. Pair it with a "WARNING" banner that stays up for `duration`.
   */
  bossWarning(): FxTimeline {
    this.screen.vignettePulse(0xff2a2a, 0.3, 500, 2);
    // game.shake decays on its own, so a steady ~2 px rumble is a stream of small top-ups.
    for (let i = 0; i < 8; i++) this.after(i * 0.12, () => fxShake(0.2));
    this.burst(
      {
        tex: 'smoke', blend: 'normal', prio: 0, count: 14, life: [0.9, 1.5], delay: [0, 0.4], shape: { type: 'rect', w: game.w, h: 24 }, speed: [30, 90],
        dir: PI / 2, spread: 0.3, drag: 0.8, size: [30, 46], sizeEnd: [60, 90], rot: [0, TAU], spin: [-0.6, 0.6], colors: [0x8a7f99, 0x4a4258],
        alpha: 0.35, fadeIn: 0.2, fadeOut: 0.6,
      },
      game.w / 2, -10,
    );
    this.buzz('warning');
    return { impact: 0, duration: 2.2 };
  }

  /** Boss touching down (B-02): T3 shake, a 66 ms hit-stop, a ground ring and a cloud of dust. */
  bossLanding(x: number, y: number, o: FxOpts = {}): FxTimeline {
    const s = o.scale ?? 1;
    const c = o.color ?? 0xe6d2b0;
    fxShake(Trauma.t3);
    this.freeze?.freeze(0.066, 0);
    this.shockwave(x, y, { color: c, radius: 230, scale: s });
    this.dustPuff(x, y, { color: c, scale: 1.7 * s });
    this.burst(
      {
        tex: 'smoke', blend: 'normal', prio: 2, count: 12, life: [0.5, 0.9], shape: { type: 'rect', w: 160, h: 16 }, speed: [60, 190], dir: -PI / 2,
        spread: 1.35, drag: 2.6, gravity: -20, size: [40, 60], sizeEnd: [90, 130], rot: [0, TAU], spin: [-1, 1],
        colors: [lighten(c, 0.2), c, darken(c, 0.4)], alpha: 0.6, fadeIn: 0.08, fadeOut: 0.6,
      },
      x, y, { scale: s },
    );
    this.buzz('medium');
    return { impact: 0, duration: 0.9 };
  }

  /**
   * Boss death (B-04): a hit-stop into slow motion, six small blasts scattering over the boss with a
   * shake that ramps up, then the final blast (flash, shockwaves, T5 shake, 120+ particles) at
   * `timeline.impact`. The boss sprite, when given, flickers white and red until then and `onFinal`
   * should hide it. Drop the loot and start the victory fanfare at `impact`.
   */
  bossDeath(x: number, y: number, o: BossDeathOpts = {}): FxTimeline {
    const s = o.scale ?? 1;
    const c = o.color ?? 0xff8a2a;
    const r = (o.radius ?? 80) * s;
    // Every beat is a timer on the scene clock, which a hit-stop slows: the whole sequence follows the slow motion.
    // One cooldown after the opening freeze event ends (about 0.55 s), so the final blast may freeze again.
    const final = 1.0;
    this.freeze?.freezeThenSlow(0.15, 0.4, 0.3);
    for (let i = 0; i < 6; i++) {
      this.after(i * 0.09, () => {
        const a = rand(0, TAU);
        const d = r * Math.sqrt(Math.random());
        this.miniBlast(x + Math.cos(a) * d, y + Math.sin(a) * d, c, s);
        fxShake(0.25 + i * 0.04);
        this.buzz('tap');
      });
    }
    const target = o.target;
    if (target) {
      for (let i = 0; i < 7; i++) {
        this.after(i * 0.06, () => {
          if (!target.destroyed) hitFlash(this.tweens, target, { color: i % 2 === 0 ? 0xffffff : 0xff4d5e, ms: 60, peak: 0.8 });
        });
      }
    }
    this.after(final, () => {
      this.screen.flash(W, 0.45, 220);
      fxShake(Trauma.t5);
      this.freeze?.freezeThenSlow(0.2, 0.4, 0.3);
      this.buzz('jackpot');
      this.bossFinalBlast(x, y, c, s);
      o.onFinal?.();
    });
    return { impact: final, duration: final + 1.7 };
  }

  /** The big blast that ends a boss: 120+ particles, two shockwaves, spawned all at once at the impact moment. */
  private bossFinalBlast(x: number, y: number, c: number, s: number): void {
    const m: BurstMods = { scale: s };
    const hot = lighten(c, 0.65);
    this.burst(
      { tex: 'glow', prio: 3, count: 1, life: 0.4, size: 120, sizeEnd: 420, colors: [W, hot, c], alpha: 1, sizeEase: Ease.cubicOut, fadeIn: 0, fadeOut: 0.8 },
      x, y, m,
    );
    this.burst(
      { tex: 'starburst', prio: 3, count: 1, life: 0.3, size: 180, sizeEnd: 460, rot: [0, TAU], colors: [W, hot], sizeEase: Ease.cubicOut, fadeIn: 0, fadeOut: 0.7 },
      x, y, m,
    );
    this.shockwave(x, y, { color: c, radius: 340, scale: s });
    this.shockwave(x, y, { color: W, radius: 250, scale: s, delay: 0.15 });
    this.burst(
      {
        tex: 'dot', prio: 3, count: 50, life: [0.7, 1.4], speed: [200, 760], drag: 1.5, gravity: 520, size: [7, 15], sizeEnd: 2,
        colors: [W, 0xffc34a, 0xff4a1a], fadeIn: 0, fadeOut: 0.5,
      },
      x, y, m,
    );
    this.burst(
      {
        tex: 'star', prio: 3, count: 16, life: [0.6, 1.1], speed: [240, 640], drag: 2.4, size: [28, 52], sizeEnd: [8, 14], spin: [-6, 6], rot: [0, TAU],
        colors: [W, hot, c], fadeIn: 0, fadeOut: 0.5,
      },
      x, y, m,
    );
    this.burst(
      {
        tex: 'shard', blend: 'normal', prio: 3, count: 14, life: [0.8, 1.3], speed: [220, 620], gravity: 900, drag: 0.6, size: [16, 28], sizeEnd: [8, 14],
        spin: [-9, 9], rot: [0, TAU], colors: [darken(c, 0.3), darken(c, 0.65)], fadeIn: 0, fadeOut: 0.4,
      },
      x, y, m,
    );
    this.burst(
      {
        tex: 'smoke', blend: 'normal', prio: 2, count: 14, life: [1.0, 1.6], shape: { type: 'circle', r: 50 }, speed: [40, 150], drag: 1.6, gravity: -45,
        size: [70, 100], sizeEnd: [150, 210], rot: [0, TAU], spin: [-0.6, 0.6], colors: [0x4a3d52, 0x2a2133], alpha: 0.6, fadeIn: 0.15, fadeOut: 0.6,
      },
      x, y, m,
    );
  }

  /** One of the small blasts that precede a boss's final explosion: about twelve particles. */
  private miniBlast(x: number, y: number, c: number, s: number): void {
    const m: BurstMods = { scale: s };
    this.burst(
      { tex: 'glow', prio: 2, count: 1, life: 0.2, size: 50, sizeEnd: 120, colors: [W, lighten(c, 0.6), c], alpha: 0.9, fadeIn: 0, fadeOut: 0.8, sizeEase: Ease.cubicOut },
      x, y, m,
    );
    this.burst(
      { tex: 'spark', prio: 2, count: 6, life: [0.18, 0.34], speed: [200, 480], drag: 4, alignVel: true, stretch: 0.002, size: [22, 36], sizeEnd: [6, 9], colors: [W, lighten(c, 0.5), c], fadeIn: 0 },
      x, y, m,
    );
    this.burst(
      {
        tex: 'smoke', blend: 'normal', prio: 1, count: 3, life: [0.4, 0.7], shape: { type: 'circle', r: 10 }, speed: [30, 100], drag: 3, gravity: -30,
        size: [28, 40], sizeEnd: [60, 84], rot: [0, TAU], colors: [0x6a5a70, 0x3a2f44], alpha: 0.6, fadeIn: 0.1, fadeOut: 0.6,
      },
      x, y, m,
    );
    this.burst(
      { tex: 'dot', prio: 1, count: 2, life: [0.3, 0.5], speed: [80, 220], drag: 3, gravity: 300, size: [6, 10], sizeEnd: 2, colors: [W, c], fadeIn: 0 },
      x, y, m,
    );
  }

  /**
   * Wave cleared (W-02): twenty confetti from the top, T3 shake and a 50 ms hit-stop. With `slowMo`
   * the finish lingers at half speed for 0.2 s. The CLEAR banner and the loot fly-to-HUD are the caller's.
   */
  waveClear(o: WaveClearOpts = {}): FxTimeline {
    this.confettiRain({ count: 20 });
    fxShake(Trauma.t3);
    this.freeze?.freeze(0.05, 0);
    if (o.slowMo) this.freeze?.freeze(0.2, 0.5);
    this.buzz('medium');
    return { impact: 0, duration: 1.4 };
  }

  confettiRain(o: ConfettiOpts = {}): void {
    const w = o.width ?? game.w;
    const x = o.x ?? game.w / 2;
    const y = o.y ?? -30;
    const k = fxSettings.reducedMotion ? REDUCED.confetti : 1;
    this.burst(
      {
        tex: 'confetti', blend: 'normal', prio: 1, count: o.count ?? 90, life: [2.4, 3.4], delay: [0, motionSeconds(0.9)], shape: { type: 'rect', w, h: 20 },
        speed: [120, 380], dir: PI / 2, spread: 0.45, gravity: 260, drag: 0.5, flip: [7, 15], spin: [-6, 6], rot: [0, TAU], size: [15, 24],
        palette: o.palette ?? CONFETTI_PALETTE, colors: [W], fadeIn: 0, fadeOut: 0.18,
      },
      x, y, { count: k },
    );
  }

  iceShatter(x: number, y: number, o: FxOpts = {}): void {
    const c = o.color ?? 0x7fd6ff;
    const hi = lighten(c, 0.7);
    const m: BurstMods = { scale: o.scale ?? 1 };
    this.burst(
      { tex: 'glow', prio: 2, count: 1, life: 0.2, size: 50, sizeEnd: 170, colors: [W, hi, c], alpha: 0.9, fadeIn: 0, fadeOut: 0.8, sizeEase: Ease.cubicOut },
      x, y, m,
    );
    this.burst(
      {
        tex: 'crystal', prio: 2, count: 6, life: [0.6, 0.95], speed: [170, 420], gravity: 780, drag: 1.1, size: [24, 40], sizeEnd: [14, 22],
        spin: [-6, 6], rot: [0, TAU], colors: [W, hi, c], alpha: 0.95, fadeIn: 0, fadeOut: 0.4,
      },
      x, y, m,
    );
    this.burst(
      {
        tex: 'shard', prio: 2, count: 11, life: [0.5, 0.85], speed: [200, 540], gravity: 880, drag: 0.8, size: [12, 22], sizeEnd: [6, 10],
        spin: [-10, 10], rot: [0, TAU], colors: [W, hi, c], fadeIn: 0, fadeOut: 0.4,
      },
      x, y, m,
    );
    this.burst(
      { tex: 'ring', prio: 2, count: 1, life: 0.3, size: 20, sizeEnd: 150, colors: [W, c], alpha: 0.9, fadeIn: 0, fadeOut: 0.8, sizeEase: Ease.cubicOut },
      x, y, m,
    );
    this.burst(
      {
        tex: 'smoke', blend: 'normal', prio: 1, count: 5, life: [0.45, 0.75], shape: { type: 'circle', r: 14 }, speed: [30, 100], drag: 2.5, gravity: -20,
        size: [36, 52], sizeEnd: [76, 104], rot: [0, TAU], colors: [0xe8f8ff, c], alpha: 0.4, fadeIn: 0.1, fadeOut: 0.6,
      },
      x, y, m,
    );
    this.burst(
      { tex: 'sparkle', prio: 1, count: 6, life: [0.4, 0.7], speed: [60, 200], drag: 2.4, size: [14, 26], sizeEnd: [4, 8], spin: [-3, 3], rot: [0, TAU], colors: [W, hi], fadeIn: 0.1, fadeOut: 0.5 },
      x, y, m,
    );
  }

  /** Lingering toxic cloud for `duration` seconds; returns a handle to stop or move it. */
  poisonCloud(x: number, y: number, o: FxOpts & { duration?: number } = {}): FxHandle {
    const c = o.color ?? 0x7ed957;
    const s = o.scale ?? 1;
    const dur = o.duration ?? 2.4;
    const m: BurstMods = { scale: s };
    const smoke = this.ps.emit(
      {
        tex: 'smoke', blend: 'normal', prio: 1, life: [0.9, 1.5], shape: { type: 'circle', r: 46 }, speed: [8, 30], gravity: -14, drag: 0.5,
        size: [48, 70], sizeEnd: [96, 130], rot: [0, TAU], spin: [-0.5, 0.5], colors: [lighten(c, 0.2), c, darken(c, 0.6)], alpha: 0.4,
        fadeIn: 0.25, fadeOut: 0.5,
      },
      x, y, 13, { duration: dur, mods: m },
    );
    const bubbles = this.ps.emit(
      {
        tex: 'ring', prio: 0, life: [0.6, 1.1], shape: { type: 'circle', r: 44 }, speed: [30, 70], dir: -PI / 2, spread: 0.4, drag: 0.4,
        size: [10, 18], sizeEnd: [16, 26], colors: [lighten(c, 0.6), c], alpha: 0.8, fadeIn: 0.15, fadeOut: 0.5,
      },
      x, y, 9, { duration: dur, mods: m },
    );
    return new EmitterGroup([smoke, bubbles]);
  }

  /**
   * Jagged lightning bolt with a glow pass, optional side branches, flickering out in ~130 ms.
   * Built from pooled particles (two strikes along slightly different paths), so it batches and
   * respects the particle budget.
   */
  lightning(x0: number, y0: number, x1: number, y1: number, o: LightningOpts = {}): void {
    const c = o.color ?? 0x8fd0ff;
    const hi = lighten(c, 0.8);
    const s = o.scale ?? 1;
    const thick = (o.thickness ?? 5) * s;
    const branches = o.branches ?? 2;
    const strikes: ReadonlyArray<readonly [number, number, number]> = [
      [0, 0.075, 1],
      [0.055, 0.085, 0.7],
    ];
    for (const [delay, life, a] of strikes) {
      const n = buildBolt(this.bolt, x0, y0, x1, y1, 4, 0.2, Math.random);
      this.boltStrip(this.bolt, n, thick, c, hi, delay, life, a);
      const dx = x1 - x0;
      const dy = y1 - y0;
      for (let b = 0; b < branches; b++) {
        const idx = 3 + Math.floor(Math.random() * 9);
        const bx = this.bolt[2 * idx] as number;
        const by = this.bolt[2 * idx + 1] as number;
        const ang = Math.atan2(dy, dx) + (Math.random() < 0.5 ? -1 : 1) * rand(0.45, 0.95);
        const len = Math.hypot(dx, dy) * rand(0.18, 0.32);
        const nb = buildBolt(this.boltB, bx, by, bx + Math.cos(ang) * len, by + Math.sin(ang) * len, 3, 0.22, Math.random);
        this.boltStrip(this.boltB, nb, thick * 0.55, c, hi, delay, life * 0.9, a * 0.8);
      }
    }
    const m: BurstMods = { scale: s };
    this.burst({ tex: 'glow', prio: 1, count: 1, life: 0.14, size: 60, sizeEnd: 100, colors: [W, hi, c], alpha: 0.9, fadeIn: 0, fadeOut: 0.8 }, x1, y1, m);
    this.burst({ tex: 'glow', prio: 1, count: 1, life: 0.1, size: 40, sizeEnd: 60, colors: [W, c], alpha: 0.7, fadeIn: 0, fadeOut: 0.8 }, x0, y0, m);
    this.burst(
      { tex: 'spark', prio: 0, count: 5, life: [0.12, 0.22], speed: [180, 420], drag: 4, alignVel: true, stretch: 0.002, size: [18, 28], sizeEnd: 6, colors: [W, hi, c], fadeIn: 0 },
      x1, y1, m,
    );
  }

  private boltStrip(pts: Float32Array, n: number, thick: number, c: number, hi: number, delay: number, life: number, alpha: number): void {
    for (let i = 0; i < n - 1; i++) {
      const ax = pts[2 * i] as number;
      const ay = pts[2 * i + 1] as number;
      const bx = pts[2 * i + 2] as number;
      const by = pts[2 * i + 3] as number;
      const len = Math.hypot(bx - ax, by - ay);
      const ang = Math.atan2(by - ay, bx - ax);
      // Glow pass first so the white core is drawn on top of it.
      for (let pass = 0; pass < 2; pass++) {
        const p = this.ps.alloc('bolt', 'add', 2);
        if (!p) return;
        const glowPass = pass === 0;
        p.x = ax;
        p.y = ay;
        p.rot = ang;
        p.sx0 = p.sx1 = (len + 3) / 32;
        p.sy0 = p.sy1 = (glowPass ? thick * 3.6 : thick) / 8;
        p.life = life;
        p.age = -delay;
        p.alpha = glowPass ? alpha * 0.8 : alpha;
        p.fadeIn = 0;
        p.fadeOut = 0.5;
        p.ramp.setSolid(glowPass ? c : hi);
        this.ps.commit(p);
      }
    }
  }

  healPlus(x: number, y: number, o: FxOpts = {}): void {
    const c = o.color ?? 0x6dff8a;
    const hi = lighten(c, 0.65);
    const m: BurstMods = { scale: o.scale ?? 1 };
    this.burst(
      { tex: 'glow', prio: 1, count: 1, life: 0.5, size: 80, sizeEnd: 130, sizeY: 60, sizeYEnd: 90, colors: [hi, c], alpha: 0.7, fadeIn: 0.2, fadeOut: 0.7 },
      x, y + 14, m,
    );
    this.burst(
      {
        tex: 'plus', prio: 1, count: 5, life: [0.8, 1.15], delay: [0, 0.25], shape: { type: 'circle', r: 30 }, speed: [60, 120], dir: -PI / 2,
        spread: 0.3, drag: 0.5, size: [22, 32], sizeEnd: [14, 20], colors: [hi, c, c], fadeIn: 0.15, fadeOut: 0.5,
      },
      x, y, m,
    );
    this.burst(
      {
        tex: 'sparkle', prio: 1, count: 6, life: [0.5, 0.9], delay: [0, 0.3], shape: { type: 'circle', r: 34 }, speed: [30, 90], dir: -PI / 2, spread: 0.7,
        size: [10, 18], sizeEnd: [3, 6], spin: [-3, 3], rot: [0, TAU], colors: [W, hi], fadeIn: 0.1, fadeOut: 0.5,
      },
      x, y, m,
    );
  }

  /**
   * Looping aura attached to a display object: soft pulse rings and rising motes. Under reduced
   * motion only the gentle motes remain. Stop the returned handle to end it.
   */
  buffAura(target: Container, o: FxOpts & { radius?: number; offsetY?: number } = {}): FxHandle {
    const c = o.color ?? Color.info;
    const hi = lighten(c, 0.6);
    const r = (o.radius ?? 56) * (o.scale ?? 1);
    const oy = o.offsetY ?? 0;
    const handles = [
      // Steady soft glow under the pulses so the aura reads even between rings.
      this.ps.emit(
        {
          tex: 'glow', prio: 0, life: 0.9, size: r * 1.7, sizeEnd: r * 2.1, colors: [hi, c], alpha: 0.32, fadeIn: 0.4, fadeOut: 0.5,
        },
        0, 0, 2.4, { follow: target, offsetY: oy },
      ),
      this.ps.emit(
        {
          tex: 'sparkle', prio: 0, life: [0.8, 1.3], shape: { type: 'circle', r: r * 0.75 }, speed: [26, 60], dir: -PI / 2, spread: 0.5, drag: 0.3,
          size: [14, 24], sizeEnd: [4, 8], spin: [-2, 2], rot: [0, TAU], colors: [W, hi, c], fadeIn: 0.25, fadeOut: 0.5,
        },
        0, 0, 9, { follow: target, offsetY: oy },
      ),
    ];
    if (!fxSettings.reducedMotion) {
      handles.push(
        this.ps.emit(
          {
            tex: 'ring', prio: 0, life: 0.95, size: r * 0.9, sizeEnd: r * 2.5, sizeY: r * 0.9 * 0.8, sizeYEnd: r * 2.5 * 0.8,
            sizeEase: Ease.cubicOut, colors: [hi, c], alpha: 0.85, fadeIn: 0.05, fadeOut: 0.75,
          },
          0, 0, 1.3, { follow: target, offsetY: oy },
        ),
      );
    }
    return new EmitterGroup(handles);
  }

  dustPuff(x: number, y: number, o: FxOpts = {}): void {
    const c = o.color ?? 0xd2c3a8;
    const m: BurstMods = { scale: o.scale ?? 1 };
    for (const dir of [0, PI]) {
      this.burst(
        {
          tex: 'smoke', blend: 'normal', prio: 0, count: 3, life: [0.38, 0.58], speed: [60, 150], dir, spread: 0.3, drag: 3.4, gravity: -28,
          size: [26, 36], sizeEnd: [58, 84], rot: [0, TAU], spin: [-1.5, 1.5], colors: [lighten(c, 0.2), c], alpha: 0.6, fadeIn: 0.08, fadeOut: 0.65,
        },
        x, y, m,
      );
    }
  }

  /** Anticipation: light converges on (x,y) for `duration` seconds while a core swells. */
  chargeUp(x: number, y: number, o: FxOpts & { radius?: number; duration?: number } = {}): void {
    const c = o.color ?? Color.purple;
    const hi = lighten(c, 0.6);
    const r = o.radius ?? 200;
    const d = motionSeconds(o.duration ?? 0.7);
    const m: BurstMods = { scale: o.scale ?? 1 };
    this.burst(
      {
        tex: 'glow', prio: 2, count: 24, life: [0.28, 0.38], delay: [0, d * 0.75], shape: { type: 'ring', r, width: r * 0.3 }, size: [26, 42], sizeEnd: [8, 14],
        colors: [hi, c], alpha: 0.9, fadeIn: 0.12, fadeOut: 0.2, converge: { swirl: 46, ease: Ease.cubicIn },
      },
      x, y, m,
    );
    this.burst(
      {
        tex: 'sparkle', prio: 2, count: 12, life: [0.26, 0.34], delay: [0, d * 0.8], shape: { type: 'ring', r: r * 0.85, width: r * 0.3 }, size: [16, 26], sizeEnd: [5, 9],
        spin: [-5, 5], rot: [0, TAU], colors: [W, hi], fadeIn: 0.1, fadeOut: 0.15, converge: { swirl: -40, ease: Ease.cubicIn },
      },
      x, y, m,
    );
    this.burst(
      {
        tex: 'spark', prio: 2, count: 18, life: [0.3, 0.42], delay: [0, d * 0.75], shape: { type: 'ring', r: r * 1.05, width: r * 0.3 }, size: [44, 70], sizeEnd: [14, 22],
        alignVel: true, stretch: 0.0006, colors: [hi, W], fadeIn: 0.1, fadeOut: 0.2, converge: { swirl: 34, ease: Ease.cubicIn },
      },
      x, y, m,
    );
    this.burst(
      { tex: 'glow', prio: 2, count: 1, life: d, size: 20, sizeEnd: 120, colors: [hi, W], alpha: 0.85, sizeEase: Ease.quadIn, fadeIn: 0.2, fadeOut: 0.05 },
      x, y, m,
    );
  }

  /** Slowly rotating god-rays; keep the handle to stop or move them. */
  rays(x: number, y: number, o: RaysOpts = {}): Rays {
    const r = new Rays(this.rayPool, x, y, o.parent ?? this.back, o);
    this.rayList.push(r);
    return r;
  }

  /** Glittering trail that follows a display object. */
  sparkleTrail(target: Container, o: FxOpts = {}): FxHandle {
    const c = o.color ?? 0xfff0a8;
    const m: BurstMods = { scale: o.scale ?? 1 };
    const a = this.ps.emit(
      {
        tex: 'sparkle', prio: 0, life: [0.35, 0.6], speed: [8, 46], drag: 2, gravity: 40, size: [12, 22], sizeEnd: [2, 5], spin: [-4, 4], rot: [0, TAU],
        colors: [W, lighten(c, 0.3), c], fadeIn: 0.05, fadeOut: 0.6,
      },
      0, 0, 38, { follow: target, mods: m },
    );
    const b = this.ps.emit(
      { tex: 'glow', prio: 0, life: [0.22, 0.34], size: [20, 28], sizeEnd: 4, colors: [lighten(c, 0.4), c], alpha: 0.5, fadeIn: 0.05, fadeOut: 0.7 },
      0, 0, 26, { follow: target, mods: m },
    );
    return new EmitterGroup([a, b]);
  }

  /** Soft smoke trail (rockets, fast enemies) that follows a display object. */
  smokeTrail(target: Container, o: FxOpts = {}): FxHandle {
    const c = o.color ?? 0xcfc6da;
    const m: BurstMods = { scale: o.scale ?? 1 };
    const h = this.ps.emit(
      {
        tex: 'smoke', blend: 'normal', prio: 0, life: [0.5, 0.85], shape: { type: 'circle', r: 5 }, speed: [4, 22], gravity: -26, drag: 1,
        size: [16, 22], sizeEnd: [40, 58], rot: [0, TAU], spin: [-1, 1], colors: [lighten(c, 0.2), c, darken(c, 0.5)], alpha: 0.45, fadeIn: 0.12, fadeOut: 0.65,
      },
      0, 0, 32, { follow: target, mods: m },
    );
    return new EmitterGroup([h]);
  }

  /** Sparse twinkling stars across a rectangle (menus, reveal backdrops). */
  ambientTwinkle(x: number, y: number, w: number, h: number, o: FxOpts & { rate?: number } = {}): FxHandle {
    const c = o.color ?? 0xfff0b0;
    const e = this.ps.emit(
      {
        tex: 'sparkle', prio: 0, life: [1.3, 2.4], shape: { type: 'rect', w, h }, speed: 0, size: [6, 10], sizeEnd: [24, 38], sizeEase: Ease.arc,
        spin: [-0.6, 0.6], rot: [0, TAU], colors: [W, c], fadeIn: 0.3, fadeOut: 0.35,
      },
      x, y, o.rate ?? 5,
    );
    return new EmitterGroup([e]);
  }
}
