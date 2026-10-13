/**
 * The on / off switch of the cats' skills (docs/qa/directive_2026-10-13_skills_build.md, decision 9). The simulation takes `BattleInit.sp`
 * (absent = on, so its tests exercise the skills); THIS is the one place that decides what the app passes in, for every way it starts a
 * battle (`Profile.prepareRun` for the chapters, the daily challenge, endless mode, the gold dungeon and the tutorial, and the debug
 * battle route). A run keeps the value it started with: a saved run carries it in its own init.
 *
 *  - `SKILLS_ON` is the default. It stays `false` until all twelve skills are in, so testers on the public build keep playing the game they
 *    know.
 *  - The URL parameter `sp=1` / `sp=0` overrides it, with or without the debug flag, so the owner can preview with `?sp=1` and compare.
 *    Anything else (`sp=`, `sp=2`, `sp=on`) is ignored.
 */
import type { BattleInit } from '@/game/api';

export const SKILLS_ON = false;

/** `sp=1` -> true, `sp=0` -> false, anything else -> null (the constant decides). */
export function spParam(params: URLSearchParams): boolean | null {
  const v = params.get('sp');
  return v === '1' ? true : v === '0' ? false : null;
}

/** The query string of the page the app is running in ('' outside a browser). */
function pageParams(): URLSearchParams {
  return new URLSearchParams(typeof location === 'undefined' ? '' : location.search);
}

/** Whether a battle started now plays with skills: the URL parameter if it has one, otherwise `SKILLS_ON`. */
export function skillsOn(params: URLSearchParams = pageParams()): boolean {
  return spParam(params) ?? SKILLS_ON;
}

/**
 * The init a saved run resumes with. A run saved before the skills existed has no `sp` field: it began without them, so it plays on
 * without them (the simulation reads a missing field as "on", which is right for its tests and wrong for such a run). A run that has
 * the field keeps its own value, whatever the switch says now.
 */
export function resumeInit(init: BattleInit): BattleInit {
  return init.sp === undefined ? { ...init, sp: false } : init;
}
