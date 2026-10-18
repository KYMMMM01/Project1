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
  fxTex: () => ({ id: 'streak', texture: Texture.WHITE, w: 256, h: 16, ax: 0, ay: 0.5 }),
  screenFx: { flash: () => true },
}));
// The real dispatcher with the real scenes of the samurai and the cosmo cat only (the others' pictures are not under test here); the intro needs fonts.
vi.mock('@/view/director/sp/intro', () => ({
  SpIntro: class {
    first = vi.fn();
    update = vi.fn();
    clear = vi.fn();
    destroy = vi.fn();
  },
}));
vi.mock('@/view/director/sp/scenes', async () => {
  const cut = await import('@/view/director/sp/cut');
  const meteor = await import('@/view/director/sp/meteor');
  return { SCENES: { cut: cut.makeCut, meteor: meteor.makeMeteor } };
});

import { Emitter } from '@/core/events';
import { setFxSettings } from '@/fx/settings';
import type { BattleEvents, EnemyState, SpCastEvent, UnitState } from '@/game/api';
import { pathPoint } from '@/game/geometry';
import { SCENES } from '@/view/director/sp/scenes';
import { makeCut } from '@/view/director/sp/cut';
import { makeMeteor } from '@/view/director/sp/meteor';
import { mountSp } from '@/view/director/sp';
import { lazyLive } from './lazyScene';
import type { Bus, Stage } from '@/view/director/stage';

const unit = (id: string, cell: number): UnitState => ({ uid: 1, id, cell }) as unknown as UnitState;

function rig() {
  const events = new Emitter<BattleEvents>();
  const enemies: EnemyState[] = [];
  for (let i = 0; i < 3; i++) {
    const p = pathPoint(150 + i * 40);
    enemies.push({ uid: i + 1, id: 'cucumber', travelled: 150 + i * 40, x: p.x, y: p.y, angle: p.angle } as unknown as EnemyState);
  }
  const battle = { spOn: true, time: 3, enemies, units: [unit('w_samurai', 2)], events };
  const fx = { ps: { burst: vi.fn() }, shockwave: vi.fn(), dustPuff: vi.fn() };
  const frames: Array<(dt: number) => void> = [];
  const disposers: Array<() => void> = [];
  const stage = {
    now: 0,
    ctx: { battle, layers: { fxBack: new Container(), fxFront: new Container() }, unitView: () => null, speed: 1 },
    addFrame: (fn: (dt: number) => void) => frames.push(fn),
    onDestroy: (fn: () => void) => disposers.push(fn),
    play: vi.fn(),
    later: vi.fn(() => ({ kill: vi.fn() })),
    shake: vi.fn(),
    detail: 1,
    reduced: false,
    fx,
    rules: { big: {}, zone: {}, strike: {}, heavyHit: {} },
  };
  const on = ((type: keyof BattleEvents, fn: never) => {
    events.on(type, fn);
  }) as unknown as Bus;
  const staging = mountSp(stage as unknown as Stage, on);
  const cutScene = lazyLive<{ lines: Array<{ state: string }>; dashes: unknown[]; waiting: number }>(staging, 'cut');
  const meteorScene = lazyLive<{ warns: unknown[]; craters: unknown[]; waiting: number }>(staging, 'meteor');
  return { events, battle, stage, frames, disposers, staging, cutScene, meteorScene };
}

const castCut = (cutId: number, at: number): SpCastEvent =>
  ({
    unit: unit('w_samurai', 2),
    first: false,
    x: 306,
    y: 138,
    skill: 'cut',
    data: { cutId, anchorUid: 1, anchorPath: 190, fromPath: 100, toPath: 550, at, fuse: 1.2, marks: [{ uid: 1, x: 0, y: 0 }, { uid: 2, x: 0, y: 0 }, { uid: 3, x: 0, y: 0 }] },
  }) as unknown as SpCastEvent;

const castMeteor = (meteorId: number, at: number): SpCastEvent =>
  ({
    unit: unit('m_cosmo', 12),
    first: false,
    x: 306,
    y: 330,
    skill: 'meteor',
    data: { meteorId, impactX: 400, impactY: 300, onLaser: false, at, warn: 1, innerRadius: 90, outerRadius: 200, outerDelay: 0.25, craterRadius: 100, craterLife: 4 },
  }) as unknown as SpCastEvent;

describe('the samurai\'s and the cosmo cat\'s scenes behind the real dispatcher', () => {
  beforeEach(() => {
    // `debugExpose` (the QA hooks) writes on `window.__dbg`.
    vi.stubGlobal('window', { __dbg: {} });
    const ctx = new Proxy({}, { get: () => () => undefined, set: () => true });
    vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, style: {}, getContext: () => ctx }) });
    setFxSettings({ tier: 'mid', reducedMotion: false });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('is in the registry', () => {
    expect(SCENES.cut).toBe(makeCut);
    expect(SCENES.meteor).toBe(makeMeteor);
  });

  it('shows a cut that the stage rule let through, and the lines open on the cutOpen of that cast', () => {
    const r = rig();
    r.events.emit('spCast', castCut(1, 3));
    expect(r.cutScene.live().lines).toHaveLength(3);
    r.events.emit('cutOpen', { cutId: 1, unit: unit('w_samurai', 2), at: 3, lines: [1, 2, 3].map((uid) => ({ uid, kind: 'cut' as const, to: 0, x: 100, y: 40, toX: 100, toY: 40 })) });
    expect(r.cutScene.live().lines.every((l) => l.state === 'open')).toBe(true);
  });

  it('shows nothing for a cut that lost the stage rule (a second cast within a quarter of a real second), and its cutOpen does nothing', () => {
    const r = rig();
    r.events.emit('spCast', castCut(1, 3));
    r.stage.now = 0.1;
    r.events.emit('spCast', castCut(2, 3));
    expect(r.staging?.rule.shown).toBe(1);
    expect(r.staging?.rule.lost).toBe(1);
    expect(r.cutScene.live().waiting).toBe(1);
    expect(() => r.events.emit('cutOpen', { cutId: 2, unit: unit('w_samurai', 2), at: 3, lines: [{ uid: 1, kind: 'cut', to: 0, x: 0, y: 0, toX: 0, toY: 0 }] })).not.toThrow();
    expect(r.cutScene.live().lines.every((l) => l.state === 'wait')).toBe(true);
  });

  it('shows a meteor and lands it on the events of that meteor, and a meteor that lost the rule stays unseen', () => {
    const r = rig();
    r.events.emit('spCast', castMeteor(1, 3));
    expect(r.meteorScene.live().warns).toHaveLength(1);
    r.stage.now = 0.05;
    r.events.emit('spCast', castMeteor(2, 3));
    expect(r.meteorScene.live().warns).toHaveLength(1);
    const land = (meteorId: number): void =>
      r.events.emit('meteorLand', { meteorId, unit: unit('m_cosmo', 12), ring: 'inner', x: 400, y: 300, radius: 90, points: [] });
    land(2);
    expect(r.meteorScene.live().craters).toHaveLength(0);
    land(1);
    expect(r.meteorScene.live().craters).toHaveLength(1);
  });

  it('is cleared by victory and by defeat, and its frame runs through the dispatcher\'s own hook', () => {
    const r = rig();
    r.events.emit('spCast', castCut(1, 3));
    r.events.emit('spCast', castMeteor(1, 3));
    r.battle.time += 0.1;
    for (const f of r.frames) f(0.1);
    expect(r.cutScene.live().dashes).toHaveLength(1);
    r.events.emit('defeat', undefined as never);
    expect(r.cutScene.live().lines).toHaveLength(0);
    expect(r.meteorScene.live().warns).toHaveLength(0);
    r.events.emit('spCast', castCut(3, 3));
    r.events.emit('victory', undefined as never);
    expect(r.cutScene.live().lines).toHaveLength(0);
  });

  it('is not mounted at all when the battle plays without skills: no scene, no listener on the follow-up events', () => {
    const r = rig();
    r.disposers.length = 0;
    const events = new Emitter<BattleEvents>();
    const off = vi.spyOn(events, 'on');
    const stage = { ...r.stage, ctx: { ...r.stage.ctx, battle: { ...r.battle, spOn: false, events } } };
    const staging = mountSp(stage as unknown as Stage, ((t: keyof BattleEvents, fn: never) => events.on(t, fn)) as unknown as Bus);
    expect(staging).toBeNull();
    expect(off).not.toHaveBeenCalled();
  });
});
