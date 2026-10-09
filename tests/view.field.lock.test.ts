import { describe, expect, it } from 'vitest';
import { Container, Texture } from 'pixi.js';
import { enemyDef } from '@/game';
import type { EnemyId } from '@/game/api';
import { motion } from '@/ui';
import type { FieldEnv } from '@/view/field/env';
import { LockMarker } from '@/view/field/lockMarker';
import { LOCK_FROM, LOCK_PING, LOCK_SNAP, lockAlpha, lockDiameter, lockPing, lockScale } from '@/view/field/lockMath';
import { bodySize } from '@/view/field/policy';

describe('the lock ring', () => {
  it('is a little wider than the body it holds, whatever the body', () => {
    for (const size of [50, 90, 160]) {
      expect(lockDiameter(size)).toBeGreaterThan(size + 20);
      expect(lockDiameter(size)).toBeLessThan(size + 40);
    }
  });

  it('closes in from far out to its size within a fifth of a second, then only breathes', () => {
    expect(lockScale(0, 0, false)).toBeCloseTo(LOCK_FROM, 6);
    let last = LOCK_FROM + 1;
    for (let age = 0; age <= LOCK_SNAP; age += LOCK_SNAP / 12) {
      const s = lockScale(age, 0, false);
      expect(s).toBeLessThan(LOCK_FROM + 1e-9);
      expect(s).toBeGreaterThan(0.8);
      last = s;
    }
    expect(last).toBeLessThan(1.1);
    for (let t = 0; t < 4; t += 0.1) expect(Math.abs(lockScale(1, t, false) - 1)).toBeLessThan(0.05);
  });

  it('is still and fully there under reduced motion', () => {
    expect(lockScale(0, 3, true)).toBe(1);
    expect(lockAlpha(0, true)).toBe(1);
  });

  it('fades in over the first part of the snap', () => {
    expect(lockAlpha(0, false)).toBe(0);
    expect(lockAlpha(LOCK_SNAP / 3, false)).toBe(1);
  });

  it('sends one ping that grows and fades out and is over after its time', () => {
    const a = lockPing(0);
    expect(a?.[0]).toBeCloseTo(1, 6);
    const first = a?.[1] as number;
    const mid = lockPing(LOCK_PING / 2);
    expect(mid?.[0]).toBeGreaterThan(1);
    expect(mid?.[1] as number).toBeLessThan(first);
    expect(lockPing(LOCK_PING)).toBeNull();
    expect(lockPing(-0.1)).toBeNull();
  });
});

interface Fake {
  env: FieldEnv;
  laser: { active: boolean; lockUid: number };
  enemies: Array<{ uid: number; id: EnemyId; x: number; y: number }>;
  views: Map<number, Container>;
}

function fake(): Fake {
  const laser = { active: true, lockUid: 0 };
  const enemies: Fake['enemies'] = [];
  const views = new Map<number, Container>();
  const white = (): Texture => new Texture({ source: Texture.WHITE.source });
  const env = {
    battle: { laser, enemies },
    art: { ring: white(), lockBrackets: white() },
    ctx: { enemyView: (uid: number) => views.get(uid) ?? null },
  } as unknown as FieldEnv;
  return { env, laser, enemies, views };
}

describe('the lock marker on the field', () => {
  it('shows nothing until the dot locks, then sits on the enemy and follows it', () => {
    const f = fake();
    const layer = new Container();
    const marker = new LockMarker(f.env, layer);
    expect(layer.children).toContain(marker.root);
    marker.update(1 / 60, 0);
    expect(marker.visible).toBe(false);

    f.enemies.push({ uid: 7, id: 'boss_vacuum', x: 300, y: 120 });
    const view = new Container();
    view.position.set(300, 120);
    f.views.set(7, view);
    f.laser.lockUid = 7;
    marker.update(1 / 60, 0);
    expect(marker.visible).toBe(true);
    expect(marker.locked).toBe(7);
    expect(marker.root.position.x).toBe(300);
    view.position.set(340, 150);
    marker.update(1 / 60, 0.1);
    expect(marker.root.position.x).toBe(340);
    expect(marker.root.position.y).toBe(150);
  });

  it('is as wide as the enemy it holds: a boss gets a bigger ring than a cucumber', () => {
    const widthOf = (id: EnemyId): number => {
      const f = fake();
      const marker = new LockMarker(f.env, new Container());
      f.enemies.push({ uid: 1, id, x: 100, y: 100 });
      f.views.set(1, new Container());
      f.laser.lockUid = 1;
      for (let i = 0; i < 30; i++) marker.update(1 / 60, i / 60);
      // The ring sprite is drawn for a 112 px circle (`art.ring`): its scale says how wide it is.
      return (marker.root.children[1]?.scale.x ?? 0) * 112;
    };
    const small = widthOf('cucumber');
    const big = widthOf('boss_vacuum');
    expect(big).toBeGreaterThan(small);
    const def = enemyDef('boss_vacuum');
    expect(big).toBeGreaterThan(bodySize(def.radius, true));
    expect(big).toBeCloseTo(lockDiameter(bodySize(def.radius, true)), -1);
  });

  it('lets go when the lock ends or the laser ends, and does not snap again while it fades', () => {
    const f = fake();
    const marker = new LockMarker(f.env, new Container());
    f.enemies.push({ uid: 3, id: 'boss_blender', x: 100, y: 100 });
    f.views.set(3, new Container());
    f.laser.lockUid = 3;
    for (let i = 0; i < 30; i++) marker.update(1 / 60, i / 60);
    const ring = marker.root.children[1] as Container;
    const settled = ring.scale.x;
    f.laser.lockUid = 0;
    marker.update(1 / 60, 1);
    expect(ring.scale.x).toBeCloseTo(settled, 1);
    f.views.delete(3);
    for (let i = 0; i < 90; i++) marker.update(1 / 60, 1 + i / 60);
    expect(marker.visible).toBe(false);
    f.laser.lockUid = 3;
    f.laser.active = false;
    marker.update(1 / 60, 3);
    expect(marker.locked).toBe(0);
  });

  it('draws the same marker still under reduced motion', () => {
    const was = motion.reduced;
    motion.reduced = true;
    try {
      const f = fake();
      const marker = new LockMarker(f.env, new Container());
      f.enemies.push({ uid: 5, id: 'boss_cloud', x: 100, y: 100 });
      f.views.set(5, new Container());
      f.laser.lockUid = 5;
      marker.update(1 / 60, 0);
      const ring = marker.root.children[1] as Container;
      const a = ring.scale.x;
      marker.update(1 / 60, 2);
      expect(ring.scale.x).toBe(a);
      expect(ring.rotation).toBe(0);
      expect(ring.alpha).toBe(1);
      expect(marker.root.children[0]?.visible).toBe(false);
    } finally {
      motion.reduced = was;
    }
  });
});
