/**
 * The alchemist's fish chip on the boss strip (`hud/BossBar.ts`, `fishArt.ts`): a pink chip with a ring that runs down while the boss is a fish,
 * a crossed-out one that counts the lock down once it wore off, gone with a new boss, with the boss's death and with the lock's end. The strip
 * listens for the fish events only in a battle with skills. The bar is built for real, out of stand-ins for the UI kit's pieces (no fonts and no
 * canvas in this world).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Container, Texture } from 'pixi.js';

vi.mock('@/core/assets', async (original) => ({ ...(await original<typeof import('@/core/assets')>()), hasTex: () => true, tex: () => Texture.WHITE }));
vi.mock('@/ui', async (original) => {
  const real = await original<typeof import('@/ui')>();
  const { Container } = await import('pixi.js');
  class FakeText extends Container {
    text: string;
    constructor(text = '') {
      super();
      this.text = text;
    }
    override get width(): number {
      return 60;
    }
    override set width(_v: number) {
      // a fixed measure is enough for the layout the tests look at
    }
  }
  class FakeBar extends Container {
    value = 1;
    setValue(v: number): void {
      this.value = v;
    }
  }
  class FakeBag {
    killAll(): void {}
    killKeyed(): void {}
    runKeyed(): void {}
    call(): void {}
  }
  return {
    ...real,
    artLabel: (text: string) => new FakeText(text),
    uiLabel: (text: string) => new FakeText(text),
    drawIcon: () => new Container(),
    drawPaper: () => undefined,
    fitLabel: () => undefined,
    paperShape: () => new Container(),
    paperSeed: () => 1,
    ProgressBar: FakeBar,
    TweenBag: FakeBag,
  };
});
vi.mock('@/core/i18n', async (original) => ({
  ...(await original<typeof import('@/core/i18n')>()),
  t: (key: string, args?: Record<string, unknown>) => (args ? `${key}|${Object.values(args).join(',')}` : key),
}));
vi.mock('@/view/hud/kit', () => ({ enemyPortrait: () => new Container() }));
vi.mock('@/view/info', () => ({ info: { tap: () => undefined } }));
vi.mock('@/view/hud/enemyInfo', () => ({ defenceLine: () => '', enemyInfo: () => ({}) }));

import { Emitter } from '@/core/events';
import type { BattleEvents, EnemyState } from '@/game/api';
import { BossBar } from '@/view/hud/BossBar';

const layout = { w: 720, h: 1280, safeTop: 0, safeBottom: 0, fieldX: 0, fieldY: 200, topH: 168, bottomH: 452 };

function stubDocument(): void {
  const ctx = new Proxy({}, { get: () => () => undefined, set: () => true });
  vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, style: {}, getContext: () => ctx }) });
}

const boss = (uid = 7): EnemyState => ({ uid, id: 'boss_blender', hp: 100, maxHp: 100, shield: 0, maxShield: 0, armorBroken: false }) as unknown as EnemyState;

function make(spOn: boolean) {
  const events = new Emitter<BattleEvents>();
  const first = boss();
  const battle = { spOn, events, time: 10, waveTime: 1, waveDuration: 60, boss: first as EnemyState | null, enemies: [], units: [] };
  const listened: string[] = [];
  const env = {
    battle,
    layout: () => layout,
    on: (emitter: { on(type: string, fn: (p: never) => void): () => void }, type: string, fn: (p: never) => void) => {
      listened.push(type);
      emitter.on(type, fn);
    },
    openCodex: () => undefined,
  };
  const bar = new BossBar(env as never, { setBossMode: () => undefined } as never);
  const chip = (): { root: Container; filled: number; shows: string | null } | null => (bar as unknown as { fishChip: never }).fishChip;
  const status = (e: EnemyState, duration: number): void => events.emit('status', { enemy: e, kind: 'fish', duration } as BattleEvents['status']);
  const end = (e: EnemyState, lock: number): void => events.emit('fishEnd', { enemy: e, lock });
  const tick = (to: number): void => {
    battle.time = to;
    bar.update();
  };
  return { events, battle, bar, listened, chip, status, end, tick, first };
}

describe('the boss strip\'s fish chip', () => {
  beforeEach(() => stubDocument());
  afterEach(() => vi.unstubAllGlobals());

  it('listens for the fish only in a battle with skills, and makes no chip otherwise', () => {
    const off = make(false);
    expect(off.listened).not.toContain('status');
    expect(off.listened).not.toContain('fishEnd');
    off.status(off.first, 5);
    expect(off.chip()).toBeNull();
    const on = make(true);
    expect(on.listened).toContain('status');
    expect(on.listened).toContain('fishEnd');
  });

  it('shows a pink chip while the boss is a fish, its ring running down with the battle clock (and standing still when the clock does)', () => {
    const w = make(true);
    w.status(w.first, 8);
    const chip = w.chip();
    expect(chip?.root.visible).toBe(true);
    expect(chip?.shows).toBe('fish');
    w.tick(10);
    const full = chip?.filled ?? -1;
    expect(full).toBeGreaterThan(30);
    w.tick(14);
    const half = chip?.filled ?? -1;
    expect(half).toBeLessThan(full);
    expect(half).toBeGreaterThan(10);
    expect(half).toBeLessThan(26);
    // A popup stands the battle clock still: the ring does not move over any number of frames.
    for (let i = 0; i < 30; i++) w.bar.update();
    expect(chip?.filled).toBe(half);
  });

  it('turns into the crossed-out lock chip when the fish wears off, counts the lock down, and goes when it ends', () => {
    const w = make(true);
    w.status(w.first, 8);
    w.tick(12);
    w.end(w.first, 10);
    const chip = w.chip();
    expect(chip?.shows).toBe('lock');
    expect(chip?.root.visible).toBe(true);
    w.tick(14);
    const early = chip?.filled ?? -1;
    w.tick(20);
    const late = chip?.filled ?? -1;
    expect(late).toBeLessThan(early);
    w.tick(30);
    expect(chip?.root.visible).toBe(false);
  });

  it('a fish with no lock leaves no chip behind; an event for another enemy does nothing', () => {
    const w = make(true);
    w.status(w.first, 8);
    w.end(boss(99), 10);
    expect(w.chip()?.root.visible).toBe(true);
    w.end(w.first, 0);
    expect(w.chip()?.root.visible).toBe(false);
    w.status(boss(99), 5);
    expect(w.chip()?.root.visible).toBe(false);
  });

  it('a new boss does not inherit the chip, and neither does a dead one for the whole of the linger', () => {
    const w = make(true);
    w.status(w.first, 30);
    w.tick(11);
    expect(w.chip()?.root.visible).toBe(true);
    // The fish boss dies as a fish: the strip lingers for the death staging, but not with a frozen ring beside the name.
    w.events.emit('enemyDie', { enemy: w.first } as BattleEvents['enemyDie']);
    expect(w.chip()?.root.visible).toBe(false);
    w.tick(11.5);
    expect(w.chip()?.root.visible).toBe(false);
    // The next boss starts clean.
    const next = boss(8);
    w.battle.boss = next;
    (w.bar as unknown as { finishing: boolean }).finishing = false;
    w.tick(12);
    expect(w.chip()?.root.visible).toBe(false);
    w.status(next, 5);
    expect(w.chip()?.root.visible).toBe(true);
    const another = boss(9);
    w.battle.boss = another;
    w.tick(13);
    expect(w.chip()?.root.visible).toBe(false);
  });
});
