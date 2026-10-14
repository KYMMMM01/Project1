/**
 * The lucky cat's skill, Lucky Capsule! (docs/design_skills_v2.md 3.12, directive decisions 17 and 23): every 34 s a capsule falls, its kind
 * rolled at the cast on the `combat` stream, and opens 1.2 s later with a prize. This file: the data, the roll, the cast and the half-gauge refund
 * of the fish capsule, the opening, the fish / purr / more prizes, several lucky cats, a capsule in the air when a wave or a battle ends, the bard
 * filling this gauge, every mode, speeds. The partner and guardian prizes are in `sim.spCapsulePartner.test.ts`, the toy pick in
 * `sim.spCapsuleToy.test.ts`. The frame it stands on is tested in `sim.spSkills.test.ts`.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SP_CAPSULE_KINDS, type SpCapsuleKind } from '@/game/api';
import { TICK } from '@/game/data/balance';
import { SP_ROWS, SP_START_RESTORE } from '@/game/data/spSkills';
import { unitDef } from '@/game/data/units';
import { cellCenterX, cellCenterY } from '@/game/geometry';
import { summonCostOf } from '@/game/sim/board';
import { createBattle } from '@/game/sim/create';
import { SIM_VERSION } from '@/game/sim/snapshot';
import { lose } from '@/game/sim/flow';
import { capsule } from '@/game/sim/sp/capsule';
import { later } from '@/game/sim/sp/later';
import { SP_HANDLERS } from '@/game/sim/sp/registry';
import { Sim } from '@/game/sim/sim';
import { arena, BAND, castNow, force, INNER_BAND, lucky, openIt, tape, targetDown } from './capsuleHelpers';
import { advance, initOf, newSim, put, quietWave } from './simHelpers';
import { fingerprintRun } from './spHelpers';

const ROW = SP_ROWS.capsule;

const restores: Array<() => void> = [];
afterEach(() => {
  while (restores.length > 0) (restores.pop() as () => void)();
  vi.restoreAllMocks();
});

/** Changes a cell of a row for one test. */
function turn<T extends object, K extends keyof T>(row: T, key: K, value: T[K]): void {
  const old = row[key];
  row[key] = value;
  restores.push(() => {
    row[key] = old;
  });
}

/** The sim time of every `spCast` of the capsule, collected as they come. */
function castTimes(sim: Sim): number[] {
  const out: number[] = [];
  sim.events.on('spCast', (e) => {
    if (e.skill === 'capsule') out.push(sim.time);
  });
  return out;
}

// ───────────────────────────── the data and the registration ─────────────────────────────

describe('Lucky Capsule, the data', () => {
  it('has the design appendix\'s cells and is built: the lucky cat carries the skill and its handler is registered', () => {
    expect(ROW).toMatchObject({
      id: 'capsule', unit: 't_lucky', rank: 5, cooldown: 34, weights: { fish: 30, purr: 25, partner: 25, more: 10, toy: 7, guardian: 3 },
      moreWeights: { partner: 25, toy: 7, guardian: 3 }, openDelay: 1.2, moreDelay: 1.0, fish: 1, purr: 2, fishRefund: 0.5,
      fallbackPurr: { partner: 3, toy: 5, guardian: 10 }, tutorial: { toyPurr: 5, guardianPurr: 10 }, built: true,
      fullBoardFish: false, fullBoardFishPurr: 1, fullBoardPartnerFloor: false, bardTargetsCapsule: true, oneAtATime: false,
    });
    expect(unitDef('t_lucky').spSkill).toEqual({ id: 'capsule', rank: 5, cooldown: 34, nameKey: 'sp.capsule.name' });
    expect(SP_HANDLERS.capsule).toBe(capsule);
  });

  it('fills the lucky cat\'s gauge in 34 s: a cat starts at 50% and casts 17 s later', () => {
    const sim = arena();
    const u = put(sim, 12, 't_lucky', 0);
    expect(u.sp).toBe(0.5);
    const casts = castTimes(sim);
    advance(sim, 16.9);
    expect(casts).toHaveLength(0);
    advance(sim, 0.3);
    expect(casts).toHaveLength(1);
  });

  it('is ready whatever the field holds: nothing on it, an elite, a boss', () => {
    const sim = arena();
    const u = lucky(sim);
    expect(sim.enemies.length).toBe(0);
    expect(capsule.ready(sim, u)).toBe(true);
    expect(capsule.ready(sim, u)).toBe(true);
  });
});

// ───────────────────────────── the roll ─────────────────────────────

describe('the roll of the capsule\'s kind', () => {
  /** The kind the cast announces when the `combat` stream says `value`. */
  function kindAt(value: number): { kind: SpCapsuleKind; inner: SpCapsuleKind | null; draws: number } {
    const sim = arena();
    const u = lucky(sim);
    const spy = vi.spyOn(sim.rng.combat, 'next').mockReturnValueOnce(value).mockReturnValueOnce(0.5);
    const t = tape(sim);
    castNow(sim, u);
    const e = t.casts[0]!;
    if (e.skill !== 'capsule') throw new Error('not a capsule cast');
    const draws = spy.mock.calls.length;
    spy.mockRestore();
    return { kind: e.data.kind, inner: e.data.inner, draws };
  }

  it('walks the odds row cumulatively: 30 / 55 / 80 / 90 / 97 / 100, an edge belongs to the next kind', () => {
    const cases: Array<[number, SpCapsuleKind]> = [
      [0, 'fish'], [0.2999, 'fish'], [0.3, 'purr'], [0.5499, 'purr'], [0.55, 'partner'], [0.7999, 'partner'], [0.8, 'more'], [0.8999, 'more'],
      [0.9, 'toy'], [0.9699, 'toy'], [0.97, 'guardian'], [0.99999, 'guardian'],
    ];
    for (const [value, kind] of cases) expect(kindAt(value).kind, String(value)).toBe(kind);
  });

  it('rolls once for every kind but More!, and twice for More!: the small capsule is 25 : 7 : 3 out of 35 and never fish, purr or More! again', () => {
    for (const kind of SP_CAPSULE_KINDS) expect(kindAt(BAND[kind]).draws, kind).toBe(kind === 'more' ? 2 : 1);
    const inner = (v: number): SpCapsuleKind | null => {
      const sim = arena();
      const u = lucky(sim);
      vi.spyOn(sim.rng.combat, 'next').mockReturnValueOnce(BAND.more).mockReturnValueOnce(v);
      const t = tape(sim);
      castNow(sim, u);
      const e = t.casts[0]!;
      return e.skill === 'capsule' ? e.data.inner : null;
    };
    expect([0, 0.7142, 0.7143, 0.9142, 0.9143, 0.99999].map(inner)).toEqual(['partner', 'partner', 'toy', 'toy', 'guardian', 'guardian']);
    expect(kindAt(BAND.toy).inner).toBeNull();
    expect(INNER_BAND.partner).toBeLessThan(25 / 35);
  });

  it('follows the odds over many casts of a real seed: every kind within 4 sigma, the small capsule within 4 sigma of 25 : 7 : 3', () => {
    const sim = arena({ seed: 424242 });
    const u = lucky(sim);
    const n = 20000;
    const count: Record<string, number> = {};
    const small: Record<string, number> = {};
    sim.events.on('spCast', (e) => {
      if (e.skill !== 'capsule') return;
      count[e.data.kind] = (count[e.data.kind] ?? 0) + 1;
      if (e.data.inner) small[e.data.inner] = (small[e.data.inner] ?? 0) + 1;
    });
    for (let i = 0; i < n; i++) {
      castNow(sim, u);
      sim.later.length = 0;
    }
    for (const kind of SP_CAPSULE_KINDS) {
      const p = ROW.weights[kind] / 100;
      expect(Math.abs((count[kind] ?? 0) / n - p), kind).toBeLessThan(4 * Math.sqrt((p * (1 - p)) / n));
    }
    const m = count.more as number;
    expect(Object.keys(small).sort()).toEqual(['guardian', 'partner', 'toy']);
    for (const [kind, w] of Object.entries(ROW.moreWeights)) {
      const p = w / 35;
      expect(Math.abs((small[kind] ?? 0) / m - p), kind).toBeLessThan(4 * Math.sqrt((p * (1 - p)) / m));
    }
  });

  it('gives a fish capsule 30% of the casts and so a mean interval of 28.9 s: 34 s x (1 - 0.30 x 0.5)', () => {
    const sim = arena({ seed: 777 });
    const u = lucky(sim);
    const n = 20000;
    let fish = 0;
    for (let i = 0; i < n; i++) {
      u.sp = 0;
      if (castNow(sim, u) === ROW.fishRefund) fish++;
      sim.later.length = 0;
    }
    const share = fish / n;
    expect(Math.abs(share - 0.3)).toBeLessThan(4 * Math.sqrt((0.3 * 0.7) / n));
    expect(ROW.cooldown * (1 - share * ROW.fishRefund)).toBeCloseTo(28.9, 0);
  });

  it('draws only from the combat stream and no other, and never from Math.random', () => {
    const sim = arena();
    const u = lucky(sim);
    const random = vi.spyOn(Math, 'random');
    const before = sim.rng.states();
    castNow(sim, u);
    const after = sim.rng.states();
    const names = ['summon', 'pick', 'merge', 'toy', 'sun', 'wave', 'combat'];
    names.forEach((name, i) => {
      if (name === 'combat') expect(after[i], name).not.toBe(before[i]);
      else expect(after[i], name).toBe(before[i]);
    });
    openIt(sim);
    expect(random).not.toHaveBeenCalled();
  });
});

// ───────────────────────────── the other source of the rolls ─────────────────────────────

describe('the hash option for the rolls (rollsFrom hash): the design answer to replaying a wave from a save to re-roll a bad capsule', () => {
  /** The kind (and, for More!, the small capsule) of the first capsule cast in the wave the battle is in. */
  function firstKind(seed: number, wave: number, burn: number): string {
    const sim = arena({ seed });
    sim.wave = wave;
    for (let i = 0; i < burn; i++) sim.rng.combat.next();
    const u = lucky(sim);
    const t = tape(sim);
    castNow(sim, u);
    const e = t.casts[0]!;
    return e.skill === 'capsule' ? `${e.data.kind}/${e.data.inner}` : '';
  }

  it('is the combat stream by default: the same cast after a different number of combat draws comes out differently for some seeds', () => {
    const differ = [1, 2, 3, 4, 5, 6, 7, 8].filter((seed) => firstKind(seed, 3, 0) !== firstKind(seed, 3, 11));
    expect(differ.length).toBeGreaterThan(0);
  });

  it('gives the same capsule for the same seed, wave and order, whatever the combat stream did in between, and does not touch the stream', () => {
    turn(ROW, 'rollsFrom', 'hash');
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) expect(firstKind(seed, 3, 0), String(seed)).toBe(firstKind(seed, 3, 11));
    const sim = arena({ seed: 9 });
    const u = lucky(sim);
    const before = sim.rng.states();
    castNow(sim, u);
    expect(sim.rng.states()).toEqual(before);
  });

  it('gives different capsules in different waves and for the second capsule of a wave', () => {
    turn(ROW, 'rollsFrom', 'hash');
    const byWave = new Set<string>();
    for (let wave = 1; wave <= 30; wave++) byWave.add(firstKind(77, wave, 0));
    expect(byWave.size).toBeGreaterThan(3);
    const sim = arena({ seed: 77 });
    sim.wave = 4;
    const u = lucky(sim);
    const kinds: string[] = [];
    sim.events.on('spCast', (e) => {
      if (e.skill === 'capsule') kinds.push(e.data.kind);
    });
    for (let i = 0; i < 30; i++) {
      castNow(sim, u);
      sim.later.length = 0;
    }
    expect(new Set(kinds).size).toBeGreaterThan(2);
  });

  it('follows the odds over many waves: a fish capsule about 30 of 100', () => {
    turn(ROW, 'rollsFrom', 'hash');
    let fish = 0;
    const n = 2000;
    for (let wave = 1; wave <= n; wave++) if (firstKind(5, wave, 0).startsWith('fish')) fish++;
    expect(Math.abs(fish / n - 0.3)).toBeLessThan(4 * Math.sqrt((0.3 * 0.7) / n));
  });

  it('draws the toys of a pick from the same hash: the same wave and order give the same toys whatever the combat stream did', () => {
    turn(ROW, 'rollsFrom', 'hash');
    const pickOf = (burn: number): string => {
      const sim = arena({ seed: 31 });
      sim.wave = 6;
      for (let i = 0; i < burn; i++) sim.rng.combat.next();
      sim.capsuleToys = 1;
      sim.step(TICK);
      const p = sim.pending;
      return p && p.kind === 'relic' ? p.options.join(',') : '';
    };
    expect(pickOf(0)).not.toBe('');
    expect(pickOf(0)).toBe(pickOf(23));
  });
});

// ───────────────────────────── the cast and the refund ─────────────────────────────

describe('the cast', () => {
  it('announces itself with the kind, the small capsule, the time, the delays and the refund, from the cat\'s tile, before anything happens', () => {
    const sim = arena();
    const u = lucky(sim, 7);
    const t = tape(sim);
    force(sim, 'more', 'toy');
    sim.time += 0; // the cast time is the sim's time
    castNow(sim, u);
    expect(t.casts).toHaveLength(1);
    const e = t.casts[0]!;
    expect(e).toMatchObject({ skill: 'capsule', x: cellCenterX(7), y: cellCenterY(7) });
    expect(e.unit.id).toBe('t_lucky');
    if (e.skill !== 'capsule') throw new Error('not a capsule cast');
    expect(e.data).toEqual({ kind: 'more', inner: 'toy', at: sim.time, openDelay: 1.2, moreDelay: 1.0, refund: false });
    expect(t.log).toEqual(['cast']);
  });

  it('is announced as the first cast of the skill once, by the real pass, and not the second time', () => {
    const sim = arena();
    const a = lucky(sim, 12);
    const firsts: boolean[] = [];
    sim.events.on('spCast', (e) => {
      if (e.skill === 'capsule') firsts.push(e.first);
    });
    advance(sim, TICK);
    expect(firsts).toEqual([true]);
    a.sp = 1;
    advance(sim, 1.3);
    expect(firsts).toEqual([true, false]);
  });

  it('puts the opening on the delayed list for 1.2 s from now, pointing at no cat and no enemy, at the cat\'s tile', () => {
    const sim = arena();
    const u = lucky(sim, 18);
    force(sim, 'toy');
    castNow(sim, u);
    expect(sim.later).toHaveLength(1);
    const item = sim.later[0]!;
    expect(item).toMatchObject({ kind: 'capsule', unit: null, enemy: null, x: cellCenterX(18), y: cellCenterY(18) });
    expect(item.at).toBeCloseTo(sim.time + 1.2, 9);
  });

  it('returns true always and never refuses a cast', () => {
    const sim = arena();
    const u = lucky(sim);
    for (let i = 0; i < 50; i++) {
      expect(capsule.cast(sim, u)).toBe(true);
      sim.later.length = 0;
    }
  });
});

describe('the half gauge back of the fish capsule', () => {
  it('writes the refund into the gauge in the cast tick: 0.5 for a fish capsule, nothing for any other kind', () => {
    for (const kind of SP_CAPSULE_KINDS) {
      const sim = arena();
      const u = lucky(sim);
      u.sp = 0;
      force(sim, kind);
      expect(castNow(sim, u), kind).toBe(kind === 'fish' ? 0.5 : 0);
    }
  });

  it('shows in the cast tick through the real pass: the gauge was 1, the frame set 0, the skill wrote 0.5; the event says refund', () => {
    const sim = arena();
    const u = lucky(sim);
    const t = tape(sim);
    force(sim, 'fish');
    advance(sim, TICK);
    expect(t.casts).toHaveLength(1);
    const e = t.casts[0]!;
    if (e.skill !== 'capsule') throw new Error('not a capsule cast');
    expect(e.data.refund).toBe(true);
    expect(u.sp).toBeCloseTo(0.5, 9);
    // The ring shows the refunded value when the event arrives, and it climbs from there.
    advance(sim, TICK);
    expect(u.sp).toBeCloseTo(0.5 + TICK / 34, 9);
  });

  it('makes the next capsule come 17 s after a fish capsule and 34 s after any other kind', () => {
    const sim = arena();
    lucky(sim);
    const casts = castTimes(sim);
    force(sim, 'fish');
    advance(sim, TICK);
    expect(casts).toHaveLength(1);
    force(sim, 'purr');
    advance(sim, 16.9);
    expect(casts).toHaveLength(1);
    advance(sim, 0.2);
    expect(casts).toHaveLength(2);
    expect(casts[1]! - casts[0]!).toBeCloseTo(17, 1);
    advance(sim, 33.8);
    expect(casts).toHaveLength(2);
    advance(sim, 0.4);
    expect(casts).toHaveLength(3);
    expect(casts[2]! - casts[1]!).toBeCloseTo(34, 1);
  });

  it('refunds only the fish line: More! and its small capsule, purr, partner, toy, guardian and every fallback give nothing back', () => {
    for (const kind of ['purr', 'partner', 'more', 'toy', 'guardian'] as const) {
      const sim = arena();
      const u = lucky(sim);
      force(sim, kind);
      const t0 = sim.time;
      advance(sim, TICK);
      // The gauge was full, the frame set it to 0 in the cast tick and the skill left it there.
      expect(u.sp, kind).toBeCloseTo(0, 9);
      advance(sim, 3);
      if (sim.phase === 'choice') expect(sim.pickRelic(0)).toBeNull();
      // The opening (a fallback or not) does not touch the gauge either: it has only climbed with the time that passed since the cast.
      expect(u.sp, kind).toBeCloseTo((sim.time - t0 - TICK) / 34, 3);
    }
  });

  it('is decided at the cast, not at the opening: a lucky cat sold while the capsule falls takes the refund with it, and the capsule still opens', () => {
    const sim = arena();
    const u = lucky(sim);
    const t = tape(sim);
    force(sim, 'fish');
    advance(sim, TICK);
    expect(u.sp).toBeCloseTo(0.5, 9);
    expect(sim.sell(12)).toBeNull();
    expect(sim.units[12]).toBeNull();
    advance(sim, 1.3);
    expect(t.opens.map((o) => o.result)).toEqual(['fish']);
    expect(t.fish).toHaveLength(1);
  });

  it('is kept by a cat that is moved while the capsule falls: the same gauge on the new tile', () => {
    const sim = arena();
    const u = lucky(sim);
    force(sim, 'fish');
    advance(sim, TICK);
    expect(sim.drop(12, 13)).toBeNull();
    expect(u.cell).toBe(13);
    expect(u.sp).toBeCloseTo(0.5, 9);
    advance(sim, 1.0);
    expect(u.sp).toBeCloseTo(0.5 + (1.0 + 0) / 34, 2);
  });

  it('gives each lucky cat its own gauge and its own refund', () => {
    const sim = arena();
    const a = lucky(sim, 11);
    const b = lucky(sim, 13);
    b.sp = 0.5;
    force(sim, 'fish');
    advance(sim, TICK);
    expect(a.sp).toBeCloseTo(0.5, 9);
    expect(b.sp).toBeCloseTo(0.5 + TICK / 34, 9);
  });

  it('does nothing when the cell says 0: an old-style capsule resets the gauge to 0 and the event says no refund', () => {
    turn(ROW, 'fishRefund', 0);
    const sim = arena();
    const u = lucky(sim);
    const t = tape(sim);
    force(sim, 'fish');
    advance(sim, TICK);
    const e = t.casts[0]!;
    if (e.skill !== 'capsule') throw new Error('not a capsule cast');
    expect(e.data.refund).toBe(false);
    expect(u.sp).toBeCloseTo(0, 9);
  });

  it('follows the cell: a quarter refund brings the next capsule after 25.5 s (three quarters of the gauge are left to fill)', () => {
    turn(ROW, 'fishRefund', 0.25);
    const sim = arena();
    lucky(sim);
    const casts = castTimes(sim);
    force(sim, 'fish');
    advance(sim, TICK);
    force(sim, 'purr');
    advance(sim, 25.4);
    expect(casts).toHaveLength(1);
    advance(sim, 0.3);
    expect(casts).toHaveLength(2);
  });

  it('comes back as a moult-or-awakening ratio: an alchemist awakened into a lucky cat starts where the alchemist\'s gauge was', () => {
    const sim = arena();
    const alch = put(sim, 12, 't_alch', 0);
    alch.sp = 0.37;
    put(sim, 11, 't_bell', 0);
    put(sim, 13, 't_bard', 0);
    expect(sim.tier[3]).toBeGreaterThanOrEqual(1);
    sim.purr = 10;
    expect(sim.awaken(12)).toBeNull();
    expect(sim.units[12]!.id).toBe('t_lucky');
    expect(sim.units[12]!.sp).toBeCloseTo(0.37, 9);
  });
});

// ───────────────────────────── the opening ─────────────────────────────

describe('the opening', () => {
  it('comes 72 ticks after the cast (1.2 s) and not a tick before', () => {
    const sim = arena();
    const u = lucky(sim);
    const t = tape(sim);
    force(sim, 'purr');
    castNow(sim, u);
    for (let i = 0; i < 71; i++) sim.step(TICK);
    expect(t.opens).toHaveLength(0);
    sim.step(TICK);
    expect(t.opens).toHaveLength(1);
    expect(t.opens[0]).toMatchObject({ kind: 'purr', small: false, inner: null, result: 'purr', x: cellCenterX(12), y: cellCenterY(12), cell: -1, origin: -1, purr: 2 });
  });

  it('opens a More! capsule at 1.2 s and its small capsule 1.0 s later (60 ticks), at the same spot, as a small capsule', () => {
    const sim = arena();
    const u = lucky(sim, 6);
    const t = tape(sim);
    force(sim, 'more', 'guardian');
    castNow(sim, u);
    for (let i = 0; i < 72; i++) sim.step(TICK);
    expect(t.opens).toHaveLength(1);
    expect(t.opens[0]).toMatchObject({ kind: 'more', small: false, inner: 'guardian', result: 'more', purr: 0 });
    for (let i = 0; i < 59; i++) sim.step(TICK);
    expect(t.opens).toHaveLength(1);
    sim.step(TICK);
    expect(t.opens).toHaveLength(2);
    expect(t.opens[1]).toMatchObject({ kind: 'guardian', small: true, inner: null, x: cellCenterX(6), y: cellCenterY(6) });
  });

  it('stands still under a choice popup: a capsule that is 0.5 s into its fall opens 0.7 s of play after the popup closes', () => {
    const sim = arena();
    const u = lucky(sim);
    const t = tape(sim);
    force(sim, 'purr');
    castNow(sim, u);
    advance(sim, 0.5);
    sim.phase = 'choice';
    sim.pending = { kind: 'summon', options: ['w_paw', 'r_sling', 'm_snow'] };
    sim.step(10);
    expect(t.opens).toHaveLength(0);
    sim.phase = 'wave';
    sim.pending = null;
    advance(sim, 0.6);
    expect(t.opens).toHaveLength(0);
    advance(sim, 0.15);
    expect(t.opens).toHaveLength(1);
  });

  it('waits in the opening preparation, where nothing runs, and opens in the first tick of the wave', () => {
    const sim = newSim();
    expect(sim.phase).toBe('prep');
    later(sim, 0.1, 'capsule', { x: 100, y: 100, a: 1, b: -1 });
    const t = tape(sim);
    advance(sim, 2.5);
    expect(sim.phase).toBe('prep');
    expect(t.opens).toHaveLength(0);
    advance(sim, 1);
    expect(sim.phase).toBe('wave');
    expect(t.opens.map((o) => o.kind)).toEqual(['purr']);
  });

  it('emits capsuleOpen before the prize', () => {
    const sim = arena();
    const u = lucky(sim);
    const t = tape(sim);
    force(sim, 'purr');
    castNow(sim, u);
    openIt(sim);
    expect(t.log).toEqual(['cast', 'open:purr:purr', 'purr']);
    force(sim, 'fish');
    castNow(sim, u);
    openIt(sim);
    expect(t.log.slice(3)).toEqual(['cast', 'open:fish:fish', 'fish']);
  });
});

// ───────────────────────────── fish and purr ─────────────────────────────

describe('the fish capsule and the purr capsule', () => {
  it('pays one summon price in fish, as it stands when the capsule opens (not when it was cast), from the opening spot, reason skill', () => {
    const sim = arena();
    const u = lucky(sim, 8);
    const t = tape(sim);
    force(sim, 'fish');
    castNow(sim, u);
    const castPrice = summonCostOf(sim);
    sim.paidSummons += 3;
    const openPrice = summonCostOf(sim);
    expect(openPrice).toBeGreaterThan(castPrice);
    const before = sim.fish;
    openIt(sim);
    expect(t.fish).toHaveLength(1);
    expect(t.fish[0]).toMatchObject({ delta: openPrice, reason: 'skill', x: cellCenterX(8), y: cellCenterY(8) });
    expect(sim.fish - before).toBeGreaterThanOrEqual(openPrice);
  });

  it('pays no more than the cap (80) however many summons were bought, and counts the cardboard box\'s cut and the sardine crate\'s lowered cap', () => {
    const sim = arena();
    const u = lucky(sim);
    sim.paidSummons = 500;
    const t = tape(sim);
    force(sim, 'fish');
    castNow(sim, u);
    openIt(sim);
    expect(t.fish[0]!.delta).toBe(80);
    sim.fx.costCapCut = 15;
    force(sim, 'fish');
    castNow(sim, u);
    openIt(sim);
    expect(t.fish[1]!.delta).toBe(65);
    sim.fx.costCut = 0.1;
    force(sim, 'fish');
    castNow(sim, u);
    openIt(sim);
    expect(t.fish[2]!.delta).toBe(Math.ceil(65 * 0.9 - 1e-9));
  });

  it('doubles in the daily challenge\'s rich rule and costs 1.5 times in the lucky day rule', () => {
    const rich = arena({ mode: 'daily', modifiers: ['rich'] });
    const ur = lucky(rich);
    const tr = tape(rich);
    force(rich, 'fish');
    castNow(rich, ur);
    openIt(rich);
    expect(tr.fish[0]!.delta).toBe(2 * summonCostOf(rich));
    const day = arena({ mode: 'daily', modifiers: ['lucky_day'] });
    const ud = lucky(day);
    const td = tape(day);
    force(day, 'fish');
    castNow(day, ud);
    openIt(day);
    expect(td.fish[0]!.delta).toBe(summonCostOf(day));
    expect(summonCostOf(day)).toBeGreaterThan(summonCostOf(arena({ mode: 'daily', modifiers: [] })));
  });

  it('pays nothing in the tutorial\'s free summons (their price is 0)', () => {
    // The tutorial waits in its preparation until the first cat is summoned.
    const sim = newSim({ mode: 'tutorial' });
    sim.summonedUnits = 1;
    quietWave(sim);
    sim.waveDuration = 1e6;
    const u = lucky(sim);
    const t = tape(sim);
    expect(summonCostOf(sim)).toBe(0);
    force(sim, 'fish');
    castNow(sim, u);
    openIt(sim);
    expect(t.opens.map((o) => o.result)).toEqual(['fish']);
    expect(t.fish).toHaveLength(0);
  });

  it('pays 2 purr, reason skill, from the opening spot, and nothing else changes on the board', () => {
    const sim = arena();
    const u = lucky(sim, 3);
    const t = tape(sim);
    force(sim, 'purr');
    castNow(sim, u);
    const purr = sim.purr;
    const board = sim.units.map((c) => c?.uid ?? 0);
    openIt(sim);
    expect(t.purr).toHaveLength(1);
    expect(t.purr[0]).toMatchObject({ delta: 2, reason: 'skill', x: cellCenterX(3), y: cellCenterY(3) });
    expect(sim.purr).toBe(purr + 2);
    expect(sim.units.map((c) => c?.uid ?? 0)).toEqual(board);
  });

  it('pays its fish on a full board by default: the knob that turns them into 1 purr is off', () => {
    const sim = arena();
    const u = lucky(sim);
    for (let c = 0; c < 25; c++) if (!sim.units[c]) put(sim, c, 'w_paw', 0);
    const t = tape(sim);
    force(sim, 'fish');
    castNow(sim, u);
    openIt(sim);
    expect(t.opens[0]).toMatchObject({ kind: 'fish', result: 'fish', purr: 0 });
    expect(t.fish).toHaveLength(1);
    expect(t.purr).toHaveLength(0);
  });

  it('turns a fish capsule into 1 purr on a full board when the knob is on, and pays fish when there is an empty tile', () => {
    turn(ROW, 'fullBoardFish', true);
    const sim = arena();
    const u = lucky(sim);
    const t = tape(sim);
    force(sim, 'fish');
    castNow(sim, u);
    openIt(sim);
    expect(t.opens[0]).toMatchObject({ kind: 'fish', result: 'fish' });
    for (let c = 0; c < 25; c++) if (!sim.units[c]) put(sim, c, 'w_paw', 0);
    force(sim, 'fish');
    castNow(sim, u);
    openIt(sim);
    expect(t.opens[1]).toMatchObject({ kind: 'fish', result: 'fallback', purr: 1 });
    expect(t.purr.map((p) => p.delta)).toEqual([1]);
    expect(t.fish).toHaveLength(1);
  });
});

describe('the More! capsule', () => {
  it('opens a small capsule that gives its own prize, and the big one gives nothing itself', () => {
    const sim = arena();
    const u = lucky(sim);
    const t = tape(sim);
    force(sim, 'more', 'guardian');
    castNow(sim, u);
    openIt(sim);
    expect(t.log).toEqual(['cast', 'open:more:more']);
    expect(sim.purr).toBe(0);
    advance(sim, 1.0);
    expect(t.log.slice(2)).toEqual(['open:guardian:small:fallback', 'purr']);
    expect(t.purr[0]!.delta).toBe(10);
  });

  it('never makes a third capsule and gives the lucky cat no refund', () => {
    const sim = arena({ seed: 99 });
    const u = lucky(sim);
    const t = tape(sim);
    for (let i = 0; i < 400; i++) {
      u.sp = 0;
      vi.spyOn(sim.rng.combat, 'next').mockReturnValueOnce(BAND.more);
      castNow(sim, u);
      expect(u.sp).toBe(0);
      advance(sim, 2.5);
      expect(sim.later).toHaveLength(0);
      sim.units.forEach((c, cell) => {
        if (c && c.id !== 't_lucky') sim.units[cell] = null;
      });
      sim.purr = 0;
      sim.capsuleToys = 0;
      sim.phase = 'wave';
      sim.pending = null;
      vi.restoreAllMocks();
    }
    const kinds = new Set(t.opens.filter((o) => o.small).map((o) => o.kind));
    expect([...kinds].sort()).toEqual(['guardian', 'partner', 'toy']);
    expect(t.opens.filter((o) => o.small)).toHaveLength(400);
    expect(t.opens.filter((o) => o.kind === 'more' && o.small)).toHaveLength(0);
  });
});

// ───────────────────────────── several lucky cats ─────────────────────────────

describe('several lucky cats', () => {
  it('cast one after the other: the later cat waits with its gauge full for the 1.2 s gap of rank 5 skills, without rolling or refunding yet', () => {
    const sim = arena();
    const a = lucky(sim, 11);
    const b = lucky(sim, 13);
    const casts = castTimes(sim);
    const spy = vi.spyOn(sim.rng.combat, 'next');
    spy.mockReturnValueOnce(BAND.fish).mockReturnValueOnce(BAND.fish);
    advance(sim, TICK);
    expect(casts).toHaveLength(1);
    expect(a.sp).toBeCloseTo(0.5, 9);
    expect(b.sp).toBe(1);
    expect(spy.mock.calls).toHaveLength(1);
    advance(sim, 1.1);
    expect(casts).toHaveLength(1);
    expect(spy.mock.calls).toHaveLength(1);
    advance(sim, 0.15);
    expect(casts).toHaveLength(2);
    expect(spy.mock.calls).toHaveLength(2);
    expect(casts[1]! - casts[0]!).toBeGreaterThanOrEqual(1.2 - 1e-6);
    expect(casts[1]! - casts[0]!).toBeLessThan(1.3);
    expect(b.sp).toBeCloseTo(0.5, 1);
  });

  it('open in the order of their times, a small capsule of one among the capsules of the other (time, then the order they were put in)', () => {
    const sim = arena();
    const a = lucky(sim, 11);
    const b = lucky(sim, 13);
    const t = tape(sim);
    // a casts at t0: More!(guardian) opens at 1.2 and its small capsule at 2.2; b casts at t0 + 1.2: purr opens at 2.4.
    const spy = vi.spyOn(sim.rng.combat, 'next');
    spy.mockReturnValueOnce(BAND.more).mockReturnValueOnce(INNER_BAND.guardian).mockReturnValueOnce(BAND.purr);
    advance(sim, 3.6);
    expect(a.sp).toBeGreaterThan(0);
    expect(b.sp).toBeGreaterThan(0);
    expect(t.log.filter((l) => l.startsWith('open'))).toEqual(['open:more:more', 'open:guardian:small:fallback', 'open:purr:purr']);
  });

  it('does not stop at the first with the knob oneAtATime off, and waits with it on until the capsule in the air has opened', () => {
    const off = arena();
    lucky(off, 11);
    lucky(off, 13);
    const offCasts = castTimes(off);
    advance(off, 1.5);
    expect(offCasts).toHaveLength(2);

    turn(ROW, 'oneAtATime', true);
    const sim = arena();
    const a = lucky(sim, 11);
    const b = lucky(sim, 13);
    const casts = castTimes(sim);
    const t = tape(sim);
    advance(sim, 1.0);
    expect(casts).toHaveLength(1);
    expect(capsule.ready(sim, b)).toBe(false);
    expect(b.sp).toBe(1);
    advance(sim, 0.4);
    expect(t.opens).toHaveLength(1);
    // The second looks again every 0.2 s: it goes within 0.2 s of the first one's opening.
    advance(sim, 0.3);
    expect(casts).toHaveLength(2);
    expect(a.sp).toBeLessThan(1);
  });
});

// ───────────────────────────── the end of a wave and of a battle ─────────────────────────────

describe('a capsule in the air when a wave or a battle ends', () => {
  it('falls on into the next wave and opens there (the waves of a chapter run into each other)', () => {
    const sim = arena();
    sim.waveDuration = 20;
    sim.waveClock = 19.5;
    const u = lucky(sim);
    const t = tape(sim);
    const wave = sim.wave;
    force(sim, 'purr');
    castNow(sim, u);
    advance(sim, 0.6);
    expect(sim.wave).toBe(wave + 1);
    expect(t.opens).toHaveLength(0);
    advance(sim, 0.7);
    expect(t.opens.map((o) => o.result)).toEqual(['purr']);
    expect(sim.purr).toBe(2);
  });

  it('opens in the 1.2 s after an elite or a boss fell, before the stage toy pick, which then comes as it always did', () => {
    const sim = arena();
    const u = lucky(sim, 12, 0);
    const t = tape(sim);
    targetDown(sim, 4);
    expect(sim.stage).toBe('clearing');
    force(sim, 'purr');
    castNow(sim, u);
    advance(sim, 0.5);
    expect(t.opens).toHaveLength(0);
    expect(sim.phase).toBe('wave');
    advance(sim, 0.8);
    // The capsule opened at 1.2 s: in the same tick the clearing delay ran out (the list runs first), so the stage's pick follows it at once.
    expect(t.opens.map((o) => o.result)).toEqual(['purr']);
    expect(t.log).toEqual(['cast', 'open:purr:purr', 'purr', 'offer']);
    expect(sim.phase).toBe('choice');
    expect(sim.pending).toMatchObject({ kind: 'relic', source: 'stage' });
  });

  it('waits for the stage toy pick that opened first and opens in the first tick after it is closed', () => {
    const sim = arena();
    const u = lucky(sim, 12, 0);
    const t = tape(sim);
    targetDown(sim, 4);
    // The capsule is due 1.1 s from now, the stage pick opens at 1.2 s: the pick is open before the capsule can open.
    advance(sim, 0.1);
    force(sim, 'purr');
    castNow(sim, u);
    advance(sim, 1.1);
    expect(sim.phase).toBe('choice');
    expect(t.opens).toHaveLength(0);
    const time = sim.time;
    sim.step(5);
    expect(sim.time).toBe(time);
    expect(sim.pickRelic(0)).toBeNull();
    expect(sim.phase).toBe('wave');
    expect(t.opens).toHaveLength(0);
    advance(sim, 0.2);
    expect(t.opens.map((o) => o.result)).toEqual(['purr']);
    expect(sim.stage).toBe('between');
  });

  it('is dropped by a win and never opens afterwards: the delayed list holds none, no toy pick waits, no event comes', () => {
    const sim = arena();
    const u = lucky(sim, 12, 0);
    force(sim, 'purr');
    castNow(sim, u);
    // A toy capsule opens in the very tick the battle is won (the list runs before the wave machine): its pick must not outlive the battle.
    later(sim, 0, 'capsule', { x: 100, y: 100, a: SP_CAPSULE_KINDS.indexOf('toy'), b: -1 });
    sim.wave = sim.totalWaves;
    sim.stage = 'clearing';
    sim.stageTimer = TICK;
    const t = tape(sim);
    sim.step(TICK);
    expect(sim.phase).toBe('won');
    expect(sim.later.filter((i) => i.kind === 'capsule')).toHaveLength(0);
    expect(sim.capsuleToys).toBe(0);
    expect(t.opens.map((o) => o.kind)).toEqual(['toy']);
    sim.step(5);
    expect(t.opens).toHaveLength(1);
    expect(sim.pending).toBeNull();
  });

  it('survives a defeat: a revive lets the capsule open where it hung (the field goes on exactly as it stood)', () => {
    const sim = arena();
    const u = lucky(sim);
    const t = tape(sim);
    force(sim, 'purr');
    castNow(sim, u);
    advance(sim, 0.5);
    lose(sim, 'overrun');
    expect(sim.phase).toBe('lost');
    expect(sim.later.filter((i) => i.kind === 'capsule')).toHaveLength(1);
    sim.step(5);
    expect(t.opens).toHaveLength(0);
    expect(sim.revive()).toBeNull();
    advance(sim, 0.6);
    expect(t.opens).toHaveLength(0);
    advance(sim, 0.2);
    expect(t.opens.map((o) => o.result)).toEqual(['purr']);
  });
});

// ───────────────────────────── the bard ─────────────────────────────

describe('the bard fills the lucky cat\'s gauge (directive decision 23)', () => {
  it('gives a lucky cat below 80% a note of +20%, the refunded 50% included', () => {
    const sim = arena();
    const bard = put(sim, 11, 't_bard', 0);
    bard.sp = 1;
    const cat = lucky(sim, 13, 0.5);
    advance(sim, TICK);
    expect(bard.sp).toBeLessThan(0.1);
    expect(cat.sp).toBeCloseTo(0.7 + TICK / 34, 6);
  });

  it('leaves the lucky cat alone when the knob is switched off', () => {
    turn(ROW, 'bardTargetsCapsule', false);
    const sim = arena();
    const bard = put(sim, 11, 't_bard', 0);
    bard.sp = 1;
    const cat = lucky(sim, 13, 0.5);
    advance(sim, TICK);
    expect(cat.sp).toBeCloseTo(0.5 + TICK / 34, 9);
  });

  it('does not push a lucky cat that is at 80% or more (it casts soon enough on its own)', () => {
    const sim = arena();
    const bard = put(sim, 11, 't_bard', 0);
    bard.sp = 1;
    const cat = lucky(sim, 13, 0.85);
    const before = cat.sp;
    advance(sim, TICK);
    expect(cat.sp).toBeCloseTo(before + TICK / 34, 9);
  });
});

// ───────────────────────────── the other ways to be on the board ─────────────────────────────

describe('with the skills off', () => {
  it('never casts, the gauge stays 0 and the capsule leaves no trace', () => {
    const sim = arena({ sp: false });
    const u = put(sim, 12, 't_lucky', 0);
    const t = tape(sim);
    advance(sim, 60);
    expect(t.casts).toHaveLength(0);
    expect(t.opens).toHaveLength(0);
    expect(u.sp).toBe(0);
    expect(sim.later).toHaveLength(0);
    expect(sim.capsuleToys).toBe(0);
  });
});

describe('the capsule in every mode and at every speed', () => {
  const MODES: Array<{ name: string; over: Parameters<typeof initOf>[0] }> = [
    { name: 'chapter', over: { seed: 71001, mode: 'chapter', chapter: 2 } },
    { name: 'daily with its rules', over: { seed: 71002, mode: 'daily', chapter: 2, modifiers: ['rich', 'toy_box', 'no_rangers'] } },
    { name: 'daily lucky day', over: { seed: 71006, mode: 'daily', chapter: 3, modifiers: ['lucky_day'] } },
    { name: 'endless', over: { seed: 71003, mode: 'endless', chapter: 3 } },
    { name: 'gold dungeon', over: { seed: 71004, mode: 'gold', chapter: 1 } },
    { name: 'tutorial', over: { seed: 71005, mode: 'tutorial', chapter: 1 } },
  ];

  for (const m of MODES) {
    it(`casts and opens in the ${m.name} mode, and a whole bot run with a lucky cat on the board is the same twice`, () => {
      const run = (): { print: string; casts: number; opens: number; fishIn: number } => {
        let casts = 0;
        let opens = 0;
        let fishIn = 0;
        const print = fingerprintRun(initOf(m.over, 3), 'synergy', {
          maxSeconds: 200,
          setup(s) {
            put(s, 12, 't_lucky');
            s.events.on('spCast', (e) => {
              if (e.skill === 'capsule') casts++;
            });
            s.events.on('capsuleOpen', () => {
              opens++;
            });
            s.events.on('fish', (e) => {
              if (e.reason === 'skill') fishIn += e.delta;
            });
          },
        });
        return { print: `${print.hash}/${print.end}/${print.events}`, casts, opens, fishIn };
      };
      const a = run();
      const b = run();
      expect(a).toEqual(b);
      expect(a.casts).toBeGreaterThan(0);
      // Every capsule but those a run may end on (the last two) has opened; a More! capsule opens twice.
      expect(a.opens).toBeGreaterThanOrEqual(a.casts - 2);
    });
  }

  it('plays the same at 1x, 2x and 3x speed, with or without listeners', () => {
    const play = (dt: number, listen: boolean): string => {
      const sim = arena({ seed: 5150 });
      const u = lucky(sim, 12, 0.9);
      put(sim, 7, 'w_paw');
      put(sim, 17, 'w_sword');
      const log: string[] = [];
      if (listen) {
        for (const type of ['spCast', 'capsuleOpen', 'fish', 'purr', 'summon', 'promote', 'awaken', 'relicOffer'] as const) {
          sim.events.on(type, (p) => {
            log.push(`${type}@${sim.time.toFixed(3)}:${JSON.stringify(p, (k, v) => (k === 'unit' || k === 'from' || k === 'result' || k === 'consumed' ? undefined : v))}`);
          });
        }
      }
      const ticks = Math.round(150 / TICK);
      const per = Math.round(dt / TICK);
      for (let i = 0; i < ticks / per; i++) {
        sim.step(dt);
        if (sim.phase === 'choice') sim.pickRelic(0);
      }
      return `${log.join('|')}#${sim.fish}/${sim.purr}/${sim.time.toFixed(3)}/${u.sp.toFixed(6)}/${sim.units.map((c) => c?.id ?? '-').join(',')}/${sim.rng.states().join(',')}`;
    };
    const x1 = play(TICK, true);
    expect(play(2 * TICK, true)).toBe(x1);
    expect(play(3 * TICK, true)).toBe(x1);
    const quiet = play(TICK, false);
    expect(quiet.split('#')[1]).toBe(x1.split('#')[1]);
  });
});

describe('the capsule is not saved', () => {
  it('leaves nothing in a wave-start save: a capsule in the air when the next wave begins is gone in a run resumed from it, and the lucky cat restarts at half a gauge', () => {
    const init = initOf({ seed: 8123 });
    const sim = newSim({ seed: 8123 });
    quietWave(sim);
    const u = lucky(sim, 12, 1);
    sim.waveClock = sim.waveDuration - 0.4;
    force(sim, 'toy');
    castNow(sim, u);
    expect(sim.later).toHaveLength(1);
    advance(sim, 0.6);
    // The next wave began and took the save; the capsule is still on its way (0.6 s of its 1.2 s).
    expect(sim.wave).toBe(2);
    expect(sim.later).toHaveLength(1);
    const snap = sim.snapshot();
    expect(snap).not.toBeNull();
    expect(JSON.stringify(snap)).not.toMatch(/capsule|later|toy_pick/i);
    // The save format is the one of before the skills: version 3, seven random streams (no stream was added for the capsule).
    expect(SIM_VERSION).toBe(3);
    expect(sim.rng.states()).toHaveLength(7);
    const resumed = createBattle(init, snap!);
    if (!(resumed instanceof Sim)) throw new Error('not a Sim');
    expect(resumed.later).toHaveLength(0);
    expect(resumed.capsuleToys).toBe(0);
    expect(resumed.pending).toBeNull();
    const cat = resumed.units.find((c) => c?.id === 't_lucky');
    expect(cat?.sp).toBe(SP_START_RESTORE);
    // It waits in its preparation and then casts 17 s into the wave, like any cat restored at half a gauge.
    const casts = castTimes(resumed);
    advance(resumed, 3.05 + 16.5);
    expect(casts).toHaveLength(0);
    advance(resumed, 0.7);
    expect(casts).toHaveLength(1);
  });
});

describe('the pass hands out nothing it should not', () => {
  it('keeps the plain numbers of a long quiet run (the fish and purr added by the capsules are the only change)', () => {
    const sim = arena({ seed: 31337 });
    lucky(sim, 12, 0.5);
    const gains: Array<[string, number]> = [];
    sim.events.on('fish', (e) => gains.push([e.reason, e.delta]));
    sim.events.on('purr', (e) => gains.push([e.reason, e.delta]));
    advance(sim, 200);
    const skillGains = gains.filter(([reason]) => reason === 'skill');
    const other = gains.filter(([reason]) => reason !== 'skill' && reason !== 'income');
    expect(skillGains.length).toBeGreaterThan(0);
    expect(other).toEqual([]);
    for (const [, delta] of skillGains) expect(delta).toBeGreaterThan(0);
  });
});

