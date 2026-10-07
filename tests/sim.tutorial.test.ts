import { describe, expect, it } from 'vitest';
import { CLASS_UPGRADE_COSTS, FIRST_SUN_CELLS, SUMMON_GRADE_COSTS, TICK } from '@/game/data/balance';
import { unitRarityIndex } from '@/game/data/roster';
import { createBot, type BotPolicy } from '@/game/sim/bots';
import { createBattle } from '@/game/sim/create';
import {
  TUTORIAL_FISH_FLOOR, TUTORIAL_FISH_WAVE, TUTORIAL_GIFT_FREE, TUTORIAL_GIFT_MAX, TUTORIAL_GIFT_WAVE, TUTORIAL_PICK_WAVE,
} from '@/game/sim/tutorial';
import { advance, initOf, newSim, record, slay } from './simHelpers';

/** Gets a tutorial sim to the first frame of `wave` (the field is emptied of enemies as it goes, so the run cannot be lost on the way). */
function enter(sim: ReturnType<typeof newSim>, wave: number): void {
  sim.summon();
  for (let guard = 0; guard < 4000 && sim.wave < wave; guard++) {
    if (sim.phase === 'choice' && sim.pending?.kind === 'summon') sim.pickSummon(0);
    else if (sim.phase === 'choice') sim.pickRelic(0);
    for (const e of sim.enemies.slice()) e.hp = 0;
    sim.enemies.length = 0;
    sim.step(TICK);
    if (sim.boss) slay(sim);
  }
}

describe('the tutorial script', () => {
  it('starts without sunbeams and brings them when the scripted pick-of-three is answered, not before', () => {
    const sim = newSim({ mode: 'tutorial' });
    expect(sim.sunbeams).toEqual([]);
    const sun = record(sim, 'sunbeams');
    sim.summon();
    advance(sim, 3.1);
    advance(sim, 12 * (TUTORIAL_PICK_WAVE - 1) + 0.3);
    expect(sim.phase).toBe('choice');
    expect(sim.sunbeams).toEqual([]);
    expect(sun).toHaveLength(0);
    expect(sim.pickSummon(0)).toBeNull();
    expect(sim.sunbeams).toEqual([...FIRST_SUN_CELLS]);
    expect(sun).toEqual([{ cells: [...FIRST_SUN_CELLS] }]);
  });

  it('leaves every other mode as it was: sunbeams from the first frame, no top-up, no kittens', () => {
    for (const mode of ['chapter', 'daily', 'endless'] as const) {
      expect(newSim({ mode }).sunbeams, mode).toEqual([...FIRST_SUN_CELLS]);
      for (const wave of [TUTORIAL_FISH_WAVE, TUTORIAL_GIFT_WAVE]) {
        const sim = newSim({ mode });
        advance(sim, 3.05);
        sim.fish = 0;
        sim.wave = wave - 1;
        sim.stage = 'between';
        sim.stageTimer = TICK;
        advance(sim, 0.1);
        expect(sim.wave, mode).toBe(wave);
        expect(sim.fish, mode).toBeLessThan(TUTORIAL_FISH_FLOOR);
        expect(sim.units.filter(Boolean), mode).toHaveLength(0);
      }
    }
  });

  it('tops the fish up when act 2 begins so both upgrades can be bought once', () => {
    expect(TUTORIAL_FISH_FLOOR).toBeGreaterThanOrEqual((SUMMON_GRADE_COSTS[0] as number) + (CLASS_UPGRADE_COSTS[0] as number));
    const sim = newSim({ mode: 'tutorial' });
    enter(sim, TUTORIAL_FISH_WAVE - 1);
    sim.fish = 5;
    const fish = record(sim, 'fish');
    sim.stage = 'between';
    sim.stageTimer = TICK;
    advance(sim, 0.1);
    expect(sim.wave).toBe(TUTORIAL_FISH_WAVE);
    expect(sim.fish).toBeGreaterThanOrEqual(TUTORIAL_FISH_FLOOR);
    expect(fish.some((f) => f.reason === 'wave' && f.delta > 0)).toBe(true);
    // Rich players keep what they have.
    const rich = newSim({ mode: 'tutorial' });
    enter(rich, TUTORIAL_FISH_WAVE - 1);
    rich.fish = 900;
    rich.stage = 'between';
    rich.stageTimer = TICK;
    advance(rich, 0.1);
    expect(rich.fish).toBeGreaterThanOrEqual(900);
  });

  it('tips a box of kittens onto the board in wave 6 until only a couple of cells are free', () => {
    const sim = newSim({ mode: 'tutorial' });
    enter(sim, TUTORIAL_GIFT_WAVE - 1);
    const cats = sim.units.filter(Boolean).length;
    const placed = record(sim, 'summon');
    sim.stage = 'between';
    sim.stageTimer = TICK;
    advance(sim, 0.1);
    expect(sim.wave).toBe(TUTORIAL_GIFT_WAVE);
    const now = sim.units.filter(Boolean).length;
    const empties = sim.units.length - now;
    expect(placed.length).toBeLessThanOrEqual(TUTORIAL_GIFT_MAX);
    expect(placed.every((p) => p.source === 'relic')).toBe(true);
    expect(now - cats).toBe(placed.length);
    expect(empties <= TUTORIAL_GIFT_FREE || placed.length === TUTORIAL_GIFT_MAX).toBe(true);
    expect(placed.every((p) => unitRarityIndex(p.unit.id) === 0)).toBe(true);
  });

  it('pays purr for the wave-4 elite, and the act clear adds two more for the molt lesson', () => {
    const sim = newSim({ mode: 'tutorial' });
    const purr = record(sim, 'purr');
    enter(sim, 4);
    expect(sim.waveKind).toBe('elite');
    advance(sim, 1.1);
    expect(sim.boss).not.toBeNull();
    slay(sim);
    advance(sim, 1.7);
    expect(purr.some((p) => p.delta > 0)).toBe(true);
    expect(sim.purr).toBeGreaterThanOrEqual(sim.moltCost());
  });
});

describe('the tutorial can be won by a player who only summons and merges', () => {
  it.each<BotPolicy>(['merge', 'synergy'])('a %s bot wins on most seeds', (policy) => {
    let wins = 0;
    const seeds = [3, 5, 8, 13, 21, 34];
    for (const seed of seeds) {
      const battle = createBattle(initOf({ seed, mode: 'tutorial' }));
      const bot = createBot(policy, seed + 7);
      for (let tick = 0; tick < 60 * 900 && battle.phase !== 'won' && battle.phase !== 'lost'; tick++) {
        if (battle.phase === 'choice') bot.choose(battle);
        else if (tick % 15 === 0) bot.act(battle);
        battle.step(TICK);
      }
      if (battle.phase === 'won') wins++;
    }
    expect(wins).toBeGreaterThanOrEqual(5);
  });
});
