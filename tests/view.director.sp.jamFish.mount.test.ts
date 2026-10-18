import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Container, Sprite, Texture } from 'pixi.js';

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
// The real dispatcher with the real scenes of the bard and the alchemist only; the intro needs fonts.
vi.mock('@/view/director/sp/intro', () => ({
  SpIntro: class {
    first = vi.fn();
    update = vi.fn();
    clear = vi.fn();
    destroy = vi.fn();
  },
}));
vi.mock('@/view/director/sp/scenes', async () => {
  const jam = await import('@/view/director/sp/jam');
  const fish = await import('@/view/director/sp/fish');
  return { SCENES: { jam: jam.makeJam, fish: fish.makeFish } };
});

import { Emitter } from '@/core/events';
import { setFxSettings } from '@/fx/settings';
import type { BattleEvents, EnemyState, SpCastEvent, UnitState } from '@/game/api';
import { mountSp } from '@/view/director/sp';
import { lazyLive } from './lazyScene';
import { fishHoldsOf } from '@/view/director/sp/fishHold';
import type { Bus, Stage } from '@/view/director/stage';
import { clearRingHolds, ringHeld, ringHolds } from '@/view/field/ringHold';

const unit = (uid: number, id: string, cell: number, sp = 0): UnitState => ({ uid, id, cell, sp }) as unknown as UnitState;
const foe = (uid: number, x: number, id = 'dust'): EnemyState =>
  ({ uid, id, x, y: 45, angle: 0, hp: 5, maxHp: 5, fish: false, slow: 0, frozen: false, burning: false, poisoned: false, enraged: false }) as unknown as EnemyState;

function rig() {
  const events = new Emitter<BattleEvents>();
  let removed = 0;
  const on0 = events.on.bind(events);
  events.on = ((type: keyof BattleEvents, fn: never) => {
    const off = on0(type, fn);
    return () => {
      removed++;
      off();
    };
  }) as typeof events.on;
  const boss = foe(100, 381, 'boss_blender');
  const smalls = [1, 2].map((uid) => foe(uid, 150 + uid * 20));
  const units = [unit(2, 'm_frost', 6, 0.4), unit(4, 'r_sling', 16)];
  const battle = { spOn: true, time: 3, enemies: [boss, ...smalls], units, events };
  const frames: Array<(dt: number) => void> = [];
  const disposers: Array<() => void> = [];
  const views = new Map<number, { root: Container; sprite: Sprite }>();
  for (const e of battle.enemies) {
    const root = new Container();
    const body = new Container();
    body.label = 'body';
    const sprite = new Sprite(Texture.WHITE);
    sprite.label = 'sprite';
    body.addChild(sprite);
    root.addChild(body);
    views.set(e.uid, { root, sprite });
  }
  const stage = {
    now: 0,
    ctx: { battle, layers: { fxBack: new Container(), fxFront: new Container(), enemies: new Container() }, enemyView: (uid: number) => views.get(uid)?.root ?? null },
    addFrame: (fn: (dt: number) => void) => frames.push(fn),
    onDestroy: (fn: () => void) => disposers.push(fn),
    play: vi.fn(),
    playStep: vi.fn(),
    laterReal: vi.fn(),
    later: vi.fn(() => ({ kill: vi.fn() })),
    shake: vi.fn(),
    detail: 1,
    reduced: false,
    fx: { ps: { burst: vi.fn() }, shockwave: vi.fn(), fleck: vi.fn() },
    rules: { big: {}, zone: {}, hit: {}, coinTick: {} },
  };
  const on = ((type: keyof BattleEvents, fn: never) => {
    events.on(type, fn);
  }) as unknown as Bus;
  const staging = mountSp(stage as unknown as Stage, on);
  const jamScene = lazyLive<{ notes: number; held: number }>(staging, 'jam');
  const fishScene = lazyLive<{ throws: number; fish: Array<{ mode: string; loud: boolean }>; held: number }>(staging, 'fish');
  return { events, battle, boss, smalls, views, stage, frames, disposers, staging, jamScene, fishScene, removed: () => removed };
}

const castJam = (): SpCastEvent =>
  ({
    unit: unit(1, 't_bard', 12), first: false, x: 360, y: 330, skill: 'jam',
    data: { fill: 0.2, notes: [{ uid: 2, cell: 6, kind: 'gauge', before: 0.2, after: 0.4 }, { uid: 4, cell: 16, kind: 'attack', before: 0, after: 0 }] },
  }) as unknown as SpCastEvent;

const castFish = (): SpCastEvent =>
  ({
    unit: unit(3, 't_alch', 2), first: false, x: 360, y: 138, skill: 'fish',
    data: { big: { uid: 100, x: 381, y: 45, boss: true, seconds: 4, lock: 8, cats: 3 }, small: [1, 2].map((uid) => ({ uid, x: 150 + uid * 20, y: 45 })) },
  }) as unknown as SpCastEvent;

describe('the bard\'s and the alchemist\'s scenes behind the real dispatcher', () => {
  beforeEach(() => {
    vi.stubGlobal('window', { __dbg: {} });
    const ctx = new Proxy({}, { get: () => () => undefined, set: () => true });
    vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, style: {}, getContext: () => ctx }) });
    setFxSettings({ tier: 'mid', reducedMotion: false });
    clearRingHolds();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    clearRingHolds();
  });

  it('shows a jam the stage rule let through and holds the ring of the cat that gets a gauge note', () => {
    const r = rig();
    r.events.emit('spCast', castJam());
    expect(r.jamScene.live()).toMatchObject({ notes: 2, held: 1 });
    expect(ringHeld(2)).toBe(0.2);
  });

  it('shows nothing for a jam that lost the rule: no note, and no hold, so its rings simply jump', () => {
    const r = rig();
    r.events.emit('spCast', castJam());
    clearRingHolds();
    r.stage.now = 0.1;
    r.events.emit('spCast', castJam());
    expect(r.staging?.rule.lost).toBe(1);
    expect(r.jamScene.live().notes).toBe(2);
    expect(ringHolds()).toBe(0);
  });

  it('throws the flasks of a fish the rule let through and expects the small ones\' kills; a fish that lost the rule has no flask and no expectation but the boss is a fish all the same', () => {
    const r = rig();
    r.events.emit('spCast', castFish());
    r.events.emit('status', { enemy: r.boss, kind: 'fish', duration: 4 });
    expect(r.fishScene.live().throws).toBe(3);
    expect(fishHoldsOf(r.battle).size).toBe(2);
    expect(r.fishScene.live().fish).toMatchObject([{ mode: 'wait', loud: true }]);

    const q = rig();
    q.events.emit('spCast', castJam());
    q.stage.now = 0.1;
    q.events.emit('spCast', castFish());
    q.events.emit('status', { enemy: q.boss, kind: 'fish', duration: 4 });
    expect(q.staging?.rule.lost).toBe(1);
    expect(q.fishScene.live().throws).toBe(0);
    expect(fishHoldsOf(q.battle).size).toBe(0);
    expect(q.fishScene.live().fish).toMatchObject([{ mode: 'swim', loud: false }]);
    expect(q.views.get(100)?.sprite.visible).toBe(false);
  });

  it('a defeat or a victory clears the fish and the notes: the boss\'s picture is back, every ring let go, every kill flown', () => {
    const r = rig();
    const flown: number[] = [];
    fishHoldsOf(r.battle).fire = (e) => flown.push(e.delta);
    r.events.emit('spCast', castFish());
    r.events.emit('status', { enemy: r.boss, kind: 'fish', duration: 4 });
    // The two small enemies' rewards come right after the cast, and are kept for their flasks.
    for (const e of r.smalls) fishHoldsOf(r.battle).hold({ total: 1, delta: 3, reason: 'kill', x: e.x, y: e.y });
    r.stage.now = 1;
    r.events.emit('spCast', castJam());
    for (let i = 0; i < 5; i++) for (const f of r.frames) f(1 / 60);
    expect(flown).toEqual([]);
    r.events.emit('defeat', { reason: 'overrun' } as never);
    expect(flown).toEqual([3, 3]);
    expect(r.fishScene.live()).toMatchObject({ throws: 0, fish: [], held: 0 });
    expect(r.jamScene.live()).toMatchObject({ notes: 0, held: 0 });
    expect(ringHolds()).toBe(0);
    expect(r.views.get(100)?.sprite.visible).toBe(true);
    r.events.emit('victory', {} as never);
    expect(r.fishScene.live().fish).toEqual([]);
  });

  it('gives both scenes their frame and, when the director goes, releases the fish scene\'s own listeners and every hold', () => {
    const r = rig();
    r.events.emit('spCast', castFish());
    r.events.emit('status', { enemy: r.boss, kind: 'fish', duration: 4 });
    r.stage.now = 1;
    r.events.emit('spCast', castJam());
    for (const f of r.frames) f(1 / 60);
    const before = r.removed();
    for (let i = r.disposers.length - 1; i >= 0; i--) (r.disposers[i] as () => void)();
    // The fish scene takes three listeners off (status, fishEnd, enemyDie).
    expect(r.removed() - before).toBeGreaterThanOrEqual(3);
    expect(fishHoldsOf(r.battle).size).toBe(0);
    expect(ringHolds()).toBe(0);
  });
});
