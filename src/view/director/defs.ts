/**
 * Particle recipes the director fires on its own (the fx facade covers the big set pieces). Defined
 * once at module level so a hit, a status tick or a muzzle flash never builds an object. Colours are
 * placeholders: callers pass the real ones through BurstMods.colors.
 */
import { TAU } from '@/core/math';
import { Ease } from '@/core/tween';
import type { EmitDef } from '@/fx';

const W = 0xffffff;
const PI = Math.PI;

// ── combat ──

/** Three streaks and a flash: the ordinary hit. About 5 particles. */
export const HIT_SPARK: EmitDef = {
  tex: 'spark', prio: 0, count: 3, life: [0.12, 0.2], speed: [220, 460], drag: 5, alignVel: true, stretch: 0.0024,
  size: [26, 40], sizeEnd: [8, 10], colors: [W], fadeIn: 0, fadeOut: 0.55,
};

export const HIT_FLASH: EmitDef = {
  tex: 'glow', prio: 0, count: 1, life: 0.12, size: 46, sizeEnd: 82, colors: [W], alpha: 0.8, fadeIn: 0, fadeOut: 0.85,
  sizeEase: Ease.cubicOut,
};

/** Frame 1 of the muzzle cue: a round flash (guide C-01). */
export const MUZZLE_FLASH: EmitDef = {
  tex: 'glow', prio: 0, count: 1, life: 0.07, size: 42, sizeEnd: 18, colors: [W], alpha: 0.9, fadeIn: 0, fadeOut: 0.8,
};

/** Frames 2-3: the flash stretches into the shape of the shot. */
export const MUZZLE_STREAK: EmitDef = {
  tex: 'spark', prio: 0, count: 2, life: [0.07, 0.12], speed: [260, 420], spread: 0.3, drag: 4, alignVel: true,
  stretch: 0.002, size: [24, 34], sizeEnd: [8, 10], colors: [W], fadeIn: 0,
};

/** A spell gathering at the caster: zones, chains and other attacks with no projectile. */
export const CAST_RING: EmitDef = {
  tex: 'ring', prio: 0, count: 1, life: 0.24, size: 30, sizeEnd: 104, colors: [W], alpha: 0.8, fadeIn: 0, fadeOut: 0.8,
  sizeEase: Ease.cubicOut,
};

/** Where a projectile lands: a small flash and a few motes. */
export const IMPACT_PUFF: EmitDef = {
  tex: 'glow', prio: 0, count: 1, life: 0.16, size: 36, sizeEnd: 78, colors: [W], alpha: 0.8, fadeIn: 0, fadeOut: 0.8,
  sizeEase: Ease.cubicOut,
};

export const IMPACT_MOTES: EmitDef = {
  tex: 'dot', prio: 0, count: 3, life: [0.16, 0.28], speed: [60, 190], drag: 3.5, size: [6, 10], sizeEnd: 2, colors: [W],
  fadeIn: 0,
};

/** A shot that found nothing (its target died first): a thin puff of dust. */
export const FIZZLE: EmitDef = {
  tex: 'smoke', blend: 'normal', prio: 0, count: 2, life: [0.25, 0.4], shape: { type: 'circle', r: 6 }, speed: [20, 60], drag: 3,
  size: [14, 20], sizeEnd: [30, 42], rot: [0, TAU], colors: [0xd2c8dc], alpha: 0.4, fadeIn: 0.1, fadeOut: 0.6,
};

/** Cyan glance of a shield soaking a hit. */
export const SHIELD_GLANCE: EmitDef = {
  tex: 'ring', prio: 1, count: 1, life: 0.22, size: 22, sizeEnd: 70, colors: [W], alpha: 0.9, fadeIn: 0, fadeOut: 0.8,
  sizeEase: Ease.cubicOut,
};

export const SHIELD_GLINT: EmitDef = {
  tex: 'sparkle', prio: 0, count: 3, life: [0.25, 0.4], speed: [50, 150], drag: 3, size: [12, 20], sizeEnd: [3, 6], spin: [-4, 4],
  rot: [0, TAU], colors: [W], fadeIn: 0.1, fadeOut: 0.5,
};

/** Rings of a piercing arrow's burst at each enemy it passes. */
export const STAR_POP: EmitDef = {
  tex: 'star', prio: 1, count: 4, life: [0.3, 0.5], speed: [120, 300], drag: 3, size: [18, 30], sizeEnd: [5, 9], spin: [-6, 6],
  rot: [0, TAU], colors: [W], fadeIn: 0, fadeOut: 0.5,
};

// ── status cues (guide: ice, embers, bubbles, drips, cracks, stars) ──

export const ICE_CRYSTALS: EmitDef = {
  tex: 'crystal', prio: 1, count: 3, life: [0.35, 0.55], shape: { type: 'circle', r: 10 }, speed: [40, 110], drag: 3, gravity: 220,
  size: [16, 24], sizeEnd: [8, 12], spin: [-4, 4], rot: [0, TAU], colors: [W, 0xbfefff, 0x7fd6ff], fadeIn: 0, fadeOut: 0.5,
};

export const EMBERS: EmitDef = {
  tex: 'dot', prio: 0, count: 5, life: [0.5, 0.8], shape: { type: 'circle', r: 12 }, speed: [30, 90], dir: -PI / 2, spread: 0.6,
  drag: 1.2, gravity: -60, size: [7, 12], sizeEnd: 2, colors: [0xffe08a, 0xff7a2a, 0xff3a1a], fadeIn: 0, fadeOut: 0.5,
};

export const BUBBLES: EmitDef = {
  tex: 'ring', prio: 0, count: 4, life: [0.5, 0.8], shape: { type: 'circle', r: 14 }, speed: [20, 60], dir: -PI / 2, spread: 0.5,
  size: [10, 16], sizeEnd: [16, 24], colors: [0xd8ffd0, 0x86e05a], alpha: 0.8, fadeIn: 0.1, fadeOut: 0.5,
};

export const DRIPS: EmitDef = {
  tex: 'droplet', blend: 'normal', prio: 0, count: 4, life: [0.4, 0.7], shape: { type: 'circle', r: 10 }, speed: [20, 70], gravity: 640,
  size: [10, 16], sizeEnd: [6, 10], colors: [0xff6b78, 0xc4202f], fadeIn: 0, fadeOut: 0.4,
};

export const CRACKS: EmitDef = {
  tex: 'shard', blend: 'normal', prio: 1, count: 5, life: [0.35, 0.6], speed: [80, 220], gravity: 520, drag: 1, size: [10, 16],
  sizeEnd: [6, 10], spin: [-9, 9], rot: [0, TAU], colors: [0xe6ecf4, 0x8993a3], fadeIn: 0, fadeOut: 0.4,
};

export const CRACK_FLASH: EmitDef = {
  tex: 'starburst', prio: 1, count: 1, life: 0.14, size: 36, sizeEnd: 80, rot: [0, TAU], colors: [W], fadeIn: 0, fadeOut: 0.7,
  sizeEase: Ease.cubicOut,
};

/** Little stars circling over a stunned head. */
export const STUN_STARS: EmitDef = {
  tex: 'star', prio: 1, count: 3, life: [0.6, 0.85], shape: { type: 'ring', r: 18 }, speed: [8, 24], drag: 1, size: [16, 22],
  sizeEnd: [10, 14], spin: [-5, 5], rot: [0, TAU], colors: [0xfff4a0, 0xffe45c], fadeIn: 0.1, fadeOut: 0.5,
};

export const VULN_PULSE: EmitDef = {
  tex: 'ring', prio: 0, count: 1, life: 0.3, size: 20, sizeEnd: 72, colors: [0xe8c8ff, 0xb26bff], alpha: 0.8, fadeIn: 0, fadeOut: 0.7,
  sizeEase: Ease.cubicOut,
};

/** Streaks racing back along the path behind a dragged enemy. */
export const PULL_STREAKS: EmitDef = {
  tex: 'spark', prio: 0, count: 3, life: [0.16, 0.26], speed: [260, 420], spread: 0.18, drag: 2, alignVel: true, stretch: 0.0022,
  size: [30, 46], sizeEnd: [8, 12], colors: [W], fadeIn: 0, fadeOut: 0.6,
};

// ── ambient staging cues ──

/** Streaks racing inward: the vacuum's inhale and the awakening charge-up share it. */
export const WIND_IN: EmitDef = {
  tex: 'spark', prio: 1, count: 5, life: [0.35, 0.5], shape: { type: 'ring', r: 330, width: 70 }, size: [60, 96], sizeEnd: [18, 28],
  alignVel: true, stretch: 0.0006, colors: [W], alpha: 0.75, fadeIn: 0.1, fadeOut: 0.3, converge: { ease: Ease.cubicIn },
};

/** Speed lines along the loop for the blender's whirl. */
export const WHIRL_LINE: EmitDef = {
  tex: 'spark', prio: 1, count: 1, life: [0.22, 0.34], speed: [480, 620], drag: 0.6, alignVel: true, stretch: 0.0016,
  size: [60, 90], sizeEnd: [14, 22], colors: [W], alpha: 0.8, fadeIn: 0, fadeOut: 0.5,
};

export const SPLASH_DROPS: EmitDef = {
  tex: 'droplet', blend: 'normal', prio: 1, count: 12, life: [0.5, 0.9], shape: { type: 'circle', r: 24 }, speed: [160, 420],
  dir: -PI / 2, spread: 1.1, gravity: 900, drag: 0.6, size: [14, 24], sizeEnd: [8, 14], colors: [0xbfeaff, 0x62cfff], fadeIn: 0,
  fadeOut: 0.4,
};

/** A weakened cat breaks into a sweat. */
export const SWEAT: EmitDef = {
  tex: 'droplet', blend: 'normal', prio: 0, count: 3, life: [0.4, 0.65], shape: { type: 'circle', r: 14 }, speed: [30, 90], dir: -PI / 2,
  spread: 1.1, gravity: 560, size: [10, 16], sizeEnd: [6, 10], colors: [W], fadeIn: 0, fadeOut: 0.4,
};

export const SPARKLE_UP: EmitDef = {
  tex: 'sparkle', prio: 1, count: 4, life: [0.5, 0.9], shape: { type: 'circle', r: 30 }, speed: [30, 90], dir: -PI / 2, spread: 0.7,
  drag: 1, size: [14, 26], sizeEnd: [3, 7], spin: [-3, 3], rot: [0, TAU], colors: [W], fadeIn: 0.1, fadeOut: 0.5,
};

export const SOFT_RING: EmitDef = {
  tex: 'ring', prio: 0, count: 1, life: 0.4, size: 20, sizeEnd: 110, colors: [W], alpha: 0.7, fadeIn: 0, fadeOut: 0.75,
  sizeEase: Ease.cubicOut,
};

/** A cosmetic theme's extra layer: pieces thrown up and out of a reveal. */
export const THEME_SPRAY: EmitDef = {
  tex: 'sparkle', prio: 2, count: 6, life: [0.7, 1.2], speed: [140, 340], dir: -PI / 2, spread: 1.3, drag: 1.6, gravity: 0,
  size: [18, 30], sizeEnd: [10, 16], spin: [-4, 4], rot: [0, TAU], colors: [W], fadeIn: 0.05, fadeOut: 0.4,
};

