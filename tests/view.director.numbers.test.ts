import { describe, expect, it, vi } from 'vitest';

vi.mock('@/audio', () => ({
  attackSfx: () => ({ id: 'x', volume: 1, pitch: 1 }),
  critSfx: () => ({ id: 'x', volume: 1, pitch: 1 }),
  foeHitSfx: () => ({ id: 'x', volume: 1, pitch: 1 }),
  impactSfx: () => ({ id: 'x', volume: 1, pitch: 1 }),
}));

import type { Bodies } from '@/fx/numberPlan';
import type { NumberOpts, NumberTarget, NumStyle } from '@/fx/numbers';
import { enemyDef } from '@/game';
import type { EnemyId, EnemyState } from '@/game';
import { mountCombat } from '@/view/director/combat';
import { DOT_NUMBER_COLOR, SHIELD_COLOR } from '@/view/director/palette';
import type { Stage } from '@/view/director/stage';
import { bodyBox, bodySize, bodyX } from '@/view/field/policy';

type Handler = (e: Record<string, unknown>) => void;

interface Call {
  value: number | string;
  style: NumStyle;
  color: number | undefined;
  target: NumberTarget;
}

/** The director's combat part on stand-ins for the stage and the bus: what it asks of the floating numbers for each hit. */
function mount(enemies: EnemyState[]): { hit(e: Record<string, unknown>): void; calls: Call[]; sense: (into: Bodies) => void } {
  const handlers = new Map<string, Handler[]>();
  const on = ((type: string, fn: Handler) => {
    handlers.set(type, [...(handlers.get(type) ?? []), fn]);
  }) as unknown as Parameters<typeof mountCombat>[1];
  const calls: Call[] = [];
  const numbers = { sense: null as null | ((into: Bodies) => void) };
  const stage = {
    now: 0,
    detail: 1,
    ctx: { battle: { enemies } },
    fx: {
      ps: { burst: () => undefined },
      numbers,
      critBurst: () => undefined,
      shockwave: () => undefined,
      number: (_x: number, _y: number, value: number | string, style: NumStyle, o: NumberOpts) => {
        // The target is refilled for every hit: a copy is what it said then.
        calls.push({ value, style, color: o.color, target: { ...(o.target as NumberTarget) } });
      },
    },
    rules: { hit: {}, heavyHit: {}, crit: {}, shoot: {} },
    gates: { ready: () => true },
    play: () => false,
    direct: () => undefined,
    stop: () => undefined,
    shake: () => undefined,
    buzz: () => undefined,
    addFrame: () => undefined,
    later: () => undefined,
  } as unknown as Stage;
  mountCombat(stage, on);
  return { hit: (e) => handlers.get('hit')?.forEach((fn) => fn(e)), calls, sense: numbers.sense as (into: Bodies) => void };
}

function foe(id: EnemyId, uid: number, o: Partial<EnemyState> = {}): EnemyState {
  return { uid, id, x: 45, y: 300, angle: -Math.PI / 2, hp: 80, maxHp: 100, ...o } as EnemyState;
}

describe('the numbers the director asks for', () => {
  it('lists every enemy as a box for the numbers to keep clear of: picture and bar together, where it is drawn', () => {
    const cucumber = foe('cucumber', 4, { x: 3, y: 44 });
    const rig = mount([cucumber]);
    const seen: number[][] = [];
    rig.sense({ add: (...a: number[]) => seen.push(a) } as unknown as Bodies);
    const size = bodySize(enemyDef('cucumber').radius, false);
    const box = bodyBox(size);
    expect(seen).toEqual([[4, bodyX(3, size), 44, box.hw, box.top, box.bottom]]);
    // A body pulled in from the screen edge is listed where it is drawn.
    expect(seen[0]?.[1]).toBeGreaterThan(3);
  });

  it('an ordinary hit asks for an ordinary number above that enemy, with its box, its way and its health', () => {
    const e = foe('cucumber', 7, { maxHp: 250, angle: Math.PI / 2, x: 675, y: 200 });
    const rig = mount([e]);
    rig.hit({ enemy: e, amount: 20, absorbed: 0, crit: false, killed: false });
    expect(rig.calls).toHaveLength(1);
    const c = rig.calls[0] as Call;
    expect(c.style).toBe('damage');
    expect(c.value).toBe(20);
    const size = bodySize(enemyDef('cucumber').radius, false);
    expect(c.target).toMatchObject({ uid: 7, y: 200, ...bodyBox(size), angle: Math.PI / 2, maxHp: 250, heavy: false, boss: false });
  });

  it('a crit, a killing blow and a heavy hit on a boss are the big kinds; a crit that kills stays a crit', () => {
    const cucumber = foe('cucumber', 1);
    const boss = foe('boss_vacuum', 2, { maxHp: 1000 });
    const rig = mount([cucumber, boss]);
    rig.hit({ enemy: cucumber, amount: 30, absorbed: 0, crit: true, killed: false });
    rig.hit({ enemy: cucumber, amount: 30, absorbed: 0, crit: false, killed: true });
    rig.hit({ enemy: cucumber, amount: 30, absorbed: 0, crit: true, killed: true });
    rig.hit({ enemy: boss, amount: 300, absorbed: 0, crit: false, killed: false });
    rig.hit({ enemy: boss, amount: 30, absorbed: 0, crit: false, killed: false });
    expect(rig.calls.map((c) => c.style)).toEqual(['crit', 'kill', 'crit', 'big', 'damage']);
    expect(rig.calls[3]?.target).toMatchObject({ heavy: true, boss: true });
  });

  it('a damage-over-time tick is a quiet number in the colour of its kind; what a shield soaked is one in the shield\'s colour', () => {
    const e = foe('cucumber', 3);
    const rig = mount([e]);
    for (const dot of ['burn', 'poison', 'bleed'] as const) rig.hit({ enemy: e, amount: 4, absorbed: 0, crit: false, killed: false, dot });
    rig.hit({ enemy: e, amount: 10, absorbed: 6, crit: false, killed: false });
    expect(rig.calls.map((c) => [c.style, c.color])).toEqual([
      ['dot', DOT_NUMBER_COLOR.burn],
      ['dot', DOT_NUMBER_COLOR.poison],
      ['dot', DOT_NUMBER_COLOR.bleed],
      ['damage', undefined],
      ['soak', SHIELD_COLOR],
    ]);
    expect(rig.calls[3]?.value).toBe(4);
    expect(rig.calls[4]?.value).toBe(6);
  });

  it('a hit that did no damage asks for no ordinary or crit number, only for what the shield soaked', () => {
    const e = foe('cucumber', 3);
    const rig = mount([e]);
    rig.hit({ enemy: e, amount: 5, absorbed: 5, crit: false, killed: false });
    rig.hit({ enemy: e, amount: 5, absorbed: 5, crit: true, killed: false });
    expect(rig.calls.map((c) => c.style)).toEqual(['soak', 'soak']);
  });
});
