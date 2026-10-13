/**
 * The three places a skill gauge can start (`SP_START_NEW`, `SP_START_MERGE`, `SP_START_RESTORE`) are three constants "so each can be
 * flipped alone" (hand-off skills1_sim). All three are 0.5 today, so no test could tell a call site that reads the wrong one. This file
 * gives them three different values and checks that each way a cat comes to the board reads its own.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/game/data/spSkills', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/game/data/spSkills')>();
  return { ...real, SP_START_NEW: 0.1, SP_START_MERGE: 0.2, SP_START_RESTORE: 0.3 };
});

import { SP_START_MERGE, SP_START_NEW, SP_START_RESTORE } from '@/game/data/spSkills';
import { createBattle } from '@/game/sim/create';
import type { Sim } from '@/game/sim/sim';
import { advance, newSim, put, quietWave } from './simHelpers';

describe('where a skill gauge starts', () => {
  it('sees the three constants apart in this file (the mock took)', () => {
    expect([SP_START_NEW, SP_START_MERGE, SP_START_RESTORE]).toEqual([0.1, 0.2, 0.3]);
  });

  it('starts a cat put on the board at the new-cat value', () => {
    const sim = newSim();
    expect(put(sim, 0, 'w_viking').sp).toBe(0.1);
  });

  it('starts a merge result at the merge value, whatever the two cats it came from had', () => {
    const sim = newSim();
    quietWave(sim);
    put(sim, 0, 'w_sword');
    put(sim, 1, 'w_sword');
    expect(sim.drop(0, 1)).toBeNull();
    expect(sim.units[1]?.id).toBe('w_viking');
    expect(sim.units[1]?.sp).toBe(0.2);
  });

  it('starts a cat that molts into a skill cat at the new-cat value, and a restored cat at the restore value', () => {
    const sim = newSim();
    sim.purr = 20;
    put(sim, 1, 'r_ninja');
    expect(sim.molt(1, 'warrior')).toBeNull();
    expect(sim.units[1]?.id).toBe('w_viking');
    expect(sim.units[1]?.sp).toBe(0.1);
    put(sim, 12, 'w_viking').sp = 0.9;
    advance(sim, 3.1);
    const saved = sim.snapshot();
    expect(saved).not.toBeNull();
    const resumed = createBattle(sim.init, saved as NonNullable<typeof saved>) as Sim;
    expect(resumed.units[12]?.sp).toBe(0.3);
  });
});
