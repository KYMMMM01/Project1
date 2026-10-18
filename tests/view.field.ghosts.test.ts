/**
 * What the ninja's clones need from the field (docs/design_skills_v2.md 3.4): the pale copies baked from art the game already has
 * (`field/ghosts.ts`), the launch offsets of a stacked clone's shuriken, and the projectile layer painting `ProjectileState.ghost` pale blue
 * (`field/projectiles.ts`). The simulation's side (the ghost flag, `cloneThrow`) is in `sim.spClones.test.ts`; here the layer is fed fake state.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Container, Texture, type Sprite } from 'pixi.js';

vi.mock('@/core/assets', () => ({ tex: () => Texture.WHITE, hasTex: () => true, putTex: () => undefined, imageKeys: () => [] }));
vi.mock('@/fx/textures', () => ({
  ensureFxTextures: () => undefined,
  fxTex: () => ({ texture: Texture.WHITE, w: 64, h: 64, ax: 0.5, ay: 0.5 }),
  fxTexture: () => Texture.WHITE,
  fxVignette: () => Texture.WHITE,
}));

import { Emitter } from '@/core/events';
import { setFxSettings } from '@/fx/settings';
import type { BattleEvents, ProjectileState, UnitId } from '@/game/api';
import {
  GHOST_SKY,
  GHOST_SKY_LIGHT,
  clearGhostStarts,
  ghostShuriken,
  ghostStartsPending,
  noteGhostStart,
  paleCopy,
  takeGhostStart,
} from '@/view/field/ghosts';
import { Projectiles } from '@/view/field/projectiles';
import type { FieldEnv } from '@/view/field/env';

const DT = 1 / 60;

// ───────────────────────────── the bakes ─────────────────────────────

interface Call {
  op: string;
  args: unknown[];
}

/** A canvas that writes down what it is asked to do. */
function recordingDocument(): { calls: Call[]; made: Array<{ width: number; height: number }> } {
  const calls: Call[] = [];
  const made: Array<{ width: number; height: number }> = [];
  vi.stubGlobal('document', {
    createElement: () => {
      const canvas = { width: 0, height: 0, style: {} } as { width: number; height: number; style: object; getContext?: () => unknown };
      made.push(canvas);
      const state: Record<string, unknown> = { globalCompositeOperation: 'source-over', globalAlpha: 1, fillStyle: '' };
      const ctx = new Proxy(state, {
        get: (t, k: string) => (k in t ? t[k] : (...args: unknown[]) => calls.push({ op: k, args: [state.globalCompositeOperation, state.globalAlpha, state.fillStyle, ...args] })),
        set: (t, k: string, v) => {
          t[k] = v;
          return true;
        },
      });
      canvas.getContext = () => ctx;
      return canvas;
    },
  });
  return { calls, made };
}

/** A picture the bake can draw: a texture whose resource is a canvas (the stand-in class is what the bake's check looks for). */
function drawableTexture(w: number, h: number): Texture {
  class FakeCanvas {}
  vi.stubGlobal('HTMLCanvasElement', FakeCanvas);
  const resource = Object.assign(new FakeCanvas(), { width: w, height: h });
  const t = new Texture({ source: new (Texture.WHITE.source.constructor as new (o: object) => Texture['source'])({ resource, width: w, height: h, resolution: 1 }) });
  return t;
}

describe('the pale copy of a picture', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('is not baked where there is no canvas or no picture to draw (the caller tints the original instead)', () => {
    expect(paleCopy(Texture.WHITE, 'none', { fill: GHOST_SKY, strength: 0.5, keep: 0, lift: 0, scale: 0.5 })).toBeNull();
    recordingDocument();
    // A one-pixel white texture has no resource the canvas can draw.
    expect(paleCopy(Texture.WHITE, 'none2', { fill: GHOST_SKY, strength: 0.5, keep: 0, lift: 0, scale: 0.5 })).toBeNull();
    expect(ghostShuriken(Texture.WHITE)).toBeNull();
  });

  it('draws the picture, washes it toward the sky only where it has pixels, lets some of its own shading come back, and caches the result', () => {
    const rec = recordingDocument();
    const src = drawableTexture(100, 80);
    const o = { fill: 0x64aaeb, strength: 0.85, keep: 0.2, lift: 0.1, scale: 0.5 };
    const a = paleCopy(src, 'pale-test', o);
    expect(a).not.toBeNull();
    // 50 x 40 baked pixels.
    expect(rec.made[0]).toMatchObject({ width: 50, height: 40 });
    const ops = rec.calls.map((c) => [c.op, c.args[0], c.args[1]]);
    expect(ops[0]).toEqual(['drawImage', 'source-over', 1]);
    // The wash and everything after it use source-atop (the picture's own shape stays), the shading comes back at `keep`, then the lift.
    const head = (i: number): unknown[] => [rec.calls[i]?.op, ...(rec.calls[i]?.args.slice(0, 3) ?? [])];
    expect(head(1)).toEqual(['fillRect', 'source-atop', 1, 'rgba(100,170,235,0.85)']);
    expect(head(2).slice(0, 3)).toEqual(['drawImage', 'source-atop', 0.2]);
    expect(head(3)).toEqual(['fillRect', 'source-atop', 1, 'rgba(255,255,255,0.1)']);
    const n = rec.calls.length;
    expect(paleCopy(src, 'pale-test', o)).toBe(a);
    expect(rec.calls.length).toBe(n);
  });

  it('measures what the canvas measures (resolution 1: a fractional resolution made the source reset and clear the canvas)', () => {
    recordingDocument();
    const src = drawableTexture(100, 80);
    const a = paleCopy(src, 'pale-res', { fill: GHOST_SKY, strength: 0.5, keep: 0, lift: 0, scale: 0.6 }) as Texture;
    expect(a.source.resolution).toBe(1);
    expect(a.width).toBe(60);
    expect(a.height).toBe(48);
  });

  it('survives a bitmap the browser refuses to draw: the bake answers null and nothing throws', () => {
    vi.stubGlobal('document', {
      createElement: () => ({
        width: 0,
        height: 0,
        style: {},
        getContext: () => ({
          drawImage: () => {
            throw new Error('InvalidStateError');
          },
        }),
      }),
    });
    const src = drawableTexture(100, 80);
    expect(paleCopy(src, 'pale-closed', { fill: GHOST_SKY, strength: 0.5, keep: 0, lift: 0, scale: 0.5 })).toBeNull();
  });
});

// ───────────────────────────── where a clone's shuriken starts ─────────────────────────────

describe('the launch offsets of a clone\'s shuriken', () => {
  beforeEach(() => clearGhostStarts());

  it('is told once and taken once, by the shuriken\'s own number', () => {
    noteGhostStart(7, 30, -6);
    noteGhostStart(8, -30, -6);
    expect(ghostStartsPending()).toBe(2);
    expect(takeGhostStart(7)).toEqual({ dx: 30, dy: -6 });
    expect(takeGhostStart(7)).toBeNull();
    expect(takeGhostStart(9)).toBeNull();
    expect(takeGhostStart(8)).toEqual({ dx: -30, dy: -6 });
    expect(ghostStartsPending()).toBe(0);
  });

  it('does not keep an offset of nothing (a standing clone throws from the tile\'s centre, where the simulation starts it)', () => {
    noteGhostStart(1, 0, 0);
    expect(ghostStartsPending()).toBe(0);
  });

  it('forgets the oldest when nobody takes them (a shuriken that hit before a frame drew it): never more than 32 pending', () => {
    for (let i = 1; i <= 100; i++) noteGhostStart(i, 5, 5);
    expect(ghostStartsPending()).toBeLessThanOrEqual(32);
    expect(takeGhostStart(1)).toBeNull();
    expect(takeGhostStart(100)).toEqual({ dx: 5, dy: 5 });
  });

  it('clears', () => {
    noteGhostStart(1, 5, 5);
    clearGhostStarts();
    expect(takeGhostStart(1)).toBeNull();
  });
});

// ───────────────────────────── the projectile layer ─────────────────────────────

interface Rig {
  env: FieldEnv;
  layer: Container;
  shots: ProjectileState[];
}

function makeRig(): Rig {
  const ev = new Emitter<BattleEvents>();
  const shots: ProjectileState[] = [];
  const env = {
    battle: { events: ev, projectiles: shots },
    art: { shadow: Texture.WHITE },
    ctx: { enemyView: () => null, speed: 1, fx: { fleck: vi.fn(() => true), flecks: { count: 0 } } },
    time: 0,
  } as unknown as FieldEnv;
  return { env, layer: new Container(), shots };
}

const shot = (uid: number, unitId: UnitId, x: number, y: number, ghost?: boolean): ProjectileState => ({ uid, unitId, x, y, angle: 0, targetUid: 1, ...(ghost === undefined ? {} : { ghost }) });
const body = (layer: Container, n = 0): Sprite => (layer.children[2] as Container).children[n] as Sprite;
const streak = (layer: Container, n = 0): Sprite => (layer.children[1] as Container).children[n] as Sprite;

function frames(rig: Rig, layer: Projectiles, n: number): void {
  for (let i = 0; i < n; i++) {
    rig.env.time += DT;
    layer.update();
  }
}

describe('a clone\'s shuriken in the projectile layer', () => {
  beforeEach(() => {
    setFxSettings({ reducedMotion: false, tier: 'mid' });
    clearGhostStarts();
  });

  it('is painted pale blue and a little see-through, with a sky streak; the ninja\'s own shuriken is untouched', () => {
    const rig = makeRig();
    const layer = new Projectiles(rig.env, rig.layer);
    rig.shots.push(shot(1, 'r_ninja', 100, 100), shot(2, 'r_ninja', 100, 200, true));
    frames(rig, layer, 1);
    expect(body(rig.layer, 0).tint).toBe(0xffffff);
    expect(body(rig.layer, 0).alpha).toBe(1);
    // The bake is not possible here (no canvas), so the original is tinted pale.
    expect(body(rig.layer, 1).tint).toBe(GHOST_SKY_LIGHT);
    expect(body(rig.layer, 1).alpha).toBeLessThan(1);
    expect(streak(rig.layer, 1).tint).toBe(GHOST_SKY);
    expect(streak(rig.layer, 0).tint).not.toBe(GHOST_SKY);
    layer.destroy();
  });

  it('does not leave the pale look on the pooled sprite when the next shuriken is a real one', () => {
    const rig = makeRig();
    const layer = new Projectiles(rig.env, rig.layer);
    rig.shots.push(shot(1, 'r_ninja', 100, 100, true));
    frames(rig, layer, 2);
    rig.shots.length = 0;
    frames(rig, layer, 1);
    rig.shots.push(shot(2, 'r_ninja', 100, 100, false));
    frames(rig, layer, 1);
    expect(body(rig.layer, 0).tint).toBe(0xffffff);
    expect(body(rig.layer, 0).alpha).toBe(1);
    expect(streak(rig.layer, 0).tint).not.toBe(GHOST_SKY);
    layer.destroy();
  });

  it('starts a stacked clone\'s shuriken where the clone is drawn and slides it onto the simulation\'s line over the launch, not after', () => {
    const rig = makeRig();
    const layer = new Projectiles(rig.env, rig.layer);
    noteGhostStart(5, 30, -6);
    rig.shots.push(shot(5, 'r_ninja', 200, 300, true));
    rig.env.time = 1;
    layer.update();
    const first = body(rig.layer);
    expect(first.position.x).toBeCloseTo(230, 3);
    expect(first.position.y).toBeCloseTo(294, 3);
    // Half the launch later it is half way, and by the end of it (0.08 s) it is on the simulation's own line.
    rig.env.time = 1.04;
    layer.update();
    expect(first.position.x).toBeCloseTo(215, 1);
    rig.env.time = 1.09;
    layer.update();
    expect(first.position.x).toBeCloseTo(200, 3);
    expect(first.position.y).toBeCloseTo(300, 3);
    // The offset was used up: it is not waiting for anything else.
    expect(takeGhostStart(5)).toBeNull();
    layer.destroy();
  });

  it('a shuriken that is not a clone\'s ignores an offset told for its number, and a standing clone\'s (no offset) starts on the line', () => {
    const rig = makeRig();
    const layer = new Projectiles(rig.env, rig.layer);
    noteGhostStart(6, 30, -6);
    rig.shots.push(shot(6, 'r_ninja', 100, 100), shot(7, 'r_ninja', 100, 200, true));
    rig.env.time = 1;
    layer.update();
    expect(body(rig.layer, 0).position.x).toBeCloseTo(100, 3);
    expect(body(rig.layer, 1).position.x).toBeCloseTo(100, 3);
    layer.destroy();
  });

  it('under reduced motion starts on the line at once', () => {
    setFxSettings({ reducedMotion: true, tier: 'mid' });
    const rig = makeRig();
    const layer = new Projectiles(rig.env, rig.layer);
    noteGhostStart(5, 30, -6);
    rig.shots.push(shot(5, 'r_ninja', 200, 300, true));
    rig.env.time = 1;
    layer.update();
    expect(body(rig.layer).position.x).toBeCloseTo(200, 3);
    layer.destroy();
  });
});
