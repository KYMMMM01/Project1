import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Container, Texture, type Sprite } from 'pixi.js';

vi.mock('@/fx/textures', () => ({
  ensureFxTextures: () => undefined,
  fxTex: () => ({ texture: Texture.WHITE, w: 64, h: 64, ax: 0.5, ay: 0.5 }),
  fxTexture: () => Texture.WHITE,
  fxVignette: () => Texture.WHITE,
}));

// Every bake is a texture of its own, so a test can tell which one a sprite shows.
vi.mock('@/fx/areaArt', () => ({ bakeArea: () => new Texture() }));

import { AREA_WARN, AreaLayer, type DiscKind } from '@/fx/areas';
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

const DISCS: readonly DiscKind[] = ['frost', 'brew', 'void', 'haste', 'heal'];

beforeEach(() => {
  setFxSettings({ reducedMotion: false });
});

/** How many frames in `seconds` moved the first bubble of the first area (a brew cloud's motif is pooled sprites it places every update). */
function motifMoves(count: number, seconds: number): number {
  const layer = new AreaLayer(new Container());
  for (let i = 0; i < count; i++) layer.disc('brew', 100 * i, 0, 100);
  advance(layer, 1);
  const root = (layer as unknown as { parent: Container }).parent.children[0] as Container;
  const motif = root.children[3] as Container;
  const bubble = motif.children[0] as Container;
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
  beforeEach(() => setFxSettings({ reducedMotion: false, tier: 'mid' }));

  it('a few areas move their motifs every frame', () => {
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
    const parent = (layer as unknown as { parent: Container }).parent;
    const first = parent.children.map((root) => ((root as Container).children[3] as Container).children[0]?.position.y);
    layer.update(DT);
    const moved = parent.children.filter((root, i) => ((root as Container).children[3] as Container).children[0]?.position.y !== first[i]).length;
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
    const root = (layer as unknown as { parent: Container }).parent.children[0] as Container;
    // Entrance over: 95 px reach on a shape drawn at 100.
    expect(root.scale.x).toBeCloseTo(0.95, 1);
    layer.destroy();
  });

  it('starts small and settles (the landing), but not under reduced motion', () => {
    const layer = new AreaLayer(new Container());
    layer.disc('brew', 0, 0, 100);
    const root = (layer as unknown as { parent: Container }).parent.children[0] as Container;
    layer.update(DT);
    expect(root.scale.x).toBeLessThan(0.7);
    advance(layer, 0.6);
    expect(root.scale.x).toBeCloseTo(1, 1);
    layer.destroy();
    setFxSettings({ reducedMotion: true });
    const calm = new AreaLayer(new Container());
    calm.disc('brew', 0, 0, 100);
    const r2 = (calm as unknown as { parent: Container }).parent.children[0] as Container;
    calm.update(DT);
    expect(r2.scale.x).toBeCloseTo(1, 2);
    calm.destroy();
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
    const root = (layer as unknown as { parent: Container }).parent.children[0] as Container;
    expect(root.position.x).toBe(40);
    layer.destroy();
  });

  it('warns in the last second: the sheet draws in, dims and loses its dashes; none of that before', () => {
    const layer = new AreaLayer(new Container());
    const h = layer.disc('frost', 0, 0, 100);
    const root = (layer as unknown as { parent: Container }).parent.children[0] as Container;
    advance(layer, 0.6);
    h.setLeft(AREA_WARN + 1, 4);
    layer.update(DT);
    const calmScale = root.scale.x;
    expect(calmScale).toBeCloseTo(1, 1);
    h.setLeft(0.05, 4);
    layer.update(DT);
    expect(root.scale.x).toBeLessThan(calmScale * 0.9);
    // The dashed ring is all gone at the end of the warning.
    expect((root.children[2] as Container).visible).toBe(false);
    layer.destroy();
  });

  it('thins the dashed ring in three steps: a different baked ring at each, none at the end', () => {
    const layer = new AreaLayer(new Container());
    const h = layer.disc('brew', 0, 0, 100);
    const root = (layer as unknown as { parent: Container }).parent.children[0] as Container;
    const dash = root.children[2] as Sprite;
    advance(layer, 0.6);
    const seen = new Set<Texture>();
    for (const warn of [0, 0.4, 0.7, 0.95]) {
      // `left` of 0 is the end of the warning; the span is the last second of a four second life.
      h.setLeft(AREA_WARN * (1 - warn), 4);
      layer.update(DT);
      expect(dash.visible).toBe(warn < 0.9);
      if (dash.visible) seen.add(dash.texture);
    }
    expect(seen.size).toBe(3);
    layer.destroy();
  });

  it('a short life warns for a third of itself, never less than a third of a second', () => {
    const layer = new AreaLayer(new Container());
    const h = layer.disc('void', 0, 0, 100);
    const root = (layer as unknown as { parent: Container }).parent.children[0] as Container;
    advance(layer, 0.6);
    // 1.2 s in all: the warning is 0.42 s, so 0.8 s left is still calm.
    h.setLeft(0.8, 1.2);
    layer.update(DT);
    expect(root.scale.x).toBeCloseTo(1, 1);
    h.setLeft(0.1, 1.2);
    layer.update(DT);
    expect(root.scale.x).toBeLessThan(0.95);
    layer.destroy();
  });

  it('under reduced motion the ending is still shown: smaller, dimmer, dashes missing, nothing blinking', () => {
    setFxSettings({ reducedMotion: true });
    const layer = new AreaLayer(new Container());
    const h = layer.disc('brew', 0, 0, 100);
    const root = (layer as unknown as { parent: Container }).parent.children[0] as Container;
    advance(layer, 0.4);
    const before = root.alpha;
    h.setLeft(0.1, 4);
    const seen: number[] = [];
    for (let i = 0; i < 90; i++) {
      layer.update(DT);
      seen.push(root.alpha);
    }
    expect(root.scale.x).toBeLessThan(0.9);
    expect(root.alpha).toBeLessThan(before);
    // Steady: no frame differs from the one before it (no blinking).
    expect(new Set(seen.map((a) => a.toFixed(3))).size).toBe(1);
    layer.destroy();
  });

  it('with motion the ending blinks, but no faster than 3 Hz', () => {
    const layer = new AreaLayer(new Container());
    const h = layer.disc('frost', 0, 0, 100);
    const root = (layer as unknown as { parent: Container }).parent.children[0] as Container;
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
    const root = (layer as unknown as { parent: Container }).parent.children[0] as Container;
    expect(root.position.x).toBe(300);
    expect(root.position.y).toBe(220);
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

/** The areas module with nothing baked yet (the bakes are kept for the whole session, as in the game). */
async function freshAreas(): Promise<typeof import('@/fx/areas')> {
  vi.resetModules();
  return import('@/fx/areas');
}

describe('baking a kind piece by piece (the warm-up)', () => {
  it('is baked once every piece has been, and a piece is baked once', async () => {
    const m = await freshAreas();
    expect(m.areaBaked('void')).toBe(false);
    expect(m.AREA_BAKE_STEPS).toBe(4);
    for (let step = 0; step < m.AREA_BAKE_STEPS - 1; step++) m.bakeAreaStep('void', step);
    expect(m.areaBaked('void')).toBe(false);
    m.bakeAreaStep('void', m.AREA_BAKE_STEPS - 1);
    expect(m.areaBaked('void')).toBe(true);
    // The first area of the kind uses the baked pieces and bakes nothing more.
    const layer = new m.AreaLayer(new Container());
    const pieces = (layer as unknown as { parent: Container }).parent;
    layer.disc('void', 0, 0, 100);
    const area = pieces.children[0] as Container;
    const sheet = (area.children[1] as Sprite).texture;
    layer.disc('void', 0, 0, 100);
    expect(((pieces.children[1] as Container).children[1] as Sprite).texture).toBe(sheet);
  });

  it('bakes what is missing when an area starts before the warm-up got to its kind', async () => {
    const m = await freshAreas();
    expect(m.areaBaked('frost')).toBe(false);
    const layer = new m.AreaLayer(new Container());
    layer.disc('frost', 0, 0, 100);
    expect(m.areaBaked('frost')).toBe(true);
  });

  it('builds a view ahead of time only for a baked kind, and only one while it waits unused', async () => {
    const m = await freshAreas();
    const layer = new m.AreaLayer(new Container());
    expect(layer.ready('heal')).toBe(false);
    for (let step = 0; step < m.AREA_BAKE_STEPS; step++) m.bakeAreaStep('heal', step);
    expect(layer.ready('heal')).toBe(true);
    expect(layer.ready('heal')).toBe(false);
    // The ready view is the one the first area uses: starting one builds nothing more.
    const root = (layer as unknown as { parent: Container }).parent;
    const before = countAll(root);
    layer.disc('heal', 10, 10, 100);
    expect(countAll(root)).toBe(before);
    expect(layer.count).toBe(1);
  });

  it('knows every kind it can draw', async () => {
    const m = await freshAreas();
    expect([...m.DISC_KINDS].sort()).toEqual(['brew', 'frost', 'haste', 'heal', 'void']);
  });
});
