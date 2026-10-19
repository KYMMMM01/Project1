import { beforeEach, describe, expect, it, vi } from 'vitest';

const played = vi.hoisted(() => ({ play: [] as Array<[string, Record<string, number> | undefined]> }));

vi.mock('@/audio', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/audio')>()),
  audio: {
    play: (id: string, opts?: Record<string, number>) => played.play.push([id, opts]),
    playStep: () => undefined,
  },
}));

import { seedAudio } from '@/audio';
import type { BattleContext } from '@/view/context';
import { mountCombat } from '@/view/director/combat';
import { VOLLEY_STEPS, Volley } from '@/view/director/policy';
import { Stage } from '@/view/director/stage';
import type { EnemyState } from '@/game';

type Handler = (e: Record<string, unknown>) => void;

/** The combat director on a real stage (its rules, its volley, its spread) and a stand-in for everything that is drawn. */
function rig(): { hit(e: Record<string, unknown>): void; stage: Stage; enemies: EnemyState[] } {
  const handlers = new Map<string, Handler[]>();
  const on = ((type: string, fn: Handler) => {
    handlers.set(type, [...(handlers.get(type) ?? []), fn]);
  }) as unknown as Parameters<typeof mountCombat>[1];
  const enemies: EnemyState[] = [];
  const fx = {
    ps: { burst: () => undefined },
    numbers: { sense: null },
    critBurst: () => undefined,
    shockwave: () => undefined,
    number: () => undefined,
  };
  const stage = new Stage({ fx, layout: { w: 720, fieldX: 0 }, battle: { enemies, time: 0 } } as unknown as BattleContext);
  stage.stop = () => undefined;
  stage.shake = () => undefined;
  stage.buzz = () => undefined;
  mountCombat(stage, on);
  return { hit: (e) => handlers.get('hit')?.forEach((fn) => fn(e)), stage, enemies };
}

function foe(uid: number, x: number, id: EnemyState['id'] = 'cucumber'): EnemyState {
  return { uid, id, x, y: 300, angle: -Math.PI / 2, hp: 80, maxHp: 100 } as EnemyState;
}

const blow = (en: EnemyState, over: Record<string, unknown> = {}): Record<string, unknown> => ({
  enemy: en, amount: 1, absorbed: 0, crit: false, killed: false, type: 'physical', unitId: 'r_star', dot: null, ...over,
});

const heard = (prefix: string): Array<[string, Record<string, number> | undefined]> => played.play.filter(([id]) => id.startsWith(prefix));

beforeEach(() => {
  played.play.length = 0;
  seedAudio();
});

describe('one shot is one blow and a fading echo of it (Volley)', () => {
  it('lets the first blow of a volley sound in full, the second at 0.6, the third at 0.4 and the rest not at all', () => {
    const v = new Volley(4);
    expect([0, 1, 2, 3, 4, 5].map((i) => v.next(0, 1 + i * 0.03, 0.12))).toEqual([...VOLLEY_STEPS, 0, 0]);
  });

  it('starts a new volley when the weapon has been quiet for the gap, counts per weapon, and never silences a blow that matters', () => {
    const v = new Volley(4);
    for (let i = 0; i < 5; i++) v.next(0, 1 + i * 0.03, 0.12);
    // another weapon is a volley of its own
    expect(v.next(1, 1.1, 0.12)).toBe(1);
    // a blow that matters comes in the middle of the first volley: it takes the last audible step
    expect(v.next(0, 1.2, 0.12, true)).toBe(0.4);
    // a pause longer than the gap, and the weapon starts over
    expect(v.next(0, 1.6, 0.12)).toBe(1);
    v.reset();
    expect(v.next(0, 1.61, 0.12)).toBe(1);
  });

  it('is what keeps a piercing arrow from sounding once for every enemy it goes through, in the real director', () => {
    const r = rig();
    // six enemies in a row, 70 ms apart (the director's rule lets a blow through every 60 ms)
    for (let i = 0; i < 6; i++) {
      r.stage.now = 1 + i * 0.07;
      r.hit(blow(foe(i + 1, 100 + i * 80)));
    }
    const pings = heard('imp_r_star');
    expect(pings.map(([, o]) => Math.round((o?.volume ?? 0) * 100) / 100)).toEqual([0.8, 0.48, 0.32]);
    // the enemy answers where the blow was heard, as loud as it was
    expect(heard('foe_').map(([, o]) => Math.round((o?.volume ?? 0) * 100) / 100)).toEqual([0.65, 0.39, 0.26]);
  });

  it('keeps a killing blow and a heavy hit in the volley as a quiet blow and never silent', () => {
    const r = rig();
    for (let i = 0; i < 5; i++) {
      r.stage.now = 1 + i * 0.15;
      // a pierce one enemy after another: the hits are 0.15 s apart, so each is a volley of its own (nothing is thinned)
      r.hit(blow(foe(i + 1, 100)));
    }
    expect(heard('imp_r_star')).toHaveLength(5);
    played.play.length = 0;
    for (let i = 0; i < 5; i++) {
      r.stage.now = 5 + i * 0.07;
      r.hit(blow(foe(10 + i, 200), { killed: i >= 3 }));
    }
    const vols = heard('imp_r_star').map(([, o]) => Math.round((o?.volume ?? 0) * 1000) / 1000);
    // the fourth blow is a kill: a volley would have silenced it, it sounds at the last step (and a kill is a step louder)
    expect(vols).toHaveLength(4);
    expect(vols[3]).toBeCloseTo(0.8 * 1.25 * 0.4, 3);
  });

  it('tells the weapons apart: a sword does not take a place in the volley of an arrow', () => {
    const r = rig();
    r.stage.now = 1;
    r.hit(blow(foe(1, 100)));
    r.stage.now = 1.07;
    r.hit(blow(foe(2, 100), { unitId: 'w_sword' }));
    expect(heard('imp_r_star').map(([, o]) => o?.volume)).toEqual([0.8]);
    expect(heard('imp_w_sword').map(([, o]) => o?.volume)).toEqual([0.8]);
  });
});

describe('the sound of a blow is placed and spread', () => {
  it('is heard from where the enemy is: the left edge of the field at the left, the right edge at the right, the middle in the middle', () => {
    const r = rig();
    for (const [i, x] of [0, 360, 720].entries()) {
      r.stage.now = 1 + i * 0.3;
      r.hit(blow(foe(i + 1, x), { unitId: 'w_sword' }));
    }
    expect(heard('imp_w_sword').map(([, o]) => o?.pan ?? 0)).toEqual([-0.6, 0, 0.6]);
    expect(heard('foe_').map(([, o]) => o?.pan ?? 0)).toEqual([-0.6, 0, 0.6]);
  });

  it('puts the field where it is in the scene: a field that starts 100 px in is 100 px more to the right', () => {
    const s = new Stage({ fx: {}, layout: { w: 720, fieldX: 100 } } as unknown as BattleContext);
    expect(s.panOfField(0)).toBe(s.panOf(100));
    expect(s.panOfField(260)).toBe(0);
    expect(new Stage({ fx: {} } as unknown as BattleContext).panOfField(360)).toBe(0);
  });

  it('spreads the sounds of blows that land in the same instant over a few milliseconds, the first at once, instead of stacking them into one louder blow', () => {
    const s = new Stage({ fx: {}, layout: { w: 720 } } as unknown as BattleContext);
    s.now = 3;
    expect(s.playSpread(s.rules.heavyHit, 'imp_w_tiger', 0.8, 1, 0, 0, 'imp', 0.011)).toBe(true);
    s.now = 3.2;
    s.playSpread(s.rules.hit, 'imp_w_sword', 0.8, 1, 0, 0, 'imp', 0.011);
    expect(played.play.map(([, o]) => o?.delay ?? 0)).toEqual([0, 0]);
    // two in one instant (a rule that lets them both through: the player's own kinds are not rationed)
    s.now = 4;
    const delays: number[] = [];
    for (let i = 0; i < 4; i++) delays.push(s.stagger('imp', 0.011));
    expect(delays[0]).toBe(0);
    expect(delays[1]).toBeCloseTo(0.011, 9);
    expect(delays[3]).toBeCloseTo(0.033, 9);
  });

  it('only a sound the rule lets through takes a place in the run', () => {
    const s = new Stage({ fx: {}, layout: { w: 720 } } as unknown as BattleContext);
    s.now = 1;
    expect(s.playSpread(s.rules.heavyHit, 'imp_w_tiger', 1, 1, 0, 0, 'imp', 0.011)).toBe(true);
    // the same rule, 20 ms later: refused, and it must not push the next sound back
    s.now = 1.02;
    expect(s.playSpread(s.rules.heavyHit, 'imp_w_tiger', 1, 1, 0, 0, 'imp', 0.011)).toBe(false);
    expect(played.play).toHaveLength(1);
    s.now = 1.03;
    s.playSpread(s.rules.hit, 'imp_w_sword', 1, 1, 0, 0, 'imp', 0.011);
    expect(played.play[1]?.[1]?.delay ?? 0).toBeCloseTo(0.0, 9);
  });

  it('draws the little detune of every sound from the seeded stream: the same fight is the same sounds', () => {
    const run = (): number[] => {
      played.play.length = 0;
      seedAudio(77);
      const s = new Stage({ fx: {}, layout: { w: 720 } } as unknown as BattleContext);
      for (let i = 0; i < 5; i++) {
        s.now = i;
        s.play(s.rules.ui, 'coin', 1, 1, 0.05);
      }
      return played.play.map(([, o]) => o?.pitch ?? 0);
    };
    const a = run();
    const b = run();
    expect(a).toEqual(b);
    expect(new Set(a).size).toBe(5);
    for (const p of a) expect(Math.abs(p - 1)).toBeLessThanOrEqual(0.05 + 1e-9);
    // another seed is another fight
    seedAudio(78);
    const s = new Stage({ fx: {}, layout: { w: 720 } } as unknown as BattleContext);
    played.play.length = 0;
    s.play(s.rules.ui, 'coin', 1, 1, 0.05);
    expect(played.play[0]?.[1]?.pitch).not.toBe(a[0]);
  });
});
