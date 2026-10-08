/**
 * Enemy stats and special rules (rules §11). `hpMult` is relative to the wave's cucumber health; the
 * wave's elite / boss gets its health from the BOSS_HP / ELITE_HP tables instead.
 */
import { ENEMY_IDS, type BossAbilityId, type EnemyDef, type EnemyId } from '../api';
import type { BossSpec, BossSpecById, EnemySpec } from './types';
import './strings';

function enemy(id: EnemyId, spec: Omit<EnemySpec, 'id' | 'nameKey' | 'descKey'>): EnemySpec {
  return { id, nameKey: `enemy.${id}.name`, descKey: `enemy.${id}.desc`, ...spec };
}

const BOSS_NOTE = 1; // placeholder multiple: boss health comes from the BOSS_HP / ELITE_HP tables

export const ENEMY_SPECS: Readonly<Record<EnemyId, EnemySpec>> = {
  cucumber: enemy('cucumber', { traits: [], hpMult: 1.0, speed: 70, armor: 0, ward: 0, radius: 18, bounty: 2 }),
  dust: enemy('dust', { traits: ['swarm'], hpMult: 0.4, speed: 85, armor: 0, ward: 0, radius: 12, bounty: 1 }),
  drop: enemy('drop', { traits: ['fast'], hpMult: 0.7, speed: 125, armor: 0, ward: 0, radius: 14, bounty: 2 }),
  roomba: enemy('roomba', { traits: ['armored'], hpMult: 3.0, speed: 48, armor: 0.35, ward: 0, radius: 24, bounty: 5 }),
  tangerine: enemy('tangerine', { traits: ['warded'], hpMult: 1.6, speed: 66, armor: 0, ward: 0.35, radius: 18, bounty: 3 }),
  balloon: enemy('balloon', {
    traits: ['split'], hpMult: 1.4, speed: 72, armor: 0, ward: 0, radius: 20, bounty: 2,
    split: { into: 'balloon_small', count: 2 },
  }),
  balloon_small: enemy('balloon_small', { traits: [], hpMult: 0.5, speed: 95, armor: 0, ward: 0, radius: 13, bounty: 1 }),
  clock: enemy('clock', {
    traits: ['haste_aura'], hpMult: 1.8, speed: 66, armor: 0, ward: 0, radius: 19, bounty: 4,
    aura: { kind: 'haste', radius: 120, value: 0.3 },
  }),
  pill: enemy('pill', {
    traits: ['heal_aura'], hpMult: 1.8, speed: 62, armor: 0, ward: 0, radius: 18, bounty: 4,
    aura: { kind: 'heal', radius: 120, value: 0.02 },
  }),
  cone: enemy('cone', {
    traits: ['shield'], hpMult: 1.2, speed: 68, armor: 0, ward: 0, radius: 20, bounty: 3,
    shield: 0.4,
  }),
  dryer: enemy('dryer', {
    traits: ['weaken'], hpMult: 2.2, speed: 60, armor: 0, ward: 0, radius: 21, bounty: 4,
    weakenPulse: { every: 5, duration: 3 },
  }),
  spray: enemy('spray', {
    traits: ['elite'], hpMult: 9, speed: 60, armor: 0.2, ward: 0.2, radius: 26, bounty: 15,
    hazardPulse: { kind: 'wet', every: 6, duration: 3, cells: 1 },
  }),
  firecracker: enemy('firecracker', {
    traits: ['elite'], hpMult: 7, speed: 78, armor: 0, ward: 0, radius: 22, bounty: 15,
    deathBurst: { radius: 150, haste: 0.5, duration: 2 },
  }),
  boss_cucumber: enemy('boss_cucumber', {
    traits: ['elite'], hpMult: BOSS_NOTE, speed: 46, armor: 0.15, ward: 0, radius: 32, bounty: 25, ability: 'enrage',
  }),
  boss_vacuum: enemy('boss_vacuum', {
    traits: ['boss'], hpMult: BOSS_NOTE, speed: 40, armor: 0.35, ward: 0.1, radius: 38, bounty: 60, ability: 'inhale',
  }),
  boss_blender: enemy('boss_blender', {
    traits: ['boss'], hpMult: BOSS_NOTE, speed: 42, armor: 0.3, ward: 0.1, radius: 36, bounty: 60, ability: 'whirl',
  }),
  boss_bath: enemy('boss_bath', {
    traits: ['boss'], hpMult: BOSS_NOTE, speed: 38, armor: 0.3, ward: 0.15, radius: 40, bounty: 60, ability: 'splash',
  }),
  boss_cloud: enemy('boss_cloud', {
    traits: ['boss'], hpMult: BOSS_NOTE, speed: 40, armor: 0.1, ward: 0.35, radius: 38, bounty: 60, ability: 'lightning',
  }),
  boss_needle: enemy('boss_needle', {
    traits: ['boss'], hpMult: BOSS_NOTE, speed: 40, armor: 0.2, ward: 0.25, radius: 34, bounty: 60, ability: 'vaccinate',
  }),
};

/** Boss ability numbers (rules §11). Cooldowns are multiplied by ENRAGE_COOLDOWN_MULT once enraged. */
export const BOSS_SPECS: Readonly<{ [K in BossAbilityId]: BossSpecById<K> }> = {
  enrage: { id: 'enrage', maxBonus: 0.6 },
  inhale: { id: 'inhale', cooldown: 12, duration: 3, damageTaken: 0.5 },
  whirl: { id: 'whirl', cooldown: 10, duration: 4, speed: 0.4 },
  splash: {
    id: 'splash', spawnEvery: 5, spawnCount: 3, spawn: 'drop', soakEvery: 10, soakCells: 2, soakDuration: 2.5,
  },
  lightning: { id: 'lightning', cooldown: 9, duration: 2.5 },
  vaccinate: { id: 'vaccinate', cooldown: 11, duration: 5, regen: 0.01 },
};

export function enemyDef(id: EnemyId): EnemyDef {
  return ENEMY_SPECS[id];
}

export function enemySpec(id: EnemyId): EnemySpec {
  return ENEMY_SPECS[id];
}

export function allEnemyDefs(): EnemyDef[] {
  return ENEMY_IDS.map((id) => ENEMY_SPECS[id]);
}

export function bossSpec(id: BossAbilityId): BossSpec {
  return BOSS_SPECS[id];
}

/** Health multiple including the children a splitting enemy leaves behind (used for wave budgets). */
export function budgetMult(id: EnemyId): number {
  const spec = ENEMY_SPECS[id];
  return spec.split ? spec.hpMult + spec.split.count * ENEMY_SPECS[spec.split.into].hpMult : spec.hpMult;
}

/** True for the elites and bosses that can serve as a wave's time-limited target. */
export function isWaveTarget(id: EnemyId): boolean {
  return id.startsWith('boss_') || id === 'spray' || id === 'firecracker';
}
