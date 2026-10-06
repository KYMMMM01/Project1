/** Which shape each unit fires and how it flies. Pure data, so it can be checked without a renderer. */
import type { UnitId } from '@/game/api';

export type ProjectileShape =
  | 'pebble' | 'arrow' | 'shuriken' | 'bullet' | 'starArrow' | 'snowball' | 'fireball'
  | 'bell' | 'bone' | 'note' | 'flask' | 'coin' | 'orb';

export interface ProjectileLook {
  shape: ProjectileShape;
  /** Display length of the shape along its travel direction, px. */
  size: number;
  /** Radians per second of spin (0 = points along its path). */
  spin: number;
  /** Additive glow colour behind the shape, or 0 for none. */
  glow: number;
  /** Colour of a streak trailing behind, or 0 for none. */
  trail: number;
  /** Trail length in px. */
  trailLength: number;
  /** Flip the coin edge-on and back (the coin only). */
  flip: boolean;
  /** Turn the shape to point along its flight; upright shapes (bell, note, coin) stay level. */
  oriented: boolean;
}

const LOOKS: Partial<Record<UnitId, ProjectileLook>> = {
  r_sling: { shape: 'pebble', size: 18, spin: 9, glow: 0, trail: 0xe8dcc8, trailLength: 22, flip: false, oriented: false },
  r_archer: { shape: 'arrow', size: 44, spin: 0, glow: 0, trail: 0xffffff, trailLength: 26, flip: false, oriented: true },
  r_ninja: { shape: 'shuriken', size: 28, spin: 26, glow: 0, trail: 0xa9b6d0, trailLength: 24, flip: false, oriented: false },
  r_gunner: { shape: 'bullet', size: 28, spin: 0, glow: 0xffd24a, trail: 0xffd24a, trailLength: 70, flip: false, oriented: true },
  r_star: { shape: 'starArrow', size: 30, spin: 0, glow: 0xffe36a, trail: 0xffd24a, trailLength: 96, flip: false, oriented: false },
  m_snow: { shape: 'snowball', size: 24, spin: 6, glow: 0x9fd4ff, trail: 0xe6f4ff, trailLength: 26, flip: false, oriented: false },
  m_fire: { shape: 'fireball', size: 24, spin: 0, glow: 0xff7a1a, trail: 0xff9a2a, trailLength: 54, flip: false, oriented: false },
  t_bell: { shape: 'bell', size: 26, spin: 0, glow: 0xffe08a, trail: 0xffe9a8, trailLength: 20, flip: false, oriented: false },
  t_chef: { shape: 'bone', size: 44, spin: 12, glow: 0, trail: 0xffffff, trailLength: 20, flip: false, oriented: false },
  t_bard: { shape: 'note', size: 30, spin: 0, glow: 0xff7ad9, trail: 0xffb4ec, trailLength: 26, flip: false, oriented: false },
  t_alch: { shape: 'flask', size: 28, spin: 8, glow: 0x8cf06a, trail: 0xb9ff9a, trailLength: 24, flip: false, oriented: false },
  t_lucky: { shape: 'coin', size: 24, spin: 0, glow: 0xffd23f, trail: 0xffe58a, trailLength: 32, flip: true, oriented: false },
};

const FALLBACK: ProjectileLook = { shape: 'orb', size: 20, spin: 0, glow: 0xffffff, trail: 0xffffff, trailLength: 28, flip: false, oriented: false };

export function projectileLook(id: UnitId): ProjectileLook {
  return LOOKS[id] ?? FALLBACK;
}
