/** Which shape each unit fires and how it flies. Pure data, so it can be checked without a renderer. */
import { mixColor } from '@/core/math';
import { Color, TapeColors } from '@/ui';
import type { UnitId } from '@/game/api';

export type ProjectileShape =
  | 'pebble' | 'arrow' | 'shuriken' | 'cork' | 'starArrow' | 'snowball' | 'fireball'
  | 'bell' | 'ladle' | 'note' | 'flask' | 'coin' | 'orb';

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
  /** Drawn this many times its baked size: a shot has to read at the size of a cat on a phone. */
  scale: number;
  /** Height of the arc the shot is lobbed in, px (0 = it flies straight). The simulation's path is straight; the arc is drawn on top. */
  lob: number;
}

/** Trails are the shot's own paper colour, pale, so they read as a swipe of paint on the floor. */
const PALE = (c: number): number => mixColor(c, Color.paperLight, 0.45);

const LOOKS: Partial<Record<UnitId, ProjectileLook>> = {
  // A pebble tumbles; an arrow flies point first with a long thin swipe; a shuriken spins fast; a cork is a fat quick slug; a star arrow leaves a wide trail.
  r_sling: { shape: 'pebble', size: 22, spin: 9, trail: Color.paperDim, trailLength: 26, flip: false, oriented: false, scale: 1.5, lob: 0 },
  r_archer: { shape: 'arrow', size: 52, spin: 0, trail: Color.paperLight, trailLength: 34, flip: false, oriented: true, scale: 1.25, lob: 0 },
  r_ninja: { shape: 'shuriken', size: 34, spin: 30, trail: Color.paperDim, trailLength: 26, flip: false, oriented: false, scale: 1.3, lob: 0 },
  r_gunner: { shape: 'cork', size: 34, spin: 0, trail: PALE(Color.mustard), trailLength: 70, flip: false, oriented: true, scale: 1.4, lob: 0 },
  r_star: { shape: 'starArrow', size: 38, spin: 0, trail: PALE(Color.mustard), trailLength: 96, flip: false, oriented: false, scale: 1.3, lob: 0 },
  // Snowballs, fireballs, ladles and coins are thrown: they rise and fall on the way.
  m_snow: { shape: 'snowball', size: 30, spin: 6, trail: TapeColors.sky.mark, trailLength: 26, flip: false, oriented: false, scale: 1.4, lob: 34 },
  m_fire: { shape: 'fireball', size: 34, spin: 0, trail: PALE(Color.coral), trailLength: 60, flip: false, oriented: true, scale: 1.4, lob: 30 },
  t_bell: { shape: 'bell', size: 32, spin: 0, trail: PALE(Color.mustard), trailLength: 20, flip: false, oriented: false, scale: 1.3, lob: 0 },
  t_chef: { shape: 'ladle', size: 46, spin: 14, trail: Color.paperLight, trailLength: 20, flip: false, oriented: false, scale: 1.2, lob: 14 },
  t_bard: { shape: 'note', size: 36, spin: 0, trail: PALE(Color.berry), trailLength: 26, flip: false, oriented: false, scale: 1.3, lob: 0 },
  t_alch: { shape: 'flask', size: 34, spin: 8, trail: PALE(Color.leaf), trailLength: 24, flip: false, oriented: false, scale: 1.3, lob: 0 },
  t_lucky: { shape: 'coin', size: 30, spin: 0, trail: PALE(Color.mustard), trailLength: 32, flip: true, oriented: false, scale: 1.3, lob: 20 },
};

const FALLBACK: ProjectileLook = { shape: 'orb', size: 20, spin: 0, trail: Color.paperLight, trailLength: 28, flip: false, oriented: false, scale: 1.2, lob: 0 };

export function projectileLook(id: UnitId): ProjectileLook {
  return LOOKS[id] ?? FALLBACK;
}
