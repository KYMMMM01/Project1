/**
 * A clone's shuriken in the projectile layer when the pale copy CAN be baked (`field/ghosts.ts` `ghostShuriken`): the sprite wears the baked copy,
 * not a tint of the steel one, and a real shuriken after it gets the steel picture back. (The case where nothing can be baked, so the original is
 * tinted pale, is in `view.field.ghosts.test.ts`.)
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Container, Texture, type Sprite } from 'pixi.js';

const steel = vi.hoisted(() => ({ texture: null as unknown as Texture }));

vi.mock('@/core/assets', () => ({ tex: () => steel.texture, hasTex: () => true, putTex: () => undefined, imageKeys: () => [] }));
vi.mock('@/fx/textures', () => ({
  ensureFxTextures: () => undefined,
  fxTex: () => ({ texture: Texture.WHITE, w: 64, h: 64, ax: 0.5, ay: 0.5 }),
  fxTexture: () => Texture.WHITE,
  fxVignette: () => Texture.WHITE,
}));
vi.mock('@/fx/paint', () => ({ paint: () => steel.texture }));

import { Emitter } from '@/core/events';
import { setFxSettings } from '@/fx/settings';
import type { BattleEvents, ProjectileState, UnitId } from '@/game/api';
import { clearGhostStarts, ghostShuriken } from '@/view/field/ghosts';
import { Projectiles } from '@/view/field/projectiles';
import type { FieldEnv } from '@/view/field/env';

/** A canvas that does nothing, and a picture whose resource is one (the stand-in class is what the bake's check looks for). */
function bakeable(): void {
  class FakeCanvas {}
  vi.stubGlobal('HTMLCanvasElement', FakeCanvas);
  const ctx = new Proxy({}, { get: () => () => undefined, set: () => true });
  vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, style: {}, getContext: () => ctx }) });
  const resource = Object.assign(new FakeCanvas(), { width: 40, height: 40 });
  steel.texture = new Texture({ source: new (Texture.WHITE.source.constructor as new (o: object) => Texture['source'])({ resource, width: 40, height: 40, resolution: 1 }) });
}

function rig() {
  const shots: ProjectileState[] = [];
  const env = {
    battle: { events: new Emitter<BattleEvents>(), projectiles: shots },
    art: { shadow: Texture.WHITE },
    ctx: { enemyView: () => null, speed: 1, fx: { fleck: vi.fn(() => true), flecks: { count: 0 } } },
    time: 0,
  } as unknown as FieldEnv;
  const layer = new Container();
  return { env, layer, shots, projectiles: new Projectiles(env, layer) };
}

const shot = (uid: number, ghost: boolean): ProjectileState => ({ uid, unitId: 'r_ninja' as UnitId, x: 100, y: 100 * uid, angle: 0, targetUid: 1, ghost });
const body = (layer: Container, n: number): Sprite => (layer.children[2] as Container).children[n] as Sprite;

describe('the pale shuriken of a clone, baked', () => {
  beforeEach(() => {
    setFxSettings({ reducedMotion: false, tier: 'mid' });
    clearGhostStarts();
    bakeable();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('wears the baked pale copy (not the steel picture, and not a tint of it), a little see-through; the ninja\'s own wears the steel one', () => {
    const r = rig();
    const pale = ghostShuriken(steel.texture);
    expect(pale).not.toBeNull();
    expect(pale).not.toBe(steel.texture);
    r.shots.push(shot(1, false), shot(2, true));
    r.env.time = 1;
    r.projectiles.update();
    expect(body(r.layer, 0).texture).toBe(steel.texture);
    expect(body(r.layer, 0).tint).toBe(0xffffff);
    expect(body(r.layer, 1).texture).toBe(pale);
    // Baked: the pale picture is not tinted a second time.
    expect(body(r.layer, 1).tint).toBe(0xffffff);
    expect(body(r.layer, 1).alpha).toBeLessThan(1);
    r.projectiles.destroy();
  });

  it('gives a pooled sprite its steel picture back when the next shuriken is a real one', () => {
    const r = rig();
    r.shots.push(shot(1, true));
    r.env.time = 1;
    r.projectiles.update();
    const sprite = body(r.layer, 0);
    expect(sprite.texture).not.toBe(steel.texture);
    r.shots.length = 0;
    r.env.time = 1.5;
    r.projectiles.update();
    r.shots.push(shot(2, false));
    r.env.time = 2;
    r.projectiles.update();
    expect(body(r.layer, 0).texture).toBe(steel.texture);
    expect(body(r.layer, 0).alpha).toBe(1);
    r.projectiles.destroy();
  });
});
