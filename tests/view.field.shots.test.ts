import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Container, Texture, type Sprite } from 'pixi.js';

vi.mock('@/core/assets', () => ({ tex: () => Texture.WHITE, hasTex: () => true, putTex: () => undefined, imageKeys: () => [] }));
vi.mock('@/fx/textures', () => ({
  ensureFxTextures: () => undefined,
  fxTex: () => ({ texture: Texture.WHITE, w: 64, h: 64, ax: 0.5, ay: 0.5 }),
  fxTexture: () => Texture.WHITE,
  fxVignette: () => Texture.WHITE,
}));

import { Emitter } from '@/core/events';
import { PAINT_IDS } from '@/fx/paint';
import { setFxSettings } from '@/fx/settings';
import { UNIT_IDS, type BattleEvents, type ProjectileState, type UnitId } from '@/game/api';
import { unitSpec } from '@/game';
import { castLook, castSeconds, projectileLook, rankOf, rankSize, rankTrail } from '@/view/field/projectileLooks';
import { Projectiles } from '@/view/field/projectiles';
import type { FieldEnv } from '@/view/field/env';

type Events = BattleEvents;

const DT = 1 / 60;

interface Rig {
  env: FieldEnv;
  layer: Container;
  ev: Emitter<Events>;
  shots: ProjectileState[];
  fleck: ReturnType<typeof vi.fn>;
}

function makeRig(): Rig {
  const ev = new Emitter<Events>();
  const shots: ProjectileState[] = [];
  const fleck = vi.fn(() => true);
  const env = {
    battle: { events: ev, projectiles: shots },
    art: { shadow: Texture.WHITE },
    ctx: { enemyView: () => null, speed: 1, fx: { fleck, flecks: { count: 0 } } },
    time: 0,
  } as unknown as FieldEnv;
  return { env, layer: new Container(), ev, shots, fleck };
}

function shot(uid: number, unitId: UnitId, x: number, y: number, angle: number): ProjectileState {
  return { uid, unitId, x, y, angle, targetUid: 1 };
}

/** The sprites of a shot's body, shadow and streak, which live in three shared containers of the layer. */
const body = (layer: Container, n = 0): Sprite => ((layer.children[2] as Container).children[n] as Sprite);
const shadow = (layer: Container, n = 0): Sprite => ((layer.children[0] as Container).children[n] as Sprite);
const streak = (layer: Container, n = 0): Sprite => ((layer.children[1] as Container).children[n] as Sprite);

function frames(rig: Rig, shots: Projectiles, n: number): void {
  for (let i = 0; i < n; i++) {
    rig.env.time += DT;
    shots.update();
  }
}

beforeEach(() => setFxSettings({ reducedMotion: false, tier: 'mid' }));

describe('what each cat throws', () => {
  const FIRING = UNIT_IDS.filter((id) => unitSpec(id).projectileSpeed > 0);

  it('gives every cat that fires a travelling shot its own painted picture, at a size that reads on a phone', () => {
    const seen = new Set<string>();
    for (const id of FIRING) {
      const look = projectileLook(id);
      expect(PAINT_IDS).toContain(look.paint);
      expect(look.size).toBeGreaterThanOrEqual(30);
      expect(look.size).toBeLessThanOrEqual(100);
      seen.add(look.paint);
    }
    expect(FIRING.length).toBe(11);
    expect(seen.size).toBe(FIRING.length);
  });

  it('points arrows, shards and the fireball along their path, and spins the shuriken, the pebble and the ladle', () => {
    for (const id of ['r_archer', 'r_star', 'r_gunner', 'm_fire', 't_bell'] as UnitId[]) expect(projectileLook(id).oriented).toBe(true);
    for (const id of ['r_ninja', 'r_sling', 't_chef'] as UnitId[]) {
      expect(projectileLook(id).oriented).toBe(false);
      expect(projectileLook(id).spin).toBeGreaterThan(5);
    }
    expect(projectileLook('t_lucky').flip).toBe(true);
  });

  it('throws snowballs, fireballs, ladles and coins on an arc, and flies arrows, corks and shuriken straight', () => {
    for (const id of ['m_snow', 'm_fire', 't_chef', 't_lucky'] as UnitId[]) expect(projectileLook(id).lob).toBeGreaterThan(0);
    for (const id of ['r_archer', 'r_gunner', 'r_ninja', 'r_star'] as UnitId[]) expect(projectileLook(id).lob).toBe(0);
  });

  it('gives the cats that make an area something to throw: a shard of ice, a dark star, a flask', () => {
    expect(castLook('m_frost')?.look.paint).toBe('shot_ice');
    expect(castLook('m_cosmo')?.look.paint).toBe('shot_void');
    expect(castLook('t_alch')?.look.paint).toBe('shot_flask');
    expect(castLook('t_alch')?.look.lob).toBeGreaterThan(0);
    for (const id of UNIT_IDS.filter((u) => !['m_frost', 'm_cosmo', 't_alch'].includes(u))) expect(castLook(id)).toBeNull();
  });

  it('the throw takes between a seventh and two fifths of a second, longer for a longer throw, none for a cat that casts nothing', () => {
    for (const id of ['m_frost', 'm_cosmo', 't_alch'] as UnitId[]) {
      expect(castSeconds(id, 10)).toBeCloseTo(0.14, 5);
      expect(castSeconds(id, 5000)).toBeCloseTo(0.4, 5);
      expect(castSeconds(id, 400)).toBeGreaterThan(castSeconds(id, 200));
    }
    expect(castSeconds('w_paw', 300)).toBe(0);
  });

  it('a higher rank throws a bigger shot with a bolder streak, up to a quarter bigger', () => {
    expect(rankOf('w_paw')).toBe(0);
    expect(rankOf('w_tiger')).toBe(4);
    expect(rankOf('r_sling')).toBeLessThan(rankOf('r_star'));
    expect(rankSize('r_sling')).toBe(1);
    expect(rankSize('r_star')).toBeCloseTo(1.24, 5);
    expect(rankTrail('r_star')).toBeGreaterThan(rankTrail('r_sling'));
  });
});

describe('shots in flight', () => {
  it('shows a picture for each shot the simulation has, turned along a straight path, and gives it back when the shot ends', () => {
    const rig = makeRig();
    const shots = new Projectiles(rig.env, rig.layer);
    rig.shots.push(shot(1, 'r_archer', 100, 100, 0));
    frames(rig, shots, 1);
    expect(body(rig.layer).visible).toBe(true);
    rig.shots[0]!.x = 160;
    rig.shots[0]!.y = 160;
    frames(rig, shots, 1);
    expect(body(rig.layer).rotation).toBeCloseTo(Math.PI / 4, 3);
    rig.shots.length = 0;
    frames(rig, shots, 1);
    expect(body(rig.layer).visible).toBe(false);
    shots.destroy();
  });

  it('pools: shot after shot builds no more sprites than were ever in the air at once', () => {
    const rig = makeRig();
    const shots = new Projectiles(rig.env, rig.layer);
    const made = (): number => (rig.layer.children[2] as Container).children.length;
    const wave = (i: number): void => {
      rig.shots.length = 0;
      rig.shots.push(shot(i, 'm_snow', 100, 100, 0), shot(1000 + i, 'r_ninja', 200, 100, 0));
      frames(rig, shots, 3);
    };
    for (let i = 0; i < 6; i++) wave(i);
    const settled = made();
    // The new pair is made while the old one is still being given back, so four at the most.
    expect(settled).toBeLessThanOrEqual(4);
    for (let i = 6; i < 60; i++) wave(i);
    expect(made()).toBe(settled);
    shots.destroy();
  });

  it('stretches at the launch and settles; a spinning shuriken turns, a pebble and a ladle too', () => {
    const rig = makeRig();
    const shots = new Projectiles(rig.env, rig.layer);
    rig.shots.push(shot(1, 'r_archer', 100, 100, 0), shot(2, 'r_ninja', 100, 300, 0));
    frames(rig, shots, 1);
    const long = body(rig.layer, 0).scale.x / body(rig.layer, 0).scale.y;
    const small = body(rig.layer, 1).scale.x;
    const r0 = body(rig.layer, 1).rotation;
    frames(rig, shots, 12);
    expect(body(rig.layer, 0).scale.x / body(rig.layer, 0).scale.y).toBeLessThan(long);
    expect(body(rig.layer, 1).scale.x).toBeGreaterThan(small);
    expect(body(rig.layer, 1).rotation).not.toBe(r0);
    shots.destroy();
  });

  it('a lobbed shot rises over the stretch it has to cover and comes down at the end; its shadow stays on the ground line', () => {
    const rig = makeRig();
    const shots = new Projectiles(rig.env, rig.layer);
    (rig.env.ctx as unknown as { enemyView: () => { x: number; y: number } }).enemyView = () => ({ x: 400, y: 100 });
    rig.shots.push(shot(1, 'm_fire', 100, 100, 0));
    frames(rig, shots, 1);
    rig.shots[0]!.x = 250;
    frames(rig, shots, 1);
    // Half way: lifted the whole height of the arc, the shadow on the line.
    expect(body(rig.layer).y).toBeLessThan(100 - 25);
    expect(shadow(rig.layer).y).toBeGreaterThan(100);
    rig.shots[0]!.x = 399;
    frames(rig, shots, 1);
    expect(body(rig.layer).y).toBeGreaterThan(100 - 5);
    shots.destroy();
  });

  it('a flat streak trails the shot, and the picture keeps its own colours (nothing is tinted or lit)', () => {
    const rig = makeRig();
    const shots = new Projectiles(rig.env, rig.layer);
    rig.shots.push(shot(1, 'r_star', 100, 100, 0));
    frames(rig, shots, 8);
    expect(streak(rig.layer).visible).toBe(true);
    expect(streak(rig.layer).alpha).toBeGreaterThan(0.3);
    expect(body(rig.layer).tint).toBe(0xffffff);
    expect(rig.layer.children.length).toBe(3);
    shots.destroy();
  });

  it('sheds a little of what it is made of while it flies, and nothing under reduced motion', () => {
    const rig = makeRig();
    const shots = new Projectiles(rig.env, rig.layer);
    rig.shots.push(shot(1, 'm_fire', 100, 100, 0));
    frames(rig, shots, 30);
    expect(rig.fleck.mock.calls.length).toBeGreaterThan(3);
    shots.destroy();
    setFxSettings({ reducedMotion: true });
    const calm = makeRig();
    const still = new Projectiles(calm.env, calm.layer);
    calm.shots.push(shot(1, 'm_fire', 100, 100, 0));
    frames(calm, still, 30);
    expect(calm.fleck).not.toHaveBeenCalled();
    still.destroy();
  });

  it('sheds nothing once the flecks are crowded, so a hit still has room for its own', () => {
    const rig = makeRig();
    (rig.env.ctx.fx as unknown as { flecks: { count: number } }).flecks.count = 60;
    const shots = new Projectiles(rig.env, rig.layer);
    rig.shots.push(shot(1, 'm_fire', 100, 100, 0));
    frames(rig, shots, 30);
    expect(rig.fleck).not.toHaveBeenCalled();
    shots.destroy();
  });
});

describe('the throw of an area', () => {
  function cast(rig: Rig, id: UnitId, zoneUid = 7): void {
    rig.ev.emit('attack', { unit: { id, cell: 7 } as Events['attack']['unit'], targetUid: 1, tx: 500, ty: 300, projectile: null });
    rig.ev.emit('zoneStart', { zone: { uid: zoneUid, unitId: id, x: 500, y: 300, radius: 95, timeLeft: 3, duration: 3 } });
  }

  it('holds the area back while the thing is in the air, then lets it open where it landed', () => {
    for (const id of ['m_frost', 'm_cosmo', 't_alch'] as UnitId[]) {
      const rig = makeRig();
      const shots = new Projectiles(rig.env, rig.layer);
      cast(rig, id);
      expect(shots.castWait(7)).toBeGreaterThan(0);
      expect(body(rig.layer).visible).toBe(true);
      frames(rig, shots, 1);
      expect(shots.castWait(7)).toBeGreaterThan(0);
      frames(rig, shots, 30);
      expect(shots.castWait(7)).toBe(0);
      expect(body(rig.layer).visible).toBe(false);
      // It burst where it landed.
      expect(rig.fleck.mock.calls.length).toBeGreaterThan(2);
      shots.destroy();
    }
  });

  it('a throw is quicker at triple speed, and a cat that makes no area throws nothing', () => {
    const slow = makeRig();
    const a = new Projectiles(slow.env, slow.layer);
    cast(slow, 'm_cosmo');
    const wait1 = a.castWait(7);
    const fast = makeRig();
    (fast.env.ctx as unknown as { speed: number }).speed = 3;
    const b = new Projectiles(fast.env, fast.layer);
    cast(fast, 'm_cosmo');
    expect(b.castWait(7)).toBeLessThan(wait1);
    const none = makeRig();
    const c = new Projectiles(none.env, none.layer);
    cast(none, 'w_paw');
    expect(c.castWait(7)).toBe(0);
    a.destroy();
    b.destroy();
    c.destroy();
  });

  it('shows the area at once under reduced motion', () => {
    setFxSettings({ reducedMotion: true });
    const rig = makeRig();
    const shots = new Projectiles(rig.env, rig.layer);
    cast(rig, 'm_frost');
    expect(shots.castWait(7)).toBe(0);
    shots.destroy();
  });
});
