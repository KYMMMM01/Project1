/**
 * The script of mode 'tutorial' (the first eight waves of chapter 1 at 0.7 health). Every system the
 * lessons teach has to enter the game at the moment it is taught, so the board starts without sunbeams
 * and the wave starts below add what a lesson needs to be doable: a pile of fish for the two upgrades,
 * and a box of kittens that crowds the board for the selling lesson. Other modes never come here.
 */
import type { UnitId } from '../api';
import { CLASS_UPGRADE_COSTS, SUMMON_GRADE_COSTS } from '../data/balance';
import { CELL_COUNT } from '../geometry';
import { placeRandomCommon } from './board';
import { addFish } from './economy';
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

function emptyCells(s: Sim): number {
  let n = 0;
  for (let c = 0; c < CELL_COUNT; c++) if (s.units[c] === null) n++;
  return n;
}

/** Called by `startWave` after the wave's own start: what the script adds to this wave. */
export function tutorialWaveStart(s: Sim, wave: number): void {
  if (wave === TUTORIAL_FISH_WAVE && s.fish < TUTORIAL_FISH_FLOOR) addFish(s, TUTORIAL_FISH_FLOOR - s.fish, 'wave');
  if (wave === TUTORIAL_GIFT_WAVE) {
    for (let i = 0; i < TUTORIAL_GIFT_MAX && emptyCells(s) > TUTORIAL_GIFT_FREE; i++) {
      if (!placeRandomCommon(s, s.rng.toy.next(), s.rng.toy.next())) break;
    }
  }
}
