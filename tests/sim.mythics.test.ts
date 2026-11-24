import { describe, expect, it } from 'vitest';
import type { UnitId } from '@/game/api';
import { AWAKEN_COST } from '@/game/data/balance';
import { createBattle } from '@/game/sim/create';
import { captureSnapshot } from '@/game/sim/snapshot';
import type { Sim } from '@/game/sim/sim';
import { initOf, newSim, put } from './simHelpers';

/** A board where cells 0..4 can awaken a warrior and cells 5..9 a ranger (a legendary plus a second kind for the class synergy). */
function awakenable(): Sim {
  const sim = newSim();
  sim.purr = 4 * AWAKEN_COST;
  for (const [i, id] of (['w_paw', 'w_sword', 'w_viking', 'w_samurai', 'w_samurai'] as UnitId[]).entries()) put(sim, i, id);
  for (const [i, id] of (['r_sling', 'r_archer', 'r_ninja', 'r_gunner'] as UnitId[]).entries()) put(sim, 5 + i, id);
  return sim;
}

describe('the guardians a run made', () => {
  it('starts empty and lists each awakened guardian once, in the order they appeared', () => {
    const sim = awakenable();
    expect(sim.getStats().mythics).toEqual([]);
    expect(sim.awaken(4)).toBeNull();
    expect(sim.awaken(3)).toBeNull();
    expect(sim.getStats().mythics).toEqual(['w_tiger']);
    expect(sim.awaken(8)).toBeNull();
    expect(sim.getStats().mythics).toEqual(['w_tiger', 'r_star']);
  });

  it('survives a snapshot, and a save from before the record reads the Guardians off the board', () => {
    const sim = awakenable();
    expect(sim.awaken(4)).toBeNull();
    const snap = captureSnapshot(sim, 3);
    expect((createBattle(initOf(), snap) as Sim).getStats().mythics).toEqual(['w_tiger']);
    const old = JSON.parse(snap.data);
    delete old.stats.mythics;
    const restored = createBattle(initOf(), { ...snap, data: JSON.stringify(old) }) as Sim;
    expect(restored).not.toBeNull();
    expect(restored.getStats().mythics).toEqual(['w_tiger']);
  });
});
