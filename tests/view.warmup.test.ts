import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Texture } from 'pixi.js';

const KEYS = ['enemy_cucumber', 'enemy_clock', 'enemy_pill', 'boss_vacuum', 'unit_w_paw', 'relic_lucky_coin', 'icon_chest_wood', 'icon_hand', 'icon_fish', 'bg_kitchen', 'fx_zone_frost', 'fx_zone_ooze', 'fx_zone_hole', 'fx_zone_holearms', 'fx_foe_haste', 'fx_foe_heal', 'fx_burst_ring', 'fx_shot_arrow', 'fx_badge_shield'];

vi.mock('@/core/assets', () => ({
  imageKeys: () => KEYS,
  hasTex: (k: string) => KEYS.includes(k),
  tex: () => Texture.EMPTY,
  putTex: () => undefined,
}));
vi.mock('@/fx/textures', () => ({
  ensureFxTextures: () => undefined,
  fxTex: () => ({ texture: Texture.WHITE, w: 64, h: 64, ax: 0.5, ay: 0.5 }),
  fxTexture: () => Texture.WHITE,
  fxVignette: () => Texture.WHITE,
}));
vi.mock('@/view/glyphs', () => ({ warmGlyphs: () => undefined }));
const warmParticles = vi.fn();
vi.mock('@/fx/particles', async (orig) => ({ ...(await orig<typeof import('@/fx/particles')>()), warmParticles: () => warmParticles() }));

import { warm } from '@/fx';
import type { BattleApi, UnitId, WavePreviewEntry } from '@/game';
import { BattleWarmup } from '@/view/warmup';

/** The sound engine as the warm-up sees it: what is left to bake per sound (2 variants unless told), and every step taken. */
const sound = vi.hoisted(() => ({ left: new Map<string, number>(), steps: [] as string[] }));
const nameOf = (t: { sfx?: string; stinger?: string }): string => (t.sfx ? `sfx:${t.sfx}` : `stinger:${t.stinger}`);
vi.mock('@/audio', async (orig) => ({
  ...(await orig<typeof import('@/audio')>()),
  audio: {
    primeLeft: (t: { sfx?: string; stinger?: string }) => sound.left.get(nameOf(t)) ?? 2,
    primeStep: (t: { sfx?: string; stinger?: string }) => void sound.steps.push(nameOf(t)),
  },
}));

type Listener = (e: { level: number }) => void;

interface FakeBattle {
  wave: number;
  totalWaves: number;
  phase: string;
  init: { mode: string };
  pending: { kind: string; options: UnitId[] } | null;
  units: Array<{ id: UnitId } | null>;
  events: { on: (name: string, fn: Listener) => () => void };
  previewWave: (w?: number) => WavePreviewEntry[];
}

function fake(lists: Record<number, WavePreviewEntry[]>): { b: FakeBattle; asked: number[]; fire: (name: string, level?: number) => void; offs: string[] } {
  const asked: number[] = [];
  const listeners = new Map<string, Listener[]>();
  const offs: string[] = [];
  const b: FakeBattle = {
    wave: 0,
    totalWaves: 12,
    phase: 'prep',
    init: { mode: 'chapter' },
    pending: null,
    units: new Array<{ id: UnitId } | null>(20).fill(null),
    events: {
      on: (name, fn) => {
        listeners.set(name, [...(listeners.get(name) ?? []), fn]);
        return () => void offs.push(name);
      },
    },
    previewWave: (w = 0) => {
      asked.push(w);
      return lists[w] ?? [];
    },
  };
  return { b, asked, fire: (name, level = 1) => (listeners.get(name) ?? []).forEach((fn) => fn({ level })), offs };
}

/** Frames until nothing is left to warm. */
function drain(max = 400): number {
  let frames = 0;
  while (warm.pending > 0 && frames < max) {
    warm.update(1 / 60);
    frames++;
  }
  return frames;
}

describe('the battle warm-up', () => {
  beforeEach(() => {
    warm.reset();
    warm.now = () => performance.now();
    warmParticles.mockClear();
    sound.left.clear();
    sound.steps.length = 0;
  });

  it('links the particle shader first, before any picture', () => {
    const { b } = fake({});
    new BattleWarmup(b as unknown as BattleApi);
    warm.update(1 / 60);
    expect(warmParticles).toHaveBeenCalledTimes(1);
    expect(warm.has('pipe:particles')).toBe(true);
  });

  it('keeps the cats, toys, chests, paw and every kind of enemy ready, but not the backgrounds or the currency icons', () => {
    const { b } = fake({});
    new BattleWarmup(b as unknown as BattleApi);
    drain();
    for (const key of ['enemy_cucumber', 'enemy_clock', 'enemy_pill', 'boss_vacuum', 'unit_w_paw', 'relic_lucky_coin', 'icon_chest_wood', 'icon_hand']) {
      expect(warm.has(`img:${key}`)).toBe(true);
    }
    expect(warm.has('img:bg_kitchen')).toBe(false);
    expect(warm.has('img:icon_fish')).toBe(false);
  });

  it('puts the drawn pictures of every ground area, and the other battle effects, on the card ahead of the first fight', () => {
    const { b } = fake({});
    new BattleWarmup(b as unknown as BattleApi);
    for (const key of ['fx_zone_frost', 'fx_zone_ooze', 'fx_zone_hole', 'fx_zone_holearms', 'fx_foe_haste', 'fx_foe_heal', 'fx_shot_arrow', 'fx_badge_shield']) {
      expect(warm.has(`img:${key}`)).toBe(true);
    }
    drain();
    expect(warm.pending).toBe(0);
  });

  it('does the shader first, then the coming wave, then the one after it, then what may be needed some time', () => {
    const { b, asked } = fake({
      1: [{ enemy: 'clock', count: 3 }],
      2: [{ enemy: 'pill', count: 2 }],
    });
    const w = new BattleWarmup(b as unknown as BattleApi);
    w.update();
    expect(asked).toEqual([1, 2]);
    // Every piece "takes" 5 ms, so a pass runs exactly one and the key read before it is the order the queue works in.
    let t = 0;
    warm.now = () => (t += 5);
    const order: string[] = [];
    for (let guard = 0; warm.next !== null && guard < 500; guard++) {
      order.push(warm.next);
      warm.update(1 / 60);
    }
    const at = (key: string): number => order.indexOf(key);
    expect(at('pipe:particles')).toBe(0);
    expect(at('img:enemy_clock')).toBeLessThan(at('img:enemy_pill'));
    expect(at('img:fx_foe_haste')).toBeLessThan(at('img:fx_foe_heal'));
    expect(at('img:enemy_pill')).toBeLessThan(at('img:unit_w_paw'));
    expect(at('img:fx_foe_heal')).toBeLessThan(at('img:fx_zone_frost'));
  });

  it('looks at the preview again only when the wave or the phase has moved', () => {
    const { b, asked } = fake({ 2: [{ enemy: 'clock', count: 1 }], 3: [] });
    const w = new BattleWarmup(b as unknown as BattleApi);
    w.update();
    w.update();
    expect(asked).toEqual([1, 2]);
    b.wave = 1;
    w.update();
    expect(asked).toEqual([1, 2, 2, 3]);
    b.phase = 'choice';
    w.update();
    expect(asked).toEqual([1, 2, 2, 3, 2, 3]);
  });

  it('asks nothing of a finished run, and forgets what is waiting when the battle goes', () => {
    const { b, asked } = fake({});
    const w = new BattleWarmup(b as unknown as BattleApi);
    b.phase = 'won';
    w.update();
    expect(asked).toEqual([]);
    w.destroy();
    expect(warm.pending).toBe(0);
  });

  describe('sounds', () => {
    /** The keys of the sound pieces in the order the queue will run them. */
    function soundOrder(): string[] {
      const order: string[] = [];
      for (let guard = 0; warm.next !== null && guard < 2000; guard++) {
        order.push(warm.next);
        warm.update(1 / 60);
      }
      return order.filter((k) => k.startsWith('snd:'));
    }

    it('asks for every sound a fight plays once, a piece per variant that is still to bake, after the pictures of the coming wave', () => {
      const { b } = fake({ 1: [{ enemy: 'clock', count: 2 }] });
      sound.left.set('sfx:merge', 3);
      sound.left.set('sfx:ui_click', 0);
      const w = new BattleWarmup(b as unknown as BattleApi);
      expect(warm.has('snd:sfx:ui_click:0')).toBe(false);
      w.update();
      expect(warm.has('snd:sfx:ui_click:0')).toBe(false);
      for (const i of [0, 1, 2]) expect(warm.has(`snd:sfx:merge:${i}`)).toBe(true);
      expect(warm.has('snd:sfx:merge:3')).toBe(false);
      expect(warm.has('snd:sfx:summon_common:1')).toBe(true);
      const order = soundOrder();
      expect(order.indexOf('snd:sfx:summon_common:0')).toBeLessThan(order.indexOf('snd:sfx:sell:0'));
      expect(order.indexOf('snd:sfx:hit_light:0')).toBeLessThan(order.indexOf('snd:sfx:awaken:0'));
    });

    it('bakes one variant per piece through the audio engine, and a piece of a sound that is ready does nothing', () => {
      const { b } = fake({});
      const w = new BattleWarmup(b as unknown as BattleApi);
      w.update();
      for (let i = 0; i < 400 && warm.pending > 0; i++) warm.update(1 / 60);
      expect(sound.steps.filter((s) => s === 'sfx:ui_click')).toHaveLength(2);
      expect(sound.steps).toContain('stinger:victory');
      expect(sound.steps).toContain('stinger:defeat');
    });

    it('asks for the release and impact of a cat when it appears, and of the next rank a little later', () => {
      const { b } = fake({});
      const w = new BattleWarmup(b as unknown as BattleApi);
      w.update();
      expect(warm.has('snd:sfx:atk_m_snow:0')).toBe(false);
      b.units[4] = { id: 'm_snow' };
      w.update();
      expect(warm.has('snd:sfx:atk_m_snow:0')).toBe(true);
      expect(warm.has('snd:sfx:imp_m_snow:1')).toBe(true);
      // m_snow merges into m_fire: asked, but behind the cat itself.
      expect(warm.has('snd:sfx:atk_m_fire:0')).toBe(true);
      const order = soundOrder();
      expect(order.indexOf('snd:sfx:imp_m_snow:0')).toBeLessThan(order.indexOf('snd:sfx:atk_m_fire:0'));
    });

    it('notices a cat once, and again when a different cat takes its cell', () => {
      const { b } = fake({});
      const w = new BattleWarmup(b as unknown as BattleApi);
      w.update();
      b.units[0] = { id: 'w_paw' };
      w.update();
      const waiting = warm.pending;
      w.update();
      w.update();
      expect(warm.pending).toBe(waiting);
      b.units[0] = { id: 'w_sword' };
      w.update();
      expect(warm.has('snd:sfx:atk_w_sword:0')).toBe(true);
      b.units[0] = null;
      expect(() => w.update()).not.toThrow();
    });

    it('asks for the warning, the cry and the collapse of a boss wave, and the victory fanfare when it ends the run', () => {
      const { b } = fake({ 1: [{ enemy: 'boss_vacuum', count: 1 }], 2: [] });
      b.totalWaves = 1;
      new BattleWarmup(b as unknown as BattleApi).update();
      for (const id of ['boss_warning', 'boss_roar', 'boss_die', 'foe_boss_vacuum', 'foe_motor_hit', 'whoosh']) expect(warm.has(`snd:sfx:${id}:0`), id).toBe(true);
      expect(warm.has('snd:stinger:victory:0')).toBe(true);
    });

    it('moves the victory fanfare up only when the last wave is the coming one or the one after it, and never in an endless run', () => {
      const lane = (mode: string, total: number): number => {
        warm.reset();
        const { b } = fake({});
        b.totalWaves = total;
        b.init.mode = mode;
        new BattleWarmup(b as unknown as BattleApi).update();
        const order = soundOrder();
        return order.indexOf('snd:stinger:victory:0') - order.indexOf('snd:sfx:sell:0');
      };
      expect(lane('chapter', 12)).toBeGreaterThan(0);
      expect(lane('chapter', 2)).toBeLessThan(0);
      expect(lane('endless', 2)).toBeGreaterThan(0);
    });

    it('asks for the three offered cats while the pick of three is open', () => {
      const { b } = fake({});
      const w = new BattleWarmup(b as unknown as BattleApi);
      w.update();
      b.phase = 'choice';
      b.pending = { kind: 'summon', options: ['t_chef', 'r_ninja', 'w_viking'] };
      w.update();
      for (const id of ['atk_t_chef', 'imp_r_ninja', 'atk_w_viking']) expect(warm.has(`snd:sfx:${id}:0`), id).toBe(true);
    });

    it('moves the defeat fanfare up when the field is in danger or over its cap, and stops listening with the battle', () => {
      const rankAfter = (event: string, level: number): number => {
        warm.reset();
        const { b, fire } = fake({});
        new BattleWarmup(b as unknown as BattleApi).update();
        fire(event, level);
        const order = soundOrder();
        return order.indexOf('snd:stinger:defeat:0') - order.indexOf('snd:sfx:sell:0');
      };
      expect(rankAfter('danger', 0)).toBeGreaterThan(0);
      expect(rankAfter('danger', 1)).toBeLessThan(0);
      expect(rankAfter('overflow', 0)).toBeLessThan(0);
      const { b, offs } = fake({});
      new BattleWarmup(b as unknown as BattleApi).destroy();
      expect(offs.sort()).toEqual(['danger', 'overflow']);
    });
  });
});
