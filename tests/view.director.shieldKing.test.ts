import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Texture } from 'pixi.js';

const played = vi.hoisted(() => ({ play: [] as string[], stinger: [] as string[] }));

vi.mock('@/audio', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/audio')>()),
  audio: {
    play: (id: string) => played.play.push(id),
    playStep: () => undefined,
    stinger: (id: string) => played.stinger.push(id),
  },
}));
vi.mock('@/core/assets', async (original) => ({ ...(await original<typeof import('@/core/assets')>()), hasTex: () => true, tex: () => Texture.WHITE }));

import { Emitter } from '@/core/events';
import { seedAudio } from '@/audio';
import { UNIT_IDS, unitRarityIndex } from '@/game';
import type { BattleEvents, EnemyState, UnitState } from '@/game';
import type { BattleContext } from '@/view/context';
import { mountCombat } from '@/view/director/combat';
import { mountGrowth } from '@/view/director/growth';
import { Stage, type Bus } from '@/view/director/stage';
import { RARITY_ORDER } from '@/ui/theme';

const unitOfRank = (rank: (typeof RARITY_ORDER)[number]): UnitState => ({ uid: 9, id: UNIT_IDS.find((u) => RARITY_ORDER[unitRarityIndex(u)] === rank) as string, cell: 4 }) as unknown as UnitState;

describe('a hit on a shielded enemy rings the shield (foe_shield_hit)', () => {
  let hit: (e: Record<string, unknown>) => void;
  let stage: Stage;

  beforeEach(() => {
    played.play.length = 0;
    seedAudio();
    const handlers = new Map<string, Array<(e: Record<string, unknown>) => void>>();
    const on = ((type: string, fn: (e: Record<string, unknown>) => void) => handlers.set(type, [...(handlers.get(type) ?? []), fn])) as unknown as Parameters<typeof mountCombat>[1];
    const fx = { ps: { burst: () => undefined }, numbers: { sense: null }, critBurst: () => undefined, shockwave: () => undefined, number: () => undefined };
    stage = new Stage({ fx, layout: { w: 720, fieldX: 0 }, battle: { enemies: [], time: 0 } } as unknown as BattleContext);
    stage.stop = () => undefined;
    stage.shake = () => undefined;
    stage.buzz = () => undefined;
    mountCombat(stage, on);
    hit = (e) => handlers.get('hit')?.forEach((fn) => fn(e));
  });

  const foe = (uid: number, shield: number): EnemyState => ({ uid, id: 'cucumber', x: 360, y: 300, angle: -Math.PI / 2, hp: 80, maxHp: 100, shield, maxShield: 40 }) as EnemyState;
  const blow = (en: EnemyState, absorbed: number): Record<string, unknown> => ({ enemy: en, amount: 5, absorbed, crit: false, killed: false, type: 'physical', unitId: 'r_star', dot: null });
  const rings = (): number => played.play.filter((id) => id === 'foe_shield_hit').length;

  it('rings once for a blow the shield soaked and stays silent for one that went straight through', () => {
    hit(blow(foe(1, 30), 5));
    expect(rings()).toBe(1);
    played.play.length = 0;
    hit(blow(foe(2, 0), 0));
    expect(rings()).toBe(0);
  });

  it('plays none on the blow that breaks the shield (shield_break answers that one)', () => {
    hit(blow(foe(1, 0), 5));
    expect(rings()).toBe(0);
  });

  it('is rationed: the same enemy hit again at once does not ring twice, and a crowd of shields is thinned by the fight\'s rules', () => {
    const one = foe(1, 30);
    hit(blow(one, 5));
    hit(blow(one, 5));
    expect(rings()).toBe(1);
    for (let k = 2; k < 12; k++) hit(blow(foe(k, 30), 5));
    expect(rings()).toBeLessThanOrEqual(3);
  });
});

describe('the king stinger on a merge that makes a 대왕', () => {
  let events: Emitter<BattleEvents>;
  let clock: { now: number };

  beforeEach(() => {
    played.stinger.length = 0;
    events = new Emitter<BattleEvents>();
    clock = { now: 100 };
    const stage = {
      get now() {
        return clock.now;
      },
      ctx: { battle: { units: [], specialCell: 'sun', events }, run: { fxTheme: 'fx_default' }, layout: { w: 720, h: 1440 } },
      fx: { ps: { burst: vi.fn() }, awakening: vi.fn(), summonReveal: vi.fn(), shockwave: vi.fn(), mergeBurst: vi.fn(), levelUp: vi.fn() },
      direct: vi.fn(),
      onDestroy: vi.fn(),
      addFrame: vi.fn(),
      slow: vi.fn(),
      later: vi.fn(),
      // the stage's timers run at once here, so what is played after MERGE_SECONDS is played in the test
      laterReal: (_s: number, fn: () => void) => fn(),
      play: vi.fn(),
      playStep: vi.fn(),
      buzz: vi.fn(),
      rules: { merge: {} },
      mergeLadder: { next: () => 0 },
    };
    const on = ((type: keyof BattleEvents, fn: never) => {
      events.on(type, fn);
    }) as unknown as Bus;
    mountGrowth(stage as unknown as Stage, on, {} as never, { duck: vi.fn() } as never, {} as never);
  });

  const merge = (rank: (typeof RARITY_ORDER)[number]): void => events.emit('merge', { consumed: [], result: unitOfRank(rank), cell: 4, fromCell: 5, jumped: false } as unknown as BattleEvents['merge']);
  const awaken = (): void => events.emit('awaken', { from: unitOfRank('legendary'), result: unitOfRank('mythic'), cell: 4 } as unknown as BattleEvents['awaken']);

  it('plays on the merge that makes the top rank and on no lower one', () => {
    for (const rank of ['rare', 'epic'] as const) merge(rank);
    expect(played.stinger).toEqual([]);
    merge('legendary');
    expect(played.stinger).toEqual(['king']);
  });

  it('is not played over an awakening (that one has its own mythic stinger) or over another crowning, but is again once they are over', () => {
    awaken();
    clock.now += 1;
    merge('legendary');
    expect(played.stinger).toEqual([]);
    clock.now += 4;
    merge('legendary');
    expect(played.stinger).toEqual(['king']);
    clock.now += 1;
    merge('legendary');
    expect(played.stinger).toEqual(['king']);
    clock.now += 4;
    merge('legendary');
    expect(played.stinger).toEqual(['king', 'king']);
  });
});
