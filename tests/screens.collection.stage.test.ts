import { Graphics, Rectangle, Texture } from 'pixi.js';
import { afterEach, describe, expect, it, vi } from 'vitest';

// Text cannot be measured without a canvas: a label is a rectangle as wide as its letters.
vi.mock('@/ui', async (original) => ({
  ...(await original<typeof import('@/ui')>()),
  uiLabel: (text: string) => new Graphics().rect(0, 0, text.length * 14, 24).fill(0),
}));

vi.mock('@/fx', () => ({
  fxTex: () => ({ id: 'wedge', texture: Texture.WHITE, w: 256, h: 64, ax: 0, ay: 0.5 }),
  fxTexture: () => Texture.WHITE,
}));

// The chest pictures the stage asks for: a test registers the sizes it wants and the stage finds them by key.
const pictures = vi.hoisted(() => new Map<string, { w: number; h: number }>());
vi.mock('@/core/assets', async (original) => {
  const { Rectangle: Rect, Texture: Tex } = await import('pixi.js');
  const made = new Map<string, InstanceType<typeof Tex>>();
  return {
    ...(await original<typeof import('@/core/assets')>()),
    hasTex: (key: string) => pictures.has(key),
    tex: (key: string) => {
      const size = pictures.get(key);
      if (!size) throw new Error('no picture ' + key);
      const id = `${key}:${size.w}x${size.h}`;
      let t = made.get(id);
      if (!t) {
        t = new Tex({ frame: new Rect(0, 0, size.w, size.h), label: id });
        made.set(id, t);
      }
      return t;
    },
  };
});

import { uiTweens } from '@/core/tween';
import { motion } from '@/ui';
import { Color, Rarity } from '@/ui';
import { CrackLight, stageColors, Sunburst } from '../src/screens/shop/chestLight';
import { newPose, popPose, windupPose } from '../src/screens/shop/chestPose';
import { CHEST_SIZE, ChestStage } from '../src/screens/shop/ChestStage';
import { RevealFlow } from '../src/screens/shop/revealFlow';
import type { RevealStack } from '../src/screens/shop/revealPlan';

const RARITIES = ['common', 'rare', 'epic', 'legendary'] as const;

function run(seconds: number): void {
  for (let t = 0; t < seconds; t += 1 / 60) uiTweens.update(1 / 60);
}

const one = (rarity: (typeof RARITIES)[number]): RevealStack[] => [{ key: 'k', unit: null, rarity, count: 1, bonus: false }];

describe('the chest of a reveal', () => {
  afterEach(() => {
    motion.reduced = false;
    pictures.clear();
  });

  it('starts the stage on plain cream paper and gives every rank after it a colour of its own, pale enough to read as light', () => {
    const quiet = stageColors(0);
    expect(quiet.core).toBe(Color.paperLight);
    expect(quiet.edge).toBe(Rarity.common.light);
    const cores = [0, 1, 2, 3].map((rank) => stageColors(rank).core);
    const edges = [0, 1, 2, 3].map((rank) => stageColors(rank).edge);
    expect(new Set(cores).size).toBe(4);
    expect(new Set(edges).size).toBe(4);
    for (const rank of [0, 1, 2, 3]) {
      const { core } = stageColors(rank);
      const mean = (((core >> 16) & 255) + ((core >> 8) & 255) + (core & 255)) / 3;
      expect(mean).toBeGreaterThan(190);
    }
    // Out of range ranks are the nearest one: nothing throws and nothing is invented.
    expect(stageColors(-3)).toBe(stageColors(0));
    expect(stageColors(9)).toBe(stageColors(3));
  });

  it('without its pictures (the drawn chest) goes through the whole fall, shake and pop and settles', () => {
    for (const best of RARITIES) {
      const stage = new ChestStage('wooden', 1);
      const flow = new RevealFlow(one(best), () => undefined);
      const pose = newPose();
      for (let i = 0; i < 400; i++) {
        flow.update(1 / 60);
        if (flow.chest.phase === 'open') break;
        windupPose(pose, flow.chest, 700);
        expect(() => stage.apply(pose)).not.toThrow();
      }
      stage.open();
      for (let a = 0; a < 1; a += 1 / 30) stage.apply(popPose(pose, a));
      run(1);
      stage.destroy({ children: true });
      expect(() => run(1)).not.toThrow();
    }
  });

  it('puts the cards\' exit above the chest and a pile\'s count on it', () => {
    const stage = new ChestStage('gold', 4);
    expect(stage.opening.y).toBeLessThan(0);
    expect(stage.halfH).toBeGreaterThan(100);
    stage.destroy({ children: true });
  });

  it('works with any chest picture: its size sets the chest, the swap pictures are as wide, the opening stays on the chest', () => {
    // Today's chest is nearly square; a gift box is wide and flat; a tall treasure chest has a lid that rises.
    for (const [w, h, ow, oh] of [[512, 460, 520, 600], [640, 360, 640, 520], [360, 520, 380, 700]] as const) {
      pictures.set('icon_chest_silver', { w, h });
      pictures.set('icon_chest_silver_open', { w: ow, h: oh });
      pictures.set('icon_chest_silver_ajar', { w: w + 20, h: h + 40 });
      const stage = new ChestStage('silver', 1);
      const fit = CHEST_SIZE / Math.max(w, h);
      expect(stage.halfH).toBeCloseTo((h * fit) / 2, 3);
      expect(stage.bodyW).toBeCloseTo(w * fit, 3);
      // The cards leave from inside the open picture: above the foot, below its top.
      const openH = oh * ((w * fit) / ow);
      expect(stage.opening.y).toBeLessThan(0);
      expect(stage.opening.y).toBeGreaterThan(-openH);
      expect(stage.opening.x).toBe(0);
      stage.destroy({ children: true });
    }
  });

  it('flicks to the ajar picture only when it exists, and shows the open one after the pop', () => {
    const visible = (stage: ChestStage): number => {
      let n = 0;
      const walk = (c: { visible: boolean; children?: unknown[]; texture?: Texture }): void => {
        if (!c.visible) return;
        if ('texture' in c && c.texture && c.texture.label?.startsWith('icon_chest_gold')) n++;
        for (const k of (c.children ?? []) as (typeof c)[]) walk(k);
      };
      walk(stage);
      return n;
    };
    pictures.set('icon_chest_gold', { w: 400, h: 400 });
    pictures.set('icon_chest_gold_open', { w: 400, h: 500 });
    const plain = new ChestStage('gold', 1);
    const pose = newPose();
    pose.ajar = true;
    plain.apply(pose);
    expect(visible(plain)).toBe(1);
    plain.open();
    plain.apply(newPose());
    expect(visible(plain)).toBe(1);
    plain.destroy({ children: true });

    pictures.set('icon_chest_gold_ajar', { w: 400, h: 420 });
    const rich = new ChestStage('gold', 1);
    const labelOf = (stage: ChestStage): string[] => {
      const out: string[] = [];
      const walk = (c: { visible: boolean; children?: unknown[]; texture?: Texture }): void => {
        if (!c.visible) return;
        if ('texture' in c && c.texture && c.texture.label?.startsWith('icon_chest_gold')) out.push(c.texture.label);
        for (const k of (c.children ?? []) as (typeof c)[]) walk(k);
      };
      walk(stage);
      return out;
    };
    expect(labelOf(rich)[0]).toContain('400x400');
    rich.apply({ ...pose, ajar: true });
    expect(labelOf(rich)).toEqual(['icon_chest_gold_ajar:400x420']);
    rich.apply({ ...pose, ajar: false });
    expect(labelOf(rich)[0]).toContain('400x400');
    rich.open();
    expect(labelOf(rich)).toEqual(['icon_chest_gold_open:400x500']);
    rich.apply({ ...pose, ajar: true });
    expect(labelOf(rich)).toEqual(['icon_chest_gold_open:400x500']);
    rich.destroy({ children: true });
  });

  it('leaves its picture whole: one sprite of the whole texture, no halves cut along a seam', () => {
    pictures.set('icon_chest_wood', { w: 400, h: 400 });
    const stage = new ChestStage('wooden', 3);
    const rig = stage.children[1] as { children: { texture?: Texture }[] };
    const pics = rig.children.filter((c) => c.texture?.label?.startsWith('icon_chest_wood'));
    expect(pics).toHaveLength(1);
    expect(pics[0]?.texture?.frame).toEqual(new Rectangle(0, 0, 400, 400));
    stage.destroy({ children: true });
  });

  it("hangs nothing on the chest that could say what is inside: no label, no tag, only pictures, the light and a pile's count", () => {
    for (const count of [1, 3]) {
      const stage = new ChestStage('gold', count);
      const texts: string[] = [];
      const walk = (c: { children?: unknown[]; text?: unknown }): void => {
        if (typeof c.text === 'string') texts.push(c.text);
        for (const k of (c.children ?? []) as (typeof c)[]) walk(k);
      };
      walk(stage);
      expect(texts).toEqual([]);
      // The light, the picture and, on a pile, the count that says how many: nothing hangs from a corner.
      const rig = stage.children[1] as { children: unknown[] };
      expect(rig.children).toHaveLength(count > 1 ? 3 : 2);
      stage.destroy({ children: true });
    }
  });

  it('opens at once without motion: the open picture takes over and the light is out', () => {
    motion.reduced = true;
    const stage = new ChestStage('silver', 1);
    stage.setLight(0xffffff, 0xcccccc);
    stage.apply({ ...newPose(), glow: 1 });
    stage.open();
    run(0.1);
    expect(() => stage.apply({ ...newPose(), glow: 1 })).not.toThrow();
    stage.destroy({ children: true });
  });

  it("lets the light leak out behind the picture on a hop, in the stage's colour, and puts it out when the lid is open", () => {
    pictures.set('icon_chest_gold', { w: 400, h: 400 });
    pictures.set('icon_chest_gold_open', { w: 400, h: 500 });
    const stage = new ChestStage('gold', 1);
    const rig = stage.children[1] as { children: { texture?: Texture }[] };
    const crack = rig.children[0] as unknown as { visible: boolean; alpha: number; children: { tint: number }[] };
    // The first thing in the rig, so every picture is drawn over it and only what lies past the picture's edge shows.
    expect(rig.children[1]?.texture?.label?.startsWith('icon_chest_gold')).toBe(true);
    expect(crack.visible).toBe(false);
    stage.setLight(0x112233, 0x445566);
    stage.apply({ ...newPose(), glow: 1 });
    expect(crack.visible).toBe(true);
    expect(crack.alpha).toBe(1);
    expect(crack.children[0]?.tint).toBe(0x445566);
    expect(crack.children[1]?.tint).toBe(0x112233);
    stage.apply({ ...newPose(), glow: 0.3 });
    expect(crack.alpha).toBeLessThan(0.5);
    stage.apply({ ...newPose(), glow: 0 });
    expect(crack.visible).toBe(false);
    stage.apply({ ...newPose(), glow: 1 });
    stage.open();
    expect(crack.visible).toBe(false);
    stage.apply({ ...newPose(), glow: 1 });
    expect(crack.visible).toBe(false);
    stage.destroy({ children: true });
  });
});

describe('the sunburst', () => {
  it('widens behind the closed chest with every promotion and never shrinks, then swells at the pop and spins up before it settles to a slow turn', () => {
    const sun = new Sunburst(0xffffff, 0xcccccc, 600, 0.5);
    sun.update(0);
    const small = sun.scale.x;
    sun.setLevel(0.5);
    sun.update(1);
    const mid = sun.scale.x;
    expect(mid).toBeGreaterThan(small);
    // The widening is eased, not a jump.
    const eased = new Sunburst(0xffffff, 0xcccccc, 600, 0.5);
    eased.update(0);
    eased.setLevel(1);
    eased.update(0.05);
    expect(eased.scale.x).toBeGreaterThan(small);
    expect(eased.scale.x).toBeLessThan(0.9);
    eased.destroy({ children: true });
    sun.setLevel(0.2);
    sun.update(1);
    expect(sun.scale.x).toBeCloseTo(mid, 3);
    sun.burst(0.6);
    sun.update(0.01);
    const before = sun.rotation;
    sun.update(0.05);
    const fast = (sun.rotation - before) / 0.05;
    sun.update(3);
    const r = sun.rotation;
    sun.update(0.05);
    const slow = (sun.rotation - r) / 0.05;
    expect(fast).toBeGreaterThan(slow * 2);
    expect(slow).toBeGreaterThan(0);
    expect(sun.alpha).toBeCloseTo(0.6, 2);
    expect(sun.scale.x).toBeGreaterThan(1);
    sun.destroy({ children: true });
  });

  it('swells and spins up when the best card is flourished, then settles', () => {
    const sun = new Sunburst(0xffffff, 0xcccccc, 600, 0.5);
    sun.burst(0.3);
    sun.update(2);
    const calm = sun.scale.x;
    const turned = sun.rotation;
    sun.update(0.05);
    const idle = sun.rotation - turned;
    sun.punch();
    sun.update(0.05);
    expect(sun.scale.x).toBeGreaterThan(calm * 1.15);
    expect(sun.rotation - turned - idle).toBeGreaterThan(idle * 3);
    sun.update(1);
    expect(sun.scale.x).toBeCloseTo(calm, 3);
    sun.destroy({ children: true });
  });

  it('follows the opacity it is asked for and fades out when told to', () => {
    const sun = new Sunburst(0xffffff, 0xcccccc, 600, 0.5);
    sun.burst(0.3);
    sun.update(0.5);
    sun.setPeak(0.5);
    sun.update(1);
    expect(sun.alpha).toBeCloseTo(0.5, 2);
    sun.stop(0.4);
    sun.update(0.5);
    expect(sun.visible).toBe(false);
    sun.destroy({ children: true });
  });

  it('flips to the colour it is given: the long rays take the edge, the short ones the core', () => {
    const sun = new Sunburst(0x111111, 0x222222, 600, 0.5);
    const tints = (): number[] => (sun.children as unknown as { tint: number }[]).map((c) => c.tint);
    expect(tints().filter((t, i) => (i % 2 === 0 ? t === 0x222222 : t === 0x111111))).toHaveLength(14);
    sun.setTint(0xaa0000, 0x00bb00);
    expect(tints().filter((t, i) => (i % 2 === 0 ? t === 0x00bb00 : t === 0xaa0000))).toHaveLength(14);
    sun.destroy({ children: true });
  });

  it('can be a second ring of other rays that turns the other way, faster or slower on demand, and stays hidden until it is wanted', () => {
    const sun = new Sunburst(0xffffff, 0xcccccc, 600, 0.5, false, { rays: 10, dir: -1 });
    expect(sun.children).toHaveLength(10);
    sun.setLevel(1);
    sun.update(2);
    const a = sun.rotation;
    sun.update(0.1);
    expect(sun.rotation).toBeLessThan(a);
    const slow = a - sun.rotation;
    sun.setSpin(3);
    const b = sun.rotation;
    sun.update(0.1);
    expect(b - sun.rotation).toBeGreaterThan(slow * 2);
    sun.setOn(false);
    sun.update(0.1);
    expect(sun.visible).toBe(false);
    sun.setOn(true);
    sun.update(0.1);
    expect(sun.visible).toBe(true);
    sun.destroy({ children: true });
  });

  it('eases to the opacity it is asked for before the pop, bolder for a better colour, and takes it at once without motion', () => {
    const sun = new Sunburst(0xffffff, 0xcccccc, 600, 0.3);
    sun.update(0);
    expect(sun.alpha).toBeCloseTo(0.3, 3);
    sun.setBody(0.8);
    sun.update(0.05);
    expect(sun.alpha).toBeGreaterThan(0.3);
    expect(sun.alpha).toBeLessThan(0.8);
    sun.update(2);
    expect(sun.alpha).toBeCloseTo(0.8, 2);
    sun.destroy({ children: true });
    const still = new Sunburst(0xffffff, 0xcccccc, 600, 0.3, true);
    still.setBody(0.7);
    still.update(0.01);
    expect(still.alpha).toBeCloseTo(0.7, 3);
    still.destroy({ children: true });
  });

  it('kicks harder and spins up when punched (a promotion), then settles; a kick is no swell without motion', () => {
    const sun = new Sunburst(0xffffff, 0xcccccc, 600, 0.5);
    sun.setLevel(0.5);
    sun.update(2);
    const calm = sun.scale.x;
    sun.punch();
    sun.update(0.05);
    expect(sun.scale.x).toBeGreaterThan(calm * 1.15);
    sun.update(1.5);
    expect(sun.scale.x).toBeCloseTo(calm, 3);
    sun.destroy({ children: true });
    const still = new Sunburst(0xffffff, 0xcccccc, 600, 0.5, true);
    still.setLevel(0.5);
    still.update(1);
    const rest = still.scale.x;
    still.punch();
    still.update(0.05);
    expect(still.scale.x).toBe(rest);
    expect(still.rotation).toBe(0);
    still.destroy({ children: true });
  });

  it('is still without motion: the same burst, no turning and no pop', () => {
    const sun = new Sunburst(0xffffff, 0xcccccc, 600, 0.5, true);
    sun.setLevel(0.6);
    sun.update(1);
    sun.burst(0.4);
    sun.update(1);
    expect(sun.rotation).toBe(0);
    expect(sun.alpha).toBeCloseTo(0.4, 2);
    sun.destroy({ children: true });
  });
});

describe('the light out of the lid', () => {
  it("is a fan of wedges pointing up that takes the stage's colour and follows the glow it is given", () => {
    const light = new CrackLight(300);
    expect(light.visible).toBe(false);
    light.setTint(0x010101, 0x020202);
    const tints = (light.children as unknown as { tint: number }[]).map((c) => c.tint);
    expect(tints.filter((t, i) => t === (i % 2 === 0 ? 0x020202 : 0x010101))).toHaveLength(light.children.length);
    for (const c of light.children) expect(Math.sin(c.rotation)).toBeLessThan(-0.4);
    light.setGlow(0.5);
    const half = light.scale.x;
    light.setGlow(1);
    expect(light.scale.x).toBeGreaterThan(half);
    expect(light.alpha).toBe(1);
    light.destroy({ children: true });
  });
});
