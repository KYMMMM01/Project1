import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Container, Sprite, Texture } from 'pixi.js';

// The banner is the awakening's own cut-in; only the layer it lands on, the clock it runs on and the text are stand-ins.
const game = vi.hoisted(() => ({ w: 720, h: 1280, overlayLayer: null as unknown as Container, updates: [] as Array<(dt: number) => void> }));
vi.mock('@/core/game', () => ({
  game: {
    get w() {
      return game.w;
    },
    get h() {
      return game.h;
    },
    get overlayLayer() {
      return game.overlayLayer;
    },
    shake: () => undefined,
    onUpdate: (fn: (dt: number) => void) => {
      game.updates.push(fn);
      return () => {
        game.updates.splice(game.updates.indexOf(fn), 1);
      };
    },
  },
}));
vi.mock('@/core/haptics', () => ({ haptic: () => undefined }));
vi.mock('@/fx/textures', () => ({ fxTex: () => ({ id: 'x', texture: Texture.WHITE, w: 64, h: 64, ax: 0.5, ay: 0.5 }) }));
vi.mock('@/ui/text', async (original) => ({
  ...(await original<typeof import('@/ui/text')>()),
  label: () => Object.assign(new Container(), { text: '' }),
}));
vi.mock('@/ui/paper', async (original) => ({
  ...(await original<typeof import('@/ui/paper')>()),
  PaperLabel: class extends Container {},
}));

import { AwakeningCutIn } from '@/fx/cutin';

describe('a banner that takes no taps (a skill\'s cut-in arrives in the middle of whatever the player is doing)', () => {
  let screen: { layer: Container; flash: () => void };
  beforeEach(() => {
    game.overlayLayer = new Container();
    game.updates.length = 0;
    screen = { layer: new Container(), flash: () => undefined };
    game.overlayLayer.addChild(screen.layer);
  });
  afterEach(() => vi.restoreAllMocks());

  /** The full-screen hit area of the banner: the last, white, full-size sprite of its layer. */
  const hitArea = (): Sprite => {
    const layer = game.overlayLayer.children[0] as Container;
    const sprites = layer.children.filter((c) => c instanceof Sprite) as Sprite[];
    return sprites[sprites.length - 1] as Sprite;
  };

  it('is tapped away by default, like an awakening\'s: the hit area takes the press and a tap skips it', () => {
    const cut = new AwakeningCutIn();
    cut.play(Texture.WHITE, 'name', { short: true, screen: screen as never, haptics: false });
    expect(cut.playing).toBe(true);
    expect(hitArea().eventMode).toBe('static');
    for (let i = 0; i < 20; i++) for (const fn of [...game.updates]) fn(1 / 60);
    hitArea().emit('pointerdown', {} as never);
    // The skip starts the exit: the banner is over well before its 0.8 s.
    for (let i = 0; i < 30; i++) for (const fn of [...game.updates]) fn(1 / 60);
    expect(cut.playing).toBe(false);
  });

  it('with `passThrough` the press goes through to what is under it and a tap does not skip it', () => {
    const cut = new AwakeningCutIn();
    cut.play(Texture.WHITE, 'name', { short: true, screen: screen as never, haptics: false, passThrough: true });
    expect(hitArea().eventMode).toBe('none');
    for (let i = 0; i < 20; i++) for (const fn of [...game.updates]) fn(1 / 60);
    // Even if something did emit a press on it, the banner is not cut short by the tap... it is not in the event tree at all.
    expect(cut.playing).toBe(true);
    // It still plays to its own end (0.8 s at the normal tempo).
    for (let i = 0; i < 60; i++) for (const fn of [...game.updates]) fn(1 / 60);
    expect(cut.playing).toBe(false);
  });

  it('plays as fast as its tempo says: the same banner is done in less than two thirds of the time at 1.5x', () => {
    const seconds = (tempo: number): number => {
      const cut = new AwakeningCutIn();
      cut.play(Texture.WHITE, 'name', { short: true, screen: screen as never, haptics: false, tempo });
      let t = 0;
      while (cut.playing && t < 5) {
        for (const fn of [...game.updates]) fn(1 / 60);
        t += 1 / 60;
      }
      return t;
    };
    const normal = seconds(1);
    const fast = seconds(1.5);
    expect(normal).toBeGreaterThan(0.75);
    expect(normal).toBeLessThan(0.9);
    expect(fast).toBeLessThan(normal * 0.7);
    expect(fast).toBeGreaterThan(0.4);
  });
});
