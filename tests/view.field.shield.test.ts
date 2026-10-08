import { beforeEach, describe, expect, it } from 'vitest';
import { Texture } from 'pixi.js';

import { setFxSettings } from '@/fx/settings';
import type { FieldArt } from '@/view/field/art';
import { NEARLY_GONE, RING_LOOKS, RING_SIZES, ShieldRing, nearlyGone, ringBucket, ringWidth } from '@/view/field/shieldRing';

const DT = 1 / 60;

function art(): FieldArt['shieldRing'] {
  const make = (): Texture[] => RING_SIZES.map(() => new Texture());
  return { whole: make(), dashed: make(), lit: make() };
}

function run(r: ShieldRing, seconds: number, share = 1): void {
  for (let t = 0; t < seconds - 1e-9; t += DT) r.update(DT, share);
}

beforeEach(() => setFxSettings({ reducedMotion: false, tier: 'mid' }));

describe('the ring of a shield', () => {
  it('is baked in a few sizes, in the three looks, and a body takes the nearest size', () => {
    expect(RING_LOOKS).toEqual(['whole', 'dashed', 'lit']);
    expect(ringBucket(20)).toBe(0);
    expect(ringBucket(60)).toBe(RING_SIZES.indexOf(56));
    expect(ringBucket(82)).toBe(RING_SIZES.indexOf(84));
    expect(ringBucket(900)).toBe(RING_SIZES.length - 1);
  });

  it('turns dashed when a quarter of the shield is left, not before', () => {
    expect(NEARLY_GONE).toBe(0.25);
    expect(nearlyGone(1)).toBe(false);
    expect(nearlyGone(NEARLY_GONE + 0.01)).toBe(false);
    expect(nearlyGone(NEARLY_GONE - 0.01)).toBe(true);
    expect(nearlyGone(0)).toBe(true);
  });
});

describe('the ring round an enemy', () => {
  it('opens when it is raised and then hugs the body: its size and a few pixels, no more', () => {
    const textures = art();
    const r = new ShieldRing(textures);
    r.raise(60);
    expect(r.raised).toBe(true);
    expect(r.sprite.visible).toBe(true);
    expect(r.sprite.alpha).toBe(0);
    run(r, 1);
    const bucket = ringBucket(60);
    expect(r.sprite.texture).toBe(textures.whole[bucket]);
    // The sprite is a scaled copy of a ring baked at `RING_SIZES[bucket]`: it ends up as wide as the body and a few pixels, no more.
    const wide = r.sprite.scale.x * (RING_SIZES[bucket] as number);
    expect(wide).toBeCloseTo(ringWidth(60), 1);
    expect(wide).toBeGreaterThan(60 * 0.85);
    expect(wide).toBeLessThan(60 + 8);
    expect(r.sprite.alpha).toBe(1);
    r.destroy();
  });

  it('does not breathe or pulse: a strong shield with nothing happening stays exactly the same size and look', () => {
    const r = new ShieldRing(art());
    r.raise(60);
    run(r, 2);
    const seen = new Set<string>();
    for (let t = 0; t < 2; t += DT) {
      r.update(DT, 1);
      seen.add(`${r.sprite.scale.x.toFixed(4)}:${r.sprite.alpha}:${r.showing}`);
    }
    expect(seen.size).toBe(1);
    r.destroy();
  });

  it('turns dashed as the shield runs low and whole again when it is mended', () => {
    const textures = art();
    const r = new ShieldRing(textures);
    r.raise(60);
    run(r, 0.5, 1);
    expect(r.showing).toBe('whole');
    run(r, 0.1, 0.2);
    expect(r.showing).toBe('dashed');
    expect(r.sprite.texture).toBe(textures.dashed[ringBucket(60)]);
    run(r, 0.1, 0.8);
    expect(r.showing).toBe('whole');
    r.destroy();
  });

  it('flashes pale and bumps when it is hit, then settles; a hard blow bumps more', () => {
    const textures = art();
    const r = new ShieldRing(textures);
    r.raise(60);
    run(r, 1);
    const rest = r.sprite.scale.x;
    r.hit(false);
    r.update(DT, 1);
    expect(r.showing).toBe('lit');
    expect(r.sprite.texture).toBe(textures.lit[ringBucket(60)]);
    const plain = r.sprite.scale.x;
    expect(plain).toBeGreaterThan(rest * 1.04);
    run(r, 0.5);
    expect(r.showing).toBe('whole');
    expect(r.sprite.scale.x).toBeCloseTo(rest, 4);
    r.hit(true);
    r.update(DT, 1);
    expect(r.sprite.scale.x).toBeGreaterThan(plain);
    r.destroy();
  });

  it('is not a strobe: a second blow within a tenth of a second does not restart the flash', () => {
    const r = new ShieldRing(art());
    r.raise(60);
    run(r, 1);
    r.hit(false);
    run(r, 0.05);
    r.hit(true);
    r.update(DT, 1);
    // Still the first, plain blow's bump (about 8 %), not a fresh hard one (14 %).
    const rest = ringWidth(60) / (RING_SIZES[ringBucket(60)] as number);
    expect(r.sprite.scale.x / rest).toBeLessThan(1.1);
    r.destroy();
  });

  it('under reduced motion it is simply there, does not bump, and a blow only lights it', () => {
    setFxSettings({ reducedMotion: true });
    const r = new ShieldRing(art());
    r.raise(60);
    expect(r.sprite.alpha).toBe(1);
    const rest = r.sprite.scale.x;
    r.hit(true);
    r.update(DT, 1);
    expect(r.showing).toBe('lit');
    expect(r.sprite.scale.x).toBe(rest);
    r.destroy();
  });

  it('is gone the moment it is dropped, and a dropped ring ignores blows and updates; raising it again starts clean', () => {
    const r = new ShieldRing(art());
    r.raise(60);
    run(r, 0.5, 0.2);
    r.drop();
    expect(r.raised).toBe(false);
    expect(r.sprite.visible).toBe(false);
    r.hit(true);
    r.update(DT, 0.1);
    expect(r.sprite.visible).toBe(false);
    r.raise(40);
    expect(r.sprite.visible).toBe(true);
    expect(r.showing).toBe('whole');
    expect(r.sprite.alpha).toBe(0);
    r.destroy();
  });
});
