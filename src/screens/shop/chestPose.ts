/** Pure poses of the chest of a reveal: one function from the director's state to where the chest is and how it is squashed. */
import { TIMES, type ChestState } from './revealFlow';

/** The chest's pose in one frame. Offsets from its resting place in design px (down is positive); the scales act about the foot. */
export interface ChestPose {
  x: number;
  y: number;
  rot: number;
  sx: number;
  sy: number;
  /** The lid is flicked to the ajar picture for a few frames at the top of a hop. */
  ajar: boolean;
  /** Swing of the tag hanging from the chest, radians. */
  tag: number;
}

export function newPose(): ChestPose {
  return { x: 0, y: 0, rot: 0, sx: 1, sy: 1, ajar: false, tag: 0 };
}

const LANDING_RATE = 11;
const LANDING_HZ = 34;
/** The tap's own squash: quick, damped. */
const KICK_RATE = 16;
const KICK_HZ = 24;
const KICK_SPAN = 0.32;

function smooth(k: number): number {
  const u = Math.min(1, Math.max(0, k));
  return u * u * (3 - 2 * u);
}

/**
 * The pose of the closed chest: it falls from `dropFrom` px up, lands with a squash that springs back, shakes in the director's
 * bursts (sideways, tilt, hops with a stretch on the way up and a squash on the way down; a tap adds its own squash on the frame it
 * lands), then swells and holds still for the last quarter of the held breath. Fills `out` and allocates nothing.
 */
export function windupPose(out: ChestPose, c: ChestState, dropFrom: number): ChestPose {
  out.x = out.rot = out.tag = out.y = 0;
  out.sx = out.sy = 1;
  out.ajar = false;
  if (c.phase === 'drop') {
    const k = Math.min(1, Math.max(0, c.age / TIMES.drop));
    out.y = -dropFrom * (1 - k * k);
    out.sy = 1 + 0.08 * k;
    out.sx = 1 - 0.04 * k;
    return out;
  }
  const tau = c.sinceLand;
  const landing = Math.exp(-LANDING_RATE * tau) * Math.cos(LANDING_HZ * tau);
  out.sx = 1 + 0.2 * landing;
  out.sy = 1 - 0.24 * landing + 0.008 * Math.sin(tau * 7);
  if (c.sinceTap < KICK_SPAN) {
    const kick = Math.exp(-KICK_RATE * c.sinceTap) * Math.cos(KICK_HZ * c.sinceTap);
    out.sx += 0.1 * kick;
    out.sy -= 0.16 * kick;
  }
  if (c.phase === 'burst') {
    const p = c.power;
    const u = Math.min(1, c.age / c.burstDur);
    const env = Math.min(1, u * 7) * (u > 0.78 ? (1 - u) / 0.22 : 1);
    const ph = c.age * (14 + 6 * p) * Math.PI * 2;
    const hops = 2 + c.burst;
    const h = Math.abs(Math.sin(Math.PI * hops * u));
    out.x += Math.sin(ph) * env * (4 + 12 * p);
    out.rot += Math.sin(ph * 0.5 + c.burst) * env * (0.03 + 0.07 * p);
    out.y -= h * env * (6 + 22 * p);
    // Stretched going up, squashed on the ground between two hops.
    const ground = (1 - h) * (1 - h) * (1 - h);
    out.sy *= 1 - 0.1 * p * ground * env + 0.09 * p * h * env;
    out.sx *= 1 + 0.07 * p * ground * env - 0.05 * p * h * env;
    // The first apex of every burst: the lid flicks open for a few frames.
    const apex = 1 / (2 * hops);
    out.ajar = env > 0.5 && Math.abs(u - apex) < 0.1;
  } else if (c.phase === 'hold') {
    // The chest swells with a tremble, then stops dead for the last quarter: the held breath.
    const f = smooth(c.age / (0.72 * c.holdDur));
    out.sx *= 1 + 0.13 * f;
    out.sy *= 1 + 0.11 * f;
    if (c.age < 0.72 * c.holdDur) out.x = Math.sin(c.age * 110) * 1.4 * f;
  }
  out.tag = -out.rot * 3 + Math.sin(c.age * 8 + c.burst) * 0.07;
  return out;
}

/** How far the chest jumps when it pops open, and how long the jump lasts. */
const JUMP_H = 54;
const JUMP = 0.24;

/**
 * The pose `age` seconds after the pop: the open picture arrives a little big and shrinks back, the whole chest jumps (the lid's
 * motion sold by it), lands with a squash and a recoil, and springs to rest.
 */
export function popPose(out: ChestPose, age: number): ChestPose {
  const u = age / JUMP;
  out.x = 0;
  out.ajar = false;
  out.tag = 0;
  if (u < 1) {
    const arc = Math.sin(Math.PI * u);
    out.y = -JUMP_H * 4 * u * (1 - u);
    out.sy = 1 + 0.12 * arc;
    out.sx = 1 - 0.06 * arc;
  } else {
    const tau = age - JUMP;
    const spring = Math.exp(-9 * tau) * Math.cos(28 * tau);
    out.y = 0;
    out.sx = 1 + 0.14 * spring;
    out.sy = 1 - 0.16 * spring;
  }
  const swell = 1 + 0.14 * Math.exp(-10 * age);
  out.sx *= swell;
  out.sy *= swell;
  out.rot = 0.06 * Math.exp(-7 * age) * Math.sin(age * 22);
  return out;
}

/** Largest shake offset in design px at full trauma. */
const SHAKE_MAX = 16;

/**
 * The offset of a shaken screen: `trauma` (0..1) squared decides how far, two detuned sines per axis make it look like noise,
 * `time` is a clock in seconds, `scale` the player's shake setting. Fills `out` and allocates nothing.
 */
export function shakeOffset(out: { x: number; y: number }, trauma: number, time: number, scale: number): void {
  const s = trauma * trauma * scale;
  const t = time * 38;
  out.x = (Math.sin(t * 1.13) * 0.6 + Math.sin(t * 2.71 + 1.3) * 0.4) * SHAKE_MAX * s;
  out.y = (Math.sin(t * 1.37 + 4.1) * 0.6 + Math.sin(t * 2.29 + 0.7) * 0.4) * SHAKE_MAX * s;
}
