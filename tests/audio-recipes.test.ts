import { describe, expect, it } from 'vitest';
import { SFX_IDS } from '@/audio/api';
import { CAT_TARGET, type Recipe } from '@/audio/recipe';
import { BATTLE_RECIPES } from '@/audio/sfx-battle';
import { COMBAT_RECIPES } from '@/audio/sfx-combat';
import { UI_RECIPES } from '@/audio/sfx-ui';
import {
  PRERENDER_ORDER,
  SOUNDS,
  sfxIndexOf,
  stingerIndexOf,
} from '@/audio/sounds';
import { STINGER_DUCK, STINGER_MUFFLE, STINGER_RECIPES } from '@/audio/stingers';
import type { FilterOpts, NoiseOpts, Send, Synth, ToneOpts } from '@/audio/synth';
import { hz } from '@/audio/theory';

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

  it('splits the ids across the three recipe files without gaps or overlaps', () => {
    // The compiler already proves the merge covers SFX_IDS (sounds.ts types it as Record<SfxId, Recipe>);
    // this proves no id is defined twice, which a spread would silently resolve in favour of the last file.
    const lists = [Object.keys(UI_RECIPES), Object.keys(COMBAT_RECIPES), Object.keys(BATTLE_RECIPES)];
    const all = lists.flat();
    expect(all.length).toBe(SFX_IDS.length);
    expect(new Set(all).size).toBe(SFX_IDS.length);
    expect(Object.keys(BATTLE_RECIPES).sort()).toEqual(
      ['awaken', 'call_wave', 'hazard_warn', 'laser_off', 'laser_on', 'molt', 'purr', 'shield_break', 'splash', 'sunbeam', 'weaken', 'zap'],
    );
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

  it('keeps stingers within 1 to 2 seconds', () => {
    for (const r of Object.values(STINGER_RECIPES)) {
      expect(r.ms[0]).toBeGreaterThanOrEqual(1000);
      expect(r.ms[1]).toBeLessThanOrEqual(2000);
    }
  });

  it('muffles the music only under the defeat stinger, to a dark cut-off', () => {
    expect(Object.keys(STINGER_MUFFLE)).toEqual(['defeat']);
    expect(STINGER_MUFFLE.defeat).toBeLessThanOrEqual(500);
  });

  it('declares duration windows that cap the decoded bank at about a quarter above the 8 MB budget', () => {
    // Node cannot render, so this bounds the bank from the declared maximum durations (which the
    // offline report enforces): mono float32 at 48 kHz, all variants. The report's measured total
    // (7.9 MB at the time of writing) is the real check; this only stops the windows from drifting wide.
    const bytes = SOUNDS.reduce((n, d) => n + (d.recipe.variants ?? 1) * (d.recipe.ms[1] / 1000) * 48000 * 4, 0);
    expect(bytes / 1e6).toBeLessThan(11);
  });

  it('band-limits rapid-fire ids below 5 kHz and keeps their level at or under the guide cap', () => {
    for (const d of SOUNDS) {
      const r = d.recipe;
      if (r.cat !== 'fire' && !(r.cat === 'hit' && r.rate)) continue;
      expect(r.lp, d.key).toBeLessThanOrEqual(5000);
      expect(r.lp, d.key).toBeGreaterThan(0);
    }
    expect(CAT_TARGET.fire.peak).toBeLessThanOrEqual(0.26);
  });
});

describe('battle verb recipes', () => {
  const made = (id: keyof typeof BATTLE_RECIPES): FakeSynth => build(SOUNDS[sfxIndexOf(id)]?.recipe as Recipe, 0);
  const recipe = (id: keyof typeof BATTLE_RECIPES): Recipe => SOUNDS[sfxIndexOf(id)]?.recipe as Recipe;

  it('laser_on rises, laser_off falls and is the shorter of the two', () => {
    const on = made('laser_on').tones[0] as ToneOpts;
    const off = made('laser_off').tones[0] as ToneOpts;
    expect(on.f2 as number).toBeGreaterThan(on.f * 2);
    expect(off.f2 as number).toBeLessThan(off.f / 2);
    expect(recipe('laser_off').ms[1]).toBeLessThan(recipe('laser_on').ms[0]);
  });

  it('molt is a slow-attack noise cloud followed by a rising fifth of chimes', () => {
    const s = made('molt');
    const cloud = s.noises[0] as NoiseOpts;
    expect(cloud.kind).toBe('pink');
    expect(cloud.a as number).toBeGreaterThanOrEqual(0.03);
    const bells = s.tones.filter((t) => t.f > 700 && t.f < 1300);
    expect(bells.map((t) => Math.round(t.f))).toEqual([Math.round(hz('G5')), Math.round(hz('D6'))]);
  });

  it('purr flutters every layer at 25 Hz with a low fundamental and stays quiet', () => {
    const s = made('purr');
    for (const o of [...s.tones, ...s.noises]) expect(o.trem?.rate).toBe(25);
    expect(Math.min(...s.tones.map((t) => t.f))).toBeLessThanOrEqual(120);
    expect(recipe('purr').cat).toBe('ui');
    expect(recipe('purr').ms[1]).toBeLessThanOrEqual(700);
    expect(recipe('purr').rule?.maxVoices).toBe(1);
  });

  it('awaken is the big tier, about 1.4 s, and rolls up an arpeggio before the chord lands', () => {
    const r = recipe('awaken');
    expect(r.cat).toBe('big');
    expect(r.ms[0]).toBeGreaterThanOrEqual(1200);
    expect(r.ms[1]).toBeLessThanOrEqual(1700);
    const s = made('awaken');
    const chimes = s.tones.filter((t) => t.at !== undefined && t.at < 0.4 && t.f > 200 && t.f < 1400 && !t.uni && t.w === undefined);
    const rising = chimes.filter((t, i) => i === 0 || t.f >= (chimes[i - 1] as ToneOpts).f * 0.99);
    expect(rising.length).toBeGreaterThanOrEqual(8);
    expect(s.tones.some((t) => (t.f2 ?? t.f) < 60)).toBe(true);
  });

  it('call_wave is saw brass whose filter opens past 6 kHz, in two stabs', () => {
    const s = made('call_wave');
    const brass = s.tones.filter((t) => t.w === 'sawtooth');
    expect(brass.length).toBeGreaterThanOrEqual(6);
    for (const t of brass) expect(filters(t)[0]?.f2 as number).toBeGreaterThanOrEqual(6000);
    expect(new Set(brass.map((t) => t.at)).size).toBe(2);
  });

  it('sunbeam opens slowly: every body tone has an attack of at least 30 ms', () => {
    const s = made('sunbeam');
    for (const t of s.tones.filter((x) => x.dur >= 0.6)) expect(t.a as number).toBeGreaterThanOrEqual(0.03);
  });

  it('hazard_warn is exactly two short ticks, the second a minor third higher', () => {
    const s = made('hazard_warn');
    const bodies = s.tones.filter((t) => t.w === 'triangle');
    expect(bodies).toHaveLength(2);
    expect(bodies[1]?.f as number).toBeCloseTo((bodies[0]?.f as number) * Math.pow(2, 3 / 12), 0);
    for (const t of s.tones) expect(t.dur).toBeLessThanOrEqual(0.1);
  });

  it('splash has a plop, a spray and seven rising bubbles, and two different variants', () => {
    const s = made('splash');
    const bubbles = s.tones.filter((t) => t.f2 !== undefined && t.f2 > t.f && t.f > 500 && t.f < 1500);
    expect(bubbles.length).toBe(7);
    const v1 = build(recipe('splash'), 1);
    expect(JSON.stringify(v1.tones)).not.toBe(JSON.stringify(s.tones));
  });

  it('zap is a high-passed snap plus a buzz chopped faster than 60 Hz', () => {
    const s = made('zap');
    expect(s.noises.some((n) => filters(n)[0]?.t === 'highpass' && (filters(n)[0]?.f as number) >= 2500)).toBe(true);
    expect(s.tones.some((t) => (t.trem?.rate ?? 0) >= 60)).toBe(true);
    expect(s.noises.some((n) => (n.trem?.rate ?? 0) >= 100)).toBe(true);
  });

  it('weaken glides down under a wide vibrato while its low-pass droops', () => {
    const s = made('weaken');
    const saw = s.tones.find((t) => t.w === 'sawtooth') as ToneOpts;
    expect(saw.f2 as number).toBeLessThan(saw.f * 0.6);
    expect(saw.vib?.cents as number).toBeGreaterThanOrEqual(50);
    const lp = filters(saw)[0] as FilterOpts;
    expect(lp.f2 as number).toBeLessThan(lp.f / 3);
  });

  it('shield_break scatters at least a dozen inharmonic glass pings', () => {
    const s = made('shield_break');
    const pings = s.tones.filter((t) => t.fm && t.fm.ratio === 2.76);
    expect(pings.length).toBeGreaterThanOrEqual(12);
    expect(new Set(pings.map((t) => Math.round(t.f))).size).toBeGreaterThanOrEqual(10);
  });

  it('keeps every new verb quieter than the big tier except awaken, and rules sane for repeats', () => {
    for (const id of Object.keys(BATTLE_RECIPES) as Array<keyof typeof BATTLE_RECIPES>) {
      const r = recipe(id);
      if (id !== 'awaken') expect(r.cat, id).not.toBe('big');
      const rule = SOUNDS[sfxIndexOf(id)]?.rule;
      expect(rule?.maxVoices, id).toBeLessThanOrEqual(4);
      expect(rule?.minGap, id).toBeGreaterThanOrEqual(0.04);
    }
  });
});

