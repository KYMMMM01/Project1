/**
 * Lucky Capsule! (lucky cat, Guardian; docs/design_skills_v2.md 3.12, directive decisions 17 and 23): every 34 s a capsule falls on the cat's
 * head and opens a moment later with one of six prizes. Nothing touches an enemy; every prize is a one-time event and a lasting change to the
 * pocket or the board.
 *
 *  - The cast (`cast`): rolls the capsule's KIND once, on the `combat` stream, by the odds row `weights` (30 fish / 25 purr / 25 partner / 10
 *    more / 7 toy / 3 guardian, cumulative 30 / 55 / 80 / 90 / 97 / 100). A `more` capsule rolls a second time, in the same tick, for the small
 *    capsule inside it (`moreWeights` 25 : 7 : 3, so never fish, purr or a third `more`). Then it announces the cast (the picture knows the
 *    colour and the mark while the capsule falls) and puts the opening on the delayed list (`openDelay` 1.2 s). The item points at no cat and
 *    no enemy: the capsule opens even if the cat is sold, moved or the wave ends in between. A FISH capsule writes `fishRefund` (0.5) into the
 *    cat's gauge in the cast tick (the frame has set it to 0 just before): the next capsule comes after 17 s. Only that kind refunds, and each
 *    cat refunds its own gauge. `ready` is always true (the capsule has nothing to do with enemies); with the knob `oneAtATime` a cat waits
 *    while any capsule is in the air.
 *  - The opening (`open`, the delayed item's runner): the prize and its target are decided NOW, not at the cast (the board changes in 1.2 s).
 *    `capsuleOpen` is emitted first (so the lid can open), then the prize happens, all in the same tick:
 *      fish      `earnFish(summonCostOf x fish)`, reason 'skill'. purr  `addPurr(purr)`.
 *      partner   a twin of one of the player's commons, rares or epics: the cat chosen by `pickPartner` gets its twin on the nearest empty tile
 *                (`placeUnit`, source 'skill'), or, with no empty tile, grows one rank where it stands (`promoteUnit`). No candidate: purr 3.
 *      more      the small capsule opens `moreDelay` (1.0 s) later, same spot.
 *      toy       `Sim.capsuleToys++`: the pick opens at the end of the tick (`openCapsuleToy` in `flow.ts`). Nothing left to pick (or a tutorial): purr 5.
 *      guardian  the legendary `pickGuardian` chooses is awakened for free (`awakenUnit(..., true)`). Nobody to awaken (or a tutorial): purr 10.
 *  - The twin and the awakening never lower a class's synergy step (`partnerSafe`, `guardianPick.safe`): the step the class would have after
 *    the merge of the twin pair (or after the awakening) is worked out from the board and a cat whose step would fall is not a candidate.
 *  - Nothing here is saved, no new random stream; `Math.random` is not used. A win drops the capsules in the air; a defeat keeps them (a revive).
 */
import { Rng } from '@/core/rng';
import { SP_CAPSULE_KINDS, UNIT_IDS, type RelicId, type SpCapsuleKind, type SpCapsuleResult } from '../../api';
import { SYNERGY_MIN_RANK } from '../../data/balance';
import { tierForDistinct } from '../../data/classes';
import { RELIC_RARITY } from '../../data/roster';
import { SP_ROWS } from '../../data/spSkills';
import { CELL_COUNT, cellCenterX, cellCenterY } from '../../geometry';
import { awakenUnit, awakenable, placeUnit, promoteUnit, summonCostOf } from '../board';
import { addPurr, earnFish } from '../economy';
import type { Sim } from '../sim';
import type { SimUnit } from '../types';
import { announceCast } from './cast';
import { later, registerLater, type LaterItem } from './later';
import { nearestEmpty } from './near';
import type { SpHandler } from './types';

const ROW = SP_ROWS.capsule;

/** Index of each kind in the roll's order (what the delayed item carries in `a` and `b`). */
const KIND_INDEX: Readonly<Record<SpCapsuleKind, number>> = Object.fromEntries(SP_CAPSULE_KINDS.map((k, i) => [k, i])) as Record<SpCapsuleKind, number>;
/** `b` of the delayed item of a small capsule (one that rolled out of a `more` capsule); a big capsule carries its small one's kind index in `b`, or -1. */
const SMALL = -2;
/** Tiles of one class in the census: the rarity indexes 0..4. */
const RANKS = 5;

// ───────────────────────────── the roll ─────────────────────────────

/** How many draws of each purpose this battle has made in the wave it is in (only the row's `rollsFrom: 'hash'` option reads it). Not saved. */
const draws = new WeakMap<Sim, { wave: number; kind: number; toy: number }>();

function nextOrdinal(s: Sim, purpose: 'kind' | 'toy'): number {
  let book = draws.get(s);
  if (!book) draws.set(s, (book = { wave: -1, kind: 0, toy: 0 }));
  if (book.wave !== s.wave) {
    book.wave = s.wave;
    book.kind = 0;
    book.toy = 0;
  }
  return book[purpose]++;
}

/**
 * The random source of one draw of the capsule: the kind of a capsule (`'kind'`, which may take two numbers from it) or the toys of a pick
 * (`'toy'`, which takes many). By default it is the battle's `combat` stream (the design's choice, rolled at the cast and at the tick end).
 * With the row's `rollsFrom: 'hash'` (the design's alternative against replaying a wave from a save to re-roll a bad capsule) it is a fresh
 * generator seeded by the run's seed, the wave and the order of the draw within that wave, so the same wave played again gives the same capsules
 * whatever the combat stream did in between, and the stream is not touched at all.
 */
export function capsuleRng(s: Sim, purpose: 'kind' | 'toy'): Rng {
  if (ROW.rollsFrom === 'combat') return s.rng.combat;
  const seed = s.init.seed;
  let h = Math.imul((seed ^ (seed >>> 16)) >>> 0, 0x45d9f3b) >>> 0;
  h = Math.imul((h ^ Math.imul(s.wave + 1, 0x9e3779b1) ^ Math.imul(nextOrdinal(s, purpose) + 1, 0x85ebca6b) ^ (purpose === 'toy' ? 0x27d4eb2f : 0)) >>> 0, 0x01000193) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return new Rng((h ^ (h >>> 16)) >>> 0);
}

/** The kind a roll of `rng` lands on. `weights` are walked in the order of the kinds, so the thresholds are the cumulative sums. */
function rollKind(rng: Rng, weights: Readonly<Partial<Record<SpCapsuleKind, number>>>): SpCapsuleKind {
  let total = 0;
  for (const k of SP_CAPSULE_KINDS) total += weights[k] ?? 0;
  const r = rng.next() * total;
  let sum = 0;
  let last: SpCapsuleKind = 'fish';
  for (const k of SP_CAPSULE_KINDS) {
    const w = weights[k] ?? 0;
    if (w <= 0) continue;
    sum += w;
    last = k;
    if (r < sum) return k;
  }
  return last;
}

// ───────────────────────────── the board, counted ─────────────────────────────

/** Copies of each cat on the board (by `SimUnit.unitIndex`) and which (class, rank) places are taken. Filled by `census`, read by the two pickers. */
const copies = new Uint8Array(UNIT_IDS.length);
const present = new Uint8Array(4 * RANKS);

function census(s: Sim): void {
  copies.fill(0);
  present.fill(0);
  for (let c = 0; c < CELL_COUNT; c++) {
    const u = s.units[c];
    if (!u) continue;
    copies[u.unitIndex] = (copies[u.unitIndex] as number) + 1;
    present[u.classIndex * RANKS + u.rarityIndex] = 1;
  }
}

/** Would the class's synergy step fall if its count of different cats (`Sim.distinct`) changed by `delta`? */
function lowersStep(s: Sim, classIndex: number, delta: number): boolean {
  return tierForDistinct((s.distinct[classIndex] as number) + delta) < (s.tier[classIndex] as number);
}

function boardFull(s: Sim): boolean {
  for (let c = 0; c < CELL_COUNT; c++) if (s.units[c] === null) return false;
  return true;
}

// ───────────────────────────── the partner ─────────────────────────────

/** Is the place one rank above the cat (in its class) free on the board? Merging the cat with a twin would fill it. */
function rungFree(u: SimUnit): boolean {
  return present[u.classIndex * RANKS + u.rarityIndex + 1] === 0;
}

/** Does candidate `a` come before candidate `b` in the row's order (`partnerOrder`; the lower tile last of all)? */
function partnerBefore(a: SimUnit, b: SimUnit): boolean {
  for (const key of ROW.partnerOrder) {
    if (key === 'noPartner') {
      const x = copies[a.unitIndex] === 1;
      const y = copies[b.unitIndex] === 1;
      if (x !== y) return x;
    } else if (key === 'fillsEmptyRung') {
      const x = rungFree(a);
      const y = rungFree(b);
      if (x !== y) return x;
    } else if (key === 'higherRank') {
      if (a.rarityIndex !== b.rarityIndex) return a.rarityIndex > b.rarityIndex;
    } else if (a.cell !== b.cell) {
      return a.cell < b.cell;
    }
  }
  return a.cell < b.cell;
}

/**
 * The step test of the partner (needs `census`): the merge of the cat with its new twin (or the cat's promotion) takes the cat's own rank off
 * the board when no other copy stands there (`copies` is 1; the commons do not count towards a step at all, `SYNERGY_MIN_RANK`) and puts the
 * next rank on it when that place is free: `delta = (rung free ? 1 : 0) - (no twin and rank >= SYNERGY_MIN_RANK ? 1 : 0)`. Does the class's
 * step fall by that?
 */
function mergeLowersStep(s: Sim, u: SimUnit): boolean {
  const twin = (copies[u.unitIndex] as number) >= 2;
  const delta = (rungFree(u) ? 1 : 0) - (!twin && u.rarityIndex >= SYNERGY_MIN_RANK ? 1 : 0);
  return lowersStep(s, u.classIndex, delta);
}

/** For the tests, which check the calculation against a real merge and a real promotion: would a twin of `u`, merged, lower its class's step? */
export function partnerWouldLowerStep(s: Sim, u: SimUnit): boolean {
  census(s);
  return mergeLowersStep(s, u);
}

/**
 * The cat the partner capsule gives a twin to (design 3.12.2): every cat of the ranks `partnerRanks` (a common, rare or epic one), but not
 * one whose twin, once merged (or the cat, once promoted), would lower its class's synergy step (`mergeLowersStep`); of the rest, in the row's
 * order: a cat with no twin yet, one whose merge fills an empty rung of its line, the higher rank, the lower tile.
 * Reads the board, changes nothing. Null: nobody qualifies.
 */
export function pickPartner(s: Sim): SimUnit | null {
  census(s);
  let best: SimUnit | null = null;
  for (let c = 0; c < CELL_COUNT; c++) {
    const u = s.units[c];
    if (!u || u.rarityIndex < ROW.partnerRanks.min || u.rarityIndex > ROW.partnerRanks.max) continue;
    if (ROW.partnerSafe && mergeLowersStep(s, u)) continue;
    if (best === null || partnerBefore(u, best)) best = u;
  }
  return best;
}

// ───────────────────────────── the guardian ─────────────────────────────

/** Does guardian candidate `a` come before `b` in the row's order (`guardianPick.order`)? */
function guardianBefore(s: Sim, a: SimUnit, b: SimUnit): boolean {
  for (const key of ROW.guardianPick.order) {
    if (key === 'stepDesc') {
      const x = s.tier[a.classIndex] as number;
      const y = s.tier[b.classIndex] as number;
      if (x !== y) return x > y;
    } else if (key === 'classOrder') {
      if (a.classIndex !== b.classIndex) return a.classIndex < b.classIndex;
    } else if (a.cell !== b.cell) {
      return a.cell < b.cell;
    }
  }
  return a.cell < b.cell;
}

/**
 * The step test of the guardian (needs `census`): a class has one legendary cat and one mythic one, so awakening changes the count of different
 * cats of the class by `delta = (the class has no mythic yet ? 1 : 0) - (this is the only copy of that legendary ? 1 : 0)`. Does the class's
 * step fall by that?
 */
function awakeningLowersStep(s: Sim, u: SimUnit): boolean {
  const delta = (present[u.classIndex * RANKS + 4] === 0 ? 1 : 0) - (copies[u.unitIndex] === 1 ? 1 : 0);
  return lowersStep(s, u.classIndex, delta);
}

/** For the tests, which check the calculation against a real awakening: would awakening `u` (a legendary) lower its class's step? */
export function guardianWouldLowerStep(s: Sim, u: SimUnit): boolean {
  census(s);
  return awakeningLowersStep(s, u);
}

/**
 * The legendary cat the guardian capsule awakens (design 3.12.4): one the player could awaken himself (`awakenable`: its class's step is at
 * least `AWAKEN_MIN_TIER`) and, with `safe`, one whose awakening does not lower its class's step (`awakeningLowersStep`). Of the rest: the
 * highest step first, then the class order (warrior, ranger, mage, trickster), then the lower tile. Null: nobody qualifies.
 */
export function pickGuardian(s: Sim): SimUnit | null {
  census(s);
  let best: SimUnit | null = null;
  for (let c = 0; c < CELL_COUNT; c++) {
    const u = s.units[c];
    if (!u || awakenable(s, c) !== null) continue;
    if (ROW.guardianPick.safe && awakeningLowersStep(s, u)) continue;
    if (best === null || guardianBefore(s, u, best)) best = u;
  }
  return best;
}

// ───────────────────────────── the toy ─────────────────────────────

/** May the toy capsule offer this toy? (The pick leaves out the common ones, which the shop's first stages are for.) */
export function capsuleToyOk(r: RelicId): boolean {
  return ROW.toyPick.common || RELIC_RARITY[r] !== 'common';
}

/** How many toys the player does not own that the toy capsule may offer. */
function toysLeft(s: Sim): number {
  const owned = new Set<RelicId>(s.relics);
  let n = 0;
  for (const r of s.relicPool) if (!owned.has(r) && capsuleToyOk(r)) n++;
  return n;
}

// ───────────────────────────── the opening ─────────────────────────────

/**
 * A capsule opens: the delayed item says which kind (`a`) and, for a `more` capsule, which kind is inside (`b`; -2 marks the small capsule
 * itself). Decides what the prize is, announces it, then gives it.
 */
function open(s: Sim, item: LaterItem): void {
  const kind = SP_CAPSULE_KINDS[item.a] as SpCapsuleKind;
  const small = item.b === SMALL;
  const inner = item.b >= 0 ? (SP_CAPSULE_KINDS[item.b] as SpCapsuleKind) : null;
  const { x, y } = item;
  let result: SpCapsuleResult = 'purr';
  let cell = -1;
  let origin = -1;
  let purr = 0;
  let twin: SimUnit | null = null;
  switch (kind) {
    case 'fish':
      if (ROW.fullBoardFish && boardFull(s)) {
        result = 'fallback';
        purr = ROW.fullBoardFishPurr;
      } else {
        result = 'fish';
      }
      break;
    case 'purr':
      purr = ROW.purr;
      break;
    case 'partner':
      twin = pickPartner(s);
      if (!twin) {
        result = 'fallback';
        purr = ROW.fallbackPurr.partner;
        break;
      }
      cell = nearestEmpty(s, twin.cell);
      if (cell >= 0) {
        result = 'seat';
        origin = twin.cell;
      } else if (ROW.fullBoardPartnerFloor && twin.rarityIndex === 0) {
        result = 'fallback';
        purr = ROW.fallbackPurr.partner;
      } else {
        result = 'promote';
        cell = origin = twin.cell;
      }
      break;
    case 'more':
      result = 'more';
      break;
    case 'toy':
      if (s.mode === 'tutorial') {
        result = 'fallback';
        purr = ROW.tutorial.toyPurr;
      } else if (toysLeft(s) <= s.capsuleToys) {
        // Every toy the capsule may offer is owned already, or is spoken for by a pick that is waiting for the end of this tick.
        result = 'fallback';
        purr = ROW.fallbackPurr.toy;
      } else {
        result = 'toy';
      }
      break;
    case 'guardian': {
      const king = s.mode === 'tutorial' ? null : pickGuardian(s);
      if (king) {
        result = 'awaken';
        cell = king.cell;
      } else {
        result = 'fallback';
        purr = s.mode === 'tutorial' ? ROW.tutorial.guardianPurr : ROW.fallbackPurr.guardian;
      }
      break;
    }
  }
  if (s.ev.has('capsuleOpen')) s.ev.emit('capsuleOpen', { kind, small, inner, x, y, result, cell, origin, purr });
  switch (result) {
    case 'fish': earnFish(s, summonCostOf(s) * ROW.fish, 'skill', x, y); break;
    case 'purr':
    case 'fallback': addPurr(s, purr, 'skill', x, y); break;
    case 'seat': placeUnit(s, (twin as SimUnit).id, cell, 'skill'); break;
    case 'promote': promoteUnit(s, cell); break;
    case 'more': later(s, ROW.moreDelay, 'capsule', { x, y, a: KIND_INDEX[inner as SpCapsuleKind], b: SMALL }); break;
    case 'toy': s.capsuleToys++; break;
    case 'awaken': awakenUnit(s, cell, true); break;
  }
}

registerLater('capsule', open);

/** The capsules still in the air and the toy picks still waiting are dropped (a win: nothing runs after it). */
export function dropCapsules(s: Sim): void {
  s.capsuleToys = 0;
  const list = s.later;
  for (let i = list.length - 1; i >= 0; i--) if ((list[i] as LaterItem).kind === 'capsule') list.splice(i, 1);
}

/** Is a capsule in the air (on the delayed list)? */
function inTheAir(s: Sim): boolean {
  for (const item of s.later) if (item.kind === 'capsule') return true;
  return false;
}

/**
 * Every other lucky cat on the board takes the caster's gauge (0, or the fish capsule's refund). The first cat whose gauge fills casts for all
 * of them; a cat later in tile order that was full in the same tick finds its gauge emptied and does not cast.
 */
function shareGauge(s: Sim, caster: SimUnit): void {
  for (let c = 0; c < CELL_COUNT; c++) {
    const other = s.units[c];
    if (other === null || other === caster || other.id !== caster.id) continue;
    other.sp = caster.sp;
  }
}

// ───────────────────────────── the skill ─────────────────────────────

export const capsule: SpHandler = {
  /** Always: a capsule has nothing to do with the enemies (the knob `oneAtATime` makes a cat wait while a capsule is in the air). */
  ready(s) {
    return !ROW.oneAtATime || !inTheAir(s);
  },

  cast(s, u) {
    const rng = capsuleRng(s, 'kind');
    const kind = rollKind(rng, ROW.weights);
    const inner = kind === 'more' ? rollKind(rng, ROW.moreWeights) : null;
    // The fish line gives half the gauge back: the frame has just set it to 0 and this runs in the same tick.
    const refund = kind === 'fish' && ROW.fishRefund > 0;
    if (kind === 'fish') u.sp = ROW.fishRefund;
    // One gauge for the board (`sharedGauge`): every other lucky cat starts over with the caster, so several cats give one stream of capsules.
    if (ROW.sharedGauge) shareGauge(s, u);
    announceCast(s, u, {
      skill: 'capsule', data: { kind, inner, at: s.time, openDelay: ROW.openDelay, moreDelay: ROW.moreDelay, refund },
    });
    later(s, ROW.openDelay, 'capsule', {
      x: cellCenterX(u.cell), y: cellCenterY(u.cell), a: KIND_INDEX[kind], b: inner === null ? -1 : KIND_INDEX[inner],
    });
    return true;
  },
};
