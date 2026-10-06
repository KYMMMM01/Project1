import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Container, Texture } from 'pixi.js';
import { Color } from '@/ui/theme';

vi.mock('@/fx/textures', () => ({
  ensureFxTextures: () => undefined,
  fxTex: () => ({ texture: Texture.WHITE, w: 64, h: 64, ax: 0.5, ay: 0.5 }),
  fxTexture: () => Texture.WHITE,
  fxVignette: () => Texture.WHITE,
}));

import { Loop, hash01, type FxEnv } from '@/fx/loops';
import { makeSpritePool } from '@/fx/rays';
import { setFxSettings } from '@/fx/settings';
import { blackHole, blizzardZone, hazardWarn, laserDot, potionCloud, sunbeamCell, weakenSwirl, wetPuddle, zapCell } from '@/fx/zones';
import type { EmitDef, EmitterHandle } from '@/fx/particles';

interface FakeEmitter {
  alive: boolean;
  stop: () => void;
  def: EmitDef;
  rate: number;
}

function makeEnv(): { env: FxEnv; ground: Container; loops: Loop[]; emitters: FakeEmitter[]; allocs: { n: number }; pool: ReturnType<typeof makeSpritePool> } {
  const ground = new Container();
  const loops: Loop[] = [];
  const emitters: FakeEmitter[] = [];
  const allocs = { n: 0 };
  const pool = makeSpritePool();
  const env: FxEnv = {
    ps: {
      emit: (def: EmitDef, _x: number, _y: number, rate: number) => {
        const e: FakeEmitter = {
          alive: true,
          def,
          rate,
          stop() {
            e.alive = false;
          },
        };
        emitters.push(e);
        return e as unknown as EmitterHandle;
      },
      alloc: () => {
        allocs.n++;
        return null;
      },
    } as unknown as FxEnv['ps'],
    ground,
    sprites: pool,
    run: () => {
      throw new Error('zones must not need the tweener');
    },
    burst: () => undefined,
    add: (l) => void loops.push(l),
  };
  return { env, ground, loops, emitters, allocs, pool };
}

const DT = 1 / 60;
function advance(loop: Loop, seconds: number): void {
  for (let t = 0; t < seconds - 1e-9; t += DT) loop.update(DT);
}

beforeEach(() => {
  setFxSettings({ reducedMotion: false, tier: 'mid', quality: 1 });
});

describe('Loop lifecycle', () => {
  it('registers itself, fades in and out, and returns every sprite to the pool', async () => {
    const { env, ground, loops, pool } = makeEnv();
    const loop = new Loop(env, 10, 20, { fadeIn: 0.2, fadeOut: 0.3 });
    expect(loops).toEqual([loop]);
    expect(ground.children).toContain(loop.container);
    const a = loop.sprite('disc');
    loop.sprite('ring', Color.coral);
    expect(loop.container.children.length).toBe(2);
    expect(a.blendMode).not.toBe('add');
    expect(a.tint).toBe(Color.white);

    advance(loop, 0.05);
    expect(loop.container.alpha).toBeGreaterThan(0);
    expect(loop.container.alpha).toBeLessThan(1);
    advance(loop, 0.3);
    expect(loop.container.alpha).toBe(1);

    loop.stop();
    advance(loop, 0.15);
    expect(loop.alive).toBe(true);
    expect(loop.container.alpha).toBeLessThan(1);
    advance(loop, 0.2);
    expect(loop.alive).toBe(false);
    expect(ground.children).not.toContain(loop.container);
    expect(pool.idle).toBe(2);
    await expect(loop.done).resolves.toBeUndefined();
  });

  it('stop() ends the emitters at once, while the sprites are still fading', () => {
    const { env, emitters } = makeEnv();
    const loop = new Loop(env, 0, 0);
    loop.emit({ tex: 'dot', life: 1, size: 5, colors: [0xffffff] }, 5);
    expect(emitters[0]?.alive).toBe(true);
    loop.stop();
    expect(emitters[0]?.alive).toBe(false);
    expect(loop.alive).toBe(true);
  });

  it('stops itself after `life` seconds', () => {
    const { env } = makeEnv();
    const loop = new Loop(env, 0, 0, { life: 0.5, fadeOut: 0.1 });
    advance(loop, 0.45);
    expect(loop.alive).toBe(true);
    advance(loop, 0.3);
    expect(loop.alive).toBe(false);
  });

  it('dispose() is idempotent and a disposed loop ignores updates and moves', () => {
    const { env, pool } = makeEnv();
    const loop = new Loop(env, 0, 0);
    loop.sprite('dot');
    loop.dispose();
    loop.dispose();
    loop.update(DT);
    loop.moveTo(5, 5);
    expect(pool.idle).toBe(1);
    expect(loop.alive).toBe(false);
  });

  it('reuses pooled sprites: repeated create / dispose never creates more than it needs', () => {
    const { env, pool } = makeEnv();
    for (let i = 0; i < 50; i++) {
      const loop = new Loop(env, 0, 0);
      loop.sprite('dot');
      loop.sprite('ring');
      loop.dispose();
    }
    expect(pool.created).toBe(2);
  });

  it('moveTo snaps without a half-life and glides with one', () => {
    const { env } = makeEnv();
    const snap = new Loop(env, 0, 0);
    snap.moveTo(100, 50);
    expect(snap.container.position.x).toBe(100);
    const glide = new Loop(env, 0, 0, { halfLife: 0.05 });
    glide.moveTo(100, 0);
    expect(glide.container.position.x).toBe(0);
    advance(glide, 0.05);
    expect(glide.container.position.x).toBeGreaterThan(40);
    expect(glide.container.position.x).toBeLessThan(60);
    advance(glide, 1);
    expect(glide.container.position.x).toBeCloseTo(100, 1);
  });

  it('follows a display object, and stops when that object is destroyed', () => {
    const { env, ground } = makeEnv();
    const target = new Container();
    ground.addChild(target);
    const loop = new Loop(env, 0, 0, { follow: target, fadeOut: 0.1 });
    target.position.set(40, 60);
    advance(loop, DT * 2);
    expect(loop.container.position.x).toBeCloseTo(40);
    expect(loop.container.position.y).toBeCloseTo(60);
    target.destroy();
    advance(loop, 0.05);
    expect(loop.alive).toBe(true);
    advance(loop, 0.2);
    expect(loop.alive).toBe(false);
  });

  it('hash01 is deterministic and stays in [0,1)', () => {
    expect(hash01(3.7)).toBe(hash01(3.7));
    for (let i = 0; i < 500; i++) {
      const v = hash01(i * 0.37);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('zone presets', () => {
  const rect = { x: 100, y: 200, w: 140, h: 150 };
  const makers: ReadonlyArray<readonly [string, (env: FxEnv) => ReturnType<typeof sunbeamCell>]> = [
    ['sunbeamCell', (e) => sunbeamCell(e, rect)],
    ['laserDot', (e) => laserDot(e, 300, 300)],
    ['wetPuddle', (e) => wetPuddle(e, rect)],
    ['zapCell', (e) => zapCell(e, rect)],
    ['weakenSwirl', (e) => weakenSwirl(e, 300, 300)],
    ['blizzardZone', (e) => blizzardZone(e, 300, 300, 120)],
    ['potionCloud', (e) => potionCloud(e, 300, 300, 120)],
    ['blackHole', (e) => blackHole(e, 300, 300, 120)],
  ];

  for (const [name, make] of makers) {
    it(`${name} loops, animates without throwing, and leaves nothing behind after stop()`, async () => {
      const { env, ground, emitters, pool } = makeEnv();
      const h = make(env);
      const loop = ground.children.length;
      expect(loop).toBe(1);
      expect(h.alive).toBe(true);
      for (let i = 0; i < 180; i++) (h as Loop).update(DT);
      expect(h.alive).toBe(true);
      expect(emitters.every((e) => e.alive)).toBe(true);
      h.stop();
      expect(emitters.every((e) => !e.alive)).toBe(true);
      for (let i = 0; i < 60; i++) (h as Loop).update(DT);
      expect(h.alive).toBe(false);
      expect(ground.children.length).toBe(0);
      expect(pool.idle).toBeGreaterThan(0);
      await expect(h.done).resolves.toBeUndefined();
    });

    it(`${name} also runs under reduced motion`, () => {
      setFxSettings({ reducedMotion: true });
      const { env } = makeEnv();
      const h = make(env) as Loop;
      for (let i = 0; i < 120; i++) h.update(DT);
      h.dispose();
      expect(h.alive).toBe(false);
    });
  }

  it('zapCell asks for arcs while it crackles and none under reduced motion', () => {
    const calm = makeEnv();
    setFxSettings({ reducedMotion: true });
    const c = zapCell(calm.env, rect) as Loop;
    for (let i = 0; i < 240; i++) c.update(DT);
    expect(calm.allocs.n).toBe(0);
    setFxSettings({ reducedMotion: false });
    const live = makeEnv();
    const z = zapCell(live.env, rect) as Loop;
    for (let i = 0; i < 240; i++) z.update(DT);
    expect(live.allocs.n).toBeGreaterThan(10);
  });

  it('laserDot glides to a new point and follows every moveTo', () => {
    const { env } = makeEnv();
    const dot = laserDot(env, 100, 100) as Loop;
    dot.moveTo(300, 100);
    for (let i = 0; i < 6; i++) dot.update(DT);
    expect(dot.container.position.x).toBeGreaterThan(100);
    expect(dot.container.position.x).toBeLessThan(300);
    for (let i = 0; i < 60; i++) dot.update(DT);
    expect(dot.container.position.x).toBeCloseTo(300, 0);
  });

  it('weakenSwirl can ride a unit', () => {
    const { env, ground } = makeEnv();
    const unit = new Container();
    ground.addChild(unit);
    unit.position.set(200, 220);
    const s = weakenSwirl(env, 0, 0, { follow: unit }) as Loop;
    s.update(DT);
    expect(s.container.position.x).toBeCloseTo(200);
    unit.position.set(260, 300);
    s.update(DT);
    expect(s.container.position.y).toBeCloseTo(300);
  });
});

describe('hazardWarn', () => {
  const rect = { x: 0, y: 0, w: 140, h: 150 };

  it('is a timed telegraph: it lasts the requested time plus a short pop, then is gone', async () => {
    const { env, ground, pool } = makeEnv();
    const h = hazardWarn(env, rect, 'wet', { duration: 0.8 }) as Loop;
    for (let i = 0; i < 45; i++) h.update(DT); // 0.75 s
    expect(h.alive).toBe(true);
    for (let i = 0; i < 25; i++) h.update(DT); // past 0.8 s + 0.2 s pop
    expect(h.alive).toBe(false);
    expect(ground.children.length).toBe(0);
    expect(pool.idle).toBeGreaterThan(0);
    await expect(h.done).resolves.toBeUndefined();
  });

  it('defaults to the 0.8 s the battle rules warn for', () => {
    const { env } = makeEnv();
    const h = hazardWarn(env, rect, 'zap') as Loop;
    for (let i = 0; i < 40; i++) h.update(DT); // 0.67 s
    expect(h.alive).toBe(true);
    for (let i = 0; i < 40; i++) h.update(DT); // 1.33 s
    expect(h.alive).toBe(false);
  });

  it('can be cancelled early and cleans up', () => {
    const { env, ground } = makeEnv();
    const h = hazardWarn(env, rect, 'wet', { duration: 5 }) as Loop;
    for (let i = 0; i < 10; i++) h.update(DT);
    h.stop();
    for (let i = 0; i < 30; i++) h.update(DT);
    expect(h.alive).toBe(false);
    expect(ground.children.length).toBe(0);
  });

  it('keeps the outline blinking inside the flash-safety limit (3 Hz at most)', () => {
    const { env } = makeEnv();
    const h = hazardWarn(env, rect, 'zap', { duration: 1 }) as Loop;
    const outline = h.container.children.find((c) => c.constructor.name === 'Graphics');
    expect(outline).toBeDefined();
    let flips = 0;
    let prev = 0;
    let last = -1;
    for (let i = 0; i < 60; i++) {
      h.update(DT);
      const a = (outline as Container).alpha;
      const dir = Math.sign(a - prev);
      if (i > 2 && dir !== 0 && last !== 0 && dir !== last) flips++;
      if (dir !== 0) last = dir;
      prev = a;
    }
    // Each full blink cycle is two direction changes; 3 Hz over one second is at most ~6.
    expect(flips).toBeLessThanOrEqual(7);
  });
});
