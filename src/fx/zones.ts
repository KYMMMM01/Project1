import { Graphics, Sprite, Texture, type Container } from 'pixi.js';
import { Ease } from '@/core/tween';
import { TAU, clamp01, mixColor } from '@/core/math';
import { drawDashedRect } from '@/ui/paper';
import { Color } from '@/ui/theme';
import { drawHazardFrame } from './hazardFrame';
import { Loop, type FxEnv, type FxRect, type LoopOpts, type ZoneHandle } from './loops';
import { drawSunMark } from './marks';
import { Hue } from './palette';
import { fxSettings } from './settings';
import type { FxTexId } from './textures';

const W = Hue.cream;

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

/** The hazard tape every hostile cell wears (see `drawHazardFrame`). */
function hazardTape(loop: Loop, rect: FxRect): Graphics {
  const g = new Graphics();
  drawHazardFrame(g, rect.w - 6, rect.h - 6, 12, 20);
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
 * Cell hazard telegraph: hazard tape round the cell that blinks faster as time runs out while a flat tint
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
  const outline = hazardTape(loop, rect);
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
