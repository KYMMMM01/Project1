/**
 * Hand-authored wave scripts: 24 waves for each of the 5 chapters (6 acts of 4 waves). The tutorial,
 * the daily challenge and endless mode reuse these scripts (see `scriptFor`).
 *
 * Notation: `enemy:weight ...` is the share of the wave's health budget each enemy gets;
 * `boss | enemy:weight ...` is an elite / boss wave with its escort mix. A leading `@1.2` scales the
 * wave's budget. Composition principles (rules §11): every act introduces at most one or two new
 * enemies, a normal wave never needs both a physical and a magic counter, and a swarm wave is
 * followed by a breather.
 */
import { ENEMY_IDS, type EnemyId, type EnemyTrait, type WaveKind, type WavePreviewEntry } from '../api';
import { ACT_LENGTH, CHAPTER_COUNT, CHAPTER_WAVES, ESCORT_BUDGET_BOSS, ESCORT_BUDGET_ELITE, WAVE_BUDGET } from './balance';
import { budgetMult, enemySpec } from './enemies';

export interface WaveGroup {
  enemy: EnemyId;
  weight: number;
}

export interface WaveScript {
  /** 1-based wave number within the chapter. */
  wave: number;
  act: number;
  kind: WaveKind;
  /** Elite or boss that ends the wave when defeated. */
  boss: EnemyId | null;
  /** The wave's enemies (normal wave) or the escort that walks with the boss. */
  groups: WaveGroup[];
  /** Health budget in cucumbers for `groups`. */
  budget: number;
}

const CH1 = [
  '@0.5 cucumber', '@0.7 cucumber:3 dust:2', '@0.85 cucumber:5 dust:1', 'boss_cucumber | cucumber:4 dust:1',
  'cucumber:2 drop:3', 'cucumber:3 roomba:2', 'cucumber:3 drop:2 dust:1', 'boss_vacuum | cucumber:3 roomba:1',
  'cucumber:2 tangerine:3', 'cucumber:3 balloon:2', 'dust:3 drop:2 cucumber:1', 'firecracker | cucumber:3 drop:1',
  'cucumber:2 clock:3', 'cucumber:2 cone:3', 'balloon:2 clock:1 cucumber:2', 'boss_vacuum | cone:2 cucumber:2',
  'cucumber:2 pill:3', 'cucumber:2 dryer:3', 'roomba:3 pill:1 cucumber:1', 'boss_cucumber | dust:2 cucumber:2 clock:1',
  'tangerine:2 clock:1 cone:1 cucumber:1', 'dust:3 balloon:2 pill:1', 'roomba:3 dryer:2 cucumber:1',
  'boss_vacuum | roomba:2 tangerine:2 clock:1',
];

const CH2 = [
  '@0.5 cucumber:4 drop:1', '@0.7 cucumber:2 drop:3', '@0.85 cucumber:4 dust:1', 'boss_cucumber | cucumber:3 drop:2',
  'tangerine:3 cucumber:2', 'dust:3 cucumber:2', 'tangerine:2 drop:2 cucumber:1', 'boss_blender | cucumber:3 tangerine:1',
  'roomba:3 cucumber:2', 'clock:3 cucumber:2', 'roomba:2 clock:1 cucumber:2', 'firecracker | drop:2 cucumber:2',
  'balloon:3 cucumber:2', 'cone:3 cucumber:2', 'balloon:2 dust:2 cucumber:1', 'boss_blender | clock:1 cucumber:3',
  'pill:3 cucumber:2', 'dryer:3 cucumber:2', 'tangerine:3 pill:1 cucumber:1', 'boss_cucumber | dryer:1 cucumber:3 drop:2',
  'roomba:3 drop:2', 'dust:4 clock:1 cucumber:1', 'tangerine:2 cone:2 dryer:1',
  'boss_blender | roomba:2 balloon:2 pill:1',
];

const CH3 = [
  '@0.5 cucumber:3 drop:2', '@0.7 drop:3 dust:2', '@0.85 cucumber:4 dust:1', 'boss_cucumber | drop:2 cucumber:3',
  'cone:3 cucumber:2', 'balloon:3 cucumber:2', 'cone:2 drop:2 cucumber:1', 'boss_bath | cucumber:3 drop:2',
  'roomba:3 cucumber:2', 'tangerine:3 cucumber:2', 'dust:3 drop:2 cucumber:1', 'spray | cucumber:3 balloon:1',
  'clock:3 cucumber:2', 'pill:3 cucumber:2', 'roomba:2 clock:1 cucumber:2', 'boss_bath | cone:2 cucumber:2 drop:1',
  'dryer:3 cucumber:2', 'balloon:3 pill:1 cucumber:1', 'tangerine:3 clock:1 cucumber:1', 'spray | dust:2 cucumber:2 cone:1',
  'roomba:3 dryer:2', 'dust:3 drop:2 balloon:1', 'cone:2 tangerine:2 pill:1', 'boss_bath | roomba:2 clock:1 dust:2',
];

const CH4 = [
  '@0.5 cucumber:4 balloon:1', '@0.7 balloon:3 cucumber:2', '@0.85 cucumber:4 dust:1', 'boss_cucumber | balloon:2 cucumber:3',
  'roomba:3 cucumber:2', 'drop:3 cucumber:2', 'dust:3 roomba:2', 'boss_cloud | cucumber:3 drop:1',
  'tangerine:3 cucumber:2', 'clock:3 cucumber:2', 'tangerine:2 clock:1 cucumber:2', 'firecracker | cucumber:2 dust:2',
  'cone:3 cucumber:2', 'pill:3 cucumber:2', 'cone:2 drop:2 cucumber:1', 'boss_cloud | balloon:2 cucumber:2',
  'dryer:3 cucumber:2', 'dust:3 balloon:2 cucumber:1', 'roomba:3 pill:1 cucumber:1', 'spray | tangerine:1 cucumber:3',
  'roomba:3 clock:1 cucumber:1', 'dust:3 drop:2 pill:1', 'tangerine:2 cone:2 dryer:1',
  'boss_cloud | roomba:2 balloon:2 clock:1',
];

const CH5 = [
  '@0.5 cucumber:3 cone:2', '@0.7 cone:3 cucumber:2', '@0.85 cucumber:4 dust:1', 'boss_cucumber | cone:2 cucumber:3',
  'pill:3 cucumber:2', 'dust:3 cucumber:2', 'pill:2 cone:2 cucumber:1', 'boss_needle | cucumber:3 cone:1',
  'roomba:3 cucumber:2', 'tangerine:3 cucumber:2', 'dust:3 pill:1 cucumber:1', 'firecracker | cone:2 cucumber:2',
  'balloon:3 cucumber:2', 'clock:3 cucumber:2', 'balloon:2 clock:1 cucumber:2', 'boss_needle | pill:1 cucumber:3',
  'dryer:3 cucumber:2', 'drop:3 pill:1 cucumber:1', 'roomba:2 pill:2 cucumber:1', 'spray | cone:2 cucumber:2',
  'tangerine:2 pill:1 clock:1 cucumber:1', 'dust:3 balloon:2 cone:1', 'roomba:3 dryer:2',
  'boss_needle | tangerine:2 pill:1 clock:1 cucumber:1',
];

const SOURCES: readonly (readonly string[])[] = [CH1, CH2, CH3, CH4, CH5];

const ENEMY_SET: ReadonlySet<string> = new Set<string>(ENEMY_IDS);

/** Elite waves are 4, 12, 20, ... and boss waves 8, 16, 24, ... in every mode. */
export function waveKindOf(wave: number): WaveKind {
  const m = wave % 8;
  return m === 4 ? 'elite' : m === 0 ? 'boss' : 'normal';
}

export function actOf(wave: number): number {
  return Math.ceil(wave / ACT_LENGTH);
}

function parseGroups(text: string): WaveGroup[] {
  const groups: WaveGroup[] = [];
  for (const token of text.split(' ')) {
    if (token === '' || token.startsWith('@')) continue;
    const [id, w] = token.split(':');
    if (!id || !ENEMY_SET.has(id)) throw new Error(`waves: unknown enemy "${id}" in "${text}"`);
    groups.push({ enemy: id as EnemyId, weight: w === undefined ? 1 : Number(w) });
  }
  return groups;
}

function parseScript(wave: number, text: string): WaveScript {
  const kind = waveKindOf(wave);
  const scale = text.startsWith('@') ? Number(text.slice(1, text.indexOf(' '))) : 1;
  const [head, tail] = text.split('|').map((s) => s.trim());
  if (kind === 'normal') {
    return { wave, act: actOf(wave), kind, boss: null, groups: parseGroups(head as string), budget: WAVE_BUDGET * scale };
  }
  const boss = (head as string).trim() as EnemyId;
  if (!ENEMY_SET.has(boss)) throw new Error(`waves: unknown boss "${boss}" in wave ${wave}`);
  return {
    wave, act: actOf(wave), kind, boss, groups: parseGroups(tail ?? ''),
    budget: (kind === 'boss' ? ESCORT_BUDGET_BOSS : ESCORT_BUDGET_ELITE) * scale,
  };
}

const CHAPTERS: readonly (readonly WaveScript[])[] = SOURCES.map((src) => src.map((text, i) => parseScript(i + 1, text)));

/** The 24 scripted waves of a chapter (1..5). */
export function chapterWaves(chapter: number): readonly WaveScript[] {
  const i = Math.min(Math.max(Math.floor(chapter), 1), CHAPTER_COUNT) - 1;
  return CHAPTERS[i] as readonly WaveScript[];
}

/**
 * The script of `wave` in any mode. Past wave 24 (endless) the acts 3..6 repeat, which keeps the
 * elite / boss rhythm because four acts are an even number.
 */
export function scriptFor(chapter: number, wave: number): WaveScript {
  const waves = chapterWaves(chapter);
  if (wave <= CHAPTER_WAVES) return waves[Math.max(wave, 1) - 1] as WaveScript;
  const act = actOf(wave);
  const mapped = 3 + ((act - 3) % 4);
  const index = (mapped - 1) * ACT_LENGTH + ((wave - 1) % ACT_LENGTH);
  return { ...(waves[index] as WaveScript), wave, act };
}

/** Enemy list of a script with counts, scaled by `countMult` (daily modifiers). The boss comes first. */
export function waveEntries(script: WaveScript, countMult = 1): WavePreviewEntry[] {
  const out: WavePreviewEntry[] = [];
  if (script.boss) out.push({ enemy: script.boss, count: 1 });
  let total = 0;
  for (const g of script.groups) total += g.weight;
  if (total <= 0) return out;
  for (const g of script.groups) {
    const health = (script.budget * g.weight) / total;
    const count = Math.max(1, Math.round((health / budgetMult(g.enemy)) * countMult));
    out.push({ enemy: g.enemy, count });
  }
  return out;
}

/** Cucumber-equivalent health actually spawned by `entries` (children of splitters included). */
export function entriesBudget(entries: readonly WavePreviewEntry[]): number {
  let sum = 0;
  for (const e of entries) sum += e.count * budgetMult(e.enemy);
  return sum;
}

const TRAIT_OF_HAZARD: ReadonlySet<EnemyId> = new Set<EnemyId>(['spray', 'boss_bath', 'boss_cloud']);

/**
 * Traits (or 'hazard') that first appear in `act` of a chapter. The relic offer before the act
 * favours toys that answer them.
 */
export function actFeatures(chapter: number, act: number): (EnemyTrait | 'hazard')[] {
  const waves = chapterWaves(chapter);
  const seen = new Set<EnemyId>();
  const fresh: (EnemyTrait | 'hazard')[] = [];
  for (const s of waves) {
    const ids = [...(s.boss ? [s.boss] : []), ...s.groups.map((g) => g.enemy)];
    for (const id of ids) {
      if (seen.has(id)) continue;
      seen.add(id);
      if (s.act !== act) continue;
      if (TRAIT_OF_HAZARD.has(id)) fresh.push('hazard');
      for (const trait of enemySpec(id).traits) if (trait !== 'elite' && trait !== 'boss') fresh.push(trait);
    }
  }
  return fresh;
}
