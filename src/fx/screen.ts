import { Container, Sprite, Texture } from 'pixi.js';
import { game } from '@/core/game';
import { Ease, type EaseFn } from '@/core/tween';
import { clamp, lerp } from '@/core/math';
import { Color } from '@/ui/theme';
import { safeFlashColor } from './curves';
import { Hue } from './palette';
import { FX_TIERS, REDUCED, fxSettings } from './settings';
import { TimeFreeze, type TimeFreezeOpts, type TimeScaled } from './freeze';
import { fxVignette } from './textures';

/**
 * Shake trauma for each rung of the guide's effect ladder (T1..T5). game.shake turns trauma into
 * trauma^2 x 18 px, so these are the values whose peak offset lands on the guide's 2 / 4 / 7 / 12 /
 * 16 px.
 */
export const Trauma = { t1: 0.33, t2: 0.47, t3: 0.62, t4: 0.82, t5: 0.94 } as const;

/** Screen shake through the core trauma model, softened by reduced motion and by the low device tier. */
export function fxShake(trauma: number): void {
  const k = FX_TIERS[fxSettings.tier].shake * (fxSettings.reducedMotion ? REDUCED.shake : 1);
  game.shake(trauma * k);
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

/** Everything ensure() builds; null on the owner until first use and again after destroy(). */
interface Parts {
  layer: Container;
  flash: Sprite;
  vignette: Sprite;
  pulse: Sprite;
  barTop: Sprite;
  barBottom: Sprite;
  offUpdate: () => void;
  offResize: () => void;
}

/**
 * Screen-level effects drawn on game.overlayLayer: flash, red edge vignette (one-shot pulse and the
 * sustained low-health danger state) and cinematic letterbox bars. Everything sits at the bottom of
 * the overlay layer so toasts and flying currency stay on top and legible.
 *
 * All timing is advanced by update() on the real game clock rather than by tweens, so destroy() and
 * clear() cannot leave a callback behind that touches freed sprites, and no Tweener has to outlive
 * the effect.
 */
export class ScreenFx {
  private parts: Parts | null = null;
  private lastFlash = -10;
  private flashAge = 0;
  private flashDur = 0;
  private flashPeak = 0;
  private pulseAge = 0;
  private pulseDur = 0;
  private pulseCount = 1;
  private pulsePeak = 0;
  private dangerTarget = 0;
  private danger = 0;
  private dangerPhase = 0;
  private barHeight = 130;
  private barK = 0;
  private barFrom = 0;
  private barTo = 0;
  private barAge = 0;
  private barDur = 0;
  private barEase: EaseFn = Ease.cubicOut;

  /** Number of full-screen flashes actually shown (stat for tests and the gallery). */
  flashesShown = 0;

  /** The overlay container holding the flash, vignette and bars (built on first use). Cut-ins stack just below it. */
  get layer(): Container {
    return this.ensure().layer;
  }

  get dangerLevel(): number {
    return this.dangerTarget;
  }

  /** 0 (no bars) .. 1 (fully in); follows the slide animation. */
  get letterboxAmount(): number {
    return this.barK;
  }

  /**
   * Full-screen colour flash: instant attack, eased release. Silently skipped when `flashes` is off
   * or when it would exceed two flashes per second; alpha is clamped to 0.45 and saturated reds are
   * washed toward white.
   * @returns true when a flash was actually started.
   */
  flash(color: number = Hue.sun, alpha = 0.3, ms = 120): boolean {
    if (!fxSettings.flashes) return false;
    const p = this.ensure();
    const now = game.time;
    if (now - this.lastFlash < FLASH_MIN_GAP) return false;
    this.lastFlash = now;
    this.flashPeak = Math.min(alpha, FLASH_MAX_ALPHA) * (fxSettings.reducedMotion ? REDUCED.flash : 1);
    this.flashAge = 0;
    this.flashDur = Math.max(ms, 16) / 1000;
    p.flash.tint = safeFlashColor(color);
    p.flash.alpha = this.flashPeak;
    p.flash.visible = true;
    this.flashesShown++;
    return true;
  }

  /**
   * One-shot edge vignette pulse (boss warning): `count` smooth swells of `ms` each, never faster
   * than 2 Hz. Skipped when flashes are off, because it is the same photosensitivity class.
   */
  vignettePulse(color: number = Hue.alarm, alpha = 0.3, ms = 500, count = 2): void {
    if (!fxSettings.flashes) return;
    const p = this.ensure();
    this.pulseDur = (Math.max(ms, PULSE_MIN_MS) / 1000) * Math.max(1, count);
    this.pulseCount = Math.max(1, count);
    this.pulsePeak = Math.min(alpha, FLASH_MAX_ALPHA) * (fxSettings.reducedMotion ? REDUCED.flash : 1);
    this.pulseAge = 0;
    p.pulse.tint = color;
    p.pulse.alpha = 0;
    p.pulse.visible = true;
  }

  /**
   * Sustained low-health danger vignette, level 0 (off) .. 1 (about to lose). It breathes at
   * 0.9..1.7 Hz and gets stronger with the level; with reduced motion it is a steady tint.
   */
  setDanger(level: number): void {
    this.ensure();
    this.dangerTarget = clamp(level, 0, 1);
  }

  /** Slide cinematic bars in (true) or out (false). */
  letterbox(show: boolean, o: LetterboxOpts = {}): void {
    const p = this.ensure();
    this.barHeight = o.height ?? this.barHeight;
    p.barTop.tint = p.barBottom.tint = o.color ?? Color.ink;
    this.barFrom = this.barK;
    this.barTo = show ? 1 : 0;
    this.barAge = 0;
    this.barDur = Math.max(o.ms ?? 320, 1) / 1000;
    this.barEase = show ? Ease.cubicOut : Ease.cubicIn;
  }

  update(dt: number): void {
    const p = this.parts;
    if (!p) return;

    if (this.flashDur > 0) {
      this.flashAge += dt;
      const k = this.flashAge / this.flashDur;
      if (k >= 1) {
        this.flashDur = 0;
        p.flash.visible = false;
      } else {
        p.flash.alpha = this.flashPeak * (1 - Ease.quadOut(k));
      }
    }

    if (this.pulseDur > 0) {
      this.pulseAge += dt;
      const k = this.pulseAge / this.pulseDur;
      if (k >= 1) {
        this.pulseDur = 0;
        p.pulse.visible = false;
      } else {
        const m = k * this.pulseCount;
        p.pulse.alpha = this.pulsePeak * Math.sin(Math.PI * (m - Math.floor(m)));
      }
    }

    if (this.barDur > 0) {
      this.barAge += dt;
      const k = Math.min(1, this.barAge / this.barDur);
      this.barK = lerp(this.barFrom, this.barTo, this.barEase(k));
      if (k >= 1) this.barDur = 0;
      this.layoutBars(p);
    }

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
    p.vignette.alpha = a;
    p.vignette.visible = a > 0.003;
  }

  /** Re-fit to the current design size (called on the game's resize event). */
  layout(): void {
    const p = this.parts;
    if (!p) return;
    p.flash.width = p.vignette.width = p.pulse.width = game.w;
    p.flash.height = p.vignette.height = p.pulse.height = game.h;
    this.layoutBars(p);
  }

  /** Cancel every running effect and hide it (scene exit, restart). The instance stays usable. */
  clear(): void {
    this.flashDur = this.pulseDur = this.barDur = 0;
    this.barK = 0;
    this.dangerTarget = this.danger = 0;
    const p = this.parts;
    if (!p) return;
    p.flash.visible = false;
    p.vignette.visible = false;
    p.pulse.visible = false;
    this.layoutBars(p);
  }

  /** Free the sprites and stop listening. A later flash()/letterbox()/setDanger() rebuilds everything. */
  destroy(): void {
    this.clear();
    const p = this.parts;
    if (!p) return;
    this.parts = null;
    p.offUpdate();
    p.offResize();
    p.layer.destroy({ children: true });
    this.lastFlash = -10;
    this.dangerPhase = 0;
  }

  private layoutBars(p: Parts): void {
    const h = this.barHeight * this.barK;
    p.barTop.width = p.barBottom.width = game.w;
    p.barTop.height = p.barBottom.height = Math.max(0.01, this.barHeight);
    p.barTop.y = h - this.barHeight;
    p.barBottom.y = game.h - h;
    p.barTop.visible = p.barBottom.visible = this.barK > 0.001;
  }

  private ensure(): Parts {
    if (this.parts) return this.parts;
    const mk = (tex: Texture): Sprite => {
      const s = new Sprite(tex);
      s.eventMode = 'none';
      return s;
    };
    const flash = mk(Texture.WHITE);
    flash.visible = false;
    const vignette = mk(fxVignette());
    vignette.tint = Hue.alarm;
    vignette.visible = false;
    const pulse = mk(fxVignette());
    pulse.visible = false;
    const barTop = mk(Texture.WHITE);
    const barBottom = mk(Texture.WHITE);
    barTop.tint = barBottom.tint = Color.ink;
    const layer = new Container();
    layer.addChild(vignette, pulse, flash, barTop, barBottom);
    layer.eventMode = 'none';
    game.overlayLayer.addChildAt(layer, 0);
    const parts: Parts = {
      layer,
      flash,
      vignette,
      pulse,
      barTop,
      barBottom,
      offUpdate: game.onUpdate((dt) => this.update(dt)),
      offResize: game.events.on('resize', () => this.layout()),
    };
    this.parts = parts;
    this.layout();
    return parts;
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
