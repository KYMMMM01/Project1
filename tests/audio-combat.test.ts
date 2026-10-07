import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { analyse, signatureDistance, signatureOf, spectrogram } from '@/audio/analysis';
import { SFX_IDS, type SfxId } from '@/audio/api';
import { attackSfx, critSfx, foeDieSfx, foeHitSfx, impactSfx } from '@/audio/combat';
import { AudioEngine } from '@/audio/engine';
import { BOSS_DEATHS, FOE_DEATHS, FOE_HITS, IMPACTS, RELEASES } from '@/audio/families';
import type { Recipe } from '@/audio/recipe';
import { CAT_RECIPES } from '@/audio/sfx-cats';
import { FOE_RECIPES } from '@/audio/sfx-foes';
import { SOUNDS, sfxIndexOf } from '@/audio/sounds';
import { SoundBank } from '@/audio/bank';
import type { FilterOpts, NoiseOpts, Send, Synth, ToneOpts } from '@/audio/synth';
import { BUCKETS, BUCKET_FOE, BUCKET_IMPACT, BUCKET_SWING, COMBAT_CAP, VoiceLimiter, type VoiceRule } from '@/audio/voices';
import { game } from '@/core/game';
import { ENEMY_IDS, UNIT_IDS } from '@/game/api';

const recipeOf = (id: SfxId): Recipe => SOUNDS[sfxIndexOf(id)]?.recipe as Recipe;

/** Records the voices a recipe asks for, like the recipe tests do, so a sound can be described without rendering it. */
class Recorder {
  readonly tones: ToneOpts[] = [];
  readonly noises: NoiseOpts[] = [];
  private seed = 99;
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
  echo(): Send {
    return { input: {} as AudioNode, tail: 0.1 };
  }
}

function record(r: Recipe): Recorder {
  const s = new Recorder();
  r.build(s as unknown as Synth, { j: () => 1 });
  return s;
}

const filtersOf = (o: ToneOpts | NoiseOpts): FilterOpts[] => (o.filter ? (Array.isArray(o.filter) ? [...o.filter] : [o.filter as FilterOpts]) : []);

/** Where a noise voice's energy sits: the centre of its band-pass, or half of a low-pass edge, or 3 kHz for open noise. */
function noiseCentre(o: NoiseOpts): { f: number; f2: number } {
  const f = filtersOf(o).find((x) => x.t === 'bandpass') ?? filtersOf(o).find((x) => x.t === 'lowpass');
  if (!f) return { f: 3000, f2: 3000 };
  const k = f.t === 'lowpass' ? 0.5 : 1;
  return { f: f.f * k, f2: (f.f2 ?? f.f) * k };
}

interface Print {
  /** ln of the sound's span in seconds. */
  span: number;
  /** Energy-weighted mean of log2(frequency) in octaves. */
  pitch: number;
  /** Energy-weighted mean of log2(end / start frequency): how the sound glides. */
  slope: number;
  /** Where the energy sits in time, as a share of the span. */
  centre: number;
}

/** A fingerprint of a recipe from its voices alone (node cannot render): span, pitch, glide and where the weight falls in time. */
function printOf(r: Recipe): Print {
  const s = record(r);
  let end = 0;
  let sum = 0;
  let pitch = 0;
  let slope = 0;
  let centre = 0;
  const add = (at: number, dur: number, v: number, f: number, f2: number, noise: boolean) => {
    const w = v * v * dur * (noise ? 0.4 : 1);
    end = Math.max(end, at + dur);
    sum += w;
    pitch += w * Math.log2(Math.max(40, f));
    slope += w * Math.log2(Math.max(40, f2) / Math.max(40, f));
    centre += w * (at + dur * 0.35);
  };
  for (const t of s.tones) add(t.at ?? 0, t.dur, t.v ?? 1, t.f, t.f2 ?? t.f, false);
  for (const n of s.noises) {
    const c = noiseCentre(n);
    add(n.at ?? 0, n.dur, n.v ?? 1, c.f, c.f2, true);
  }
  return { span: Math.log(end), pitch: pitch / sum, slope: slope / sum, centre: centre / sum / end };
}

/** Distance in units: 35 % of span, half an octave of pitch, half an octave of glide, 0.2 of the time centre. */
function distance(a: Print, b: Print): number {
  return Math.hypot((a.span - b.span) / 0.35, (a.pitch - b.pitch) / 0.5, (a.slope - b.slope) / 0.5, (a.centre - b.centre) / 0.2);
}

function closest(ids: readonly SfxId[]): { d: number; pair: string } {
  const prints = ids.map((id) => printOf(recipeOf(id)));
  let best = { d: Infinity, pair: '' };
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const d = distance(prints[i] as Print, prints[j] as Print);
      if (d < best.d) best = { d, pair: `${ids[i]} / ${ids[j]}` };
    }
  }
  return best;
}

const LINES = [
  ['w_paw', 'w_sword', 'w_viking', 'w_samurai', 'w_tiger'],
  ['r_sling', 'r_archer', 'r_ninja', 'r_gunner', 'r_star'],
  ['m_snow', 'm_fire', 'm_storm', 'm_frost', 'm_cosmo'],
  ['t_bell', 't_chef', 't_bard', 't_alch', 't_lucky'],
] as const;

describe('the weapon and enemy catalogue', () => {
  it('gives every cat a release and an impact and every one of them a recipe', () => {
    expect(Object.keys(CAT_RECIPES)).toHaveLength(UNIT_IDS.length * 2);
    for (const u of UNIT_IDS) {
      expect(recipeOf(`atk_${u}`).cat, u).toBe('swing');
      expect(recipeOf(`imp_${u}`).cat, u).toBe('impact');
      expect(SFX_IDS).toContain(`atk_${u}`);
      expect(SFX_IDS).toContain(`imp_${u}`);
    }
    expect(RELEASES).toHaveLength(20);
    expect(IMPACTS).toHaveLength(20);
    expect(FOE_HITS.length + FOE_DEATHS.length + BOSS_DEATHS.length).toBe(Object.keys(FOE_RECIPES).length);
  });

  it('the class lines are the roster lines, weakest first', () => {
    expect(LINES.flat()).toEqual([...UNIT_IDS]);
  });

  it('maps every cat to its own pair of sounds and a crit layer tilted by class, without allocating on lookup', () => {
    for (const u of UNIT_IDS) {
      expect(attackSfx(u).id).toBe(`atk_${u}`);
      expect(impactSfx(u).id).toBe(`imp_${u}`);
      expect(critSfx(u).id).toBe('crit');
      expect(attackSfx(u)).toBe(attackSfx(u));
      expect(Object.isFrozen(impactSfx(u))).toBe(true);
      expect(attackSfx(u).volume).toBeLessThan(impactSfx(u).volume);
    }
    expect(critSfx('w_paw').pitch).toBeLessThan(critSfx('m_snow').pitch);
    expect(impactSfx(null).id).toBe('hit_light');
    expect(critSfx(null).id).toBe('crit');
  });

  it('maps every enemy to a hit and a death by what it is made of, and gives each boss a death of its own', () => {
    for (const e of ENEMY_IDS) {
      expect(SFX_IDS).toContain(foeHitSfx(e).id);
      expect(SFX_IDS).toContain(foeDieSfx(e).id);
      expect(foeHitSfx(e).pitch).toBeGreaterThan(0.5);
      expect(foeHitSfx(e).volume).toBeLessThanOrEqual(1);
    }
    const bossDeaths = ENEMY_IDS.filter((e) => e.startsWith('boss_')).map((e) => foeDieSfx(e).id);
    expect(new Set(bossDeaths).size).toBe(6);
    expect(foeDieSfx('cucumber').id).toBe('foe_juicy_die');
    expect(foeDieSfx('tangerine').id).toBe('foe_juicy_die');
    expect(foeDieSfx('tangerine').pitch).toBeGreaterThan(foeDieSfx('cucumber').pitch);
    expect(foeDieSfx('clock').id).toBe('foe_tin_die');
    expect(foeDieSfx('roomba').id).toBe('foe_motor_die');
    expect(foeHitSfx('balloon').id).toBe(foeHitSfx('balloon_small').id);
    expect(foeHitSfx('balloon_small').pitch).toBeGreaterThan(foeHitSfx('balloon').pitch);
    // A boss is heard through the fight: its hit is lower and louder than a small enemy's.
    expect(foeHitSfx('boss_vacuum').pitch).toBeLessThan(1);
    expect(foeHitSfx('boss_vacuum').volume).toBeGreaterThan(foeHitSfx('roomba').volume);
  });

  it('bosses die longer and heavier than any enemy, and with the highest priority', () => {
    const ordinary = Math.max(...FOE_DEATHS.map((id) => recipeOf(id).ms[1]));
    for (const id of BOSS_DEATHS) {
      expect(recipeOf(id).ms[1], id).toBeGreaterThan(ordinary);
      expect(recipeOf(id).len, id).toBeGreaterThan(0.9);
      expect(recipeOf(id).prio, id).toBe(3);
      expect(recipeOf(id).cat, id).toBe('finale');
      expect(recipeOf(id).rule?.maxVoices, id).toBe(1);
    }
    for (const id of FOE_DEATHS) expect(recipeOf(id).prio, id).toBe(2);
    expect(recipeOf('crit').prio).toBe(2);
    expect(recipeOf('hit_heavy').prio).toBe(1);
  });

  it('keeps the pairs short: releases under 260 ms and impacts under 300 ms, except the top ranks', () => {
    for (const line of LINES) {
      line.forEach((u, rank) => {
        const limit = (kind: 'atk' | 'imp') => (rank >= 3 ? 560 : kind === 'atk' ? 260 : 300);
        expect(recipeOf(`atk_${u}`).ms[1], u).toBeLessThanOrEqual(limit('atk'));
        expect(recipeOf(`imp_${u}`).ms[1], u).toBeLessThanOrEqual(limit('imp'));
      });
    }
  });

  it('repeating sounds are baked in three variants with pitch jitter, band-limited to 7.5 kHz', () => {
    for (const id of [...RELEASES, ...IMPACTS, ...FOE_HITS, ...FOE_DEATHS]) {
      const r = recipeOf(id);
      expect(r.variants, id).toBe(3);
      expect(r.rate ?? 0, id).toBeGreaterThan(0);
      expect(r.lp, id).toBeLessThanOrEqual(7500);
    }
  });
});

describe('class lines grow rank by rank', () => {
  it('every rank is a step bigger: louder by the rank trim, and the top is longer and has more layers than the bottom', () => {
    for (const line of LINES) {
      for (const kind of ['atk_', 'imp_'] as const) {
        const rs = line.map((u) => recipeOf(`${kind}${u}` as SfxId));
        const layers = rs.map((r) => {
          const s = record(r);
          return s.tones.length + s.noises.length;
        });
        expect((rs[4] as Recipe).trim as number, `${line[0]} ${kind}`).toBeGreaterThan(((rs[0] as Recipe).trim as number) + 3);
        expect((rs[4] as Recipe).len, `${line[0]} ${kind}`).toBeGreaterThan((rs[0] as Recipe).len);
        expect(layers[4] as number, `${line[0]} ${kind}`).toBeGreaterThanOrEqual(layers[0] as number);
      }
    }
  });

  it('the heavy hitters are priority 1 so they win a full table', () => {
    for (const id of ['imp_w_viking', 'imp_w_tiger', 'imp_m_cosmo', 'imp_m_fire', 'imp_m_storm', 'imp_r_gunner'] as const) expect(recipeOf(id).prio, id).toBe(1);
  });
});

describe('every sound is told apart from every other of its kind (from what the recipes ask for)', () => {
  // The rendered check (centroid, glide and envelope of the real audio) is in the browser report; this one proves from the voices alone that
  // no two recipes are copies of each other in span, pitch, glide and where the weight falls.
  it('releases', () => expect(closest(RELEASES).d, closest(RELEASES).pair).toBeGreaterThan(0.6));
  it('impacts', () => expect(closest(IMPACTS).d, closest(IMPACTS).pair).toBeGreaterThan(0.6));
  it('enemy hits', () => expect(closest(FOE_HITS).d, closest(FOE_HITS).pair).toBeGreaterThan(0.6));
  it('enemy deaths', () => expect(closest(FOE_DEATHS).d, closest(FOE_DEATHS).pair).toBeGreaterThan(0.6));
  it('boss deaths', () => expect(closest(BOSS_DEATHS).d, closest(BOSS_DEATHS).pair).toBeGreaterThan(0.6));

  it('and the check can tell: a recipe is at distance 0 from itself and far from a different one', () => {
    const a = printOf(recipeOf('atk_w_paw'));
    expect(distance(a, a)).toBe(0);
    expect(distance(a, printOf(recipeOf('foe_boss_cloud')))).toBeGreaterThan(3);
  });
});

describe('the measurements the report relies on', () => {
  const sr = 48000;
  const sine = (hz: number, ms: number, amp = 0.5): Float32Array => Float32Array.from({ length: Math.round((sr * ms) / 1000) }, (_, i) => amp * Math.sin((2 * Math.PI * hz * i) / sr));

  it('a low sine is all body and no bite, a burst of 3 kHz is all bite and no body', () => {
    const low = analyse([sine(150, 80)], sr, true);
    expect(low.bodyFrac).toBeGreaterThan(0.8);
    expect(low.snapFrac).toBeLessThan(0.02);
    const high = analyse([sine(3200, 80)], sr, true);
    expect(high.snapFrac).toBeGreaterThan(0.8);
    expect(high.bodyFrac).toBeLessThan(0.02);
  });

  it('the bite is measured from the very first millisecond: a 3 kHz click on top of a long 150 Hz thud still counts', () => {
    const x = sine(150, 120, 0.6);
    for (let i = 0; i < 400; i++) x[i] = (x[i] as number) + 0.5 * Math.sin((2 * Math.PI * 3200 * i) / sr) * Math.exp(-i / 120);
    expect(analyse([x], sr, true).snapFrac).toBeGreaterThan(0.1);
  });

  it('a fingerprint is zero away from itself, grows with every respect that differs and sees a glide', () => {
    const a = analyse([sine(800, 100)], sr, true);
    const same = analyse([sine(800, 100)], sr, true);
    expect(signatureDistance(a.sig, same.sig)).toBeCloseTo(0, 5);
    const longer = analyse([sine(800, 300)], sr, true);
    expect(signatureDistance(a.sig, longer.sig)).toBeGreaterThan(1);
    const higher = analyse([sine(2400, 100)], sr, true);
    expect(signatureDistance(a.sig, higher.sig)).toBeGreaterThan(1);
    const glide = Float32Array.from({ length: sr / 10 }, (_, i) => 0.5 * Math.sin(2 * Math.PI * (500 * (i / sr) + 15000 * (i / sr) ** 2)));
    const rising = signatureOf([glide], sr, 0, glide.length, 1500);
    expect((rising.contour[3] as number) - (rising.contour[0] as number)).toBeGreaterThan(0.3);
    expect(rising.env).toHaveLength(8);
  });

  it('a spectrogram puts a 1 kHz tone in the row of 1 kHz and bytes between 0 and 255', () => {
    const s = spectrogram([sine(1000, 100)], sr, 40, 48, 8000);
    expect(s.data).toHaveLength(40 * 48);
    const row = Array.from({ length: 48 }, (_, b) => s.data[20 * 48 + b] as number);
    expect(row.indexOf(Math.max(...row))).toBe(Math.floor((1000 / 8000) * 48));
    expect(Math.max(...s.data)).toBe(255);
    expect(s.ms).toBeGreaterThan(90);
  });
});

describe('crowd control: the combat table and the per-window thinning', () => {
  /** Eight combat ids and a plain UI id: id 0-3 swing, 4-7 impact (id 7 priority 2, id 6 priority 1), 8 not a fight sound. */
  const rule = (bucket: number, prio = 0, minGap = 0.02, maxVoices = 2): VoiceRule => ({ maxVoices, minGap, falloff: 0, prio, bucket });
  const rules = (): VoiceRule[] => [
    ...Array.from({ length: 12 }, () => rule(BUCKET_SWING)),
    rule(BUCKET_IMPACT, 0),
    rule(BUCKET_IMPACT, 1),
    rule(BUCKET_IMPACT, 2),
    rule(BUCKET_FOE, 3),
    { maxVoices: 3, minGap: 0, falloff: 0 },
  ];
  const ID_IMPACT0 = 12;
  const ID_HEAVY = 13;
  const ID_CRIT = 14;
  const ID_BOSS = 15;
  const ID_UI = 16;

  it('thins a bucket to its window: only the allowed starts get through, the last one only if its sound has been quiet for a while', () => {
    const l = new VoiceLimiter(rules());
    const w = BUCKETS[BUCKET_SWING];
    // Two different sounds start together: fine (max 2 per 50 ms); the third in the same window is dropped.
    expect(l.request(0, 1, 0.1)).toBeGreaterThan(0);
    expect(l.request(1, 1.01, 0.1)).toBeGreaterThan(0);
    expect(l.request(2, 1.02, 0.1)).toBe(0);
    expect(l.dropped.bucket).toBe(1);
    // Later, in a fresh window, the "last slot" needs a sound that has been silent for `fresh`: id 0 played 20 ms ago is refused, id 3 is not.
    expect(l.request(0, 1.2, 0.1)).toBeGreaterThan(0);
    expect(l.request(0, 1.2 + w.window / 2, 0.1)).toBe(0);
    expect(l.request(3, 1.2 + w.window / 2, 0.1)).toBeGreaterThan(0);
  });

  it('priority 2 and above skips the window: crits, deaths and bosses are never thinned by it', () => {
    const l = new VoiceLimiter(rules());
    for (let i = 0; i < 6; i++) expect(l.request(i % 2 ? ID_HEAVY : ID_IMPACT0, 5 + i * 0.001, 0.05)).toBeGreaterThanOrEqual(0);
    expect(l.request(ID_CRIT, 5.01, 0.05)).toBeGreaterThan(0);
    expect(l.request(ID_BOSS, 5.012, 0.05)).toBeGreaterThan(0);
  });

  it('caps the combat voices and cuts the oldest quiet one of equal priority for a newcomer, telling the engine which slot', () => {
    const l = new VoiceLimiter(rules());
    const slots: number[] = [];
    for (let i = 0; i < COMBAT_CAP; i++) {
      expect(l.request(i, 10 + i * 0.06, 2, 0.8)).toBeGreaterThan(0);
      expect(l.victim).toBe(-1);
      slots.push(l.slot);
    }
    expect(new Set(slots).size).toBe(COMBAT_CAP);
    expect(l.combatActive(10.7)).toBe(COMBAT_CAP);
    // The 11th: every voice is still sounding, so the oldest (the first) gives way.
    expect(l.request(10, 10.8, 2, 0.8)).toBeGreaterThan(0);
    expect(l.victim).toBe(slots[0]);
    expect(l.slot).toBe(slots[0]);
    expect(l.dropped.stolen).toBe(1);
    expect(l.combatActive(10.85)).toBe(COMBAT_CAP);
  });

  it('cuts a quiet voice before a loud one of the same priority, and a low priority before a high one', () => {
    const l = new VoiceLimiter(rules());
    // Voice 0 loud, voice 1 quiet and newer: the quiet one goes first even though it is not the oldest.
    l.request(0, 20, 2, 1);
    const loud = l.slot;
    l.request(1, 20.06, 2, 0.1);
    const quiet = l.slot;
    for (let i = 2; i < COMBAT_CAP; i++) l.request(i, 20.06 + i * 0.06, 2, 1);
    l.request(11, 21, 2, 1);
    expect(l.victim).toBe(quiet);
    expect(l.victim).not.toBe(loud);

    const m = new VoiceLimiter(rules());
    // Fill with a crit (priority 2) first and ordinary sounds after it: the crit is the oldest and still survives.
    m.request(ID_CRIT, 30, 2, 1);
    const crit = m.slot;
    for (let i = 0; i < COMBAT_CAP - 1; i++) m.request(i, 30.06 + i * 0.06, 2, 1);
    m.request(10, 31, 2, 1);
    expect(m.victim).not.toBe(crit);
    expect(m.victim).toBeGreaterThanOrEqual(0);
  });

  it('drops a newcomer that is less important than everything sounding, and lets a boss take any voice', () => {
    const l = new VoiceLimiter(rules());
    l.request(ID_BOSS, 40, 3, 1);
    const boss = l.slot;
    l.request(ID_CRIT, 40.06, 3, 1);
    for (let i = 0; i < COMBAT_CAP - 2; i++) l.request(i, 40.12 + i * 0.06, 3, 1);
    // Everything now sounding has priority 2-3 or equal 0: an ordinary newcomer replaces the oldest ordinary one, never the boss.
    expect(l.request(ID_IMPACT0, 41, 1, 1)).toBeGreaterThan(0);
    expect(l.victim).not.toBe(boss);
    // A full table of crits and bosses: an ordinary sound has nothing to take and is dropped.
    const m = new VoiceLimiter(Array.from({ length: COMBAT_CAP + 2 }, (_, i) => (i < COMBAT_CAP ? rule(BUCKET_FOE, 3, 0, 1) : rule(BUCKET_IMPACT, 0, 0, 1))));
    for (let i = 0; i < COMBAT_CAP; i++) expect(m.request(i, 50 + i * 0.06, 5, 1)).toBeGreaterThan(0);
    expect(m.request(COMBAT_CAP, 51, 1, 1)).toBe(0);
    expect(m.dropped.cap).toBe(1);
  });

  it('a cut voice frees its own places: the same sound may start again at once', () => {
    // One voice per sound: without the release of the cut voice's place, sound 0 would count as sounding for two more seconds.
    const l = new VoiceLimiter(Array.from({ length: COMBAT_CAP + 1 }, () => rule(BUCKET_SWING, 0, 0.02, 1)));
    for (let i = 0; i < COMBAT_CAP; i++) l.request(i, 60 + i * 0.06, 2, 0.8);
    l.request(10, 61, 2, 0.8);
    expect(l.victim).toBe(0);
    expect(l.request(0, 61.3, 2, 0.8)).toBeGreaterThan(0);
    expect(l.dropped.perId).toBe(0);
  });

  it('never touches a sound that is not part of the fight', () => {
    const l = new VoiceLimiter(rules());
    for (let i = 0; i < COMBAT_CAP; i++) l.request(i, 70 + i * 0.06, 5, 1);
    expect(l.request(ID_UI, 71, 1)).toBeGreaterThan(0);
    expect(l.slot).toBe(-1);
    expect(l.victim).toBe(-1);
  });

  it('reset empties the combat table', () => {
    const l = new VoiceLimiter(rules());
    for (let i = 0; i < COMBAT_CAP; i++) l.request(i, 80 + i * 0.06, 5, 1);
    l.reset();
    expect(l.combatActive(80.1)).toBe(0);
    expect(l.request(ID_IMPACT0, 80.1, 1)).toBeGreaterThan(0);
    expect(l.victim).toBe(-1);
  });

  it('the real catalogue puts every weapon and enemy sound in a bucket and the rest outside', () => {
    const buckets = new Map(SOUNDS.map((d) => [d.id, d.rule.bucket ?? -1]));
    for (const id of RELEASES) expect(buckets.get(id), id).toBe(BUCKET_SWING);
    for (const id of IMPACTS) expect(buckets.get(id), id).toBe(BUCKET_IMPACT);
    for (const id of [...FOE_HITS, ...FOE_DEATHS, ...BOSS_DEATHS]) expect(buckets.get(id), id).toBe(BUCKET_FOE);
    for (const id of ['ui_click', 'merge', 'coin', 'level_up', 'awaken'] as const) expect(buckets.get(id), id).toBe(-1);
  });
});

/** The engine with a bank that has every sound baked as a one-second buffer, so the buffer path runs without OfflineAudioContext. */
describe('the engine cuts the oldest quiet fight voice to make room', () => {
  class FakeParam {
    calls: Array<{ fn: string; args: unknown[] }> = [];
    constructor(public value = 1) {}
    setValueAtTime(...args: unknown[]): this {
      this.calls.push({ fn: 'setValueAtTime', args });
      return this;
    }
    linearRampToValueAtTime(...args: unknown[]): this {
      this.calls.push({ fn: 'linearRampToValueAtTime', args });
      return this;
    }
    cancelScheduledValues(...args: unknown[]): this {
      this.calls.push({ fn: 'cancelScheduledValues', args });
      return this;
    }
    setTargetAtTime(): this {
      return this;
    }
    exponentialRampToValueAtTime(): this {
      return this;
    }
  }

  const sources: Array<{ start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn>; buffer: unknown; onended: (() => void) | null }> = [];
  const gains: FakeParam[] = [];

  function node(extra: Record<string, unknown> = {}): Record<string, unknown> {
    const target: Record<string, unknown> = { connect: (n: unknown) => n, disconnect: () => undefined, start: () => undefined, stop: () => undefined, ...extra };
    return new Proxy(target, {
      get(t, p) {
        if (typeof p === 'symbol' || p === 'then') return t[p as string];
        if (!(p in t)) t[p] = new FakeParam(0);
        return t[p];
      },
      set(t, p, v) {
        t[p as string] = v;
        return true;
      },
    });
  }

  class Ctx {
    state = 'suspended';
    currentTime = 0;
    sampleRate = 48000;
    destination = node();
    private readonly listeners: Array<() => void> = [];
    addEventListener(_t: string, fn: () => void): void {
      this.listeners.push(fn);
    }
    resume(): Promise<void> {
      this.state = 'running';
      for (const fn of this.listeners) fn();
      return Promise.resolve();
    }
    suspend(): Promise<void> {
      return Promise.resolve();
    }
    close(): Promise<void> {
      return Promise.resolve();
    }
    createGain = (): Record<string, unknown> => {
      const gain = new FakeParam(1);
      gains.push(gain);
      return node({ gain });
    };
    createStereoPanner = (): Record<string, unknown> => node({ pan: new FakeParam(0) });
    createBufferSource = (): Record<string, unknown> => {
      const src = { start: vi.fn(), stop: vi.fn(), buffer: null as unknown, onended: null as (() => void) | null };
      sources.push(src);
      return node(src);
    };
    createBuffer = (channels: number, length: number, sampleRate: number): Record<string, unknown> =>
      node({ numberOfChannels: channels, length, sampleRate, duration: length / sampleRate, getChannelData: () => new Float32Array(length) });
    createBiquadFilter = (): Record<string, unknown> => node({ frequency: new FakeParam(20000) });
    createDynamicsCompressor = (): Record<string, unknown> => node();
    createConvolver = (): Record<string, unknown> => node();
    createOscillator = (): Record<string, unknown> => node();
    createDelay = (): Record<string, unknown> => node();
    createWaveShaper = (): Record<string, unknown> => node();
  }

  let engine: AudioEngine;
  let ctx: Ctx;

  beforeEach(() => {
    sources.length = 0;
    gains.length = 0;
    const made: Ctx[] = [];
    class Made extends Ctx {
      constructor() {
        super();
        made.push(this);
      }
    }
    vi.stubGlobal('window', { AudioContext: Made, addEventListener: () => undefined, removeEventListener: () => undefined, __dbg: undefined });
    vi.stubGlobal('navigator', { audioSession: { type: 'auto' } });
    vi.spyOn(SoundBank.prototype, 'get').mockReturnValue([{ duration: 1, length: 48000, numberOfChannels: 1 } as unknown as AudioBuffer]);
    engine = new AudioEngine();
    engine.init();
    game.events.emit('firstInput', null);
    ctx = made[made.length - 1] as Ctx;
  });

  afterEach(() => {
    engine.dispose();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('fades the oldest voice out in a few milliseconds and stops it, and counts the cut', async () => {
    await Promise.resolve();
    expect(ctx.state).toBe('running');
    const before = sources.length;
    // Eleven different weapons start 60 ms apart (outside the thinning window) and all keep sounding for a second.
    const ids = RELEASES.slice(0, COMBAT_CAP + 1);
    ids.forEach((id, i) => {
      ctx.currentTime = 1 + i * 0.06;
      engine.play(id);
    });
    const started = sources.slice(before);
    expect(started).toHaveLength(ids.length);
    const s = engine.stats();
    expect(s.sfxDropped.stolen).toBe(1);
    expect(s.combatActive).toBe(COMBAT_CAP);
    // The first voice was cut: its source was told to stop a few ms after the 11th began, and nobody else was.
    expect(started[0]?.stop).toHaveBeenCalledTimes(1);
    const stopAt = (started[0]?.stop.mock.calls[0] as number[])[0] as number;
    expect(stopAt).toBeGreaterThan(1 + COMBAT_CAP * 0.06);
    expect(stopAt).toBeLessThan(1 + COMBAT_CAP * 0.06 + 0.05);
    for (const src of started.slice(1)) expect(src.stop).not.toHaveBeenCalled();
    // And its gain ramped to zero rather than being cut dead.
    const ramps = gains.flatMap((g) => g.calls).filter((c) => c.fn === 'linearRampToValueAtTime' && c.args[0] === 0);
    expect(ramps.length).toBeGreaterThanOrEqual(1);
  });

  it('a boss death takes a full table without being refused, a plain sound is never refused for lack of a cut', () => {
    for (let i = 0; i < COMBAT_CAP; i++) {
      ctx.currentTime = 2 + i * 0.06;
      engine.play(RELEASES[i] as SfxId);
    }
    const stolen = engine.stats().sfxDropped.stolen;
    ctx.currentTime = 2.7;
    engine.play('foe_boss_cloud');
    expect(engine.stats().sfxDropped.stolen).toBe(stolen + 1);
    expect(engine.stats().combatActive).toBe(COMBAT_CAP);
    engine.play('ui_click');
    expect(engine.stats().sfxDropped.cap).toBe(0);
  });
});
