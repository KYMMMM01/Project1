import { Graphics, Sprite, Texture, type Container } from 'pixi.js';
import { Ease } from '@/core/tween';
import { TAU, clamp01, lighten } from '@/core/math';
import { boltPointCount, buildBolt, strokeBolt } from './bolt';
import { Loop, hash01, type FxEnv, type FxRect, type LoopOpts, type ZoneHandle } from './loops';
import { fxSettings } from './settings';

const W = 0xffffff;
const PI = Math.PI;

/** Looping cell hazards and zones. Each returns a handle: stop() fades it out, `done` settles when it is gone. */
export interface ZoneOpts {
  /** Main colour; each preset has its own default. */
  color?: number;
  /** Size multiplier of laserDot and weakenSwirl (the cell and radius presets size themselves). Default 1. */
  scale?: number;
  /** laserDot, weakenSwirl and the radius zones only: track a display object instead of a fixed point. */
  follow?: Container;
}

export type HazardKind = 'wet' | 'zap';

export interface HazardWarnOpts {
  /** Telegraph time in seconds; the outline fills up over it. Default 0.8 (the battle rules' warning). */
  duration?: number;
}

function loopOpts(o: ZoneOpts, base: LoopOpts = {}): LoopOpts {
  return o.follow ? { ...base, follow: o.follow } : base;
}

/** Warm diagonal light shaft with slow dust motes over one board cell. About 2 sprites and 6 particles. */
export function sunbeamCell(env: FxEnv, rect: FxRect, o: ZoneOpts = {}): ZoneHandle {
  const c = o.color ?? 0xffd98a;
  const hi = lighten(c, 0.45);
  const calm = fxSettings.reducedMotion;
  const loop = new Loop(env, rect.x + rect.w / 2, rect.y + rect.h / 2, { fadeIn: 0.7, fadeOut: 0.5 });
  const long = Math.max(rect.w, rect.h) * 1.6;
  const floor = loop.sprite('glow', 'add', c);
  loop.fit(floor, 'glow', rect.w * 1.3, rect.h * 1.05);
  const wide = loop.sprite('beam', 'add', c);
  loop.fit(wide, 'beam', rect.w * 0.5, long);
  const thin = loop.sprite('beam', 'add', hi);
  loop.fit(thin, 'beam', rect.w * 0.17, long * 0.95);
  const hair = loop.sprite('beam', 'add', W);
  loop.fit(hair, 'beam', rect.w * 0.07, long * 0.8);
  wide.x = -rect.w * 0.06;
  thin.x = rect.w * 0.17;
  hair.x = -rect.w * 0.22;
  loop.step = (age) => {
    const slow = calm ? 0 : age;
    // Leaning "\": the top of the shaft sits up-left of the cell centre.
    const lean = -0.5 + 0.035 * Math.sin(slow * 0.7);
    wide.rotation = lean;
    thin.rotation = lean + 0.02 * Math.sin(slow * 0.9 + 1);
    hair.rotation = lean - 0.015 * Math.sin(slow * 1.1);
    floor.alpha = 0.3 + 0.08 * Math.sin(slow * 1.2);
    wide.alpha = 0.34 + 0.1 * Math.sin(slow * 0.9 + 0.6);
    thin.alpha = 0.42 + 0.12 * Math.sin(slow * 1.3 + 2);
    hair.alpha = 0.3 + 0.12 * Math.sin(slow * 1.7 + 4);
  };
  loop.emit(
    {
      tex: 'dot', prio: 0, life: [2.2, 3.4], shape: { type: 'rect', w: rect.w * 0.8, h: rect.h * 0.8 }, speed: [4, 11], dir: -PI / 2 + 0.7, spread: 0.7, drag: 0.2,
      size: [3, 6], colors: [W, hi], alpha: 0.9, fadeIn: 0.3, fadeOut: 0.4, sway: { amp: [3, 8], freq: [0.2, 0.5] },
    },
    2.8,
  );
  return loop;
}

/**
 * Pulsing red target dot with two thin expanding rings and a tiny sparkle. moveTo() glides it to a
 * new spot (call it every frame to make it follow a finger or an enemy).
 */
export function laserDot(env: FxEnv, x: number, y: number, o: ZoneOpts = {}): ZoneHandle {
  const c = o.color ?? 0xff2a3a;
  const s = o.scale ?? 1;
  const calm = fxSettings.reducedMotion;
  const loop = new Loop(env, x, y, loopOpts(o, { fadeIn: 0.12, fadeOut: 0.2, halfLife: 0.045 }));
  const glow = loop.sprite('glow', 'add', c);
  const ringA = loop.sprite('ring', 'add', lighten(c, 0.3));
  const ringB = loop.sprite('ring', 'add', lighten(c, 0.3));
  const core = loop.sprite('dot', 'normal', c);
  loop.fit(core, 'dot', 17 * s, 17 * s);
  const hot = loop.sprite('dot', 'normal', W);
  loop.fit(hot, 'dot', 7 * s, 7 * s);
  const glint = loop.sprite('sparkle', 'add', 0xffd6dc);
  glint.x = 10 * s;
  glint.y = -10 * s;
  loop.fit(glint, 'sparkle', 26 * s, 26 * s);
  glow.alpha = 0.85;
  loop.step = (age) => {
    const beat = calm ? 0 : Math.sin(age * TAU * 2.2);
    loop.fit(glow, 'glow', (70 + 9 * beat) * s, (70 + 9 * beat) * s);
    for (let i = 0; i < 2; i++) {
      const ring = i === 0 ? ringA : ringB;
      const p = calm ? 0.5 : (age * 1.1 + i * 0.5) % 1;
      const d = (20 + 46 * Ease.cubicOut(p)) * s;
      loop.fit(ring, 'ring', d, d);
      ring.alpha = calm ? 0.6 : 0.8 * (1 - p) * (1 - p);
    }
    glint.rotation = calm ? 0 : age * 1.6;
    glint.alpha = calm ? 0.8 : 0.35 + 0.65 * Math.abs(Math.sin(age * 5.2));
  };
  return loop;
}

/**
 * Cell hazard telegraph: a rounded outline that blinks faster as time runs out while a fill rises
 * from the bottom of the cell, with a drop / bolt glyph so the kind is not told by colour alone.
 * Ends with a small pop after `duration` seconds.
 */
export function hazardWarn(env: FxEnv, rect: FxRect, kind: HazardKind, o: HazardWarnOpts = {}): ZoneHandle {
  const duration = Math.max(0.1, o.duration ?? 0.8);
  const col = kind === 'wet' ? 0x4da6ff : 0xffe23a;
  const calm = fxSettings.reducedMotion;
  const pop = 0.2;
  const loop = new Loop(env, rect.x + rect.w / 2, rect.y + rect.h / 2, { fadeIn: 0.08, fadeOut: pop, life: duration });
  const innerW = rect.w - 14;
  const innerH = rect.h - 14;

  const fill = new Sprite(Texture.WHITE);
  fill.anchor.set(0.5, 1);
  fill.tint = lighten(col, 0.2);
  fill.alpha = 0.5;
  fill.width = innerW;
  fill.y = innerH / 2;
  const edge = new Sprite(Texture.WHITE);
  edge.anchor.set(0.5);
  edge.tint = W;
  edge.alpha = 0.85;
  edge.width = innerW;
  edge.height = 4;
  const outline = new Graphics().roundRect(-rect.w / 2 + 3, -rect.h / 2 + 3, rect.w - 6, rect.h - 6, 18).stroke({ width: 6, color: col });
  loop.own(fill);
  loop.own(edge);
  loop.own(outline);
  const glyphId = kind === 'wet' ? 'droplet' : 'zapGlyph';
  const glyph = loop.sprite(glyphId, 'normal', kind === 'wet' ? 0xd6ecff : W);
  loop.fit(glyph, glyphId, Math.min(rect.w, rect.h) * 0.3 * (kind === 'wet' ? 0.7 : 1), Math.min(rect.w, rect.h) * 0.3);

  loop.step = (age) => {
    const p = clamp01(age / duration);
    const h = innerH * p;
    fill.height = Math.max(0.01, h);
    edge.y = innerH / 2 - h;
    edge.visible = p > 0.02 && p < 1;
    // 1.6 Hz rising to 3 Hz: a countdown, and still inside the flash-safety limit.
    const blink = calm ? 0.8 : 0.5 + 0.5 * Math.sin(age * TAU * (1.6 + 1.4 * p));
    outline.alpha = 0.45 + 0.55 * blink;
    glyph.alpha = 0.5 + 0.35 * blink;
    const over = Math.max(0, age - duration) / pop;
    loop.container.scale.set(1 + 0.16 * Ease.cubicOut(clamp01(over)));
  };
  return loop;
}

/** Looping puddle hazard: a glossy blue pool with rings spreading from random spots and droplets leaping out of it. */
export function wetPuddle(env: FxEnv, rect: FxRect, o: ZoneOpts = {}): ZoneHandle {
  const c = o.color ?? 0x3f8fe8;
  const light = lighten(c, 0.6);
  const calm = fxSettings.reducedMotion;
  const loop = new Loop(env, rect.x + rect.w / 2, rect.y + rect.h / 2 + rect.h * 0.08, { fadeIn: 0.35, fadeOut: 0.45 });
  const pw = rect.w * 0.94;
  const ph = rect.h * 0.64;
  const pool = loop.sprite('puddle', 'normal', c);
  loop.fit(pool, 'puddle', pw, ph);
  pool.alpha = 0.7;
  const sheen = loop.sprite('puddle', 'add', light);
  sheen.alpha = 0.16;
  const rings = [loop.sprite('ring', 'add', W), loop.sprite('ring', 'add', W), loop.sprite('ring', 'add', W)];
  const period = 1.7;
  loop.step = (age) => {
    const b = calm ? 0 : Math.sin(age * 1.6);
    loop.fit(sheen, 'puddle', pw * (0.86 + 0.03 * b), ph * (0.82 + 0.04 * b));
    for (let i = 0; i < 3; i++) {
      const t = age / period + i / 3;
      const cycle = Math.floor(t);
      const p = t - cycle;
      const ring = rings[i] as Sprite;
      const wd = pw * 0.4 * (0.12 + 0.88 * Ease.cubicOut(p));
      loop.fit(ring, 'ring', wd, wd * 0.42);
      ring.x = (hash01(cycle * 3 + i) - 0.5) * pw * 0.5;
      ring.y = (hash01(cycle * 5 + i + 7) - 0.5) * ph * 0.3;
      ring.alpha = calm ? 0 : 0.75 * Math.pow(1 - p, 1.5);
    }
  };
  loop.emit(
    {
      tex: 'droplet', prio: 0, life: [0.55, 0.85], shape: { type: 'rect', w: pw * 0.7, h: ph * 0.3 }, speed: [120, 210], dir: -PI / 2, spread: 0.45,
      gravity: 640, size: [9, 13], sizeEnd: [6, 9], colors: [W, light], alpha: 0.95, fadeIn: 0, fadeOut: 0.35,
    },
    calm ? 1.2 : 3.4,
    0,
    ph * 0.1,
  );
  return loop;
}

/** Looping electrified-cell hazard: a flickering yellow glow, crackling arcs that jump across the cell and flying sparks. */
export function zapCell(env: FxEnv, rect: FxRect, o: ZoneOpts = {}): ZoneHandle {
  const c = o.color ?? 0xffe23a;
  const calm = fxSettings.reducedMotion;
  const loop = new Loop(env, rect.x + rect.w / 2, rect.y + rect.h / 2, { fadeIn: 0.25, fadeOut: 0.35 });
  const glow = loop.sprite('glow', 'add', c);
  loop.fit(glow, 'glow', rect.w * 1.25, rect.h * 1.05);
  const glyph = loop.sprite('zapGlyph', 'add', lighten(c, 0.5));
  loop.fit(glyph, 'zapGlyph', Math.min(rect.w, rect.h) * 0.3, Math.min(rect.w, rect.h) * 0.3);
  const pts = new Float32Array(2 * boltPointCount(3));
  let next = 0.1;
  loop.step = (age) => {
    const flick = calm ? 0.6 : 0.5 + 0.5 * Math.sin(age * 17) * Math.sin(age * 7.3 + 1);
    glow.alpha = 0.2 + 0.2 * flick;
    glyph.alpha = 0.3 + 0.3 * flick;
    if (calm || age < next) return;
    next = age + 0.1 + 0.1 * hash01(age * 91.7);
    // Two arcs per burst, each a chord from one random point to another at least a third of a cell away.
    for (let k = 0; k < 2; k++) {
      const a = hash01(age * 13.1 + k * 17.3) * TAU;
      const half = Math.min(rect.w, rect.h) * (0.28 + 0.18 * hash01(age * 7.7 + k));
      const mx = (hash01(age * 3.3 + k * 5.1) - 0.5) * rect.w * 0.3;
      const my = (hash01(age * 5.9 + k * 2.7) - 0.5) * rect.h * 0.3;
      const x0 = loop.x + mx - Math.cos(a) * half;
      const y0 = loop.y + my - Math.sin(a) * half;
      const n = buildBolt(pts, x0, y0, loop.x + mx + Math.cos(a) * half, loop.y + my + Math.sin(a) * half, 3, 0.26, Math.random);
      strokeBolt(env.ps, pts, n, 3, c, W, 0, 0.1, 0.95, 0);
    }
  };
  loop.emit(
    {
      tex: 'spark', prio: 0, life: [0.14, 0.28], shape: { type: 'rect', w: rect.w * 0.7, h: rect.h * 0.7 }, speed: [90, 230], drag: 3, alignVel: true, stretch: 0.002,
      size: [14, 22], sizeEnd: 5, colors: [W, c], fadeIn: 0, fadeOut: 0.5,
    },
    calm ? 1.5 : 6,
  );
  return loop;
}

/**
 * Looping "drooping" status over a unit: a spiral of blue beads that sags and shrinks as it winds
 * down, with the odd sweat drop. Pass `follow` (the unit's sprite) so it rides along when the unit is moved.
 */
export function weakenSwirl(env: FxEnv, x: number, y: number, o: ZoneOpts = {}): ZoneHandle {
  const c = o.color ?? 0x6f9dff;
  const s = o.scale ?? 1;
  const calm = fxSettings.reducedMotion;
  const loop = new Loop(env, x, y, loopOpts(o, { fadeIn: 0.3, fadeOut: 0.35 }));
  const N = 7;
  const glows: Sprite[] = [];
  const beads: Sprite[] = [];
  for (let i = 0; i < N; i++) {
    glows.push(loop.sprite('glow', 'add', c));
    beads.push(loop.sprite('dot', 'normal', lighten(c, 0.35)));
  }
  loop.step = (age) => {
    const spin = age * (calm ? 0.9 : 2.5);
    for (let i = 0; i < N; i++) {
      const u = i / (N - 1);
      const phase = spin - i * 0.8;
      const radius = 34 * (1 - 0.55 * u) * s;
      const px = Math.cos(phase) * radius;
      // A flattened orbit whose centre sinks along the chain: the spiral hangs down like a wilted curl.
      const py = (-46 + u * 52 + u * u * 14) * s + Math.sin(phase) * radius * 0.42;
      const size = (26 - 12 * u) * s;
      const g = glows[i] as Sprite;
      const b = beads[i] as Sprite;
      g.position.set(px, py);
      b.position.set(px, py);
      loop.fit(g, 'glow', size * 2.4, size * 2.4);
      loop.fit(b, 'dot', size * 0.62, size * 0.62);
      const a = 1 - 0.62 * u;
      g.alpha = 0.55 * a;
      b.alpha = a;
    }
  };
  loop.emit(
    {
      tex: 'droplet', prio: 0, life: [0.7, 1.0], shape: { type: 'circle', r: 18 * s }, speed: [4, 16], dir: Math.PI / 2, spread: 0.6, gravity: 150 * s,
      size: [10, 14], sizeEnd: [7, 9], colors: [0xdcecff, 0xa9d4ff], alpha: 0.9, fadeIn: 0.1, fadeOut: 0.4,
    },
    calm ? 0.5 : 1.3,
    0,
    -42 * s,
  );
  return loop;
}

/** The soft disc and thin boundary ring every zone shares, so players can read its exact reach. */
function zoneBase(loop: Loop, radius: number, disc: number, tint: number, discAlpha: number, ringAlpha: number): { disc: Sprite; ring: Sprite } {
  const d = loop.sprite('glow', 'add', disc);
  loop.fit(d, 'glow', radius * 2.1, radius * 2.1);
  d.alpha = discAlpha;
  const ring = loop.sprite('ring', 'add', tint);
  loop.fit(ring, 'ring', radius * 2.06, radius * 2.06);
  ring.alpha = ringAlpha;
  return { disc: d, ring };
}

/** Looping blizzard: pale disc, wind streaks circling the zone and snow and ice crystals blowing across it. */
export function blizzardZone(env: FxEnv, x: number, y: number, radius: number, o: ZoneOpts = {}): ZoneHandle {
  const c = o.color ?? 0xbfe6ff;
  const calm = fxSettings.reducedMotion;
  const loop = new Loop(env, x, y, loopOpts(o, { fadeIn: 0.5, fadeOut: 0.6 }));
  const base = zoneBase(loop, radius, 0x8ccbff, lighten(c, 0.4), 0.2, 0.5);
  const STREAKS = 6;
  const streaks: Sprite[] = [];
  for (let i = 0; i < STREAKS; i++) {
    const s = loop.sprite('spark', 'add', lighten(c, 0.5));
    loop.fit(s, 'spark', radius * 0.7, 12);
    s.alpha = 0.5;
    streaks.push(s);
  }
  loop.step = (age) => {
    base.ring.alpha = 0.42 + (calm ? 0 : 0.12 * Math.sin(age * 1.4));
    base.disc.alpha = 0.18 + (calm ? 0 : 0.04 * Math.sin(age * 0.9));
    const spin = age * (calm ? 0.4 : 1.5);
    for (let i = 0; i < STREAKS; i++) {
      const a = spin + (i / STREAKS) * TAU;
      const r = radius * (0.5 + 0.2 * Math.sin(i * 2.1));
      const s = streaks[i] as Sprite;
      s.position.set(Math.cos(a) * r, Math.sin(a) * r);
      // Tangent to the circle, head leading: the wind appears to circle the zone.
      s.rotation = a + PI / 2;
    }
  };
  const r = radius;
  loop.emit(
    {
      tex: 'dot', prio: 0, life: [1.3, 2.0], shape: { type: 'circle', r: r * 0.95 }, speed: [10, 40], dir: PI / 2, spread: 0.9, gravity: 60, gravityX: 50, drag: 0.3,
      size: [5, 9], colors: [W, c], alpha: 0.95, fadeIn: 0.2, fadeOut: 0.4, sway: { amp: [4, 10], freq: [0.5, 1.2] },
    },
    r * 0.16,
  );
  loop.emit(
    {
      tex: 'crystal', prio: 0, life: [1.4, 2.1], shape: { type: 'circle', r: r * 0.9 }, speed: [10, 30], dir: PI / 2, spread: 0.9, gravity: 40, gravityX: 40,
      size: [14, 22], sizeEnd: [10, 16], spin: [-2, 2], rot: [0, TAU], colors: [W, lighten(c, 0.4)], alpha: 0.9, fadeIn: 0.2, fadeOut: 0.4, sway: { amp: [3, 8], freq: [0.4, 0.9] },
    },
    r * 0.025,
  );
  loop.emit(
    {
      tex: 'smoke', blend: 'normal', prio: 0, life: [1.5, 2.2], shape: { type: 'circle', r: r * 0.8 }, speed: [12, 30], dir: 0.4, spread: 1, drag: 0.4,
      size: [r * 0.45, r * 0.65], sizeEnd: [r * 0.6, r * 0.85], rot: [0, TAU], spin: [-0.4, 0.4], colors: [0xeaf7ff, c], alpha: 0.22, fadeIn: 0.35, fadeOut: 0.5,
    },
    r * 0.015,
  );
  return loop;
}

/** Looping potion mist: slow billowing clouds, rising bubbles and fizz in the potion's colour. */
export function potionCloud(env: FxEnv, x: number, y: number, radius: number, o: ZoneOpts = {}): ZoneHandle {
  const c = o.color ?? 0xb98cff;
  const hi = lighten(c, 0.55);
  const calm = fxSettings.reducedMotion;
  const loop = new Loop(env, x, y, loopOpts(o, { fadeIn: 0.5, fadeOut: 0.6 }));
  const base = zoneBase(loop, radius, c, hi, 0.16, 0.42);
  const PUFFS = 5;
  const puffs: Sprite[] = [];
  for (let i = 0; i < PUFFS; i++) {
    const p = loop.sprite('smoke', 'normal', i % 2 === 0 ? c : lighten(c, 0.25));
    p.alpha = 0.34;
    puffs.push(p);
  }
  loop.step = (age) => {
    base.ring.alpha = 0.36 + (calm ? 0 : 0.1 * Math.sin(age * 1.7));
    const t = age * (calm ? 0.25 : 0.7);
    for (let i = 0; i < PUFFS; i++) {
      const a = t * (i % 2 === 0 ? 1 : -0.8) + (i / PUFFS) * TAU;
      const p = puffs[i] as Sprite;
      p.position.set(Math.cos(a) * radius * 0.36, Math.sin(a) * radius * 0.3);
      const d = radius * (0.95 + 0.12 * Math.sin(age * 0.8 + i * 1.7));
      loop.fit(p, 'smoke', d, d);
      p.rotation = a * 0.5;
    }
  };
  loop.emit(
    {
      tex: 'ring', prio: 0, life: [0.9, 1.5], shape: { type: 'circle', r: radius * 0.8 }, speed: [20, 50], dir: -PI / 2, spread: 0.4, drag: 0.2,
      size: [9, 16], sizeEnd: [14, 24], colors: [W, hi], alpha: 0.85, fadeIn: 0.15, fadeOut: 0.5, sway: { amp: [3, 7], freq: [0.5, 1] },
    },
    radius * 0.045,
  );
  loop.emit(
    {
      tex: 'sparkle', prio: 0, life: [0.7, 1.2], shape: { type: 'circle', r: radius * 0.85 }, speed: [6, 24], dir: -PI / 2, spread: 1, size: [10, 18], sizeEnd: [3, 6],
      spin: [-3, 3], rot: [0, TAU], colors: [W, hi], fadeIn: 0.2, fadeOut: 0.5,
    },
    radius * 0.03,
  );
  return loop;
}

/** Looping black hole: a dark core, two counter-rotating accretion swirls and light streaks falling in. */
export function blackHole(env: FxEnv, x: number, y: number, radius: number, o: ZoneOpts = {}): ZoneHandle {
  const c = o.color ?? 0xa56bff;
  const hi = lighten(c, 0.5);
  const calm = fxSettings.reducedMotion;
  const loop = new Loop(env, x, y, loopOpts(o, { fadeIn: 0.5, fadeOut: 0.55 }));
  const base = zoneBase(loop, radius, 0x5a2fb0, c, 0.22, 0.42);
  const swirlA = loop.sprite('vortex', 'add', c);
  loop.fit(swirlA, 'vortex', radius * 1.7, radius * 1.7);
  const swirlB = loop.sprite('vortex', 'add', 0x5ac8ff);
  loop.fit(swirlB, 'vortex', radius * 1.15, radius * 1.15);
  const rim = loop.sprite('ringThick', 'add', hi);
  const halo = loop.sprite('glow', 'normal', 0x07020f);
  loop.fit(halo, 'glow', radius * 0.95, radius * 0.95);
  halo.alpha = 0.85;
  const core = loop.sprite('dot', 'normal', 0x000000);
  loop.step = (age) => {
    const spin = calm ? 0.25 : 1;
    swirlA.rotation = age * 2.2 * spin;
    swirlA.alpha = 0.6;
    swirlB.rotation = -age * 3.4 * spin;
    swirlB.alpha = 0.42;
    const beat = calm ? 0 : Math.sin(age * 3.1);
    const d = radius * (0.5 + 0.03 * beat);
    loop.fit(rim, 'ringThick', d, d);
    rim.alpha = 0.55 + 0.15 * beat;
    loop.fit(core, 'dot', radius * 0.3, radius * 0.3);
    base.ring.alpha = 0.38 + (calm ? 0 : 0.1 * Math.sin(age * 2));
  };
  loop.emit(
    {
      tex: 'spark', prio: 0, life: [0.7, 1.0], shape: { type: 'ring', r: radius * 0.98, width: radius * 0.24 }, size: [24, 38], sizeEnd: [8, 12], alignVel: true,
      stretch: 0.0008, colors: [W, hi, c], alpha: 0.9, fadeIn: 0.1, fadeOut: 0.3, converge: { swirl: 46, ease: Ease.cubicIn },
    },
    radius * 0.1,
  );
  return loop;
}
