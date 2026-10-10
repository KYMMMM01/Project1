/**
 * The script of mode 'tutorial' (the first eight waves of chapter 1 at 0.7 health). Every system the
 * lessons teach has to enter the game at the moment it is taught, so the board starts without sunbeams
 * and the wave starts below add what a lesson needs to be doable: a pile of fish for the two upgrades,
 * a box of kittens that crowds the board for the selling lesson, and a king with the purr to awaken it.
 * Other modes never come here.
 */
import { CLASS_IDS, type ClassId, type UnitId } from '../api';
import { AWAKEN_COST, AWAKEN_MIN_TIER, CLASS_UPGRADE_COSTS, MOLT_COSTS, SUMMON_GRADE_COSTS, SYNERGY_MIN_RANK } from '../data/balance';
import { tierForDistinct } from '../data/classes';
import { UNIT_GRID } from '../data/roster';
import { CELL_COUNT } from '../geometry';
import { placeGift, placeRandomCommon } from './board';
import { addFish, addPurr } from './economy';
import type { Sim } from './sim';

/**
 * The first three summons are free and fixed: two twins to merge and a ranger to start a second class. The ranger is a rare one: the
 * kitten rank does not count toward a synergy (v1.4), so the epic of the scripted pick-of-three completes two kinds for either class.
 */
export const TUTORIAL_SCRIPT: readonly UnitId[] = ['w_paw', 'w_paw', 'r_archer'];

/** The wave that opens the scripted pick-of-three (the sim's `pickSummon` brings the sunbeams once it is answered). */
export const TUTORIAL_PICK_WAVE = 3;
/** Act 2 begins: the fish are topped up to this much so the grade and class upgrades can be bought once each and a cat or two more. */
export const TUTORIAL_FISH_WAVE = 5;
export const TUTORIAL_FISH_FLOOR = (SUMMON_GRADE_COSTS[0] as number) + (CLASS_UPGRADE_COSTS[0] as number) + 30;
/** A box of kittens tips out onto the board until only this many cells are free (at most `TUTORIAL_GIFT_MAX` of them: enough to fill the five extra cells of the 5 x 5 board as well). */
export const TUTORIAL_GIFT_WAVE = 6;
export const TUTORIAL_GIFT_FREE = 2;
export const TUTORIAL_GIFT_MAX = 13;
/**
 * The same wave brings a king of the class the board is furthest with, and the purr to awaken it (the lesson on awakening comes after the
 * selling lesson, whose crowded board it is placed before). The king's class has the synergy step the awakening asks for, with a rare or an
 * epic cat of its class beside it when it needs one.
 */
export const TUTORIAL_KING_WAVE = 6;
/** The purr the board holds after the gift: the awakening, and over it what the dearest molt costs (the molt lesson may have spent some). */
export const TUTORIAL_PURR_FLOOR = AWAKEN_COST + Math.max(...MOLT_COSTS);

/** The rank of the cats that awaken, and the ranks (besides it) that count toward a synergy, in the order a gift fills a class's missing kinds. */
const KING_RANK = 3;
const FILL_RANKS: readonly number[] = [1, 2, 4];

function emptyCells(s: Sim): number {
  let n = 0;
  for (let c = 0; c < CELL_COUNT; c++) if (s.units[c] === null) n++;
  return n;
}

/** The ranks of one class that count toward its synergy and stand on the board, and how many cats of the class there are. */
function classRanks(s: Sim, classIndex: number): { ranks: Set<number>; cats: number } {
  const ranks = new Set<number>();
  let cats = 0;
  for (let c = 0; c < CELL_COUNT; c++) {
    const u = s.units[c];
    if (!u || u.classIndex !== classIndex) continue;
    cats++;
    if (u.rarityIndex >= SYNERGY_MIN_RANK) ranks.add(u.rarityIndex);
  }
  return { ranks, cats };
}

/**
 * Hands the player a king that can awaken: of the class with the most kinds on the board (then the most cats; the first on a tie), with the
 * kinds it needs for the awakening's synergy step beside it. Gives nothing the board already has, and nothing at all when it has no room.
 * Returns the units placed, in order.
 */
export function giveKing(s: Sim): UnitId[] {
  let best = 0;
  let bestKinds = -1;
  let bestCats = -1;
  for (let ci = 0; ci < CLASS_IDS.length; ci++) {
    const { ranks, cats } = classRanks(s, ci);
    if (ranks.size > bestKinds || (ranks.size === bestKinds && cats > bestCats)) {
      best = ci;
      bestKinds = ranks.size;
      bestCats = cats;
    }
  }
  const line = UNIT_GRID[CLASS_IDS[best] as ClassId];
  const { ranks } = classRanks(s, best);
  const placed: UnitId[] = [];
  const add = (rank: number): boolean => {
    if (emptyCells(s) === 0) return false;
    const id = line[rank] as UnitId;
    if (!placeGift(s, id)) return false;
    ranks.add(rank);
    placed.push(id);
    return true;
  };
  // A king the class already has (or has already awakened) is the player's own: only the missing kinds come.
  if (!ranks.has(KING_RANK) && !ranks.has(KING_RANK + 1) && !add(KING_RANK)) return placed;
  for (const rank of FILL_RANKS) {
    if (tierForDistinct(ranks.size) >= AWAKEN_MIN_TIER) break;
    if (!ranks.has(rank) && !add(rank)) break;
  }
  return placed;
}

/** Called by `startWave` after the wave's own start: what the script adds to this wave. */
export function tutorialWaveStart(s: Sim, wave: number): void {
  if (wave === TUTORIAL_FISH_WAVE && s.fish < TUTORIAL_FISH_FLOOR) addFish(s, TUTORIAL_FISH_FLOOR - s.fish, 'wave');
  if (wave === TUTORIAL_KING_WAVE) {
    giveKing(s);
    if (s.purr < TUTORIAL_PURR_FLOOR) addPurr(s, TUTORIAL_PURR_FLOOR - s.purr, 'wave');
  }
  if (wave === TUTORIAL_GIFT_WAVE) {
    for (let i = 0; i < TUTORIAL_GIFT_MAX && emptyCells(s) > TUTORIAL_GIFT_FREE; i++) {
      if (!placeRandomCommon(s, s.rng.toy.next(), s.rng.toy.next())) break;
    }
  }
}
