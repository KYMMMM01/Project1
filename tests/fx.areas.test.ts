import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Container, Texture, type Sprite } from 'pixi.js';

vi.mock('@/fx/textures', () => ({
  ensureFxTextures: () => undefined,
  fxTex: () => ({ texture: Texture.WHITE, w: 64, h: 64, ax: 0.5, ay: 0.5 }),
  fxTexture: () => Texture.WHITE,
  fxVignette: () => Texture.WHITE,
}));

import { AREA_PICTURES, AREA_WARN, AreaLayer, DISC_KINDS, type DiscKind } from '@/fx/areas';
import { PAINT_IDS } from '@/fx/paint';
import { setFxSettings } from '@/fx/settings';

const DT = 1 / 60;
function advance(layer: AreaLayer, seconds: number): void {
  for (let t = 0; t < seconds - 1e-9; t += DT) layer.update(DT);
}

/** Every pooled object under a container, counted: pooling means this number stops growing after the first start. */
function countAll(c: Container): number {
  let n = 1;
  for (const child of c.children) n += countAll(child as Container);
  return n;
}

/** The container the areas' own views live in, and the view of the n-th area started. */
const viewsOf = (layer: AreaLayer): Container => (layer as unknown as { parent: Container }).parent;
const rootOf = (layer: AreaLayer, n = 0): Container => viewsOf(layer).children[n] as Container;
/** What a disc is made of, in the order it is built: the base and its turning layers first, then the particles. */
const partsOf = (root: Container): Sprite[] => (root.children[0] as Container).children as Sprite[];

const DISCS: readonly DiscKind[] = ['frost', 'brew', 'void', 'haste', 'heal'];

beforeEach(() => {
  setFxSettings({ reducedMotion: false, flashes: true, tier: 'mid' });
});

/** How many frames in `seconds` moved the first bubble of the first area (a potion pool's bubbles are pooled sprites it places every update). */
function motifMoves(count: number, seconds: number): number {
  const layer = new AreaLayer(new Container());
  for (let i = 0; i < count; i++) layer.disc('brew', 100 * i, 0, 100);
  advance(layer, 1);
  // The base, then the bubbles.
  const bubble = partsOf(rootOf(layer))[1] as Sprite;
  let last = bubble.position.y;
  let moves = 0;
  for (let t = 0; t < seconds - 1e-9; t += DT) {
    layer.update(DT);
    if (bubble.position.y !== last) moves++;
    last = bubble.position.y;
  }
  layer.destroy();
  return moves;
}

describe('ground area motif rate', () => {
  it('a few areas move their particles every frame', () => {
    expect(motifMoves(3, 1)).toBeGreaterThanOrEqual(58);
  });

  it('a crowd of them moves at about 30 a second on the mid tier, and slower on low', () => {
    const mid = motifMoves(12, 1);
    expect(mid).toBeGreaterThanOrEqual(28);
    expect(mid).toBeLessThanOrEqual(31);
    setFxSettings({ tier: 'low' });
    const low = motifMoves(12, 1);
    expect(low).toBeGreaterThanOrEqual(18);
    expect(low).toBeLessThanOrEqual(21);
  });

  it('areas started together do not all move on the same frame', () => {
    const layer = new AreaLayer(new Container());
    for (let i = 0; i < 12; i++) layer.disc('brew', 100 * i, 0, 100);
    const first = viewsOf(layer).children.map((root) => partsOf(root as Container)[1]?.position.y);
    layer.update(DT);
    const moved = viewsOf(layer).children.filter((root, i) => partsOf(root as Container)[1]?.position.y !== first[i]).length;
    expect(moved).toBeLessThan(12);
    expect(moved).toBeGreaterThan(0);
    layer.destroy();
  });
});

describe('ground areas', () => {
  for (const kind of DISCS) {
    it(`${kind}: lands, loops, and gives its view back when it has left`, async () => {
      const into = new Container();
      const layer = new AreaLayer(into);
      const h = layer.disc(kind, 200, 300, 100);
      expect(h.alive).toBe(true);
      expect(layer.count).toBe(1);
      advance(layer, 2);
      expect(h.alive).toBe(true);
      h.stop();
      advance(layer, 0.6);
      expect(h.alive).toBe(false);
      expect(layer.count).toBe(0);
      await expect(h.done).resolves.toBeUndefined();
      layer.destroy();
    });
  }

  it('scales the reference shape to the real reach', () => {
    const layer = new AreaLayer(new Container());
    layer.disc('frost', 0, 0, 95);
    layer.update(0.5);
    // Entrance over: 95 px reach on a shape built at 100.
    expect(rootOf(layer).scale.x).toBeCloseTo(0.95, 1);
    layer.destroy();
  });

  it('lands: starts small and settles with an overshoot, and the black hole opens from a point; none of it under reduced motion', () => {
    const layer = new AreaLayer(new Container());
    layer.disc('brew', 0, 0, 100);
    layer.disc('void', 0, 0, 100);
    layer.update(DT);
    expect(rootOf(layer, 0).scale.x).toBeLessThan(0.7);
    expect(rootOf(layer, 1).scale.x).toBeLessThan(0.3);
    advance(layer, 0.7);
    expect(rootOf(layer, 0).scale.x).toBeCloseTo(1, 1);
    expect(rootOf(layer, 1).scale.x).toBeCloseTo(1, 1);
    layer.destroy();
    setFxSettings({ reducedMotion: true });
    const calm = new AreaLayer(new Container());
    calm.disc('brew', 0, 0, 100);
    calm.update(DT);
    expect(rootOf(calm).scale.x).toBeCloseTo(1, 2);
    calm.destroy();
  });

  it('a ring spreads from the edge as it lands, and is gone after half a second', () => {
    const layer = new AreaLayer(new Container());
    layer.disc('frost', 0, 0, 100);
    // The area's own space holds its layers, then the landing ring.
    const [, land] = rootOf(layer).children as Sprite[];
    layer.update(DT);
    advance(layer, 0.1);
    expect(land?.visible).toBe(true);
    advance(layer, 0.6);
    expect(land?.visible).toBe(false);
    layer.destroy();
  });

  it('pools: starting and ending areas over and over builds nothing after the first', () => {
    const into = new Container();
    const layer = new AreaLayer(into);
    const first = layer.disc('void', 10, 10, 120);
    advance(layer, 0.5);
    first.stop();
    advance(layer, 0.5);
    const built = countAll(into);
    for (let i = 0; i < 20; i++) {
      const h = layer.disc('void', 10 + i, 10, 120);
      advance(layer, 0.3);
      h.stop();
      advance(layer, 0.5);
    }
    expect(countAll(into)).toBe(built);
    // Two at once need two views, and only then.
    const a = layer.disc('void', 0, 0, 100);
    const b = layer.disc('void', 50, 0, 100);
    expect(countAll(into)).toBeGreaterThan(built);
    a.stop();
    b.stop();
    layer.destroy();
  });

  it('a handle from an earlier life cannot steer the view it was recycled into', () => {
    const layer = new AreaLayer(new Container());
    const old = layer.disc('frost', 0, 0, 100);
    old.stop();
    advance(layer, 0.6);
    const fresh = layer.disc('frost', 40, 40, 100);
    expect(old.alive).toBe(false);
    old.stop();
    old.moveTo(500, 500);
    old.setLeft(0);
    advance(layer, 0.2);
    expect(fresh.alive).toBe(true);
    expect(rootOf(layer).position.x).toBe(40);
    layer.destroy();
  });

  it('warns in the last second: the base draws in and blinks; none of that before', () => {
    const layer = new AreaLayer(new Container());
    const h = layer.disc('frost', 0, 0, 100);
    const root = rootOf(layer);
    advance(layer, 0.6);
    h.setLeft(AREA_WARN + 1, 4);
    layer.update(DT);
    const calmScale = root.scale.x;
    expect(calmScale).toBeCloseTo(1, 1);
    expect(root.alpha).toBeCloseTo(1, 2);
    h.setLeft(0.05, 4);
    layer.update(DT);
    expect(root.scale.x).toBeLessThan(calmScale * 0.92);
    // It blinks: some frames of the warning are clearly fainter than the calm picture.
    let low = 1;
    for (let i = 0; i < 40; i++) {
      layer.update(DT);
      low = Math.min(low, root.alpha);
    }
    expect(low).toBeLessThan(0.75);
    layer.destroy();
  });

  it('a short life warns for a third of itself, never less than a third of a second', () => {
    const layer = new AreaLayer(new Container());
    const h = layer.disc('void', 0, 0, 100);
    const root = rootOf(layer);
    advance(layer, 0.7);
    // 1.2 s in all: the warning is 0.42 s, so 0.8 s left is still calm.
    h.setLeft(0.8, 1.2);
    layer.update(DT);
    expect(root.scale.x).toBeCloseTo(1, 1);
    h.setLeft(0.1, 1.2);
    layer.update(DT);
    expect(root.scale.x).toBeLessThan(0.95);
    layer.destroy();
  });

  it('under reduced motion the ending is still shown: smaller, dimmer, nothing blinking', () => {
    setFxSettings({ reducedMotion: true });
    const layer = new AreaLayer(new Container());
    const h = layer.disc('brew', 0, 0, 100);
    const root = rootOf(layer);
    advance(layer, 0.4);
    const before = root.alpha;
    h.setLeft(0.1, 4);
    const seen: number[] = [];
    for (let i = 0; i < 90; i++) {
      layer.update(DT);
      seen.push(root.alpha);
    }
    expect(root.scale.x).toBeLessThan(0.92);
    expect(root.alpha).toBeLessThan(before);
    // Steady: no frame differs from the one before it (no blinking).
    expect(new Set(seen.map((a) => a.toFixed(3))).size).toBe(1);
    layer.destroy();
  });

  it('with the flashes setting off the warning dims steadily instead of blinking', () => {
    setFxSettings({ flashes: false });
    const layer = new AreaLayer(new Container());
    const h = layer.disc('frost', 0, 0, 100);
    const root = rootOf(layer);
    advance(layer, 0.6);
    h.setLeft(0.2, 4);
    const seen = new Set<string>();
    for (let i = 0; i < 90; i++) {
      layer.update(DT);
      seen.add(root.alpha.toFixed(3));
    }
    expect(seen.size).toBe(1);
    layer.destroy();
  });

  it('with motion the ending blinks, but no faster than 3 Hz', () => {
    const layer = new AreaLayer(new Container());
    const h = layer.disc('frost', 0, 0, 100);
    const root = rootOf(layer);
    advance(layer, 0.6);
    h.setLeft(0.2, 4);
    let flips = 0;
    let last = root.alpha;
    for (let i = 0; i < 120; i++) {
      layer.update(DT);
      if (Math.abs(root.alpha - last) > 0.05) flips++;
      last = root.alpha;
    }
    // Two seconds at 2 Hz is about eight edges; the flash-safety limit would allow 12.
    expect(flips).toBeGreaterThan(2);
    expect(flips).toBeLessThanOrEqual(12);
    layer.destroy();
  });

  it('moveTo carries an enemy ring along', () => {
    const layer = new AreaLayer(new Container());
    const h = layer.disc('haste', 10, 10, 120);
    h.moveTo(300, 220);
    expect(rootOf(layer).position.x).toBe(300);
    expect(rootOf(layer).position.y).toBe(220);
    layer.destroy();
  });

  it('clear() takes everything away and hands every view back', async () => {
    const layer = new AreaLayer(new Container());
    const hs = [layer.disc('frost', 0, 0, 90), layer.disc('brew', 0, 0, 90), layer.cell('wet', { x: 0, y: 0, w: 100, h: 104 })];
    layer.clear();
    expect(layer.count).toBe(0);
    for (const h of hs) {
      expect(h.alive).toBe(false);
      await expect(h.done).resolves.toBeUndefined();
    }
    // The views are reusable: the same kind starts again without building another.
    const again = layer.disc('frost', 5, 5, 90);
    expect(again.alive).toBe(true);
    layer.destroy();
  });
});

describe('how each area is built', () => {
  it('the blizzard turns one swirl of flat snow over the ice and lets flakes fall, and the ice is not quite opaque', () => {
    const layer = new AreaLayer(new Container());
    layer.disc('frost', 0, 0, 100);
    advance(layer, 1);
    const [base, swirl] = partsOf(rootOf(layer));
    const r = swirl?.rotation ?? 0;
    advance(layer, 0.5);
    expect((swirl?.rotation ?? 0) - r).toBeGreaterThan(0);
    // The ice is not quite opaque, so the lane reads through it.
    expect(base?.alpha).toBeLessThan(1);
    layer.destroy();
  });

  it('the black hole spirals scraps into its core: they shrink and fade as they arrive, and the hole turns the other way from its arms', () => {
    const layer = new AreaLayer(new Container());
    layer.disc('void', 0, 0, 100);
    advance(layer, 0.8);
    const parts = partsOf(rootOf(layer));
    // The hole, the arms, then eight scraps and four stars.
    const [hole, arms] = parts;
    const r0 = [arms?.rotation ?? 0, hole?.rotation ?? 0];
    advance(layer, 0.4);
    expect((arms?.rotation ?? 0) - r0[0]!).toBeGreaterThan(0);
    expect((hole?.rotation ?? 0) - r0[1]!).toBeLessThan(0);
    const scraps = parts.slice(2, 10);
    const near = scraps.map((s) => Math.hypot(s.x, s.y));
    expect(Math.min(...near)).toBeLessThan(40);
    expect(Math.max(...near)).toBeGreaterThan(70);
    layer.destroy();
  });

  it('the black hole collapses to its core when it leaves, the others only draw in a little', () => {
    const layer = new AreaLayer(new Container());
    const hole = layer.disc('void', 0, 0, 100);
    const ice = layer.disc('frost', 0, 0, 100);
    advance(layer, 0.8);
    hole.stop();
    ice.stop();
    advance(layer, 0.3);
    expect(rootOf(layer, 0).scale.x).toBeLessThan(0.25);
    expect(rootOf(layer, 1).scale.x).toBeGreaterThan(0.8);
    layer.destroy();
  });

  it('a low tier keeps half the particles of an area, a high one all of them', () => {
    setFxSettings({ tier: 'low' });
    const layer = new AreaLayer(new Container());
    layer.disc('frost', 0, 0, 100);
    advance(layer, 1);
    // The base, the swirl, then the six flakes: the first half show, the rest rest.
    const flakes = partsOf(rootOf(layer)).slice(2, 8);
    expect(flakes.filter((f) => f.visible).length).toBe(3);
    setFxSettings({ tier: 'high' });
    const rich = new AreaLayer(new Container());
    rich.disc('frost', 0, 0, 100);
    advance(rich, 1);
    expect(partsOf(rootOf(rich)).slice(2, 8).every((f) => f.visible)).toBe(true);
    layer.destroy();
    rich.destroy();
  });

  it('draws nothing with added light: no glow, no additive container, in any kind of area', () => {
    const layer = new AreaLayer(new Container());
    for (const kind of DISCS) layer.disc(kind, 0, 0, 100);
    layer.cell('wet', { x: 0, y: 0, w: 100, h: 104 });
    layer.cell('zap', { x: 0, y: 200, w: 100, h: 104 });
    advance(layer, 1);
    const stack = [viewsOf(layer) as Container];
    while (stack.length > 0) {
      const c = stack.pop() as Container;
      expect(c.blendMode).not.toBe('add');
      stack.push(...(c.children as Container[]));
    }
    layer.destroy();
  });

  it('piled-up friendly areas thin out: the newer of two that overlap is fainter and keeps fewer particles, the oldest is untouched', () => {
    const layer = new AreaLayer(new Container());
    for (let i = 0; i < 4; i++) layer.disc('frost', 10 * i, 0, 100);
    advance(layer, 1.5);
    const bases = [0, 1, 2, 3].map((n) => (partsOf(rootOf(layer, n))[0] as Sprite).alpha);
    expect(bases[0]).toBeCloseTo(0.92, 2);
    expect(bases[1]).toBeLessThan(bases[0] as number);
    expect(bases[3]).toBeLessThan(bases[1] as number);
    const flakes = (n: number): number => partsOf(rootOf(layer, n)).slice(2, 8).filter((f) => f.visible).length;
    expect(flakes(0)).toBe(6);
    expect(flakes(3)).toBeLessThan(6);
    layer.destroy();
  });

  it('areas that lie far apart do not thin each other, and the hostile rings never thin', () => {
    const layer = new AreaLayer(new Container());
    layer.disc('frost', 0, 0, 100);
    layer.disc('frost', 400, 0, 100);
    layer.disc('haste', 0, 0, 29, 120);
    layer.disc('haste', 0, 0, 29, 120);
    advance(layer, 1.5);
    expect((partsOf(rootOf(layer, 1))[0] as Sprite).alpha).toBeCloseTo(0.92, 2);
    expect((partsOf(rootOf(layer, 3))[0] as Sprite).alpha).toBeCloseTo(0.8, 2);
    expect((partsOf(rootOf(layer, 2))[0] as Sprite).alpha).toBeCloseTo(0.8, 2);
    layer.destroy();
  });

  it('the hole thins out too, and the newest of a pile comes back to full when the older ones leave', () => {
    const layer = new AreaLayer(new Container());
    const old = [layer.disc('void', 0, 0, 100), layer.disc('void', 5, 0, 100), layer.disc('void', 10, 0, 100)];
    layer.disc('void', 15, 0, 100);
    advance(layer, 1.5);
    const faint = (partsOf(rootOf(layer, 3))[0] as Sprite).alpha;
    expect(faint).toBeLessThan(0.7);
    for (const h of old) h.stop();
    advance(layer, 1.5);
    // The newest is now alone.
    expect((partsOf(rootOf(layer, 3))[0] as Sprite).alpha).toBeGreaterThan(faint + 0.2);
    layer.destroy();
  });

  it('the hostile rings turn and beat: chevrons run clockwise, the heal ring turns back and pulses', () => {
    const layer = new AreaLayer(new Container());
    layer.disc('haste', 0, 0, 29, 120);
    layer.disc('heal', 0, 0, 29, 120);
    advance(layer, 0.6);
    const haste = partsOf(rootOf(layer, 0))[0] as Sprite;
    const heal = partsOf(rootOf(layer, 1))[0] as Sprite;
    const a = haste.rotation;
    const b = heal.rotation;
    const sizes = new Set<string>();
    for (let i = 0; i < 90; i++) {
      layer.update(DT);
      sizes.add(heal.scale.x.toFixed(4));
    }
    expect(haste.rotation).toBeGreaterThan(a);
    expect(heal.rotation).toBeLessThan(b);
    expect(sizes.size).toBeGreaterThan(5);
    layer.destroy();
  });

  it('builds a view ahead of time, and only one while it waits unused', () => {
    const layer = new AreaLayer(new Container());
    expect(layer.ready('heal')).toBe(true);
    expect(layer.ready('heal')).toBe(false);
    // The ready view is the one the first area uses: starting one builds nothing more.
    const before = countAll(viewsOf(layer));
    layer.disc('heal', 10, 10, 100);
    expect(countAll(viewsOf(layer))).toBe(before);
    expect(layer.count).toBe(1);
  });

  it('names the drawn pictures of every kind, and each one is a picture the build makes', () => {
    expect([...DISC_KINDS].sort()).toEqual(['brew', 'frost', 'haste', 'heal', 'void']);
    for (const kind of DISC_KINDS) for (const id of AREA_PICTURES[kind]) expect(PAINT_IDS).toContain(id);
    for (const kind of ['frost', 'brew', 'void'] as const) expect(AREA_PICTURES[kind].length).toBeGreaterThan(1);
    // A carrier's ring is a thin line from the shared atlas: it needs no picture of its own.
    expect(AREA_PICTURES.haste).toEqual([]);
    expect(AREA_PICTURES.heal).toEqual([]);
  });

  describe('the rings of an aura carrier', () => {
    /** The drawn circle of a ring: the picture's width on screen times the share of it the circle fills (the test atlas cell is 64 px). */
    const across = (root: Container, part: Sprite, fill: number): number => part.scale.x * 64 * root.scale.x * fill;

    it('is one thin line the size of the body and a few pixels, not the reach of the aura', () => {
      for (const kind of ['haste', 'heal'] as const) {
        const layer = new AreaLayer(new Container());
        layer.disc(kind, 0, 0, 29, 120);
        advance(layer, 2);
        const root = rootOf(layer);
        const ring = partsOf(root)[0] as Sprite;
        expect(across(root, ring, 110 / 128)).toBeCloseTo(58, 0);
        expect(ring.alpha).toBeLessThanOrEqual(0.85);
        expect(ring.alpha).toBeGreaterThan(0.4);
        // No stack of rings, no spreading landing ring, nothing but the line (and its hidden hint).
        expect(partsOf(root).filter((p) => p.visible).length).toBe(1);
        expect(root.children[1]?.visible).toBe(false);
        layer.destroy();
      }
    });

    it('shows its reach faintly for the first moments only, then fades it away', () => {
      const layer = new AreaLayer(new Container());
      layer.disc('haste', 0, 0, 29, 120);
      advance(layer, 0.2);
      const root = rootOf(layer);
      const hint = partsOf(root)[1] as Sprite;
      expect(hint.visible).toBe(true);
      expect(hint.alpha).toBeGreaterThan(0.2);
      expect(hint.alpha).toBeLessThanOrEqual(0.35);
      // The hint's circle is the aura's real radius across.
      expect(across(root, hint, 240 / 256)).toBeCloseTo(240, -1);
      advance(layer, 0.5);
      expect(hint.alpha).toBeLessThan(0.3);
      advance(layer, 1);
      expect(hint.visible).toBe(false);
      layer.destroy();
    });

    it('draws no hint for a ring that is not asked to (another ring of its kind already shows the reach)', () => {
      const layer = new AreaLayer(new Container());
      layer.disc('heal', 0, 0, 29);
      advance(layer, 0.2);
      expect((partsOf(rootOf(layer))[1] as Sprite).visible).toBe(false);
      layer.destroy();
    });

    it('keeps its size and stands still under reduced motion', () => {
      setFxSettings({ reducedMotion: true });
      const layer = new AreaLayer(new Container());
      layer.disc('haste', 0, 0, 29, 120);
      advance(layer, 0.5);
      const root = rootOf(layer);
      expect(across(root, partsOf(root)[0] as Sprite, 110 / 128)).toBeCloseTo(58, 0);
      expect((partsOf(root)[0] as Sprite).rotation).toBe(0);
      layer.destroy();
    });
  });
});

describe('hazard cells', () => {
  const rect = { x: 100, y: 200, w: 100, h: 104 };

  for (const kind of ['wet', 'zap'] as const) {
    it(`${kind}: loops under hazard tape and leaves cleanly`, async () => {
      const layer = new AreaLayer(new Container());
      const h = layer.cell(kind, rect);
      advance(layer, 2);
      expect(h.alive).toBe(true);
      h.setLeft(0.2, 3);
      advance(layer, 0.3);
      h.stop();
      advance(layer, 0.6);
      expect(h.alive).toBe(false);
      await expect(h.done).resolves.toBeUndefined();
      layer.destroy();
    });

    it(`${kind}: runs under reduced motion`, () => {
      setFxSettings({ reducedMotion: true });
      const layer = new AreaLayer(new Container());
      const h = layer.cell(kind, rect);
      advance(layer, 1.5);
      h.setLeft(0.3, 3);
      advance(layer, 0.5);
      expect(h.alive).toBe(true);
      layer.destroy();
    });
  }

  it('a live cell flickers between the drawn bolts', () => {
    const layer = new AreaLayer(new Container());
    layer.cell('zap', rect);
    const root = rootOf(layer);
    const bolts = ((root.children[0] as Container).children as Sprite[]).filter((s) => s.anchor.x === 0.5 && s.alpha > 0 && s.position.y !== 0);
    const seen = new Set<number>();
    for (let i = 0; i < 60; i++) {
      layer.update(DT);
      seen.add(bolts[0]?.scale.x ?? 0);
    }
    // The bolt is mirrored every other flicker: two shapes in a second.
    expect(seen.size).toBeGreaterThan(1);
    layer.destroy();
  });

  it('pools cells by kind and size', () => {
    const into = new Container();
    const layer = new AreaLayer(into);
    const h = layer.cell('wet', rect);
    advance(layer, 0.3);
    h.stop();
    advance(layer, 0.6);
    const built = countAll(into);
    for (let i = 0; i < 10; i++) {
      const c = layer.cell('wet', { ...rect, x: i * 10 });
      advance(layer, 0.2);
      c.stop();
      advance(layer, 0.6);
    }
    expect(countAll(into)).toBe(built);
    layer.destroy();
  });
});
