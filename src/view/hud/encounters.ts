/**
 * First-encounter lessons: which guide topic a thing the player meets in a real run belongs to. Pure; the wiring (which event asks
 * for which card, and what the card points at) is in encounterWatch.ts. The tutorial run teaches its own topics itself.
 */
import type { BattleMode, EnemyId, EnemyTrait, WaveKind } from '@/game';
import { enemyDef, isWaveTarget } from '@/game';
import { isTopicId, type TopicId } from '@/guide';

/** The guide topic of an enemy trait (the elite and boss traits have their own topics). */
export function traitTopic(trait: EnemyTrait): TopicId | null {
  const id = `trait_${trait}`;
  return isTopicId(id) ? id : null;
}

/** The trait topics of a list of enemies, each once, in the order the enemies come. */
export function traitTopicsOf(enemies: readonly EnemyId[]): TopicId[] {
  const out: TopicId[] = [];
  for (const e of enemies) {
    for (const trait of enemyDef(e).traits) {
      const topic = traitTopic(trait);
      if (topic && !out.includes(topic)) out.push(topic);
    }
  }
  return out;
}

/** The topic of a chapter boss by its id (`boss_vacuum`, ...), or null for an elite or an escort. */
export function bossTopicOf(enemy: EnemyId): TopicId | null {
  return enemy.startsWith('boss_') && isTopicId(enemy) ? enemy : null;
}

/** What a boss or an elite arriving teaches, in the order the cards come: the elite or boss rule, then the boss's own trick. */
export function arrivalTopics(enemy: EnemyId, waveKind: 'normal' | 'elite' | 'boss'): TopicId[] {
  const out: TopicId[] = [];
  if (waveKind === 'elite') out.push('elite');
  else if (waveKind === 'boss') out.push('boss');
  const own = bossTopicOf(enemy);
  if (own) out.push(own);
  return out;
}

/**
 * The cards an enemy that has just spawned asks for: those of the wave's elite or boss, none for anyone else. The simulation announces the
 * spawn before it names the enemy as the wave's `boss`, so the question is put to the enemy and the kind of wave, never to `battle.boss`.
 */
export function spawnTopics(enemy: EnemyId, waveKind: WaveKind): TopicId[] {
  if (waveKind === 'normal' || !isWaveTarget(enemy)) return [];
  return arrivalTopics(enemy, waveKind);
}

/** The topic a run's own rules open with (a butler level, the daily challenge, endless mode), or null for a plain chapter run. */
export function runTopic(mode: BattleMode, stake: number): TopicId | null {
  if (mode === 'daily') return 'daily_challenge';
  if (mode === 'endless') return 'endless';
  if (mode === 'chapter' && stake > 0) return 'stakes';
  return null;
}
