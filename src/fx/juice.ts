import { Container, Sprite, Texture } from 'pixi.js';
import { Pool } from '@/core/pool';
import { Ease, type Tween, type Tweener } from '@/core/tween';
import { backOutS, popCurve, springWobble } from './curves';
import { fxSettings } from './settings';

/**
 * Object-level juice. Every helper takes the Tweener that should drive it (so a paused battle
 * freezes its units' juice while UI juice keeps running).
 *
 * Several helpers can run on one object at once because they own separate channels: scale
 * (punch / squash / pop), scale-loop (pulse), rotation (wobble), shake offset and bob offset. Scale
 * is composed from a base captured when the object is idle; position and rotation are applied as
 * deltas, so game code may keep moving or rotating the object while juice is playing.
 */
class JuiceState {
  sx = 1;
  sy = 1;
  kx = 1;
  ky = 1;
  pulse = 1;
  scaleTw: Tween | null = null;
  pulseTw: Tween | null = null;
  rotTw: Tween | null = null;
  shakeTw: Tween | null = null;
  bobTw: Tween | null = null;
  appliedRot = 0;
  appliedShakeX = 0;
  appliedShakeY = 0;
  appliedBob = 0;
}

const states = new WeakMap<object, JuiceState>();

function stateOf(o: object): JuiceState {
  let s = states.get(o);
  if (!s) {
    s = new JuiceState();
    states.set(o, s);
  }
  return s;
}

function writeScale(o: Container, s: JuiceState): void {
  o.scale.set(s.sx * s.kx * s.pulse, s.sy * s.ky * s.pulse);
}

/** Capture the base scale when no scale-affecting juice is running on the object. */
function beginScale(o: Container, s: JuiceState): void {
  if (!s.scaleTw?.alive && !s.pulseTw?.alive) {
    s.sx = o.scale.x;
    s.sy = o.scale.y;
    s.kx = 1;
    s.ky = 1;
    s.pulse = 1;
  }
}

function scaleTween(tw: Tweener, o: Container, s: JuiceState, seconds: number, step: (k: number) => void, done?: () => void): Tween {
  s.scaleTw?.kill();
  const t = tw.run({
    duration: seconds,
    ease: Ease.linear,
    onUpdate: (k) => {
      if (o.destroyed) return;
      step(k);
      writeScale(o, s);
    },
    onComplete: done,
  });
  s.scaleTw = t;
  return t;
}

/** Quick grow-and-settle: scale x(1+amount) and back (guide: 1 -> 1.25 -> 1 in ~140 ms). */
export function punchScale(tw: Tweener, o: Container, amount = 0.2, ms = 140): Tween {
  const s = stateOf(o);
  beginScale(o, s);
  const x0 = s.kx;
  const y0 = s.ky;
  return scaleTween(tw, o, s, ms / 1000, (k) => {
    const p = popCurve(k, 0, 1, 0, 0.4) * amount;
    s.kx = 1 + (x0 - 1) * (1 - k) + p;
    s.ky = 1 + (y0 - 1) * (1 - k) + p;
  }, () => {
    s.kx = s.ky = 1;
    writeScale(o, s);
  });
}

/**
 * Squash and stretch: snap to (sx, sy) times the current scale, then spring back with a little
 * elastic overshoot. squash(0.85, 1.15) is a jump anticipation; (1.2, 0.85) is a landing.
 */
export function squash(tw: Tweener, o: Container, sx: number, sy: number, ms = 260): Tween {
  const s = stateOf(o);
  beginScale(o, s);
  const x0 = s.kx;
  const y0 = s.ky;
  const hit = 0.26;
  return scaleTween(tw, o, s, ms / 1000, (k) => {
    if (k < hit) {
      const c = Ease.quadOut(k / hit);
      s.kx = x0 + (sx - x0) * c;
      s.ky = y0 + (sy - y0) * c;
    } else {
      // 1 -> 0 with an undershoot: the elastic rebound.
      const c = 1 - Ease.elasticOut((k - hit) / (1 - hit));
      s.kx = 1 + (sx - 1) * c;
      s.ky = 1 + (sy - 1) * c;
    }
  }, () => {
    s.kx = s.ky = 1;
    writeScale(o, s);
  });
}

export interface PopOpts {
  ms?: number;
  delay?: number;
  /** easeOutBack strength: 1.7 ~10%, 2.5 ~19%. Default 2.0. */
  overshoot?: number;
  /** Also fade alpha (default true). */
  fade?: boolean;
  onDone?: () => void;
}

/** Appear: scale 0 -> 1 with overshoot, optionally fading in. Leaves the object at its natural scale. */
export function popIn(tw: Tweener, o: Container, p: PopOpts = {}): Tween {
  const s = stateOf(o);
  beginScale(o, s);
  s.kx = s.ky = 0;
  writeScale(o, s);
  const fade = p.fade ?? true;
  const over = p.overshoot ?? 2.0;
  if (fade) o.alpha = 0;
  o.visible = true;
  s.scaleTw?.kill();
  const t = tw.run({
    duration: (p.ms ?? 240) / 1000,
    delay: p.delay,
    ease: Ease.linear,
    onUpdate: (k) => {
      if (o.destroyed) return;
      s.kx = s.ky = backOutS(k, over);
      writeScale(o, s);
      if (fade) o.alpha = Math.min(1, k * 3);
    },
    onComplete: () => {
      s.kx = s.ky = 1;
      writeScale(o, s);
      if (fade) o.alpha = 1;
      p.onDone?.();
    },
  });
  s.scaleTw = t;
  return t;
}

/** Disappear: scale to 0 (easeIn back, a tiny wind-up first) and fade, then hide. */
export function popOut(tw: Tweener, o: Container, p: PopOpts = {}): Tween {
  const s = stateOf(o);
  beginScale(o, s);
  const fade = p.fade ?? true;
  const k0 = s.kx;
  s.scaleTw?.kill();
  const t = tw.run({
    duration: (p.ms ?? 180) / 1000,
    delay: p.delay,
    ease: Ease.backIn,
    onUpdate: (k) => {
      if (o.destroyed) return;
      s.kx = s.ky = Math.max(0, k0 * (1 - k));
      writeScale(o, s);
      if (fade) o.alpha = 1 - k;
    },
    onComplete: () => {
      s.kx = s.ky = 0;
      writeScale(o, s);
      o.visible = false;
      p.onDone?.();
    },
  });
  s.scaleTw = t;
  return t;
}

/** Damped spring rotation (guide: A=8 degrees, 10 Hz, decay 6.5/s, gone by ~500 ms). */
export function wobbleRotation(tw: Tweener, o: Container, degrees = 8, ms = 480, freq = 10, decay = 6.5): Tween {
  const s = stateOf(o);
  if (s.rotTw?.alive) {
    s.rotTw.kill();
    o.rotation -= s.appliedRot;
    s.appliedRot = 0;
  }
  const amp = (degrees * Math.PI) / 180;
  const seconds = ms / 1000;
  const t = tw.run({
    duration: seconds,
    ease: Ease.linear,
    onUpdate: (k) => {
      if (o.destroyed) return;
      const r = springWobble(k * seconds, amp, freq, decay);
      o.rotation += r - s.appliedRot;
      s.appliedRot = r;
    },
    onComplete: () => {
      o.rotation -= s.appliedRot;
      s.appliedRot = 0;
    },
  });
  s.rotTw = t;
  return t;
}

/** Local jitter that decays to nothing (hurt reaction, denied tap). Not a screen shake. */
export function shakeObject(tw: Tweener, o: Container, amplitude = 6, ms = 180, axis: 'x' | 'y' | 'both' = 'x'): Tween {
  const s = stateOf(o);
  if (s.shakeTw?.alive) {
    s.shakeTw.kill();
    o.x -= s.appliedShakeX;
    o.y -= s.appliedShakeY;
    s.appliedShakeX = s.appliedShakeY = 0;
  }
  const seconds = ms / 1000;
  const t = tw.run({
    duration: seconds,
    ease: Ease.linear,
    onUpdate: (k) => {
      if (o.destroyed) return;
      // Three damped cycles: x(t) = A (1-k) cos(6 pi k); y runs a quarter-cycle out of phase.
      const env = amplitude * (1 - k);
      const dx = axis === 'y' ? 0 : env * Math.cos(k * Math.PI * 6);
      const dy = axis === 'x' ? 0 : env * Math.sin(k * Math.PI * 6);
      o.x += dx - s.appliedShakeX;
      o.y += dy - s.appliedShakeY;
      s.appliedShakeX = dx;
      s.appliedShakeY = dy;
    },
    onComplete: () => {
      o.x -= s.appliedShakeX;
      o.y -= s.appliedShakeY;
      s.appliedShakeX = s.appliedShakeY = 0;
    },
  });
  s.shakeTw = t;
  return t;
}

/** Handle for looping juice. stop() ends the loop and puts the object back where it started. */
export interface LoopHandle {
  readonly alive: boolean;
  stop(): void;
}

const DEAD_LOOP: LoopHandle = { alive: false, stop: () => undefined };

/** Gentle vertical idle bob. Does nothing under reduced motion. */
export function floatBob(tw: Tweener, o: Container, amplitude = 6, period = 1.6, phase = 0): LoopHandle {
  if (fxSettings.reducedMotion) return DEAD_LOOP;
  const s = stateOf(o);
  s.bobTw?.kill();
  o.y -= s.appliedBob;
  s.appliedBob = 0;
  const t = tw.run({
    duration: period / 2,
    delay: phase * (period / 2),
    ease: Ease.sineInOut,
    yoyo: true,
    repeat: -1,
    onUpdate: (k) => {
      if (o.destroyed) return;
      const b = -amplitude * k;
      o.y += b - s.appliedBob;
      s.appliedBob = b;
    },
  });
  s.bobTw = t;
  return {
    get alive() {
      return t.alive;
    },
    stop() {
      if (!t.alive) return;
      t.kill();
      if (!o.destroyed) o.y -= s.appliedBob;
      s.appliedBob = 0;
    },
  };
}

/** Breathing scale loop for call-to-action buttons: 1 -> 1+amount -> 1 every `period` seconds. */
export function pulseLoop(tw: Tweener, o: Container, amount = 0.04, period = 1.1, repeat = -1): LoopHandle {
  if (fxSettings.reducedMotion) return DEAD_LOOP;
  const s = stateOf(o);
  if (s.pulseTw?.alive) s.pulseTw.kill();
  beginScale(o, s);
  s.pulse = 1;
  const t = tw.run({
    duration: period / 2,
    ease: Ease.sineInOut,
    yoyo: true,
    repeat: repeat < 0 ? -1 : Math.max(0, repeat * 2 - 1),
    onUpdate: (k) => {
      if (o.destroyed) return;
      s.pulse = 1 + amount * k;
      writeScale(o, s);
    },
    onComplete: () => {
      s.pulse = 1;
      if (!o.destroyed) writeScale(o, s);
    },
  });
  s.pulseTw = t;
  return {
    get alive() {
      return t.alive;
    },
    stop() {
      if (!t.alive) return;
      t.kill();
      s.pulse = 1;
      if (!o.destroyed) writeScale(o, s);
    },
  };
}

/* ---- hit flash --------------------------------------------------------------------------- */

/**
 * Whitening a sprite normally needs a ColorMatrix filter, and a filter on every unit would break
 * batching and cost a render-texture pass each. Instead a pooled additive sprite that shares the
 * unit's texture is parented to it for ~70 ms: it follows the unit's transform for free, only
 * covers its opaque pixels, and adds white on top. (A sprite with a non-white tint tints the
 * overlay as well, since children inherit it.)
 */
const overlays = new Pool<Sprite>(
  () => {
    const s = new Sprite(Texture.EMPTY);
    s.blendMode = 'add';
    s.eventMode = 'none';
    return s;
  },
  (s) => {
    s.parent?.removeChild(s);
    s.visible = false;
    s.texture = Texture.EMPTY;
  },
);

interface ActiveFlash {
  overlay: Sprite;
  tween: Tween;
}
const flashes = new WeakMap<Sprite, ActiveFlash>();

export interface HitFlashOpts {
  ms?: number;
  color?: number;
  /** Peak overlay alpha, default 0.9. */
  peak?: number;
}

export function hitFlash(tw: Tweener, sprite: Sprite, o: HitFlashOpts = {}): Tween {
  const prev = flashes.get(sprite);
  if (prev) {
    prev.tween.kill();
    if (!prev.overlay.destroyed) overlays.release(prev.overlay);
    flashes.delete(sprite);
  }
  const overlay = overlays.get();
  overlay.texture = sprite.texture;
  overlay.anchor.copyFrom(sprite.anchor);
  overlay.tint = o.color ?? 0xffffff;
  overlay.position.set(0, 0);
  overlay.visible = true;
  const peak = o.peak ?? 0.9;
  overlay.alpha = peak;
  sprite.addChild(overlay);
  const finish = (): void => {
    if (flashes.get(sprite)?.overlay === overlay) flashes.delete(sprite);
    if (!overlay.destroyed) overlays.release(overlay);
  };
  const tween = tw.run({
    duration: (o.ms ?? 70) / 1000,
    ease: Ease.linear,
    onUpdate: (k) => {
      if (sprite.destroyed) return;
      overlay.alpha = peak * (1 - Ease.quadIn(k));
    },
    onComplete: finish,
  });
  flashes.set(sprite, { overlay, tween });
  return tween;
}

export function juiceStats(): { overlaysCreated: number; overlaysIdle: number } {
  return { overlaysCreated: overlays.created, overlaysIdle: overlays.idle };
}
