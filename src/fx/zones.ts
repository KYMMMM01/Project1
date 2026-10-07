import { Graphics, Sprite, Texture, type Container } from 'pixi.js';
import { Ease } from '@/core/tween';
import { TAU, clamp01, lighten, mixColor } from '@/core/math';
import { drawDashedRect } from '@/ui/paper';
import { Color } from '@/ui/theme';
import { boltPointCount, buildBolt, strokeBolt } from './bolt';
import { Loop, hash01, type FxEnv, type FxRect, type LoopOpts, type ZoneHandle } from './loops';
import { drawSunMark } from './marks';
import { Hue } from './palette';
import { fxSettings } from './settings';
import type { FxTexId } from './textures';

const W = Hue.cream;
const PI = Math.PI;

/** Looping cell hazards and zones. Each returns a handle: stop() fades it out, `done` settles when it is gone. */
export interface ZoneOpts {
  /** Main colour; each preset has its own default. */
  color?: number;
  /** Size multiplier of laserDot and weakenSwirl (the cell and radius presets size themselves). Default 1. */
  scale?: number;
  /** laserDot, weakenSwirl and the radius zones only: track a display object instead of a fixed point. */
  follow?: Container;
  /** laserDot only: radius of the marked area, drawn as a flat soft disc with a dashed edge round the dot (none when omitted). */
  radius?: number;
}

export type HazardKind = 'wet' | 'zap';

export interface HazardWarnOpts {
  /** Telegraph time in seconds; the tint fills up over it. Default 0.8 (the battle rules' warning). */
  duration?: number;
}

function loopOpts(o: ZoneOpts, base: LoopOpts = {}): LoopOpts {
  return o.follow ? { ...base, follow: o.follow } : base;
}

/** A round paper sticker at (x, y): flat shadow, cream border, coloured face and a cream glyph. */
function sticker(loop: Loop, x: number, y: number, size: number, fill: number, glyph: FxTexId): void {
  const shadow = loop.sprite('disc', Hue.shadow);
  loop.fit(shadow, 'disc', size, size);
  shadow.position.set(x + 1.5, y + 3);
  shadow.alpha = 0.3;
  const rim = loop.sprite('disc', W);
  loop.fit(rim, 'disc', size, size);
  rim.position.set(x, y);
  const face = loop.sprite('disc', fill);
  loop.fit(face, 'disc', size - 6, size - 6);
  face.position.set(x, y);
  const mark = loop.sprite(glyph, W);
  loop.fit(mark, glyph, size * (glyph === 'droplet' ? 0.36 : 0.52), size * (glyph === 'droplet' ? 0.52 : 0.52));
  mark.position.set(x, y + (glyph === 'droplet' ? 1 : 0));
}

/** The dashed outline every hazard cell wears, in berry. */
function hazardOutline(loop: Loop, rect: FxRect): Graphics {
  const g = new Graphics();
  drawDashedRect(g, -rect.w / 2 + 4, -rect.h / 2 + 4, rect.w - 8, rect.h - 8, { radius: 22, color: Color.berry, width: 4, dash: 14, gap: 10 });
  loop.own(g);
  return g;
}

/**
 * A sunbeam cell has to read at a glance on every mat, so it is the loudest tile on the board short of a hazard: a clearly
 * lighter warm patch, a cream edge with a dashed mustard line inside it, a ring of flat paper rays that turns slowly behind
 * the cat, and a big sun sticker on the corner. Reduced motion keeps the same picture, still and a little stronger.
 */
export function sunbeamCell(env: FxEnv, rect: FxRect, o: ZoneOpts = {}): ZoneHandle {
  const c = o.color ?? Color.mustard;
  const loop = new Loop(env, rect.x + rect.w / 2, rect.y + rect.h / 2, { fadeIn: 0.7, fadeOut: 0.5 });
  const w = rect.w;
  const h = rect.h;
  const patch = new Graphics();
  patch.roundRect(-w / 2 + 3, -h / 2 + 3, w - 6, h - 6, 20).fill(mixColor(c, Color.paperLight, 0.58));
  const rays = new Graphics();
  const n = 10;
  const reach = Math.min(w, h) / 2 - 4;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    const half = 0.17;
    rays.poly([0, 0, Math.cos(a - half) * reach, Math.sin(a - half) * reach, Math.cos(a + half) * reach, Math.sin(a + half) * reach]);
  }
  rays.fill(c);
  const edge = new Graphics();
  edge.roundRect(-w / 2 + 2, -h / 2 + 2, w - 4, h - 4, 22).stroke({ width: 5, color: Color.paperLight });
  drawDashedRect(edge, -w / 2 + 8, -h / 2 + 8, w - 16, h - 16, { radius: 17, color: Color.mustardDark, width: 4.5, dash: 13, gap: 9 });
  const sun = new Graphics();
  drawSunMark(sun, 25);
  sun.position.set(-w / 2 + 21, -h / 2 + 21);
  loop.own(patch);
  loop.own(rays);
  loop.own(edge);
  loop.own(sun);
  loop.step = (age) => {
    // Read per frame: the player may switch reduced motion on while the cell is lit.
    const calm = fxSettings.reducedMotion;
    patch.alpha = calm ? 0.92 : 0.86 + 0.06 * Math.sin(age * 1.3);
    rays.rotation = calm ? 0.2 : age * 0.2;
    rays.alpha = calm ? 0.52 : 0.36 + 0.1 * Math.sin(age * 0.9);
    sun.rotation = calm ? 0 : 0.2 * Math.sin(age * 1.1);
  };
  return loop;
}

/**
 * The classic red laser dot with a faint beam running down to where the finger is: a flat red disc, a
 * small cream highlight and a thin ring that pulses out. moveTo() glides it to a new spot (call it every
 * frame to make it follow a finger or an enemy).
 */
export function laserDot(env: FxEnv, x: number, y: number, o: ZoneOpts = {}): ZoneHandle {
  const c = o.color ?? Hue.alarm;
  const s = o.scale ?? 1;
  const loop = new Loop(env, x, y, loopOpts(o, { fadeIn: 0.12, fadeOut: 0.2, halfLife: 0.045 }));
  // The marked area: every enemy inside it takes the laser's bonus and is the cats' first choice. Flat, with a cream rim under the dashes.
  const reach = o.radius ?? 0;
  const area = new Graphics();
  if (reach > 0) {
    area.circle(0, 0, reach).fill({ color: c, alpha: 0.1 });
    area.circle(0, 0, reach - 2).stroke({ width: 9, color: W, alpha: 0.5 });
    const dashes = 26;
    for (let i = 0; i < dashes; i++) {
      const a0 = (i / dashes) * TAU;
      const span = (0.56 / dashes) * TAU;
      for (let k = 0; k <= 3; k++) {
        const a = a0 + (span * k) / 3;
        if (k === 0) area.moveTo(Math.cos(a) * (reach - 2), Math.sin(a) * (reach - 2));
        else area.lineTo(Math.cos(a) * (reach - 2), Math.sin(a) * (reach - 2));
      }
    }
    area.stroke({ width: 5, color: c, cap: 'round' });
    loop.own(area);
  }
  const beam = loop.sprite('beam', c);
  loop.fit(beam, 'beam', 7 * s, 220 * s);
  beam.y = 110 * s;
  beam.alpha = 0.16;
  const ringA = loop.sprite('ring', c);
  const ringB = loop.sprite('ring', c);
  const rim = loop.sprite('dot', W);
  loop.fit(rim, 'dot', 23 * s, 23 * s);
  const core = loop.sprite('dot', c);
  loop.fit(core, 'dot', 17 * s, 17 * s);
  const highlight = loop.sprite('dot', W);
  loop.fit(highlight, 'dot', 5 * s, 5 * s);
  highlight.position.set(-3 * s, -3 * s);
  loop.step = (age) => {
    const calm = fxSettings.reducedMotion;
    if (reach > 0) {
      area.rotation = calm ? 0 : age * 0.3;
      area.alpha = calm ? 1 : 0.88 + 0.12 * Math.sin(age * 3);
    }
    for (let i = 0; i < 2; i++) {
      const ring = i === 0 ? ringA : ringB;
      const p = calm ? 0.5 : (age * 1.1 + i * 0.5) % 1;
      const d = (22 + 46 * Ease.cubicOut(p)) * s;
      loop.fit(ring, 'ring', d, d);
      ring.alpha = calm ? 0.5 : 0.7 * (1 - p) * (1 - p);
    }
  };
  return loop;
}

/**
 * Cell hazard telegraph: a berry dashed outline that blinks faster as time runs out while a flat tint
 * rises from the bottom of the cell, with a drop / bolt sticker so the kind is not told by colour alone.
 * Ends with a small pop after `duration` seconds.
 */
export function hazardWarn(env: FxEnv, rect: FxRect, kind: HazardKind, o: HazardWarnOpts = {}): ZoneHandle {
  const duration = Math.max(0.1, o.duration ?? 0.8);
  const col = kind === 'wet' ? Hue.water : Hue.zap;
  const calm = fxSettings.reducedMotion;
  const pop = 0.2;
  const loop = new Loop(env, rect.x + rect.w / 2, rect.y + rect.h / 2, { fadeIn: 0.08, fadeOut: pop, life: duration });
  const innerW = rect.w - 14;
  const innerH = rect.h - 14;

  const fill = new Sprite(Texture.WHITE);
  fill.anchor.set(0.5, 1);
  fill.tint = col;
  fill.alpha = 0.34;
  fill.width = innerW;
  fill.y = innerH / 2;
  loop.own(fill);
  const outline = hazardOutline(loop, rect);
  sticker(loop, -rect.w / 2 + 22, -rect.h / 2 + 22, 32, Color.berry, kind === 'wet' ? 'droplet' : 'zapGlyph');

  loop.step = (age) => {
    const p = clamp01(age / duration);
    fill.height = Math.max(0.01, innerH * p);
    // 1.6 Hz rising to 3 Hz: a countdown, and still inside the flash-safety limit.
    const blink = calm ? 0.8 : 0.5 + 0.5 * Math.sin(age * TAU * (1.6 + 1.4 * p));
    outline.alpha = 0.5 + 0.5 * blink;
    const over = Math.max(0, age - duration) / pop;
    loop.container.scale.set(1 + 0.12 * Ease.cubicOut(clamp01(over)));
  };
  return loop;
}

/** Looping puddle hazard: a flat blue pool with thin rings spreading from random spots and flat drops leaping out of it. */
export function wetPuddle(env: FxEnv, rect: FxRect, o: ZoneOpts = {}): ZoneHandle {
  const c = o.color ?? Hue.water;
  const calm = fxSettings.reducedMotion;
  const loop = new Loop(env, rect.x + rect.w / 2, rect.y + rect.h / 2 + rect.h * 0.08, { fadeIn: 0.35, fadeOut: 0.45 });
  const pw = rect.w * 0.9;
  const ph = rect.h * 0.6;
  const tint = loop.sprite('patch', c);
  loop.fit(tint, 'patch', rect.w - 6, rect.h - 6);
  tint.y = -rect.h * 0.08;
  tint.alpha = 0.16;
  const pool = loop.sprite('puddle', c);
  loop.fit(pool, 'puddle', pw, ph);
  pool.alpha = 0.78;
  const rings = [loop.sprite('ring', W), loop.sprite('ring', W), loop.sprite('ring', W)];
  const period = 1.7;
  loop.step = (age) => {
    for (let i = 0; i < 3; i++) {
      const t = age / period + i / 3;
      const cycle = Math.floor(t);
      const p = t - cycle;
      const ring = rings[i] as Sprite;
      const wd = pw * 0.4 * (0.12 + 0.88 * Ease.cubicOut(p));
      loop.fit(ring, 'ring', wd, wd * 0.42);
      ring.x = (hash01(cycle * 3 + i) - 0.5) * pw * 0.5;
      ring.y = (hash01(cycle * 5 + i + 7) - 0.5) * ph * 0.3;
      ring.alpha = calm ? 0 : 0.8 * Math.pow(1 - p, 1.5);
    }
  };
  hazardOutline(loop, rect).y = -rect.h * 0.08;
  sticker(loop, -rect.w / 2 + 22, -rect.h * 0.08 - rect.h / 2 + 22, 30, Color.berry, 'droplet');
  loop.emit(
    {
      tex: 'droplet', prio: 0, life: [0.55, 0.85], shape: { type: 'rect', w: pw * 0.7, h: ph * 0.3 }, speed: [120, 210], dir: -PI / 2, spread: 0.45,
      gravity: 640, size: [9, 13], sizeEnd: [6, 9], colors: [W, lighten(c, 0.5)], alpha: 0.95, fadeIn: 0, fadeOut: 0.35,
    },
    calm ? 1.2 : 3.4,
    0,
    ph * 0.1,
  );
  return loop;
}

/** Looping electrified-cell hazard: a flat mustard tint that flickers, crackling arcs that jump across the cell and flying sparks. */
export function zapCell(env: FxEnv, rect: FxRect, o: ZoneOpts = {}): ZoneHandle {
  const c = o.color ?? Hue.zap;
  const calm = fxSettings.reducedMotion;
  const loop = new Loop(env, rect.x + rect.w / 2, rect.y + rect.h / 2, { fadeIn: 0.25, fadeOut: 0.35 });
  const tint = loop.sprite('patch', c);
  loop.fit(tint, 'patch', rect.w - 6, rect.h - 6);
  hazardOutline(loop, rect);
  sticker(loop, -rect.w / 2 + 22, -rect.h / 2 + 22, 30, Color.berry, 'zapGlyph');
  const pts = new Float32Array(2 * boltPointCount(3));
  let next = 0.1;
  loop.step = (age) => {
    const flick = calm ? 0.6 : 0.5 + 0.5 * Math.sin(age * 17) * Math.sin(age * 7.3 + 1);
    tint.alpha = 0.18 + 0.14 * flick;
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
  const c = o.color ?? Hue.water;
  const s = o.scale ?? 1;
  const calm = fxSettings.reducedMotion;
  const loop = new Loop(env, x, y, loopOpts(o, { fadeIn: 0.3, fadeOut: 0.35 }));
  const N = 7;
  const rims: Sprite[] = [];
  const beads: Sprite[] = [];
  for (let i = 0; i < N; i++) {
    rims.push(loop.sprite('dot', W));
    beads.push(loop.sprite('dot', c));
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
      const size = (22 - 10 * u) * s;
      const r = rims[i] as Sprite;
      const b = beads[i] as Sprite;
      r.position.set(px, py);
      b.position.set(px, py);
      loop.fit(r, 'dot', size, size);
      loop.fit(b, 'dot', size - 4, size - 4);
      const a = 1 - 0.55 * u;
      r.alpha = a;
      b.alpha = a;
    }
  };
  loop.emit(
    {
      tex: 'droplet', prio: 0, life: [0.7, 1.0], shape: { type: 'circle', r: 18 * s }, speed: [4, 16], dir: Math.PI / 2, spread: 0.6, gravity: 150 * s,
      size: [10, 14], sizeEnd: [7, 9], colors: [Hue.iceLight, Hue.ice], alpha: 0.95, fadeIn: 0.1, fadeOut: 0.4,
    },
    calm ? 0.5 : 1.3,
    0,
    -42 * s,
  );
  return loop;
}

/** The flat disc and thin boundary ring every zone shares, so players can read its exact reach. */
function zoneBase(loop: Loop, radius: number, disc: number, tint: number, discAlpha: number, ringAlpha: number): { disc: Sprite; ring: Sprite } {
  const d = loop.sprite('disc', disc);
  loop.fit(d, 'disc', radius * 2.06, radius * 2.06);
  d.alpha = discAlpha;
  const ring = loop.sprite('ring', tint);
  loop.fit(ring, 'ring', radius * 2.06, radius * 2.06);
  ring.alpha = ringAlpha;
  return { disc: d, ring };
}

/** Looping blizzard: pale blue disc, wind streaks circling the zone and snow and paper crystals blowing across it. */
export function blizzardZone(env: FxEnv, x: number, y: number, radius: number, o: ZoneOpts = {}): ZoneHandle {
  const c = o.color ?? Hue.ice;
  const calm = fxSettings.reducedMotion;
  const loop = new Loop(env, x, y, loopOpts(o, { fadeIn: 0.5, fadeOut: 0.6 }));
  const base = zoneBase(loop, radius, c, Hue.water, 0.2, 0.6);
  const STREAKS = 6;
  const streaks: Sprite[] = [];
  for (let i = 0; i < STREAKS; i++) {
    const s = loop.sprite('spark', W);
    loop.fit(s, 'spark', radius * 0.7, 12);
    s.alpha = 0.7;
    streaks.push(s);
  }
  loop.step = (age) => {
    base.ring.alpha = 0.5 + (calm ? 0 : 0.1 * Math.sin(age * 1.4));
    base.disc.alpha = 0.2 + (calm ? 0 : 0.03 * Math.sin(age * 0.9));
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
      size: [14, 22], sizeEnd: [10, 16], spin: [-2, 2], rot: [0, TAU], colors: [W, Hue.iceLight], alpha: 0.9, fadeIn: 0.2, fadeOut: 0.4, sway: { amp: [3, 8], freq: [0.4, 0.9] },
    },
    r * 0.025,
  );
  loop.emit(
    {
      tex: 'smoke', prio: 0, life: [1.5, 2.2], shape: { type: 'circle', r: r * 0.8 }, speed: [12, 30], dir: 0.4, spread: 1, drag: 0.4,
      size: [r * 0.45, r * 0.65], sizeEnd: [r * 0.6, r * 0.85], rot: [0, TAU], spin: [-0.4, 0.4], colors: [W, Hue.iceLight], alpha: 0.22, fadeIn: 0.35, fadeOut: 0.5,
    },
    r * 0.015,
  );
  return loop;
}

/** Looping potion mist: slow billowing flat puffs, rising bubble rings and fizz in the potion's colour. */
export function potionCloud(env: FxEnv, x: number, y: number, radius: number, o: ZoneOpts = {}): ZoneHandle {
  const c = o.color ?? Color.leaf;
  const hi = lighten(c, 0.55);
  const calm = fxSettings.reducedMotion;
  const loop = new Loop(env, x, y, loopOpts(o, { fadeIn: 0.5, fadeOut: 0.6 }));
  const base = zoneBase(loop, radius, c, Color.leafDark, 0.16, 0.55);
  const PUFFS = 5;
  const puffs: Sprite[] = [];
  for (let i = 0; i < PUFFS; i++) {
    const p = loop.sprite('smoke', i % 2 === 0 ? c : lighten(c, 0.25));
    p.alpha = 0.3;
    puffs.push(p);
  }
  loop.step = (age) => {
    base.ring.alpha = 0.5 + (calm ? 0 : 0.1 * Math.sin(age * 1.7));
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

/** Looping black hole drawn as ink on paper: a dark hub, two counter-rotating spiral arms and streaks falling in. */
export function blackHole(env: FxEnv, x: number, y: number, radius: number, o: ZoneOpts = {}): ZoneHandle {
  const c = o.color ?? Color.inkSoft;
  const calm = fxSettings.reducedMotion;
  const loop = new Loop(env, x, y, loopOpts(o, { fadeIn: 0.5, fadeOut: 0.55 }));
  const base = zoneBase(loop, radius, Color.ink, c, 0.16, 0.55);
  const swirlA = loop.sprite('vortex', c);
  loop.fit(swirlA, 'vortex', radius * 1.7, radius * 1.7);
  const swirlB = loop.sprite('vortex', Color.kraftDark);
  loop.fit(swirlB, 'vortex', radius * 1.15, radius * 1.15);
  const rim = loop.sprite('ringThick', Color.ink);
  const core = loop.sprite('dot', Color.inkDeep);
  loop.step = (age) => {
    const spin = calm ? 0.25 : 1;
    swirlA.rotation = age * 2.2 * spin;
    swirlA.alpha = 0.7;
    swirlB.rotation = -age * 3.4 * spin;
    swirlB.alpha = 0.6;
    const beat = calm ? 0 : Math.sin(age * 3.1);
    const d = radius * (0.5 + 0.03 * beat);
    loop.fit(rim, 'ringThick', d, d);
    rim.alpha = 0.8;
    loop.fit(core, 'dot', radius * 0.34, radius * 0.34);
    base.ring.alpha = 0.5 + (calm ? 0 : 0.1 * Math.sin(age * 2));
  };
  loop.emit(
    {
      tex: 'spark', prio: 0, life: [0.7, 1.0], shape: { type: 'ring', r: radius * 0.98, width: radius * 0.24 }, size: [24, 38], sizeEnd: [8, 12], alignVel: true,
      stretch: 0.0008, colors: [Hue.cream, Color.kraft], alpha: 0.9, fadeIn: 0.1, fadeOut: 0.3, converge: { swirl: 46, ease: Ease.cubicIn },
    },
    radius * 0.1,
  );
  return loop;
}
