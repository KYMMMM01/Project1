/**
 * Balance bots (rules §15). They play through the public BattleApi only, exactly like a UI would, and
 * decide every quarter of a simulated second.
 *   random  - summons whenever it can, never merges; buys summon grades, replaces its weakest common cat
 *             when the board is full, otherwise upgrades a random class; stands warriors where their swing
 *             reaches the walkway; picks toys and three-pick cats at random
 *   merge   - merges any pair as soon as it can, awakens a guardian when the rules allow, upgrades its
 *             biggest class once the board is crowded, stands warriors where their swing reaches the walkway,
 *             picks toys by score
 *   synergy - everything merge does plus: builds one class line on purpose (a merge never changes class; `focus`
 *             pins the line from the first cat instead of letting the heaviest class decide):
 *             keeps one cat of each rarity of its focus class (the kitten rank does not count toward the synergy), merges the
 *             surplus pairs and every other class, molts off-class cats into the rungs it lacks while
 *             keeping the purr of one awakening, stands strong cats on sunbeams, aims the laser at the boss
 *             or the oldest enemy, and takes the early-call bonus when the field is empty
 */
import { CLASS_IDS, type BattleApi, type ClassId, type RelicId, type UnitId, type UnitState } from '../api';
import { CELL_COUNT, PATH_BOTTOM, PATH_LEFT, PATH_RIGHT, PATH_TOP, cellCenterX, cellCenterY } from '../geometry';
import { Rng } from '@/core/rng';
import { SYNERGY_MIN_RANK } from '../data/balance';
import { unitClass, unitRarityIndex } from '../data/roster';

export type BotPolicy = 'random' | 'merge' | 'synergy';

export interface Bot {
  readonly policy: BotPolicy;
  /** Called every decision step while the battle is running. */
  act(b: BattleApi): void;
  /** Called while a choice (3-pick summon or toy offer) is pending. */
  choose(b: BattleApi): void;
}

/** How much a synergy bot likes each toy (higher is better). */
const RELIC_SCORE: Record<RelicId, number> = {
  golden_catnip: 9, sunny_spot: 8, royal_crown: 8, shooting_star: 7, nine_lives: 6, hourglass: 5,
  silvervine: 7, purr_pillow: 6, lucky_coin: 5, glass_marble: 6, auto_feeder: 6, twin_bells: 6, nap_blanket: 5, sardine_crate: 5,
  cat_tower: 5, kneading_cushion: 4, cat_tunnel: 5, heating_pad: 4, batteries: 4, snack_stick: 5, tuna_cans: 4, window_perch: 4,
  yarn_ball: 4, glitter_ball: 4, mouse_toy: 4, cardboard_box: 3, bell_collar: 3, fishing_rod: 4, scratcher: 4, feather_wand: 4,
};

function nominalDps(u: UnitState): number {
  const s = u.stats;
  return (s.damage * (1 + s.crit * (s.critMult - 1))) / s.interval;
}

function units(b: BattleApi): UnitState[] {
  const out: UnitState[] = [];
  for (let c = 0; c < CELL_COUNT; c++) {
    const u = b.units[c];
    if (u) out.push(u);
  }
  return out;
}

function emptyCount(b: BattleApi): number {
  let n = 0;
  for (let c = 0; c < CELL_COUNT; c++) if (!b.units[c]) n++;
  return n;
}

function pickRelicByScore(b: BattleApi, score: (id: RelicId) => number): void {
  const p = b.pending;
  if (!p || p.kind !== 'relic') return;
  let best = 0;
  for (let i = 1; i < p.options.length; i++) if (score(p.options[i] as RelicId) > score(p.options[best] as RelicId)) best = i;
  b.pickRelic(best);
}

function mergeAny(b: BattleApi, allow: (id: UnitId, count: number) => boolean): boolean {
  const count: Record<string, number> = {};
  for (const u of units(b)) count[u.id] = (count[u.id] ?? 0) + 1;
  // Highest rarity first: it frees the most progress per move.
  let best: [number, number] | null = null;
  let bestRank = -1;
  for (let i = 0; i < CELL_COUNT; i++) {
    const a = b.units[i];
    if (!a) continue;
    for (let j = i + 1; j < CELL_COUNT; j++) {
      if (b.dropAction(i, j) !== 'merge') continue;
      const rank = unitRarityIndex(a.id);
      if (rank > bestRank && allow(a.id, count[a.id] ?? 0)) {
        best = [i, j];
        bestRank = rank;
      }
    }
  }
  if (!best) return false;
  return b.drop(best[0], best[1]) === null;
}

// ───────────────────────────── random ─────────────────────────────

/** Cell of the weakest cat of the given rarity index, or -1. */
function weakest(b: BattleApi, rarity: number): number {
  let cell = -1;
  let low = Infinity;
  for (let i = 0; i < CELL_COUNT; i++) {
    const u = b.units[i];
    if (!u || unitRarityIndex(u.id) !== rarity) continue;
    const v = nominalDps(u);
    if (v < low) {
      low = v;
      cell = i;
    }
  }
  return cell;
}

function randomBot(seed: number): Bot {
  const rng = new Rng(seed);
  return {
    policy: 'random',
    act(b) {
      warriorsToTheWalkway(b);
      const gradeCost = b.summonGradeCost();
      if (gradeCost > 0 && emptyCount(b) <= 10 && b.fish >= gradeCost + b.summonCost()) b.upgradeSummon();
      for (let guard = 0; guard < 3; guard++) {
        // A full board makes room by selling a common cat; a better one may come back.
        if (emptyCount(b) === 0 && b.fish >= b.summonCost()) {
          const cell = weakest(b, 0);
          if (cell >= 0) b.sell(cell);
        }
        if (b.summon() !== null) break;
      }
      if (emptyCount(b) === 0) b.upgradeClass(rng.pick(CLASS_IDS));
    },
    choose(b) {
      const p = b.pending;
      if (!p) return;
      if (p.kind === 'summon') b.pickSummon(rng.int(0, p.options.length - 1));
      else b.pickRelic(rng.int(0, p.options.length - 1));
    },
  };
}

// ───────────────────────────── merge ─────────────────────────────

function classPower(b: BattleApi): Map<ClassId, number> {
  const power = new Map<ClassId, number>();
  for (const u of units(b)) power.set(unitClass(u.id), (power.get(unitClass(u.id)) ?? 0) + nominalDps(u));
  return power;
}

function topClass(b: BattleApi): ClassId {
  let best: ClassId = 'warrior';
  let bestPower = -1;
  for (const [c, p] of classPower(b)) {
    if (p > bestPower) {
      best = c;
      bestPower = p;
    }
  }
  return best;
}

function mergeBot(seed: number): Bot {
  const rng = new Rng(seed);
  return {
    policy: 'merge',
    act(b) {
      for (let i = 0; i < CELL_COUNT; i++) {
        if (b.units[i] && b.canAwaken(i) === null) {
          b.awaken(i);
          break;
        }
      }
      for (let i = 0; i < 4 && mergeAny(b, () => true); i++);
      warriorsToTheWalkway(b);
      const crowded = emptyCount(b) <= 6;
      if (crowded) {
        const c = topClass(b);
        const cost = b.classUpgradeCost(c);
        if (cost > 0 && b.fish >= cost + b.summonCost()) b.upgradeClass(c);
      }
      for (let guard = 0; guard < 3; guard++) {
        if (b.summon() !== null) break;
        for (let i = 0; i < 3 && mergeAny(b, () => true); i++);
      }
    },
    choose(b) {
      const p = b.pending;
      if (!p) return;
      if (p.kind === 'summon') {
        let best = 0;
        for (let i = 1; i < p.options.length; i++) {
          if (unitRarityIndex(p.options[i] as UnitId) > unitRarityIndex(p.options[best] as UnitId)) best = i;
        }
        b.pickSummon(best);
      } else {
        pickRelicByScore(b, (id) => (RELIC_SCORE[id] ?? 0) + rng.next());
      }
    },
  };
}

// ───────────────────────────── synergy ─────────────────────────────

interface Census {
  count: Record<string, number>;
  /** Which rarity slots (0..4) of each class are filled. */
  has: boolean[][];
  /** Common-equivalents per class (1, 2, 4, 8, 16 by rarity): a merge keeps it, so it measures how far a line has come. */
  weight: number[];
}

function census(b: BattleApi): Census {
  const count: Record<string, number> = {};
  const has = CLASS_IDS.map(() => [false, false, false, false, false]);
  const weight = CLASS_IDS.map(() => 0);
  for (const u of units(b)) {
    const ci = CLASS_IDS.indexOf(unitClass(u.id));
    const r = unitRarityIndex(u.id);
    count[u.id] = (count[u.id] ?? 0) + 1;
    (has[ci] as boolean[])[r] = true;
    weight[ci] = (weight[ci] as number) + (1 << r);
  }
  return { count, has, weight };
}

/**
 * The class line the bot builds: the heaviest one, changed only when another class is twice as heavy, so a
 * single lucky summon does not make it hop between lines (a merge never changes class, a molt costs purr).
 */
function pickFocus(c: Census, current: number): number {
  let best = current;
  for (let i = 0; i < CLASS_IDS.length; i++) if ((c.weight[i] as number) > (c.weight[best] as number)) best = i;
  return (c.weight[best] as number) >= 2 * (c.weight[current] as number) ? best : current;
}

/** Cell of the weakest surplus copy (a unit the board holds at least twice). */
function weakestSurplus(b: BattleApi, c: Census): number {
  let cell = -1;
  let low = Infinity;
  for (let i = 0; i < CELL_COUNT; i++) {
    const u = b.units[i];
    if (!u || (c.count[u.id] as number) < 2) continue;
    const v = nominalDps(u) * (1 + unitRarityIndex(u.id) * 2);
    if (v < low) {
      low = v;
      cell = i;
    }
  }
  return cell;
}

/** Empty cells at or below which every pair merges: the board needs room more than it needs a ladder rung. */
const CROWDED = 3;

/**
 * Whether the ladder bot merges this pair. A merge keeps the class, so a focus pair climbs the line: it
 * only costs a rung when the next one is taken already (two copies of a rarity become the next rarity and leave
 * none behind), so it waits for a third copy, an empty next rung or a crowded board. Other classes merge freely
 * (their cats are molt stock).
 */
function ladderAllows(b: BattleApi, focus: ClassId, id: UnitId, count: number): boolean {
  if (unitClass(id) !== focus || count >= 3 || emptyCount(b) <= CROWDED) return true;
  return !b.classOwned(focus)[unitRarityIndex(id) + 1];
}

/**
 * Molts one off-class cat into the focus line's highest missing rung. A legendary rung is worth a purr whatever
 * the awakening needs (the line cannot rebuild one for a long time, and the awakening needs one); the lower rungs
 * refill from summons and merges, so they only get the purr the awakening does not need. Low rarities also
 * need a surplus copy as the donor.
 */
function moltIntoLadder(b: BattleApi, c: Census, focus: ClassId): void {
  const f = CLASS_IDS.indexOf(focus);
  // The kitten rank (0) is never molted into: it does not count toward a synergy.
  for (let r = 3; r >= SYNERGY_MIN_RANK; r--) {
    if (r < 3 && b.purr <= b.awakenCost()) break;
    if ((c.has[f] as boolean[])[r]) continue;
    let donor = -1;
    let donorCount = 0;
    for (let i = 0; i < CELL_COUNT; i++) {
      const u = b.units[i];
      if (!u || unitRarityIndex(u.id) !== r || unitClass(u.id) === focus) continue;
      const n = c.count[u.id] as number;
      if (r < 2 && n < 2) continue;
      if (n > donorCount) {
        donor = i;
        donorCount = n;
      }
    }
    if (donor >= 0 && b.molt(donor, focus) === null) return;
  }
}

function synergyBot(seed: number, forced?: ClassId): Bot {
  const rng = new Rng(seed);
  let focusIndex = forced ? CLASS_IDS.indexOf(forced) : 0;
  return {
    policy: 'synergy',
    act(b) {
      // Awaken as soon as the rules allow: a guardian is worth far more than the purr it costs.
      for (let i = 0; i < CELL_COUNT; i++) {
        if (b.units[i] && b.canAwaken(i) === null) {
          b.awaken(i);
          break;
        }
      }
      if (!forced) focusIndex = pickFocus(census(b), focusIndex);
      const focus = CLASS_IDS[focusIndex] as ClassId;
      for (let i = 0; i < 4; i++) if (!mergeAny(b, (id, n) => ladderAllows(b, focus, id, n))) break;

      if (b.moltsLeft() > 0) moltIntoLadder(b, census(b), focus);

      warriorsToTheWalkway(b);
      // Stand the strongest cats on sunbeams (warriors keep to cells where their swing reaches the walkway).
      swapIntoSun(b);

      // Money: upgrades once the board is established, summons otherwise.
      for (let guard = 0; guard < 3; guard++) {
        const board = CELL_COUNT - emptyCount(b);
        const upCost = b.classUpgradeCost(focus);
        if (board >= 9 && upCost > 0 && b.fish >= upCost && b.classUpgradeLevel(focus) < Math.floor(board / 3)) {
          b.upgradeClass(focus);
          continue;
        }
        const gradeCost = b.summonGradeCost();
        if (gradeCost > 0 && b.summonGrade() < 2 && board >= 6 && b.fish >= gradeCost + b.summonCost() * 2) {
          b.upgradeSummon();
          continue;
        }
        if (emptyCount(b) === 0 && b.fish >= b.summonCost()) {
          const cell = weakestSurplus(b, census(b));
          if (cell >= 0 && unitRarityIndex((b.units[cell] as UnitState).id) === 0) b.sell(cell);
        }
        if (b.summon() !== null) break;
        for (let i = 0; i < 3 && mergeAny(b, (id, n) => ladderAllows(b, focus, id, n)); i++);
      }

      // Laser on the boss, or on the oldest enemy when the field is busy.
      if (b.laser.active) {
        const t = b.boss ?? oldest(b);
        if (t) b.setLaser(t.x, t.y);
      } else if (b.laser.cooldown <= 0 && (b.boss || b.enemyCount >= 14)) {
        const t = b.boss ?? oldest(b);
        if (t) b.setLaser(t.x, t.y);
      }

      // A quiet field: take the bonus and move on.
      const bonus = b.callBonus();
      if (bonus >= 11 && b.enemyCount === 0) b.callNextWave();
    },
    choose(b) {
      const p = b.pending;
      if (!p) return;
      if (p.kind === 'summon') {
        // A cat of the focus line that fills an empty rung is worth most; otherwise the higher rarity wins.
        const c = census(b);
        const f = focusIndex;
        let best = 0;
        let bestScore = -1;
        for (let i = 0; i < p.options.length; i++) {
          const id = p.options[i] as UnitId;
          const ci = CLASS_IDS.indexOf(unitClass(id));
          const r = unitRarityIndex(id);
          const score = r * 10 + (ci === f ? 25 + (!(c.has[ci] as boolean[])[r] ? 40 : 0) : 0) + rng.next();
          if (score > bestScore) {
            bestScore = score;
            best = i;
          }
        }
        b.pickSummon(best);
      } else {
        pickRelicByScore(b, (id) => (RELIC_SCORE[id] ?? 0) + rng.next());
      }
    },
  };
}

function oldest(b: BattleApi): { x: number; y: number } | null {
  let best: { x: number; y: number } | null = null;
  let travelled = -1;
  for (const e of b.enemies) {
    if (e.travelled > travelled) {
      travelled = e.travelled;
      best = e;
    }
  }
  return best;
}

/** Range a warrior needs beyond its cell's distance to the walkway before the cell is worth standing in. */
const SWING_ROOM = 40;

/** Whether a cat with this range works a good stretch of the walkway from `cell` (the edge ring is 100 px away, the inner block 210). */
export function worksWalkway(range: number, cell: number): boolean {
  const x = cellCenterX(cell);
  const y = cellCenterY(cell);
  return range >= Math.min(x - PATH_LEFT, PATH_RIGHT - x, y - PATH_TOP, PATH_BOTTOM - y) + SWING_ROOM;
}

/** Warriors stand where their swing reaches the walkway: swap them out of cells too far from it. */
function warriorsToTheWalkway(b: BattleApi): void {
  for (let i = 0; i < CELL_COUNT; i++) {
    const u = b.units[i];
    if (!u || unitClass(u.id) !== 'warrior' || worksWalkway(u.stats.range, i)) continue;
    for (let j = 0; j < CELL_COUNT; j++) {
      if (!worksWalkway(u.stats.range, j)) continue;
      const other = b.units[j];
      if (other && unitClass(other.id) === 'warrior') continue;
      if (b.dropAction(i, j) !== 'merge' && b.drop(i, j) === null) break;
    }
  }
}

function swapIntoSun(b: BattleApi): void {
  let worstSun = -1;
  let worstValue = Infinity;
  for (const cell of b.sunbeams) {
    const u = b.units[cell];
    const v = u ? nominalDps(u) : -1;
    if (v < worstValue) {
      worstValue = v;
      worstSun = cell;
    }
  }
  if (worstSun < 0) return;
  let bestCell = -1;
  let bestValue = worstValue * 1.15;
  for (let i = 0; i < CELL_COUNT; i++) {
    const u = b.units[i];
    if (!u || b.sunbeams.includes(i)) continue;
    if (unitClass(u.id) === 'warrior' && !worksWalkway(u.stats.range, worstSun)) continue;
    const v = nominalDps(u);
    if (v > bestValue && b.dropAction(i, worstSun) !== 'merge') {
      bestValue = v;
      bestCell = i;
    }
  }
  if (bestCell >= 0) b.drop(bestCell, worstSun);
}

/** `focus` pins the synergy bot to one class line (the balance report's class-focus variants); the other bots ignore it. */
export function createBot(policy: BotPolicy, seed: number, focus?: ClassId): Bot {
  switch (policy) {
    case 'random': return randomBot(seed);
    case 'merge': return mergeBot(seed);
    case 'synergy': return synergyBot(seed, focus);
  }
}

