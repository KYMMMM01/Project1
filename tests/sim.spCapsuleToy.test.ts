/**
 * The toy capsule of the lucky cat (docs/design_skills_v2.md 3.12.3): the only prize that stops the run in the middle of a wave. The pick opens at the
 * END of the tick the capsule opened in, offers toys the player does not own from the shop's rarity row (never below the row of stages 3 and 4, no
 * common toys, no slot kept for a counter toy), draws from the `combat` stream, has one pick and no reroll, and gives the run back to the wave where
 * it stood. This file also holds the hourglass that is picked in the middle of a boss fight, and the pick of a run resumed from a wave-start save.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RELIC_IDS, type RelicId } from '@/game/api';
import { TICK } from '@/game/data/balance';
import { COUNTER_RELICS } from '@/game/data/relics';
import { RELIC_RARITY } from '@/game/data/roster';
import { SP_ROWS } from '@/game/data/spSkills';
import { stakeRules } from '@/game/data/stakes';
import { actFeatures } from '@/game/data/waves';
import { createBattle } from '@/game/sim/create';
import { lose } from '@/game/sim/flow';
import { later } from '@/game/sim/sp/later';
import { Sim } from '@/game/sim/sim';
import { arena, castNow, enter, force, lucky, openIt, tape, targetDown } from './capsuleHelpers';
import { advance, initOf, newSim, quietWave, record } from './simHelpers';

const ROW = SP_ROWS.capsule;
const TOY_INDEX = 4;

const restores: Array<() => void> = [];
afterEach(() => {
  while (restores.length > 0) (restores.pop() as () => void)();
  vi.restoreAllMocks();
});

function turn<T extends object, K extends keyof T>(row: T, key: K, value: T[K]): void {
  const old = row[key];
  row[key] = value;
  restores.push(() => {
    row[key] = old;
  });
}

/** Opens a toy capsule at once: one counted toy capsule, one tick, and the pick (if there is one) is open at the end of it. */
function toyPick(sim: Sim): Extract<Sim['pending'], { kind: 'relic' }> | null {
  sim.capsuleToys = 1;
  sim.step(TICK);
  return sim.pending && sim.pending.kind === 'relic' ? sim.pending : null;
}

/** The toys of a pick. */
function optionsOf(sim: Sim): RelicId[] {
  const p = sim.pending;
  if (!p || p.kind !== 'relic') throw new Error('no toy pick');
  return p.options.slice();
}

// ───────────────────────────── the pick ─────────────────────────────

describe('the toy capsule\'s pick', () => {
  it('opens at the end of the tick the capsule opened in: capsuleOpen first, the relicOffer last, the same tick, the phase a choice', () => {
    const sim = arena();
    const u = lucky(sim);
    const t = tape(sim);
    let openedAt = -1;
    let offeredAt = -1;
    sim.events.on('capsuleOpen', () => (openedAt = sim.time));
    sim.events.on('relicOffer', () => (offeredAt = sim.time));
    force(sim, 'toy');
    castNow(sim, u);
    advance(sim, 1.19);
    expect(sim.phase).toBe('wave');
    expect(t.offers).toHaveLength(0);
    sim.step(TICK);
    expect(t.log).toEqual(['cast', 'open:toy:toy', 'offer:capsule']);
    expect(offeredAt).toBe(openedAt);
    expect(sim.phase).toBe('choice');
    expect(sim.capsuleToys).toBe(0);
    expect(t.opens[0]).toMatchObject({ kind: 'toy', result: 'toy', purr: 0 });
  });

  it('is one pick among the toys the player does not own, with no reroll, no common toy, from the capsule source, the same options in the event and in pending', () => {
    const sim = arena();
    sim.relics.push('cat_tower');
    const offers = record(sim, 'relicOffer');
    const pick = toyPick(sim)!;
    expect(pick).toMatchObject({ kind: 'relic', source: 'capsule', picksLeft: 1, freeRerolls: 0, paidRerollUsed: true });
    expect(pick.options).toHaveLength(sim.relicChoices);
    expect(new Set(pick.options).size).toBe(pick.options.length);
    for (const id of pick.options) {
      expect(RELIC_RARITY[id]).not.toBe('common');
      expect(id).not.toBe('cat_tower');
    }
    expect(offers).toEqual([{ options: pick.options, freeRerolls: 0, picksLeft: 1, source: 'capsule' }]);
  });

  it('offers two toys at the hardest butler level (the shop\'s own count), three otherwise', () => {
    expect(stakeRules(5).relicChoices).toBe(2);
    const hard = arena({ stake: 5 });
    expect(toyPick(hard)!.options).toHaveLength(2);
    const easy = arena();
    expect(toyPick(easy)!.options).toHaveLength(3);
  });

  it('draws from the combat stream and leaves the shop\'s toy stream (and every other) where it was', () => {
    const sim = arena();
    const before = sim.rng.states();
    toyPick(sim);
    const after = sim.rng.states();
    ['summon', 'pick', 'merge', 'toy', 'sun', 'wave', 'combat'].forEach((name, i) => {
      if (name === 'combat') expect(after[i], name).not.toBe(before[i]);
      else expect(after[i], name).toBe(before[i]);
    });
  });

  it('stops the clock and every command but the pick while it is open, and lets go of a dragged cat (a drop is refused)', () => {
    const sim = arena();
    const pick = toyPick(sim)!;
    expect(pick).not.toBeNull();
    const time = sim.time;
    sim.step(10);
    expect(sim.time).toBe(time);
    expect(sim.summon()).toBe('choice_pending');
    expect(sim.drop(3, 4)).toBe('choice_pending');
    expect(sim.callNextWave()).toBe('choice_pending');
    expect(sim.sell(3)).toBe('choice_pending');
    expect(sim.rerollRelics(false)).toBe('not_available');
    expect(sim.rerollRelics(true)).toBe('not_available');
    expect(sim.pending).toBe(pick);
    expect(sim.pickRelic(9)).toBe('not_available');
  });

  it('allows a reroll only when the row says so, and then with the capsule\'s rules (no common toy)', () => {
    turn(ROW.toyPick, 'reroll', true);
    const sim = arena({ seed: 70 });
    const before = optionsOf({ ...sim, pending: toyPick(sim) } as unknown as Sim);
    const free = sim.freeRerolls;
    expect(free).toBeGreaterThan(0);
    expect(sim.rerollRelics(false)).toBeNull();
    const after = optionsOf(sim);
    expect(after).toHaveLength(before.length);
    for (const id of after) expect(RELIC_RARITY[id]).not.toBe('common');
    expect(sim.pending).toMatchObject({ source: 'capsule' });
  });

  it('closes with the pick: the toy is gained, the run goes back to the wave where it stood, and the stage and its timers are untouched', () => {
    const sim = arena();
    const gains = record(sim, 'relicGain');
    const wave = sim.wave;
    const clock = sim.waveClock;
    const stage = sim.stage;
    const pick = toyPick(sim)!;
    const choice = pick.options[1] as RelicId;
    expect(sim.pickRelic(1)).toBeNull();
    expect(gains).toEqual([{ relic: choice }]);
    expect(sim.relics).toContain(choice);
    expect(sim.pending).toBeNull();
    expect(sim.phase).toBe('wave');
    expect(sim.wave).toBe(wave);
    expect(sim.stage).toBe(stage);
    expect(sim.stage).toBe('run');
    // The wave goes on: its clock runs again.
    advance(sim, 1);
    expect(sim.waveClock).toBeGreaterThan(clock + 0.9);
    expect(sim.wave).toBe(wave);
  });

  it('never offers a toy twice: the one just picked is not in the next pick', () => {
    const sim = arena({ seed: 12 });
    const first = toyPick(sim)!.options[0] as RelicId;
    sim.pickRelic(0);
    for (let i = 0; i < 8; i++) {
      const next = toyPick(sim)!;
      expect(next.options).not.toContain(first);
      sim.pickRelic(0);
    }
  });
});

// ───────────────────────────── the row of rarities ─────────────────────────────

describe('which toys the capsule offers', () => {
  /** The rarities of the toys offered over many seeds when `act` stages have been played. */
  function raritiesAt(act: number, seeds = 80): Set<string> {
    const seen = new Set<string>();
    for (let seed = 1; seed <= seeds; seed++) {
      const sim = arena({ seed: 1000 + seed });
      sim.act = act;
      toyPick(sim);
      for (const id of optionsOf(sim)) seen.add(RELIC_RARITY[id]);
    }
    return seen;
  }

  it('draws rare and epic toys in the first four stages (the row of stages 3 and 4 is the floor, so the first stages\' commons never come)', () => {
    for (const act of [1, 2, 3, 4]) expect([...raritiesAt(act)].sort(), `act ${act}`).toEqual(['epic', 'rare']);
  });

  it('draws epic and legendary toys from the fifth stage on (the row of the shop after it), never rare or common', () => {
    for (const act of [5, 6, 9]) expect([...raritiesAt(act)].sort(), `act ${act}`).toEqual(['epic', 'legendary']);
  });

  it('can read the row of the shop already passed instead, with the same floor', () => {
    turn(ROW.toyPick, 'rowKnob', 'actMinusOne');
    expect([...raritiesAt(5)].sort()).toEqual(['epic', 'rare']);
    expect([...raritiesAt(6)].sort()).toEqual(['epic', 'legendary']);
    expect([...raritiesAt(1)].sort()).toEqual(['epic', 'rare']);
  });

  it('can lower the floor with the row\'s floorRow cell (0 = the first stages\' row, which has commons, still none because they are left out)', () => {
    turn(ROW.toyPick, 'floorRow', 0);
    const seen = raritiesAt(1);
    expect(seen.has('common')).toBe(false);
    expect(seen.has('rare')).toBe(true);
    turn(ROW.toyPick, 'common', true);
    expect(raritiesAt(1).has('common')).toBe(true);
  });

  it('keeps no slot for a toy that answers the next stage\'s enemies, which the shop always does', () => {
    // Find a chapter and stage whose next stage has a trait with a counter toy that the capsule may offer (not a common one).
    let found: { chapter: number; act: number; toy: RelicId } | null = null;
    for (let chapter = 1; chapter <= 5 && !found; chapter++) {
      for (let act = 1; act <= 5 && !found; act++) {
        for (const feature of actFeatures(chapter, act + 1)) {
          const toy = (COUNTER_RELICS[feature] ?? []).find((r) => RELIC_RARITY[r] === 'rare' || RELIC_RARITY[r] === 'epic');
          if (toy) {
            found = { chapter, act, toy };
            break;
          }
        }
      }
    }
    expect(found).not.toBeNull();
    const c = found!;
    let missing = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const sim = arena({ seed: 3000 + seed, chapter: c.chapter });
      sim.act = Math.min(c.act, 4);
      const others = RELIC_IDS.filter((r) => (RELIC_RARITY[r] === 'rare' || RELIC_RARITY[r] === 'epic') && r !== c.toy).slice(0, 5);
      sim.relicPool.length = 0;
      sim.relicPool.push(c.toy, ...others);
      toyPick(sim);
      if (!optionsOf(sim).includes(c.toy)) missing++;
    }
    // The shop would put the counter toy into every offer; a capsule offer without the slot misses it about half the time (3 of 6).
    expect(missing).toBeGreaterThan(10);
    expect(missing).toBeLessThan(50);
  });

  it('offers what is left when the row has nothing: the lone legendary toy in a pool of nothing else, in the first stages', () => {
    const sim = arena();
    sim.relicPool.length = 0;
    sim.relicPool.push('hourglass');
    toyPick(sim);
    expect(optionsOf(sim)).toEqual(['hourglass']);
  });
});

// ───────────────────────────── nothing to pick ─────────────────────────────

describe('when there is no toy to offer', () => {
  it('pays 5 purr instead when the player owns every toy the capsule may offer, and says so; no pick opens, the phase does not change', () => {
    const sim = arena();
    for (const id of RELIC_IDS) if (RELIC_RARITY[id] !== 'common') sim.relics.push(id);
    const u = lucky(sim);
    const t = tape(sim);
    force(sim, 'toy');
    castNow(sim, u);
    openIt(sim);
    expect(t.opens[0]).toMatchObject({ kind: 'toy', result: 'fallback', purr: 5 });
    expect(t.purr.map((p) => p.delta)).toEqual([5]);
    expect(t.offers).toHaveLength(0);
    expect(sim.phase).toBe('wave');
    expect(sim.capsuleToys).toBe(0);
    expect(sim.purr).toBe(5);
  });

  it('counts the toys that are spoken for: two toy capsules in one tick with one toy left give a pick and 5 purr', () => {
    const sim = arena();
    const last: RelicId = 'cat_tower';
    for (const id of RELIC_IDS) if (RELIC_RARITY[id] !== 'common' && id !== last) sim.relics.push(id);
    const a = lucky(sim, 11);
    const b = lucky(sim, 13);
    const t = tape(sim);
    const spy = vi.spyOn(sim.rng.combat, 'next');
    spy.mockReturnValueOnce(0.935).mockReturnValueOnce(0.935);
    castNow(sim, a);
    castNow(sim, b);
    // Both opening items are due in the same tick (the cast of b came at the same moment); the second finds the last toy spoken for.
    openIt(sim);
    expect(t.opens.map((o) => o.result)).toEqual(['toy', 'fallback']);
    expect(sim.purr).toBe(5);
    expect(optionsOf(sim)).toEqual([last]);
  });

  it('pays 5 purr when the pick finds nothing at the end of the tick (the last toy went to a pick in between)', () => {
    const sim = arena();
    for (const id of RELIC_IDS) if (RELIC_RARITY[id] !== 'common') sim.relics.push(id);
    const purr = record(sim, 'purr');
    sim.capsuleToys = 1;
    sim.step(TICK);
    expect(sim.capsuleToys).toBe(0);
    expect(sim.phase).toBe('wave');
    expect(purr.map((p) => [p.delta, p.reason])).toEqual([[5, 'skill']]);
  });

  it('pays 5 purr in the tutorial, where the lesson on toys waits for the shop\'s own first offer', () => {
    const sim = newSim({ mode: 'tutorial' });
    sim.summonedUnits = 1;
    quietWave(sim);
    sim.waveDuration = 1e6;
    const u = lucky(sim);
    const t = tape(sim);
    force(sim, 'toy');
    castNow(sim, u);
    openIt(sim);
    expect(t.opens[0]).toMatchObject({ result: 'fallback', purr: 5 });
    expect(t.offers).toHaveLength(0);
    expect(sim.capsuleToys).toBe(0);
  });
});

// ───────────────────────────── several picks, and the stage's own ─────────────────────────────

describe('several toy capsules and the stage\'s own pick', () => {
  it('opens two picks one after the other when two toy capsules open in one tick: the second after the first is closed', () => {
    const sim = arena();
    const t = tape(sim);
    later(sim, 0, 'capsule', { x: 1, y: 1, a: TOY_INDEX, b: -1 });
    later(sim, 0, 'capsule', { x: 1, y: 1, a: TOY_INDEX, b: -1 });
    sim.step(TICK);
    expect(t.offers).toHaveLength(1);
    expect(sim.capsuleToys).toBe(1);
    const first = optionsOf(sim);
    const picked = first[0] as RelicId;
    expect(sim.pickRelic(0)).toBeNull();
    expect(t.offers).toHaveLength(1);
    sim.step(TICK);
    expect(t.offers).toHaveLength(2);
    expect(sim.capsuleToys).toBe(0);
    expect(optionsOf(sim)).not.toContain(picked);
    expect(sim.pickRelic(0)).toBeNull();
    sim.step(TICK);
    expect(t.offers).toHaveLength(2);
  });

  it('opens before the stage\'s pick when the capsule is due first, and the stage goes on with the time that was left', () => {
    const sim = arena();
    targetDown(sim, 4);
    expect(sim.stage).toBe('clearing');
    const t = tape(sim);
    later(sim, 1.0, 'capsule', { x: 1, y: 1, a: TOY_INDEX, b: -1 });
    advance(sim, 1.0 + TICK);
    expect(sim.phase).toBe('choice');
    expect(sim.pending).toMatchObject({ source: 'capsule' });
    const timer = sim.stageTimer;
    expect(sim.pickRelic(0)).toBeNull();
    expect(sim.stage).toBe('clearing');
    expect(sim.stageTimer).toBe(timer);
    expect(sim.phase).toBe('wave');
    advance(sim, 0.4);
    expect(sim.phase).toBe('choice');
    expect(sim.pending).toMatchObject({ source: 'stage', picksLeft: 1 });
    expect(t.offers.map((o) => o.source)).toEqual(['capsule', undefined]);
    expect(sim.pickRelic(0)).toBeNull();
    expect(sim.stage).toBe('between');
  });

  it('waits for the stage\'s pick that opened in the very tick the capsule did, and opens in the first tick end after it is closed', () => {
    const sim = arena();
    targetDown(sim, 4);
    const t = tape(sim);
    sim.stageTimer = TICK;
    later(sim, 0, 'capsule', { x: 1, y: 1, a: TOY_INDEX, b: -1 });
    sim.step(TICK);
    expect(sim.phase).toBe('choice');
    expect(sim.pending).toMatchObject({ source: 'stage' });
    expect(sim.capsuleToys).toBe(1);
    expect(t.offers.map((o) => o.source)).toEqual([undefined]);
    sim.step(5);
    expect(sim.pickRelic(0)).toBeNull();
    expect(sim.phase).toBe('wave');
    expect(sim.stage).toBe('between');
    sim.step(TICK);
    expect(sim.phase).toBe('choice');
    expect(sim.pending).toMatchObject({ source: 'capsule' });
    expect(sim.capsuleToys).toBe(0);
    const timer = sim.stageTimer;
    expect(sim.pickRelic(0)).toBeNull();
    expect(sim.phase).toBe('wave');
    expect(sim.stage).toBe('between');
    expect(sim.stageTimer).toBe(timer);
  });

  it('is not opened after a defeat and keeps waiting for a revive, which gives it the first tick end', () => {
    const sim = arena();
    enter(sim, 4);
    advance(sim, 1.1);
    expect(sim.boss).not.toBeNull();
    // The boss wave's time is up in this very tick, and a toy capsule opens in it as well.
    sim.waveDuration = sim.waveTime + TICK / 2;
    later(sim, 0, 'capsule', { x: 1, y: 1, a: TOY_INDEX, b: -1 });
    sim.step(TICK);
    expect(sim.phase).toBe('lost');
    expect(sim.pending).toBeNull();
    expect(sim.capsuleToys).toBe(1);
    expect(sim.revive()).toBeNull();
    expect(sim.phase).toBe('wave');
    sim.step(TICK);
    expect(sim.phase).toBe('choice');
    expect(sim.pending).toMatchObject({ source: 'capsule' });
    lose(sim, 'overrun');
    expect(sim.pending).toBeNull();
  });
});

// ───────────────────────────── a run resumed from a wave-start save ─────────────────────────────

describe('a run resumed from a wave-start save', () => {
  it('goes back to the wave after a capsule\'s pick: the wave number, the stage and the wave\'s clock go on, nothing is skipped', () => {
    const first = newSim({ seed: 4242 });
    advance(first, 3.05 + 16);
    expect(first.wave).toBeGreaterThanOrEqual(2);
    const snap = first.snapshot();
    expect(snap).not.toBeNull();
    const resumed = createBattle(initOf({ seed: 4242 }), snap!);
    if (!(resumed instanceof Sim)) throw new Error('not a Sim');
    // A resumed run has never opened a pick: its resume phase is still the initial one, and the pick has to set its own.
    expect(resumed.resumePhase).toBe('prep');
    expect(resumed.phase).toBe('prep');
    advance(resumed, 3.1);
    expect(resumed.phase).toBe('wave');
    resumed.spawnIds.length = 0;
    resumed.spawnTimes.length = 0;
    resumed.spawnIdx = 0;
    const wave = resumed.wave;
    const clock = resumed.waveClock;
    expect(resumed.resumePhase).toBe('prep');
    const pick = toyPick(resumed);
    expect(pick).not.toBeNull();
    expect(resumed.resumePhase).toBe('wave');
    expect(resumed.pickRelic(0)).toBeNull();
    expect(resumed.phase).toBe('wave');
    expect(resumed.wave).toBe(wave);
    expect(resumed.stage).toBe('run');
    advance(resumed, 2);
    expect(resumed.wave).toBe(wave);
    expect(resumed.waveClock).toBeGreaterThan(clock + 1.9);
  });
});

// ───────────────────────────── the hourglass ─────────────────────────────

describe('the hourglass picked in the middle of an elite or boss fight', () => {
  function bossFight(): Sim {
    const sim = arena();
    enter(sim, 4);
    advance(sim, 1.1);
    expect(sim.boss).not.toBeNull();
    sim.relicPool.length = 0;
    sim.relicPool.push('hourglass');
    return sim;
  }

  it('adds its 15 seconds to the limit of the fight that is going on (the shop\'s hourglass could only add them from the next wave)', () => {
    const sim = bossFight();
    const limit = sim.waveDuration;
    const pick = toyPick(sim)!;
    expect(pick.options).toEqual(['hourglass']);
    expect(sim.pickRelic(0)).toBeNull();
    expect(sim.fx.bossTime).toBe(15);
    expect(sim.waveDuration).toBe(limit + 15);
    expect(sim.stage).toBe('run');
    expect(sim.phase).toBe('wave');
  });

  it('really postpones the defeat on the boss clock by 15 seconds', () => {
    const plain = bossFight();
    const withGlass = bossFight();
    toyPick(withGlass);
    withGlass.pickRelic(0);
    for (const sim of [plain, withGlass]) {
      sim.boss!.capTokens = Infinity;
      sim.boss!.hp = sim.boss!.maxHp * 100;
      sim.boss!.frozen = true;
      sim.boss!.freezeUntil = 1e9;
    }
    const left = plain.waveDuration - plain.waveTime;
    advance(plain, left + 0.3);
    advance(withGlass, left + 0.3);
    expect(plain.phase).toBe('lost');
    expect(withGlass.phase).toBe('wave');
    advance(withGlass, 15);
    expect(withGlass.phase).toBe('lost');
  });

  it('adds nothing in a normal wave, where the toy only changes the next wave\'s spawn window', () => {
    const sim = arena();
    sim.relicPool.length = 0;
    sim.relicPool.push('hourglass');
    const limit = sim.waveDuration;
    toyPick(sim);
    sim.pickRelic(0);
    expect(sim.waveDuration).toBe(limit);
    expect(sim.fx.spawnSlow).toBe(0.1);
  });

  it('adds nothing when the shop gives it after the boss has fallen (the next wave takes it into its own limit)', () => {
    const sim = arena();
    targetDown(sim, 4);
    advance(sim, 1.3);
    expect(sim.pending).toMatchObject({ kind: 'relic' });
    const limit = sim.waveDuration;
    const pending = sim.pending as { options: RelicId[] };
    pending.options[0] = 'hourglass';
    expect(sim.pickRelic(0)).toBeNull();
    expect(sim.waveDuration).toBe(limit);
    expect(sim.fx.bossTime).toBe(15);
  });
});

// ───────────────────────────── modes ─────────────────────────────

describe('the toy capsule in the other modes', () => {
  it('opens a pick of one in the daily challenge with the toy box rule (which doubles only the stage\'s picks)', () => {
    const sim = arena({ mode: 'daily', modifiers: ['toy_box'] });
    expect(sim.relicPicks).toBe(2);
    const pick = toyPick(sim)!;
    expect(pick.picksLeft).toBe(1);
    expect(sim.pickRelic(0)).toBeNull();
    expect(sim.phase).toBe('wave');
    expect(sim.relics).toHaveLength(1);
  });

  it('opens in endless mode far past the first stages (the fifth stage\'s row), and in the gold dungeon', () => {
    const endless = arena({ mode: 'endless', chapter: 3 });
    endless.act = 14;
    toyPick(endless);
    for (const id of optionsOf(endless)) expect(['epic', 'legendary']).toContain(RELIC_RARITY[id]);
    const gold = arena({ mode: 'gold', chapter: 1 });
    expect(toyPick(gold)).not.toBeNull();
    for (const id of optionsOf(gold)) expect(['rare', 'epic']).toContain(RELIC_RARITY[id]);
  });

  it('is the same at 1x, 2x and 3x speed', () => {
    const play = (dt: number): string => {
      const sim = arena({ seed: 888 });
      const u = lucky(sim, 12, 0.9);
      force(sim, 'toy');
      const log: string[] = [];
      sim.events.on('relicOffer', (e) => log.push(`${sim.time.toFixed(3)}:${e.options.join(',')}:${e.source}`));
      const per = Math.round(dt / TICK);
      for (let i = 0; i < 400 / per; i++) {
        sim.step(dt);
        if (sim.phase === 'choice') sim.pickRelic(0);
      }
      // (The end state leaves out the clock and the gauge: a step that opens a pick drops the ticks it still had, at 3x two of them.)
      void u;
      return `${log.join('|')}#${sim.relics.join(',')}/${sim.rng.states().join(',')}`;
    };
    const x1 = play(TICK);
    expect(x1.split('#')[0].length).toBeGreaterThan(0);
    expect(play(2 * TICK)).toBe(x1);
    expect(play(3 * TICK)).toBe(x1);
  });
});
