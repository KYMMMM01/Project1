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
  fxTex: () => ({ id: 'beam', texture: Texture.WHITE, w: 64, h: 256, ax: 0.5, ay: 0.5 }),
}));
vi.mock('@/ui/text', async (original) => ({
  ...(await original<typeof import('@/ui/text')>()),
  label: (text: string, o: { size?: number } = {}) => ({ width: text.length * (o.size ?? 20) * 0.55, destroy: () => undefined }),
}));
vi.mock('@/ui/paper', async (original) => ({
  ...(await original<typeof import('@/ui/paper')>()),
  PaperLabel: class extends Container {
    uiBox = { x: -60, y: -23, w: 120, h: 46 };
    setText(): void {}
  },
}));
// The real dispatcher with the real scene of the lucky cat only; the intro (name bubble, cut-in) needs fonts and is not under test here.
const intro = vi.hoisted(() => ({ first: [] as unknown[] }));
vi.mock('@/view/director/sp/intro', async (original) => ({
  ...(await original<typeof import('@/view/director/sp/intro')>()),
  SpIntro: class {
    first = (e: unknown) => intro.first.push(e);
    update = vi.fn();
    clear = vi.fn();
    destroy = vi.fn();
  },
}));
vi.mock('@/view/director/sp/scenes', async () => {
  const capsule = await import('@/view/director/sp/capsule');
  return { SCENES: { capsule: capsule.makeCapsule } };
});

import { Emitter } from '@/core/events';
import { setFxSettings } from '@/fx/settings';
import type { BattleEvents, SpCastEvent, UnitState } from '@/game/api';
import { cellCenterX, cellCenterY } from '@/game/geometry';
import { mountSp } from '@/view/director/sp';
import { lazyLive } from './lazyScene';
import { clearRingHolds, ringHeld } from '@/view/field/ringHold';
import type { Bus, Stage } from '@/view/director/stage';

const lucky = { uid: 7, id: 't_lucky', cell: 12, sp: 0.5 } as unknown as UnitState;

function rig() {
  const events = new Emitter<BattleEvents>();
  const battle = { spOn: true, time: 3, units: [...Array.from({ length: 12 }, () => null), lucky], events };
  const frames: Array<(dt: number) => void> = [];
  const disposers: Array<() => void> = [];
  const stage = {
    now: 0,
    ctx: { battle, layers: { fxBack: new Container(), fxFront: new Container(), numbers: new Container() }, unitView: () => null, speed: 1 },
    addFrame: (fn: (dt: number) => void) => frames.push(fn),
    onDestroy: (fn: () => void) => disposers.push(fn),
    play: vi.fn(),
    later: vi.fn(() => ({ kill: vi.fn() })),
    shake: vi.fn(),
    detail: 1,
    reduced: false,
    fx: { ps: { burst: vi.fn() }, shockwave: vi.fn() },
    rules: { big: {}, zone: {}, ui: {} },
  };
  const on = ((type: keyof BattleEvents, fn: never) => {
    events.on(type, fn);
  }) as unknown as Bus;
  const staging = mountSp(stage as unknown as Stage, on);
  const scene = lazyLive<{ flights: Array<{ state: string }>; pops: number }>(staging, 'capsule');
  return { events, battle, stage, frames, disposers, staging, scene };
}

const cast = (at: number, kind = 'purr', first = false): SpCastEvent =>
  ({
    unit: lucky,
    first,
    x: cellCenterX(12),
    y: cellCenterY(12),
    skill: 'capsule',
    data: { kind, inner: null, at, openDelay: 1.2, moreDelay: 1, refund: kind === 'fish' },
  }) as unknown as SpCastEvent;

const open = (kind = 'purr', result = 'purr'): BattleEvents['capsuleOpen'] =>
  ({ kind, small: false, inner: null, x: cellCenterX(12), y: cellCenterY(12), result, cell: -1, origin: -1, purr: 2 }) as unknown as BattleEvents['capsuleOpen'];

describe('the lucky cat\'s scene behind the real dispatcher', () => {
  beforeEach(() => {
    vi.stubGlobal('window', { __dbg: {} });
    const ctx = new Proxy({}, { get: () => () => undefined, set: () => true });
    vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, style: {}, getContext: () => ctx }) });
    setFxSettings({ tier: 'mid', reducedMotion: false });
    intro.first.length = 0;
    clearRingHolds();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('shows a capsule that the stage rule let through, and opens it on the capsuleOpen of that cast', () => {
    const r = rig();
    r.events.emit('spCast', cast(3));
    expect(r.scene.live().flights).toHaveLength(1);
    r.battle.time = 4.2;
    r.events.emit('capsuleOpen', open());
    expect(r.scene.live().flights[0]?.state).toBe('open');
    expect(r.scene.live().pops).toBe(1);
  });

  it('shows nothing for a capsule that lost the stage rule (a second cast within a quarter of a real second), and its opening does nothing', () => {
    const r = rig();
    r.events.emit('spCast', cast(3, 'purr'));
    r.stage.now = 0.1;
    r.events.emit('spCast', cast(3.1, 'fish'));
    expect(r.scene.live().flights).toHaveLength(1);
    // The fish capsule that lost holds no ring either.
    expect(ringHeld(7)).toBeUndefined();
    // Its opening comes first? No: the purr capsule opens first, at 4.2; the lost fish capsule's at 4.3 finds nobody.
    r.battle.time = 4.2;
    r.events.emit('capsuleOpen', open('purr', 'purr'));
    r.battle.time = 4.3;
    r.events.emit('capsuleOpen', open('fish', 'fish'));
    expect(r.scene.live().pops).toBe(1);
  });

  it('shows the first cast of the skill whatever the stage says (the cut-in and the picture), and hands the dispatcher\'s intro its cast', () => {
    const r = rig();
    r.events.emit('spCast', cast(3, 'purr'));
    r.stage.now = 0.05;
    r.events.emit('spCast', cast(3.05, 'toy', true));
    expect(r.scene.live().flights).toHaveLength(2);
    expect(intro.first).toHaveLength(1);
  });

  it('survives a defeat (the simulation keeps the capsules in the air for a revive) and is cleared by a victory', () => {
    const r = rig();
    r.events.emit('spCast', cast(3, 'fish'));
    expect(ringHeld(7)).toBe(0);
    r.events.emit('defeat', { reason: 'overflow' } as never);
    expect(r.scene.live().flights).toHaveLength(1);
    expect(ringHeld(7)).toBe(0);
    // After a revive the opening comes as if nothing had happened.
    r.battle.time = 4.2;
    r.events.emit('capsuleOpen', open('fish', 'fish'));
    expect(r.scene.live().flights[0]?.state).toBe('open');
    r.events.emit('spCast', cast(4.2, 'purr'));
    r.events.emit('victory', {} as never);
    expect(r.scene.live().flights).toHaveLength(0);
    expect(ringHeld(7)).toBeUndefined();
  });

  it('is made only with skills on, and its listeners and pictures go when the director goes', () => {
    const off = rig();
    off.battle.spOn = false;
    expect(mountSp(off.stage as unknown as Stage, ((() => undefined) as unknown) as Bus)).toBeNull();
    const r = rig();
    r.events.emit('spCast', cast(3));
    for (const d of r.disposers) d();
    expect(r.stage.ctx.layers.fxFront.children.length).toBe(0);
    // A later opening is nobody's business.
    r.battle.time = 4.2;
    expect(() => r.events.emit('capsuleOpen', open())).not.toThrow();
  });
});
