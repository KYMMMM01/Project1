/**
 * The partner capsule and the guardian capsule of the lucky cat (docs/design_skills_v2.md 3.12.2 and 3.12.4): a twin of one of the player's cats on
 * the nearest empty tile (or, on a full board, that cat grown one rank where it stands), and the free awakening of a legendary cat. Both never
 * lower a class's synergy step; the test of that is checked against real merges, promotions and awakenings on many random boards.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Rng } from '@/core/rng';
import { UNIT_IDS, type UnitId } from '@/game/api';
import { SYNERGY_MIN_RANK } from '@/game/data/balance';
import { mergeResultOf, unitRarityIndex } from '@/game/data/roster';
import { SP_ROWS } from '@/game/data/spSkills';
import { cellCenterX, cellCenterY } from '@/game/geometry';
import { awakenUnit, makeUnit, placeUnit, promoteUnit, refresh } from '@/game/sim/board';
import { guardianWouldLowerStep, partnerWouldLowerStep, pickGuardian, pickPartner } from '@/game/sim/sp/capsule';
import type { Sim } from '@/game/sim/sim';
import type { SimUnit } from '@/game/sim/types';
import { arena, board, castNow, clearBoard, fillRest, force, lucky, openIt, tape } from './capsuleHelpers';
import { advance, newSim, put, quietWave, record } from './simHelpers';

const ROW = SP_ROWS.capsule;

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

/** An arena with an empty board and a lucky cat in the far corner (a mythic: never a candidate, and a trickster mythic counts for its class). */
function stage(cats: Readonly<Record<number, UnitId>>, withLucky = true): { sim: Sim; cat: SimUnit | null } {
  const sim = arena();
  clearBoard(sim);
  board(sim, cats);
  const cat = withLucky ? lucky(sim, 24, 0) : null;
  return { sim, cat };
}

/** Opens a partner capsule and returns what the tape saw. */
function partnerOpens(sim: Sim, cat: SimUnit): ReturnType<typeof tape> {
  const t = tape(sim);
  force(sim, 'partner');
  castNow(sim, cat);
  openIt(sim);
  return t;
}

// ───────────────────────────── who gets a twin ─────────────────────────────

describe('the cat the partner capsule chooses', () => {
  it('follows the design\'s own example: the burning cat, whose merge fills the empty storm rung, not the sword or the viking whose merge would cost the warriors a step', () => {
    const { sim } = stage({ 1: 'w_sword', 2: 'w_viking', 3: 'w_samurai', 6: 'm_fire', 7: 'm_snow' }, false);
    expect(sim.tier[0]).toBe(2);
    expect(pickPartner(sim)?.id).toBe('m_fire');
    // The reasons, one by one: the viking's rung (the samurai) is taken and it has no twin, so a merge would lose it; the sword likewise.
    expect(partnerWouldLowerStep(sim, sim.units[2]!)).toBe(true);
    expect(partnerWouldLowerStep(sim, sim.units[1]!)).toBe(true);
    expect(partnerWouldLowerStep(sim, sim.units[6]!)).toBe(false);
    expect(partnerWouldLowerStep(sim, sim.units[7]!)).toBe(false);
  });

  it('puts a cat with no twin first, whatever its rank or tile', () => {
    const { sim } = stage({ 0: 'w_paw', 1: 'w_paw', 2: 'r_sling' }, false);
    expect(pickPartner(sim)?.cell).toBe(2);
  });

  it('puts a cat whose merge fills an empty rung before a higher one that fills none (both have twins)', () => {
    // Paws and swords in pairs, the vikings in a pair too, no samurai: the viking fills the empty samurai rung and so comes first; the sword and the paw fill nothing.
    const withRung = stage({ 0: 'w_paw', 1: 'w_paw', 2: 'w_sword', 3: 'w_sword', 4: 'w_viking', 5: 'w_viking' }, false);
    expect(pickPartner(withRung.sim)?.id).toBe('w_viking');
    // With the samurai there the viking has nothing to fill; the paw (lowest rank) is not preferred over the higher ranks: the viking still wins by rank.
    const full = stage({ 0: 'w_paw', 1: 'w_paw', 2: 'w_sword', 3: 'w_sword', 4: 'w_viking', 5: 'w_viking', 6: 'w_samurai' }, false);
    expect(pickPartner(full.sim)?.id).toBe('w_viking');
    // An empty rung beats rank: the sword (its rung, the viking, is free) before a pair of vikings with the samurai in place.
    const rungFirst = stage({ 2: 'w_sword', 3: 'w_sword', 4: 'w_viking', 5: 'w_viking', 6: 'w_samurai' }, false);
    expect(pickPartner(rungFirst.sim)?.id).toBe('w_viking');
    const swordFills = stage({ 2: 'w_sword', 3: 'w_sword', 6: 'r_archer', 7: 'r_archer', 8: 'r_ninja', 9: 'r_ninja', 10: 'r_gunner' }, false);
    // Ranger line full to the gunner: the ninja has nothing to fill; the sword's rung (the viking) is free, so the warrior sword comes first although it is the lower rank.
    expect(pickPartner(swordFills.sim)?.id).toBe('w_sword');
  });

  it('puts the higher rank before the lower when nothing else tells two cats apart (all with twins, all rungs taken)', () => {
    const { sim } = stage({ 0: 'w_paw', 1: 'w_paw', 5: 'w_sword', 6: 'w_sword', 7: 'w_viking', 8: 'w_viking', 9: 'w_samurai' }, false);
    expect(pickPartner(sim)?.id).toBe('w_viking');
    // Without the vikings the sword is the higher rank and still comes before the paw (its rung, the viking, is free: it also fills one).
    sim.units[7] = null;
    sim.units[8] = null;
    expect(pickPartner(sim)?.id).toBe('w_sword');
  });

  it('puts the lower tile first among cats that are equal in everything else', () => {
    const { sim } = stage({ 5: 'w_paw', 6: 'w_paw', 1: 'r_sling', 2: 'r_sling' }, false);
    expect(pickPartner(sim)?.cell).toBe(1);
    const other = stage({ 1: 'w_paw', 6: 'w_paw', 5: 'r_sling', 2: 'r_sling' }, false);
    expect(pickPartner(other.sim)?.cell).toBe(1);
  });

  it('never takes a legendary or a mythic cat, and says nobody when only those (and cats whose merge costs a step) are there', () => {
    const { sim } = stage({ 0: 'w_samurai', 1: 'r_gunner', 2: 'm_frost', 3: 'm_cosmo', 4: 't_alch' }, false);
    expect(pickPartner(sim)).toBeNull();
    const unsafe = stage({ 1: 'w_sword', 2: 'w_viking', 3: 'w_samurai' }, false);
    expect(pickPartner(unsafe.sim)).toBeNull();
    turn(ROW, 'partnerSafe', false);
    expect(pickPartner(unsafe.sim)?.id).toBe('w_viking');
  });

  it('follows the rank limits of the row', () => {
    const { sim } = stage({ 0: 'w_paw', 1: 'r_archer', 2: 'm_storm' }, false);
    // No twin on any, so the order is: the rank limits keep the epic out when max is 1, and the common out when min is 1.
    turn(ROW, 'partnerRanks', { min: 0, max: 1 });
    expect(['w_paw', 'r_archer']).toContain(pickPartner(sim)?.id);
    expect(pickPartner(sim)?.id).not.toBe('m_storm');
    turn(ROW, 'partnerRanks', { min: 1, max: 1 });
    expect(pickPartner(sim)?.id).toBe('r_archer');
    turn(ROW, 'partnerRanks', { min: 2, max: 2 });
    expect(pickPartner(sim)?.id).toBe('m_storm');
  });

  it('reads the order of the row: with the keys reversed the lower rank with a twin and the lower tile come first', () => {
    const { sim } = stage({ 0: 'w_paw', 1: 'w_paw', 2: 'w_sword', 3: 'w_sword', 4: 'w_viking', 5: 'w_viking', 6: 'w_samurai' }, false);
    expect(pickPartner(sim)?.id).toBe('w_viking');
    turn(ROW, 'partnerOrder', ['lowerCell']);
    expect(pickPartner(sim)?.cell).toBe(0);
  });
});

// ───────────────────────────── the step test against real merges ─────────────────────────────

/** A board of many cats of all ranks and classes from a seed, on a fresh battle (the same seed gives the same board). */
function randomBoard(seed: number): Sim {
  const rng = new Rng(seed);
  const sim = newSim({ seed: 600 + seed });
  quietWave(sim);
  sim.waveDuration = 1e6;
  for (let c = 0; c < 25; c++) sim.units[c] = null;
  const cells = Array.from({ length: 25 }, (_, i) => i);
  rng.shuffle(cells);
  const target = rng.int(6, 19);
  const ids: UnitId[] = [];
  for (const id of UNIT_IDS) {
    // Roughly a third of the cats are on the board, some of them twice; the mythics are rarer and never twice.
    const rank = unitRarityIndex(id);
    if (rng.next() < (rank === 4 ? 0.25 : 0.4)) ids.push(id);
    if (rank <= 3 && rng.next() < 0.3) ids.push(id);
  }
  rng.shuffle(ids);
  ids.slice(0, target).forEach((id, n) => {
    const cell = cells[n] as number;
    sim.units[cell] = makeUnit(sim, id, cell, 0);
  });
  refresh(sim);
  return sim;
}

describe('the step test, checked against the real thing on many random boards', () => {
  it('says "this merge would lower a step" exactly when a real merge of the cat with a new twin lowers it, and when a real promotion does', () => {
    let candidates = 0;
    let lowering = 0;
    for (let seed = 1; seed <= 70; seed++) {
      const probe = randomBoard(seed);
      for (const u of probe.units) {
        if (!u || u.rarityIndex > 2) continue;
        const cell = u.cell;
        const predicted = partnerWouldLowerStep(probe, u);
        const before = Array.from(probe.tier);
        // The real merge: a twin on an empty tile, dragged onto the cat.
        const merged = randomBoard(seed);
        const empty = merged.units.findIndex((c) => c === null);
        placeUnit(merged, u.id, empty, 'skill');
        expect(merged.drop(empty, cell)).toBeNull();
        const lowersByMerge = Array.from(merged.tier).some((t, i) => t < (before[i] as number));
        // The real promotion in place.
        const grown = randomBoard(seed);
        promoteUnit(grown, cell);
        const lowersByPromotion = Array.from(grown.tier).some((t, i) => t < (before[i] as number));
        expect(lowersByMerge, `seed ${seed} cell ${cell} ${u.id} merge`).toBe(predicted);
        expect(lowersByPromotion, `seed ${seed} cell ${cell} ${u.id} promotion`).toBe(predicted);
        candidates++;
        if (predicted) lowering++;
      }
    }
    // The boards were varied enough to see both answers many times.
    expect(candidates).toBeGreaterThan(300);
    expect(lowering).toBeGreaterThan(30);
    expect(candidates - lowering).toBeGreaterThan(100);
  });

  it('says "this awakening would lower a step" exactly when a real awakening lowers it', () => {
    let candidates = 0;
    let lowering = 0;
    for (let seed = 101; seed <= 190; seed++) {
      const probe = randomBoard(seed);
      for (const u of probe.units) {
        if (!u || u.rarityIndex !== 3) continue;
        const predicted = guardianWouldLowerStep(probe, u);
        const before = Array.from(probe.tier);
        const real = randomBoard(seed);
        awakenUnit(real, u.cell, true);
        const lowers = Array.from(real.tier).some((t, i) => t < (before[i] as number));
        expect(lowers, `seed ${seed} cell ${u.cell} ${u.id}`).toBe(predicted);
        candidates++;
        if (predicted) lowering++;
      }
    }
    expect(candidates).toBeGreaterThan(40);
    expect(lowering).toBeGreaterThan(5);
    expect(candidates - lowering).toBeGreaterThan(10);
  });

  it('the formula\'s commons do not count towards a step (the first rank that counts is the second)', () => {
    expect(SYNERGY_MIN_RANK).toBe(1);
  });
});

// ───────────────────────────── where the twin stands, and what it is ─────────────────────────────

describe('the twin', () => {
  it('stands on the nearest empty tile to the original: above and below (96 px) before left and right (108 px), the lower tile on a tie', () => {
    // A sling in tile 12, every other tile empty but the lucky cat's; each twin takes the next nearest tile once the nearer ones are taken.
    const { sim, cat } = stage({ 12: 'r_sling' });
    // Blockers that are never candidates (a legendary or a mythic cat), put on the tiles the twin took, so that the original stays the only choice.
    const taken: number[] = [];
    for (let i = 0; i < 6; i++) {
      const t = partnerOpens(sim, cat!);
      const seat = t.opens.at(-1)!.cell;
      expect(t.opens.at(-1)).toMatchObject({ kind: 'partner', result: 'seat', origin: 12 });
      taken.push(seat);
      sim.units[seat] = null;
      put(sim, seat, 'w_tiger', 0);
    }
    // 7 above, 17 below (both 96 px), then 11 left and 13 right (108 px), then the diagonals (144 px): 6, 8, 16, 18 by tile number among the ties.
    expect(taken).toEqual([7, 17, 11, 13, 6, 8]);
  });

  it('counts a tile in a corner the same way: tile 2 gets 7, then 1', () => {
    const { sim, cat } = stage({ 2: 'r_sling' });
    const first = partnerOpens(sim, cat!);
    expect(first.opens[0]!.cell).toBe(7);
    const second = partnerOpens(sim, cat!);
    expect(second.opens.at(-1)!.cell).toBe(1);
  });

  it('is the same cat as the original, a real new cat of the player: a "summon" event with the source skill, after capsuleOpen', () => {
    const { sim, cat } = stage({ 12: 'w_viking', 11: 'w_sword' });
    const t = partnerOpens(sim, cat!);
    expect(t.log).toEqual(['cast', 'open:partner:seat', 'summon']);
    const twin = t.summons[0]!.unit;
    expect(twin.id).toBe('w_viking');
    expect(t.summons[0]!.source).toBe('skill');
    expect(sim.units[t.opens[0]!.cell]!.uid).toBe(twin.uid);
    expect(t.opens[0]).toMatchObject({ kind: 'partner', small: false, inner: null, result: 'seat', origin: 12, purr: 0, x: cellCenterX(24), y: cellCenterY(24) });
    expect(sim.units.filter((c) => c?.id === 'w_viking')).toHaveLength(2);
  });

  it('is a normal new cat: its gauges start at half, it counts as summoned, and the dragging of two twins merges them', () => {
    const { sim, cat } = stage({ 12: 'w_viking', 11: 'w_sword' });
    const before = sim.summonedUnits;
    const t = partnerOpens(sim, cat!);
    const twin = sim.units[t.opens[0]!.cell]!;
    // (It stood half a tick: the opening is in the middle of the tick and the gauges climb in the same one.)
    expect(twin.charge).toBeCloseTo(0.5, 1);
    expect(twin.sp).toBeCloseTo(0.5, 1);
    expect(sim.summonedUnits).toBe(before + 1);
    expect(sim.drop(twin.cell, 12)).toBeNull();
    expect(sim.units[12]!.id).toBe('w_samurai');
  });

  it('touches nothing of the summon economy: the price, the pity count, the luck and the summon and pick streams stay as they were', () => {
    const { sim, cat } = stage({ 12: 'r_sling' });
    const paid = sim.paidSummons;
    const dry = sim.epicDry;
    const luck = { ...sim.luck };
    const streams = sim.rng.states();
    const fish = sim.fish;
    const t = partnerOpens(sim, cat!);
    expect(t.summons).toHaveLength(1);
    expect(sim.paidSummons).toBe(paid);
    expect(sim.epicDry).toBe(dry);
    expect(sim.luck).toEqual(luck);
    expect(sim.fish).toBe(fish);
    // Only the combat stream moved (the cast's roll).
    const after = sim.rng.states();
    streams.forEach((v, i) => {
      if (i !== 6) expect(after[i], String(i)).toBe(v);
    });
  });

  it('is announced by the real pass too: a full gauge, a forced partner roll, and a twin 1.2 s later', () => {
    const sim = arena();
    clearBoard(sim);
    put(sim, 12, 'r_sling', 0);
    lucky(sim, 24);
    const t = tape(sim);
    force(sim, 'partner');
    advance(sim, 1.4);
    expect(t.log).toEqual(['cast', 'open:partner:seat', 'summon']);
  });

  it('works in the daily challenge without rangers: the twin of a ranger that is already there is not a new class and still comes', () => {
    const sim = arena({ mode: 'daily', modifiers: ['no_rangers'] });
    clearBoard(sim);
    put(sim, 12, 'r_sling', 0);
    const cat = lucky(sim, 24, 0);
    const t = partnerOpens(sim, cat);
    expect(t.opens[0]).toMatchObject({ result: 'seat' });
    expect(sim.units.filter((c) => c?.id === 'r_sling')).toHaveLength(2);
  });

  it('steps the clone of a ninja aside when the twin takes the tile the clone stands on (a clone does not block the tile)', () => {
    const sim = arena();
    clearBoard(sim);
    const ninja = put(sim, 12, 'r_ninja', 0);
    const cat = lucky(sim, 24, 0);
    // A clone stands on tile 7, the nearest empty tile to the ninja: the twin of the ninja takes it and the clone hops back onto the ninja's tile.
    ninja.clone.push({ index: 0, cell: 7, left: 4, readyAt: 0, until: 1e9 });
    sim.cloners.push(ninja);
    const steps = record(sim, 'cloneStep');
    const t = partnerOpens(sim, cat);
    expect(t.opens[0]).toMatchObject({ result: 'seat', cell: 7, origin: 12 });
    expect(steps).toHaveLength(1);
    expect(steps[0]).toMatchObject({ index: 0, from: 7, to: 12 });
    expect(ninja.clone[0]!.cell).toBe(-1);
    expect(sim.units[7]!.id).toBe('r_ninja');
  });
});

// ───────────────────────────── no empty tile ─────────────────────────────

describe('the twin on a full board: the cat grows one rank where it stands', () => {
  function full(cats: Readonly<Record<number, UnitId>>): { sim: Sim; cat: SimUnit } {
    const { sim, cat } = stage(cats);
    // Every other tile gets a pair of paws... of different classes would add candidates; use cats that are never candidates: legendaries and mythics.
    const filler: UnitId[] = ['m_frost', 'w_tiger', 'r_star', 'm_cosmo'];
    let k = 0;
    for (let c = 0; c < 25; c++) if (sim.units[c] === null) put(sim, c, filler[k++ % filler.length]!, 0);
    return { sim, cat: cat! };
  }

  it('promotes the chosen cat in its own tile: the next rank of the same line, a "promote" event, no merge', () => {
    const { sim, cat } = full({ 12: 'r_sling' });
    const merges = sim.merges;
    const t = partnerOpens(sim, cat);
    expect(t.opens[0]).toMatchObject({ kind: 'partner', result: 'promote', cell: 12, origin: 12 });
    expect(t.log).toEqual(['cast', 'open:partner:promote', 'promote']);
    expect(t.promotes[0]).toMatchObject({ cell: 12 });
    expect(t.promotes[0]!.from.id).toBe('r_sling');
    expect((t.promotes[0]!.from as SimUnit).removed).toBe(true);
    expect(sim.units[12]!.id).toBe('r_archer');
    expect(sim.units[12]!.id).toBe(mergeResultOf('r_sling'));
    expect(sim.merges).toBe(merges);
    expect(t.summons).toHaveLength(0);
  });

  it('starts the new cat\'s attack gauge at half and keeps a skill gauge\'s ratio when both cats have a skill', () => {
    const { sim, cat } = full({ 12: 'w_viking', 13: 'w_sword' });
    const viking = sim.units[12]!;
    viking.sp = 0.3;
    // The gauges at the very moment of the promotion (the opening is in the middle of the tick; the gauges climb a moment later in the same tick).
    const seen: Array<[number, number, number]> = [];
    sim.events.on('promote', (e) => seen.push([e.from.sp, e.result.sp, e.result.charge]));
    // The viking is the choice: the sword's rung (the viking) is taken and it has no twin; the viking's rung, the samurai, is free.
    partnerOpens(sim, cat);
    expect(sim.units[12]!.id).toBe('w_samurai');
    expect(seen).toHaveLength(1);
    expect(seen[0]![0]).toBeCloseTo(0.3 + 1.2 / SP_ROWS.shove.cooldown, 2);
    expect(seen[0]![1]).toBe(seen[0]![0]);
    expect(seen[0]![2]).toBe(0.5);
    expect(viking.removed).toBe(true);
  });

  it('starts a skill gauge at half when the cat had none (a rare grows into an epic that has a skill)', () => {
    const { sim, cat } = full({ 12: 'w_sword' });
    const seen: number[] = [];
    sim.events.on('promote', (e) => seen.push(e.result.sp));
    partnerOpens(sim, cat);
    expect(sim.units[12]!.id).toBe('w_viking');
    expect(seen).toEqual([0.5]);
  });

  it('sends a ninja\'s clones away when the ninja is promoted', () => {
    const { sim, cat } = full({ 12: 'r_ninja' });
    const ninja = sim.units[12]!;
    ninja.clone.push({ index: 0, cell: -1, left: 4, readyAt: 0, until: 1e9 });
    sim.cloners.push(ninja);
    const ends = record(sim, 'cloneEnd');
    // The clones are sent away by the promotion itself, before its event (not found out a tick later by the skills' pass).
    let endsAtPromotion = -1;
    sim.events.on('promote', () => (endsAtPromotion = ends.length));
    partnerOpens(sim, cat);
    expect(sim.units[12]!.id).toBe('r_gunner');
    expect(endsAtPromotion).toBe(1);
    expect(ends).toHaveLength(1);
    expect(ends[0]).toMatchObject({ reason: 'gone' });
    expect(sim.cloners).toHaveLength(0);
  });

  it('pays 3 purr instead when the knob says a common is not worth a promotion', () => {
    turn(ROW, 'fullBoardPartnerFloor', true);
    const { sim, cat } = full({ 12: 'r_sling' });
    const t = partnerOpens(sim, cat);
    expect(t.opens[0]).toMatchObject({ result: 'fallback', purr: 3 });
    expect(sim.units[12]!.id).toBe('r_sling');
    const { sim: sim2, cat: cat2 } = full({ 12: 'r_archer' });
    const t2 = partnerOpens(sim2, cat2);
    expect(t2.opens[0]).toMatchObject({ result: 'promote' });
  });

  it('gives the same cat a seat or a promotion: the choice does not depend on the empty tiles', () => {
    const open = stage({ 12: 'w_sword', 1: 'w_paw', 3: 'w_paw' });
    const closed = stage({ 12: 'w_sword', 1: 'w_paw', 3: 'w_paw' });
    fillRest(closed.sim, 'w_tiger');
    expect(pickPartner(open.sim)?.cell).toBe(pickPartner(closed.sim)?.cell);
  });
});

// ───────────────────────────── nobody to give a twin to, and capsule after capsule ─────────────────────────────

describe('when there is nobody', () => {
  it('pays 3 purr when the board has only legendaries and mythics, and says so in the event', () => {
    const { sim, cat } = stage({ 0: 'w_samurai', 1: 'r_gunner', 2: 'm_frost' });
    const t = partnerOpens(sim, cat!);
    expect(t.opens[0]).toMatchObject({ kind: 'partner', result: 'fallback', cell: -1, origin: -1, purr: 3 });
    expect(t.purr[0]!.delta).toBe(3);
    expect(t.summons).toHaveLength(0);
    expect(sim.purr).toBe(3);
  });

  it('pays 3 purr when every candidate would cost its class a step', () => {
    const { sim, cat } = stage({ 1: 'w_sword', 2: 'w_viking', 3: 'w_samurai' }, true);
    const t = partnerOpens(sim, cat!);
    expect(t.opens[0]).toMatchObject({ result: 'fallback', purr: 3 });
  });
});

describe('capsule after capsule', () => {
  it('chooses another cat for the next twin while one has no twin yet, and the same one again when it was the only one', () => {
    const { sim, cat } = stage({ 12: 'r_sling', 6: 'm_snow' });
    // (Each call starts a tape that goes on listening, so the origin is read at once.)
    const origins: number[] = [];
    for (let i = 0; i < 3; i++) origins.push(partnerOpens(sim, cat!).opens.at(-1)!.origin);
    // First: both without a twin, equal in everything else: the lower tile, the snowball (tile 6). Then only the sling has no twin: tile 12.
    expect(origins.slice(0, 2)).toEqual([6, 12]);
    // Then both have twins and nothing else tells the cats apart: the lowest tile of them all (the snowball's twin stands above it, in tile 1).
    expect(origins[2]).toBe(1);
  });

  it('works out the second capsule on the board the first one left, even when both open in the same tick', () => {
    const sim = arena();
    clearBoard(sim);
    put(sim, 12, 'r_sling', 0);
    put(sim, 6, 'm_snow', 0);
    const a = lucky(sim, 23, 0);
    const b = lucky(sim, 24, 0);
    const t = tape(sim);
    const spy = vi.spyOn(sim.rng.combat, 'next');
    spy.mockReturnValue(0.67);
    castNow(sim, a);
    castNow(sim, b);
    openIt(sim);
    expect(t.opens.filter((o) => o.result === 'seat')).toHaveLength(2);
    expect(new Set(t.opens.map((o) => o.origin)).size).toBe(2);
    spy.mockRestore();
  });
});

// ───────────────────────────── the guardian ─────────────────────────────

describe('the guardian capsule', () => {
  function awakenBoard(cats: Readonly<Record<number, UnitId>>): { sim: Sim; cat: SimUnit } {
    const { sim, cat } = stage(cats, true);
    return { sim, cat: cat! };
  }

  function guardianOpens(sim: Sim, cat: SimUnit): ReturnType<typeof tape> {
    const t = tape(sim);
    force(sim, 'guardian');
    castNow(sim, cat);
    openIt(sim);
    return t;
  }

  it('awakens a legendary cat for free: no purr is spent, the event says free, the awakenings count goes up', () => {
    const { sim, cat } = awakenBoard({ 5: 'w_sword', 6: 'w_samurai' });
    expect(sim.tier[0]).toBe(1);
    sim.purr = 0;
    const count = sim.awakenings;
    const t = guardianOpens(sim, cat);
    expect(t.log).toEqual(['cast', 'open:guardian:awaken', 'awaken:free']);
    expect(t.opens[0]).toMatchObject({ kind: 'guardian', result: 'awaken', cell: 6, origin: -1, purr: 0 });
    expect(t.awakens[0]).toMatchObject({ cell: 6, free: true });
    expect(t.awakens[0]!.from.id).toBe('w_samurai');
    expect(t.awakens[0]!.result.id).toBe('w_tiger');
    expect(sim.units[6]!.id).toBe('w_tiger');
    expect(sim.purr).toBe(0);
    expect(sim.awakenings).toBe(count + 1);
    expect(sim.getStats().awakenings).toBe(count + 1);
  });

  it('leaves the event of the player\'s own awakening as it was: no free key', () => {
    const { sim } = awakenBoard({ 5: 'w_sword', 6: 'w_samurai' });
    sim.purr = 10;
    const awakens = record(sim, 'awaken');
    expect(sim.awaken(6)).toBeNull();
    expect(awakens).toHaveLength(1);
    expect('free' in awakens[0]!).toBe(false);
    expect(sim.purr).toBe(0);
  });

  it('keeps the skill gauge\'s ratio into the mythic (both have a skill)', () => {
    const { sim, cat } = awakenBoard({ 5: 'w_sword', 6: 'w_samurai' });
    sim.units[6]!.sp = 0.42;
    const seen: Array<[number, number]> = [];
    sim.events.on('awaken', (e) => seen.push([e.from.sp, e.result.sp]));
    guardianOpens(sim, cat);
    expect(sim.units[6]!.id).toBe('w_tiger');
    expect(seen).toHaveLength(1);
    expect(seen[0]![0]).toBeCloseTo(0.42 + 1.2 / 24, 2);
    expect(seen[0]![1]).toBe(seen[0]![0]);
  });

  it('picks the class with the highest step first, then the class order (warrior, ranger, mage, trickster), then the lower tile', () => {
    // Warriors tier 1 (sword + samurai), mages tier 2 (fire, storm, frost): the mage's frost king first.
    const high = awakenBoard({ 1: 'w_sword', 2: 'w_samurai', 3: 'm_fire', 4: 'm_storm', 5: 'm_frost' });
    expect(high.sim.tier[0]).toBe(1);
    expect(high.sim.tier[2]).toBe(2);
    expect(pickGuardian(high.sim)?.id).toBe('m_frost');
    // Equal steps: the earlier class (warrior).
    const same = awakenBoard({ 1: 'w_sword', 2: 'w_samurai', 3: 'm_fire', 4: 'm_frost' });
    expect(pickGuardian(same.sim)?.id).toBe('w_samurai');
    // Rangers and mages at equal steps: the ranger.
    const rm = awakenBoard({ 3: 'm_fire', 4: 'm_frost', 10: 'r_archer', 11: 'r_gunner' });
    expect(pickGuardian(rm.sim)?.id).toBe('r_gunner');
    // The same legendary twice: the lower tile.
    const twice = awakenBoard({ 8: 'w_samurai', 2: 'w_samurai', 1: 'w_sword' });
    expect(pickGuardian(twice.sim)?.cell).toBe(2);
  });

  it('leaves out a class whose step is too low to awaken (below AWAKEN_MIN_TIER), as the button would', () => {
    const { sim } = awakenBoard({ 6: 'w_samurai' });
    expect(sim.tier[0]).toBe(0);
    expect(pickGuardian(sim)).toBeNull();
    expect(sim.canAwaken(6)).toBe('synergy_too_low');
  });

  it('does not awaken the only legendary of a class that already has its mythic and a step to lose; it does with two of them', () => {
    // Tricksters: the lucky cat (mythic) is on the board, plus bell (rare), bard (epic), alchemist (legendary): four kinds, step 3.
    const one = awakenBoard({ 1: 't_bell', 2: 't_bard', 3: 't_alch' });
    expect(one.sim.tier[3]).toBe(3);
    expect(guardianWouldLowerStep(one.sim, one.sim.units[3]!)).toBe(true);
    expect(pickGuardian(one.sim)).toBeNull();
    const t1 = guardianOpens(one.sim, one.cat);
    expect(t1.opens[0]).toMatchObject({ result: 'fallback', purr: 10 });
    expect(one.sim.units[3]!.id).toBe('t_alch');
    const two = awakenBoard({ 1: 't_bell', 2: 't_bard', 3: 't_alch', 4: 't_alch' });
    expect(guardianWouldLowerStep(two.sim, two.sim.units[3]!)).toBe(false);
    const t2 = guardianOpens(two.sim, two.cat);
    // A new lucky cat now stands where the alchemist was, and the trickster's step is kept.
    expect(t2.opens[0]).toMatchObject({ result: 'awaken', cell: 3 });
    expect(two.sim.units[3]!.id).toBe('t_lucky');
    expect(two.sim.tier[3]).toBe(3);
  });

  it('lets the knob switch the safety off', () => {
    turn(ROW.guardianPick, 'safe', false);
    const one = awakenBoard({ 1: 't_bell', 2: 't_bard', 3: 't_alch' });
    expect(pickGuardian(one.sim)?.id).toBe('t_alch');
  });

  it('awakens the first legendary of a class without a mythic (the step is kept: one kind in, one out)', () => {
    const { sim } = awakenBoard({ 1: 'w_sword', 2: 'w_viking', 3: 'w_samurai' });
    expect(sim.tier[0]).toBe(2);
    expect(guardianWouldLowerStep(sim, sim.units[3]!)).toBe(false);
    expect(pickGuardian(sim)?.id).toBe('w_samurai');
  });

  it('pays 10 purr when nobody can be awakened, and says so', () => {
    const { sim, cat } = awakenBoard({ 0: 'w_paw', 1: 'r_sling' });
    const t = guardianOpens(sim, cat);
    expect(t.opens[0]).toMatchObject({ kind: 'guardian', result: 'fallback', cell: -1, purr: 10 });
    expect(t.purr[0]!.delta).toBe(10);
    expect(sim.awakenings).toBe(0);
  });

  it('pays purr and awakens nobody in the tutorial, where the lesson reacts to the real awakening', () => {
    const sim = newSim({ mode: 'tutorial' });
    sim.summonedUnits = 1;
    quietWave(sim);
    sim.waveDuration = 1e6;
    clearBoard(sim);
    board(sim, { 5: 'w_sword', 6: 'w_samurai' });
    const cat = lucky(sim, 24, 0);
    const t = guardianOpens(sim, cat);
    expect(t.opens[0]).toMatchObject({ kind: 'guardian', result: 'fallback', purr: 10 });
    expect(sim.units[6]!.id).toBe('w_samurai');
    expect(t.awakens).toHaveLength(0);
  });
});
