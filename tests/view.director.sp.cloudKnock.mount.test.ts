import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Container, Texture } from 'pixi.js';

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
vi.mock('@/view/field/art', () => ({ fieldArt: () => ({ status: { freeze: Texture.WHITE, slow: Texture.WHITE } }) }));
// The real dispatcher with the real scenes of the storm cat and the frost queen only (the others' pictures are not under test here); the intro needs fonts.
vi.mock('@/view/director/sp/intro', () => ({
  SpIntro: class {
    first = vi.fn();
    update = vi.fn();
    clear = vi.fn();
    destroy = vi.fn();
  },
}));
vi.mock('@/view/director/sp/scenes', async () => {
  const cloud = await import('@/view/director/sp/cloud');
  const knock = await import('@/view/director/sp/knock');
  return { SCENES: { cloud: cloud.makeCloud, knock: knock.makeKnock } };
});

import { Emitter } from '@/core/events';
import { setFxSettings } from '@/fx/settings';
import type { BattleEvents, EnemyState, SpCastEvent, UnitState } from '@/game/api';
import { mountSp } from '@/view/director/sp';
import { lazyLive } from './lazyScene';
import { numberHoldsOf } from '@/view/director/sp/numberHold';
import type { Bus, Stage } from '@/view/director/stage';

const unit = (id: string, cell: number): UnitState => ({ uid: 1, id, cell }) as unknown as UnitState;

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
  const enemies: EnemyState[] = [];
  for (let i = 0; i < 4; i++) enemies.push({ uid: i + 1, id: 'cucumber', x: 400 + i * 40, y: 45, angle: 0, hp: 10, maxHp: 10 } as unknown as EnemyState);
  const battle = { spOn: true, time: 3, enemies, units: [], events };
  const frames: Array<(dt: number) => void> = [];
  const disposers: Array<() => void> = [];
  const stage = {
    now: 0,
    ctx: { battle, layers: { fxBack: new Container(), fxFront: new Container() } },
    addFrame: (fn: (dt: number) => void) => frames.push(fn),
    onDestroy: (fn: () => void) => disposers.push(fn),
    play: vi.fn(),
    later: vi.fn(() => ({ kill: vi.fn() })),
    shake: vi.fn(),
    detail: 1,
    reduced: false,
    fx: { ps: { burst: vi.fn() }, shockwave: vi.fn(), fleck: vi.fn(), iceShatter: vi.fn() },
    panOf: () => 0, stagger: () => 0, rules: { skill: {}, skillTick: {}, big: {}, zone: {}, strike: {}, heavyHit: {}, status: {} },
  };
  const on = ((type: keyof BattleEvents, fn: never) => {
    events.on(type, fn);
  }) as unknown as Bus;
  const staging = mountSp(stage as unknown as Stage, on);
  const cloudScene = lazyLive<{ clouds: number; bolts: number }>(staging, 'cloud');
  const knockScene = lazyLive<{ throws: number; ices: number; held: number }>(staging, 'knock');
  return { events, battle, stage, frames, disposers, staging, cloudScene, knockScene, removed: () => removed };
}

const castCloud = (cloudId: number): SpCastEvent =>
  ({
    unit: unit('m_storm', 6),
    first: false,
    x: 252,
    y: 234,
    skill: 'cloud',
    data: { cloudId, hostUid: 1, hostX: 400, hostY: 45, at: 3, life: 3.2, every: 0.4, bolts: 8, splashRadius: 60, hopRadius: 150 },
  }) as unknown as SpCastEvent;

const castKnock = (): SpCastEvent =>
  ({
    unit: unit('m_frost', 8),
    first: false,
    x: 144,
    y: 234,
    skill: 'knock',
    data: {
      impactX: 440,
      impactY: 45,
      radius: 260,
      shards: [1, 2, 3].map((uid) => ({ uid, x: 360 + uid * 40, y: 45, frozen: uid === 1 })),
    },
  }) as unknown as SpCastEvent;

describe('the storm cat\'s and the frost queen\'s scenes behind the real dispatcher', () => {
  beforeEach(() => {
    // `debugExpose` (the QA hooks) writes on `window.__dbg`.
    vi.stubGlobal('window', { __dbg: {} });
    const ctx = new Proxy({}, { get: () => () => undefined, set: () => true });
    vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, style: {}, getContext: () => ctx }) });
    setFxSettings({ tier: 'mid', reducedMotion: false });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('shows a cloud the stage rule let through, and the cloud\'s own events draw on it', () => {
    const r = rig();
    r.events.emit('spCast', castCloud(1));
    expect(r.cloudScene.live().clouds).toBe(1);
    r.events.emit('cloudBolt', { cloudId: 1, unit: unit('m_storm', 6), hostUid: 1, x: 400, y: 45, index: 1, bolts: 8, points: [] });
    expect(r.cloudScene.live().bolts).toBe(1);
  });

  it('shows nothing for a cloud that lost the stage rule (a second cast within a quarter of a real second), and its bolts do nothing', () => {
    const r = rig();
    r.events.emit('spCast', castCloud(1));
    r.stage.now = 0.1;
    r.events.emit('spCast', castCloud(2));
    expect(r.staging?.rule.shown).toBe(1);
    expect(r.staging?.rule.lost).toBe(1);
    expect(r.cloudScene.live().clouds).toBe(1);
    expect(() => r.events.emit('cloudBolt', { cloudId: 2, unit: unit('m_storm', 6), hostUid: 1, x: 400, y: 45, index: 1, bolts: 8, points: [] })).not.toThrow();
    expect(r.cloudScene.live().bolts).toBe(0);
  });

  it('a knock that lost the rule holds nothing: its numbers are shown at once', () => {
    const r = rig();
    r.events.emit('spCast', castKnock());
    expect(r.knockScene.live().ices).toBe(3);
    r.stage.now = 0.1;
    r.events.emit('spCast', castKnock());
    // The second cast made no throw and no ice: still three, and still three holds.
    expect(r.knockScene.live().ices).toBe(3);
    expect(r.knockScene.live().held).toBe(3);
  });

  it('a defeat clears the glass and shows the numbers it held but leaves the cloud (the simulation carries it on after a revive); a victory clears both', () => {
    const r = rig();
    r.stage.now = 0;
    r.events.emit('spCast', castCloud(1));
    r.stage.now = 1;
    r.events.emit('spCast', castKnock());
    const said: number[] = [];
    numberHoldsOf(r.battle).say = (_e, v) => said.push(v);
    numberHoldsOf(r.battle).defer(r.battle.enemies[0] as EnemyState, 33, 'damage', undefined, 3);
    r.events.emit('defeat', { reason: 'overrun' } as never);
    expect(r.knockScene.live()).toMatchObject({ throws: 0, ices: 0, held: 0 });
    expect(said).toEqual([33]);
    expect(r.cloudScene.live().clouds).toBe(1);
    r.events.emit('victory', {} as never);
    expect(r.cloudScene.live()).toMatchObject({ clouds: 0, bolts: 0 });
  });

  it('gives every scene its frame, and the director going releases the scenes\' own listeners and what they hold', () => {
    const r = rig();
    r.events.emit('spCast', castCloud(1));
    r.stage.now = 1;
    r.events.emit('spCast', castKnock());
    for (const f of r.frames) f(1 / 60);
    const before = r.removed();
    for (let i = r.disposers.length - 1; i >= 0; i--) (r.disposers[i] as () => void)();
    // The cloud takes three listeners off (bolt, hop, end).
    expect(r.removed() - before).toBeGreaterThanOrEqual(3);
    expect(numberHoldsOf(r.battle).size).toBe(0);
  });
});
