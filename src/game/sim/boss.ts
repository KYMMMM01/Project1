/** Boss abilities (rules §11). Cooldowns shrink to 70% once the boss is enraged. */
import { BOSS_SPECS } from '../data/enemies';
import { ENRAGE_COOLDOWN_MULT, TICK } from '../data/balance';
import { spawnEnemy } from './enemies';
import { pickHazardBlock, pickHazardCells, scheduleHazard, weakenAll } from './hazards';
import type { Sim } from './sim';
import { ST_SLOW, type SimEnemy } from './types';

/** First use comes this fraction of a cooldown after the boss appears, so the opening is not instant. */
const FIRST_USE = 0.6;

export function startBoss(s: Sim, boss: SimEnemy): void {
  const now = s.time;
  switch (boss.spec.ability) {
    case 'inhale': s.abilityAt = now + BOSS_SPECS.inhale.cooldown * FIRST_USE; break;
    case 'whirl': s.abilityAt = now + BOSS_SPECS.whirl.cooldown * FIRST_USE; break;
    case 'splash':
      s.abilityAt = now + BOSS_SPECS.splash.spawnEvery * FIRST_USE;
      s.abilityAt2 = now + BOSS_SPECS.splash.soakEvery * FIRST_USE;
      break;
    case 'lightning': s.abilityAt = now + BOSS_SPECS.lightning.cooldown * FIRST_USE; break;
    case 'vaccinate': s.abilityAt = now + BOSS_SPECS.vaccinate.cooldown * FIRST_USE; break;
    default: break;
  }
}

function announce(s: Sim, boss: SimEnemy, duration: number): void {
  const ability = boss.spec.ability;
  if (ability && s.ev.has('bossAbility')) s.ev.emit('bossAbility', { enemy: boss, ability, duration });
}

export function updateBoss(s: Sim): void {
  const boss = s.boss;
  if (!boss || boss.dead) return;
  const now = s.time;
  const rage = boss.enraged ? ENRAGE_COOLDOWN_MULT : 1;
  switch (boss.spec.ability) {
    case 'inhale': {
      if (now < s.abilityAt) return;
      const spec = BOSS_SPECS.inhale;
      s.inhaleUntil = now + spec.duration;
      s.inhaleTaken = spec.damageTaken;
      weakenAll(s, spec.duration, boss);
      announce(s, boss, spec.duration);
      s.abilityAt = now + spec.cooldown * rage;
      return;
    }
    case 'whirl': {
      if (now < s.abilityAt) return;
      const spec = BOSS_SPECS.whirl;
      s.whirlUntil = now + spec.duration;
      s.whirlSpeed = spec.speed;
      announce(s, boss, spec.duration);
      s.abilityAt = now + spec.cooldown * rage;
      return;
    }
    case 'splash': {
      const spec = BOSS_SPECS.splash;
      if (now >= s.abilityAt) {
        for (let i = 0; i < spec.spawnCount; i++) spawnEnemy(s, spec.spawn, Math.max(0, boss.travelled - 18 * i), s.baseHp(), false);
        announce(s, boss, 0);
        s.abilityAt = now + spec.spawnEvery * rage;
      }
      if (now >= s.abilityAt2) {
        scheduleHazard(s, 'wet', pickHazardCells(s, spec.soakCells), spec.soakDuration);
        announce(s, boss, spec.soakDuration);
        s.abilityAt2 = now + spec.soakEvery * rage;
      }
      return;
    }
    case 'lightning': {
      if (now < s.abilityAt) return;
      const spec = BOSS_SPECS.lightning;
      scheduleHazard(s, 'zap', pickHazardBlock(s), spec.duration);
      announce(s, boss, spec.duration);
      s.abilityAt = now + spec.cooldown * rage;
      return;
    }
    case 'vaccinate': {
      const spec = BOSS_SPECS.vaccinate;
      if (now >= s.abilityAt) {
        s.vaccinateUntil = now + spec.duration;
        for (const e of s.enemies) {
          if (e.mask & ST_SLOW) {
            e.slow = 0;
            e.mask &= ~ST_SLOW;
          }
        }
        announce(s, boss, spec.duration);
        s.abilityAt = now + spec.cooldown * rage;
      }
      if (s.vaccinateUntil > now) boss.hp = Math.min(boss.maxHp, boss.hp + boss.maxHp * spec.regen * TICK);
      return;
    }
    default:
      return;
  }
}
