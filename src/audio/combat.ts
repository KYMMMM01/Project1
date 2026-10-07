/**
 * What the fight sounds like, as small typed lookups: which sound a cat's attack and its landing make, what an enemy is made of
 * and so how it answers a hit and how it dies. The director asks these tables instead of keeping its own, so the pairing of
 * a unit or an enemy with its sounds lives in exactly one place. Every cue is a frozen object made once at load: asking for one
 * allocates nothing, which matters at dozens of hits a second.
 */
import { ENEMY_IDS, UNIT_IDS, type EnemyId, type UnitId } from '@/game/api';
import type { SfxId } from './api';

/** A sound and the level and pitch it is meant to be played at (the director may scale the volume). */
export interface CombatCue {
  readonly id: SfxId;
  readonly volume: number;
  readonly pitch: number;
}

function cue(id: SfxId, volume: number, pitch = 1): CombatCue {
  return Object.freeze({ id, volume, pitch });
}

/** Levels of the pair: a release is the lighter half, an impact the louder (the recipes are normalised per loudness family). */
const RELEASE_VOLUME = 0.75;
const IMPACT_VOLUME = 0.8;

const RELEASE = {} as Record<UnitId, CombatCue>;
const IMPACT = {} as Record<UnitId, CombatCue>;
for (const id of UNIT_IDS) {
  RELEASE[id] = cue(`atk_${id}`, RELEASE_VOLUME);
  IMPACT[id] = cue(`imp_${id}`, IMPACT_VOLUME);
}

/** The sound of a hit that no cat's weapon caused (a relic): the plain thwack. */
const PLAIN_HIT = cue('hit_light', 0.6);

/**
 * The crit layer is one recipe for every cat (a crit is the same weapon with more), tilted by class: a warrior's crack sits a little
 * lower, a ranger's and a mage's brighter, a trickster's is as recorded.
 */
const CRIT_TILT = { w: 0.92, r: 1.08, m: 1.25, t: 1 } as const;
const CRIT = {} as Record<UnitId, CombatCue>;
for (const id of UNIT_IDS) CRIT[id] = cue('crit', 0.65, CRIT_TILT[id.charAt(0) as keyof typeof CRIT_TILT]);
const PLAIN_CRIT = cue('crit', 0.65);

/** The sound the cat's attack makes as it leaves (the "release"): a swish, a twang, a pop. */
export function attackSfx(unit: UnitId): CombatCue {
  return RELEASE[unit];
}

/** The sound of that same weapon landing on an enemy. A hit with no cat behind it (null) is the plain thwack. */
export function impactSfx(unit: UnitId | null): CombatCue {
  return unit ? IMPACT[unit] : PLAIN_HIT;
}

/** The bright layer a crit adds on top of the weapon's impact. */
export function critSfx(unit: UnitId | null): CombatCue {
  return unit ? CRIT[unit] : PLAIN_CRIT;
}

/** What an enemy is made of: the recipe of its hit reaction, the recipe of its death and the pitch of the hit (big and heavy things sound lower). */
interface Material {
  hit: SfxId;
  die: SfxId;
  pitch: number;
}

const MATERIALS: Record<EnemyId, Material> = {
  cucumber: { hit: 'foe_juicy_hit', die: 'foe_juicy_die', pitch: 1 },
  tangerine: { hit: 'foe_juicy_hit', die: 'foe_juicy_die', pitch: 1.25 },
  dust: { hit: 'foe_fluff_hit', die: 'foe_fluff_die', pitch: 1 },
  drop: { hit: 'foe_water_hit', die: 'foe_water_die', pitch: 1 },
  roomba: { hit: 'foe_motor_hit', die: 'foe_motor_die', pitch: 1 },
  balloon: { hit: 'foe_rubber_hit', die: 'foe_rubber_die', pitch: 1 },
  balloon_small: { hit: 'foe_rubber_hit', die: 'foe_rubber_die', pitch: 1.4 },
  clock: { hit: 'foe_tin_hit', die: 'foe_tin_die', pitch: 1 },
  pill: { hit: 'foe_plastic_hit', die: 'foe_plastic_die', pitch: 1.4 },
  cone: { hit: 'foe_plastic_hit', die: 'foe_plastic_die', pitch: 0.85 },
  dryer: { hit: 'foe_plastic_hit', die: 'foe_plastic_die', pitch: 0.75 },
  spray: { hit: 'foe_plastic_hit', die: 'foe_plastic_die', pitch: 1.1 },
  firecracker: { hit: 'foe_paper_hit', die: 'foe_paper_die', pitch: 1 },
  boss_cucumber: { hit: 'foe_juicy_hit', die: 'foe_boss_cucumber', pitch: 0.7 },
  boss_vacuum: { hit: 'foe_motor_hit', die: 'foe_boss_vacuum', pitch: 0.7 },
  boss_blender: { hit: 'foe_glass_hit', die: 'foe_boss_blender', pitch: 0.65 },
  boss_bath: { hit: 'foe_water_hit', die: 'foe_boss_bath', pitch: 0.6 },
  boss_cloud: { hit: 'foe_cloud_hit', die: 'foe_boss_cloud', pitch: 1 },
  boss_needle: { hit: 'foe_glass_hit', die: 'foe_boss_needle', pitch: 0.9 },
};

const FOE_HIT_VOLUME = 0.65;
const FOE_DIE_VOLUME = 0.8;
/** A boss answers louder: its hit is heard through the fight and its death is the finale. */
const BOSS_VOLUME = 1;

const FOE_HIT = {} as Record<EnemyId, CombatCue>;
const FOE_DIE = {} as Record<EnemyId, CombatCue>;
for (const id of ENEMY_IDS) {
  const m = MATERIALS[id];
  const boss = id.startsWith('boss_');
  FOE_HIT[id] = cue(m.hit, boss ? BOSS_VOLUME : FOE_HIT_VOLUME, m.pitch);
  FOE_DIE[id] = cue(m.die, boss ? BOSS_VOLUME : FOE_DIE_VOLUME, boss ? 1 : m.pitch);
}

/** How an enemy answers a hit, by what it is made of. */
export function foeHitSfx(enemy: EnemyId): CombatCue {
  return FOE_HIT[enemy];
}

/** How an enemy dies; a boss has a long death of its own. */
export function foeDieSfx(enemy: EnemyId): CombatCue {
  return FOE_DIE[enemy];
}
