import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Container, Sprite, Texture } from 'pixi.js';

vi.mock('@/fx/textures', () => ({
  ensureFxTextures: () => undefined,
  fxTex: () => ({ texture: Texture.WHITE, w: 256, h: 64, ax: 0, ay: 0.5 }),
  fxTexture: () => Texture.WHITE,
  fxVignette: () => Texture.WHITE,
}));

import { game } from '@/core/game';
import { Tweener } from '@/core/tween';
import { flyTo, type FlyHandle } from '@/fx/flyTo';
import {
  floatBob,
  hitFlash,
  juiceStats,
  kickObject,
  popIn,
  popOut,
  pulseLoop,
  punchScale,
  rattleObject,
  shakeObject,
  squash,
  wobbleRotation,
} from '@/fx/juice';
import { Rays, makeSpritePool } from '@/fx/rays';
import { ScreenFx } from '@/fx/screen';
import { fxSettings, setFxSettings } from '@/fx/settings';

const DT = 1 / 60;

function run(tw: Tweener, seconds: number): void {
  for (let t = 0; t < seconds - 1e-9; t += DT) tw.update(DT);
}

beforeEach(() => {
  setFxSettings({ reducedMotion: false, flashes: true });
});

describe('scale juice', () => {
  it('popOut then popIn brings the object back at its own scale (was stuck at 0)', () => {
    const tw = new Tweener();
    const c = new Container();
    c.scale.set(0.8);
    popOut(tw, c, { ms: 100 });
    run(tw, 0.3);
    expect(c.visible).toBe(false);
    expect(c.scale.x).toBeCloseTo(0.8);
    popIn(tw, c, { ms: 100 });
    run(tw, 0.3);
    expect(c.visible).toBe(true);
    expect(c.scale.x).toBeCloseTo(0.8);
    expect(c.scale.y).toBeCloseTo(0.8);
    expect(c.alpha).toBe(1);
  });

  it('popOut hands the object back hidden but at full alpha, so showing it again works', () => {
    const tw = new Tweener();
    const c = new Container();
    popOut(tw, c, { ms: 100 });
    run(tw, 0.3);
    expect(c.visible).toBe(false);
    expect(c.alpha).toBe(1);
    expect(c.scale.x).toBe(1);
  });

  it('popIn on an object whose game code zeroed the scale still ends at the natural scale', () => {
    const tw = new Tweener();
    const c = new Container();
    c.scale.set(0);
    popIn(tw, c, { ms: 100 });
    run(tw, 0.3);
    expect(c.scale.x).toBeCloseTo(1);

    const d = new Container();
    d.scale.set(1.5);
    punchScale(tw, d, 0.2, 100);
    run(tw, 0.2);
    d.scale.set(0);
    popIn(tw, d, { ms: 100 });
    run(tw, 0.3);
    expect(d.scale.x).toBeCloseTo(1.5);
  });

  it('popIn stays hidden through its delay', () => {
    const tw = new Tweener();
    const c = new Container();
    popIn(tw, c, { ms: 100, delay: 0.2 });
    run(tw, 0.1);
    expect(c.scale.x).toBe(0);
    expect(c.alpha).toBe(0);
    run(tw, 0.4);
    expect(c.scale.x).toBeCloseTo(1);
    expect(c.alpha).toBe(1);
  });

  it('a punch that interrupts a popIn leaves the object fully shown', () => {
    const tw = new Tweener();
    const c = new Container();
    popIn(tw, c, { ms: 300 });
    run(tw, 0.05);
    expect(c.alpha).toBeLessThan(1);
    punchScale(tw, c, 0.2, 100);
    run(tw, 0.3);
    expect(c.alpha).toBe(1);
    expect(c.scale.x).toBeCloseTo(1);
  });

  it('killing the Tweener mid-pop leaves the object at rest, not half grown', () => {
    const tw = new Tweener();
    const c = new Container();
    c.scale.set(2);
    popIn(tw, c, { ms: 400 });
    run(tw, 0.1);
    tw.killAll();
    return Promise.resolve().then(() => {
      expect(c.scale.x).toBeCloseTo(2);
      expect(c.alpha).toBe(1);
    });
  });

  it('squash and punch survive being killed and restarted', async () => {
    const tw = new Tweener();
    const c = new Container();
    squash(tw, c, 1.3, 0.7, 300);
    run(tw, 0.05);
    squash(tw, c, 1.2, 0.8, 300);
    run(tw, 0.05);
    tw.killAll();
    await Promise.resolve();
    expect(c.scale.x).toBeCloseTo(1);
    expect(c.scale.y).toBeCloseTo(1);
  });

  it('does not touch a destroyed object', async () => {
    const tw = new Tweener();
    const c = new Container();
    punchScale(tw, c, 0.3, 200);
    run(tw, 0.05);
    c.destroy();
    expect(() => {
      run(tw, 0.3);
      tw.killAll();
    }).not.toThrow();
    await Promise.resolve();
  });
});

describe('looping juice', () => {
  it('floatBob and pulseLoop on destroyed targets end their tweens (no leak)', () => {
    const tw = new Tweener();
    for (let i = 0; i < 30; i++) {
      const c = new Container();
      floatBob(tw, c);
      pulseLoop(tw, c);
      c.destroy();
    }
    run(tw, 0.2);
    expect(tw.count).toBe(0);
  });

  it('stop() puts the object back and ends the loop; a restart does not stack offsets', () => {
    const tw = new Tweener();
    const c = new Container();
    c.y = 100;
    const h1 = floatBob(tw, c, 10, 1);
    run(tw, 0.3);
    expect(c.y).toBeLessThan(100);
    const h2 = floatBob(tw, c, 10, 1);
    expect(c.y).toBeCloseTo(100);
    expect(h1.alive).toBe(false);
    run(tw, 0.3);
    h2.stop();
    expect(c.y).toBeCloseTo(100);
    expect(h2.alive).toBe(false);
  });

  it('a killed Tweener leaves a bobbing object where it started', async () => {
    const tw = new Tweener();
    const c = new Container();
    c.y = 50;
    floatBob(tw, c, 12, 1);
    pulseLoop(tw, c, 0.1, 0.5);
    run(tw, 0.27);
    expect(c.y).not.toBe(50);
    tw.killAll();
    await Promise.resolve();
    expect(c.y).toBeCloseTo(50);
    expect(c.scale.x).toBeCloseTo(1);
  });

  it('pulseLoop with a repeat count ends at rest', () => {
    const tw = new Tweener();
    const c = new Container();
    const h = pulseLoop(tw, c, 0.1, 0.4, 2);
    run(tw, 2);
    expect(h.alive).toBe(false);
    expect(c.scale.x).toBeCloseTo(1);
  });

  it('is off under reduced motion', () => {
    setFxSettings({ reducedMotion: true });
    const tw = new Tweener();
    const c = new Container();
    expect(floatBob(tw, c).alive).toBe(false);
    expect(pulseLoop(tw, c).alive).toBe(false);
    expect(tw.count).toBe(0);
  });
});

describe('offset juice', () => {
  it('shake, wobble, kick and rattle all return the object exactly to rest', () => {
    const tw = new Tweener();
    const c = new Container();
    c.position.set(100, 200);
    c.rotation = 0.5;
    shakeObject(tw, c, 10, 200, 'both');
    wobbleRotation(tw, c, 20, 300);
    kickObject(tw, c, 12, -8, 150);
    rattleObject(tw, c, { ms: 250 });
    run(tw, 0.08);
    expect(c.x === 100 && c.y === 200).toBe(false);
    run(tw, 0.6);
    expect(c.x).toBeCloseTo(100);
    expect(c.y).toBeCloseTo(200);
    expect(c.rotation).toBeCloseTo(0.5);
  });

  it('a killed Tweener (scene restart) puts offsets back', async () => {
    const tw = new Tweener();
    const c = new Container();
    c.position.set(100, 100);
    shakeObject(tw, c, 10, 300, 'both');
    wobbleRotation(tw, c, 20, 300);
    kickObject(tw, c, 20, 20, 200);
    rattleObject(tw, c, { ms: 300 });
    run(tw, 0.05);
    expect(c.x === 100 && c.y === 100).toBe(false);
    tw.killAll();
    await Promise.resolve();
    expect(c.x).toBeCloseTo(100);
    expect(c.y).toBeCloseTo(100);
    expect(c.rotation).toBeCloseTo(0);
  });

  it('restarting a channel mid-way never double-restores', async () => {
    const tw = new Tweener();
    const c = new Container();
    c.position.set(10, 10);
    shakeObject(tw, c, 8, 200, 'both');
    run(tw, 0.04);
    shakeObject(tw, c, 8, 200, 'both');
    wobbleRotation(tw, c, 10, 300);
    run(tw, 0.04);
    wobbleRotation(tw, c, 10, 300);
    await Promise.resolve();
    run(tw, 0.6);
    expect(c.x).toBeCloseTo(10);
    expect(c.y).toBeCloseTo(10);
    expect(c.rotation).toBeCloseTo(0);
  });

  it('compose with game code moving the object meanwhile', () => {
    const tw = new Tweener();
    const c = new Container();
    kickObject(tw, c, 20, 0, 200);
    for (let i = 0; i < 6; i++) {
      c.x += 5; // the unit keeps walking
      tw.update(DT);
    }
    run(tw, 0.4);
    expect(c.x).toBeCloseTo(30);
  });

  it('local motion shrinks under reduced motion', () => {
    const peak = (): number => {
      const tw = new Tweener();
      const c = new Container();
      kickObject(tw, c, 20, 0, 200);
      let m = 0;
      for (let i = 0; i < 14; i++) {
        tw.update(DT);
        m = Math.max(m, Math.abs(c.x));
      }
      return m;
    };
    const full = peak();
    setFxSettings({ reducedMotion: true });
    expect(peak()).toBeLessThan(full * 0.5);
  });
});

describe('hitFlash', () => {
  function unit(): { parent: Container; sprite: Sprite } {
    const parent = new Container();
    const sprite = new Sprite(Texture.WHITE);
    parent.addChild(sprite);
    return { parent, sprite };
  }

  it('adds one overlay above the sprite and returns it to the pool when finished', () => {
    const tw = new Tweener();
    const { parent, sprite } = unit();
    hitFlash(tw, sprite);
    expect(parent.children.length).toBe(2);
    expect(parent.children[1]).not.toBe(sprite);
    const idleWhileFlashing = juiceStats().overlaysIdle;
    run(tw, 0.2);
    expect(parent.children.length).toBe(1);
    expect(juiceStats().overlaysIdle).toBe(idleWhileFlashing + 1);
  });

  it('a killed Tweener must not strand the overlay on the parent', async () => {
    const tw = new Tweener();
    const { parent, sprite } = unit();
    sprite.position.set(100, 100);
    hitFlash(tw, sprite);
    run(tw, 0.02);
    tw.killAll();
    await Promise.resolve();
    expect(parent.children.length).toBe(1);
  });

  it('restarting while a flash runs reuses one overlay and releases it once', async () => {
    const tw = new Tweener();
    const { parent, sprite } = unit();
    const before = juiceStats();
    hitFlash(tw, sprite);
    run(tw, 0.02);
    hitFlash(tw, sprite);
    await Promise.resolve();
    expect(parent.children.length).toBe(2);
    run(tw, 0.2);
    expect(parent.children.length).toBe(1);
    // Two flashes, but the second reused the first one's overlay: at most one new object.
    expect(juiceStats().overlaysCreated - before.overlaysCreated).toBeLessThanOrEqual(1);
  });

  it('a sprite destroyed mid-flash drops its overlay at once', () => {
    const tw = new Tweener();
    const { parent, sprite } = unit();
    hitFlash(tw, sprite);
    run(tw, 0.01);
    sprite.destroy();
    run(tw, 0.05);
    expect(parent.children.length).toBe(0);
  });

  it('is a no-op for a sprite that has no parent', () => {
    const tw = new Tweener();
    const s = new Sprite(Texture.WHITE);
    expect(() => hitFlash(tw, s)).not.toThrow();
  });
});

describe('Rays', () => {
  it('moveTo and setColor are safe after the rays expired', () => {
    const root = new Container();
    const r = new Rays(makeSpritePool(), 0, 0, root, { duration: 0.2 });
    r.update(0.5);
    expect(r.alive).toBe(false);
    expect(() => {
      r.moveTo(5, 5);
      r.setColor(0xff0000);
      r.stop();
    }).not.toThrow();
    expect(root.children.length).toBe(0);
  });

  it('moveTo works while alive', () => {
    const r = new Rays(makeSpritePool(), 0, 0, new Container(), {});
    r.moveTo(40, 50);
    expect(r.container.x).toBe(40);
    expect(r.container.y).toBe(50);
    r.dispose();
  });
});

describe('flyTo', () => {
  function fly(tw: Tweener, parent: Container, extra: Record<string, unknown> = {}): { handle: FlyHandle; log: string[] } {
    const log: string[] = [];
    const handle = flyTo({
      from: { x: 100, y: 100 },
      to: { x: 600, y: 60 },
      count: 5,
      texture: Texture.WHITE,
      parent,
      tweens: tw,
      onArrive: (i) => log.push(`arrive${i}`),
      onDone: () => log.push('done'),
      ...extra,
    });
    return { handle, log };
  }

  it('lands every icon, fires onArrive per icon and onDone once, and leaves nothing behind', async () => {
    const tw = new Tweener();
    const parent = new Container();
    const { handle, log } = fly(tw, parent);
    expect(parent.children.length).toBe(5);
    run(tw, 3);
    await handle.done;
    expect(parent.children.length).toBe(0);
    expect(log.filter((l) => l.startsWith('arrive')).length).toBe(5);
    expect(log.filter((l) => l === 'done').length).toBe(1);
    expect(handle.active).toBe(false);
  });

  it('a killed Tweener (scene exit) removes the icons and settles `done` without onDone', async () => {
    const tw = new Tweener();
    const parent = new Container();
    const { handle, log } = fly(tw, parent);
    run(tw, 0.3);
    tw.killAll();
    await handle.done;
    expect(parent.children.length).toBe(0);
    expect(handle.active).toBe(false);
    expect(log).not.toContain('done');
  });

  it('cancel() drops the icons, resolves done and stays silent', async () => {
    const tw = new Tweener();
    const parent = new Container();
    const { handle, log } = fly(tw, parent);
    run(tw, 0.2);
    handle.cancel();
    await handle.done;
    run(tw, 3);
    expect(parent.children.length).toBe(0);
    expect(log).toEqual([]);
  });

  it('a Container target is reached at the centre of its bounds, whatever its anchor', () => {
    const tw = new Tweener();
    const root = new Container();
    const target = new Sprite(Texture.WHITE);
    target.width = 100;
    target.height = 100;
    target.position.set(300, 400);
    root.addChild(target);
    const { handle } = fly(tw, root, {
      from: { x: 0, y: 0 },
      to: target,
      count: 1,
      burstRadius: [0, 0],
      hang: [0, 0],
      flight: [0.5, 0.5],
      burstSeconds: 0.05,
      bulge: [0, 0],
    });
    const icon = root.children[1] as Sprite;
    // One big step to half a millisecond before touchdown: the icon is practically on the target.
    tw.update(0.05 + 0.5 - 0.0005);
    expect(handle.active).toBe(true);
    expect(icon.x).toBeCloseTo(350, -1);
    expect(icon.y).toBeCloseTo(450, -1);
    run(tw, 1);
  });

  it('flies to the origin of an empty container', () => {
    const tw = new Tweener();
    const root = new Container();
    const target = new Container();
    target.position.set(200, 300);
    root.addChild(target);
    const { handle } = fly(tw, root, { to: target, count: 1, burstRadius: [0, 0], hang: [0, 0], flight: [0.4, 0.4], burstSeconds: 0.05, bulge: [0, 0] });
    tw.update(0.05 + 0.4 - 0.0005);
    const icon = root.children[1] as Sprite;
    expect(icon.x).toBeCloseTo(200, -1);
    expect(icon.y).toBeCloseTo(300, -1);
    handle.cancel();
  });
});

describe('ScreenFx', () => {
  let fx: ScreenFx;
  const layers = (): Container[] => game.overlayLayer.children as Container[];

  beforeEach(() => {
    game.time = 100;
    fx = new ScreenFx();
  });

  afterEach(() => {
    fx.destroy();
  });

  it('destroy() during a letterbox slide does not break later frames', () => {
    fx.letterbox(true);
    fx.update(0.05);
    fx.destroy();
    expect(layers().length).toBe(0);
    expect(() => {
      fx.update(0.1);
      fx.update(0.1);
    }).not.toThrow();
  });

  it('is reusable after destroy(): the next effect rebuilds a live layer', () => {
    fx.letterbox(true);
    fx.destroy();
    expect(fx.flash(0xffffff, 0.3, 100)).toBe(true);
    expect(layers().length).toBe(1);
    expect(layers()[0]?.destroyed).toBe(false);
    expect(() => fx.update(0.02)).not.toThrow();
  });

  it('clear() removes the letterbox bars and the danger vignette', () => {
    fx.letterbox(true, { ms: 100 });
    fx.setDanger(1);
    for (let i = 0; i < 30; i++) fx.update(DT);
    expect(fx.letterboxAmount).toBeCloseTo(1);
    const [vignette, , , barTop, barBottom] = (layers()[0] as Container).children as Sprite[];
    expect(barTop?.visible).toBe(true);
    expect(vignette?.visible).toBe(true);
    fx.clear();
    expect(fx.letterboxAmount).toBe(0);
    expect(barTop?.visible).toBe(false);
    expect(barBottom?.visible).toBe(false);
    expect(vignette?.visible).toBe(false);
    expect(fx.dangerLevel).toBe(0);
    // A slide that was running when clear() came must not resume.
    fx.update(0.5);
    expect(fx.letterboxAmount).toBe(0);
  });

  it('bars slide out again', () => {
    fx.letterbox(true, { ms: 100 });
    for (let i = 0; i < 12; i++) fx.update(DT);
    fx.letterbox(false, { ms: 100 });
    for (let i = 0; i < 12; i++) fx.update(DT);
    expect(fx.letterboxAmount).toBe(0);
  });

  it('a flash starts at its peak, never above 0.45, and is gone after its duration', () => {
    expect(fx.flash(0xffffff, 0.9, 100)).toBe(true);
    const flash = (layers()[0] as Container).children[2] as Sprite;
    expect(flash.alpha).toBeCloseTo(0.45);
    expect(flash.visible).toBe(true);
    fx.update(0.05);
    expect(flash.alpha).toBeLessThan(0.45);
    expect(flash.alpha).toBeGreaterThan(0);
    fx.update(0.06);
    expect(flash.visible).toBe(false);
  });

  it('allows at most two flashes per second and washes saturated red', () => {
    expect(fx.flash(0xff0000, 0.3, 100)).toBe(true);
    const flash = (layers()[0] as Container).children[2] as Sprite;
    expect(flash.tint).not.toBe(0xff0000);
    game.time += 0.3;
    expect(fx.flash(0xffffff)).toBe(false);
    game.time += 0.3;
    expect(fx.flash(0xffffff)).toBe(true);
    expect(fx.flashesShown).toBe(2);
  });

  it('no flash and no pulse when flashes are off', () => {
    setFxSettings({ flashes: false });
    expect(fx.flash()).toBe(false);
    fx.vignettePulse();
    expect(layers().length).toBe(0);
  });

  it('a vignette pulse swells `count` times, never faster than 2 Hz, then hides', () => {
    fx.vignettePulse(0xff2a2a, 0.3, 100, 2);
    const pulse = (layers()[0] as Container).children[1] as Sprite;
    let swells = 0;
    let prev = 0;
    let rising = true;
    for (let i = 0; i < 70; i++) {
      fx.update(DT);
      if (pulse.alpha < prev && rising) {
        swells++;
        rising = false;
      } else if (pulse.alpha > prev) {
        rising = true;
      }
      prev = pulse.alpha;
    }
    // 100 ms was raised to the 500 ms floor, so two swells take a second.
    expect(swells).toBe(2);
    expect(pulse.visible).toBe(false);
    expect(fxSettings.flashes).toBe(true);
  });
});
