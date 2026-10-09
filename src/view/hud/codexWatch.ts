/**
 * The codex's "met" marks: an enemy that walks the field, a toy that is offered or won. Entries the run already holds when the HUD is
 * built (a restored run) are marked at once. The marks are written to the player's guide progress (a sandbox run's lives in memory only).
 */
import type { Emitter } from '@/core/events';
import type { BattleApi, BattleEvents } from '@/game';
import type { GuideProgress } from '@/guide';

interface Watcher {
  battle: BattleApi;
  progress: GuideProgress;
  on<E extends object, K extends keyof E>(emitter: Emitter<E>, type: K, fn: (payload: E[K]) => void): void;
}

export function watchCodex(env: Watcher): void {
  const { battle, progress } = env;
  const events: Emitter<BattleEvents> = battle.events;
  for (const enemy of battle.enemies) progress.markMet(`foe:${enemy.id}`);
  for (const relic of battle.relics) progress.markMet(`toy:${relic}`);
  if (battle.pending?.kind === 'relic') for (const relic of battle.pending.options) progress.markMet(`toy:${relic}`);
  env.on(events, 'enemySpawn', ({ enemy }) => progress.markMet(`foe:${enemy.id}`));
  env.on(events, 'relicOffer', ({ options }) => {
    for (const relic of options) progress.markMet(`toy:${relic}`);
  });
  env.on(events, 'relicGain', ({ relic }) => progress.markMet(`toy:${relic}`));
}
