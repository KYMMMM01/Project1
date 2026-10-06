/**
 * Balance bots (rules §15). They play through the public BattleApi only, exactly like a UI would, and
 * decide every quarter of a simulated second.
 *   random  - summons whenever it can, never merges; buys summon grades, replaces its weakest common cat
 *             when the board is full, otherwise upgrades a random class; stands warriors on the outer
 *             ring; picks toys and three-pick cats at random
 *   merge   - merges any pair as soon as it can, awakens a guardian when the rules allow, upgrades its
 *             biggest class once the board is crowded, stands warriors on the outer ring, picks toys by score
 *   synergy - everything merge does plus: keeps the focus class's higher types as a ladder (merging
 *             commons, rares and other classes freely), molts toward a full ladder while keeping the purr
 *             of one awakening, stands strong cats on sunbeams, aims the laser at the boss or the oldest
 *             enemy, and takes the early-call bonus when the field is empty
 */
import { CLASS_IDS, type BattleApi, type ClassId, type RelicId, type UnitId, type UnitState } from '../api';
import { CELL_COUNT, isEdgeCell } from '../geometry';
import { Rng } from '@/core/rng';
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
      warriorsToTheEdge(b);
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
      warriorsToTheEdge(b);
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
  /** Which rarity slots (0..3) of each class are filled. */
  has: boolean[][];
  distinct: number[];
}

function census(b: BattleApi): Census {
  const count: Record<string, number> = {};
  const has = CLASS_IDS.map(() => [false, false, false, false, false]);
  for (const u of units(b)) {
    count[u.id] = (count[u.id] ?? 0) + 1;
    (has[CLASS_IDS.indexOf(unitClass(u.id))] as boolean[])[unitRarityIndex(u.id)] = true;
  }
  const distinct = has.map((row) => row.filter(Boolean).length);
  return { count, has, distinct };
}

function focusClass(c: Census): number {
  let best = 0;
  for (let i = 1; i < CLASS_IDS.length; i++) {
    if ((c.distinct[i] as number) > (c.distinct[best] as number)) best = i;
  }
  return best;
}

/** Cell of the weakest unit that is a surplus copy (or the weakest of all when `any`). */
function weakestSurplus(b: BattleApi, c: Census, any: boolean): number {
  let cell = -1;
  let low = Infinity;
  for (let i = 0; i < CELL_COUNT; i++) {
    const u = b.units[i];
    if (!u) continue;
    if (!any && (c.count[u.id] as number) < 2) continue;
    const v = nominalDps(u) * (1 + unitRarityIndex(u.id) * 2);
    if (v < low) {
      low = v;
      cell = i;
    }
  }
  return cell;
}

/** Purr the synergy bot never molts away: one awakening. */
const AWAKEN_RESERVE = 12;

function synergyBot(seed: number): Bot {
  const rng = new Rng(seed);
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
      let c = census(b);
      // Commons and rares are cheap to rebuild, so they merge freely, and so does anything outside the
      // focus class; the focus class's higher types stay as ladder pieces until a third copy shows up or the
      // board is getting crowded.
      const focus = CLASS_IDS[focusClass(c)] as ClassId;
      for (let i = 0; i < 4; i++) {
        if (!mergeAny(b, (id, n) => n >= 3 || unitRarityIndex(id) <= 1 || unitClass(id) !== focus || emptyCount(b) <= 3)) break;
      }
      c = census(b);

      // Molting: always keep the purr a guardian costs. First bring a legendary into a class that can
      // awaken it, then fill the focus class's ladder with surplus copies.
      if (b.purr > AWAKEN_RESERVE && b.moltsLeft() > 0) {
        const f = focusClass(c);
        const target = CLASS_IDS[f] as ClassId;
        if ((c.distinct[f] as number) >= 3 && !c.has[f]?.[3]) {
          for (let i = 0; i < CELL_COUNT; i++) {
            const u = b.units[i];
            if (u && unitRarityIndex(u.id) === 3 && unitClass(u.id) !== target && b.molt(i, target) === null) break;
          }
        }
        c = census(b);
        for (let r = 3; r >= 0 && b.purr > AWAKEN_RESERVE && (c.distinct[f] as number) < 4; r--) {
          if ((c.has[f] as boolean[])[r]) continue;
          for (let i = 0; i < CELL_COUNT; i++) {
            const u = b.units[i];
            if (!u || unitRarityIndex(u.id) !== r || (c.count[u.id] as number) < 2 || unitClass(u.id) === target) continue;
            if (b.molt(i, target) === null) {
              c = census(b);
              r = 4;
            }
            break;
          }
        }
      }

      warriorsToTheEdge(b);
      // Stand the strongest cats on sunbeams (warriors keep to the edge, where they can reach).
      swapIntoSun(b);

      // Money: upgrades once the board is established, summons otherwise.
      const strong = classOf(b);
      for (let guard = 0; guard < 3; guard++) {
        const board = 20 - emptyCount(b);
        const upCost = b.classUpgradeCost(strong);
        if (board >= 9 && upCost > 0 && b.fish >= upCost && b.classUpgradeLevel(strong) < Math.floor(board / 3)) {
          b.upgradeClass(strong);
          continue;
        }
        const gradeCost = b.summonGradeCost();
        if (gradeCost > 0 && b.summonGrade() < 2 && board >= 6 && b.fish >= gradeCost + b.summonCost() * 2) {
          b.upgradeSummon();
          continue;
        }
        if (emptyCount(b) === 0 && b.fish >= b.summonCost()) {
          c = census(b);
          const cell = weakestSurplus(b, c, false);
          if (cell >= 0 && unitRarityIndex((b.units[cell] as UnitState).id) === 0) b.sell(cell);
        }
        if (b.summon() !== null) break;
        for (let i = 0; i < 3 && mergeAny(b, (id, n) => n >= 3 || unitRarityIndex(id) <= 1 || emptyCount(b) <= 1); i++);
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
        const c = census(b);
        let best = 0;
        let bestScore = -1;
        for (let i = 0; i < p.options.length; i++) {
          const id = p.options[i] as UnitId;
          const ci = CLASS_IDS.indexOf(unitClass(id));
          const fills = !(c.has[ci] as boolean[])[unitRarityIndex(id)];
          const score = (fills ? 100 : 0) + unitRarityIndex(id) * 10 + (c.distinct[ci] as number) * 3 + rng.next();
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

function classOf(b: BattleApi): ClassId {
  const c = census(b);
  return CLASS_IDS[focusClass(c)] as ClassId;
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

/** Short-range warriors only reach the walkway from the outer ring: swap them out of the middle. */
function warriorsToTheEdge(b: BattleApi): void {
  for (let i = 0; i < CELL_COUNT; i++) {
    const u = b.units[i];
    if (!u || unitClass(u.id) !== 'warrior' || isEdgeCell(i)) continue;
    for (let j = 0; j < CELL_COUNT; j++) {
      if (!isEdgeCell(j)) continue;
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
    if (unitClass(u.id) === 'warrior' && !isEdgeCell(worstSun)) continue;
    const v = nominalDps(u);
    if (v > bestValue && b.dropAction(i, worstSun) !== 'merge') {
      bestValue = v;
      bestCell = i;
    }
  }
  if (bestCell >= 0) b.drop(bestCell, worstSun);
}

export function createBot(policy: BotPolicy, seed: number): Bot {
  switch (policy) {
    case 'random': return randomBot(seed);
    case 'merge': return mergeBot(seed);
    case 'synergy': return synergyBot(seed);
  }
}

