/**
 * Which drawn picture each unit fires and how it flies. Pure data, so it can be checked without a renderer.
 *
 * A shot is its cartoon picture, turned to point along its path (arrows, shards, the fireball's tail) or spinning (a shuriken, a
 * ladle, a pebble), a flat tapered streak behind it, and a few flat puffs of what it is made of shed along the way (dust, snow,
 * embers, glints, steam, bubbles). Snowballs, fireballs, ladles, coins and flasks are thrown on an arc; the rest fly straight and
 * fast. The cats that make an area (the ice queen, the cosmic cat, the alchemist) throw something too, a shard of ice, a dark star,
 * a flask, and the area opens where it lands.
 */
import { RARITY_ORDER } from '@/ui';
import { unitSpec } from '@/game';
import type { UnitId } from '@/game/api';
import { Light } from '@/fx/light';
import type { PaintId } from '@/fx/paint';

export type ProjectileShape =
  | 'pebble' | 'arrow' | 'shuriken' | 'cork' | 'starArrow' | 'snowball' | 'fireball' | 'bell' | 'ladle' | 'note' | 'flask' | 'coin'
  | 'shard' | 'voidOrb' | 'orb';

/** What a shot sheds as it flies. */
export type ShedKind = 'dust' | 'snow' | 'ember' | 'glint' | 'sparkle' | 'steam' | 'puff' | 'bubble';

export interface ProjectileLook {
  shape: ProjectileShape;
  /** The drawn picture, pointing along +x (the way it flies when it is `oriented`). */
  paint: PaintId;
  /** Display width of the picture at the lowest rank, px. */
  size: number;
  /** Radians per second of spin (0 = it does not spin). */
  spin: number;
  /** Turn the picture to point along its flight (arrows, shards, the fireball); the others spin or stay upright. */
  oriented: boolean;
  /** Flip the coin edge-on and back (the coin only). */
  flip: boolean;
  /** Height of the arc the shot is lobbed in, px (0 = it flies straight). The simulation's path is straight; the arc is drawn on top. */
  lob: number;
  /** A flat tapered streak behind it: colour, length, thickness (px) and opacity; null for none. */
  streak: { color: number; length: number; width: number; alpha: number } | null;
  /** What it sheds, and the colour of the glints, sparkles, embers and snow it leaves (the puffs have their own). */
  shed: { kind: ShedKind; color: number } | null;
}

const LOOKS: Partial<Record<UnitId, ProjectileLook>> = {
  // A pebble tumbles in a puff of dust; an arrow flies point first with a thin pale streak; a shuriken spins fast with a glint;
  // a cork is a fat quick slug with a trail of smoke; the moon arrow leaves a long silver streak and sparkles.
  r_sling: { shape: 'pebble', paint: 'shot_pebble', size: 20, spin: 14, oriented: false, flip: false, lob: 0, streak: { color: Light.trailDust, length: 18, width: 6, alpha: 0.45 }, shed: { kind: 'dust', color: Light.dust } },
  r_archer: { shape: 'arrow', paint: 'shot_arrow', size: 34, spin: 0, oriented: true, flip: false, lob: 0, streak: { color: Light.trailGrass, length: 28, width: 3, alpha: 0.55 }, shed: null },
  r_ninja: { shape: 'shuriken', paint: 'shot_shuriken', size: 24, spin: 26, oriented: false, flip: false, lob: 0, streak: { color: Light.trailCold, length: 20, width: 5, alpha: 0.5 }, shed: { kind: 'glint', color: Light.iceWhite } },
  r_gunner: { shape: 'cork', paint: 'shot_cork', size: 24, spin: 0, oriented: true, flip: false, lob: 0, streak: { color: Light.trailCork, length: 36, width: 8, alpha: 0.45 }, shed: { kind: 'puff', color: Light.smoke } },
  r_star: { shape: 'starArrow', paint: 'shot_moon', size: 36, spin: 0, oriented: true, flip: false, lob: 0, streak: { color: Light.trailMoon, length: 44, width: 4, alpha: 0.55 }, shed: { kind: 'sparkle', color: Light.moon } },
  // Snowballs, fireballs, ladles and coins are thrown: they rise and fall on the way.
  m_snow: { shape: 'snowball', paint: 'shot_snow', size: 26, spin: 6, oriented: false, flip: false, lob: 34, streak: null, shed: { kind: 'snow', color: Light.iceWhite } },
  m_fire: { shape: 'fireball', paint: 'shot_fire', size: 30, spin: 0, oriented: true, flip: false, lob: 30, streak: { color: Light.trailFire, length: 26, width: 10, alpha: 0.5 }, shed: { kind: 'ember', color: Light.warm } },
  t_bell: { shape: 'bell', paint: 'shot_bell', size: 24, spin: 0, oriented: true, flip: false, lob: 0, streak: null, shed: { kind: 'sparkle', color: Light.gold } },
  t_chef: { shape: 'ladle', paint: 'shot_ladle', size: 32, spin: 12, oriented: false, flip: false, lob: 14, streak: null, shed: { kind: 'steam', color: Light.steam } },
  t_bard: { shape: 'note', paint: 'shot_note', size: 22, spin: 0, oriented: false, flip: false, lob: 0, streak: null, shed: { kind: 'sparkle', color: Light.note } },
  t_lucky: { shape: 'coin', paint: 'shot_coin', size: 20, spin: 0, oriented: false, flip: true, lob: 20, streak: null, shed: { kind: 'glint', color: Light.gold } },
};

/** What the area-making cats throw before their area opens: how it looks, and how fast it flies (px/s). */
export interface CastLook {
  look: ProjectileLook;
  speed: number;
}

const CASTS: Partial<Record<UnitId, CastLook>> = {
  m_frost: { look: { shape: 'shard', paint: 'shot_ice', size: 36, spin: 0, oriented: true, flip: false, lob: 0, streak: { color: Light.trailCold, length: 34, width: 6, alpha: 0.55 }, shed: { kind: 'snow', color: Light.iceWhite } }, speed: 1100 },
  m_cosmo: { look: { shape: 'voidOrb', paint: 'shot_void', size: 28, spin: 0, oriented: false, flip: false, lob: 0, streak: { color: Light.trailVoid, length: 26, width: 10, alpha: 0.45 }, shed: { kind: 'sparkle', color: Light.voidRim } }, speed: 640 },
  t_alch: { look: { shape: 'flask', paint: 'shot_flask', size: 28, spin: 9, oriented: false, flip: false, lob: 54, streak: null, shed: { kind: 'bubble', color: Light.lime } }, speed: 620 },
};

const FALLBACK: ProjectileLook = { shape: 'orb', paint: 'burst_glint', size: 22, spin: 0, oriented: false, flip: false, lob: 0, streak: null, shed: null };

export function projectileLook(id: UnitId): ProjectileLook {
  return LOOKS[id] ?? FALLBACK;
}

/** The thing a zone-making cat throws, or null for a cat that throws nothing extra. */
export function castLook(id: UnitId): CastLook | null {
  return CASTS[id] ?? null;
}

/** Shortest and longest time a thrown cast takes, seconds: the area opens when it lands. */
const CAST_MIN = 0.14;
const CAST_MAX = 0.4;

/** Seconds a cast of `id` flies over `distance` px (0 for a cat that casts nothing). */
export function castSeconds(id: UnitId, distance: number): number {
  const cast = CASTS[id];
  if (!cast) return 0;
  return Math.min(CAST_MAX, Math.max(CAST_MIN, distance / cast.speed));
}

/** A cat's rank in its class line, 0 (the common cat) to 4 (the legend). */
export function rankOf(id: UnitId): number {
  return Math.max(0, RARITY_ORDER.indexOf(unitSpec(id).rarity));
}

/** The most a top-rank shot grows over a common cat's: a pebble stays a pebble. */
export const RANK_GROWTH = 0.2;

/** A higher rank throws a little bigger shot (up to 20 % wider) with a bolder streak (up to 30 % stronger). */
export function rankSize(id: UnitId): number {
  return 1 + (RANK_GROWTH / 4) * rankOf(id);
}

export function rankTrail(id: UnitId): number {
  return 0.8 + 0.075 * rankOf(id);
}
