import { describe, expect, it } from 'vitest';
import { AWAKEN_COST, AWAKEN_MIN_TIER, CLASS_UPGRADE_COSTS, FIRST_SUN_CELLS, MOLT_COSTS, SUMMON_GRADE_COSTS, TICK } from '@/game/data/balance';
import { unitRarityIndex } from '@/game/data/roster';
import { createBot, type BotPolicy } from '@/game/sim/bots';
import { createBattle } from '@/game/sim/create';
import {
  giveKing, TUTORIAL_FISH_FLOOR, TUTORIAL_FISH_WAVE, TUTORIAL_GIFT_FREE, TUTORIAL_GIFT_MAX, TUTORIAL_GIFT_WAVE, TUTORIAL_KING_WAVE, TUTORIAL_PICK_WAVE,
  TUTORIAL_PURR_FLOOR,
} from '@/game/sim/tutorial';
import { advance, initOf, newSim, put, record, slay } from './simHelpers';

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
    // the wave also brings the king and its second kind (see the next block): the box itself is the kittens among what was placed
    const kittens = placed.filter((p) => unitRarityIndex(p.unit.id) === 0);
    expect(kittens.length).toBeLessThanOrEqual(TUTORIAL_GIFT_MAX);
    expect(placed.every((p) => p.source === 'relic')).toBe(true);
    expect(now - cats).toBe(placed.length);
    expect(empties <= TUTORIAL_GIFT_FREE || kittens.length === TUTORIAL_GIFT_MAX).toBe(true);
    expect(placed.length - kittens.length).toBeLessThanOrEqual(2);
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

describe('the king and the purr for the awakening lesson', () => {
  it('comes with the box of kittens in wave 6: a king that can awaken at once, and the purr for it', () => {
    expect(TUTORIAL_KING_WAVE).toBe(TUTORIAL_GIFT_WAVE);
    const sim = newSim({ mode: 'tutorial' });
    enter(sim, TUTORIAL_KING_WAVE - 1);
    expect(sim.units.some((u) => u && u.rarityIndex === 3)).toBe(false);
    const purrBefore = sim.purr;
    const placed = record(sim, 'summon');
    sim.stage = 'between';
    sim.stageTimer = TICK;
    advance(sim, 0.1);
    expect(sim.wave).toBe(TUTORIAL_KING_WAVE);
    const king = sim.units.findIndex((u) => u && u.rarityIndex === 3);
    expect(king).toBeGreaterThanOrEqual(0);
    expect(sim.canAwaken(king)).toBeNull();
    expect(sim.purr).toBeGreaterThanOrEqual(AWAKEN_COST);
    expect(sim.purr).toBeGreaterThan(purrBefore);
    // it is announced like the kittens' box (a toy's gift), in front of it, and the box still leaves its two free cells
    expect(placed.some((p) => unitRarityIndex(p.unit.id) === 3 && p.source === 'relic')).toBe(true);
    expect(placed.findIndex((p) => unitRarityIndex(p.unit.id) === 3)).toBeLessThan(placed.findIndex((p) => unitRarityIndex(p.unit.id) === 0));
    const free = sim.units.filter((u) => u === null).length;
    const kittens = placed.filter((p) => unitRarityIndex(p.unit.id) === 0).length;
    expect(free <= TUTORIAL_GIFT_FREE || kittens === TUTORIAL_GIFT_MAX).toBe(true);
    // and the player's awakening works: the guardian stands where the king stood, for the price
    const purr = sim.purr;
    expect(sim.awaken(king)).toBeNull();
    expect(sim.units[king]?.rarityIndex).toBe(4);
    expect(sim.purr).toBe(purr - AWAKEN_COST);
  });

  it('leaves the purr of the molt lesson to be spent first: the floor holds the awakening and the dearest molt', () => {
    expect(TUTORIAL_PURR_FLOOR).toBe(AWAKEN_COST + Math.max(...MOLT_COSTS));
    const sim = newSim({ mode: 'tutorial' });
    enter(sim, TUTORIAL_KING_WAVE - 1);
    sim.purr = 0;
    sim.stage = 'between';
    sim.stageTimer = TICK;
    advance(sim, 0.1);
    expect(sim.purr).toBe(TUTORIAL_PURR_FLOOR);
    // a player who has more keeps it
    const rich = newSim({ mode: 'tutorial' });
    enter(rich, TUTORIAL_KING_WAVE - 1);
    rich.purr = 40;
    rich.stage = 'between';
    rich.stageTimer = TICK;
    advance(rich, 0.1);
    expect(rich.purr).toBe(40);
  });

  it('gives a king and, when the class needs one, a second kind, of the class the board is furthest with', () => {
    // nothing but kittens: the first class gets a king and a rare cat beside it
    const bare = newSim({ mode: 'tutorial' });
    put(bare, 0, 'w_paw');
    put(bare, 1, 'r_sling');
    const first = giveKing(bare);
    expect(first).toEqual(['w_samurai', 'w_sword']);
    const k = bare.units.findIndex((u) => u?.id === 'w_samurai');
    expect(bare.tier[0]).toBeGreaterThanOrEqual(AWAKEN_MIN_TIER);
    bare.purr = AWAKEN_COST;
    expect(bare.canAwaken(k)).toBeNull();

    // a ranger epic already makes one kind: the king alone completes the step
    const ranger = newSim({ mode: 'tutorial' });
    put(ranger, 0, 'w_sword');
    put(ranger, 1, 'r_ninja');
    put(ranger, 2, 'm_fire');
    put(ranger, 3, 'm_storm');
    // the mages have two kinds, the others one: the mages are furthest
    expect(giveKing(ranger)).toEqual(['m_frost']);

    // a king the class already has is the player's own: only the kind it lacks comes
    const own = newSim({ mode: 'tutorial' });
    put(own, 0, 'w_samurai');
    expect(giveKing(own)).toEqual(['w_sword']);
    const owned = newSim({ mode: 'tutorial' });
    put(owned, 0, 'w_samurai');
    put(owned, 1, 'w_viking');
    expect(giveKing(owned)).toEqual([]);
  });

  it('gives what fits and nothing when the board is full', () => {
    const tight = newSim({ mode: 'tutorial' });
    for (let c = 0; c < tight.units.length - 1; c++) put(tight, c, 'w_paw');
    // one cell: the king alone (its second kind has no room)
    expect(giveKing(tight)).toEqual(['w_samurai']);
    expect(tight.units.every((u) => u !== null)).toBe(true);
    expect(giveKing(tight)).toEqual([]);
  });

  it('is only for the tutorial: no other mode is handed a king in wave 6', () => {
    for (const mode of ['chapter', 'daily', 'endless'] as const) {
      const sim = newSim({ mode });
      advance(sim, 3.05);
      sim.wave = TUTORIAL_KING_WAVE - 1;
      sim.stage = 'between';
      sim.stageTimer = TICK;
      advance(sim, 0.1);
      expect(sim.wave, mode).toBe(TUTORIAL_KING_WAVE);
      expect(sim.units.some((u) => u && u.rarityIndex >= 3), mode).toBe(false);
      expect(sim.purr, mode).toBeLessThan(AWAKEN_COST);
    }
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
