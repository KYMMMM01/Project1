/**
 * The tutorial's wave-4 elite must not be lost by a player who does what the lessons say. The player here is the obedient one the playtests found: three free
 * summons, the merge, the suggested card of the pick of three, one drag onto the sun cell, and a summon each time the free-play nudge (src/view/hud/tutorialFlow.ts)
 * points at the button. Every seed below was lost by that player when the nudge went quiet at six cats and the elite had the normal run's forty seconds.
 */
import { describe, expect, it } from 'vitest';
import { TICK, ELITE_LIMITS } from '@/game/data/balance';
import { CLASS_IDS } from '@/game/api';
import { unitClass, unitRarityIndex } from '@/game/data/roster';
import { TUTORIAL_ELITE_EXTRA_TIME } from '@/game/sim/tutorial';
import { NUDGE_AFTER, nudgeDue } from '@/view/hud/tutorialFlow';
import { advance, newSim } from './simHelpers';

type Sim = ReturnType<typeof newSim>;

const catsOn = (s: Sim): number => s.units.filter(Boolean).length;
const isLost = (s: Sim): boolean => s.phase === 'lost';
const tierOf = (s: Sim): number => Math.max(...CLASS_IDS.map((c) => s.synergyTier(c)));

/** Seconds of the elite's limit left when it fell, or null when the run was lost (or the elite never came). */
function obedientRun(seed: number): { left: number | null; lost: boolean; cats: number } {
  const s = newSim({ mode: 'tutorial', seed });
  for (let i = 0; i < 3; i++) s.summon();
  const cells: Record<string, number[]> = {};
  s.units.forEach((u, i) => {
    if (u) (cells[u.id] ||= []).push(i);
  });
  for (const id in cells) {
    const pair = cells[id] as number[];
    if (pair.length >= 2) s.drop(pair[0] as number, pair[1] as number);
  }
  let idle = 0;
  let nudges = 0;
  let tap = -1;
  let sunDone = false;
  let spawnedAt = -1;
  let left: number | null = null;
  for (let guard = 0; guard < 400000 && s.wave < 5; guard++) {
    if (s.phase === 'won' || s.phase === 'lost') break;
    if (s.phase === 'choice') {
      if (s.pending?.kind === 'summon') {
        const options = s.pending.options as string[];
        const board = s.units.filter(Boolean).map((u) => u!.id);
        let best = 0;
        let bestScore = -1;
        options.forEach((id, i) => {
          const same = board.includes(id as never);
          const onClass = board.some((b) => unitClass(b as never) === unitClass(id as never) && unitRarityIndex(b as never) >= 1);
          const score = unitRarityIndex(id as never) * 2 + (onClass && !same ? 5 : 0) + (same ? 1 : 0);
          if (score > bestScore) {
            bestScore = score;
            best = i;
          }
        });
        s.pickSummon(best);
      } else {
        s.pickRelic(0);
      }
      continue;
    }
    if (!sunDone && s.sunbeams.length > 0 && tierOf(s) >= 1 && s.wave >= 3 && s.wave < 6) {
      sunDone = true;
      const to = s.sunbeams.find((c) => !s.units[c]);
      const from = s.units.findIndex((u, i) => u && !s.sunbeams.includes(i));
      if (to !== undefined && from >= 0) s.drop(from, to);
    }
    // the free-play nudge: fish unspent and room on the board; the player taps Summon a beat after the paw shows
    const cats = catsOn(s);
    const waiting = s.phase === 'wave' && cats < s.units.length && s.fish >= s.summonCost();
    if (!waiting) {
      idle = 0;
      tap = -1;
    } else if (tap >= 0) {
      tap -= TICK;
      if (tap <= 0) {
        s.summon();
        idle = 0;
        tap = -1;
      }
    } else {
      idle += TICK;
      if (nudgeDue(idle, nudges, cats)) {
        nudges++;
        tap = 1.5;
      }
    }
    s.step(TICK);
    if (s.wave === 4 && s.boss && spawnedAt < 0) spawnedAt = s.time;
    if (s.wave === 4 && spawnedAt >= 0 && !s.boss && left === null && !isLost(s)) left = s.waveDuration - (s.time - spawnedAt);
  }
  return { left, lost: isLost(s), cats: catsOn(s) };
}

describe('the elite of the tutorial\'s wave 4', () => {
  it('has the normal run\'s limit and a little more, in the tutorial only', () => {
    const tutorial = newSim({ mode: 'tutorial' });
    tutorial.summon();
    advance(tutorial, 3.05);
    tutorial.wave = 3;
    tutorial.stage = 'between';
    tutorial.stageTimer = TICK;
    advance(tutorial, 0.2);
    expect(tutorial.waveKind).toBe('elite');
    expect(tutorial.waveDuration).toBe((ELITE_LIMITS[0] as number) + TUTORIAL_ELITE_EXTRA_TIME);
    const chapter = newSim({ mode: 'chapter' });
    advance(chapter, 3.05);
    chapter.wave = 3;
    chapter.stage = 'between';
    chapter.stageTimer = TICK;
    advance(chapter, 0.2);
    expect(chapter.waveKind).toBe('elite');
    expect(chapter.waveDuration).toBe(ELITE_LIMITS[0] as number);
  });

  it('is not lost by a player who answers every nudge (seeds the old numbers lost)', () => {
    for (const seed of [23, 80, 105, 173, 230, 247, 351, 362]) {
      const run = obedientRun(seed);
      expect(run.lost, `seed ${seed} lost with ${run.cats} cats`).toBe(false);
      expect(run.left, `seed ${seed}`).not.toBeNull();
    }
  });

  it('is lost by hardly any such player: at most one seed in a hundred and fifty (it was seven)', () => {
    let lost = 0;
    for (let seed = 1; seed <= 150; seed++) if (obedientRun(seed).lost) lost++;
    expect(lost).toBeLessThanOrEqual(1);
  }, 120_000);

  it('keeps the nudge coming until the board is eight cats thick', () => {
    expect(nudgeDue(NUDGE_AFTER, 3, 7)).toBe(true);
    expect(nudgeDue(NUDGE_AFTER, 3, 8)).toBe(false);
  });
});
