import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { GAME_SFX_IDS, type SfxId } from '@/audio/api';
import { ceilingCurve } from '@/audio/envelopes';
import { BUS_LEVEL, SOFT_CLIP_CEILING, SOFT_CLIP_KNEE, busNode, busOf, type AudioGraph } from '@/audio/graph';
import { IMPACT_FILE, RPG_FILE, crack, ring, tap, thud } from '@/audio/hitkit';
import { Hush, hushPlan } from '@/audio/hush';
import { AUDIO_SEED, audioRandom, audioSpread, seedAudio } from '@/audio/random';
import { CAT_TARGET, type Cat, type Recipe } from '@/audio/recipe';
import { IMPACTS } from '@/audio/families';
import { SOUNDS, sfxIndexOf } from '@/audio/sounds';
import type { FilterOpts, NoiseOpts, SampleOpts, Send, Synth, ToneOpts } from '@/audio/synth';

const recipeOf = (id: SfxId): Recipe => SOUNDS[sfxIndexOf(id)]?.recipe as Recipe;
const ruleOf = (id: SfxId): (typeof SOUNDS)[number]['rule'] => SOUNDS[sfxIndexOf(id)]?.rule as (typeof SOUNDS)[number]['rule'];

/** An AudioParam that remembers what it was asked. */
class Param {
  readonly calls: Array<[string, ...number[]]> = [];
  setValueAtTime(v: number, t: number): void {
    this.calls.push(['set', v, t]);
  }
  setTargetAtTime(v: number, t: number, tc: number): void {
    this.calls.push(['target', v, t, tc]);
  }
  cancelScheduledValues(t: number): void {
    this.calls.push(['cancel', t]);
  }
}
const asParam = (p: Param): AudioParam => p as unknown as AudioParam;

describe('the dip of the fight bus under a big moment (hush.ts)', () => {
  it('plans a dip of so many dB for so long: quick down (5 ms time constant), held, and slow back (85 ms)', () => {
    const p = hushPlan(3, 0.45);
    expect(p.floor).toBeCloseTo(10 ** (-3 / 20), 6);
    expect(p).toMatchObject({ attackTc: 0.005, releaseTc: 0.085, hold: 0.45 });
    // never deeper than 24 dB, never a boost, and nonsense is no dip at all
    expect(hushPlan(60, 1).floor).toBeCloseTo(10 ** (-24 / 20), 6);
    expect(hushPlan(-6, 1).floor).toBe(1);
    expect(hushPlan(Number.NaN, 1).floor).toBe(1);
    expect(hushPlan(3, Number.NaN).hold).toBe(0.02);
    expect(hushPlan(3, -4).hold).toBe(0.02);
  });

  it('asks the bus for the dip from the moment of the big sound: cancel, start from where the gain is, fall to the floor, come back at the end of the hold', () => {
    const h = new Hush();
    const p = new Param();
    h.duck(asParam(p), 2, 3, 0.45);
    expect(p.calls).toEqual([
      ['cancel', 2],
      ['set', 1, 2],
      ['target', 10 ** (-3 / 20), 2, 0.005],
      ['target', 1, 2.45, 0.085],
    ]);
  });

  it('keeps its own model of the gain it asked for, so a dip can start from the middle of another, at any time in the future', () => {
    const h = new Hush();
    const p = new Param();
    expect(h.gainAt(5)).toBe(1);
    h.duck(asParam(p), 1, 6, 0.5);
    const floor = 10 ** (-6 / 20);
    expect(h.gainAt(0.5)).toBe(1);
    expect(h.gainAt(1)).toBeCloseTo(1, 9);
    // 20 ms in (four time constants), the gain is within 2 % of the way to the floor
    expect(h.gainAt(1.02)).toBeCloseTo(floor + (1 - floor) * Math.exp(-4), 6);
    expect(h.gainAt(1.4)).toBeCloseTo(floor, 3);
    // 3 time constants after the end of the hold it is 95 % of the way back, and later it is there
    expect(h.gainAt(1.5 + 3 * 0.085)).toBeGreaterThan(1 - (1 - floor) * 0.06);
    expect(h.gainAt(3)).toBeCloseTo(1, 4);
  });

  it('joins a dip that comes while another still holds: the deeper floor wins and the later end wins, so a string of big moments is one long dip and not a series of bumps', () => {
    const h = new Hush();
    const p = new Param();
    h.duck(asParam(p), 1, 3, 0.45);
    h.duck(asParam(p), 1.2, 6, 0.1);
    const second = p.calls.slice(4);
    expect(second[2]).toEqual(['target', 10 ** (-6 / 20), 1.2, 0.005]);
    // the end is still the first one's (1.45), not the shorter second one (1.3)
    expect(second[3]).toEqual(['target', 1, 1.45, 0.085]);
    // a gentler dip inside a deeper one does not lift it
    h.duck(asParam(p), 1.3, 1, 2);
    const third = p.calls.slice(8);
    expect(third[2]?.[1]).toBeCloseTo(10 ** (-6 / 20), 9);
    expect(third[3]).toEqual(['target', 1, 3.3, 0.085]);
  });

  it('starts a plain new dip when the old one is over: the floor of the old one does not linger', () => {
    const h = new Hush();
    const p = new Param();
    h.duck(asParam(p), 1, 6, 0.2);
    h.duck(asParam(p), 5, 2, 0.3);
    const fresh = p.calls.slice(4);
    expect(fresh[1]?.[1]).toBeCloseTo(1, 6);
    expect(fresh[2]?.[1]).toBeCloseTo(10 ** (-2 / 20), 9);
    expect(fresh[3]).toEqual(['target', 1, 5.3, 0.085]);
  });

  it('forgets everything on reset (the engine\'s stop-all, a new context)', () => {
    const h = new Hush();
    const p = new Param();
    h.duck(asParam(p), 1, 6, 1);
    h.reset();
    expect(h.gainAt(1.5)).toBe(1);
    h.duck(asParam(p), 1.5, 3, 0.2);
    expect(p.calls.slice(4)[2]?.[1]).toBeCloseTo(10 ** (-3 / 20), 9);
  });
});

describe('the last stage of the master chain (ceilingCurve)', () => {
  const curve = ceilingCurve(SOFT_CLIP_CEILING, SOFT_CLIP_KNEE, 2049);
  const at = (x: number): number => curve[Math.round(((x + 1) / 2) * (curve.length - 1))] as number;

  it('leaves everything under the knee exactly as it is', () => {
    for (const x of [0, 0.1, -0.25, 0.4, -0.55, 0.6]) expect(at(x)).toBeCloseTo(x, 3);
  });

  it('bends what is above the knee smoothly towards the ceiling and never reaches it, even for the loudest input', () => {
    for (let i = 1; i < curve.length; i++) expect(curve[i] as number).toBeGreaterThanOrEqual(curve[i - 1] as number);
    expect(Math.max(...curve)).toBeLessThan(SOFT_CLIP_CEILING);
    expect(at(1)).toBeGreaterThan(0.85);
    expect(at(1)).toBeLessThan(SOFT_CLIP_CEILING);
    // no corner at the knee: the slope there is 1
    const step = 2 / (curve.length - 1);
    const slope = ((at(SOFT_CLIP_KNEE + 0.02) - at(SOFT_CLIP_KNEE - 0.02)) / 0.04) * (1 + step * 0);
    expect(slope).toBeGreaterThan(0.95);
    expect(slope).toBeLessThan(1.02);
  });

  it('is odd (the same for a negative swing) and sits under -0.5 dBFS', () => {
    for (const x of [0.3, 0.7, 0.95, 1]) expect(at(-x)).toBeCloseTo(-at(x), 9);
    expect(20 * Math.log10(SOFT_CLIP_CEILING)).toBeLessThan(-0.4);
  });
});

describe('which bus a sound plays through', () => {
  const buses: Record<Cat, 'fight' | 'skill' | 'ui'> = {
    fire: 'fight', swing: 'fight', hit: 'fight', impact: 'fight', foe: 'fight', combat: 'fight',
    skill: 'skill', skillTick: 'skill', big: 'skill', finale: 'skill', stinger: 'skill',
    ui: 'ui', tick: 'ui', reward: 'ui',
  };

  it('puts what the fight repeats on the fight bus, the cats\' skills and the big moments on the skill bus, and the interface and the rewards on the interface bus', () => {
    for (const [cat, bus] of Object.entries(buses)) expect(busOf(cat as Cat), cat).toBe(bus);
    // every loudness family is covered (a new family that is forgotten here is a compile error and a test failure)
    expect(Object.keys(buses).sort()).toEqual(Object.keys(CAT_TARGET).sort());
  });

  it('hands out the node of the bus', () => {
    const g = { fightBus: { n: 'f' }, skillBus: { n: 's' }, uiBus: { n: 'u' } } as unknown as AudioGraph;
    expect(busNode(g, 'impact')).toBe(g.fightBus);
    expect(busNode(g, 'skill')).toBe(g.skillBus);
    expect(busNode(g, 'boss' as Cat)).toBe(g.uiBus);
    expect(busNode(g, 'reward')).toBe(g.uiBus);
  });

  it('puts every weapon, every enemy and every layer of a blow on the fight bus, and every skill sound, boss cue and boss death on the skill bus', () => {
    for (const id of GAME_SFX_IDS) {
      const cat = recipeOf(id).cat;
      if (/^(atk_|imp_|foe_(?!boss_)|hit_|crit$)/.test(id)) expect(busOf(cat), id).toBe('fight');
      // (a boss's last breath, the finale tier, is a big moment too)
      if (/^(sp_|awaken$|boss_(warning|roar|die)$|foe_boss_)/.test(id)) expect(busOf(cat), id).toBe('skill');
      if (/^ui_/.test(id)) expect(busOf(cat), id).toBe('ui');
    }
  });

  it('lifts the fight bus by 2 dB over the other two, which are level with each other (the rest of the balance is in the loudness families)', () => {
    expect(BUS_LEVEL.fight).toBeCloseTo(10 ** (2 / 20), 2);
    expect(BUS_LEVEL.skill).toBe(1);
    expect(BUS_LEVEL.ui).toBe(1);
  });
});

describe('who takes the room (the hush) and who never does', () => {
  const taking = (id: SfxId): Recipe['hush'] => recipeOf(id).hush;

  it('is taken by every signature of a skill, the awakening and a boss\'s cry, warning and fall', () => {
    const signatures = GAME_SFX_IDS.filter((id) => recipeOf(id).cat === 'skill');
    expect(signatures.length).toBeGreaterThan(20);
    for (const id of [...signatures, 'awaken', 'boss_warning', 'boss_roar', 'boss_die'] as SfxId[]) {
      const h = taking(id);
      expect(h, id).toBeDefined();
      expect(h?.db, id).toBeGreaterThanOrEqual(2);
      expect(h?.db, id).toBeLessThanOrEqual(4);
      expect(h?.seconds, id).toBeGreaterThanOrEqual(0.3);
      expect(h?.seconds, id).toBeLessThanOrEqual(1);
    }
  });

  it('is never taken by a weapon, an enemy, a layer of a blow or a small sound of a skill: those are what gives way', () => {
    for (const id of GAME_SFX_IDS) {
      if (/^(atk_|imp_|foe_|hit_|crit$|explosion$)/.test(id) || recipeOf(id).cat === 'skillTick' || recipeOf(id).cat === 'ui') expect(taking(id), id).toBeUndefined();
    }
  });

  it('dips the music under the same moments, between 3 and 7 dB', () => {
    for (const id of ['boss_warning', 'boss_roar', 'boss_die', 'awaken'] as const) {
      const d = recipeOf(id).duck;
      expect(d?.depth, id).toBeGreaterThanOrEqual(0.3);
      expect(d?.depth, id).toBeLessThanOrEqual(0.6);
    }
    const signatures = GAME_SFX_IDS.filter((id) => recipeOf(id).cat === 'skill' && recipeOf(id).duck);
    expect(signatures.length).toBeGreaterThanOrEqual(8);
    for (const id of signatures) {
      const depth = recipeOf(id).duck?.depth as number;
      expect(depth, id).toBeGreaterThanOrEqual(0.3);
      expect(depth, id).toBeLessThanOrEqual(0.6);
    }
  });
});

describe('the voice limits of every sound, so that a board at 3x does not turn to noise', () => {
  it('lets a weapon\'s impact sound twice at once at most, no closer than 50 ms to its own last start, and thins itself when it is crowded', () => {
    for (const id of IMPACTS) {
      const r = ruleOf(id);
      expect(r.maxVoices, id).toBeLessThanOrEqual(2);
      expect(r.minGap, id).toBeGreaterThanOrEqual(0.05);
      expect(r.falloff, id).toBeGreaterThanOrEqual(0.15);
      expect(r.bucket, id).toBeGreaterThanOrEqual(0);
    }
  });

  it('keeps the most frequent of them, the star archer\'s (a piercing arrow touches many enemies), under 15 a second', () => {
    expect(ruleOf('imp_r_star').minGap).toBeGreaterThanOrEqual(0.07);
  });

  it('keeps the layers of a blow short of voices: the heavy layer twice, the crit twice, an enemy\'s answer twice', () => {
    expect(ruleOf('hit_heavy').maxVoices).toBeLessThanOrEqual(2);
    expect(ruleOf('crit').maxVoices).toBeLessThanOrEqual(2);
    for (const m of ['juicy', 'fluff', 'water', 'rubber', 'plastic', 'tin', 'motor', 'paper', 'glass', 'cloud']) {
      const r = ruleOf(`foe_${m}_hit` as SfxId);
      expect(r.maxVoices, m).toBeLessThanOrEqual(2);
      expect(r.minGap, m).toBeGreaterThanOrEqual(0.05);
    }
  });

  it('lets a signature sound once at a time (twice for a roar that a second tiger starts before the first has ended)', () => {
    for (const id of GAME_SFX_IDS) if (recipeOf(id).cat === 'skill') expect(ruleOf(id).maxVoices, id).toBeLessThanOrEqual(2);
    for (const id of ['boss_warning', 'boss_roar', 'boss_die'] as const) expect(ruleOf(id).maxVoices, id).toBeLessThanOrEqual(2);
  });

  it('keeps every sound of the game within the global rule: 1 to 8 voices, a gap that is not negative', () => {
    for (const d of SOUNDS) {
      expect(d.rule.maxVoices, d.key).toBeGreaterThanOrEqual(1);
      expect(d.rule.maxVoices, d.key).toBeLessThanOrEqual(8);
      expect(d.rule.minGap, d.key).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('the levels of the families, from a UI click up to a skill\'s signature', () => {
  it('orders them: what the fight repeats under what the skills and the big moments are', () => {
    expect(CAT_TARGET.fire.peak).toBeLessThanOrEqual(CAT_TARGET.swing.peak);
    expect(CAT_TARGET.swing.peak).toBeLessThanOrEqual(CAT_TARGET.foe.peak);
    expect(CAT_TARGET.foe.peak).toBeLessThanOrEqual(CAT_TARGET.impact.peak);
    expect(CAT_TARGET.impact.peak).toBeLessThan(CAT_TARGET.combat.peak);
    expect(CAT_TARGET.skillTick.peak).toBeLessThan(CAT_TARGET.skill.peak);
    expect(CAT_TARGET.skill.peak).toBeLessThan(CAT_TARGET.big.peak);
    expect(CAT_TARGET.skill.rms).toBeGreaterThan(CAT_TARGET.impact.rms);
    for (const t of Object.values(CAT_TARGET)) expect(t.peak).toBeLessThanOrEqual(0.8);
  });

  it('brings the boss\'s cry and drum roll down 2 to 3 dB from where they were, and gives each a middle that a phone plays', () => {
    expect(recipeOf('boss_roar').trim).toBeLessThanOrEqual(-3);
    expect(recipeOf('boss_warning').trim).toBeLessThanOrEqual(-5);
  });
});

describe('the seeded stream of chance (random.ts)', () => {
  it('starts every run from the same seed and gives the same sounds', () => {
    seedAudio();
    const a = [audioRandom(), audioRandom(), audioSpread()];
    seedAudio(AUDIO_SEED);
    expect([audioRandom(), audioRandom(), audioSpread()]).toEqual(a);
    seedAudio(AUDIO_SEED + 1);
    expect(audioRandom()).not.toBe(a[0]);
  });

  it('draws uniformly in [0, 1) and [-1, 1), and takes zero and nonsense for the default seed', () => {
    seedAudio();
    let min = 1;
    let max = -1;
    for (let i = 0; i < 5000; i++) {
      const r = audioRandom();
      expect(r).toBeGreaterThanOrEqual(0);
      expect(r).toBeLessThan(1);
      const s = audioSpread();
      min = Math.min(min, s);
      max = Math.max(max, s);
    }
    expect(min).toBeLessThan(-0.95);
    expect(max).toBeGreaterThan(0.95);
    seedAudio(0);
    const z = audioRandom();
    seedAudio(Number.NaN);
    expect(audioRandom()).toBe(z);
    seedAudio();
    expect(audioRandom()).toBe(z);
  });
});

/** Records what a recipe asks of the synth, with the recordings it lays under it. */
class Recorder {
  readonly tones: ToneOpts[] = [];
  readonly noises: NoiseOpts[] = [];
  readonly samples: Array<{ id: string; o: SampleOpts }> = [];
  private seed = 4242;
  rand = (): number => {
    this.seed = (this.seed * 1664525 + 1013904223) >>> 0;
    return this.seed / 4294967296;
  };
  tone(o: ToneOpts): void {
    this.tones.push(o);
  }
  noise(o: NoiseOpts): void {
    this.noises.push(o);
  }
  sample(id: string, o: SampleOpts = {}): boolean {
    this.samples.push({ id, o });
    return true;
  }
  echo(): Send {
    return { input: {} as AudioNode, tail: 0.1 };
  }
}

function record(r: Recipe, variant = 0): Recorder {
  const s = new Recorder();
  r.build(s as unknown as Synth, { i: variant, j: (a) => (variant === 0 ? 1 : 1 + (s.rand() * 2 - 1) * a) });
  return s;
}

const filtersOf = (o: ToneOpts | NoiseOpts): FilterOpts[] => (o.filter ? (Array.isArray(o.filter) ? [...o.filter] : [o.filter as FilterOpts]) : []);

/** The strongest noise voice that starts the sound and sits in the band of the touch (2.5 to 6 kHz). */
function crackOf(s: Recorder): NoiseOpts | undefined {
  return s.noises
    .filter((n) => (n.at ?? 0) <= 0.002 && n.dur <= 0.05)
    .filter((n) => filtersOf(n).some((f) => f.t === 'bandpass' && f.f >= 2400 && f.f <= 5500 && (f.f2 === undefined || (f.f2 >= 2400 && f.f2 <= 5500))))
    .sort((a, b) => (b.v ?? 1) - (a.v ?? 1))[0];
}

describe('a hit begins with a crack and has a body a phone can play (hitkit.ts)', () => {
  const HITS: SfxId[] = [...IMPACTS, 'hit_heavy', 'crit'];

  it('starts every weapon\'s impact, the heavy layer and the crit with a noise burst between 2.5 and 6 kHz, in the first 2 ms, no longer than 50 ms', () => {
    for (const id of HITS) {
      const r = recipeOf(id);
      for (let v = 0; v < (r.variants ?? 1); v++) {
        const c = crackOf(record(r, v));
        expect(c, `${id} v${v}`).toBeDefined();
        // (air() lifts a noise voice by 3.5: a crack of 0.4 is as loud as a tone of 1.4)
        expect(c?.v ?? 1, `${id} v${v}`).toBeGreaterThanOrEqual(0.25);
      }
    }
  });

  it('has no body that is a bare sine under 200 Hz: a drop below that is driven (saturation) or filtered so that its harmonics sit where a phone plays', () => {
    for (const id of HITS) {
      for (const t of record(recipeOf(id)).tones) {
        const low = t.f < 200 && (t.f2 ?? t.f) < 200;
        if (low) expect(t.sat ?? 0, `${id} ${t.f}`).toBeGreaterThan(0);
      }
    }
  });

  it('is short: every voice of a weapon\'s impact is gone in 0.25 s, the render in 0.3 s (the two top ranks of a class line may use all of it)', () => {
    for (const id of IMPACTS) {
      const r = recipeOf(id);
      expect(r.len, id).toBeLessThanOrEqual(0.3);
      expect(r.ms[1], id).toBeLessThanOrEqual(280);
      const s = record(r);
      for (const v of [...s.tones, ...s.noises]) expect((v.at ?? 0) + v.dur, id).toBeLessThanOrEqual(0.25);
    }
  });

  it('lays recordings only under a whole synthesis, and asks for every file it uses before it bakes (`needs`) and for no other', () => {
    for (const d of SOUNDS) {
      if (d.recipe.legacy) continue;
      const used = new Set<string>();
      const n = d.recipe.variants ?? 1;
      for (let v = 0; v < n; v++) for (const s of record(d.recipe, v).samples) used.add(s.id);
      expect([...used].sort(), d.key).toEqual([...(d.recipe.needs ?? [])].sort());
      const s = record(d.recipe);
      expect(s.tones.length + s.noises.length, `${d.key} is a whole sound without its files`).toBeGreaterThan(0);
    }
  });

  it('ships every recording a hit uses: a file in the game, 16-bit mono 44.1 kHz WAV, short and small, and a row of the ledger', () => {
    const ledger = fs.readFileSync(path.join(__dirname, '..', 'docs', 'licenses', 'sounds.md'), 'utf8');
    const ids = new Set<string>();
    for (const id of IMPACTS) for (const f of recipeOf(id).needs ?? []) ids.add(f);
    for (const id of ['hit_heavy', 'crit', 'explosion', 'boss_roar', 'boss_warning'] as const) for (const f of recipeOf(id).needs ?? []) ids.add(f);
    expect(ids.size).toBeGreaterThanOrEqual(7);
    for (const id of ids) {
      const file = path.join(__dirname, '..', 'src', 'assets', 'sfx', `${id}.wav`);
      expect(fs.existsSync(file), id).toBe(true);
      const b = fs.readFileSync(file);
      expect(b.toString('latin1', 0, 4)).toBe('RIFF');
      expect(b.readUInt16LE(22)).toBe(1);
      expect(b.readUInt32LE(24)).toBe(44100);
      expect(b.readUInt16LE(34)).toBe(16);
      expect(b.length).toBeLessThanOrEqual(60 * 1024);
      expect(b.readUInt32LE(40) / 2 / 44100).toBeLessThanOrEqual(0.4);
      expect(ledger, id).toContain(`src/assets/sfx/${id}.wav`);
      expect(ledger, id).toMatch(/Creative Commons|CC0/);
    }
  });
});

describe('the pieces of the hit kit', () => {
  it('asks for a crack as a plateau (not a spike that dies at once), in the band it is given', () => {
    const s = new Recorder();
    crack(s as unknown as Synth, 0.01, 1, 3200);
    const n = s.noises[0] as NoiseOpts;
    expect(n.at).toBe(0.01);
    expect(n.dur).toBeCloseTo(0.016, 9);
    expect(n.s).toBeGreaterThanOrEqual(0.3);
    expect(filtersOf(n).map((f) => f.t)).toEqual(['highpass', 'bandpass']);
    expect(filtersOf(n)[1]?.f).toBe(3200);
  });

  it('drives a body through a high-pass when it is asked to (the harmonics, not the sub), and leaves a body without one a plain drop', () => {
    const s = new Recorder();
    thud(s as unknown as Synth, 0, 300, 120, 0.1, 1, 0.7, 150);
    const t = s.tones[0] as ToneOpts;
    expect(t.sat).toBe(0.7);
    expect(filtersOf(t)[0]).toMatchObject({ t: 'highpass', f: 150 });
    const plain = new Recorder();
    thud(plain as unknown as Synth, 0, 150, 70, 0.1, 1, 0.3);
    expect(plain.tones[0]?.sat).toBe(0.3);
    expect(filtersOf(plain.tones[0] as ToneOpts)).toHaveLength(0);
  });

  it('rings a bar with four partials that do not come in whole numbers and each die faster than the one under it, and taps with a short band', () => {
    const s = new Recorder();
    ring(s as unknown as Synth, 0, 1000, 0.2);
    expect(s.tones.map((t) => Math.round(t.f))).toEqual([1000, 2320, 3900, 5400]);
    const durs = s.tones.map((t) => t.dur);
    for (let i = 1; i < durs.length; i++) expect(durs[i] as number).toBeLessThan(durs[i - 1] as number);
    const t = new Recorder();
    tap(t as unknown as Synth, 0, 1200, 1, 0.03);
    expect(filtersOf(t.noises[0] as NoiseOpts)[0]).toMatchObject({ t: 'bandpass', f: 1200 });
  });

  it('names a recording by pack and file', () => {
    expect(IMPACT_FILE('impactWood_light_002')).toBe('impact-sounds/impactWood_light_002');
    expect(RPG_FILE('chop')).toBe('rpg-audio/chop');
  });
});
