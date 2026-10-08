import type { Container } from 'pixi.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** What the reveal asks of the game, the audio, the effects and the kit, faked just far enough to play it through: nothing here draws. */
const kit = vi.hoisted(() => ({
  updaters: new Set<(dt: number) => void>(),
  resizers: new Set<() => void>(),
  sounds: [] as string[],
  steps: [] as Array<{ id: string; step: number }>,
  acked: [] as number[],
  labels: [] as Array<{ text: string; node: Container }>,
  buttons: [] as Array<{ label: string; tap: (() => void) | null; visible: boolean; w: number; h: number; node: Container }>,
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
    playStep: (id: string, step: number) => {
      kit.sounds.push(id);
      kit.steps.push({ id, step });
    },
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
    readonly record: { label: string; tap: (() => void) | null; visible: boolean; w: number; h: number; node: Container };
    constructor(o: { label?: string; width?: number; height?: number }) {
      super();
      this.record = { label: o.label ?? '', tap: null, visible: true, w: o.width ?? 0, h: o.height ?? 0, node: this };
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
    constructor(o: { text?: string } = {}) {
      super();
      kit.labels.push({ text: o.text ?? '', node: this });
    }
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
import { stageColors } from '../src/screens/shop/chestLight';
import { CLIMBS, climbSeed, pickClimb } from '../src/screens/shop/climb';
import { playChestReveal } from '../src/screens/shop/ChestReveal';
import { RevealCard } from '../src/screens/shop/RevealCard';
import type { ChestRarity, ChestResult } from '@/meta/types';

const result = (id: number, extra: Partial<ChestResult> = {}): ChestResult =>
  ({
    id, kind: 'silver', seed: id, oddsVersion: 1, upgraded: 0, overflowGold: 0, pity: { unit: null, cards: 0 },
    cards: [
      { rarity: 'common', unit: 'w_paw' }, { rarity: 'common', unit: null }, { rarity: 'rare', unit: 'r_archer' }, { rarity: 'epic', unit: 'm_storm' },
    ],
    ...extra,
  }) as ChestResult;

const CARDS: Record<ChestRarity, ChestResult['cards']> = {
  common: [{ rarity: 'common', unit: 'w_paw' }, { rarity: 'common', unit: null }],
  rare: [{ rarity: 'common', unit: 'w_paw' }, { rarity: 'rare', unit: 'r_archer' }],
  epic: [{ rarity: 'common', unit: 'w_paw' }, { rarity: 'rare', unit: 'r_archer' }, { rarity: 'epic', unit: 'm_storm' }],
  legendary: [{ rarity: 'common', unit: 'w_paw' }, { rarity: 'rare', unit: 'r_archer' }, { rarity: 'epic', unit: 'm_storm' }, { rarity: 'legendary', unit: 'w_samurai' }],
};

/** A stored result of the given best rank whose seed picks the given climb pattern, found the way a replay would pick it. */
function staged(best: ChestRarity, pattern: string, extra: Partial<ChestResult> = {}): ChestResult {
  for (let seed = 1; seed < 5000; seed++) {
    const r = result(extra.id ?? 100, { cards: CARDS[best], ...extra, seed });
    if (pickClimb(best, climbSeed([r])).id === pattern) return r;
  }
  throw new Error('no seed for ' + pattern);
}

/** Every Text-like node the player can see right now (a node is seen when it and all its parents are visible). */
function seenTexts(): string[] {
  const out: string[] = [];
  const walk = (c: Container, seen: boolean): void => {
    const on = seen && c.visible && c.alpha > 0;
    const t = (c as unknown as { text?: unknown }).text;
    if (on && typeof t === 'string' && t !== '') out.push(t);
    for (const k of c.children) walk(k as Container, on);
  };
  walk(reveal(), true);
  return out;
}

/** A node is seen when it and everything above it is visible. */
function isSeen(node: Container): boolean {
  for (let c: Container | null = node; c; c = c.parent) if (!c.visible || c.alpha <= 0) return false;
  return true;
}

/** The sunburst's long-ray colour right now. */
const sunTint = (): number => ((((reveal().children[0] as Container).children[2] as Container).children[0] as Container).children[0] as unknown as { tint: number }).tint;
const dimAlpha = (): number => ((reveal().children[0] as Container).children[1] as Container).alpha;
const secondRing = (): Container => (((reveal().children[0] as Container).children[2] as Container).children[1] as Container);

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
    kit.steps.length = 0;
    kit.acked.length = 0;
    kit.buttons.length = 0;
    kit.labels.length = 0;
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
    run(12);
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

  it('answers every event on the frame it falls due: the thud on the landing, the chime on the promotion, the creak before the pop, no sound from nowhere', () => {
    void playChestReveal([staged('rare', 'steady')]);
    run(0.1);
    expect(kit.sounds).toEqual(['whoosh']);
    run(0.25);
    expect(kit.sounds).toEqual(['whoosh', 'reel_stop']);
    // The first beat is quiet: a rattle and nothing else.
    run(0.2);
    expect(kit.sounds.slice(2)).toEqual(['chest_shake']);
    // The second beat promotes: the chime and the rattle on the same frame.
    run(0.4);
    expect(kit.sounds.slice(3, 5)).toEqual(['star', 'chest_shake']);
    run(1.2);
    expect(kit.sounds.filter((s) => s === 'chest_open')).toHaveLength(1);
    expect(kit.sounds.filter((s) => s === 'chest_shake')).toHaveLength(2);
    expect(kit.sounds.indexOf('chest_open')).toBeGreaterThan(kit.sounds.lastIndexOf('chest_shake'));
    press('건너뛰기');
    run(2);
    press('확인');
    run(1);
  });

  it('is cracked open by three taps, each one a burst, and then hurried card by card', async () => {
    const w = watch(playChestReveal([staged('epic', 'steady', { id: 2 })]));
    run(0.35);
    const t0 = kit.sounds.length;
    tapFloor();
    run(0.05);
    tapFloor();
    run(0.05);
    tapFloor();
    run(0.05);
    expect(kit.sounds.slice(t0).filter((s) => s === 'chest_shake')).toHaveLength(3);
    // The third beat's tail and the held breath are all that is left between the third tap and the pop.
    run(1.0);
    expect(kit.sounds).toContain('chest_open');
    const opened = kit.sounds.length;
    run(0.8);
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
    for (const at of [0, 0.15, 0.9, 1.7, 2.6, 3.8, 5.2]) {
      kit.buttons.length = 0;
      kit.acked.length = 0;
      const w = watch(playChestReveal([staged('legendary', 'steady', { id: 30 })]));
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

  it('puts nothing on the screen but the skip button while the chest opens: no words, no other control', () => {
    void playChestReveal([staged('legendary', 'steady')]);
    const skip = kit.buttons.find((x) => x.label === '건너뛰기');
    // The only control, in the top right corner, inside the screen and big enough for a thumb.
    expect(skip).toBeDefined();
    expect(skip?.w).toBeGreaterThanOrEqual(88);
    expect(skip?.h).toBeGreaterThanOrEqual(88);
    const node = skip?.node as Container;
    expect(node.x + (skip?.w ?? 0) / 2).toBeLessThanOrEqual(720);
    expect(node.x).toBeGreaterThan(360);
    expect(node.y - (skip?.h ?? 0) / 2).toBeGreaterThanOrEqual(0);
    expect(node.y).toBeLessThan(200);
    let now = 0;
    for (const at of [0.05, 0.2, 0.4, 0.8, 1.2, 1.6, 2.0, 2.5, 3.0, 3.6, 4.2, 4.8]) {
      run(at - now);
      now = at;
      expect(kit.buttons.filter((b) => isSeen(b.node)).map((b) => b.label)).toEqual(['건너뛰기']);
      expect(kit.labels.filter((l) => isSeen(l.node))).toEqual([]);
      // No word anywhere until the cards come out (the pop is at about 3.9 s).
      if (at < 3.8) expect(seenTexts()).toEqual([]);
    }
    press('건너뛰기');
    run(1.5);
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
    run(22);
    expect(kit.acked).toEqual([11, 12, 13]);
    expect(kit.sounds.filter((s) => s === 'chest_open')).toHaveLength(1);
    press('확인');
    run(1);
    await Promise.resolve();
    expect(w.settled()).toBe(1);
  });

  it('plays the same information in order without motion: no fall, no shake, the colour changes still, the same summary', async () => {
    motion.reduced = true;
    const w = watch(playChestReveal([staged('epic', 'steady')]));
    run(0.3);
    expect(kit.sounds).not.toContain('reel_stop');
    // The neutral chest for half a second, then each promotion as a still change of colour, in order.
    expect(sunTint()).toBe(stageColors(0).edge);
    run(0.5);
    expect(sunTint()).toBe(stageColors(1).edge);
    expect(kit.steps.filter((x) => x.id === 'star').map((x) => x.step)).toEqual([2]);
    run(0.5);
    expect(sunTint()).toBe(stageColors(2).edge);
    expect(kit.steps.filter((x) => x.id === 'star').map((x) => x.step)).toEqual([2, 4]);
    run(0.6);
    expect(kit.sounds).toContain('chest_open');
    run(9);
    expect(kit.sounds).not.toContain('chest_shake');
    // One flip for each beat: the commons together, the rare and the epic card on their own, and the silhouette's turn.
    expect(kit.sounds.filter((s) => s === 'card_flip')).toHaveLength(4);
    expect(kit.acked).toHaveLength(1);
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

describe('the climb as the player sees it', () => {
  beforeEach(() => {
    vi.stubGlobal('window', { addEventListener: () => undefined, removeEventListener: () => undefined });
    kit.popup.removeChildren().forEach((c) => c.destroy({ children: true }));
    for (const list of [kit.sounds, kit.steps, kit.acked, kit.buttons, kit.labels, kit.keys]) list.length = 0;
  });
  afterEach(() => {
    motion.reduced = false;
    vi.unstubAllGlobals();
  });

  const finish = (): void => {
    press('건너뛰기');
    run(1.5);
    press('확인');
    run(1);
    kit.buttons.length = 0;
    kit.labels.length = 0;
  };

  it('starts every opening the same: plain cream light, no rank word, and nothing says a better result is coming', () => {
    for (const best of ['common', 'rare', 'epic', 'legendary'] as const) {
      void playChestReveal([staged(best, CLIMBS[best][0]?.id ?? '')]);
      run(0.05);
      expect(sunTint()).toBe(stageColors(0).edge);
      expect(dimAlpha()).toBe(0);
      expect(secondRing().visible).toBe(false);
      expect(seenTexts()).toEqual([]);
      // Up to the landing nothing but the whoosh and the thud has sounded: no chime, no sting.
      run(0.3);
      expect(kit.sounds).toEqual(['whoosh', 'reel_stop']);
      finish();
      kit.sounds.length = 0;
      kit.buttons.length = 0;
    }
  });

  it('promotes the colour on its beats with a chime a step higher each time, and never past the best rank', () => {
    for (const [best, pattern, steps, ranks] of [
      ['rare', 'steady', [2], [1]],
      ['epic', 'steady', [2, 4], [1, 2]],
      ['legendary', 'steady', [2, 4, 6], [1, 2, 3]],
      ['legendary', 'leap', [4, 6], [2, 3]],
      ['legendary', 'late', [2, 4, 6], [1, 2, 3]],
    ] as const) {
      kit.sounds.length = 0;
      kit.steps.length = 0;
      void playChestReveal([staged(best, pattern)]);
      const seen = new Set<number>();
      for (let i = 0; i < 400; i++) {
        run(1 / 60);
        seen.add(sunTint());
      }
      expect(kit.steps.filter((x) => x.id === 'star').map((x) => x.step)).toEqual(steps);
      // Every colour of the climb was on the sunburst at some time, and no other.
      for (const r of ranks) expect(seen.has(stageColors(r).edge)).toBe(true);
      expect(seen.size).toBe(ranks.length + 1);
      // The chimes rise.
      const chimes = kit.steps.filter((x) => x.id === 'star').map((x) => x.step);
      expect(chimes).toEqual([...chimes].sort((a, b) => a - b));
      finish();
    }
  });

  it('gives the top rank its own show: the floor dims, a second ring of rays turns, a sting plays; a lower rank has none of it', () => {
    void playChestReveal([staged('legendary', 'steady')]);
    // The promotion to the top rank falls at about 2.1 s.
    run(2);
    expect(dimAlpha()).toBe(0);
    expect(secondRing().visible).toBe(false);
    expect(kit.sounds).not.toContain('stinger:mythic');
    run(0.9);
    expect(sunTint()).toBe(stageColors(3).edge);
    expect(dimAlpha()).toBeGreaterThan(0.3);
    expect(secondRing().visible).toBe(true);
    expect(kit.sounds.filter((s) => s === 'stinger:mythic')).toHaveLength(1);
    // The pop lifts the dark again.
    run(2.5);
    expect(dimAlpha()).toBeLessThan(0.1);
    finish();

    kit.sounds.length = 0;
    void playChestReveal([staged('epic', 'steady')]);
    run(3);
    expect(dimAlpha()).toBe(0);
    expect(secondRing().visible).toBe(false);
    expect(kit.sounds).not.toContain('stinger:mythic');
    finish();
  });

  it('is hurried by taps through the whole climb: every tap a beat, every promotion still there, and a tap cuts the top rank\'s long breath down to the creak', () => {
    void playChestReveal([staged('legendary', 'steady')]);
    run(0.35);
    for (let i = 0; i < 4; i++) {
      tapFloor();
      run(0.05);
    }
    expect(kit.steps.filter((x) => x.id === 'star').map((x) => x.step)).toEqual([2, 4, 6]);
    expect(kit.sounds.filter((s) => s === 'chest_shake')).toHaveLength(4);
    // The last beat is over and the breath is held: the open sound has not started until a tap asks for it.
    run(0.7);
    expect(kit.sounds).not.toContain('chest_open');
    expect(dimAlpha()).toBeGreaterThan(0.3);
    tapFloor();
    run(0.02);
    expect(kit.sounds.filter((s) => s === 'chest_open')).toHaveLength(1);
    // A second tap in the creak has nothing to cut, and the pop follows within the creak.
    tapFloor();
    run(0.5);
    expect(kit.sounds.filter((s) => s === 'chest_open')).toHaveLength(1);
    expect(dimAlpha()).toBeLessThan(0.55);
    finish();
  });

  it('replays the same way from the same stored result, and a late climb from another result stalls where the first did not', () => {
    const play = (r: ChestResult): string[] => {
      kit.sounds.length = 0;
      void playChestReveal([r]);
      run(7);
      const out = [...kit.sounds];
      finish();
      return out;
    };
    const steady = staged('legendary', 'steady');
    const first = play(steady);
    const again = play({ ...steady });
    expect(again).toEqual(first);
    const late = staged('legendary', 'late');
    expect(play(late)).not.toEqual(first);
  });

  it('shows the best card of a good chest as a dark silhouette with no name and no count, then peels it away to the card', () => {
    void playChestReveal([staged('legendary', 'steady')]);
    const cards = (): RevealCard[] => {
      const found: RevealCard[] = [];
      const walk = (c: Container): void => {
        if (c instanceof RevealCard) found.push(c);
        for (const k of c.children) walk(k as Container);
      };
      walk(reveal());
      return found;
    };
    const best = cards().find((c) => c.stack.rarity === 'legendary') as RevealCard;
    expect(best).toBeDefined();
    const words = (): string[] => {
      const out: string[] = [];
      const walk = (c: Container, seen: boolean): void => {
        const on = seen && c.visible;
        const t = (c as unknown as { text?: unknown }).text;
        if (on && typeof t === 'string' && t !== '') out.push(t);
        for (const k of c.children) walk(k as Container, on);
      };
      walk(best.face, best.face.visible);
      return out;
    };
    let veiledFrames = 0;
    let named = false;
    for (let i = 0; i < 1200; i++) {
      run(1 / 60);
      if (best.face.visible && best.back.visible === false) {
        if (words().length === 0) veiledFrames++;
        else named = true;
      }
      if (named) break;
    }
    // The silhouette was up for a good while (the epic rank's 0.6 s and the legendary 0.9 s are the shortest), with nothing that names the cat.
    expect(veiledFrames).toBeGreaterThan(40);
    expect(named).toBe(true);
    expect(words().some((w) => w.startsWith('x'))).toBe(true);
    finish();
  });

  it('is skipped from inside the climb and in the middle of the top rank\'s show with the dark gone and the summary there', async () => {
    for (const at of [0.5, 1.5, 3.2, 3.9]) {
      kit.acked.length = 0;
      kit.buttons.length = 0;
      const w = watch(playChestReveal([staged('legendary', 'steady', { id: 60 })]));
      run(at);
      press('건너뛰기');
      run(1.5);
      expect(dimAlpha()).toBe(0);
      expect(kit.acked).toEqual([60]);
      expect(kit.buttons.find((b) => b.label === '확인')?.visible).toBe(true);
      press('확인');
      run(1);
      await Promise.resolve();
      expect(w.settled()).toBe(1);
    }
  });
});
