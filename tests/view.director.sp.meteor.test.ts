import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Container, Sprite, Texture } from 'pixi.js';

const flash = vi.hoisted(() => vi.fn(() => true));
vi.mock('@/audio', () => ({
  attackSfx: () => ({ id: 'x', volume: 1, pitch: 1 }),
  critSfx: () => ({ id: 'x', volume: 1, pitch: 1 }),
  foeHitSfx: () => ({ id: 'x', volume: 1, pitch: 1 }),
  impactSfx: () => ({ id: 'x', volume: 1, pitch: 1 }),
  audio: { play: () => undefined },
}));
vi.mock('@/core/assets', async (original) => {
  const { stubTex } = await import('./textureStub');
  return { ...(await original<typeof import('@/core/assets')>()), hasTex: () => true, tex: stubTex };
});
vi.mock('@/fx', async (original) => ({
  ...(await original<typeof import('@/fx')>()),
  fxTex: () => ({ id: 'disc', texture: Texture.WHITE, w: 256, h: 256, ax: 0.5, ay: 0.5 }),
  screenFx: { flash },
}));

import { Emitter } from '@/core/events';
import { Trauma } from '@/fx';
import { setFxSettings } from '@/fx/settings';
import type { BattleApi, BattleEvents, SpMeteorData, StrikePoint, UnitState } from '@/game/api';
import { DUSK_ALPHA, DUSK_LABEL, FALL_ANGLE, FALL_BATTLE, FALL_DIST, FALL_REAL, FLASH_KEY, PULSE_EVERY, RING_KEY, ROCK_KEY, makeMeteor, resetRim, rimArt } from '@/view/director/sp/meteor';
import { tex } from '@/core/assets';
import { NIGHT_LABEL, type SpEnv } from '@/view/director/sp/types';
import { Gate, type Stage } from '@/view/director/stage';

type Cast = Parameters<ReturnType<typeof makeMeteor>['cast']>[0];
interface Live {
  warns: Array<{ id: number; k: number; p: number; x: number; y: number; headX: number; headY: number }>;
  landings: number;
  waves: number;
  craters: Array<{ id: number; phase: string }>;
  dusk: number;
  waiting: number;
}

const IMPACT = { x: 400, y: 300 };
const unit = (): UnitState => ({ uid: 1, id: 'm_cosmo', cell: 12 }) as unknown as UnitState;

interface Scene {
  env: SpEnv;
  scene: ReturnType<typeof makeMeteor>;
  battle: { time: number; enemies: never[]; events: Emitter<BattleEvents> };
  ctx: { speed: number };
  fx: { ps: { burst: ReturnType<typeof vi.fn> }; shockwave: ReturnType<typeof vi.fn> };
  stage: {
    play: ReturnType<typeof vi.fn>;
    later: ReturnType<typeof vi.fn>;
    shake: ReturnType<typeof vi.fn>;
    detail: 0 | 1 | 2;
    reduced: boolean;
    rules: Record<string, object>;
  };
  back: Container;
  front: Container;
  live: () => Live;
  /** How many listeners the scene has on the battle's events right now. */
  listeners: () => number;
  tick: (battleDt: number, dt?: number) => void;
}

function build(detail: 0 | 1 | 2 = 1, reduced = false): Scene {
  const fx = { ps: { burst: vi.fn() }, shockwave: vi.fn() };
  const stage = { play: vi.fn(), later: vi.fn(() => ({ kill: vi.fn() })), shake: vi.fn(), detail, reduced, fx, panOf: () => 0, stagger: () => 0, rules: { skill: {}, skillTick: {}, big: {}, zone: {}, heavyHit: {} } };
  const back = new Container();
  const front = new Container();
  const events = new Emitter<BattleEvents>();
  // Count the listeners that are on: a destroyed scene must have given every one back.
  const counter = { active: 0 };
  const subscribe = events.on.bind(events) as (type: keyof BattleEvents, fn: never) => () => void;
  events.on = ((type: keyof BattleEvents, fn: never) => {
    counter.active++;
    const off = subscribe(type, fn);
    return () => {
      counter.active--;
      off();
    };
  }) as typeof events.on;
  const battle = { time: 3, enemies: [] as never[], events };
  const ctx = { layers: { fxBack: back, fxFront: front }, speed: 1 };
  const env = { stage: stage as unknown as Stage, ctx, battle: battle as unknown as BattleApi } as unknown as SpEnv;
  const scene = makeMeteor(env);
  return {
    env,
    scene,
    battle,
    ctx,
    fx,
    stage,
    back,
    front,
    live: () => (scene as unknown as { live(): Live }).live(),
    listeners: () => counter.active,
    tick: (battleDt, dt = battleDt) => {
      battle.time += battleDt;
      scene.update?.(dt, battleDt);
    },
  };
}

function cast(s: Scene, meteorId = 1, over: Partial<SpMeteorData> = {}): Cast {
  const data: SpMeteorData = {
    meteorId,
    impactX: IMPACT.x,
    impactY: IMPACT.y,
    onLaser: false,
    at: s.battle.time,
    warn: 1,
    innerRadius: 90,
    outerRadius: 200,
    outerDelay: 0.25,
    craterRadius: 100,
    craterLife: 4,
    ...over,
  };
  return { unit: unit(), first: false, x: 306, y: 330, skill: 'meteor', data } as unknown as Cast;
}

const pts = (n: number): StrikePoint[] => Array.from({ length: n }, (_, i) => ({ uid: i + 1, x: 380 + i * 8, y: 300 }));
const land = (s: Scene, ring: 'inner' | 'outer', meteorId = 1, points: StrikePoint[] = []): void =>
  s.battle.events.emit('meteorLand', { meteorId, unit: unit(), ring, x: IMPACT.x, y: IMPACT.y, radius: ring === 'inner' ? 90 : 200, points });
const end = (s: Scene, meteorId = 1): void => s.battle.events.emit('craterEnd', { meteorId, unit: unit(), x: IMPACT.x, y: IMPACT.y, radius: 100 });
/** Run the battle's clock to `t` seconds after the cast in 1/60 frames (at `speed`x: each frame carries `speed`/60 battle seconds). */
function run(s: Scene, cast0: number, t: number, speed = 1): void {
  while (s.battle.time < cast0 + t - 1e-9) s.tick(Math.min(speed / 60, cast0 + t - s.battle.time), 1 / 60);
}

describe('the cosmo cat\'s meteor: the warning', () => {
  beforeEach(() => {
    const ctx = new Proxy({}, { get: () => () => undefined, set: () => true });
    vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, style: {}, getContext: () => ctx }) });
    setFxSettings({ tier: 'mid', reducedMotion: false });
    resetRim();
    flash.mockClear();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('grows a red circle on the impact point by the battle\'s clock: where the simulation is at 1x, 2x and 3x', () => {
    for (const speed of [1, 2, 3]) {
      const s = build();
      s.ctx.speed = speed;
      const t0 = s.battle.time;
      s.scene.cast(cast(s));
      const w0 = s.live().warns[0] as Live['warns'][number];
      expect(w0).toMatchObject({ id: 1, x: IMPACT.x, y: IMPACT.y, k: 0 });
      run(s, t0, 0.5, speed);
      expect((s.live().warns[0] as Live['warns'][number]).k).toBeCloseTo(0.5, 6);
      run(s, t0, 0.9, speed);
      expect((s.live().warns[0] as Live['warns'][number]).k).toBeCloseTo(0.9, 6);
    }
  });

  it('stands still under a popup however long real time goes on', () => {
    const s = build();
    s.scene.cast(cast(s));
    s.tick(0.4);
    const k = (s.live().warns[0] as Live['warns'][number]).k;
    const dusk = s.live().dusk;
    for (let i = 0; i < 300; i++) s.tick(0, 1 / 60);
    const after = s.live().warns[0] as Live['warns'][number];
    expect(after.k).toBeCloseTo(k, 9);
    expect(after.k).toBeCloseTo(0.4, 6);
    expect(s.live().dusk).toBeCloseTo(dusk, 6);
  });

  it('brings the fireball down so that it reaches the circle exactly at the landing, at any game speed, and the fall takes a fifth of a real second where the warning allows', () => {
    expect(FALL_BATTLE).toBe(0.36);
    expect(FALL_REAL).toBe(0.22);
    for (const speed of [1, 2, 3]) {
      const s = build();
      s.ctx.speed = speed;
      const t0 = s.battle.time;
      s.scene.cast(cast(s));
      const window = (s.scene as unknown as { fallWindow(w: number): number }).fallWindow(1);
      expect(window).toBeCloseTo(Math.min(1, Math.max(0.36, 0.22 * speed)), 9);
      // In the sky before the window starts: nothing drawn.
      run(s, t0, 1 - window - 0.05, speed);
      expect((s.live().warns[0] as Live['warns'][number]).p).toBe(0);
      // At the landing time it is on the circle.
      run(s, t0, 1, speed);
      const w = s.live().warns[0] as Live['warns'][number];
      expect(w.p).toBeCloseTo(1, 6);
      expect(w.headX).toBeCloseTo(IMPACT.x, 6);
      expect(w.headY).toBeCloseTo(IMPACT.y, 6);
    }
  });

  it('comes from the sky along its angle and grows as it nears (it is high and far at the start of the fall)', () => {
    const s = build();
    const t0 = s.battle.time;
    s.scene.cast(cast(s));
    run(s, t0, 1 - FALL_BATTLE + 0.02);
    const w = s.live().warns[0] as Live['warns'][number];
    expect(w.p).toBeGreaterThan(0);
    expect(w.p).toBeLessThan(0.2);
    // Up the way it comes from, almost the whole distance away.
    expect(w.headY).toBeLessThan(IMPACT.y - FALL_DIST * 0.8 * Math.sin(FALL_ANGLE));
    expect(w.headX).toBeLessThan(IMPACT.x);
  });

  it('dims the screen gently (never past its cap, never a flash) and gives way under the star archer\'s night', () => {
    const s = build();
    const t0 = s.battle.time;
    s.scene.cast(cast(s));
    const dusk = s.front.getChildByLabel(DUSK_LABEL) as Sprite;
    expect(dusk).not.toBeNull();
    expect(s.front.getChildIndex(dusk)).toBe(0);
    let max = 0;
    let last = 0;
    for (let i = 0; i < 70; i++) {
      s.tick(1 / 60);
      max = Math.max(max, dusk.alpha);
      // It never jumps: at most a third of its cap from one frame to the next.
      expect(Math.abs(dusk.alpha - last)).toBeLessThan(DUSK_ALPHA / 3);
      last = dusk.alpha;
    }
    expect(max).toBeCloseTo(DUSK_ALPHA, 6);
    expect(s.battle.time - t0).toBeLessThan(1.2);
    // The night of the star archer is up: the two sheets together never darken more than the flash guide's 0.42.
    const night = new Sprite(Texture.WHITE);
    night.label = NIGHT_LABEL;
    night.alpha = 0.35;
    s.front.addChild(night);
    s.tick(1 / 60);
    expect(1 - (1 - dusk.alpha) * (1 - night.alpha)).toBeLessThanOrEqual(0.42 + 1e-9);
    expect(dusk.alpha).toBeLessThan(DUSK_ALPHA);
  });

  it('plays the cast\'s sound and starts the whistle of the sky with the fall, on the battle\'s clock (which waits under a popup)', () => {
    const s = build();
    s.scene.cast(cast(s));
    expect(s.stage.play).toHaveBeenCalledWith(s.stage.rules.skillTick, 'sp_meteor_warn', expect.any(Number), expect.any(Number), expect.any(Number), expect.any(Number));
    expect(s.stage.later).toHaveBeenCalledTimes(1);
    // The whistle begins where the fall does: 1 s warning minus the 0.36 s fall = after 0.64 battle seconds.
    expect(s.stage.later.mock.calls[0]?.[0]).toBeCloseTo(0.64, 6);
    expect(s.fx.shockwave).toHaveBeenCalledTimes(1);
  });

  it('paints its dashed rim in code once, however many meteors fall', () => {
    const create = vi.fn(() => ({ width: 0, height: 0, style: {}, getContext: () => new Proxy({}, { get: () => () => undefined, set: () => true }) }));
    vi.stubGlobal('document', { createElement: create });
    resetRim();
    const a = rimArt();
    const b = rimArt();
    expect(a).toBe(b);
    expect(create).toHaveBeenCalledTimes(1);
    resetRim();
  });
});

describe('the cosmo cat\'s meteor: the landing, the shock and the crater', () => {
  beforeEach(() => {
    const ctx = new Proxy({}, { get: () => () => undefined, set: () => true });
    vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, style: {}, getContext: () => ctx }) });
    setFxSettings({ tier: 'mid', reducedMotion: false });
    resetRim();
    flash.mockClear();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('lands the inner ring: the warning goes, a flash, a ring and a crater begin, with a nudge of the camera, one screen flash and the boom', () => {
    const s = build();
    const t0 = s.battle.time;
    s.scene.cast(cast(s));
    run(s, t0, 1);
    land(s, 'inner', 1, pts(3));
    const live = s.live();
    expect(live.warns).toHaveLength(0);
    expect(live.landings).toBe(1);
    expect(live.waves).toBe(1);
    expect(live.craters).toEqual([{ id: 1, phase: 'burn' }]);
    expect(s.stage.shake).toHaveBeenCalledWith(Trauma.t2, Gate.spShake, expect.any(Number));
    expect(flash).toHaveBeenCalledTimes(1);
    expect(s.stage.play).toHaveBeenCalledWith(s.stage.rules.skill, 'sp_meteor_boom', expect.any(Number), expect.any(Number), expect.any(Number), expect.any(Number));
    // Sparks at the impact and ember sparks on the three enemies the ring touched.
    const at = s.fx.ps.burst.mock.calls.filter((c) => c[1] === IMPACT.x && c[2] === IMPACT.y);
    expect(at.length).toBeGreaterThanOrEqual(1);
    expect(s.fx.ps.burst.mock.calls.filter((c) => c[2] === 300 && c[1] !== IMPACT.x).length).toBe(3);
  });

  it('lifts the dusk once it has landed', () => {
    const s = build();
    const t0 = s.battle.time;
    s.scene.cast(cast(s));
    run(s, t0, 1);
    expect(s.live().dusk).toBeGreaterThan(0.99);
    land(s, 'inner');
    run(s, t0, 1.8);
    expect(s.live().dusk).toBe(0);
  });

  it('lands as the painted flash and the painted blast ring (one sprite each, no tint of the old rings), and the ring spreads to the radius it is told', () => {
    const s = build();
    s.scene.cast(cast(s));
    const t0 = s.battle.time;
    land(s, 'inner');
    const landing = (s.scene as unknown as { landings: { list: Array<{ burst: Sprite }> } }).landings.list[0] as { burst: Sprite };
    const wave = (s.scene as unknown as { waves: { list: Array<{ ring: Sprite }> } }).waves.list[0] as { ring: Sprite };
    expect(landing.burst.texture).toBe(tex(FLASH_KEY));
    expect(wave.ring.texture).toBe(tex(RING_KEY));
    expect(wave.ring.visible).toBe(true);
    // The picture's outer edge (0.45 of the file's width from its middle) is on the radius: the sprite is 1/0.45 of it across (a one-pixel stand-in texture here).
    run(s, t0, 0.3);
    expect(wave.ring.scale.x).toBeCloseTo(90 / 0.45, 3);
    expect(wave.ring.position.x).toBe(IMPACT.x);
    expect(wave.ring.position.y).toBe(IMPACT.y);
    // It fades as it spreads and is gone after its span.
    const mid = wave.ring.alpha;
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(0.95);
    run(s, t0, 0.8);
    expect(wave.ring.visible).toBe(false);
    expect(landing.burst.visible).toBe(false);
  });

  it('sends the shock out 0.25 s later: a ring to the outer radius and a ring of dust, and a softer sound', () => {
    const s = build();
    s.scene.cast(cast(s));
    land(s, 'inner');
    s.fx.ps.burst.mockClear();
    land(s, 'outer');
    expect(s.live().waves).toBe(2);
    const dust = s.fx.ps.burst.mock.calls.filter((c) => (c[0] as { tex: string }).tex === 'smoke');
    expect(dust).toHaveLength(1);
    expect((dust[0]?.[3] as { scale: number }).scale).toBeCloseTo(1, 9);
    expect(s.stage.play).toHaveBeenCalledWith(s.stage.rules.skill, 'sp_meteor_ring', expect.any(Number), expect.any(Number), expect.any(Number), expect.any(Number));
  });

  it('keeps the crater until its end event, beats on the burn\'s own half second, dims in its last 0.6 s and fades away at the end', () => {
    const s = build(2);
    const t0 = s.battle.time;
    s.scene.cast(cast(s));
    run(s, t0, 1);
    land(s, 'inner');
    const landAt = s.battle.time;
    s.fx.ps.burst.mockClear();
    // Four seconds of burn: eight beats of embers (and a wisp each on the highest tier).
    run(s, landAt, 4 - 0.01);
    const beats = s.fx.ps.burst.mock.calls.filter((c) => (c[0] as { tex: string }).tex === 'spark' && c[1] === IMPACT.x);
    expect(beats.length).toBeGreaterThanOrEqual(7);
    expect(beats.length).toBeLessThanOrEqual(8);
    expect(PULSE_EVERY).toBe(0.5);
    expect(s.live().craters[0]?.phase).toBe('burn');
    end(s);
    expect(s.live().craters[0]?.phase).toBe('out');
    expect(s.live().waiting).toBe(0);
    run(s, landAt, 5);
    expect(s.live().craters).toHaveLength(0);
  });

  it('lets the burn\'s glow dim only in its last 0.6 s', () => {
    const s = build();
    s.scene.cast(cast(s));
    land(s, 'inner');
    const c = (s.scene as unknown as { craters: Array<{ glowAt(now: number, calm?: boolean): number; landAt: number; endAt: number }> }).craters[0] as {
      glowAt(now: number, calm?: boolean): number;
      landAt: number;
      endAt: number;
    };
    // On a beat it is at its brightest all through the burn, and nothing is left of it at the end.
    expect(c.glowAt(c.landAt + 1)).toBeCloseTo(1, 9);
    expect(c.glowAt(c.landAt + 3)).toBeCloseTo(1, 9);
    expect(c.glowAt(c.endAt - 0.3)).toBeLessThan(0.6);
    expect(c.glowAt(c.endAt)).toBe(0);
    expect(c.glowAt(c.landAt + 2, true)).toBeCloseTo(0.55, 9);
  });

  it('retires a crater whose end event never came, a second after it was due', () => {
    const s = build();
    const t0 = s.battle.time;
    s.scene.cast(cast(s));
    land(s, 'inner');
    run(s, t0, 4 + 1.2);
    expect(s.live().craters[0]?.phase).toBe('out');
    run(s, t0, 7);
    expect(s.live().craters).toHaveLength(0);
  });

  it('pairs everything by meteorId: two meteors alive together keep their own warning, landing and crater, and an unknown id is ignored', () => {
    const s = build();
    const t0 = s.battle.time;
    s.scene.cast(cast(s, 1));
    run(s, t0, 0.3);
    s.scene.cast(cast(s, 2, { impactX: 200, impactY: 100 }));
    expect(s.live().warns.map((w) => w.id).sort()).toEqual([1, 2]);
    expect(() => land(s, 'inner', 99)).not.toThrow();
    expect(s.live().craters).toHaveLength(0);
    run(s, t0, 1);
    land(s, 'inner', 1);
    expect(s.live().warns.map((w) => w.id)).toEqual([2]);
    expect(s.live().craters).toEqual([{ id: 1, phase: 'burn' }]);
    end(s, 99);
    expect(s.live().craters[0]?.phase).toBe('burn');
    land(s, 'inner', 2);
    expect(s.live().craters.map((c) => c.id).sort()).toEqual([1, 2]);
    end(s, 1);
    expect(s.live().craters.find((c) => c.id === 1)?.phase).toBe('out');
    expect(s.live().craters.find((c) => c.id === 2)?.phase).toBe('burn');
  });

  it('still lands a meteor whose warning was cleared by a defeat once a revive lets the simulation go on, from the event\'s own numbers', () => {
    const s = build();
    const t0 = s.battle.time;
    s.scene.cast(cast(s));
    run(s, t0, 0.5);
    s.scene.clear();
    expect(s.live().warns).toHaveLength(0);
    land(s, 'inner');
    expect(s.live().craters).toEqual([{ id: 1, phase: 'burn' }]);
    expect(s.live().landings).toBe(1);
  });

  it('cuts everything off at once on victory and defeat (the dusk lifts by real time) and can be used again after', () => {
    const s = build();
    const t0 = s.battle.time;
    s.scene.cast(cast(s));
    run(s, t0, 1);
    land(s, 'inner');
    land(s, 'outer');
    s.scene.clear();
    expect(s.live()).toMatchObject({ warns: [], landings: 0, waves: 0, craters: [] });
    // The battle's clock does not move after a defeat: the dusk is lifted by real time alone.
    for (let i = 0; i < 40; i++) s.tick(0, 1 / 60);
    expect(s.live().dusk).toBe(0);
    s.scene.cast(cast(s, 5));
    expect(s.live().warns).toHaveLength(1);
  });

  it('falls as the owner\'s painted rock: one sprite, head to the right and tail to the left, so the fall\'s angle turns it along its way, and it grows as it nears', () => {
    const s = build();
    const t0 = s.battle.time;
    s.scene.cast(cast(s));
    run(s, t0, 1 - FALL_BATTLE + 0.1);
    const w = (s.scene as unknown as { warns: Array<{ head: Container }> }).warns[0] as { head: Container };
    expect(w.head.children).toHaveLength(1);
    const rock = w.head.children[0] as Sprite;
    expect(rock.texture).toBe(tex(ROCK_KEY));
    // The container is turned by the angle of the fall (the picture is drawn along +x), the sprite itself is not turned again.
    expect(w.head.rotation).toBeCloseTo(FALL_ANGLE, 9);
    expect(rock.rotation).toBe(0);
    const early = rock.scale.x;
    run(s, t0, 0.98);
    expect(rock.scale.x).toBeGreaterThan(early);
    expect(w.head.rotation).toBeCloseTo(FALL_ANGLE, 9);
  });

  it('draws what it is told from the events and numbers alone: nothing of the simulation is touched', () => {
    const s = build();
    const snap = JSON.stringify({ time: s.battle.time, enemies: s.battle.enemies });
    s.scene.cast(cast(s));
    land(s, 'inner', 1, pts(5));
    land(s, 'outer', 1, pts(5));
    expect(JSON.stringify({ time: s.battle.time, enemies: s.battle.enemies })).toBe(snap);
  });

  it('never grows past its pools over many meteors', () => {
    const s = build(2);
    for (let n = 1; n <= 40; n++) {
      const t0 = s.battle.time;
      s.scene.cast(cast(s, n));
      run(s, t0, 1);
      land(s, 'inner', n, pts(4));
      land(s, 'outer', n, pts(4));
      run(s, t0, 1.6);
      if (n % 2 === 0) end(s, n);
    }
    // 3 warnings (a circle and a head each), 3 landings (2 sprites), 6 waves (2 sprites), 4 craters (one root each), plus the dusk.
    const total = s.front.children.length + s.back.children.length;
    expect(total).toBeLessThanOrEqual(1 + 3 * 2 + 3 * 2 + 6 * 2 + 4 + 2);
  });

  it('destroys what it made and releases its listeners', () => {
    const s = build();
    s.scene.cast(cast(s));
    land(s, 'inner');
    expect(s.listeners()).toBe(2);
    s.scene.destroy();
    expect(s.listeners()).toBe(0);
    expect(s.front.children).toHaveLength(0);
    expect(s.back.children).toHaveLength(0);
    expect(() => land(s, 'inner')).not.toThrow();
    expect(() => end(s)).not.toThrow();
  });
});

describe('the cosmo cat\'s meteor: reduced motion and the low tier', () => {
  beforeEach(() => {
    const ctx = new Proxy({}, { get: () => () => undefined, set: () => true });
    vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, style: {}, getContext: () => ctx }) });
    setFxSettings({ tier: 'mid', reducedMotion: false });
    resetRim();
    flash.mockClear();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('under reduced motion there is no dusk, no falling meteor, no nudge, no screen flash and no whistle; the circle is just there', () => {
    const s = build(1, true);
    const t0 = s.battle.time;
    s.scene.cast(cast(s));
    expect(s.stage.later).not.toHaveBeenCalled();
    run(s, t0, 0.9);
    const w = s.live().warns[0] as Live['warns'][number];
    expect(w.p).toBe(0);
    expect(s.live().dusk).toBe(0);
    land(s, 'inner', 1, pts(2));
    expect(s.stage.shake).not.toHaveBeenCalled();
    expect(flash).not.toHaveBeenCalled();
    land(s, 'outer');
    // No ring of dust at the outer ring's edge, and no chips of paper flying about.
    expect(s.fx.ps.burst.mock.calls.filter((c) => (c[0] as { shape?: { type: string } }).shape?.type === 'ring')).toHaveLength(0);
    expect(s.fx.ps.burst.mock.calls.filter((c) => (c[0] as { tex: string }).tex === 'shard')).toHaveLength(0);
  });

  it('on the low tier there are no chips, no smoke and no crater sparks, and fewer embers on the enemies', () => {
    const s = build(0);
    const t0 = s.battle.time;
    s.scene.cast(cast(s));
    run(s, t0, 1);
    s.fx.ps.burst.mockClear();
    land(s, 'inner', 1, pts(10));
    const texes = s.fx.ps.burst.mock.calls.map((c) => (c[0] as { tex: string }).tex);
    expect(texes).not.toContain('shard');
    expect(texes).not.toContain('smoke');
    // Embers on at most four enemies, and the burst at the impact itself.
    expect(texes.filter((t) => t === 'spark').length).toBeLessThanOrEqual(1 + 4);
    s.fx.ps.burst.mockClear();
    run(s, t0, 4);
    expect(s.fx.ps.burst).not.toHaveBeenCalled();
  });
});

describe('the cosmo cat\'s meteor: the view fails alone', () => {
  beforeEach(() => {
    const ctx = new Proxy({}, { get: () => () => undefined, set: () => true });
    vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, style: {}, getContext: () => ctx }) });
    setFxSettings({ tier: 'mid', reducedMotion: false });
    resetRim();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('a throw in its own `meteorLand` listener is logged and does not unwind into the simulation that emitted it; the scene then shows nothing and the dusk lifts', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const s = build();
    const t0 = s.battle.time;
    s.scene.cast(cast(s));
    run(s, t0, 0.9);
    expect(s.live().dusk).toBeGreaterThan(0);
    s.stage.play.mockImplementation(() => {
      throw new Error('no texture');
    });
    expect(() => land(s, 'inner', 1, pts(3))).not.toThrow();
    expect(error).toHaveBeenCalledTimes(1);
    expect(String(error.mock.calls[0]?.[0])).toContain('[skills] meteor land failed');
    // Emptied: no circle, no landing, no crater; a later cast draws nothing; the dusk is let go of by the real clock.
    expect(s.live().warns).toHaveLength(0);
    expect(() => s.scene.cast(cast(s, 2))).not.toThrow();
    expect(s.live().warns).toHaveLength(0);
    for (let i = 0; i < 120; i++) s.tick(0, 1 / 60);
    expect(s.live().dusk).toBe(0);
    expect(() => end(s)).not.toThrow();
    s.scene.destroy();
    expect(s.listeners()).toBe(0);
  });
});
