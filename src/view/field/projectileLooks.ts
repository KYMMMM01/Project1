/** Which shape each unit fires and how it flies. Pure data, so it can be checked without a renderer. */
import { mixColor } from '@/core/math';
import { Color, TapeColors } from '@/ui';
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
  /** Colour of the flat streak trailing behind, or 0 for none. */
  trail: number;
  /** Trail length in px. */
  trailLength: number;
  /** Flip the coin edge-on and back (the coin only). */
  flip: boolean;
  /** Turn the shape to point along its flight; upright shapes (bell, note, coin) stay level. */
  oriented: boolean;
}

/** Trails are the shot's own paper colour, pale, so they read as a swipe of paint on the floor. */
const PALE = (c: number): number => mixColor(c, Color.paperLight, 0.45);

const LOOKS: Partial<Record<UnitId, ProjectileLook>> = {
  r_sling: { shape: 'pebble', size: 18, spin: 9, trail: Color.paperDim, trailLength: 22, flip: false, oriented: false },
  r_archer: { shape: 'arrow', size: 44, spin: 0, trail: Color.paperLight, trailLength: 26, flip: false, oriented: true },
  r_ninja: { shape: 'shuriken', size: 28, spin: 26, trail: Color.paperDim, trailLength: 24, flip: false, oriented: false },
  r_gunner: { shape: 'bullet', size: 28, spin: 0, trail: PALE(Color.mustard), trailLength: 70, flip: false, oriented: true },
  r_star: { shape: 'starArrow', size: 30, spin: 0, trail: PALE(Color.mustard), trailLength: 96, flip: false, oriented: false },
  m_snow: { shape: 'snowball', size: 24, spin: 6, trail: TapeColors.sky.mark, trailLength: 26, flip: false, oriented: false },
  m_fire: { shape: 'fireball', size: 24, spin: 0, trail: PALE(Color.coral), trailLength: 54, flip: false, oriented: false },
  t_bell: { shape: 'bell', size: 26, spin: 0, trail: PALE(Color.mustard), trailLength: 20, flip: false, oriented: false },
  t_chef: { shape: 'bone', size: 44, spin: 12, trail: Color.paperLight, trailLength: 20, flip: false, oriented: false },
  t_bard: { shape: 'note', size: 30, spin: 0, trail: PALE(Color.berry), trailLength: 26, flip: false, oriented: false },
  t_alch: { shape: 'flask', size: 28, spin: 8, trail: PALE(Color.leaf), trailLength: 24, flip: false, oriented: false },
  t_lucky: { shape: 'coin', size: 24, spin: 0, trail: PALE(Color.mustard), trailLength: 32, flip: true, oriented: false },
};

const FALLBACK: ProjectileLook = { shape: 'orb', size: 20, spin: 0, trail: Color.paperLight, trailLength: 28, flip: false, oriented: false };

export function projectileLook(id: UnitId): ProjectileLook {
  return LOOKS[id] ?? FALLBACK;
}
