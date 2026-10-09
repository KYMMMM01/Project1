/**
 * The gold dungeon's wave script: a short run of normal waves that get richer toward the end. It has
 * no elite or boss, so there is no boss timer; each wave ends on the wave clock (15 s), which is also
 * the hard limit of the whole run. The acts end on the wave clock too (see `endNormalWave`).
 * What the run pays is the meta layer's business (docs/명세_메타.md section 11).
 */
import type { EnemyId } from '../api';
import { WAVE_BUDGET } from './balance';
import { enemySpec } from './enemies';
import { actOf, waveEntries, type WaveGroup, type WaveScript } from './waves';

/** Two acts of four waves; the second act's end is the victory. */
export const GOLD_DUNGEON_WAVES = 8;

interface GoldWave {
  /** Share of the normal wave budget. */
  scale: number;
  groups: readonly WaveGroup[];
}

const g = (enemy: EnemyId, weight: number): WaveGroup => ({ enemy, weight });

/**
 * Swarms of small, quick enemies (many kills for the health they hold), a splitter or two, and one
 * armoured or one warded enemy at most per wave, so a board of any class has a counter in reach.
 */
const WAVES: readonly GoldWave[] = [
  { scale: 0.8, groups: [g('dust', 3), g('cucumber', 1)] },
  { scale: 0.9, groups: [g('dust', 3), g('drop', 2)] },
  { scale: 1.0, groups: [g('balloon', 2), g('dust', 2), g('cucumber', 1)] },
  { scale: 1.1, groups: [g('dust', 3), g('drop', 2), g('tangerine', 1)] },
  { scale: 1.2, groups: [g('cucumber', 2), g('dust', 3), g('balloon', 2)] },
  { scale: 1.3, groups: [g('drop', 3), g('dust', 3), g('cone', 1)] },
  { scale: 1.4, groups: [g('balloon', 3), g('dust', 3), g('drop', 2)] },
  { scale: 1.5, groups: [g('dust', 4), g('balloon', 3), g('drop', 2), g('roomba', 1)] },
];

/** The script of `wave` (1..GOLD_DUNGEON_WAVES; anything else is clamped). Every wave is a normal wave. */
export function goldDungeonScript(wave: number): WaveScript {
  const n = Math.min(Math.max(Math.floor(wave), 1), GOLD_DUNGEON_WAVES);
  const w = WAVES[n - 1] as GoldWave;
  return { wave: n, act: actOf(n), kind: 'normal', boss: null, groups: w.groups.map((x) => ({ ...x })), budget: WAVE_BUDGET * w.scale };
}

/** Enemies a whole run spawns, the pieces of the splitters included: the most kills a run can have. */
export function goldDungeonSpawns(): number {
  let n = 0;
  for (let wave = 1; wave <= GOLD_DUNGEON_WAVES; wave++) {
    for (const e of waveEntries(goldDungeonScript(wave))) n += e.count * (1 + (enemySpec(e.enemy).split?.count ?? 0));
  }
  return n;
}
