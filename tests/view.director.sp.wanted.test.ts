/**
 * The gunner's scene, "Wanted: One Shot!" (docs/design_skills_v2.md 3.5), on the view side: the poster and the cork (`director/sp/wanted.ts`),
 * the boss bar that is held at the health it had until the cork lands (`biteHold.ts`, `hud/BossBar.ts`), what a bite leaves on the bar
 * (`hud/BiteMarks.ts`), and the "holstered" mark on the ring of a gunner that is saving its shot (`field/spHolster.ts`).
 * The simulation's side (the bite, the pool, holding fire) is in `sim.spWanted.test.ts`; here the view is fed real events of a real
 * battle, or stand-ins for the stage where only the scene is under test.
 */
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
  fxTex: () => ({ id: 'streak', texture: Texture.WHITE, w: 256, h: 16, ax: 0, ay: 0.5 }),
}));
vi.mock('@/fx/paint', () => ({ paint: () => Texture.WHITE }));

// The boss bar is built for real, out of stand-ins for the UI kit's pieces (fonts and a canvas are not in this test's world): a label is
// a container with a text, the health bar remembers every value it was given, and a tween bag does nothing.
vi.mock('@/ui', async (original) => {
  const real = await original<typeof import('@/ui')>();
  const { Container } = await import('pixi.js');
  class FakeText extends Container {
    text: string;
    constructor(text = '') {
      super();
      this.text = text;
    }
    override get width(): number {
      return 60;
    }
    override set width(_v: number) {
      // a fixed measure is enough for the layout the tests look at
    }
  }
  class FakeBar extends Container {
    value: number;
    readonly given: number[] = [];
    constructor(opts: { value?: number }) {
      super();
      this.value = opts.value ?? 1;
    }
    setValue(v: number): void {
      this.value = v;
      this.given.push(v);
    }
  }
  class FakeBag {
    killAll(): void {}
    killKeyed(): void {}
    runKeyed(): void {}
    call(): void {}
  }
  return {
    ...real,
    artLabel: (text: string) => new FakeText(text),
    uiLabel: (text: string) => new FakeText(text),
    drawIcon: () => new Container(),
    drawPaper: () => undefined,
    fitLabel: () => undefined,
    paperShape: () => new Container(),
    paperSeed: () => 1,
    ProgressBar: FakeBar,
    TweenBag: FakeBag,
  };
});
// The words are not loaded in this world: a text with a number in it comes out as its key and the number, which is all the tests read.
vi.mock('@/core/i18n', async (original) => ({
  ...(await original<typeof import('@/core/i18n')>()),
  t: (key: string, args?: Record<string, unknown>) => (args ? `${key}|${Object.values(args).join(',')}` : key),
}));
vi.mock('@/view/hud/kit', () => ({ enemyPortrait: () => new Container() }));
vi.mock('@/view/info', () => ({ info: { tap: () => undefined } }));
vi.mock('@/view/hud/enemyInfo', () => ({ defenceLine: () => 'Armor 35% / Ward 10%', enemyInfo: () => ({}) }));

import { Emitter } from '@/core/events';
import { setFxSettings } from '@/fx/settings';
import { Trauma } from '@/fx';
import type { BattleApi, BattleEvents, BattleInit, EnemyState, UnitState } from '@/game/api';
import { TICK } from '@/game/data/balance';
import { startWave } from '@/game/sim/flow';
import { createBot } from '@/game/sim/bots';
import { damageEnemy } from '@/game/sim/enemies';
import { holdingFire as simHoldingFire } from '@/game/sim/sp/wanted';
import type { Sim } from '@/game/sim/sim';
import type { SimEnemy } from '@/game/sim/types';
import { BITE_HOLD_MAX, BITE_LAND, BitePending, BiteHolds, EGGS, biteHoldsOf, biteText, eggsFilled, shownHealth } from '@/view/biteHold';
import { makeWanted } from '@/view/director/sp/wanted';
import type { SpEnv } from '@/view/director/sp/types';
import { Gate } from '@/view/director/stage';
import type { Stage } from '@/view/director/stage';
import { MARK_DRAW, markTexture } from '@/view/field/spRing';
import { RING_MARK_RULES, ringMarkOf } from '@/view/field/spRingMath';
import { holdingFire, holsterMark } from '@/view/field/spHolster';
import { BossBar } from '@/view/hud/BossBar';
import { DamageWindow } from '@/view/hud/killEstimate';
import { STAMP_SHOWN } from '@/view/hud/BiteMarks';
import { NIGHT_LABEL } from '@/view/director/sp/types';
import { wantedArt } from '@/view/wantedArt';
import { advance, initOf, newSim, put, quietWave } from './simHelpers';

function stubDocument(): void {
  const ctx = new Proxy({}, { get: () => () => undefined, set: () => true });
  vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, style: {}, getContext: () => ctx }) });
}

// ───────────────────────────── the numbers the bar and the poster are built from ─────────────────────────────

describe('what a bite is worth to the bar and the poster', () => {
  it('writes the share as a whole percent of the target\'s maximum health, at least 1: "-6%" for a bite, "-12%" for two in the same breath', () => {
    expect(biteText(0.06)).toBe('-6%');
    expect(biteText(0.12)).toBe('-12%');
    expect(biteText(0.0449)).toBe('-4%');
    expect(biteText(0.0451)).toBe('-5%');
    // A bite that took what little the pool had left still says something.
    expect(biteText(0.001)).toBe('-1%');
    expect(biteText(0)).toBe('-1%');
  });

  it('fills one egg per bite of the pool: none, one at 6% of 12%, both at 12%, and none for a target with no pool', () => {
    expect(EGGS).toBe(2);
    expect(eggsFilled(0, 0.12)).toBe(0);
    expect(eggsFilled(0.06, 0.12)).toBe(1);
    expect(eggsFilled(0.12, 0.12)).toBe(2);
    expect(eggsFilled(0.2, 0.12)).toBe(2);
    expect(eggsFilled(0.06, 0)).toBe(0);
    expect(eggsFilled(Number.NaN, 0.12)).toBe(0);
  });

  it('shows the health the simulation has plus what the scene holds back, never more than the bar is long and never below nothing', () => {
    expect(shownHealth(900, 0, 0, 1000, 0)).toBe(900);
    expect(shownHealth(900, 0, 60, 1000, 0)).toBe(960);
    expect(shownHealth(900, 50, 60, 1000, 100)).toBe(1010);
    expect(shownHealth(990, 0, 60, 1000, 0)).toBe(1000);
    expect(shownHealth(-5, 0, 0, 1000, 0)).toBe(0);
    expect(shownHealth(100, 0, -30, 1000, 0)).toBe(100);
  });

  it('adds up the bites the bar was told of before it shows them: two gunners in one tick are one "-12%", the case is closed if either closed it', () => {
    const p = new BitePending();
    p.add(0.06, 0.06, 0.12, false);
    p.add(0.06, 0.12, 0.12, true);
    expect(p.count).toBe(2);
    expect(p.share).toBeCloseTo(0.12, 9);
    expect(p.taken).toBe(0.12);
    expect(p.closed).toBe(true);
    expect(biteText(p.share)).toBe('-12%');
    p.reset();
    expect(p).toMatchObject({ count: 0, share: 0, taken: 0, closed: false });
  });
});

describe('the hold: the bar shows the health the boss had until the cork lands', () => {
  it('holds an amount for one target, adds the holds of that target, and lets the oldest go when a cork lands', () => {
    const h = new BiteHolds();
    h.hold(7, 60, 10);
    h.hold(7, 40, 10);
    h.hold(8, 5, 10);
    expect(h.heldOf(7, 10.1)).toBe(100);
    expect(h.heldOf(8, 10.1)).toBe(5);
    expect(h.heldOf(9, 10.1)).toBe(0);
    expect(h.land(7)).toBe(true);
    expect(h.heldOf(7, 10.1)).toBe(40);
    expect(h.land(7)).toBe(true);
    expect(h.land(7)).toBe(false);
    expect(h.heldOf(7, 10.1)).toBe(0);
  });

  it('holds only while the battle clock moves: a popup that stops it stops the hold, and a hold nobody landed ends by itself', () => {
    const h = new BiteHolds();
    h.hold(1, 50, 20);
    // The clock stands still for any real time at all.
    for (let i = 0; i < 1000; i++) expect(h.heldOf(1, 20)).toBe(50);
    expect(h.heldOf(1, 20 + BITE_HOLD_MAX)).toBe(50);
    expect(h.heldOf(1, 20 + BITE_HOLD_MAX + 0.01)).toBe(0);
    expect(h.size).toBe(0);
  });

  it('ignores a hold of nothing and forgets everything on clear', () => {
    const h = new BiteHolds();
    h.hold(1, 0, 0);
    h.hold(1, -5, 0);
    h.hold(1, Number.NaN, 0);
    expect(h.size).toBe(0);
    h.hold(1, 5, 0);
    h.clear();
    expect(h.heldOf(1, 0)).toBe(0);
  });

  it('keeps one registry per battle', () => {
    const a = {};
    const b = {};
    expect(biteHoldsOf(a)).toBe(biteHoldsOf(a));
    expect(biteHoldsOf(a)).not.toBe(biteHoldsOf(b));
  });
});

// ───────────────────────────── the scene ─────────────────────────────

describe('the gunner\'s scene: a poster slaps on, a cork goes through it', () => {
  interface Rig {
    scene: ReturnType<typeof makeWanted>;
    battle: { enemies: EnemyState[]; time: number; events: Emitter<BattleEvents> };
    front: Container;
    stage: { play: ReturnType<typeof vi.fn>; shake: ReturnType<typeof vi.fn>; detail: 0 | 1 | 2; reduced: boolean; rules: Record<string, object> };
    fx: { ps: { burst: ReturnType<typeof vi.fn> }; shockwave: ReturnType<typeof vi.fn> };
    holds: BiteHolds;
  }

  function rig(detail: 0 | 1 | 2 = 2): Rig {
    const fx = { ps: { burst: vi.fn() }, shockwave: vi.fn() };
    const stage = { play: vi.fn(), shake: vi.fn(), detail, reduced: false, fx, panOf: () => 0, stagger: () => 0, rules: { skill: {}, skillTick: {}, zone: {}, shoot: {}, heavyHit: {}, big: {} } };
    const front = new Container();
    const battle = { enemies: [] as EnemyState[], time: 0, events: new Emitter<BattleEvents>() };
    const env = { stage: stage as unknown as Stage, ctx: { layers: { fxFront: front, fxBack: new Container() } }, battle: battle as unknown as BattleApi } as unknown as SpEnv;
    return { scene: makeWanted(env), battle, front, stage, fx, holds: biteHoldsOf(battle) };
  }

  const foe = (uid: number, id: string, x: number, y: number, hp: number, shield = 0): EnemyState =>
    ({ uid, id, x, y, angle: 0, travelled: 300, hp, maxHp: 1000, shield, maxShield: 0 }) as unknown as EnemyState;

  const cat = { uid: 1, id: 'r_gunner', cell: 12 } as unknown as UnitState;

  function cast(r: Rig, e: EnemyState, over: Partial<{ mode: 'bite' | 'small'; share: number; taken: number; pool: number; amount: number; closed: boolean }> = {}): void {
    const mode = over.mode ?? 'bite';
    const data = { mode, targetUid: e.uid, x: e.x, y: e.y, share: 0.06, taken: 0.06, pool: 0.12, amount: 60, closed: false, ...over };
    r.scene.cast({ unit: cat, first: false, x: 360, y: 330, skill: 'wanted', data } as unknown as Parameters<Rig['scene']['cast']>[0]);
  }

  const bite = (r: Rig, e: EnemyState, over: Partial<BattleEvents['bite']> = {}): void =>
    r.battle.events.emit('bite', { unit: cat, enemy: e, amount: 60, share: 0.06, taken: 0.06, pool: 0.12, killed: false, ...over });

  /** One frame: `dt` real seconds, `battleDt` of the battle's clock. */
  const frame = (r: Rig, dt: number, battleDt: number): void => {
    r.battle.time += battleDt;
    r.scene.update?.(dt, battleDt);
  };

  const live = (r: Rig): { posters: number; corks: number; held: number } => (r.scene as unknown as { live(): { posters: number; corks: number; held: number } }).live();

  beforeEach(() => {
    stubDocument();
    setFxSettings({ tier: 'high', reducedMotion: false });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('holds the bar at the old health for the poster and the cork (about 0.4 s of battle time), then lets the bite fall out of it', () => {
    const r = rig();
    const boss = foe(5, 'boss_blender', 200, 45, 940);
    r.battle.enemies.push(boss);
    cast(r, boss);
    bite(r, boss);
    expect(r.holds.heldOf(5, r.battle.time)).toBe(60);
    expect(live(r)).toMatchObject({ posters: 1, held: 1 });
    // 1x: the battle clock and real time go together.
    for (let t = 0; t < BITE_LAND - 0.05; t += 1 / 60) frame(r, 1 / 60, 1 / 60);
    expect(r.holds.heldOf(5, r.battle.time)).toBe(60);
    for (let t = 0; t < 0.1; t += 1 / 60) frame(r, 1 / 60, 1 / 60);
    expect(r.holds.heldOf(5, r.battle.time)).toBe(0);
    expect(live(r).held).toBe(0);
  });

  it('stands still under a popup: the hold is not let go however long real time goes on, and the poster stays up', () => {
    const r = rig();
    const boss = foe(5, 'boss_blender', 200, 45, 940);
    r.battle.enemies.push(boss);
    cast(r, boss);
    bite(r, boss);
    frame(r, 1 / 60, 0.1);
    for (let i = 0; i < 600; i++) frame(r, 1 / 60, 0);
    expect(r.holds.heldOf(5, r.battle.time)).toBe(60);
    expect(live(r).posters).toBe(1);
  });

  it('at 3x is not through before its floor in real seconds: the cork needs about a quarter of a real second, not a third of the 0.4', () => {
    const r = rig();
    const boss = foe(5, 'boss_blender', 200, 45, 940);
    r.battle.enemies.push(boss);
    cast(r, boss);
    bite(r, boss);
    // 3x: each real frame is 3 frames of battle time. The battle clock is through 0.4 s after 8 frames (0.13 s real).
    for (let i = 0; i < 8; i++) frame(r, 1 / 60, 3 / 60);
    expect(r.holds.heldOf(5, r.battle.time)).toBe(60);
    for (let i = 0; i < 10; i++) frame(r, 1 / 60, 3 / 60);
    expect(r.holds.heldOf(5, r.battle.time)).toBe(0);
  });

  it('launches the cork from the gunner\'s tile to the middle of the poster, and the poster rides its target while the cork flies', () => {
    const r = rig();
    const boss = foe(5, 'boss_blender', 200, 45, 940);
    r.battle.enemies.push(boss);
    cast(r, boss);
    bite(r, boss);
    for (let t = 0; t < 0.2; t += 1 / 60) frame(r, 1 / 60, 1 / 60);
    const sprites = r.front.children.filter((c) => c instanceof Sprite && c.visible) as Sprite[];
    expect(live(r).corks).toBe(1);
    // The boss walks on: the poster follows, and the cork aims at where the poster is, not at where it was.
    boss.x = 260;
    boss.y = 45;
    frame(r, 1 / 60, 1 / 60);
    const poster = r.front.children.find((c) => c instanceof Container && !(c instanceof Sprite) && c.visible) as Container;
    expect(poster.position.x).toBeCloseTo(260, 3);
    expect(poster.position.y).toBeCloseTo(45, 3);
    expect(sprites.length).toBeGreaterThan(0);
  });

  it('keeps its place when its target dies in the same moment, and moves no enemy', () => {
    const r = rig();
    const boss = foe(5, 'boss_blender', 200, 45, 940);
    r.battle.enemies.push(boss);
    const before = { ...boss };
    cast(r, boss);
    bite(r, boss);
    boss.hp = 0;
    for (let t = 0; t < 0.3; t += 1 / 60) frame(r, 1 / 60, 1 / 60);
    const poster = r.front.children.find((c) => c instanceof Container && !(c instanceof Sprite) && c.visible) as Container;
    expect(poster.position.x).toBeCloseTo(200, 3);
    expect({ ...boss, hp: before.hp }).toEqual(before);
  });

  it('holds nothing for a bite that kills (nothing is left to show) and is through at once, when the bite event says so', () => {
    const r = rig();
    const boss = foe(5, 'boss_blender', 200, 45, 40);
    r.battle.enemies.push(boss);
    cast(r, boss);
    expect(r.holds.size).toBe(0);
    boss.hp = 0;
    bite(r, boss, { killed: true });
    expect(live(r)).toMatchObject({ posters: 1, corks: 0, held: 0 });
    // The hole is in the poster already: it only has to fall.
    const hole = r.front.children.filter((c) => c instanceof Container && !(c instanceof Sprite))[0] as Container;
    expect(hole.children.some((c) => c instanceof Sprite && c.visible)).toBe(true);
  });

  it('lets the bite of a second gunner on the same target ride on the first cork: the bar holds both, and both are let go together', () => {
    const r = rig();
    const boss = foe(5, 'boss_blender', 200, 45, 880);
    r.battle.enemies.push(boss);
    // Gunner A's cast was shown; gunner B's, in the same breath, lost to the stage rule: the scene is only told of B's bite.
    cast(r, boss, { share: 0.06, taken: 0.06 });
    bite(r, boss, { amount: 60, taken: 0.06 });
    bite(r, boss, { amount: 60, taken: 0.12 });
    expect(r.holds.heldOf(5, r.battle.time)).toBe(120);
    expect(live(r).held).toBe(2);
    for (let t = 0; t < 0.5; t += 1 / 60) frame(r, 1 / 60, 1 / 60);
    expect(r.holds.heldOf(5, r.battle.time)).toBe(0);
    expect(r.holds.size).toBe(0);
  });

  it('puts both eggs and the seal on the poster when the second bite empties the pool, even though the cast it came from was the first bite', () => {
    const r = rig();
    const boss = foe(5, 'boss_blender', 200, 45, 880);
    r.battle.enemies.push(boss);
    cast(r, boss, { taken: 0.06, closed: false });
    bite(r, boss, { taken: 0.06 });
    bite(r, boss, { taken: 0.12 });
    for (let t = 0; t < 0.5; t += 1 / 60) frame(r, 1 / 60, 1 / 60);
    const art = wantedArt();
    const poster = r.front.children.find((c) => c instanceof Container && !(c instanceof Sprite) && c.visible) as Container;
    const sprites = poster.children as Sprite[];
    const eggs = sprites.filter((s) => s.texture === art.eggFull || s.texture === art.eggEmpty);
    expect(eggs).toHaveLength(2);
    expect(eggs.every((e) => e.texture === art.eggFull)).toBe(true);
    const seal = sprites.find((s) => s.texture === art.stamp) as Sprite;
    expect(seal.visible).toBe(true);
  });

  it('shows one filled egg after a first bite and no seal; the seal comes with the bite that closes the case', () => {
    const r = rig();
    const boss = foe(5, 'boss_blender', 200, 45, 940);
    r.battle.enemies.push(boss);
    cast(r, boss, { taken: 0.06, closed: false });
    bite(r, boss);
    for (let t = 0; t < 0.5; t += 1 / 60) frame(r, 1 / 60, 1 / 60);
    const art = wantedArt();
    const first = r.front.children.find((c) => c instanceof Container && !(c instanceof Sprite) && c.visible) as Container;
    const eggs = (first.children as Sprite[]).filter((s) => s.texture === art.eggFull || s.texture === art.eggEmpty);
    expect(eggs.map((e) => e.texture === art.eggFull)).toEqual([true, false]);
    expect((first.children as Sprite[]).find((s) => s.texture === art.stamp)?.visible).toBe(false);
  });

  it('a hand-sized poster for the small shot: smaller than a bite\'s, no eggs, no seal, nothing held, and the cork still flies', () => {
    const big = rig();
    const small = rig();
    const bossB = foe(5, 'boss_blender', 200, 45, 940);
    const plain = foe(6, 'cucumber', 300, 45, 500);
    big.battle.enemies.push(bossB);
    small.battle.enemies.push(plain);
    cast(big, bossB);
    cast(small, plain, { mode: 'small', share: 0.2, taken: 0, pool: 0, amount: 100 });
    expect(small.holds.size).toBe(0);
    const scaleOf = (r: Rig): number => (r.front.children.find((c) => c instanceof Container && !(c instanceof Sprite)) as Container).scale.x;
    // After the slap has settled the small poster is well under half the size of a bite's.
    for (let t = 0; t < 0.15; t += 1 / 60) {
      frame(big, 1 / 60, 1 / 60);
      frame(small, 1 / 60, 1 / 60);
    }
    expect(scaleOf(small)).toBeLessThan(scaleOf(big) * 0.6);
    const art = wantedArt();
    const sp = small.front.children.find((c) => c instanceof Container && !(c instanceof Sprite)) as Container;
    const eggs = (sp.children as Sprite[]).filter((s) => s.texture === art.eggFull || s.texture === art.eggEmpty);
    expect(eggs.every((e) => !e.visible)).toBe(true);
    for (let t = 0; t < 0.3; t += 1 / 60) frame(small, 1 / 60, 1 / 60);
    expect((sp.children as Sprite[]).find((s) => s.texture === art.stamp)?.visible).toBe(false);
    expect(small.fx.shockwave).toHaveBeenCalled();
  });

  it('slaps the poster onto a boss less big than onto a plain enemy: the boss\'s face stays in sight while the cork flies', () => {
    const ratio = (id: string, hp: number): number => {
      const r = rig();
      const target = foe(5, id, 300, 200, hp);
      r.battle.enemies.push(target);
      cast(r, target);
      const poster = (): Container => r.front.children.find((c) => c instanceof Container && !(c instanceof Sprite)) as Container;
      const first = poster().scale.x;
      for (let t = 0; t < 0.2; t += 1 / 60) frame(r, 1 / 60, 1 / 60);
      return first / poster().scale.x;
    };
    expect(ratio('cucumber', 500)).toBeGreaterThan(1.75);
    expect(ratio('boss_blender', 940)).toBeLessThan(1.6);
    expect(ratio('boss_blender', 940)).toBeGreaterThan(1.3);
  });

  it('puts its pictures above the night of the star archer (a poster is not part of the board the night dims) and still under the particles', () => {
    const r = rig();
    const night = new Sprite(Texture.WHITE);
    night.label = NIGHT_LABEL;
    const particles = new Container();
    r.front.addChild(night, particles);
    const target = foe(5, 'boss_blender', 300, 200, 940);
    r.battle.enemies.push(target);
    cast(r, target);
    const order = r.front.children;
    expect(order.indexOf(night)).toBe(0);
    expect(order.indexOf(particles)).toBe(order.length - 1);
    expect(order.length).toBeGreaterThan(3);
  });

  it('listens to the battle\'s bites while it lives and to nothing once it is destroyed (the handler is really released)', () => {
    const r = rig();
    const handlers = (): number => (r.battle.events as unknown as { map: Map<string, unknown[]> }).map.get('bite')?.length ?? 0;
    expect(handlers()).toBe(1);
    r.scene.destroy();
    expect(handlers()).toBe(0);
  });

  it('tells a target it cannot find to nobody: no poster picture of an enemy it does not have, no hold, nothing thrown', () => {
    const r = rig();
    const ghost = foe(99, 'cucumber', 100, 100, 500);
    expect(() => cast(r, ghost)).not.toThrow();
    expect(r.holds.size).toBe(0);
    expect(() => bite(r, ghost)).not.toThrow();
  });

  it('clears at once on victory, defeat and the battle\'s end (holds let go, every piece hidden) and can be used again; destroy frees everything and listens to nothing', () => {
    const r = rig();
    const boss = foe(5, 'boss_blender', 200, 45, 940);
    r.battle.enemies.push(boss);
    cast(r, boss);
    bite(r, boss);
    for (let t = 0; t < 0.15; t += 1 / 60) frame(r, 1 / 60, 1 / 60);
    expect(r.holds.size).toBe(1);
    r.scene.clear();
    expect(r.holds.size).toBe(0);
    expect(live(r)).toEqual({ posters: 0, corks: 0, held: 0 });
    for (const c of r.front.children) expect(c.visible).toBe(false);
    cast(r, boss);
    expect(live(r).posters).toBe(1);
    r.scene.destroy();
    expect(r.front.children).toHaveLength(0);
    // After destroy a bite of the battle is nobody's business.
    expect(() => bite(r, boss)).not.toThrow();
    expect(r.holds.size).toBe(0);
  });

  it('does not grow without end: forty casts in a row reuse at most four posters, each with its cork and its trail', () => {
    const r = rig();
    for (let i = 0; i < 40; i++) {
      const e = foe(i + 1, 'boss_blender', 200, 45, 940);
      r.battle.enemies = [e];
      cast(r, e);
      bite(r, e);
      for (let t = 0; t < 0.25; t += 1 / 60) frame(r, 1 / 60, 1 / 60);
    }
    expect(r.front.children.length).toBeLessThanOrEqual(4 * 3);
    // A shot cut off by a newer one lets its hold go: the registry is never left with holds nobody will land.
    expect(r.holds.size).toBeLessThanOrEqual(4);
  });

  it('rations its sound and its camera nudge through the stage\'s rules and its own gate, and shakes nothing under reduced motion', () => {
    const r = rig();
    const boss = foe(5, 'boss_blender', 200, 45, 940);
    r.battle.enemies.push(boss);
    cast(r, boss);
    for (let t = 0; t < 0.5; t += 1 / 60) frame(r, 1 / 60, 1 / 60);
    const ids = r.stage.play.mock.calls.map((c) => c[1] as string);
    expect(ids).toContain('sp_poster_slap');
    expect(ids).toContain('sp_cork_pop');
    expect(ids).toContain('sp_poster_hole');
    // All three are signatures: the skill's rule, which the fight's busy second cannot thin.
    for (const id of ['sp_poster_slap', 'sp_cork_pop', 'sp_poster_hole']) expect(r.stage.play.mock.calls.find((c) => c[1] === id)?.[0]).toBe(r.stage.rules.skill);
    expect(r.stage.shake).toHaveBeenCalledWith(Trauma.t1, Gate.spShake, expect.any(Number));
    const calm = rig();
    calm.stage.reduced = true;
    const boss2 = foe(5, 'boss_blender', 200, 45, 940);
    calm.battle.enemies.push(boss2);
    cast(calm, boss2);
    for (let t = 0; t < 0.5; t += 1 / 60) frame(calm, 1 / 60, 1 / 60);
    expect(calm.stage.shake).not.toHaveBeenCalled();
  });

  it('thins its sparks by the quality tier: fewer at the low tier than at the high one', () => {
    const counts: number[] = [];
    for (const detail of [0, 2] as const) {
      const r = rig(detail);
      const boss = foe(5, 'boss_blender', 200, 45, 940);
      r.battle.enemies.push(boss);
      cast(r, boss);
      for (let t = 0; t < 0.5; t += 1 / 60) frame(r, 1 / 60, 1 / 60);
      counts.push(r.fx.ps.burst.mock.calls.reduce((n, c) => n + ((c[3] as { count?: number } | undefined)?.count ?? 1), 0));
    }
    expect(counts[0]).toBeLessThan(counts[1] as number);
  });
});

// ───────────────────────────── the holstered mark ─────────────────────────────

describe('the "holstered" mark: a gunner with a full gauge that is saving its shot for the elite or boss that is coming', () => {
  const unit = (sp: number, blocked = false): UnitState => ({ uid: 1, id: 'r_gunner', cell: 12, sp, blocked }) as unknown as UnitState;

  beforeEach(stubDocument);
  afterEach(() => vi.unstubAllGlobals());

  it('is the gunner\'s own rule on the ring\'s hook, and has its picture in the typed table', () => {
    expect(RING_MARK_RULES.wanted).toBe(holsterMark);
    expect(typeof MARK_DRAW.holstered).toBe('function');
    expect(markTexture('holstered')).toBeInstanceOf(Texture);
    // No other skill's ring wears it.
    for (const id of Object.keys(RING_MARK_RULES)) if (id !== 'wanted') expect(RING_MARK_RULES[id as keyof typeof RING_MARK_RULES]).not.toBe(holsterMark);
  });

  it('is worn by a full gauge in the wave before an elite or a boss, and not by a gauge that is still filling', () => {
    const sim = newSim();
    quietWave(sim);
    startWave(sim, 3);
    expect(sim.scriptOf(4).kind).not.toBe('normal');
    expect(holdingFire(sim)).toBe(true);
    expect(holsterMark(unit(1), sim)).toBe('holstered');
    expect(holsterMark(unit(0.99), sim)).toBeNull();
    expect(holsterMark(unit(0), sim)).toBeNull();
    // A wave that is followed by an ordinary one: no mark, a full gauge is waiting for an enemy, not saving the shot.
    startWave(sim, 5);
    expect(holdingFire(sim)).toBe(false);
    expect(holsterMark(unit(1), sim)).toBeNull();
  });

  it('is worn in an elite or boss wave until the target has come out, then goes', () => {
    const sim = newSim();
    quietWave(sim);
    startWave(sim, 4);
    sim.spawnIds.length = 0;
    sim.spawnTimes.length = 0;
    sim.spawnIdx = 0;
    expect(sim.boss).toBeNull();
    expect(holsterMark(unit(1), sim)).toBe('holstered');
    advance(sim, 0.9);
    expect(holsterMark(unit(1), sim)).toBe('holstered');
    advance(sim, 0.2);
    expect(sim.boss).not.toBeNull();
    expect(holsterMark(unit(1), sim)).toBeNull();
    // And it stays gone when the target has died: the shot is not saved for a boss that is already out.
    (sim.boss as SimEnemy).hp = 0;
    advance(sim, 2);
    expect(holsterMark(unit(1), sim)).toBeNull();
  });

  it('agrees with the simulation\'s own rule at every tick of whole runs in every mode, so the player reads "it is waiting on purpose" exactly when it is', () => {
    const plan: Array<[BattleInit['mode'], number]> = [['chapter', 700], ['daily', 500], ['tutorial', 300], ['gold', 400], ['endless', 700]];
    let held = 0;
    let free = 0;
    for (const [mode, seconds] of plan) {
      const init = initOf({ mode });
      const sim = newSim({ mode });
      const bot = createBot('synergy', init.seed + 7);
      const every = Math.round(0.25 / TICK);
      let guard = 0;
      const limit = Math.round(seconds / TICK);
      for (let tick = 0; tick < limit && sim.phase !== 'won' && sim.phase !== 'lost'; tick++) {
        if (sim.phase === 'choice') {
          bot.choose(sim);
          if (sim.phase === 'choice' && ++guard > 8) {
            if (sim.pending?.kind === 'summon') sim.pickSummon(0);
            else sim.pickRelic(0);
            guard = 0;
          }
          continue;
        }
        if (tick % every === 0) bot.act(sim);
        sim.step(TICK);
        const theirs = simHoldingFire(sim);
        if (holdingFire(sim) !== theirs) throw new Error(`${mode}: wave ${sim.wave} at ${sim.time.toFixed(2)} s: the view says ${holdingFire(sim)}, the simulation ${theirs}`);
        if (theirs) held++;
        else free++;
      }
    }
    // Not a vacuous run: both answers came up many times.
    expect(held).toBeGreaterThan(1000);
    expect(free).toBeGreaterThan(1000);
  });

  it('agrees with the simulation right after every wave start and a second into every special wave, in every mode', () => {
    const plan: Array<[BattleInit['mode'], number]> = [['chapter', 24], ['daily', 16], ['tutorial', 8], ['gold', 8], ['endless', 40]];
    for (const [mode, waves] of plan) {
      const sim = newSim({ mode });
      for (let wave = 1; wave <= waves; wave++) {
        startWave(sim, wave);
        sim.spawnIds.length = 0;
        sim.spawnTimes.length = 0;
        sim.spawnIdx = 0;
        expect(holdingFire(sim), `${mode} wave ${wave} at its start`).toBe(simHoldingFire(sim));
        if (sim.waveKind === 'normal') continue;
        advance(sim, 1.05);
        expect(holdingFire(sim), `${mode} wave ${wave} once the target is out`).toBe(simHoldingFire(sim));
        expect(holdingFire(sim)).toBe(false);
      }
    }
  });

  it('is last in the ring\'s order of marks: a stopped gunner shows its pause, and the mark beats the still star of reduced motion', () => {
    const sim = newSim();
    quietWave(sim);
    startWave(sim, 3);
    expect(ringMarkOf('wanted', unit(1, true), sim, false)).toBe('stopped');
    expect(ringMarkOf('wanted', unit(1), sim, false)).toBe('holstered');
    expect(ringMarkOf('wanted', unit(1), sim, true)).toBe('holstered');
    // A gunner that is not saving anything: the star under reduced motion, nothing otherwise.
    startWave(sim, 5);
    expect(ringMarkOf('wanted', unit(1), sim, true)).toBe('ready');
    expect(ringMarkOf('wanted', unit(1), sim, false)).toBeNull();
    // The other cats' rings never wear it.
    startWave(sim, 3);
    expect(ringMarkOf('shove', unit(1), sim, false)).toBeNull();
  });

  it('does not allocate: the answer of a wave is worked out once and the rule only compares numbers after that', () => {
    const sim = newSim();
    quietWave(sim);
    startWave(sim, 3);
    const spy = vi.spyOn(sim, 'previewWave');
    for (let i = 0; i < 500; i++) holsterMark(unit(1), sim);
    expect(spy.mock.calls.length).toBeLessThanOrEqual(1);
    startWave(sim, 7);
    for (let i = 0; i < 500; i++) holsterMark(unit(1), sim);
    expect(spy.mock.calls.length).toBeLessThanOrEqual(2);
  });
});

// ───────────────────────────── the boss bar, built for real ─────────────────────────────

describe('the boss bar with the gunner\'s bite', () => {
  const layout = { w: 720, h: 1280, safeTop: 0, safeBottom: 0, fieldX: 0, fieldY: 200, topH: 168, bottomH: 452 };

  interface World {
    sim: Sim;
    boss: SimEnemy;
    bar: BossBar;
    scene: ReturnType<typeof makeWanted>;
    holds: BiteHolds;
    hits: number[];
    /** A window fed with the `hit` events alone, from the moment the bar was made: what the bar's firepower figure must equal. */
    replay: () => DamageWindow;
    /** One frame of the view: the simulation steps, the scene and the bar are updated (the dispatcher's job is done here by hand). */
    frame: (n?: number) => void;
    /** A gunner of this cell is full and asked to fire: casts in the next tick. */
    fire: (cell: number) => void;
    hpBar: { value: number; given: number[] };
    est: () => string;
    /** The strip's bite marks (null until the first bite is shown). */
    marks: () => Container | null;
    /** The event types the bar subscribed to. */
    listened: string[];
  }

  /** An elite wave with the elite out and standing still, with a bar up for it and a scene listening, the way the director does. */
  function world(wave = 4, over: Partial<BattleInit> = {}): World {
    const sim = newSim(over);
    quietWave(sim);
    startWave(sim, wave);
    sim.spawnIds.length = 0;
    sim.spawnTimes.length = 0;
    sim.spawnIdx = 0;
    advance(sim, 1.05);
    const boss = sim.boss as SimEnemy;
    boss.frozen = true;
    boss.capTokens = Infinity;
    const offs: Array<() => void> = [];
    const listened: string[] = [];
    const t0 = sim.time;
    const env = {
      battle: sim,
      layout: () => layout,
      on: (emitter: { on(type: string, fn: (p: never) => void): () => void }, type: string, fn: (p: never) => void) => {
        listened.push(type);
        offs.push(emitter.on(type, fn));
      },
      openCodex: () => undefined,
    };
    const top = { setBossMode: () => undefined };
    const bar = new BossBar(env as never, top as never);
    const stage = { play: vi.fn(), shake: vi.fn(), detail: 2, reduced: false, fx: { ps: { burst: vi.fn() }, shockwave: vi.fn() }, panOf: () => 0, stagger: () => 0, rules: { skill: {}, skillTick: {}, zone: {}, shoot: {}, heavyHit: {}, big: {} } };
    const spEnv = { stage: stage as unknown as Stage, ctx: { layers: { fxFront: new Container(), fxBack: new Container() } }, battle: sim } as unknown as SpEnv;
    const scene = makeWanted(spEnv);
    // The dispatcher's job: the stage rule lets one cast effect through per quarter second (sim time stands in for real time here), and only
    // a cast that was shown reaches the scene. The scene listens to the bites of the battle itself.
    let lastShown = -1;
    sim.events.on('spCast', (e) => {
      if (e.skill !== 'wanted' || (lastShown >= 0 && sim.time - lastShown < 0.25)) return;
      lastShown = sim.time;
      scene.cast(e as Parameters<typeof scene.cast>[0]);
    });
    const hits: number[] = [];
    const log: Array<[number, number]> = [];
    sim.events.on('hit', ({ amount }) => {
      hits.push(amount);
      log.push([sim.time, amount]);
    });
    let last = sim.time;
    const frame = (n = 1): void => {
      for (let i = 0; i < n; i++) {
        sim.step(TICK);
        const battleDt = sim.time - last;
        last = sim.time;
        scene.update?.(TICK, battleDt);
        bar.update();
      }
    };
    const internals = bar as unknown as { hp: { value: number; given: number[] }; estT: { text: string }; marks: { root: Container } | null };
    return {
      sim, boss, bar, scene, holds: biteHoldsOf(sim), hits, frame,
      replay: () => {
        const ref = new DamageWindow();
        ref.reset(t0);
        for (const [t, amount] of log) ref.record(t, amount);
        return ref;
      },
      fire: (cell) => {
        const u = sim.units[cell];
        if (!u) throw new Error('no cat');
        u.sp = 1;
        u.spCheckAt = 0;
      },
      hpBar: internals.hp,
      est: () => internals.estT.text,
      marks: () => internals.marks?.root ?? null,
      listened,
    };
  }

  const parts = (w: World): Sprite[] => (w.marks()?.children ?? []) as Sprite[];
  const label = (w: World): { text: string; visible: boolean } | undefined =>
    (w.marks()?.children as Array<Container & { text?: string }> | undefined)?.find((c) => typeof c.text === 'string') as { text: string; visible: boolean } | undefined;

  beforeEach(() => {
    stubDocument();
    setFxSettings({ tier: 'high', reducedMotion: false });
  });
  afterEach(() => vi.unstubAllGlobals());

  /** Four seconds of ordinary fire on the boss, so the bar has a firepower figure and an estimate. */
  function warm(w: World): void {
    for (let i = 0; i < 4 * 60; i++) {
      if (i % 12 === 0) damageEnemy(w.sim, w.boss, 20, 'magic', null, false, null);
      w.frame();
    }
    expect(w.est()).toMatch(/^hud\.est\|\d+$/);
  }

  it('holds the bar at the old health through the cast tick, then drops it by the bite when the cork lands, with the estimate falling only by the bitten health', () => {
    const w = world();
    put(w.sim, 12, 'r_gunner', 0);
    warm(w);
    const max = w.boss.maxHp;
    const window = (w.bar as unknown as { window: { rate(now: number): number } }).window;
    const rate = window.rate(w.sim.time);
    expect(rate).toBeGreaterThan(0);
    expect(rate).toBeCloseTo(w.replay().rate(w.sim.time), 9);
    const hitsBefore = w.hits.length;
    const barBefore = w.hpBar.value;
    const estBefore = w.est();
    const hpBefore = w.boss.hp;
    w.fire(12);
    w.frame();
    // The simulation took the bite in this tick...
    expect(w.boss.hp).toBeCloseTo(hpBefore - 0.06 * max, 6);
    // ...the bar did not show it, and the estimate did not move; and the bite was no `hit`, so the firepower is the same figure.
    expect(w.hpBar.value).toBeCloseTo(barBefore, 9);
    expect(w.est()).toBe(estBefore);
    expect(w.hits.length).toBe(hitsBefore);
    expect(window.rate(w.sim.time)).toBeCloseTo(w.replay().rate(w.sim.time), 9);
    expect(w.holds.heldOf(w.boss.uid, w.sim.time)).toBeCloseTo(0.06 * max, 6);
    // Frames go by while the poster goes up and the cork flies: still held.
    w.frame(Math.round(0.3 / TICK));
    expect(w.hpBar.value).toBeCloseTo(barBefore, 9);
    // The cork lands: the bar drops by exactly the bite (the share of the whole bar), once.
    w.frame(Math.round(0.2 / TICK));
    expect(w.holds.heldOf(w.boss.uid, w.sim.time)).toBe(0);
    expect(w.hpBar.value).toBeCloseTo(barBefore - 0.06 * max / (w.boss.maxHp + w.boss.maxShield), 6);
    const after = w.est();
    const seconds = (s: string): number => Number((s.match(/\|(\d+)$/) as RegExpMatchArray)[1]);
    // The estimate fell by what the bitten health was worth at the firepower there is: about 0.06 x max / rate seconds, give or take the rounding up.
    const fell = seconds(estBefore) - seconds(after);
    expect(fell).toBeGreaterThanOrEqual(Math.floor((0.06 * max) / rate) - 1);
    expect(fell).toBeLessThanOrEqual(Math.ceil((0.06 * max) / rate) + 1);
  });

  it('writes "-6%" from the event and fills one egg on the strip, and no seal; the second bite fills the second egg and stamps the case closed', () => {
    const w = world();
    put(w.sim, 12, 'r_gunner', 0);
    put(w.sim, 11, 'r_gunner', 0);
    warm(w);
    const art = wantedArt();
    expect(label(w)).toBeUndefined();
    w.fire(12);
    w.frame(Math.round(0.6 / TICK));
    expect(label(w)?.text).toBe('-6%');
    expect(label(w)?.visible).toBe(true);
    const all = parts(w);
    const eggs = all.filter((c) => c.texture === art.eggFull || c.texture === art.eggEmpty);
    expect(eggs.map((e) => e.texture === art.eggFull)).toEqual([true, false]);
    expect(all.find((c) => c.texture === art.lock)?.visible).toBe(false);
    // The second gunner, some seconds later.
    w.frame(Math.round(2 / TICK));
    w.fire(11);
    w.frame(Math.round(0.6 / TICK));
    expect(label(w)?.text).toBe('-6%');
    expect(eggs.every((e) => e.texture === art.eggFull)).toBe(true);
    expect(all.find((c) => c.texture === art.lock)?.visible).toBe(true);
    expect(w.boss.bountyTaken).toBeCloseTo(0.12 * w.boss.maxHp, 6);
  });

  it('stamps the seal on a corner of the boss\'s portrait, small and tilted, as a padlock: not over its face and not a second tick next to the estimate\'s', () => {
    const w = world();
    put(w.sim, 12, 'r_gunner', 0);
    put(w.sim, 11, 'r_gunner', 0);
    warm(w);
    w.fire(12);
    w.frame(Math.round(0.6 / TICK));
    w.frame(Math.round(2 / TICK));
    w.fire(11);
    w.frame(Math.round(0.6 / TICK));
    const art = wantedArt();
    const seal = parts(w).find((c) => c.texture === art.lock) as Sprite;
    expect(seal.visible).toBe(true);
    // Not the poster's tick: the strip's seal is its own picture.
    expect(art.lock).not.toBe(art.stamp);
    // The portrait is 78 px across and centred on x = 6, y = about half the strip's height: the seal is a corner of it, well under half its size.
    const shown = STAMP_SHOWN;
    expect(shown).toBeGreaterThan(24);
    expect(shown).toBeLessThanOrEqual(36);
    expect(seal.x).toBeGreaterThan(6 + 12);
    expect(seal.x + shown / 2).toBeLessThan(54);
    expect(seal.rotation).not.toBe(0);
    const eggs = parts(w).filter((c) => c.texture === art.eggFull || c.texture === art.eggEmpty);
    // It does not sit on an egg either.
    for (const egg of eggs) expect(Math.hypot(seal.x - egg.x, seal.y - egg.y)).toBeGreaterThan(shown / 2 + 6);
  });

  it('two gunners in one tick are one fall, one "-12%", two eggs and the seal: one cork, and a hold for each bite', () => {
    const w = world();
    put(w.sim, 12, 'r_gunner', 0);
    put(w.sim, 11, 'r_gunner', 0);
    warm(w);
    const barBefore = w.hpBar.value;
    w.fire(12);
    w.fire(11);
    w.frame();
    expect(w.boss.bountyTaken).toBeCloseTo(0.12 * w.boss.maxHp, 6);
    // Both bites are held back, though only the first gunner's cast was shown (the second lost to the stage rule): the second bite rides on
    // the first cork.
    expect(w.holds.size).toBe(2);
    expect(w.holds.heldOf(w.boss.uid, w.sim.time)).toBeCloseTo(0.12 * w.boss.maxHp, 6);
    expect(w.hpBar.value).toBeCloseTo(barBefore, 9);
    w.frame(Math.round(0.7 / TICK));
    expect(w.holds.size).toBe(0);
    expect(label(w)?.text).toBe('-12%');
    expect(w.hpBar.value).toBeCloseTo(barBefore - 0.12 * w.boss.maxHp / (w.boss.maxHp + w.boss.maxShield), 6);
  });

  it('shows a bite nobody held the bar for at once, with its label: a bite whose cast the stage rule dropped', () => {
    const w = world();
    put(w.sim, 12, 'r_gunner', 0);
    warm(w);
    // This time the dispatcher drops the cast (the scene is told of nothing).
    const sim = w.sim;
    const dropped = vi.spyOn(w.scene, 'cast').mockImplementation(() => undefined);
    const barBefore = w.hpBar.value;
    w.fire(12);
    w.frame(2);
    dropped.mockRestore();
    expect(w.holds.size).toBe(0);
    expect(w.hpBar.value).toBeCloseTo(barBefore - 0.06 * w.boss.maxHp / (w.boss.maxHp + w.boss.maxShield), 6);
    expect(label(w)?.text).toBe('-6%');
    expect(sim.boss).toBe(w.boss);
  });

  it('is exactly the bar of today in a battle without skills: it listens for no bite, and never makes the poster pictures or the strip marks', () => {
    const w = world(4, { sp: false });
    expect(w.listened).not.toContain('bite');
    expect(w.listened).toContain('hit');
    for (let i = 0; i < 120; i++) w.frame();
    expect(w.marks()).toBeNull();
    // With skills on the same bar listens, and still makes the marks only when the first bite is shown.
    const on = world();
    expect(on.listened).toContain('bite');
    expect(on.marks()).toBeNull();
  });

  it('forgets the bites when the next boss comes: no eggs, no seal, no label on a new strip', () => {
    const w = world();
    put(w.sim, 12, 'r_gunner', 0);
    warm(w);
    w.fire(12);
    w.frame(Math.round(0.7 / TICK));
    expect(label(w)?.text).toBe('-6%');
    (w.bar as unknown as { hide(animate: boolean): void }).hide(false);
    expect(parts(w).filter((c) => c.visible && c.texture !== Texture.EMPTY && c.texture !== Texture.WHITE).length).toBe(0);
    expect(label(w)?.visible).toBe(false);
  });

  it('never leaves the bar holding health the boss does not have: a hold nobody landed ends by itself, and a cleared scene lets go of it', () => {
    const w = world();
    put(w.sim, 12, 'r_gunner', 0);
    warm(w);
    w.fire(12);
    w.frame();
    expect(w.holds.heldOf(w.boss.uid, w.sim.time)).toBeGreaterThan(0);
    w.scene.clear();
    w.frame();
    expect(w.holds.heldOf(w.boss.uid, w.sim.time)).toBe(0);
    // And with nobody to land it at all, the registry's own limit applies.
    const lone = new BiteHolds();
    lone.hold(1, 10, 0);
    expect(lone.heldOf(1, BITE_HOLD_MAX + 1)).toBe(0);
  });
});
