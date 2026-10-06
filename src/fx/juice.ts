import { Container, Sprite, Texture } from 'pixi.js';
import { Pool } from '@/core/pool';
import { Ease, type EaseFn, type Tween, type Tweener } from '@/core/tween';
import { backOutS, kickCurve, popCurve, springWobble } from './curves';
import { REDUCED, fxSettings } from './settings';

/**
 * Object-level juice. Every helper takes the Tweener that should drive it (so a paused battle
 * freezes its units' juice while UI juice keeps running).
 *
 * Several helpers can run on one object at once because they own separate channels: scale
 * (punch / squash / pop), scale-loop (pulse), rotation (wobble), shake offset, kick offset, rattle
 * and bob offset. Scale is composed from a base captured when the object is idle; position and rotation are
 * applied as deltas, so game code may keep moving or rotating the object while juice is playing.
 *
 * Whatever ends a helper's tween (completion, a restart on the same channel, Tween.kill, or the
 * Tweener being killed on scene exit) puts the object back to rest: offsets removed, scale at its
 * base, pooled helpers returned. Killed tweens skip onComplete, so every cleanup also hangs off
 * `Tween.finished`, guarded so it only runs for the tween that still owns the channel.
 */
class JuiceState {
  sx = 1;
  sy = 1;
  kx = 1;
  ky = 1;
  pulse = 1;
  scaleTw: Tween | null = null;
  /** Rest action of the running scale job; `replaced` is true when another job takes over. */
  scaleRest: ((replaced: boolean) => void) | null = null;
  pulseTw: Tween | null = null;
  rotTw: Tween | null = null;
  shakeTw: Tween | null = null;
  kickTw: Tween | null = null;
  rattleTw: Tween | null = null;
  bobTw: Tween | null = null;
  appliedRot = 0;
  appliedShakeX = 0;
  appliedShakeY = 0;
  appliedKickX = 0;
  appliedKickY = 0;
  appliedRattleX = 0;
  appliedRattleRot = 0;
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

/** Local-motion amplitudes shrink with the same factor as screen shake when reduced motion is on. */
function motionK(): number {
  return fxSettings.reducedMotion ? REDUCED.shake : 1;
}

function writeScale(o: Container, s: JuiceState): void {
  if (o.destroyed) return;
  o.scale.set(s.sx * s.kx * s.pulse, s.sy * s.ky * s.pulse);
}

/**
 * Capture the base scale when no scale-affecting juice is running on the object. A scale of 0 is a
 * hidden object (popOut, or game code preparing a popIn), never a size to return to, so it keeps the
 * previous base instead.
 */
function beginScale(o: Container, s: JuiceState): void {
  if (s.scaleTw?.alive || s.pulseTw?.alive) return;
  if (Math.abs(o.scale.x) > 1e-4) s.sx = o.scale.x;
  if (Math.abs(o.scale.y) > 1e-4) s.sy = o.scale.y;
  s.kx = 1;
  s.ky = 1;
  s.pulse = 1;
}

interface ScaleJob {
  seconds: number;
  delay?: number;
  ease?: EaseFn;
  /** Writes s.kx / s.ky (and anything else the job owns) for eased progress k. */
  step: (k: number) => void;
  /** Natural end. */
  done: () => void;
  /** The job ended some other way and the object must be left at rest. */
  rest: (replaced: boolean) => void;
}

/** Start the object's single scale job, first handing the running one over to it. */
function startScale(tw: Tweener, o: Container, s: JuiceState, job: ScaleJob): Tween {
  const prevRest = s.scaleRest;
  s.scaleRest = null;
  s.scaleTw?.kill();
  prevRest?.(true);
  let ended = false;
  const t = tw.run({
    duration: job.seconds,
    delay: job.delay,
    ease: job.ease ?? Ease.linear,
    onUpdate: (k) => {
      if (o.destroyed) return;
      job.step(k);
      writeScale(o, s);
    },
    onComplete: () => {
      ended = true;
      s.scaleRest = null;
      job.done();
    },
  });
  s.scaleTw = t;
  s.scaleRest = job.rest;
  void t.finished.then(() => {
    if (ended || s.scaleTw !== t) return;
    s.scaleRest = null;
    job.rest(false);
  });
  return t;
}

function restScale(o: Container, s: JuiceState): void {
  s.kx = s.ky = 1;
  writeScale(o, s);
}

/** Quick grow-and-settle: scale x(1+amount) and back (guide: 1 -> 1.25 -> 1 in ~140 ms). */
export function punchScale(tw: Tweener, o: Container, amount = 0.2, ms = 140): Tween {
  const s = stateOf(o);
  beginScale(o, s);
  const x0 = s.kx;
  const y0 = s.ky;
  return startScale(tw, o, s, {
    seconds: ms / 1000,
    step: (k) => {
      const p = popCurve(k, 0, 1, 0, 0.4) * amount;
      s.kx = 1 + (x0 - 1) * (1 - k) + p;
      s.ky = 1 + (y0 - 1) * (1 - k) + p;
    },
    done: () => restScale(o, s),
    rest: (replaced) => {
      if (!replaced) restScale(o, s);
    },
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
  return startScale(tw, o, s, {
    seconds: ms / 1000,
    step: (k) => {
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
    },
    done: () => restScale(o, s),
    rest: (replaced) => {
      if (!replaced) restScale(o, s);
    },
  });
}

export interface PopOpts {
  ms?: number;
  delay?: number;
  /** easeOutBack strength: 1.7 ~10%, 2.5 ~19%. Default 2.0. */
  overshoot?: number;
  /** Also fade alpha between 0 and 1 (default true). */
  fade?: boolean;
  onDone?: () => void;
}

/**
 * Appear: scale 0 -> 1 with overshoot, optionally fading in. Leaves the object at its natural scale.
 * An interrupted pop leaves the object fully shown.
 */
export function popIn(tw: Tweener, o: Container, p: PopOpts = {}): Tween {
  const s = stateOf(o);
  beginScale(o, s);
  const fade = p.fade ?? true;
  const over = p.overshoot ?? 2.0;
  const t = startScale(tw, o, s, {
    seconds: (p.ms ?? 240) / 1000,
    delay: p.delay,
    step: (k) => {
      s.kx = s.ky = backOutS(k, over);
      if (fade) o.alpha = Math.min(1, k * 3);
    },
    done: () => {
      restScale(o, s);
      if (fade) o.alpha = 1;
      p.onDone?.();
    },
    rest: (replaced) => {
      if (!o.destroyed && fade) o.alpha = 1;
      if (!replaced) restScale(o, s);
    },
  });
  // Hidden from the very first frame, even through a delay.
  s.kx = s.ky = 0;
  writeScale(o, s);
  if (fade) o.alpha = 0;
  o.visible = true;
  return t;
}

/**
 * Disappear: scale to 0 (easeIn back, a tiny wind-up first) and fade, then hide. The object is
 * handed back hidden but at its base scale and alpha, so a later popIn (or visible = true) shows it
 * normally. An interrupted pop leaves the object fully shown.
 */
export function popOut(tw: Tweener, o: Container, p: PopOpts = {}): Tween {
  const s = stateOf(o);
  beginScale(o, s);
  const fade = p.fade ?? true;
  const k0 = s.kx;
  return startScale(tw, o, s, {
    seconds: (p.ms ?? 180) / 1000,
    delay: p.delay,
    ease: Ease.backIn,
    step: (k) => {
      s.kx = s.ky = Math.max(0, k0 * (1 - k));
      if (fade) o.alpha = Math.max(0, 1 - k);
    },
    done: () => {
      restScale(o, s);
      if (fade) o.alpha = 1;
      o.visible = false;
      p.onDone?.();
    },
    rest: (replaced) => {
      if (!o.destroyed && fade) o.alpha = 1;
      if (!replaced) restScale(o, s);
    },
  });
}

function releaseRot(o: Container, s: JuiceState): void {
  if (!o.destroyed) o.rotation -= s.appliedRot;
  s.appliedRot = 0;
}

function releaseShake(o: Container, s: JuiceState): void {
  if (!o.destroyed) {
    o.x -= s.appliedShakeX;
    o.y -= s.appliedShakeY;
  }
  s.appliedShakeX = s.appliedShakeY = 0;
}

function releaseKick(o: Container, s: JuiceState): void {
  if (!o.destroyed) {
    o.x -= s.appliedKickX;
    o.y -= s.appliedKickY;
  }
  s.appliedKickX = s.appliedKickY = 0;
}

function releaseRattle(o: Container, s: JuiceState): void {
  if (!o.destroyed) {
    o.x -= s.appliedRattleX;
    o.rotation -= s.appliedRattleRot;
  }
  s.appliedRattleX = s.appliedRattleRot = 0;
}

function releaseBob(o: Container, s: JuiceState): void {
  if (!o.destroyed) o.y -= s.appliedBob;
  s.appliedBob = 0;
}

/** Run `fn` when `t` ends in any way, but only while `owner()` still names it (not a restart's tween). */
function whenEnded(t: Tween, owner: () => Tween | null, fn: () => void): void {
  void t.finished.then(() => {
    if (owner() === t) fn();
  });
}

/** Damped spring rotation (guide: A=8 degrees, 10 Hz, decay 6.5/s, gone by ~500 ms). */
export function wobbleRotation(tw: Tweener, o: Container, degrees = 8, ms = 480, freq = 10, decay = 6.5): Tween {
  const s = stateOf(o);
  if (s.rotTw?.alive) {
    s.rotTw.kill();
    releaseRot(o, s);
  }
  const amp = (degrees * Math.PI * motionK()) / 180;
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
    onComplete: () => releaseRot(o, s),
  });
  s.rotTw = t;
  whenEnded(t, () => s.rotTw, () => releaseRot(o, s));
  return t;
}

/** Local jitter that decays to nothing (hurt reaction, denied tap). Not a screen shake. */
export function shakeObject(tw: Tweener, o: Container, amplitude = 6, ms = 180, axis: 'x' | 'y' | 'both' = 'x'): Tween {
  const s = stateOf(o);
  if (s.shakeTw?.alive) {
    s.shakeTw.kill();
    releaseShake(o, s);
  }
  const amp = amplitude * motionK();
  const seconds = ms / 1000;
  const t = tw.run({
    duration: seconds,
    ease: Ease.linear,
    onUpdate: (k) => {
      if (o.destroyed) return;
      // Three damped cycles: x(t) = A (1-k) cos(6 pi k); y runs a quarter-cycle out of phase.
      const env = amp * (1 - k);
      const dx = axis === 'y' ? 0 : env * Math.cos(k * Math.PI * 6);
      const dy = axis === 'x' ? 0 : env * Math.sin(k * Math.PI * 6);
      o.x += dx - s.appliedShakeX;
      o.y += dy - s.appliedShakeY;
      s.appliedShakeX = dx;
      s.appliedShakeY = dy;
    },
    onComplete: () => releaseShake(o, s),
  });
  s.shakeTw = t;
  whenEnded(t, () => s.shakeTw, () => releaseShake(o, s));
  return t;
}

export interface RattleOpts {
  ms?: number;
  /** Peak sideways offset in design px. Default 3. */
  amplitude?: number;
  /** Peak tilt in degrees. Default 2. */
  degrees?: number;
  /** Shake frequency in Hz at the start and the end; it ramps linearly. Default 12 -> 24. */
  from?: number;
  to?: number;
}

/**
 * A chest or capsule rattling harder and faster before it opens (guide 2.5): sideways offset plus a
 * little tilt at a frequency that ramps up, with the amplitude building to a peak at the end. It has
 * its own channel, so it adds to a shakeObject or wobbleRotation instead of replacing it.
 */
export function rattleObject(tw: Tweener, o: Container, r: RattleOpts = {}): Tween {
  const s = stateOf(o);
  if (s.rattleTw?.alive) {
    s.rattleTw.kill();
    releaseRattle(o, s);
  }
  const seconds = (r.ms ?? 400) / 1000;
  const amp = (r.amplitude ?? 3) * motionK();
  const tilt = (((r.degrees ?? 2) * Math.PI) / 180) * motionK();
  const f0 = r.from ?? 12;
  const f1 = r.to ?? 24;
  const t = tw.run({
    duration: seconds,
    ease: Ease.linear,
    onUpdate: (k) => {
      if (o.destroyed) return;
      // Phase is the integral of the ramped frequency, so the pitch of the rattle rises smoothly.
      const phase = Math.PI * 2 * seconds * (f0 * k + 0.5 * (f1 - f0) * k * k);
      const env = 0.35 + 0.65 * k;
      const dx = amp * env * Math.sin(phase);
      const rot = tilt * env * Math.sin(phase + 1.2);
      o.x += dx - s.appliedRattleX;
      o.rotation += rot - s.appliedRattleRot;
      s.appliedRattleX = dx;
      s.appliedRattleRot = rot;
    },
    onComplete: () => releaseRattle(o, s),
  });
  s.rattleTw = t;
  whenEnded(t, () => s.rattleTw, () => releaseRattle(o, s));
  return t;
}

/**
 * One-shot positional impulse that returns to rest: a muzzle recoil (2 px, 60 ms), a hit reaction
 * (about 9 px, 100 ms) or a camera kick on a container the game does not itself reposition. Peaks
 * at 25% of `ms` and eases back out.
 */
export function kickObject(tw: Tweener, o: Container, dx: number, dy: number, ms = 100): Tween {
  const s = stateOf(o);
  if (s.kickTw?.alive) {
    s.kickTw.kill();
    releaseKick(o, s);
  }
  const k0 = motionK();
  const t = tw.run({
    duration: ms / 1000,
    ease: Ease.linear,
    onUpdate: (k) => {
      if (o.destroyed) return;
      const c = kickCurve(k) * k0;
      const x = dx * c;
      const y = dy * c;
      o.x += x - s.appliedKickX;
      o.y += y - s.appliedKickY;
      s.appliedKickX = x;
      s.appliedKickY = y;
    },
    onComplete: () => releaseKick(o, s),
  });
  s.kickTw = t;
  whenEnded(t, () => s.kickTw, () => releaseKick(o, s));
  return t;
}

/** Handle for looping juice. stop() ends the loop and puts the object back where it started. */
export interface LoopHandle {
  readonly alive: boolean;
  stop(): void;
}

const DEAD_LOOP: LoopHandle = { alive: false, stop: () => undefined };

function endBob(o: Container, s: JuiceState): void {
  s.bobTw?.kill();
  s.bobTw = null;
  releaseBob(o, s);
}

/** Gentle vertical idle bob. Does nothing under reduced motion. */
export function floatBob(tw: Tweener, o: Container, amplitude = 6, period = 1.6, phase = 0): LoopHandle {
  if (fxSettings.reducedMotion) return DEAD_LOOP;
  const s = stateOf(o);
  endBob(o, s);
  const t = tw.run({
    duration: period / 2,
    delay: phase * (period / 2),
    ease: Ease.sineInOut,
    yoyo: true,
    repeat: -1,
    onUpdate: (k) => {
      if (o.destroyed) {
        // An endless tween would otherwise sit in the Tweener until the scene exits.
        t.kill();
        return;
      }
      const b = -amplitude * k;
      o.y += b - s.appliedBob;
      s.appliedBob = b;
    },
  });
  s.bobTw = t;
  whenEnded(t, () => s.bobTw, () => endBob(o, s));
  return {
    get alive() {
      return t.alive;
    },
    stop() {
      if (s.bobTw === t) endBob(o, s);
    },
  };
}

function endPulse(o: Container, s: JuiceState): void {
  s.pulseTw?.kill();
  s.pulseTw = null;
  s.pulse = 1;
  writeScale(o, s);
}

/** Breathing scale loop for call-to-action buttons: 1 -> 1+amount -> 1 every `period` seconds. */
export function pulseLoop(tw: Tweener, o: Container, amount = 0.04, period = 1.1, repeat = -1): LoopHandle {
  if (fxSettings.reducedMotion) return DEAD_LOOP;
  const s = stateOf(o);
  if (s.pulseTw?.alive) endPulse(o, s);
  beginScale(o, s);
  s.pulse = 1;
  const t = tw.run({
    duration: period / 2,
    ease: Ease.sineInOut,
    yoyo: true,
    repeat: repeat < 0 ? -1 : Math.max(0, repeat * 2 - 1),
    onUpdate: (k) => {
      if (o.destroyed) {
        t.kill();
        return;
      }
      s.pulse = 1 + amount * k;
      writeScale(o, s);
    },
    onComplete: () => {
      s.pulse = 1;
      writeScale(o, s);
    },
  });
  s.pulseTw = t;
  whenEnded(t, () => s.pulseTw, () => endPulse(o, s));
  return {
    get alive() {
      return t.alive;
    },
    stop() {
      if (s.pulseTw === t) endPulse(o, s);
    },
  };
}

/* ---- hit flash --------------------------------------------------------------------------- */

/**
 * Whitening a sprite normally needs a ColorMatrix filter, and a filter on every unit would break
 * batching and cost a render-texture pass each. Instead a pooled additive sprite that shares the
 * unit's texture sits directly above it for ~50 ms and adds white on top. It is a sibling rather
 * than a child (Pixi 8 sprites do not take children) and mirrors the unit's transform every frame,
 * so it covers exactly the unit's opaque pixels and ignores the unit's own tint.
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
  tween: Tween;
  /** Idempotent: returns the overlay to the pool and forgets the flash. */
  release: () => void;
}
const flashes = new WeakMap<Sprite, ActiveFlash>();

export interface HitFlashOpts {
  /** Guide: 50 ms for a normal hit, 66 ms for a crit. */
  ms?: number;
  color?: number;
  /** Peak overlay alpha, default 0.9. */
  peak?: number;
}

function syncOverlay(o: Sprite, host: Sprite): void {
  o.texture = host.texture;
  o.anchor.copyFrom(host.anchor);
  o.position.copyFrom(host.position);
  o.scale.copyFrom(host.scale);
  o.pivot.copyFrom(host.pivot);
  o.skew.copyFrom(host.skew);
  o.rotation = host.rotation;
}

export function hitFlash(tw: Tweener, sprite: Sprite, o: HitFlashOpts = {}): Tween {
  const prev = flashes.get(sprite);
  if (prev) {
    prev.tween.kill();
    prev.release();
  }
  const parent = sprite.parent;
  if (!parent) return tw.run({ duration: 0 });
  const overlay = overlays.get();
  overlay.tint = o.color ?? 0xffffff;
  overlay.visible = true;
  const peak = o.peak ?? 0.9;
  syncOverlay(overlay, sprite);
  overlay.alpha = peak * sprite.alpha;
  parent.addChildAt(overlay, parent.getChildIndex(sprite) + 1);
  let released = false;
  const release = (): void => {
    if (released) return;
    released = true;
    if (flashes.get(sprite)?.release === release) flashes.delete(sprite);
    if (!overlay.destroyed) overlays.release(overlay);
  };
  const tween = tw.run({
    duration: (o.ms ?? 50) / 1000,
    ease: Ease.linear,
    onUpdate: (k) => {
      if (sprite.destroyed || overlay.destroyed) {
        tween.kill();
        release();
        return;
      }
      if (sprite.parent !== overlay.parent) {
        // The unit moved to another layer mid-flash (e.g. picked up): follow it.
        sprite.parent?.addChildAt(overlay, sprite.parent.getChildIndex(sprite) + 1);
      }
      syncOverlay(overlay, sprite);
      overlay.alpha = peak * sprite.alpha * (1 - Ease.quadIn(k));
      overlay.visible = sprite.visible;
    },
    onComplete: release,
  });
  flashes.set(sprite, { tween, release });
  // A killed tween (scene exit, wave restart) skips onComplete; the overlay must still go home.
  void tween.finished.then(release);
  return tween;
}

export function juiceStats(): { overlaysCreated: number; overlaysIdle: number } {
  return { overlaysCreated: overlays.created, overlaysIdle: overlays.idle };
}
