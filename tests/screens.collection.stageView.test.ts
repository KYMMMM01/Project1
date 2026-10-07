import type { Container } from 'pixi.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** What the reveal asks of the game, the audio, the effects and the kit, faked just far enough to play it through: nothing here draws. */
const kit = vi.hoisted(() => ({
  updaters: new Set<(dt: number) => void>(),
  resizers: new Set<() => void>(),
  sounds: [] as string[],
  acked: [] as number[],
  buttons: [] as Array<{ label: string; tap: (() => void) | null; visible: boolean }>,
  keys: [] as Array<(e: { key: string; preventDefault: () => void }) => void>,
  removedKeys: 0,
  popup: null as unknown as Container,
}));

vi.mock('@/core/game', async () => {
  const { Container: C } = await import('pixi.js');
  kit.popup = new C();
  return {
    game: {
      popupLayer: kit.popup, w: 720, h: 1280, safeTop: 0, safeBottom: 0, scale: 1, shakeEnabled: true, shakeScale: 1,
      onUpdate: (fn: (dt: number) => void) => {
        kit.updaters.add(fn);
        return () => kit.updaters.delete(fn);
      },
      events: {
        on: (_: string, fn: () => void) => {
          kit.resizers.add(fn);
          return () => kit.resizers.delete(fn);
        },
      },
    },
  };
});
vi.mock('@/audio', () => ({
  audio: {
    play: (id: string) => void kit.sounds.push(id),
    playStep: (id: string) => void kit.sounds.push(id),
    stinger: (id: string) => void kit.sounds.push('stinger:' + id),
    duck: () => undefined,
  },
}));
vi.mock('@/fx', async () => {
  const { Container: C, Texture: T } = await import('pixi.js');
  class Fx {
    readonly root = new C();
    readonly ps = { burst: () => 0 };
    constructor(target: Container) {
      target.addChild(this.root);
    }
    update(): void {}
    clear(): void {}
    dustPuff(): void {}
    confettiRain(): void {}
    destroy(): void {
      this.root.destroy({ children: true });
    }
  }
  return {
    Fx,
    fxTex: () => ({ id: 'wedge', texture: T.WHITE, w: 256, h: 64, ax: 0, ay: 0.5 }),
    fxTexture: () => T.WHITE,
    screenFx: { flash: () => true },
  };
});
vi.mock('@/meta', () => ({ profile: { ackReveal: (id: number) => void kit.acked.push(id) } }));
vi.mock('@/ui', async (original) => {
  const real = await original<typeof import('@/ui')>();
  const { Container: C } = await import('pixi.js');
  class FakeText extends C {
    style = { wordWrapWidth: 0 };
    constructor(public text = '') {
      super();
    }
  }
  class Button extends C {
    readonly record: { label: string; tap: (() => void) | null; visible: boolean };
    constructor(o: { label?: string }) {
      super();
      this.record = { label: o.label ?? '', tap: null, visible: true };
      kit.buttons.push(this.record);
    }
    onTap(fn: (() => void) | null): this {
      this.record.tap = fn;
      return this;
    }
    setEnabled(): this {
      return this;
    }
    startPulse(): this {
      return this;
    }
    override get visible(): boolean {
      return this.record.visible;
    }
    override set visible(v: boolean) {
      if (this.record) this.record.visible = v;
    }
  }
  class PaperLabel extends C {
    setMaxWidth(): void {}
    setText(): void {}
  }
  class Tag extends C {
    readonly uiBox = { x: 0, y: 0, w: 80, h: 30 };
  }
  return { ...real, uiLabel: (text: string) => new FakeText(String(text)), numberText: () => new FakeText(''), Button, PaperLabel, Tag, drawFloor: () => undefined };
});

import { uiTweens } from '@/core/tween';
import { motion } from '@/ui';
import '@/meta/strings';
import '../src/screens/shop/strings';
import { playChestReveal } from '../src/screens/shop/ChestReveal';
import type { ChestResult } from '@/meta/types';

const result = (id: number, extra: Partial<ChestResult> = {}): ChestResult =>
  ({
    id, kind: 'silver', seed: id, oddsVersion: 1, upgraded: 0, overflowGold: 0, pity: { unit: null, cards: 0 },
    cards: [
      { rarity: 'common', unit: 'w_paw' }, { rarity: 'common', unit: null }, { rarity: 'rare', unit: 'r_archer' }, { rarity: 'epic', unit: 'm_storm' },
    ],
    ...extra,
  }) as ChestResult;

/** Advance the game by `seconds` the way its ticker does: the shared UI clock, then every updater. */
function run(seconds: number, dt = 1 / 60): void {
  for (let t = 0; t < seconds - 1e-9; t += dt) {
    uiTweens.update(dt);
    for (const fn of [...kit.updaters]) fn(dt);
  }
}

const reveal = (): Container => kit.popup.children[0] as Container;
const floor = (): Container => ((reveal().children[0] as Container).children[0] as Container);
const press = (label: string): void => {
  const b = kit.buttons.find((x) => x.label === label);
  if (!b?.tap) throw new Error('no button ' + label);
  b.tap();
};
const tapFloor = (): void => void floor().emit('pointertap', {} as never);

/** A promise made watchable: how many times it has settled. */
function watch(p: Promise<void>): { settled: () => number } {
  let n = 0;
  void p.then(() => n++);
  return { settled: () => n };
}

describe('the chest reveal, played in a fake game', () => {
  beforeEach(() => {
    vi.stubGlobal('window', {
      addEventListener: (type: string, fn: (e: { key: string; preventDefault: () => void }) => void) => {
        if (type === 'keydown') kit.keys.push(fn);
      },
      removeEventListener: (type: string) => {
        if (type === 'keydown') kit.removedKeys++;
      },
    });
    kit.popup.removeChildren().forEach((c) => c.destroy({ children: true }));
    kit.sounds.length = 0;
    kit.acked.length = 0;
    kit.buttons.length = 0;
    kit.keys.length = 0;
    kit.removedKeys = 0;
  });
  afterEach(() => {
    motion.reduced = false;
    vi.unstubAllGlobals();
    expect(kit.updaters.size).toBe(0);
    expect(kit.resizers.size).toBe(0);
  });

  it('plays out by itself, acknowledges the result once, and resolves once when the player presses OK', async () => {
    const w = watch(playChestReveal([result(7)]));
    run(1.5);
    expect(kit.acked).toEqual([]);
    run(8);
    expect(kit.acked).toEqual([7]);
    expect(kit.buttons.find((b) => b.label === '확인')?.visible).toBe(true);
    await Promise.resolve();
    expect(w.settled()).toBe(0);
    press('확인');
    run(1);
    await Promise.resolve();
    expect(w.settled()).toBe(1);
    expect(kit.acked).toEqual([7]);
    expect(kit.popup.children).toHaveLength(0);
    expect(kit.removedKeys).toBe(1);
  });

  it('answers every event on the frame it falls due: the thud on the landing, the creak before the pop, no sound from nowhere', () => {
    void playChestReveal([result(1)]);
    run(0.1);
    expect(kit.sounds).toEqual(['whoosh']);
    run(0.25);
    expect(kit.sounds).toEqual(['whoosh', 'reel_stop']);
    run(0.2);
    expect(kit.sounds.slice(-1)).toEqual(['chest_shake']);
    run(1.5);
    expect(kit.sounds.filter((s) => s === 'chest_open')).toHaveLength(1);
    expect(kit.sounds.filter((s) => s === 'chest_shake')).toHaveLength(3);
    expect(kit.sounds.indexOf('chest_open')).toBeGreaterThan(kit.sounds.lastIndexOf('chest_shake'));
    press('건너뛰기');
    run(2);
    press('확인');
    run(1);
  });

  it('is cracked open by three taps, each one a burst, and then hurried card by card', async () => {
    const w = watch(playChestReveal([result(2)]));
    run(0.35);
    const t0 = kit.sounds.length;
    tapFloor();
    run(0.05);
    tapFloor();
    run(0.05);
    tapFloor();
    run(0.05);
    expect(kit.sounds.slice(t0).filter((s) => s === 'chest_shake')).toHaveLength(3);
    // The held breath is the only thing left between the third tap and the pop.
    run(0.6);
    expect(kit.sounds).toContain('chest_open');
    const opened = kit.sounds.length;
    run(0.3);
    expect(kit.sounds.slice(opened)).toContain('whoosh');
    for (let i = 0; i < 40; i++) {
      tapFloor();
      run(0.05);
    }
    run(2);
    expect(kit.acked).toEqual([2]);
    press('확인');
    run(1);
    await Promise.resolve();
    expect(w.settled()).toBe(1);
  });

  it('is skipped from any frame and still resolves once, with the result acknowledged once', async () => {
    for (const at of [0, 0.15, 0.9, 1.7, 2.6, 3.8]) {
      kit.buttons.length = 0;
      kit.acked.length = 0;
      const w = watch(playChestReveal([result(30)]));
      run(at);
      press('건너뛰기');
      run(1.5);
      expect(kit.acked).toEqual([30]);
      press('확인');
      run(1);
      await Promise.resolve();
      expect(w.settled()).toBe(1);
      expect(kit.acked).toEqual([30]);
    }
  });

  it('leaves no half faded hint behind when the skip stops its fade', () => {
    void playChestReveal([result(50)]);
    // The first burst has started and the hint is fading out; the skip stops that tween.
    run(0.5);
    const hint = (reveal().children[1] as Container).children[1] as Container;
    expect(hint.visible).toBe(true);
    press('건너뛰기');
    expect(hint.visible).toBe(false);
    run(1);
    press('확인');
    run(1);
  });

  it('answers Escape the same way: the first one skips, the next leaves', async () => {
    const w = watch(playChestReveal([result(5)]));
    run(1);
    const key = kit.keys[kit.keys.length - 1];
    key?.({ key: 'Escape', preventDefault: () => undefined });
    run(1);
    expect(kit.acked).toEqual([5]);
    key?.({ key: 'Escape', preventDefault: () => undefined });
    run(1);
    await Promise.resolve();
    expect(w.settled()).toBe(1);
  });

  it('is taken down by the app at any time: it resolves once, releases everything and acknowledges nothing it did not show', async () => {
    for (const at of [0.2, 1.0, 2.4, 4]) {
      kit.acked.length = 0;
      const w = watch(playChestReveal([result(9)]));
      run(at);
      reveal().destroy({ children: true });
      await Promise.resolve();
      expect(w.settled()).toBe(1);
      expect(kit.updaters.size).toBe(0);
      expect(kit.resizers.size).toBe(0);
      expect(() => run(1)).not.toThrow();
      expect(w.settled()).toBe(1);
      expect(kit.acked).toEqual([]);
    }
  });

  it('plays a pile as one opening and acknowledges every chest of it', async () => {
    const pile = [result(11, { batch: 4 }), result(12, { batch: 4 }), result(13, { batch: 4 })];
    const w = watch(playChestReveal(pile));
    run(14);
    expect(kit.acked).toEqual([11, 12, 13]);
    expect(kit.sounds.filter((s) => s === 'chest_open')).toHaveLength(1);
    press('확인');
    run(1);
    await Promise.resolve();
    expect(w.settled()).toBe(1);
  });

  it('plays the same information in order without motion: no fall, no shake, the same summary', async () => {
    motion.reduced = true;
    const w = watch(playChestReveal([result(21)]));
    run(0.3);
    expect(kit.sounds).not.toContain('reel_stop');
    run(0.4);
    expect(kit.sounds).toContain('chest_open');
    run(6);
    expect(kit.sounds).not.toContain('chest_shake');
    // One flip for each beat: the commons together, the rare and the epic card on their own.
    expect(kit.sounds.filter((s) => s === 'card_flip')).toHaveLength(3);
    expect(kit.acked).toEqual([21]);
    press('확인');
    run(1);
    await Promise.resolve();
    expect(w.settled()).toBe(1);
  });

  it('keeps the floor tappable: nothing over it takes the tap', () => {
    void playChestReveal([result(40)]);
    const shaker = reveal().children[0] as Container;
    for (const layer of shaker.children.slice(1)) expect(layer.eventMode).toBe('none');
    expect(floor().eventMode).toBe('static');
    press('건너뛰기');
    run(1);
    press('확인');
    run(1);
  });
});
