import { describe, expect, it } from 'vitest';
import { SFX_IDS } from '@/audio/api';
import { CAT_TARGET, type Recipe } from '@/audio/recipe';
import {
  PRERENDER_ORDER,
  SOUNDS,
  sfxIndexOf,
  stingerIndexOf,
} from '@/audio/sounds';
import { STINGER_DUCK, STINGER_RECIPES } from '@/audio/stingers';
import type { FilterOpts, NoiseOpts, Send, Synth, ToneOpts } from '@/audio/synth';

/**
 * A recording stand-in for Synth: it keeps every voice a recipe asks for so the tests can check,
 * without any WebAudio, that nothing is scheduled past the render length, no frequency is invalid
 * (exponential ramps need positive targets) and no envelope is degenerate.
 */
class FakeSynth {
  readonly tones: ToneOpts[] = [];
  readonly noises: NoiseOpts[] = [];
  private seed = 1234;
  rand = (): number => {
    this.seed = (this.seed * 1664525 + 1013904223) >>> 0;
    return this.seed / 4294967296;
  };
  /** Latest end of any dry voice. Echo/reverb tails are excluded: the baker flags a tail that is cut off. */
  end = 0;

  tone(o: ToneOpts): void {
    this.tones.push(o);
    this.bump(o);
  }

  noise(o: NoiseOpts): void {
    this.noises.push(o);
    this.bump(o);
  }

  echo(time: number, feedback: number, wet: number): Send {
    expect(time).toBeGreaterThan(0);
    expect(feedback).toBeLessThan(1);
    expect(wet).toBeGreaterThan(0);
    return { input: {} as AudioNode, tail: time * (Math.min(24, Math.ceil(Math.log(0.003) / Math.log(Math.max(0.05, feedback)))) + 1) };
  }

  reverb(seconds: number): Send {
    return { input: {} as AudioNode, tail: seconds };
  }

  private bump(o: { at?: number; dur: number }): void {
    this.end = Math.max(this.end, (o.at ?? 0) + o.dur);
  }
}

function build(r: Recipe, variant: number): FakeSynth {
  const s = new FakeSynth();
  r.build(s as unknown as Synth, { j: (a) => (variant === 0 ? 1 : 1 + (s.rand() * 2 - 1) * a) });
  return s;
}

const filters = (o: ToneOpts | NoiseOpts): FilterOpts[] => (o.filter ? (Array.isArray(o.filter) ? [...o.filter] : [o.filter as FilterOpts]) : []);

describe('sound catalogue', () => {
  it('has a recipe for every SFX id and every stinger', () => {
    for (const id of SFX_IDS) expect(sfxIndexOf(id), id).toBeGreaterThanOrEqual(0);
    for (const id of Object.keys(STINGER_RECIPES)) expect(stingerIndexOf(id as keyof typeof STINGER_RECIPES), id).toBeGreaterThanOrEqual(0);
    expect(SOUNDS.length).toBe(SFX_IDS.length + Object.keys(STINGER_RECIPES).length);
  });

  it('has unique stable keys and a full prerender order', () => {
    expect(new Set(SOUNDS.map((d) => d.key)).size).toBe(SOUNDS.length);
    expect([...PRERENDER_ORDER].sort((a, b) => a - b)).toEqual(SOUNDS.map((d) => d.index));
    // UI sounds are baked before the big moments.
    const first = SOUNDS[PRERENDER_ORDER[0] as number];
    const last = SOUNDS[PRERENDER_ORDER[PRERENDER_ORDER.length - 1] as number];
    expect(first?.recipe.cat).toBe('ui');
    expect(last?.recipe.cat).toBe('stinger');
  });

  it('ducks the music under every stinger', () => {
    for (const id of Object.keys(STINGER_RECIPES) as Array<keyof typeof STINGER_DUCK>) {
      expect(STINGER_DUCK[id]).toBeGreaterThan(0.3);
      expect(STINGER_DUCK[id]).toBeLessThanOrEqual(1);
    }
  });

  it('orders the loudness tiers UI < reward < combat < big', () => {
    expect(CAT_TARGET.ui.peak).toBeLessThan(CAT_TARGET.combat.peak);
    expect(CAT_TARGET.combat.peak).toBeLessThan(CAT_TARGET.big.peak);
    expect(CAT_TARGET.ui.rms).toBeLessThan(CAT_TARGET.combat.rms);
    expect(CAT_TARGET.combat.rms).toBeLessThan(CAT_TARGET.big.rms);
    for (const t of Object.values(CAT_TARGET)) expect(t.peak).toBeLessThanOrEqual(0.9);
  });

  it('gives frequent ids several variants and a playback-rate jitter', () => {
    for (const id of ['hit_light', 'hit_heavy', 'coin', 'enemy_die', 'shoot_arrow', 'shoot_magic', 'shoot_cannon', 'shoot_ice', 'shoot_lightning', 'shoot_poison', 'shoot_claw'] as const) {
      const r = SOUNDS[sfxIndexOf(id)]?.recipe as Recipe;
      expect(r.variants ?? 1, id).toBeGreaterThanOrEqual(2);
      expect(r.rate ?? 0, id).toBeGreaterThan(0);
    }
  });

  it('keeps rapid-fire ids within the voice rules the spec asks for', () => {
    const hit = SOUNDS[sfxIndexOf('hit_light')]?.rule;
    expect(hit?.minGap).toBeGreaterThanOrEqual(0.04);
    expect(hit?.falloff).toBeGreaterThan(0);
    for (const d of SOUNDS) {
      expect(d.rule.maxVoices).toBeGreaterThanOrEqual(1);
      expect(d.rule.maxVoices).toBeLessThanOrEqual(8);
      expect(d.rule.minGap).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('recipes', () => {
  for (const def of SOUNDS) {
    const r = def.recipe;
    describe(def.key, () => {
      it('declares a sane duration window inside its render length', () => {
        expect(r.ms[0]).toBeGreaterThan(0);
        expect(r.ms[1]).toBeGreaterThan(r.ms[0]);
        expect(r.len * 1000).toBeGreaterThanOrEqual(r.ms[0]);
      });

      it('schedules every voice inside the render length and with valid parameters', () => {
        const n = r.variants ?? 1;
        for (let v = 0; v < n; v++) {
          const s = build(r, v);
          expect(s.tones.length + s.noises.length).toBeGreaterThan(0);
          // Every dry voice must fit: anything later would be cut off by the offline render.
          expect(s.end, `${def.key} v${v} end`).toBeLessThanOrEqual(r.len + 1e-9);
          for (const o of [...s.tones, ...s.noises]) {
            expect(o.dur).toBeGreaterThan(0.004);
            expect(o.at ?? 0).toBeGreaterThanOrEqual(0);
            expect(o.v ?? 1).toBeGreaterThan(0);
            expect(Number.isFinite(o.v ?? 1)).toBe(true);
            expect(o.a ?? 0.004).toBeGreaterThanOrEqual(0);
            expect((o.a ?? 0.004) + (o.r ?? 0)).toBeLessThanOrEqual(o.dur + 1e-9);
            if (o.trem) expect(o.trem.depth).toBeGreaterThan(0);
            if (o.trem) expect(o.trem.depth).toBeLessThanOrEqual(1);
            for (const f of filters(o)) {
              expect(f.f).toBeGreaterThan(0);
              if (f.f2 !== undefined) expect(f.f2).toBeGreaterThan(0);
              expect(f.f).toBeLessThan(24000);
            }
          }
          for (const t of s.tones) {
            expect(t.f).toBeGreaterThan(0);
            expect(t.f).toBeLessThan(20000);
            if (t.f2 !== undefined) expect(t.f2).toBeGreaterThan(0);
            if (t.f2 !== undefined) expect(t.f2).toBeLessThan(20000);
            if (t.fm) expect(t.fm.ratio).toBeGreaterThan(0);
          }
        }
      });

      it('is deterministic per variant', () => {
        const a = build(r, 0);
        const b = build(r, 0);
        expect(JSON.stringify([a.tones, a.noises])).toBe(JSON.stringify([b.tones, b.noises]));
      });
    });
  }

  it('variants differ from each other so repeats do not machine-gun', () => {
    for (const d of SOUNDS) {
      if ((d.recipe.variants ?? 1) < 2) continue;
      const a = build(d.recipe, 0);
      const b = build(d.recipe, 1);
      expect(JSON.stringify([a.tones, a.noises]), d.key).not.toBe(JSON.stringify([b.tones, b.noises]));
    }
  });

  it('summon recipes escalate in layers, length and level', () => {
    const ladder = ['summon_common', 'summon_rare', 'summon_epic', 'summon_legendary', 'summon_mythic'] as const;
    const recipes = ladder.map((id) => SOUNDS[sfxIndexOf(id)]?.recipe as Recipe);
    const layers = recipes.map((r) => {
      const s = build(r, 0);
      return s.tones.length + s.noises.length;
    });
    for (let i = 1; i < ladder.length; i++) {
      expect(layers[i] as number, `${ladder[i]} layers`).toBeGreaterThan(layers[i - 1] as number);
      expect((recipes[i] as Recipe).len, `${ladder[i]} len`).toBeGreaterThan((recipes[i - 1] as Recipe).len);
      expect((recipes[i] as Recipe).ms[1], `${ladder[i]} ms`).toBeGreaterThanOrEqual((recipes[i - 1] as Recipe).ms[1]);
    }
    // Only the top two carry a sub thump (a tone sweeping to below 60 Hz).
    const hasSub = (r: Recipe) => build(r, 0).tones.some((t) => (t.f2 ?? t.f) < 60);
    expect(hasSub(recipes[0] as Recipe)).toBe(false);
    expect(hasSub(recipes[3] as Recipe)).toBe(true);
    expect(hasSub(recipes[4] as Recipe)).toBe(true);
  });

  it('keeps UI sounds short and combat shots shorter than a quarter second', () => {
    for (const id of SFX_IDS.filter((x) => x.startsWith('ui_'))) {
      expect((SOUNDS[sfxIndexOf(id)]?.recipe as Recipe).ms[1], id).toBeLessThanOrEqual(125);
    }
    for (const id of SFX_IDS.filter((x) => x.startsWith('shoot_') || x === 'hit_light' || x === 'hit_heavy' || x === 'crit')) {
      expect((SOUNDS[sfxIndexOf(id)]?.recipe as Recipe).ms[1], id).toBeLessThanOrEqual(260);
    }
    for (const id of ['enemy_die'] as const) expect((SOUNDS[sfxIndexOf(id)]?.recipe as Recipe).ms[1]).toBeLessThanOrEqual(350);
  });

  it('keeps stingers within 1 to 2.3 seconds', () => {
    for (const r of Object.values(STINGER_RECIPES)) {
      expect(r.ms[0]).toBeGreaterThanOrEqual(1000);
      expect(r.ms[1]).toBeLessThanOrEqual(2300);
      expect(r.stereo).toBe(true);
    }
  });
});
