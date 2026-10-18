import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Texture } from 'pixi.js';

vi.mock('@/audio', () => ({
  attackSfx: () => ({ id: 'x', volume: 1, pitch: 1 }),
  critSfx: () => ({ id: 'x', volume: 1, pitch: 1 }),
  foeHitSfx: () => ({ id: 'x', volume: 1, pitch: 1 }),
  impactSfx: () => ({ id: 'x', volume: 1, pitch: 1 }),
  audio: { play: () => undefined, stinger: () => undefined },
}));
vi.mock('@/core/assets', async (original) => ({ ...(await original<typeof import('@/core/assets')>()), hasTex: () => true, tex: () => Texture.WHITE }));

import { Emitter } from '@/core/events';
import type { BattleEvents, UnitState } from '@/game/api';
import { mountGrowth } from '@/view/director/growth';
import type { Bus, Stage } from '@/view/director/stage';

/** The awakening banner of the director, with and without `free` (the lucky cat's guardian capsule awakens a cat without spending purr). */
describe('the awakening cut-in of the guardian capsule', () => {
  const unit = { uid: 1, id: 'w_tiger', cell: 3 } as unknown as UnitState;
  let events: Emitter<BattleEvents>;
  let awakening: ReturnType<typeof vi.fn>;
  let slow: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    events = new Emitter<BattleEvents>();
    awakening = vi.fn();
    slow = vi.fn();
    const stage = {
      now: 0,
      ctx: { battle: { units: [], specialCell: 'sun', events }, run: { fxTheme: 'fx_default' }, layout: { w: 720, h: 1440 } },
      fx: { ps: { burst: vi.fn() }, awakening, summonReveal: vi.fn(), shockwave: vi.fn() },
      direct: vi.fn(),
      onDestroy: vi.fn(),
      addFrame: vi.fn(),
      slow,
      later: vi.fn(),
      laterReal: vi.fn(),
      play: vi.fn(),
      playStep: vi.fn(),
      buzz: vi.fn(),
      rules: {},
      mergeLadder: { next: () => 0 },
    };
    const on = ((type: keyof BattleEvents, fn: never) => {
      events.on(type, fn);
    }) as unknown as Bus;
    mountGrowth(stage as unknown as Stage, on, {} as never, { duck: vi.fn() } as never, {} as never);
  });

  const awaken = (free?: true): void => events.emit('awaken', { from: unit, result: { ...unit, uid: 2 } as unknown as UnitState, cell: 3, ...(free ? { free } : {}) } as BattleEvents['awaken']);
  const shortOf = (call: number): boolean => (awakening.mock.calls[call]?.[2] as { short: boolean }).short;

  it('is always the short banner, with no slow motion, and it does not use up the long first banner of the player\'s own awakening', () => {
    awaken(true);
    expect(shortOf(0)).toBe(true);
    expect(slow).not.toHaveBeenCalled();
    // The player's first awakening is still the long one (with the slow motion), the second is short.
    awaken();
    expect(shortOf(1)).toBe(false);
    expect(slow).toHaveBeenCalledTimes(1);
    awaken();
    expect(shortOf(2)).toBe(true);
    awaken(true);
    expect(shortOf(3)).toBe(true);
    expect(slow).toHaveBeenCalledTimes(1);
  });

  it('a player\'s own awakening is as it always was: long and slow the first time, short after', () => {
    awaken();
    awaken();
    expect(shortOf(0)).toBe(false);
    expect(shortOf(1)).toBe(true);
    expect(slow).toHaveBeenCalledTimes(1);
  });

  it('a free awakening takes no taps (the pause, speed and summon buttons under its banner stay alive); the player\'s own awakening still does', () => {
    const passOf = (call: number): boolean | undefined => (awakening.mock.calls[call]?.[2] as { passThrough?: boolean }).passThrough;
    awaken(true);
    expect(passOf(0)).toBe(true);
    awaken();
    expect(passOf(1) ?? false).toBe(false);
    awaken(true);
    expect(passOf(2)).toBe(true);
  });
});
