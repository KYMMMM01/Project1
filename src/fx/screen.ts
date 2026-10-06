import { Container, Sprite, Texture } from 'pixi.js';
import { game } from '@/core/game';
import { Ease, Tweener, uiTweens, type Tween } from '@/core/tween';
import { clamp, lerp } from '@/core/math';
import { safeFlashColor } from './curves';
import { REDUCED, fxSettings } from './settings';
import { TimeFreeze, type TimeFreezeOpts, type TimeScaled } from './freeze';
import { fxVignette } from './textures';

/** Screen shake through the core trauma model, softened when reduced motion is on. */
export function fxShake(trauma: number): void {
  game.shake(fxSettings.reducedMotion ? trauma * REDUCED.shake : trauma);
}

/** Hard caps from the research guide: one flash at most every 0.5 s (WCAG 2.3.1) and alpha <= 0.45. */
const FLASH_MIN_GAP = 0.5;
const FLASH_MAX_ALPHA = 0.45;
const PULSE_MIN_MS = 500;

export interface LetterboxOpts {
  /** Bar height in design px. Default 130. */
  height?: number;
  ms?: number;
  color?: number;
}

/**
 * Screen-level effects drawn on game.overlayLayer: flash, red edge vignette (one-shot pulse and the
 * sustained low-health danger state) and cinematic letterbox bars. Everything sits at the bottom of
 * the overlay layer so toasts and flying currency stay on top and legible.
 */
export class ScreenFx {
  private ready = false;
  private readonly layer = new Container();
  private flashSprite!: Sprite;
  private vignette!: Sprite;
  private pulse!: Sprite;
  private barTop!: Sprite;
  private barBottom!: Sprite;
  private flashTween: Tween | null = null;
  private pulseTween: Tween | null = null;
  private barTween: Tween | null = null;
  private lastFlash = -10;
  private dangerTarget = 0;
  private danger = 0;
  private dangerPhase = 0;
  private barHeight = 130;
  private barK = 0;
  private offUpdate: (() => void) | null = null;
  private offResize: (() => void) | null = null;

  constructor(private readonly tweens: Tweener = uiTweens) {}

  /** Number of full-screen flashes actually shown (stat for tests and the gallery). */
  flashesShown = 0;

  get dangerLevel(): number {
    return this.dangerTarget;
  }

  /**
   * Full-screen colour flash: instant attack, eased release. Silently skipped when `flashes` is off
   * or when it would exceed two flashes per second; alpha is clamped to 0.45 and saturated reds are
   * washed toward white.
   * @returns true when a flash was actually started.
   */
  flash(color = 0xffffff, alpha = 0.3, ms = 120): boolean {
    if (!fxSettings.flashes) return false;
    this.ensure();
    const now = game.time;
    if (now - this.lastFlash < FLASH_MIN_GAP) return false;
    this.lastFlash = now;
    const a = Math.min(alpha, FLASH_MAX_ALPHA) * (fxSettings.reducedMotion ? REDUCED.flash : 1);
    const s = this.flashSprite;
    s.tint = safeFlashColor(color);
    s.alpha = a;
    s.visible = true;
    this.flashTween?.kill();
    this.flashTween = this.tweens.to(s, { alpha: 0 }, {
      duration: ms / 1000,
      ease: Ease.quadOut,
      onComplete: () => {
        s.visible = false;
      },
    });
    this.flashesShown++;
    return true;
  }

  /**
   * One-shot edge vignette pulse (boss warning): `count` smooth swells of `ms` each, never faster
   * than 2 Hz. Skipped when flashes are off, because it is the same photosensitivity class.
   */
  vignettePulse(color = 0xff2a2a, alpha = 0.3, ms = 500, count = 2): void {
    if (!fxSettings.flashes) return;
    this.ensure();
    const per = Math.max(ms, PULSE_MIN_MS) / 1000;
    const peak = Math.min(alpha, FLASH_MAX_ALPHA) * (fxSettings.reducedMotion ? REDUCED.flash : 1);
    this.pulse.tint = color;
    this.pulse.visible = true;
    this.pulseTween?.kill();
    this.pulseTween = this.tweens.run({
      duration: per * count,
      ease: Ease.linear,
      onUpdate: (k) => {
        const m = k * count;
        this.pulse.alpha = peak * Math.sin(Math.PI * (m - Math.floor(m)));
      },
      onComplete: () => {
        this.pulse.visible = false;
      },
    });
  }

  /**
   * Sustained low-health danger vignette, level 0 (off) .. 1 (about to lose). It breathes at
   * 0.9..1.7 Hz and gets stronger with the level; with reduced motion it is a steady glow.
   */
  setDanger(level: number): void {
    this.ensure();
    this.dangerTarget = clamp(level, 0, 1);
  }

  /** Slide cinematic bars in (true) or out (false). */
  letterbox(show: boolean, o: LetterboxOpts = {}): void {
    this.ensure();
    this.barHeight = o.height ?? this.barHeight;
    this.barTop.tint = this.barBottom.tint = o.color ?? 0x000000;
    this.barTween?.kill();
    const from = this.barK;
    const to = show ? 1 : 0;
    const dur = (o.ms ?? 320) / 1000;
    this.barTween = this.tweens.run({
      duration: dur,
      ease: show ? Ease.cubicOut : Ease.cubicIn,
      onUpdate: (k) => {
        this.barK = lerp(from, to, k);
        this.layoutBars();
      },
    });
  }

  update(dt: number): void {
    if (!this.ready) return;
    this.danger = this.danger + (this.dangerTarget - this.danger) * Math.min(1, dt * 6);
    let a = 0;
    if (this.danger > 0.01) {
      const calm = fxSettings.reducedMotion || !fxSettings.flashes;
      const peak = 0.1 + 0.2 * this.danger;
      let wave = 0.75;
      if (!calm) {
        this.dangerPhase += dt * (0.9 + 0.8 * this.danger);
        wave = 0.5 - 0.5 * Math.cos(this.dangerPhase * Math.PI * 2);
        wave = 0.45 + 0.55 * wave;
      }
      a = peak * wave;
    }
    this.vignette.alpha = a;
    this.vignette.visible = a > 0.003;
  }

  /** Re-fit to the current design size (called on the game's resize event). */
  layout(): void {
    if (!this.ready) return;
    this.flashSprite.width = this.vignette.width = this.pulse.width = game.w;
    this.flashSprite.height = this.vignette.height = this.pulse.height = game.h;
    this.layoutBars();
  }

  clear(): void {
    this.flashTween?.kill();
    this.pulseTween?.kill();
    this.dangerTarget = this.danger = 0;
    if (this.ready) {
      this.flashSprite.visible = false;
      this.vignette.visible = false;
      this.pulse.visible = false;
    }
  }

  private layoutBars(): void {
    const h = this.barHeight * this.barK;
    this.barTop.width = this.barBottom.width = game.w;
    this.barTop.height = this.barBottom.height = Math.max(0.01, this.barHeight);
    this.barTop.y = h - this.barHeight;
    this.barBottom.y = game.h - h;
    this.barTop.visible = this.barBottom.visible = this.barK > 0.001;
  }

  private ensure(): void {
    if (this.ready) return;
    this.ready = true;
    const mk = (tex: Texture): Sprite => {
      const s = new Sprite(tex);
      s.eventMode = 'none';
      return s;
    };
    this.flashSprite = mk(Texture.WHITE);
    this.flashSprite.visible = false;
    this.vignette = mk(fxVignette());
    this.vignette.tint = 0xff2a2a;
    this.vignette.visible = false;
    this.pulse = mk(fxVignette());
    this.pulse.visible = false;
    this.barTop = mk(Texture.WHITE);
    this.barBottom = mk(Texture.WHITE);
    this.barTop.tint = this.barBottom.tint = 0x000000;
    this.layer.addChild(this.vignette, this.pulse, this.flashSprite, this.barTop, this.barBottom);
    this.layer.eventMode = 'none';
    game.overlayLayer.addChildAt(this.layer, 0);
    this.layout();
    this.offResize = game.events.on('resize', () => this.layout());
    this.offUpdate = game.onUpdate((dt) => this.update(dt));
  }

  destroy(): void {
    this.offUpdate?.();
    this.offResize?.();
    this.clear();
    this.layer.destroy({ children: true });
    this.ready = false;
  }
}

/** Shared instance: there is one screen, so there is one set of screen effects. */
export const screenFx = new ScreenFx();

/**
 * Hit-stop wired to the game loop: slows `targets` (typically the battle scene's Tweener and
 * simulation) using real time, so UI, particles and audio keep their own clocks.
 */
export function createHitStop(
  targets: readonly TimeScaled[],
  opts?: TimeFreezeOpts,
): { freeze: TimeFreeze; dispose: () => void } {
  const freeze = new TimeFreeze(undefined, opts);
  for (const t of targets) freeze.addTarget(t);
  const off = game.onUpdate((dt) => freeze.update(dt));
  return {
    freeze,
    dispose: () => {
      off();
      freeze.cancel();
    },
  };
}
