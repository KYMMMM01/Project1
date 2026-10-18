import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Texture } from 'pixi.js';

vi.mock('@/audio', () => ({
  attackSfx: () => ({ id: 'x', volume: 1, pitch: 1 }),
  critSfx: () => ({ id: 'x', volume: 1, pitch: 1 }),
  foeHitSfx: () => ({ id: 'x', volume: 1, pitch: 1 }),
  impactSfx: () => ({ id: 'x', volume: 1, pitch: 1 }),
  audio: { play: () => undefined },
}));
vi.mock('@/core/assets', async (original) => ({ ...(await original<typeof import('@/core/assets')>()), hasTex: () => true, tex: () => Texture.WHITE }));
vi.mock('@/fx', async (original) => ({
  ...(await original<typeof import('@/fx')>()),
  fxTex: () => ({ id: 'disc', texture: Texture.WHITE, w: 64, h: 64, ax: 0.5, ay: 0.5 }),
}));
// The sticker of a status is the field's own picture: a stand-in (the real one is baked on a renderer).
vi.mock('@/view/field/art', () => ({ fieldArt: () => ({ status: { freeze: Texture.WHITE, slow: Texture.EMPTY } }) }));

import type { NumStyle } from '@/fx';
import { Emitter } from '@/core/events';
import { setFxSettings } from '@/fx/settings';
import { enemyDef } from '@/game';
import type { BattleApi, BattleEvents, EnemyId, EnemyState, SpKnockShard, UnitState } from '@/game/api';
import { cloudArt } from '@/view/cloudArt';
import { mountCombat } from '@/view/director/combat';
import { makeCloud } from '@/view/director/sp/cloud';
import { makeKnock } from '@/view/director/sp/knock';
import { NUMBER_HOLD_MAX, NumberHolds, numberHoldsOf } from '@/view/director/sp/numberHold';
import type { SpEnv, SpScene } from '@/view/director/sp/types';
import { enemyInfo, type Stage } from '@/view/director/stage';
import { bodyX } from '@/view/field/policy';
import { knockArt } from '@/view/knockArt';
import { Container } from 'pixi.js';

// ── stand-ins ──

const foe = (uid: number, x: number, y: number, id: EnemyId = 'cucumber'): EnemyState =>
  ({ uid, id, x, y, angle: 0, travelled: 200, hp: 10, maxHp: 10, slow: 0, frozen: false }) as unknown as EnemyState;

const unit = (): UnitState => ({ uid: 1, id: 'm_storm', cell: 6 }) as unknown as UnitState;

interface Rig {
  stage: {
    now: number;
    detail: 0 | 1 | 2;
    reduced: boolean;
    play: ReturnType<typeof vi.fn>;
    shake: ReturnType<typeof vi.fn>;
    rules: object;
    fx: { ps: { burst: ReturnType<typeof vi.fn> }; shockwave: ReturnType<typeof vi.fn>; fleck: ReturnType<typeof vi.fn>; iceShatter: ReturnType<typeof vi.fn> };
  };
  battle: { spOn: boolean; time: number; enemies: EnemyState[]; events: Emitter<BattleEvents> };
  front: Container;
  back: Container;
  env: SpEnv;
  /** Run `seconds` of real time at `speed` (the battle's clock runs `speed` times as fast; 0 = a popup holds it). */
  run(scene: SpScene<never>, seconds: number, speed?: number): void;
  removed: number;
}

function rig(detail: 0 | 1 | 2 = 1, reduced = false): Rig {
  const events = new Emitter<BattleEvents>();
  const r = { removed: 0 } as Rig;
  // Count the listeners a scene takes off.
  const on = events.on.bind(events);
  events.on = ((type: keyof BattleEvents, fn: never) => {
    const off = on(type, fn);
    return () => {
      r.removed++;
      off();
    };
  }) as typeof events.on;
  r.battle = { spOn: true, time: 0, enemies: [], events };
  r.stage = {
    now: 0,
    detail,
    reduced,
    play: vi.fn(),
    shake: vi.fn(),
    rules: { zone: {}, big: {}, status: {}, strike: {}, heavyHit: {} },
    fx: { ps: { burst: vi.fn() }, shockwave: vi.fn(), fleck: vi.fn(), iceShatter: vi.fn() },
  };
  r.front = new Container();
  r.back = new Container();
  r.env = {
    stage: r.stage as unknown as Stage,
    ctx: { layers: { fxFront: r.front, fxBack: r.back } },
    battle: r.battle as unknown as BattleApi,
  } as unknown as SpEnv;
  r.run = (scene, seconds, speed = 1) => {
    const n = Math.round(seconds * 60);
    for (let i = 0; i < n; i++) {
      r.battle.time += speed / 60;
      r.stage.now += 1 / 60;
      scene.update?.(1 / 60, speed / 60);
    }
  };
  return r;
}

beforeEach(() => {
  const ctx = new Proxy({}, { get: () => () => undefined, set: () => true });
  vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, style: {}, getContext: () => ctx }) });
  setFxSettings({ tier: 'mid', reducedMotion: false });
});
afterEach(() => vi.unstubAllGlobals());

// ── the hold on numbers ──

describe('numbers that wait for a picture', () => {
  const en = (uid: number): EnemyState => foe(uid, 100, 100);

  it('holds nothing until a hold is made: one length check and the number is shown', () => {
    const h = new NumberHolds();
    expect(h.defer(en(1), 10, 'damage', undefined, 0)).toBe(false);
    expect(h.waiting).toBe(0);
  });

  it('keeps the numbers of a held enemy only, adds up what is the same style and colour, and shows them once on release', () => {
    const h = new NumberHolds();
    const said: Array<[number, number, NumStyle, number | undefined]> = [];
    h.say = (e, v, s, c) => said.push([e.uid, v, s, c]);
    h.hold(1, 0);
    expect(h.defer(en(2), 5, 'damage', undefined, 0.1)).toBe(false);
    expect(h.defer(en(1), 150, 'damage', undefined, 0.1)).toBe(true);
    expect(h.defer(en(1), 30, 'damage', undefined, 0.2)).toBe(true);
    expect(h.defer(en(1), 4, 'dot', 0xff0000, 0.2)).toBe(true);
    expect(h.defer(en(1), 9, 'kill', undefined, 0.2)).toBe(true);
    expect(h.waiting).toBe(3);
    expect(said).toEqual([]);
    h.release(1);
    expect(said.map((s) => [s[1], s[2]])).toEqual(expect.arrayContaining([[180, 'damage'], [4, 'dot'], [9, 'kill']]));
    expect(said).toHaveLength(3);
    expect(h.size).toBe(0);
    expect(h.waiting).toBe(0);
    // After the release the enemy's numbers are shown at once again.
    expect(h.defer(en(1), 1, 'damage', undefined, 0.3)).toBe(false);
  });

  it('two holds of one enemy (two queens) show their numbers only when the last one ends', () => {
    const h = new NumberHolds();
    const said: number[] = [];
    h.say = (_e, v) => said.push(v);
    h.hold(7, 0);
    h.hold(7, 0);
    h.defer(en(7), 40, 'damage', undefined, 0.1);
    h.release(7);
    expect(said).toEqual([]);
    h.release(7);
    expect(said).toEqual([40]);
  });

  it('lets a hold nobody released go after NUMBER_HOLD_MAX battle seconds, and shows what it held', () => {
    const h = new NumberHolds();
    const said: number[] = [];
    h.say = (_e, v) => said.push(v);
    h.hold(3, 10);
    expect(h.defer(en(3), 25, 'damage', undefined, 10 + NUMBER_HOLD_MAX - 0.01)).toBe(true);
    h.sweep(10 + NUMBER_HOLD_MAX + 0.01);
    expect(said).toEqual([25]);
    expect(h.size).toBe(0);
    // A number offered after the hold ran out is shown, not held; a clock that is not a number never ends a hold.
    h.hold(3, 20);
    expect(h.defer(en(3), 1, 'damage', undefined, 20 + NUMBER_HOLD_MAX + 1)).toBe(false);
    h.hold(4, 30);
    expect(h.defer(en(4), 2, 'damage', undefined, Number.NaN)).toBe(true);
  });

  it('flush shows everything and ends every hold', () => {
    const h = new NumberHolds();
    const said: number[] = [];
    h.say = (_e, v) => said.push(v);
    h.hold(1, 0);
    h.hold(2, 0);
    h.defer(en(1), 5, 'damage', undefined, 0.1);
    h.defer(en(2), 6, 'damage', undefined, 0.1);
    h.flush();
    expect(said.sort()).toEqual([5, 6]);
    expect(h.size).toBe(0);
    expect(h.waiting).toBe(0);
  });

  it('is one registry per battle', () => {
    const a = {};
    const b = {};
    expect(numberHoldsOf(a)).toBe(numberHoldsOf(a));
    expect(numberHoldsOf(a)).not.toBe(numberHoldsOf(b));
  });

  it('the combat director shows no number for a held enemy until the hold is released, and then one number with the sum', () => {
    const handlers = new Map<string, Array<(e: Record<string, unknown>) => void>>();
    const on = ((type: string, fn: (e: Record<string, unknown>) => void) => {
      handlers.set(type, [...(handlers.get(type) ?? []), fn]);
    }) as unknown as Parameters<typeof mountCombat>[1];
    const shown: Array<[number | string, NumStyle]> = [];
    const e1 = foe(1, 300, 45);
    const battle = { enemies: [e1], time: 0 };
    const stage = {
      now: 0,
      detail: 1,
      ctx: { battle },
      fx: {
        ps: { burst: () => undefined },
        numbers: { sense: null },
        critBurst: () => undefined,
        shockwave: () => undefined,
        number: (_x: number, _y: number, value: number | string, style: NumStyle) => shown.push([value, style]),
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
    const hit = (amount: number): void => handlers.get('hit')?.forEach((fn) => fn({ enemy: e1, amount, absorbed: 0, crit: false, killed: false }));
    const holds = numberHoldsOf(battle);
    hit(20);
    expect(shown).toEqual([[20, 'damage']]);
    holds.hold(1, 0);
    hit(150);
    hit(30);
    expect(shown).toHaveLength(1);
    holds.release(1);
    expect(shown).toEqual([[20, 'damage'], [180, 'damage']]);
    hit(7);
    expect(shown[2]).toEqual([7, 'damage']);
  });
});

// ── the frost queen's knock ──

describe('Knock It Off! (the frost queen)', () => {
  const shard = (uid: number, x: number, y: number, frozen: boolean): SpKnockShard => ({ uid, x, y, frozen });

  /** A cast with the queen at (144, 234) and the glass landing at (480, 45), the enemies in a row. */
  function cast(r: Rig, scene: SpScene<'knock'>, shards: SpKnockShard[], impact = { x: 480, y: 45 }): void {
    scene.cast({ unit: unit(), first: false, x: 144, y: 234, skill: 'knock', data: { impactX: impact.x, impactY: impact.y, radius: 260, shards } } as never);
    void r;
  }
  /** Five enemies on the top road, three frozen then two slowed, and the cast's shard list for them. */
  function crowd(r: Rig, n = 5, frozen = 3): SpKnockShard[] {
    const list: SpKnockShard[] = [];
    for (let i = 0; i < n; i++) {
      const e = foe(i + 1, 420 + i * 36, 45);
      r.battle.enemies.push(e);
      list.push(shard(e.uid, e.x, e.y, i < frozen));
    }
    return list;
  }
  const live = (s: SpScene<'knock'>): ReturnType<ReturnType<typeof makeKnock> extends infer K ? (K extends { live: infer L } ? (L extends () => infer R ? () => R : never) : never) : never> =>
    (s as unknown as { live(): never }).live() as never;
  const said = (r: Rig): Array<[number, number]> => {
    const out: Array<[number, number]> = [];
    numberHoldsOf(r.battle).say = (e, v) => out.push([e.uid, v]);
    return out;
  };

  it('puts ice on every shard\'s enemy at the cast (a block if it was frozen, a frost coat if it was slowed) and holds its number', () => {
    const r = rig();
    const s = makeKnock(r.env);
    const out = said(r);
    cast(r, s, crowd(r));
    const l = live(s) as { ices: number; held: number; list: Array<{ uid: number; frozen: boolean; x: number; y: number }> };
    expect(l.ices).toBe(5);
    expect(l.held).toBe(5);
    expect(l.list.map((i) => i.frozen)).toEqual([true, true, true, false, false]);
    // Where the enemy is drawn.
    const size = enemyInfo('cucumber').size;
    for (const i of l.list) {
      const e = r.battle.enemies.find((x) => x.uid === i.uid) as EnemyState;
      expect(i.x).toBeCloseTo(bodyX(e.x, size), 6);
      expect(i.y).toBeCloseTo(e.y, 6);
    }
    // The combat director's numbers for them wait; another enemy's do not.
    const holds = numberHoldsOf(r.battle);
    expect(holds.defer(r.battle.enemies[0] as EnemyState, 150, 'damage', undefined, 0)).toBe(true);
    expect(holds.defer(foe(99, 0, 0), 5, 'damage', undefined, 0)).toBe(false);
    expect(out).toEqual([]);
  });

  it('keeps the ice and the number until the shard lands, nearest first, then breaks the ice and shows the number once', () => {
    const r = rig();
    const s = makeKnock(r.env);
    const out = said(r);
    // The glass lands at the middle of the row: the nearest enemies land first.
    cast(r, s, crowd(r), { x: 492, y: 45 });
    const holds = numberHoldsOf(r.battle);
    for (const e of r.battle.enemies) holds.defer(e, 100 + e.uid, 'damage', undefined, 0);
    r.run(s as never, 0.25);
    // The glass is still in the air: every enemy still wears its ice and holds its number.
    expect((live(s) as { ices: number }).ices).toBe(5);
    expect(out).toEqual([]);
    expect(r.stage.fx.iceShatter).not.toHaveBeenCalled();
    r.run(s as never, 1.5);
    expect(r.stage.fx.iceShatter).toHaveBeenCalledTimes(1);
    const l = live(s) as { ices: number; held: number; shards: number; throws: number; waiting: number };
    expect(l).toMatchObject({ ices: 0, held: 0, shards: 0, throws: 0, waiting: 0 });
    // One number each, with the whole of its hit, the nearest to the impact (uid 3 at 492) first.
    expect(out).toHaveLength(5);
    expect(out.map((o) => o[0])[0]).toBe(3);
    expect([...out].sort((a, b) => a[0] - b[0]).map((o) => o[1])).toEqual([101, 102, 103, 104, 105]);
  });

  it('draws nothing at the cast but the stare, the glass on the queen\'s tile and the ice: no shard, no burst, no crack before the glass breaks', () => {
    const r = rig();
    const s = makeKnock(r.env);
    cast(r, s, crowd(r));
    expect(r.stage.fx.iceShatter).not.toHaveBeenCalled();
    expect(r.stage.fx.ps.burst).not.toHaveBeenCalled();
    expect((live(s) as { throws: number; shards: number; cracks: number }).throws).toBe(1);
    expect((live(s) as { shards: number }).shards).toBe(0);
    expect((live(s) as { cracks: number }).cracks).toBe(0);
    // The glass starts on the queen's tile, on the side of the impact (the impact is to the right).
    const glass = (s as unknown as { throws: { list: Array<{ glass: { x: number; visible: boolean } }> } }).throws.list[0] as { glass: { x: number; visible: boolean } };
    expect(glass.glass.visible).toBe(true);
    expect(glass.glass.x).toBeGreaterThan(144);
    expect(glass.glass.x).toBeLessThan(144 + 60);
  });

  it('breaks the glass once at the impact: a burst, a crack on the floor, the reach ring, a nudge and the glassy sound', () => {
    const r = rig();
    const s = makeKnock(r.env);
    cast(r, s, crowd(r));
    r.run(s as never, 0.9);
    expect(r.stage.fx.iceShatter).toHaveBeenCalledTimes(1);
    expect(r.stage.fx.iceShatter.mock.calls[0]?.slice(0, 2)).toEqual([480, 45]);
    expect(r.stage.shake).toHaveBeenCalledTimes(1);
    const sounds = r.stage.play.mock.calls.map((c) => c[1]);
    expect(sounds).toContain('shield_break');
    // The dotted ring runs out to the shards' reach: 260 px.
    const ring = r.stage.fx.ps.burst.mock.calls.find((c) => (c[0] as { tex: string }).tex === 'auraReach');
    expect(ring).toBeDefined();
    const mods = ring?.[3] as { scale: number };
    expect(200 * mods.scale * (240 / 256) / 2).toBeCloseTo(260, 6);
    expect((live(s) as { cracks: number }).cracks).toBe(1);
  });

  it('sends a shard to each enemy and lands it on the enemy where it is NOW: the ice rides a walking enemy', () => {
    const r = rig();
    const s = makeKnock(r.env);
    const list = crowd(r, 3, 3);
    cast(r, s, list);
    const e = r.battle.enemies[1] as EnemyState;
    r.run(s as never, 0.1);
    e.x += 40;
    r.run(s as never, 0.02);
    const l = live(s) as { list: Array<{ uid: number; x: number }> };
    const i = l.list.find((x) => x.uid === e.uid) as { x: number };
    expect(i.x).toBeCloseTo(bodyX(e.x, enemyInfo('cucumber').size), 6);
    // The shard's end follows it too: when it lands, the burst is where the enemy stands, not where it stood.
    r.stage.fx.fleck.mockClear();
    r.run(s as never, 1.5);
    const at = r.stage.fx.fleck.mock.calls.map((c) => c[1] as number);
    expect(at.some((x) => Math.abs(x - bodyX(e.x, enemyInfo('cucumber').size)) < 1)).toBe(true);
  });

  it('a frozen enemy shatters (crystals, shards, a ring) and a slowed one only cracks (chips, no crystals)', () => {
    const texOf = (rg: Rig): string[] => rg.stage.fx.ps.burst.mock.calls.map((c) => (c[0] as { tex: string }).tex);
    const frozen = rig();
    const sf = makeKnock(frozen.env);
    frozen.battle.enemies.push(foe(1, 400, 45));
    cast(frozen, sf, [shard(1, 400, 45, true)]);
    frozen.run(sf as never, 1.2);
    expect(texOf(frozen)).toEqual(expect.arrayContaining(['crystal', 'shard', 'ring']));
    // The glass's own break plays the glassy sound and the frozen enemy's shattering plays it again; a slowed one plays the queen's own impact.
    expect(frozen.stage.play.mock.calls.filter((c) => c[1] === 'shield_break')).toHaveLength(2);
    expect(frozen.stage.play.mock.calls.map((c) => c[1])).not.toContain('imp_m_frost');

    const slowed = rig();
    const ss = makeKnock(slowed.env);
    slowed.battle.enemies.push(foe(2, 460, 45));
    cast(slowed, ss, [shard(2, 460, 45, false)]);
    slowed.run(ss as never, 1.2);
    expect(texOf(slowed)).not.toContain('crystal');
    expect(texOf(slowed)).toContain('shard');
    expect(slowed.stage.play.mock.calls.map((c) => c[1])).toContain('imp_m_frost');
    expect(slowed.stage.play.mock.calls.filter((c) => c[1] === 'shield_break')).toHaveLength(1);
  });

  it('wears the picture of the chill the enemy had: the block and the freeze sticker for a frozen one, the frost coat and the slow sticker for a slowed one', () => {
    const r = rig();
    const s = makeKnock(r.env);
    cast(r, s, crowd(r, 2, 1));
    const ices = (s as unknown as { ices: { list: Array<{ frozen: boolean; crust: { texture: unknown }; sticker: { texture: unknown } }> } }).ices.list;
    const frozen = ices.find((i) => i.frozen) as (typeof ices)[number];
    const slowed = ices.find((i) => !i.frozen) as (typeof ices)[number];
    expect(frozen.crust.texture).toBe(knockArt().block);
    expect(slowed.crust.texture).toBe(knockArt().frost);
    expect(frozen.sticker.texture).toBe(Texture.WHITE);
    expect(slowed.sticker.texture).toBe(Texture.EMPTY);
  });

  it('an enemy the cast killed (the simulation did it in that tick) stays in its ice as a frozen statue until its shard lands, and its number comes with the shard', () => {
    const r = rig();
    const s = makeKnock(r.env);
    const out = said(r);
    cast(r, s, crowd(r, 3, 3));
    const dead = r.battle.enemies[0] as EnemyState;
    const holds = numberHoldsOf(r.battle);
    holds.defer(dead, 250, 'kill', undefined, 0);
    r.run(s as never, 1 / 60);
    expect((live(s) as { list: Array<{ statue: boolean }> }).list.some((i) => i.statue)).toBe(false);
    dead.hp = 0;
    r.run(s as never, 1 / 60);
    const l = live(s) as { list: Array<{ uid: number; statue: boolean }> };
    expect(l.list.filter((i) => i.statue).map((i) => i.uid)).toEqual([dead.uid]);
    expect(out).toEqual([]);
    r.run(s as never, 1.5);
    expect(out).toEqual([[dead.uid, 250]]);
    expect((live(s) as { ices: number }).ices).toBe(0);
    // A recycled piece starts without it.
    const fresh = foe(50, 500, 45);
    r.battle.enemies.push(fresh);
    cast(r, s, [shard(50, 500, 45, true)]);
    expect((live(s) as { list: Array<{ statue: boolean }> }).list.every((i) => !i.statue)).toBe(true);
  });

  it('a shard is no quicker than its real floor at 3x: the first ice breaks no sooner than a tenth of a real second after the glass', () => {
    const r = rig();
    const s = makeKnock(r.env);
    cast(r, s, crowd(r, 3, 3));
    let broke = -1;
    let landed = -1;
    for (let f = 0; f < 600 && landed < 0; f++) {
      r.run(s as never, 1 / 60, 3);
      if (broke < 0 && r.stage.fx.iceShatter.mock.calls.length > 0) broke = f;
      if (broke >= 0 && landed < 0 && (live(s) as { ices: number }).ices < 3) landed = f;
    }
    expect(broke).toBeGreaterThan(0);
    expect(landed - broke).toBeGreaterThanOrEqual(5);
  });

  it('stands still while a popup holds the battle, and goes on after it', () => {
    const r = rig();
    const s = makeKnock(r.env);
    const out = said(r);
    cast(r, s, crowd(r));
    r.run(s as never, 0.2);
    const before = JSON.stringify(live(s));
    r.run(s as never, 3, 0);
    expect(JSON.stringify(live(s))).toBe(before);
    expect(r.stage.fx.iceShatter).not.toHaveBeenCalled();
    expect(out).toEqual([]);
    r.run(s as never, 2);
    expect((live(s) as { ices: number }).ices).toBe(0);
  });

  it('flies its shards by the battle clock: the shards in the air and the ice they will break stand still under a popup', () => {
    const r = rig();
    const s = makeKnock(r.env);
    cast(r, s, crowd(r));
    const flying = (): Array<[boolean, number, number, number]> =>
      (s as unknown as { shards: { list: Array<{ on: boolean; x: number; y: number; sprite: { alpha: number; visible: boolean } }> } }).shards.list
        .filter((x) => x.on)
        .map((x) => [x.sprite.visible, x.x, x.y, x.sprite.alpha]);
    // Run until some shard is in the air.
    let seen = false;
    for (let f = 0; f < 240 && !seen; f++) {
      r.run(s as never, 1 / 60);
      seen = flying().some((x) => x[0]);
    }
    expect(seen).toBe(true);
    const before = flying();
    const ices = (live(s) as { ices: number }).ices;
    r.run(s as never, 3, 0);
    expect(flying()).toEqual(before);
    expect((live(s) as { ices: number }).ices).toBe(ices);
    // After the popup they go on and land.
    r.run(s as never, 2);
    expect((live(s) as { ices: number }).ices).toBe(0);
  });

  it('is no shorter than its real floor at 3x: the glass is still in the air a third of a second after the cast, and it is all over within two seconds', () => {
    const r = rig();
    const s = makeKnock(r.env);
    cast(r, s, crowd(r));
    r.run(s as never, 0.3, 3);
    expect(r.stage.fx.iceShatter).not.toHaveBeenCalled();
    expect((live(s) as { ices: number }).ices).toBe(5);
    r.run(s as never, 2, 3);
    expect(r.stage.fx.iceShatter).toHaveBeenCalledTimes(1);
    expect((live(s) as { ices: number; throws: number }).ices).toBe(0);
  });

  it('is over in about a second at 1x (the glass plus the shards), never more than a second and a half', () => {
    const r = rig();
    const s = makeKnock(r.env);
    cast(r, s, crowd(r, 8, 4));
    r.run(s as never, 1.5);
    expect((live(s) as { ices: number; shards: number; throws: number }).ices).toBe(0);
  });

  it('keeps the ice of as many enemies as the quality tier allows (8, 14, 22) and holds only the numbers of those', () => {
    for (const [detail, max] of [[0, 8], [1, 14], [2, 22]] as const) {
      const r = rig(detail);
      const s = makeKnock(r.env);
      const list: SpKnockShard[] = [];
      for (let i = 0; i < 30; i++) {
        const e = foe(i + 1, 100 + i * 20, 45);
        r.battle.enemies.push(e);
        list.push(shard(e.uid, e.x, e.y, i % 3 === 0));
      }
      cast(r, s, list);
      const l = live(s) as { ices: number; held: number };
      expect(l.ices, `tier ${detail}`).toBe(max);
      expect(l.held).toBe(max);
      // The frozen ones (every third enemy, 10 of the 30) keep their ice first.
      const kept = (live(s) as { list: Array<{ frozen: boolean }> }).list;
      expect(kept.filter((i) => i.frozen).length, `tier ${detail}`).toBe(Math.min(10, max));
      r.run(s as never, 2);
      expect((live(s) as { ices: number; held: number }).ices).toBe(0);
      expect(numberHoldsOf(r.battle).size).toBe(0);
    }
  });

  it('when all three glasses are in the air the oldest breaks at once (its shards go, its ice and numbers are not dropped), and no ice is ever taken over', () => {
    const r = rig();
    const s = makeKnock(r.env);
    const out = said(r);
    for (let i = 0; i < 4; i++) {
      const e = foe(i + 1, 420 + i * 36, 45);
      r.battle.enemies.push(e);
      cast(r, s, [shard(e.uid, e.x, e.y, true)]);
      numberHoldsOf(r.battle).defer(e, 10 + i, 'damage', undefined, 0);
    }
    expect(r.stage.fx.iceShatter).toHaveBeenCalledTimes(1);
    expect((live(s) as { throws: number; ices: number }).throws).toBe(3);
    expect((live(s) as { ices: number }).ices).toBe(4);
    r.run(s as never, 2);
    expect((live(s) as { ices: number; held: number }).ices).toBe(0);
    expect(out.map((o) => o[1]).sort()).toEqual([10, 11, 12, 13]);

    // At the tier's limit a second cast finds no free ice: its enemies have none and hold nothing (so their numbers show at once).
    const low = rig(0);
    const sl = makeKnock(low.env);
    const mk = (from: number): SpKnockShard[] => {
      const list: SpKnockShard[] = [];
      for (let i = 0; i < 8; i++) {
        const e = foe(from + i, 100 + i * 30, 45);
        low.battle.enemies.push(e);
        list.push(shard(e.uid, e.x, e.y, false));
      }
      return list;
    };
    cast(low, sl, mk(1));
    cast(low, sl, mk(100));
    expect((live(sl) as { ices: number; held: number }).ices).toBe(8);
    expect((live(sl) as { held: number }).held).toBe(8);
    expect(numberHoldsOf(low.battle).defer(low.battle.enemies.find((e) => e.uid === 100) as EnemyState, 1, 'damage', undefined, 0)).toBe(false);
  });

  it('draws what it can find: a shard whose enemy is gone makes no ice and holds nothing, and nothing throws', () => {
    const r = rig();
    const s = makeKnock(r.env);
    expect(() => cast(r, s, [shard(77, 400, 45, true)])).not.toThrow();
    expect((live(s) as { ices: number; held: number }).ices).toBe(0);
    expect((live(s) as { held: number }).held).toBe(0);
    expect(() => r.run(s as never, 1.5)).not.toThrow();
  });

  it('on the low tier skips the reach ring and thins the sparks; under reduced motion the glass is simply there, nothing shakes, and the shards do not fly', () => {
    const low = rig(0);
    const sl = makeKnock(low.env);
    cast(low, sl, crowd(low));
    low.run(sl as never, 1.5);
    expect(low.stage.fx.ps.burst.mock.calls.some((c) => (c[0] as { tex: string }).tex === 'auraReach')).toBe(false);
    const calm = rig(1, true);
    const sc = makeKnock(calm.env);
    cast(calm, sc, crowd(calm));
    const glass = (sc as unknown as { throws: { list: Array<{ glass: { x: number; y: number; visible: boolean; rotation: number } }> } }).throws.list[0] as {
      glass: { x: number; y: number; visible: boolean; rotation: number };
    };
    const seen: Array<[number, number]> = [];
    for (let i = 0; i < 80; i++) {
      calm.run(sc as never, 1 / 60);
      if (glass.glass.visible) seen.push([glass.glass.x, glass.glass.y]);
    }
    // Wherever it is visible it is at the impact, never in the air.
    expect(seen.length).toBeGreaterThan(0);
    for (const [x, y] of seen) {
      expect(x).toBe(480);
      expect(y).toBeCloseTo(39, 6);
    }
    expect(glass.glass.rotation).toBe(0);
    expect(calm.stage.shake).not.toHaveBeenCalled();
    calm.run(sc as never, 1);
    expect((live(sc) as { ices: number; held: number }).ices).toBe(0);
    expect((live(sc) as { held: number }).held).toBe(0);
  });

  it('a victory or a defeat (clear) takes everything off and shows the numbers it was holding', () => {
    const r = rig();
    const s = makeKnock(r.env);
    const out = said(r);
    cast(r, s, crowd(r));
    const holds = numberHoldsOf(r.battle);
    for (const e of r.battle.enemies) holds.defer(e, 10, 'damage', undefined, 0);
    r.run(s as never, 0.2);
    s.clear();
    expect(live(s)).toMatchObject({ throws: 0, shards: 0, ices: 0, cracks: 0, held: 0, waiting: 0 });
    expect(out).toHaveLength(5);
    // Nothing of it is left showing on the field.
    expect(r.front.children.filter((c) => c.visible)).toHaveLength(0);
    // It can be used again (a revive).
    cast(r, s, crowd(r, 2, 1));
    expect((live(s) as { throws: number }).throws).toBe(1);
  });

  it('moves no enemy and no cat, reuses its pieces over forty casts and frees everything on destroy', () => {
    const r = rig(2);
    const s = makeKnock(r.env);
    const list = crowd(r, 12, 4);
    const before = JSON.stringify(r.battle.enemies);
    for (let i = 0; i < 40; i++) {
      cast(r, s, list);
      r.run(s as never, 0.3);
    }
    r.run(s as never, 2);
    expect(JSON.stringify(r.battle.enemies)).toBe(before);
    const pools = s as unknown as { throws: { list: unknown[] }; shards: { list: unknown[] }; ices: { list: unknown[] }; cracks: { list: unknown[] } };
    expect(pools.throws.list.length).toBeLessThanOrEqual(3);
    expect(pools.shards.list.length).toBeLessThanOrEqual(22);
    expect(pools.ices.list.length).toBeLessThanOrEqual(22);
    expect(pools.cracks.list.length).toBeLessThanOrEqual(3);
    // Everything it adds to the field is bounded by its pools: 3 throws of 4 pictures, 22 shards, 22 ices; 3 cracks on the floor.
    for (let i = 0; i < 20; i++) {
      cast(r, s, list);
      r.run(s as never, 0.2);
    }
    expect(r.front.children.length).toBeLessThanOrEqual(3 * 4 + 22 + 22);
    expect(r.back.children.length).toBeLessThanOrEqual(3);
    s.destroy();
    expect(numberHoldsOf(r.battle).size).toBe(0);
  });

  it('paints its pictures once, in code', () => {
    expect(knockArt()).toBe(knockArt());
    expect(Object.keys(knockArt()).sort()).toEqual(['block', 'crack', 'frost', 'glass', 'paw', 'stare']);
  });
});

// ── the storm cat's cloud ──

describe('Tagalong Cloud (the storm cat)', () => {
  const data = (id = 1, host = 1, o: Partial<{ at: number; life: number }> = {}): never =>
    ({ cloudId: id, hostUid: host, hostX: 400, hostY: 45, at: 0, life: 3.2, every: 0.4, bolts: 8, splashRadius: 60, hopRadius: 150, ...o }) as never;
  const cast = (s: SpScene<'cloud'>, id = 1, host = 1, o = {}): void =>
    s.cast({ unit: unit(), first: false, x: 252, y: 234, skill: 'cloud', data: data(id, host, o) } as never);
  const bolt = (r: Rig, id = 1, host = 1, index = 1, points: Array<{ x: number; y: number; uid: number }> = []): void =>
    r.battle.events.emit('cloudBolt', {
      cloudId: id, unit: unit(), hostUid: host, x: (r.battle.enemies.find((e) => e.uid === host) as EnemyState).x, y: 45, index, bolts: 8, points,
    } as never);
  type Live = { clouds: number; bolts: number; list: Array<{ id: number; mode: string; mood: string; hostUid: number; x: number; y: number }> };
  const live = (s: SpScene<'cloud'>): Live => (s as unknown as { live(): Live }).live();
  const sprites = (s: SpScene<'cloud'>): Array<{ root: Container; mood: string; scaleX: number; scaleY: number }> =>
    (s as unknown as { clouds: Array<{ root: Container; mood: string; scaleX: number; scaleY: number }> }).clouds;

  const info = enemyInfo('cucumber');
  /** Where a cloud sits on a cucumber: just above its health bar. */
  const ride = (e: EnemyState): { x: number; y: number } => ({ x: bodyX(e.x, info.size), y: e.y - info.top + 6 - (cloudArt() ? 52 * 0.95 : 0) / 2 });

  function field(n = 3): Rig {
    const r = rig(1, true);
    for (let i = 0; i < n; i++) r.battle.enemies.push(foe(i + 1, 400 + i * 40, 90));
    return r;
  }

  it('pops out of the hat above the cat\'s tile, flies to its host and sits on it', () => {
    const r = field();
    const s = makeCloud(r.env);
    cast(s);
    expect(live(s).list[0]).toMatchObject({ id: 1, mode: 'pop', mood: 'grumpy', hostUid: 1 });
    expect(live(s).list[0]?.x).toBeCloseTo(252, 6);
    expect(live(s).list[0]?.y).toBeCloseTo(234 - 50, 6);
    r.run(s as never, 0.15);
    expect(live(s).list[0]?.mode).toBe('fly');
    r.run(s as never, 0.5);
    expect(live(s).list[0]?.mode).toBe('ride');
    const spot = ride(r.battle.enemies[0] as EnemyState);
    expect(live(s).list[0]?.x).toBeCloseTo(spot.x, 1);
    expect(live(s).list[0]?.y).toBeCloseTo(spot.y, 1);
  });

  it('is drawn from the host\'s own place, never from where the cat stood, and follows it with a little lag', () => {
    const r = field();
    const s = makeCloud(r.env);
    cast(s);
    r.run(s as never, 0.6);
    const host = r.battle.enemies[0] as EnemyState;
    // The host walks at 70 px/s for a third of a second.
    const xs: number[] = [];
    for (let i = 0; i < 20; i++) {
      host.x += 70 / 60;
      r.run(s as never, 1 / 60);
      xs.push(live(s).list[0]?.x ?? 0);
    }
    const lag = bodyX(host.x, info.size) - (xs[xs.length - 1] as number);
    expect(lag).toBeGreaterThan(0.5);
    expect(lag).toBeLessThan(14);
    // It catches up when the host stops.
    r.run(s as never, 0.5);
    expect(live(s).list[0]?.x).toBeCloseTo(bodyX(host.x, info.size), 1);
  });

  it('drops a bolt on each cloudBolt: the painted zig-zag from the cloud to the host, a star where it lands, a zap face and a squash', () => {
    const r = field();
    const s = makeCloud(r.env);
    cast(s);
    r.run(s as never, 0.6);
    const before = sprites(s)[0] as { scaleX: number; scaleY: number };
    bolt(r, 1, 1, 1, [{ x: 440, y: 90, uid: 2 }, { x: 480, y: 90, uid: 3 }]);
    expect(live(s).bolts).toBe(1);
    expect(live(s).list[0]?.mood).toBe('zap');
    const star = r.stage.fx.fleck.mock.calls[0];
    expect(star?.[1]).toBeCloseTo(400, 6);
    expect(star?.[2]).toBeCloseTo(45 - 4, 6);
    // One spark on each OTHER enemy of the splash, and none on the host itself.
    const splash = r.stage.fx.ps.burst.mock.calls.filter((c) => (c[0] as { prio: number; count: number }).count === 3);
    expect(splash.map((c) => c[1])).toEqual([440, 480]);
    // The bolt starts at the cloud's belly and ends on the host.
    const b = (s as unknown as { bolts: { list: Array<{ sprite: { x: number; y: number; rotation: number; visible: boolean } }> } }).bolts.list[0] as {
      sprite: { x: number; y: number; rotation: number; visible: boolean };
    };
    expect(b.sprite.visible).toBe(true);
    expect(b.sprite.x).toBeCloseTo(live(s).list[0]?.x ?? 0, 6);
    expect(Math.atan2(41 - b.sprite.y, 400 - b.sprite.x)).toBeCloseTo(b.sprite.rotation, 6);
    r.run(s as never, 0.6);
    expect(live(s).bolts).toBe(0);
    expect(live(s).list[0]?.mood).toBe('grumpy');
    void before;
  });

  it('makes each crackle a little higher than the last, and rations the ring', () => {
    const r = field();
    r.stage.reduced = false;
    const s = makeCloud(r.env);
    cast(s);
    r.run(s as never, 0.6);
    for (let i = 1; i <= 6; i++) {
      bolt(r, 1, 1, i);
      r.run(s as never, 0.4);
    }
    const pitches = r.stage.play.mock.calls.filter((c) => c[1] === 'zap').map((c) => c[3] as number);
    expect(pitches).toHaveLength(6);
    for (let i = 1; i < pitches.length; i++) expect(pitches[i]).toBeGreaterThan(pitches[i - 1] as number);
    // Two bolts in one frame make one ring.
    r.stage.fx.ps.burst.mockClear();
    bolt(r, 1, 1, 7);
    bolt(r, 1, 1, 8);
    const rings = r.stage.fx.ps.burst.mock.calls.filter((c) => (c[0] as { tex: string }).tex === 'ring');
    expect(rings.length).toBeLessThanOrEqual(1);
  });

  it('thins the splash\'s sparks by tier: 2, 3 and 4 at most', () => {
    for (const [detail, max] of [[0, 2], [1, 3], [2, 4]] as const) {
      const r = rig(detail, true);
      r.battle.enemies.push(foe(1, 400, 90));
      const s = makeCloud(r.env);
      cast(s);
      r.run(s as never, 0.6);
      r.stage.fx.ps.burst.mockClear();
      const points = Array.from({ length: 9 }, (_, i) => ({ x: 300 + i * 10, y: 90, uid: 20 + i }));
      bolt(r, 1, 1, 1, points);
      const sparks = r.stage.fx.ps.burst.mock.calls.filter((c) => (c[0] as { prio: number }).prio === 0 && (c[1] as number) >= 300);
      expect(sparks.length, `tier ${detail}`).toBe(max);
    }
  });

  it('hops over an arc to the next host, startled, and lands grumpy and on it', () => {
    const r = field();
    r.stage.reduced = false;
    const s = makeCloud(r.env);
    cast(s);
    r.run(s as never, 0.6);
    const from = { x: live(s).list[0]?.x ?? 0, y: live(s).list[0]?.y ?? 0 };
    r.battle.events.emit('cloudHop', { cloudId: 1, fromUid: 1, fromX: 400, fromY: 90, toUid: 2, toX: 440, toY: 90 } as never);
    expect(live(s).list[0]).toMatchObject({ mode: 'hop', mood: 'startled', hostUid: 2 });
    r.run(s as never, 0.11);
    // Half way through it is higher than the straight line between the two spots.
    const to = ride(r.battle.enemies[1] as EnemyState);
    const mid = live(s).list[0] as { x: number; y: number };
    expect(mid.y).toBeLessThan((from.y + to.y) / 2 - 10);
    r.run(s as never, 0.5);
    expect(live(s).list[0]).toMatchObject({ mode: 'ride', mood: 'grumpy' });
    expect(Math.abs((live(s).list[0]?.x ?? 0) - to.x)).toBeLessThan(6);
  });

  it('a bolt that fells its host and the hop come in one tick: the jump is the startled one, not the zap', () => {
    const r = field();
    r.stage.reduced = false;
    const s = makeCloud(r.env);
    cast(s);
    r.run(s as never, 0.6);
    bolt(r, 1, 1, 1);
    r.battle.events.emit('cloudHop', { cloudId: 1, fromUid: 1, fromX: 400, fromY: 90, toUid: 2, toX: 440, toY: 90 } as never);
    r.run(s as never, 0.05);
    expect(live(s).list[0]).toMatchObject({ mode: 'hop', mood: 'startled' });
  });

  it('hops to where the new host stood when the host cannot be found any more, above that spot', () => {
    const r = field();
    const s = makeCloud(r.env);
    cast(s);
    r.run(s as never, 0.6);
    r.battle.events.emit('cloudHop', { cloudId: 1, fromUid: 1, fromX: 400, fromY: 90, toUid: 77, toX: 300, toY: 250 } as never);
    r.run(s as never, 0.8);
    expect(live(s).list[0]?.x).toBeCloseTo(300, 1);
    expect(live(s).list[0]?.y).toBeCloseTo(250 - 60, 1);
  });

  it('puts no splash spark on the host itself even when the list names it', () => {
    const r = field();
    const s = makeCloud(r.env);
    cast(s);
    r.run(s as never, 0.6);
    r.stage.fx.ps.burst.mockClear();
    bolt(r, 1, 1, 1, [{ x: 400, y: 90, uid: 1 }, { x: 440, y: 90, uid: 2 }]);
    const sparks = r.stage.fx.ps.burst.mock.calls.filter((c) => (c[0] as { prio: number }).prio === 0);
    expect(sparks.map((c) => c[1])).toEqual([440]);
  });

  it('fizzles at its end (a sigh when its time is up, a sad face when it lost its host) and is gone within the second', () => {
    for (const [reason, mood] of [['time', 'sigh'], ['lost', 'sad']] as const) {
      const r = field();
      const s = makeCloud(r.env);
      cast(s);
      r.run(s as never, 0.6);
      r.stage.fx.ps.burst.mockClear();
      r.battle.events.emit('cloudEnd', { cloudId: 1, reason, hostUid: 1, x: 400, y: 90, bolts: 8 } as never);
      expect(live(s).list[0]).toMatchObject({ mode: 'fizzle', mood });
      // A puff, and rain.
      expect(r.stage.fx.ps.burst).toHaveBeenCalled();
      r.run(s as never, 1);
      expect(live(s).clouds).toBe(0);
    }
  });

  it('shows nothing for a cloud whose cast lost the stage rule: its events find nobody to draw them', () => {
    const r = field();
    const s = makeCloud(r.env);
    bolt(r, 5, 1, 1);
    r.battle.events.emit('cloudHop', { cloudId: 5, fromUid: 1, fromX: 0, fromY: 0, toUid: 2, toX: 0, toY: 0 } as never);
    r.battle.events.emit('cloudEnd', { cloudId: 5, reason: 'time', hostUid: 1, x: 0, y: 0, bolts: 8 } as never);
    expect(live(s)).toMatchObject({ clouds: 0, bolts: 0 });
    expect(r.stage.play).not.toHaveBeenCalled();
    expect(r.stage.fx.fleck).not.toHaveBeenCalled();
  });

  it('stands two clouds that ride one host side by side and one above the other, three on three places: it is as many clouds as there are bolts', () => {
    const r = field();
    r.stage.reduced = true;
    const s = makeCloud(r.env);
    cast(s, 1, 1, { life: 30 });
    r.run(s as never, 1.5);
    const alone = live(s).list[0] as { x: number; y: number };
    cast(s, 2, 1, { life: 30 });
    cast(s, 3, 1, { life: 30 });
    r.run(s as never, 2);
    const list = live(s).list.filter((c) => c.mode === 'ride');
    expect(list).toHaveLength(3);
    // The first cloud keeps its place, the others are at least one cloud-width of a step away from it and from each other.
    const one = list.find((c) => c.id === 1) as { x: number; y: number };
    expect(one.x).toBeCloseTo(alone.x, 0);
    expect(one.y).toBeCloseTo(alone.y, 0);
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i] as { x: number; y: number };
        const b = list[j] as { x: number; y: number };
        expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(14);
      }
    }
    // A cloud on another host is not pushed by them.
    cast(s, 4, 2, { life: 30 });
    r.run(s as never, 2);
    const other = live(s).list.find((c) => c.id === 4) as { x: number; y: number };
    const host2 = r.battle.enemies.find((e) => e.uid === 2) as EnemyState;
    expect(Math.abs(other.x - bodyX(host2.x, info.size))).toBeLessThan(2);
  });

  it('keeps two clouds apart by their id, even on one host', () => {
    const r = field();
    const s = makeCloud(r.env);
    cast(s, 1, 1);
    cast(s, 2, 1);
    r.run(s as never, 0.6);
    r.battle.events.emit('cloudEnd', { cloudId: 1, reason: 'time', hostUid: 1, x: 400, y: 90, bolts: 8 } as never);
    expect(live(s).list.map((c) => [c.id, c.mode])).toEqual([[1, 'fizzle'], [2, 'ride']]);
  });

  it('stands still under a popup and keeps its real floor at 3x', () => {
    const r = field();
    r.stage.reduced = false;
    const s = makeCloud(r.env);
    cast(s);
    r.run(s as never, 0.05);
    const before = JSON.stringify(live(s));
    r.run(s as never, 3, 0);
    expect(JSON.stringify(live(s))).toBe(before);
    // At 3x the pop and the flight (0.34 battle seconds) are not over before their real floors (0.08 + 0.1 s).
    const q = field();
    q.stage.reduced = false;
    const t = makeCloud(q.env);
    cast(t);
    q.run(t as never, 0.1, 3);
    expect(live(t).list[0]?.mode).not.toBe('ride');
    q.run(t as never, 0.4, 3);
    expect(live(t).list[0]?.mode).toBe('ride');
  });

  it('rides its host by the battle clock: the trot, the lean and the squash stand still under a popup (real time passing, the battle clock not)', () => {
    const r = field();
    r.stage.reduced = false;
    const s = makeCloud(r.env);
    cast(s);
    r.run(s as never, 1.5);
    expect(live(s).list[0]?.mode).toBe('ride');
    const pose = (): number[] => sprites(s).filter((c) => c.root.visible).flatMap((c) => [c.root.x, c.root.y, c.root.rotation, c.scaleX, c.scaleY, c.root.alpha]);
    const before = pose();
    expect(before.length).toBeGreaterThan(0);
    r.run(s as never, 3, 0);
    expect(pose()).toEqual(before);
    // And the trot does go on with the battle's clock (a third of a second changes the height).
    r.run(s as never, 0.2);
    expect(pose()).not.toEqual(before);
  });

  it('under reduced motion does not bob, lean, squash, arc or flicker', () => {
    const r = field();
    const s = makeCloud(r.env);
    cast(s);
    r.run(s as never, 1.4);
    const ys: number[] = [];
    for (let i = 0; i < 30; i++) {
      r.run(s as never, 1 / 60);
      ys.push(live(s).list[0]?.y ?? 0);
    }
    expect(Math.max(...ys) - Math.min(...ys)).toBeLessThan(1e-3);
    const c = sprites(s)[0] as { root: Container; scaleX: number; scaleY: number };
    expect(c.scaleX).toBeCloseTo(c.scaleY, 9);
    expect(c.root.rotation).toBe(0);
    bolt(r);
    // No flicker: the same painted bolt through its whole life (the stand-in texture is one object, so look at the step through the age).
    const bl = (s as unknown as { bolts: { list: Array<{ age: { real: number } }> } }).bolts.list[0] as { age: { real: number } };
    r.run(s as never, 0.2);
    expect(bl.age.real).toBeGreaterThan(0);
    // The one shake of the scene is none: the cloud never shakes the camera.
    expect(r.stage.shake).not.toHaveBeenCalled();
  });

  it('bobs when motion is full: the cloud trots (its height changes over a third of a second)', () => {
    const r = field();
    r.stage.reduced = false;
    const s = makeCloud(r.env);
    cast(s);
    r.run(s as never, 0.7);
    const ys: number[] = [];
    for (let i = 0; i < 24; i++) {
      r.run(s as never, 1 / 60);
      ys.push(live(s).list[0]?.y ?? 0);
    }
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(2);
    expect(Math.max(...ys) - Math.min(...ys)).toBeLessThan(6);
  });

  it('goes by itself when its end never comes, a moment after its time', () => {
    const r = field();
    const s = makeCloud(r.env);
    cast(s, 1, 1, { at: 0, life: 3.2 });
    r.run(s as never, 3);
    expect(live(s).clouds).toBe(1);
    r.run(s as never, 1.8);
    expect(live(s).list[0]?.mode).toBe('fizzle');
    r.run(s as never, 1);
    expect(live(s).clouds).toBe(0);
  });

  it('never has more than six clouds, reuses its pieces and keeps what it adds to the field in one place', () => {
    const r = field();
    const s = makeCloud(r.env);
    for (let i = 1; i <= 20; i++) {
      cast(s, i, 1 + (i % 3));
      r.run(s as never, 0.05);
    }
    expect(live(s).clouds).toBeLessThanOrEqual(6);
    expect((s as unknown as { clouds: unknown[] }).clouds.length).toBeLessThanOrEqual(6);
    const kids = r.front.children.length;
    for (let i = 21; i <= 60; i++) {
      cast(s, i, 1);
      bolt(r, i, 1, 1);
      r.run(s as never, 0.05);
    }
    expect(r.front.children.length).toBeLessThanOrEqual(kids + 14);
    expect(live(s).bolts).toBeLessThanOrEqual(14);
  });

  it('survives a defeat (the simulation carries its clouds on after a revive); a victory clears it', () => {
    const r = field();
    const s = makeCloud(r.env);
    expect(s.survivesDefeat).toBe(true);
    cast(s);
    r.run(s as never, 0.6);
    s.clear();
    expect(live(s)).toMatchObject({ clouds: 0, bolts: 0 });
    // It can be used again.
    cast(s, 2, 1);
    expect(live(s).clouds).toBe(1);
  });

  it('listens for its own events and lets go of them on destroy', () => {
    const r = field();
    const s = makeCloud(r.env);
    cast(s);
    s.destroy();
    expect(r.removed).toBe(3);
    expect(r.front.children.length).toBe(0);
    // After it is gone the events find no listener.
    expect(() => bolt(r)).not.toThrow();
  });

  it('fails alone: a throw in its own listener is logged and does not unwind into the simulation, the scene is switched off', () => {
    const r = field();
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const s = makeCloud(r.env);
    cast(s);
    r.run(s as never, 0.6);
    r.stage.fx.fleck.mockImplementation(() => {
      throw new Error('boom');
    });
    expect(() => bolt(r)).not.toThrow();
    expect(err).toHaveBeenCalled();
    expect(live(s)).toMatchObject({ clouds: 0, bolts: 0 });
    // Switched off for the rest of the battle.
    r.stage.fx.fleck.mockClear();
    bolt(r);
    expect(r.stage.fx.fleck).not.toHaveBeenCalled();
    err.mockRestore();
  });

  it('keeps a cloud inside the field at the top and the sides', () => {
    const r = rig(1, true);
    r.battle.enemies.push(foe(1, 5, 45), foe(2, 715, 45));
    const s = makeCloud(r.env);
    cast(s, 1, 1);
    cast(s, 2, 2);
    r.run(s as never, 1);
    for (const c of live(s).list) {
      expect(c.x).toBeGreaterThanOrEqual(34 - 1e-6);
      expect(c.x).toBeLessThanOrEqual(720 - 34 + 1e-6);
      expect(c.y).toBeGreaterThanOrEqual(-34 - 1e-6);
    }
  });

  it('paints its pictures once, in code: one body and five faces', () => {
    expect(cloudArt()).toBe(cloudArt());
    expect(Object.keys(cloudArt().faces).sort()).toEqual(['grumpy', 'sad', 'sigh', 'startled', 'zap']);
  });

  it('enemy sizes are the game\'s own (a boss\'s cloud sits higher than a cucumber\'s)', () => {
    expect(enemyInfo('boss_blender').top).toBeGreaterThan(info.top);
    expect(enemyDef('cucumber').radius).toBeGreaterThan(0);
  });
});
