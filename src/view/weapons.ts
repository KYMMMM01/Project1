/**
 * What each of the twenty cats does with its weapon, as data: the body language of the attack (wind-up, release, follow-through),
 * the mark the swing leaves, the mark the blow leaves on the enemy, and whether the blow is heavy enough to stop the frame.
 * The field plays the poses and marks; the director reads `heavy`. Pure data, so the whole table is checked without a renderer.
 *
 * Time is counted from the release, the frame the simulation says the attack happens (the sound and the damage are on it).
 * The wind-up (the coil) is already shown by then: the cat coils in the `lead` seconds before the release, so the strike that
 * follows is short and the contact pose is on the frame of the sound, not behind it.
 */
import { mixColor } from '@/core/math';
import { Hue } from '@/fx/palette';
import { Color, TapeColors } from '@/ui/theme';
import type { UnitId } from '@/game/api';

/** One pose: along the attack direction (1 = 8 px), a turn toward the target in radians, a squash, and a hop up in px. */
export interface PoseKey {
  lunge: number;
  rot: number;
  sx: number;
  sy: number;
  rise: number;
}

export interface PoseSpec {
  /** Seconds before the release over which the cat coils into `coil`. */
  lead: number;
  coil: PoseKey;
  /** Seconds from the release to the contact pose, and from contact back to rest. */
  strike: number;
  hit: PoseKey;
  recover: number;
  /** A damped shiver of the turn after contact, in radians (a bowstring, a bell, a crackle). */
  twang: number;
}

/** The mark a swing leaves between the cat and its target. */
export type SwingMark = 'none' | 'arc' | 'chop' | 'line' | 'sweep';

/** The mark a blow leaves at the point of contact. */
export type ImpactMark = 'star' | 'slash' | 'line' | 'arrow' | 'splat' | 'scorch' | 'spark' | 'ring' | 'notes' | 'coin' | 'shatter';

export interface WeaponStyle {
  pose: PoseSpec;
  swing: SwingMark;
  impact: ImpactMark;
  /** How big the mark is (1 = a normal cat's), so a tiger's stomp is larger than a paw's tap. */
  weight: number;
  /** A blow that stops the frame for a moment and nudges the camera: a handful of cats, crits and bosses only. */
  heavy: boolean;
  /** Colour of the weapon's marks. */
  tint: number;
  /** Height of the arc a thrown shot flies in, px (0 = straight). */
  lob: number;
  /** What the weapon puffs out at the cat's end of the shot: the cork gun's smoke. */
  muzzle: 'none' | 'puff';
}

const key = (lunge: number, rot: number, sx: number, sy: number, rise: number): PoseKey => ({ lunge, rot, sx, sy, rise });

/** Convenient constructor: lead, coil, strike seconds, hit, recover seconds, twang. */
function pose(lead: number, coil: PoseKey, strike: number, hit: PoseKey, recover: number, twang = 0): PoseSpec {
  return { lead, coil, strike, hit, recover, twang };
}

const CREAM = Hue.cream;
const BLADE = mixColor(TapeColors.sky.mark, CREAM, 0.5);

/**
 * Why each cat moves as it does. A punch jabs straight and snaps back; a sword turns through an arc; an axe rises and slams
 * down with a landing squash; a katana crouches and darts one thin fast line; the polearm sweeps wide; a sling and a bow stretch
 * back and snap (the bow shivers); a shuriken is flung sidearm; the cork gun kicks the cat backwards; snowballs and fireballs are
 * lobbed with a hop; lightning stretches the cat tall and trembling; a bell shakes; a lute sways; a flask is shaken before it is
 * flung; a coin is flipped with a hop.
 */
const STYLES: Readonly<Record<UnitId, WeaponStyle>> = {
  w_paw: { pose: pose(0.08, key(-1.2, -0.06, 1.1, 0.9, 0), 0.04, key(2.4, 0.06, 0.92, 1.08, 0), 0.16), swing: 'none', impact: 'star', weight: 0.7, heavy: false, tint: Color.mustard, lob: 0, muzzle: 'none' },
  w_sword: { pose: pose(0.12, key(-0.5, -0.32, 1.08, 0.92, 0), 0.06, key(1.2, 0.42, 0.94, 1.06, 0), 0.22), swing: 'arc', impact: 'slash', weight: 1, heavy: false, tint: BLADE, lob: 0, muzzle: 'none' },
  w_viking: { pose: pose(0.18, key(-0.4, -0.28, 0.96, 1.1, 7), 0.07, key(1.4, 0.3, 1.12, 0.84, -2), 0.3, 0.03), swing: 'chop', impact: 'star', weight: 1.4, heavy: true, tint: Hue.ember, lob: 0, muzzle: 'none' },
  w_samurai: { pose: pose(0.16, key(-0.9, -0.04, 1.12, 0.84, 0), 0.03, key(3.2, 0.02, 0.86, 1.1, 0), 0.3), swing: 'line', impact: 'line', weight: 1, heavy: false, tint: BLADE, lob: 0, muzzle: 'none' },
  w_tiger: { pose: pose(0.16, key(-0.6, -0.5, 1.06, 0.94, 2), 0.08, key(1, 0.55, 0.9, 1.1, 0), 0.3), swing: 'sweep', impact: 'star', weight: 1.7, heavy: true, tint: Color.coral, lob: 0, muzzle: 'none' },
  r_sling: { pose: pose(0.13, key(-1.1, -0.04, 1.12, 0.9, 0), 0.035, key(0.5, 0.02, 0.92, 1.08, 0), 0.18, 0.04), swing: 'none', impact: 'star', weight: 0.6, heavy: false, tint: Color.kraft, lob: 0, muzzle: 'none' },
  r_archer: { pose: pose(0.16, key(-1.4, -0.04, 1.1, 0.92, 0), 0.035, key(0.5, 0.02, 0.92, 1.08, 0), 0.2, 0.07), swing: 'none', impact: 'arrow', weight: 1, heavy: false, tint: Color.leaf, lob: 0, muzzle: 'none' },
  r_ninja: { pose: pose(0.08, key(-0.4, -0.3, 1.04, 0.96, 3), 0.04, key(1.1, 0.38, 0.94, 1.06, 0), 0.16), swing: 'none', impact: 'spark', weight: 0.8, heavy: false, tint: Color.inkSoft, lob: 0, muzzle: 'none' },
  r_gunner: { pose: pose(0.08, key(0.3, 0.04, 0.96, 1.04, 0), 0.03, key(-2.6, -0.16, 1.1, 0.9, 2), 0.26), swing: 'none', impact: 'star', weight: 1.3, heavy: true, tint: Color.mustard, lob: 0, muzzle: 'puff' },
  r_star: { pose: pose(0.13, key(-1, -0.04, 1.1, 0.92, 0), 0.035, key(0.5, 0.02, 0.92, 1.08, 0), 0.2, 0.05), swing: 'none', impact: 'spark', weight: 1.1, heavy: false, tint: Hue.sun, lob: 0, muzzle: 'none' },
  m_snow: { pose: pose(0.12, key(-0.3, -0.2, 1.06, 0.92, 0), 0.05, key(0.6, 0.24, 0.94, 1.1, 5), 0.24), swing: 'none', impact: 'splat', weight: 1, heavy: false, tint: TapeColors.sky.base, lob: 34, muzzle: 'none' },
  m_fire: { pose: pose(0.12, key(-0.3, -0.2, 1.06, 0.92, 0), 0.05, key(0.6, 0.24, 0.94, 1.1, 5), 0.24), swing: 'none', impact: 'scorch', weight: 1.2, heavy: false, tint: Color.coral, lob: 30, muzzle: 'none' },
  m_storm: { pose: pose(0.12, key(0, 0, 0.96, 1.1, 6), 0.03, key(0, 0, 1.1, 0.92, 0), 0.3, 0.06), swing: 'none', impact: 'spark', weight: 1, heavy: false, tint: Color.mustard, lob: 0, muzzle: 'none' },
  m_frost: { pose: pose(0.14, key(-0.2, -0.1, 1, 1.06, 4), 0.08, key(0.4, 0.18, 0.96, 1.08, 8), 0.34), swing: 'none', impact: 'ring', weight: 1, heavy: false, tint: Hue.ice, lob: 0, muzzle: 'none' },
  m_cosmo: { pose: pose(0.14, key(-0.1, 0, 1.06, 0.94, 0), 0.06, key(0, 0, 1, 1.1, 6), 0.34, 0.03), swing: 'none', impact: 'ring', weight: 1.2, heavy: false, tint: mixColor(Color.inkSoft, Color.teal, 0.5), lob: 0, muzzle: 'none' },
  t_bell: { pose: pose(0.08, key(0, 0, 1.06, 0.92, 0), 0.04, key(0.3, 0, 0.96, 1.06, 6), 0.34, 0.12), swing: 'none', impact: 'ring', weight: 0.9, heavy: false, tint: Hue.sun, lob: 0, muzzle: 'none' },
  t_chef: { pose: pose(0.1, key(-0.5, -0.2, 1, 1, 2), 0.045, key(1.4, 0.34, 0.94, 1.06, 0), 0.2), swing: 'none', impact: 'star', weight: 0.9, heavy: false, tint: mixColor(Color.coral, Color.mustard, 0.6), lob: 14, muzzle: 'none' },
  t_bard: { pose: pose(0.09, key(-0.1, -0.1, 1, 1, 0), 0.05, key(0.4, 0.1, 1, 1, 4), 0.34, 0.09), swing: 'none', impact: 'notes', weight: 1, heavy: false, tint: Color.berry, lob: 0, muzzle: 'none' },
  t_alch: { pose: pose(0.12, key(-0.2, -0.1, 1.06, 0.9, 0), 0.05, key(0.6, 0.3, 0.94, 1.08, 6), 0.3, 0.08), swing: 'none', impact: 'shatter', weight: 1, heavy: false, tint: Color.leaf, lob: 0, muzzle: 'none' },
  t_lucky: { pose: pose(0.1, key(-0.1, 0, 1.04, 0.94, 0), 0.04, key(0.3, -0.2, 1, 1, 12), 0.34), swing: 'none', impact: 'coin', weight: 0.9, heavy: false, tint: Color.mustard, lob: 20, muzzle: 'none' },
};

export function weaponStyle(id: UnitId): WeaponStyle {
  return STYLES[id];
}

/** Every cat's style, for tests and the strip tools. */
export const WEAPON_IDS = Object.keys(STYLES) as UnitId[];

/** Seconds a release lasts: the strike plus the follow-through. */
export function releaseSeconds(spec: PoseSpec): number {
  return spec.strike + spec.recover;
}
