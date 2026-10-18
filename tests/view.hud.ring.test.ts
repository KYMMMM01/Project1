import { describe, expect, it } from 'vitest';
import type { Container } from 'pixi.js';
import { unitDef, unitRarityIndex, type UnitId } from '@/game';
import { TICK } from '@/game/data/balance';
import { CELL_H, CELL_W, cellCenterX, cellCenterY } from '@/game/geometry';
import { TUTORIAL_FISH_WAVE, TUTORIAL_KING_WAVE, TUTORIAL_PICK_WAVE } from '@/game/sim/tutorial';
import { RING_AT, RING_OUTER } from '@/view/field/spRingMath';
import { FEET_DY } from '@/view/field/unitView';
import type { EnvImpl } from '@/view/hud/env';
import { nearRingCell, RING_NEAR, ringBox, ringCat } from '@/view/hud/ringSpot';
import { RING_TOPIC, RING_WATCH_EVERY, RingWatch } from '@/view/hud/ringWatch';
import { STEPS } from '@/view/hud/tutorialScript';
import { advance, newSim } from './simHelpers';

type Cat = { id: UnitId; sp: number };
const board = (...cats: Array<[number, UnitId, number]>): Array<Cat | null> => {
  const b: Array<Cat | null> = new Array<Cat | null>(25).fill(null);
  for (const [cell, id, sp] of cats) b[cell] = { id, sp };
  return b;
};

describe('which ring the lesson is about', () => {
  it('starts at 70% of a ring, on a cat that wears one', () => {
    expect(RING_NEAR).toBe(0.7);
    expect(nearRingCell(board())).toBe(-1);
    expect(nearRingCell(board([3, 'w_viking', 0.69]))).toBe(-1);
    expect(nearRingCell(board([3, 'w_viking', 0.7]))).toBe(3);
    expect(nearRingCell(board([3, 'w_viking', 1]))).toBe(3);
    // the first by cell, whatever the order the cats came in
    expect(nearRingCell(board([9, 'r_ninja', 0.8], [4, 'w_viking', 0.9]))).toBe(4);
  });

  it('never counts a cat without a skill, whatever its gauge says', () => {
    expect(unitDef('w_paw').spSkill).toBeUndefined();
    expect(nearRingCell(board([0, 'w_paw', 1], [2, 'r_sling', 1]))).toBe(-1);
    expect(nearRingCell(board([0, 'w_paw', 1], [2, 'w_viking', 0.75]))).toBe(2);
  });

  it('is blind in a battle without skills, where every gauge stays at 0', () => {
    expect(nearRingCell(board([0, 'w_viking', 0], [1, 'm_storm', 0]))).toBe(-1);
  });

  it('keeps the cat it began with while it wears a ring, even after a cast has emptied it, and does not jump to a second ring', () => {
    const b = board([3, 'w_viking', 0.75], [8, 't_bard', 0.9]);
    expect(ringCat(b, -1)).toBe(3);
    expect(ringCat(b, 8)).toBe(8);
    b[3] = { id: 'w_viking', sp: 0 };
    expect(ringCat(b, 3)).toBe(3);
    // the cat has gone: the next ring that is nearly full
    b[3] = null;
    expect(ringCat(b, 3)).toBe(8);
    b[8] = null;
    expect(ringCat(b, 3)).toBe(-1);
    // a last cell that holds a cat with no ring is not kept
    expect(ringCat(board([3, 'w_paw', 1], [5, 'w_viking', 0.8]), 3)).toBe(5);
  });

  it('puts the spotlight on the ring where the field draws it: from the cat\'s feet, inside its cell', () => {
    for (let cell = 0; cell < 25; cell++) {
      const r = ringBox(cell);
      expect(r.w).toBeCloseTo(2 * RING_OUTER, 6);
      expect(r.h).toBeCloseTo(2 * RING_OUTER, 6);
      expect(r.x + r.w / 2).toBeCloseTo(cellCenterX(cell) + RING_AT.x, 6);
      expect(r.y + r.h / 2).toBeCloseTo(cellCenterY(cell) + FEET_DY + RING_AT.y, 6);
      // inside the cell's 108 x 96 (the same promise the ring's own tests hold)
      expect(r.x).toBeGreaterThanOrEqual(cellCenterX(cell) - CELL_W / 2);
      expect(r.x + r.w).toBeLessThanOrEqual(cellCenterX(cell) + CELL_W / 2);
      expect(r.y).toBeGreaterThanOrEqual(cellCenterY(cell) - CELL_H / 2);
      expect(r.y + r.h).toBeLessThanOrEqual(cellCenterY(cell) + CELL_H / 2);
    }
  });
});

describe('where the lesson falls in the tutorial run', () => {
  /** A tutorial sim at the scripted pick of three of wave 3, as the first test of sim.tutorial does it. */
  function atThePick() {
    const sim = newSim({ mode: 'tutorial' });
    sim.summon();
    advance(sim, 3.1);
    advance(sim, 12 * (TUTORIAL_PICK_WAVE - 1) + 0.3);
    return sim;
  }

  it('hands out Alley Bosses at wave 3, and every one of them wears a ring', () => {
    const sim = atThePick();
    expect(sim.phase).toBe('choice');
    expect(sim.wave).toBe(TUTORIAL_PICK_WAVE);
    const options = sim.pending?.kind === 'summon' ? sim.pending.options : [];
    expect(options).toHaveLength(3);
    for (const id of options) {
      expect(unitRarityIndex(id), id).toBe(2);
      expect(unitDef(id).spSkill, id).toBeDefined();
    }
  });

  it('has the new cat\'s ring nearly full a few seconds after the pick, in the same wave and with no choice pending, whichever cat is picked', () => {
    for (let pick = 0; pick < 3; pick++) {
      const sim = atThePick();
      const options = sim.pending?.kind === 'summon' ? sim.pending.options : [];
      const id = options[pick] as UnitId;
      expect(sim.pickSummon(pick)).toBeNull();
      const cell = sim.units.findIndex((u) => u?.id === id);
      expect(cell, id).toBeGreaterThanOrEqual(0);
      // a new cat's ring starts half full: not yet the lesson's moment
      expect(nearRingCell(sim.units as never), id).toBe(-1);
      const cooldown = unitDef(id).spSkill?.cooldown ?? 0;
      let waited = 0;
      while (nearRingCell(sim.units as never) < 0 && waited < cooldown) {
        sim.step(TICK);
        waited += TICK;
      }
      expect(nearRingCell(sim.units as never), id).toBe(cell);
      // 70% - 50% of the cooldown, give or take a tick
      expect(waited, id).toBeLessThanOrEqual(0.2 * cooldown + 2 * TICK);
      expect(waited, id).toBeGreaterThanOrEqual(0.2 * cooldown - 2 * TICK);
      expect(sim.wave, id).toBe(TUTORIAL_PICK_WAVE);
      expect(sim.pending, id).toBeNull();
      expect(sim.phase, id).toBe('wave');
    }
  });

  it('is taught in the wave of the pick only: the elite of wave 4 and the king of wave 6 and its ring never meet it', () => {
    const sp = STEPS.find((s) => s.id === 'sp_skill');
    expect(sp?.staleAt).toBe(TUTORIAL_PICK_WAVE + 1);
    const elite = STEPS.find((s) => s.id === 'elite');
    expect(sp?.staleAt).toBeLessThanOrEqual(elite?.staleAt ?? 0);
    expect(sp?.staleAt).toBeLessThanOrEqual(TUTORIAL_FISH_WAVE);
    expect(TUTORIAL_KING_WAVE).toBeGreaterThanOrEqual(sp?.staleAt ?? 0);
  });

  it('leaves the rest of wave 3 after the pick, far more than the 0.2 of a cooldown a new ring needs', () => {
    for (let pick = 0; pick < 3; pick++) {
      const sim = atThePick();
      const id = (sim.pending?.kind === 'summon' ? sim.pending.options : [])[pick] as UnitId;
      sim.pickSummon(pick);
      let left = 0;
      while (sim.wave === TUTORIAL_PICK_WAVE && sim.phase !== 'lost' && left < 60) {
        sim.step(TICK);
        left += TICK;
      }
      expect(sim.wave).toBe(TUTORIAL_PICK_WAVE + 1);
      // the lesson's moment is 0.2 of the cooldown into the wave; a second of margin for the lessons' own breath
      expect(left, id).toBeGreaterThan(0.2 * (unitDef(id).spSkill?.cooldown ?? 0) + 2);
    }
  });
});

/** A stand-in for the HUD's environment: just what the watcher reads. */
function fakeEnv(opts: { spOn: boolean; units: Array<{ uid: number; id: UnitId; sp: number } | null>; seen?: boolean; ring?: boolean; view?: boolean }) {
  const requests: Array<{ id: string; target: unknown }> = [];
  const ringNode = { name: 'ring' } as unknown as Container;
  const view = { getChildByLabel: (label: string) => (label === 'sp-ring' && opts.ring !== false ? ringNode : null) } as unknown as Container;
  const env = {
    battle: { spOn: opts.spOn, units: opts.units },
    hints: { has: () => opts.seen === true, request: (id: string, target: unknown) => requests.push({ id, target }) },
    ctx: { unitView: () => (opts.view === false ? null : view) },
  } as unknown as EnvImpl;
  return { env, requests, ringNode, view };
}

describe('the first-encounter card for a run that is not the tutorial\'s own', () => {
  const cats = [{ uid: 7, id: 'w_viking' as UnitId, sp: 0.8 }];
  const units = (list: typeof cats): Array<(typeof cats)[number] | null> => {
    const out: Array<(typeof cats)[number] | null> = new Array(25).fill(null);
    list.forEach((c, i) => (out[i + 2] = c));
    return out;
  };

  it('asks for the card of the skills\' topic, pointing at the ring itself', () => {
    const { env, requests, ringNode } = fakeEnv({ spOn: true, units: units(cats) });
    new RingWatch(env).update(0.016);
    expect(requests).toEqual([{ id: 'sp_skill', target: ringNode }]);
    expect(RING_TOPIC).toBe('sp_skill');
  });

  it('points at the cat when the ring has not been hung on it yet', () => {
    const { env, requests, view } = fakeEnv({ spOn: true, units: units(cats), ring: false });
    new RingWatch(env).update(0.016);
    expect(requests).toEqual([{ id: 'sp_skill', target: view }]);
  });

  it('asks for nothing in a battle without skills, however full a gauge looks', () => {
    const { env, requests } = fakeEnv({ spOn: false, units: units(cats) });
    const watch = new RingWatch(env);
    for (let i = 0; i < 20; i++) watch.update(0.3);
    expect(requests).toEqual([]);
  });

  it('asks for nothing while every ring is below 70%, or after the player has seen the lesson', () => {
    const low = fakeEnv({ spOn: true, units: units([{ uid: 7, id: 'w_viking', sp: 0.6 }]) });
    new RingWatch(low.env).update(0.3);
    expect(low.requests).toEqual([]);
    const seen = fakeEnv({ spOn: true, units: units(cats), seen: true });
    new RingWatch(seen.env).update(0.3);
    expect(seen.requests).toEqual([]);
  });

  it('asks for nothing while the cat has no picture yet', () => {
    const { env, requests } = fakeEnv({ spOn: true, units: units(cats), view: false });
    new RingWatch(env).update(0.3);
    expect(requests).toEqual([]);
  });

  it('looks four times a second at most', () => {
    const { env, requests } = fakeEnv({ spOn: true, units: units(cats) });
    const watch = new RingWatch(env);
    watch.update(0.016);
    watch.update(0.05);
    watch.update(0.05);
    expect(requests).toHaveLength(1);
    watch.update(RING_WATCH_EVERY);
    expect(requests).toHaveLength(2);
  });
});
