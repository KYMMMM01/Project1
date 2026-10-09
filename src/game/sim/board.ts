/** The 5x5 board: summoning, merging, molting, awakening, selling, upgrades and the stat recompute. */
import { CLASS_IDS, UNIT_IDS, type ClassId, type Fail, type OddsRow, type PityInfo, type RarityId, type UnitId } from '../api';
import { CELL_COUNT, auraCells, cellCenterX, cellCenterY, cellRow, isEdgeCell, neighbors4 } from '../geometry';
import {
  AWAKEN_COST, AWAKEN_MIN_TIER, CLASS_UPGRADE_BONUS, CLASS_UPGRADE_COSTS, DODGE_CAP, HAZARD_RECOVER, LEVEL_DAMAGE_STEP,
  MERGE_START_CHARGE, MOLT_COST, MOLT_LIMIT, OFFER_OPTIONS, OFFER_REROLLS, PITY_LIMIT, SELL_FISH, SELL_PURR,
  SUMMON_BASE, SUMMON_CAP, SUMMON_GRADE_COSTS, SUMMON_STEP, SUN_SPEED, SYNERGY_MIN_RANK,
} from '../data/balance';
import { SYNERGY_SPECIAL, synergyTier, tierForDistinct } from '../data/classes';
import { RARITIES, UNIT_GRID, levelSourceOf, mergeResultOf, mythicOf, unitRarityIndex } from '../data/roster';
import type { PerkSpec, SynergyTier } from '../data/types';
import { unitSpec } from '../data/units';
import { addFish, addPurr } from './economy';
import { ODDS_RARITIES, addLuck, computeOdds, pityBonus, rollRarity } from './odds';
import type { Sim } from './sim';
import type { PerkTotals, SimUnit } from './types';

const UNIT_INDEX = Object.fromEntries(UNIT_IDS.map((id, i) => [id, i])) as Record<UnitId, number>;
/** Up / down / left / right: the kneading cushion's neighbours. */
const NEIGHBORS: readonly number[][] = Array.from({ length: CELL_COUNT }, (_, c) => neighbors4(c, []));
/** The cells a team effect reaches from each cell, by how far it reaches (the cats' data asks for 1 cell: the 8 cells around). */
const AURA_REACH = new Map<number, readonly number[][]>();

function auraTable(reach: number): readonly number[][] {
  let table = AURA_REACH.get(reach);
  if (!table) {
    table = Array.from({ length: CELL_COUNT }, (_, c) => auraCells(c, [], reach));
    AURA_REACH.set(reach, table);
  }
  return table;
}
const CLASS_INDEX: Readonly<Record<ClassId, number>> = { warrior: 0, ranger: 1, mage: 2, trickster: 3 };
const RANGER = 1;
const TRICKSTER = 3;

function classIndexOf(id: ClassId): number {
  return CLASS_INDEX[id];
}

function zeroPerks(): PerkTotals {
  return { range: 0, damage: 0, speed: 0, crit: 0, critMult: 0, radius: 0, targets: 0, duration: 0, effect: 0, reach: 0, aura: 0 };
}

function perkTotals(perks: readonly PerkSpec[], level: number): PerkTotals {
  const out = zeroPerks();
  for (const p of perks) if (level >= p.level) out[p.key] += p.value;
  return out;
}

function guard(s: Sim): Fail | null {
  if (s.phase === 'won' || s.phase === 'lost') return 'not_in_battle';
  if (s.phase === 'choice') return 'choice_pending';
  return null;
}

function unitLevelOf(s: Sim, id: UnitId): number {
  const lv = s.levels[levelSourceOf(id)] ?? 1;
  return lv < 1 ? 1 : lv > 10 ? 10 : Math.floor(lv);
}

export function makeUnit(s: Sim, id: UnitId, cell: number, charge: number): SimUnit {
  const spec = unitSpec(id);
  const level = unitLevelOf(s, id);
  const unit: SimUnit = {
    uid: ++s.uidUnit, id, cell, charge, blocked: false, weakened: 0, sunlit: false,
    stats: { ...spec.base }, buffAttackSpeed: 0, buffDamage: 0, shielded: false, dodge: 0, kills: 0, damageDealt: 0,
    spec, level, classIndex: classIndexOf(spec.classId), rarityIndex: unitRarityIndex(id), unitIndex: UNIT_INDEX[id],
    recoverAt: 0, searchAfter: 0, attackCount: 0, coinAt: 0,
    perk: perkTotals(spec.perks, level), armorIgnore: 0, statusMult: 1, shots: 0, sureCritEvery: 0, removed: false,
  };
  const coin = spec.aura.coinRain;
  unit.coinAt = coin ? s.time + coin.every : 0;
  return unit;
}

function noteRarity(s: Sim, unit: SimUnit): void {
  if (unit.rarityIndex > s.bestRarity) s.bestRarity = unit.rarityIndex;
}

function emptyCellCount(s: Sim): number {
  let n = 0;
  for (let c = 0; c < CELL_COUNT; c++) if (s.units[c] === null) n++;
  return n;
}

/** The `k`-th empty cell in cell order, or -1. */
function nthEmpty(s: Sim, k: number): number {
  let seen = 0;
  for (let c = 0; c < CELL_COUNT; c++) {
    if (s.units[c] !== null) continue;
    if (seen === k) return c;
    seen++;
  }
  return -1;
}

/** Puts a new unit on `cell` and announces it. Does not refresh stats: callers do once they are done. */
function placeUnit(s: Sim, id: UnitId, cell: number, source: 'button' | 'choice' | 'relic' | 'twin' | 'script'): SimUnit {
  const unit = makeUnit(s, id, cell, MERGE_START_CHARGE);
  s.units[cell] = unit;
  noteRarity(s, unit);
  s.summonedUnits++;
  refresh(s);
  if (s.ev.has('summon')) s.ev.emit('summon', { unit, source });
  return unit;
}

/** A unit from nowhere (cat tunnel): common, random class and cell from `rng`. Returns false when the board is full. */
export function placeRandomCommon(s: Sim, u: number, v: number): boolean {
  const empties = emptyCellCount(s);
  if (empties === 0) return false;
  const cls = s.allowedClasses[Math.floor(u * s.allowedClasses.length)] as ClassId;
  placeUnit(s, UNIT_GRID[cls][0], nthEmpty(s, Math.floor(v * empties)), 'relic');
  return true;
}

// ───────────────────────────── synergy and stats ─────────────────────────────

const presence = new Uint8Array(CLASS_IDS.length * RARITIES.length);

/** Counts the distinct unit types per class that count (the first rank does not) and announces tier changes. */
function updateSynergy(s: Sim): void {
  presence.fill(0);
  for (let c = 0; c < CELL_COUNT; c++) {
    const u = s.units[c];
    if (u && u.rarityIndex >= SYNERGY_MIN_RANK) presence[u.classIndex * RARITIES.length + u.rarityIndex] = 1;
  }
  const k = 1 + (s.fx.synergyScale ?? 0);
  for (let ci = 0; ci < CLASS_IDS.length; ci++) {
    let distinct = 0;
    for (let r = 0; r < RARITIES.length; r++) distinct += presence[ci * RARITIES.length + r] as number;
    const previous = s.tier[ci] as number;
    const tier = tierForDistinct(distinct);
    s.distinct[ci] = distinct;
    s.tier[ci] = tier;
    s.special[ci] = tier >= 3 ? 1 : 0;
    const t = s.tierData[ci] as SynergyTier;
    const base = synergyTier(CLASS_IDS[ci] as ClassId, tier);
    t.damage = base.damage * k;
    t.armorIgnore = base.armorIgnore * k;
    t.crit = base.crit * k;
    t.critMult = base.critMult * k;
    t.statusMult = base.statusMult * k;
    t.speed = base.speed * k;
    t.rewardMult = base.rewardMult * k;
    if (tier !== previous && s.ev.has('synergy')) {
      s.ev.emit('synergy', { classId: CLASS_IDS[ci] as ClassId, tier, previous, distinct });
    }
  }
}

const bellSpeed = new Float64Array(CELL_COUNT);
const bardDamage = new Float64Array(CELL_COUNT);
const dodgeAt = new Float64Array(CELL_COUNT);
const shield = new Uint8Array(CELL_COUNT);

/** Recomputes every unit's final stats from level, upgrades, synergies, relics and neighbours. */
export function recomputeStats(s: Sim): void {
  const fx = s.fx;
  bellSpeed.fill(0);
  bardDamage.fill(0);
  dodgeAt.fill(0);
  shield.fill(0);
  let lucky = 0;
  for (let c = 0; c < CELL_COUNT; c++) {
    const u = s.units[c];
    if (!u) continue;
    const aura = u.spec.aura;
    const scale = 1 + u.perk.aura;
    const nb = auraTable(aura.reach ?? 1)[c] as number[];
    if (aura.shieldNeighbours) for (const n of nb) shield[n] = 1;
    if (aura.dodge !== undefined) {
      const v = Math.min(DODGE_CAP, aura.dodge * scale);
      if (v > (dodgeAt[c] as number)) dodgeAt[c] = v;
      for (const n of nb) if (v > (dodgeAt[n] as number)) dodgeAt[n] = v;
    }
    if (aura.neighbourSpeed !== undefined) {
      const v = aura.neighbourSpeed * scale;
      for (const n of nb) if (v > (bellSpeed[n] as number)) bellSpeed[n] = v;
    }
    if (aura.neighbourDamage !== undefined) {
      const v = aura.neighbourDamage * scale;
      for (const n of nb) if (v > (bardDamage[n] as number)) bardDamage[n] = v;
    }
    if (aura.boardSpeed !== undefined && aura.boardSpeed * scale > lucky) lucky = aura.boardSpeed * scale;
  }
  const trick = s.tierData[TRICKSTER] as SynergyTier;
  const sunSpeed = SUN_SPEED + (fx.sunSpeed ?? 0);
  // The side effects of the synergy steps reach every cat on the board.
  let armorIgnore = 0;
  let statusMult = 0;
  let crit = 0;
  let critMult = 0;
  for (let ci = 0; ci < CLASS_IDS.length; ci++) {
    const sy = s.tierData[ci] as SynergyTier;
    armorIgnore += sy.armorIgnore;
    statusMult += sy.statusMult;
    crit += sy.crit;
    critMult += sy.critMult;
  }
  if (armorIgnore > 1) armorIgnore = 1;
  const party = s.special[TRICKSTER] === 1 && s.laser.active ? SYNERGY_SPECIAL.trickster.speed : 0;
  const sureEvery = s.special[RANGER] === 1 ? SYNERGY_SPECIAL.ranger.every : 0;
  for (let c = 0; c < CELL_COUNT; c++) {
    const u = s.units[c];
    if (!u) continue;
    const ci = u.classIndex;
    const sy = s.tierData[ci] as SynergyTier;
    const base = u.spec.base;
    const row = cellRow(c);
    const physical = u.spec.damageType === 'physical';

    let dmg = (s.classLevels[ci] as number) * CLASS_UPGRADE_BONUS + s.trainDamage + s.modDamage + u.perk.damage + sy.damage;
    dmg += physical ? fx.damagePhysical ?? 0 : fx.damageMagic ?? 0;
    if (u.rarityIndex >= 3) dmg += fx.royalDamage ?? 0;
    if (row === 0) dmg += fx.topRowDamage ?? 0;
    if (fx.sameClassNeighbourDamage) {
      for (const n of NEIGHBORS[c] as number[]) {
        const o = s.units[n];
        if (o && o.classIndex === ci) {
          dmg += fx.sameClassNeighbourDamage;
          break;
        }
      }
    }
    dmg += bardDamage[c] as number;

    let speed = trick.speed + party + lucky + bellSpeed[c] + u.perk.speed;
    if (s.sunCell[c]) speed += sunSpeed;
    if (ci === 0 || ci === 1) speed += fx.speedWarriorRanger ?? 0;
    if (isEdgeCell(c)) speed += fx.edgeSpeed ?? 0;

    const st = u.stats;
    st.damage = base.damage * (1 + LEVEL_DAMAGE_STEP * (u.level - 1)) * (1 + dmg);
    st.interval = (base.interval / (1 + speed)) * (u.weakened > 0 ? 2 : 1);
    st.range = base.range * (1 + (fx.rangeAll ?? 0) + (row === 0 ? fx.topRowRange ?? 0 : 0) + u.perk.range);
    const chance = base.crit + crit + (fx.crit ?? 0) + u.perk.crit;
    st.crit = chance > 1 ? 1 : chance;
    st.critMult = base.critMult + critMult + (fx.critMult ?? 0) + u.perk.critMult;
    u.armorIgnore = armorIgnore;
    u.statusMult = 1 + statusMult;
    u.sureCritEvery = ci === RANGER ? sureEvery : 0;
    u.buffAttackSpeed = bellSpeed[c] as number;
    u.buffDamage = bardDamage[c] as number;
    u.dodge = dodgeAt[c] as number;
    u.shielded = shield[c] === 1;
    u.sunlit = s.sunCell[c] === 1;
    u.searchAfter = 0;
  }
}

/** Synergies first (stats read the tiers), then stats. Call after any change to the board or its modifiers. */
export function refresh(s: Sim): void {
  updateSynergy(s);
  recomputeStats(s);
}

export function classOwned(s: Sim, classId: ClassId): boolean[] {
  const ci = CLASS_INDEX[classId];
  const out: boolean[] = [false, false, false, false, false];
  for (let c = 0; c < CELL_COUNT; c++) {
    const u = s.units[c];
    if (u && u.classIndex === ci) out[u.rarityIndex] = true;
  }
  return out;
}

// ───────────────────────────── summoning ─────────────────────────────

export function summonCostOf(s: Sim): number {
  if (s.tutorialFree > 0) return 0;
  const cap = SUMMON_CAP - (s.fx.costCapCut ?? 0);
  const base = Math.min(cap, SUMMON_BASE + SUMMON_STEP * s.paidSummons);
  const permille = Math.round((1 - (s.fx.costCut ?? 0)) * 1000) * s.costMultPermille;
  return Math.ceil((base * permille) / 1_000_000 - 1e-9);
}

export function pityOf(s: Sim): PityInfo {
  return { epicDry: s.epicDry, epicDryLimit: PITY_LIMIT, epicBonus: pityBonus(s.epicDry) };
}

export function oddsRows(s: Sim): OddsRow<RarityId>[] {
  const p = computeOdds(s.oddsBuf, s.grade, s.epicDry, s.epicBoost);
  const rows: OddsRow<RarityId>[] = [];
  for (let i = 0; i < ODDS_RARITIES; i++) rows.push({ key: RARITIES[i] as RarityId, p: p[i] as number });
  return rows;
}

function emitPity(s: Sim): void {
  if (s.ev.has('pity')) s.ev.emit('pity', pityOf(s));
}

function classFrom(s: Sim, u: number): ClassId {
  return s.allowedClasses[Math.floor(u * s.allowedClasses.length)] as ClassId;
}

/** Three different candidates for the pick-one-of-three summon: the rarity roll skips common. */
function rollCandidates(s: Sim, rarityFloor: number, fixedRarity: number): UnitId[] {
  const rng = s.rng.pick;
  const out: UnitId[] = [];
  for (let k = 0; k < OFFER_OPTIONS; k++) {
    let id: UnitId = UNIT_GRID.warrior[0];
    for (let attempt = 0; attempt < OFFER_REROLLS; attempt++) {
      let r = fixedRarity;
      if (r < 0) {
        computeOdds(s.oddsBuf, s.grade, s.epicDry, s.epicBoost);
        r = rollRarity(rng.next(), s.oddsBuf);
        if (r < rarityFloor) r = rarityFloor;
      }
      id = UNIT_GRID[classFrom(s, rng.next())][r] as UnitId;
      if (!out.includes(id)) break;
    }
    out.push(id);
  }
  return out;
}

/** Opens a pick-one-of-three. `epic` forces epic candidates (tutorial script). */
export function openSummonOffer(s: Sim, epic: boolean): void {
  const options = rollCandidates(s, 1, epic ? 2 : -1);
  s.offerCountsForPity = !epic;
  s.pending = { kind: 'summon', options };
  s.resumePhase = s.phase === 'prep' ? 'prep' : 'wave';
  s.phase = 'choice';
  if (s.ev.has('summonOffer')) s.ev.emit('summonOffer', { options });
}

export function cmdSummon(s: Sim): Fail | null {
  const g = guard(s);
  if (g) return g;
  const empties = emptyCellCount(s);
  if (empties === 0) return 'board_full';
  const free = s.tutorialFree > 0;
  const cost = summonCostOf(s);
  if (s.fish < cost) return 'not_enough_fish';
  const offer = !free && s.offerEvery > 0 && (s.paidSummons + 1) % s.offerEvery === 0;
  if (cost > 0) addFish(s, -cost, 'summon');
  if (offer) {
    s.paidSummons++;
    openSummonOffer(s, false);
    return null;
  }

  const rng = s.rng.summon;
  const uRarity = rng.next();
  const uClass = rng.next();
  const uCell = rng.next();
  const uTwin = rng.next();
  computeOdds(s.oddsBuf, s.grade, s.epicDry, s.epicBoost);
  let r = rollRarity(uRarity, s.oddsBuf);
  let id = UNIT_GRID[classFrom(s, uClass)][r] as UnitId;
  if (free) {
    id = s.tutorialScript[s.tutorialScript.length - s.tutorialFree] as UnitId;
    s.tutorialFree--;
  } else {
    addLuck(s.luck, s.oddsBuf, r);
    if (r >= 2) s.epicDry = 0;
    else s.epicDry++;
    if (s.firstSummonRarePlus && s.paidSummons === 0 && r === 0) {
      r = 1;
      id = UNIT_GRID[classFrom(s, uClass)][1] as UnitId;
    }
    s.paidSummons++;
    emitPity(s);
  }
  placeUnit(s, id, nthEmpty(s, Math.floor(uCell * empties)), free ? 'script' : 'button');

  const chance = s.fx.twinChance ?? 0;
  if (!free && chance > 0 && uTwin < chance && empties > 1) {
    placeUnit(s, id, nthEmpty(s, Math.floor((uTwin / chance) * (empties - 1))), 'twin');
  }
  return null;
}

export function cmdPickSummon(s: Sim, index: number): Fail | null {
  if (s.phase === 'won' || s.phase === 'lost') return 'not_in_battle';
  const pending = s.pending;
  if (s.phase !== 'choice' || !pending || pending.kind !== 'summon') return 'not_available';
  const id = pending.options[index];
  if (id === undefined) return 'not_available';
  const empties = emptyCellCount(s);
  if (empties === 0) return 'board_full';
  s.pending = null;
  s.phase = s.resumePhase;
  if (s.offerCountsForPity) {
    // A paid offer is a summon like any other for the soft pity: only an epic or better pick resets it.
    s.epicDry = unitRarityIndex(id) >= 2 ? 0 : s.epicDry + 1;
    emitPity(s);
  }
  placeUnit(s, id, nthEmpty(s, Math.floor(s.rng.pick.next() * empties)), 'choice');
  return null;
}

// ───────────────────────────── board commands ─────────────────────────────

export function dropActionOf(s: Sim, from: number, to: number): 'move' | 'swap' | 'merge' | 'none' {
  if (from === to || from < 0 || to < 0 || from >= CELL_COUNT || to >= CELL_COUNT) return 'none';
  const a = s.units[from];
  if (!a) return 'none';
  const b = s.units[to];
  if (!b) return 'move';
  if (a.id === b.id && a.rarityIndex <= 2) return 'merge';
  return 'swap';
}

function enterCell(s: Sim, unit: SimUnit, leftHazard: boolean): void {
  if (leftHazard) unit.recoverAt = s.time + HAZARD_RECOVER;
}

function onHazard(s: Sim, unit: SimUnit): boolean {
  return (s.hazardCount[unit.cell] as number) > 0;
}

export function cmdDrop(s: Sim, from: number, to: number): Fail | null {
  const g = guard(s);
  if (g) return g;
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to < 0 || from >= CELL_COUNT || to >= CELL_COUNT) {
    return 'invalid_cell';
  }
  const a = s.units[from];
  if (!a) return 'empty_cell';
  if (from === to) return 'nothing_to_do';
  const b = s.units[to];
  const action = dropActionOf(s, from, to);
  if (action === 'move') {
    enterCell(s, a, onHazard(s, a));
    s.units[to] = a;
    s.units[from] = null;
    a.cell = to;
    refresh(s);
    if (s.ev.has('move')) s.ev.emit('move', { unit: a, from, to });
    return null;
  }
  const other = b as SimUnit;
  if (action === 'swap') {
    enterCell(s, a, onHazard(s, a));
    enterCell(s, other, onHazard(s, other));
    s.units[to] = a;
    s.units[from] = other;
    a.cell = to;
    other.cell = from;
    refresh(s);
    if (s.ev.has('swap')) s.ev.emit('swap', { a, b: other });
    return null;
  }

  // The result is the next rarity of the same class. The merge stream only decides the snack stick's jump and
  // is always drawn, so the j-th merge's roll does not depend on whether the relic is held.
  const uJump = s.rng.merge.next();
  const jumped = (s.fx.jumpChance ?? 0) > 0 && uJump < (s.fx.jumpChance as number) && a.rarityIndex <= 1;
  const next = mergeResultOf(a.id) as UnitId;
  const id = jumped ? (mergeResultOf(next) as UnitId) : next;
  a.removed = true;
  other.removed = true;
  s.units[from] = null;
  const result = makeUnit(s, id, to, MERGE_START_CHARGE);
  s.units[to] = result;
  noteRarity(s, result);
  s.merges++;
  refresh(s);
  if (s.ev.has('merge')) s.ev.emit('merge', { consumed: [a, other], result, cell: to, fromCell: from, jumped });
  return null;
}

export function sellValueOf(s: Sim, cell: number): { fish: number; purr: number } {
  const u = cell >= 0 && cell < CELL_COUNT ? s.units[cell] : null;
  if (!u) return { fish: 0, purr: 0 };
  return { fish: SELL_FISH[u.rarityIndex] as number, purr: SELL_PURR[u.rarityIndex] as number };
}

export function cmdSell(s: Sim, cell: number): Fail | null {
  const g = guard(s);
  if (g) return g;
  if (!Number.isInteger(cell) || cell < 0 || cell >= CELL_COUNT) return 'invalid_cell';
  const unit = s.units[cell];
  if (!unit) return 'empty_cell';
  const value = sellValueOf(s, cell);
  unit.removed = true;
  s.units[cell] = null;
  refresh(s);
  addFish(s, value.fish, 'sell', cellCenterX(cell), cellCenterY(cell));
  addPurr(s, value.purr, 'sell', cellCenterX(cell), cellCenterY(cell));
  if (s.ev.has('sell')) s.ev.emit('sell', { unit, cell, fish: value.fish, purr: value.purr });
  return null;
}

export function cmdMolt(s: Sim, cell: number, classId: ClassId): Fail | null {
  const g = guard(s);
  if (g) return g;
  if (!Number.isInteger(cell) || cell < 0 || cell >= CELL_COUNT) return 'invalid_cell';
  const unit = s.units[cell];
  if (!unit) return 'empty_cell';
  if (unit.rarityIndex >= 4 || !s.allowedClasses.includes(classId)) return 'not_available';
  if (unit.spec.classId === classId) return 'nothing_to_do';
  if (s.molts >= MOLT_LIMIT) return 'molt_limit';
  if (s.purr < MOLT_COST) return 'not_enough_purr';
  addPurr(s, -MOLT_COST, 'molt');
  s.molts++;
  unit.removed = true;
  const result = makeUnit(s, UNIT_GRID[classId][unit.rarityIndex] as UnitId, cell, MERGE_START_CHARGE);
  s.units[cell] = result;
  refresh(s);
  if (s.ev.has('molt')) s.ev.emit('molt', { from: unit, result, cell });
  return null;
}

export function awakenCheck(s: Sim, cell: number): Fail | null {
  const g = guard(s);
  if (g) return g;
  if (!Number.isInteger(cell) || cell < 0 || cell >= CELL_COUNT) return 'invalid_cell';
  const unit = s.units[cell];
  if (!unit) return 'empty_cell';
  if (unit.rarityIndex !== 3) return 'not_legendary';
  if ((s.tier[unit.classIndex] as number) < AWAKEN_MIN_TIER) return 'synergy_too_low';
  if (s.purr < AWAKEN_COST) return 'not_enough_purr';
  return null;
}

export function cmdAwaken(s: Sim, cell: number): Fail | null {
  const fail = awakenCheck(s, cell);
  if (fail) return fail;
  const unit = s.units[cell] as SimUnit;
  addPurr(s, -AWAKEN_COST, 'awaken');
  unit.removed = true;
  const result = makeUnit(s, mythicOf(unit.id) as UnitId, cell, MERGE_START_CHARGE);
  s.units[cell] = result;
  noteRarity(s, result);
  s.awakenings++;
  refresh(s);
  if (s.ev.has('awaken')) s.ev.emit('awaken', { from: unit, result, cell });
  return null;
}

export function classUpgradeCostOf(s: Sim, classId: ClassId): number {
  const lv = s.classLevels[CLASS_INDEX[classId]] as number;
  return lv >= CLASS_UPGRADE_COSTS.length ? -1 : (CLASS_UPGRADE_COSTS[lv] as number);
}

export function cmdUpgradeClass(s: Sim, classId: ClassId): Fail | null {
  const g = guard(s);
  if (g) return g;
  const cost = classUpgradeCostOf(s, classId);
  if (cost < 0) return 'max_level';
  if (s.fish < cost) return 'not_enough_fish';
  addFish(s, -cost, 'upgrade');
  const ci = CLASS_INDEX[classId];
  s.classLevels[ci] = (s.classLevels[ci] as number) + 1;
  refresh(s);
  if (s.ev.has('upgrade')) s.ev.emit('upgrade', { kind: 'class', classId, level: s.classLevels[ci] as number });
  return null;
}

export function summonGradeCostOf(s: Sim): number {
  return s.grade >= SUMMON_GRADE_COSTS.length ? -1 : (SUMMON_GRADE_COSTS[s.grade] as number);
}

export function cmdUpgradeSummon(s: Sim): Fail | null {
  const g = guard(s);
  if (g) return g;
  const cost = summonGradeCostOf(s);
  if (cost < 0) return 'max_level';
  if (s.fish < cost) return 'not_enough_fish';
  addFish(s, -cost, 'upgrade');
  s.grade++;
  if (s.ev.has('upgrade')) s.ev.emit('upgrade', { kind: 'summon', classId: null, level: s.grade });
  return null;
}
