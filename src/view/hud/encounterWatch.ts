/**
 * Which moments of a real run ask for a first-encounter card (the topics themselves are chosen in encounters.ts): the first time the enemy count climbs, the first merge, an act ending,
 * special cells, a cell hazard, an enemy trait in the next wave's preview, an elite or a boss arriving, a class upgrade within
 * reach, and the run's own rules (butler level, daily challenge, endless). Hints.request ignores whatever the player has already
 * been taught, so each card comes once in a lifetime. The controls that ask for their own card (summon grade, call wave, speed,
 * purr, toys, molt, sell, awaken, the laser) do it where they live.
 */
import type { Container } from 'pixi.js';
import { CLASS_IDS, unitRarityIndex, type EnemyState } from '@/game';
import type { EnvImpl } from './env';
import { arrivalTopics, runTopic, traitTopicsOf } from './encounters';

export interface EncounterTargets {
  /** The enemy count strip. */
  gauge: Container;
  /** The wave label (a general-purpose point for rules that have no control of their own). */
  waveLabel: Container;
  previewLayer: Container;
  /** The elite / boss strip. */
  boss: Container;
  chips: Container;
  /** The playfield's floor: special cells and hazards are drawn on it. */
  floor: Container;
}

export function watchEncounters(env: EnvImpl, at: EncounterTargets): void {
  const b = env.battle;
  const ask = env.hints;

  const rule = runTopic(b.init.mode, b.init.stake);
  if (rule) ask.request(rule, at.waveLabel);

  env.on(b.events, 'danger', ({ level }) => {
    if (level >= 1) ask.request('lose_gauge', at.gauge);
  });
  env.on(b.events, 'merge', () => ask.request('classes', at.chips));
  env.on(b.events, 'actClear', () => ask.request('acts', at.waveLabel));
  env.on(b.events, 'hazardWarn', () => ask.request('hazards', at.floor));
  env.on(b.events, 'waveStart', ({ wave }) => {
    if (b.sunbeams.length > 0) ask.request('sun', at.floor);
    for (const topic of traitTopicsOf(b.previewWave().map((e) => e.enemy))) ask.request(topic, at.previewLayer);
    // A class upgrade is within reach: the sheet that sells it is behind a chip.
    if (wave >= 3) {
      let cheapest = -1;
      for (const c of CLASS_IDS) {
        const cost = b.classUpgradeCost(c);
        if (cost >= 0 && (cheapest < 0 || cost < cheapest)) cheapest = cost;
      }
      if (cheapest >= 0 && b.fish >= cheapest) ask.request('class_upgrade', at.chips);
    }
  });
  // The first king on the board: the card points at the cat itself, once its sticker has popped in.
  const king = (): void => {
    for (const u of b.units) {
      if (!u || unitRarityIndex(u.id) !== 3) continue;
      const view = env.ctx.unitView(u.uid);
      // The card is about the cat that has just arrived, and the player can act on it now: it does not wait behind the others.
      if (view) ask.request('awaken', view, false, true);
      return;
    }
  };
  for (const type of ['summon', 'merge', 'molt'] as const) env.on(b.events, type, () => env.ctx.ui.call(0.9, king));
  env.on(b.events, 'enemySpawn', ({ enemy }: { enemy: EnemyState }) => {
    // The elite or boss of the wave: the rule first, then the boss's own trick. The first card goes to the front of the line.
    if (b.boss !== enemy) return;
    arrivalTopics(enemy.id, b.waveKind).forEach((topic, i) => ask.request(topic, at.boss, false, i === 0));
  });
}
