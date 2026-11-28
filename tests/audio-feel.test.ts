/**
 * The hit-feel pass of 2026-11-27 (a tester: the fight's sounds are bland; the owner: that means the hits have no impact). Measured that day: 28 of the 124
 * recordings keep less than half of their energy at 250 Hz and up, where a phone's speaker plays (the common cat's jab 2 %, the weight under a kill 8 %),
 * the three variants of a recording were one buffer, a death was quieter than the blow that made it, and about a third of the landings were refused.
 * These tests hold what the pass put in: the layer under a take, the old versions for the sound board, the confirm of a kill, the closer landings.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { audio } from '@/audio';
import { GAME_SFX_IDS, WAS_SFX_IDS, type SfxId } from '@/audio/api';
import { familyOf, type SoundKey } from '@/audio/families';
import { backed, recording, takesOf, type Recipe, type Variant } from '@/audio/recipe';
import { sampleStore } from '@/audio/samples';
import { SOUNDS, sfxIndexOf } from '@/audio/sounds';
import type { NoiseOpts, SampleOpts, Send, Synth, ToneOpts } from '@/audio/synth';
import { FEEL, FEEL_KILL, GAP_SECONDS, ROW_BY_KEY } from '@/soundboard/catalog';
import { NEW_VERSIONS, OLD_VERSIONS, was } from '@/soundboard/next';
import { KILL_GAIN, KILL_POP_VOLUME } from '@/view/director/deaths';
import { createRules, winPurr } from '@/view/director/stage';

/** Records what a recipe asks of the synth: the voices, the recordings, and the groups it lays them in. */
class Recorder {
  readonly tones: ToneOpts[] = [];
  readonly noises: NoiseOpts[] = [];
  readonly samples: Array<{ id: string; o: SampleOpts; inGroup: boolean }> = [];
  readonly groups: Array<{ level: number; hp: number; voices: number }> = [];
  private depth = 0;
  tone(o: ToneOpts): void {
    this.tones.push(o);
  }
  noise(o: NoiseOpts): void {
    this.noises.push(o);
  }
  sample(id: string, o: SampleOpts = {}): boolean {
    this.samples.push({ id, o, inGroup: this.depth > 0 });
    return true;
  }
  echo(): Send {
    return { input: {} as AudioNode, tail: 0.1 };
  }
  group(level: number, fn: () => void, hp = 0): void {
    const before = this.tones.length + this.noises.length;
    this.depth++;
    fn();
    this.depth--;
    this.groups.push({ level, hp, voices: this.tones.length + this.noises.length - before });
  }
}

const recipeOf = (id: SfxId): Recipe => (SOUNDS[sfxIndexOf(id)] as (typeof SOUNDS)[number]).recipe;

function record(r: Recipe, v: Partial<Variant> = {}): Recorder {
  const s = new Recorder();
  r.build(s as unknown as Synth, { i: 0, j: () => 1, ...v });
  return s;
}

/** Pretend the recordings have been read (the tests run without the files' bytes in the store). */
function withFiles(): void {
  vi.spyOn(sampleStore, 'get').mockReturnValue({ data: new Float32Array(4410), rate: 44100 });
}

afterEach(() => vi.restoreAllMocks());

const REWORKED = WAS_SFX_IDS.map((id) => id.slice(4) as SfxId);

describe('hit-feel pass: a take with the layer a phone needs under it (`backed`)', () => {
  it('plays the synthesis alone when the file is not there, exactly as before', () => {
    const s = new Recorder();
    let ran = 0;
    backed(s as unknown as Synth, 'hit_heavy', { j: () => 1 }, 0.8, () => {
      ran++;
      s.tone({ f: 300, dur: 0.1 });
    });
    expect(ran).toBe(1);
    expect(s.samples).toHaveLength(0);
    expect(s.groups).toHaveLength(0);
  });

  it('plays the take and lays the synthesis under it at its level, above 240 Hz only (no second bass)', () => {
    withFiles();
    const s = new Recorder();
    backed(s as unknown as Synth, 'hit_heavy', { j: () => 1 }, 0.8, () => s.tone({ f: 300, dur: 0.1 }));
    expect(s.samples.map((x) => x.id)).toEqual(['elevenlabs/hit_heavy']);
    expect(s.samples[0]?.inGroup).toBe(false);
    expect(s.groups).toEqual([{ level: 0.8, hp: 240, voices: 1 }]);
  });

  it('plays the take alone when asked for the sound as it was (`plain`)', () => {
    withFiles();
    const s = new Recorder();
    backed(s as unknown as Synth, 'hit_heavy', { j: () => 1, plain: true }, 0.8, () => s.tone({ f: 300, dur: 0.1 }));
    expect(s.samples).toHaveLength(1);
    expect(s.groups).toHaveLength(0);
    expect(s.tones).toHaveLength(0);
  });

  it('every reworked sound is a game sound whose recipe lays a real layer (a crack or a body) under its take, and nothing under it when plain', () => {
    withFiles();
    // (17 on the day; the owner's answers took the boss's cry and the robot vacuum's fall out again and added the two heavy swings and the wooden sword)
    // (round 12: the clock's hit was made again as tin and plays alone)
    expect(REWORKED.length).toBe(17);
    for (const id of REWORKED) {
      expect(GAME_SFX_IDS, id).toContain(id);
      const now = record(recipeOf(id));
      expect(now.samples.filter((x) => x.id === `elevenlabs/${id}` && !x.inGroup), id).toHaveLength(1);
      expect(now.groups, id).toHaveLength(1);
      expect(now.groups[0]?.voices, id).toBeGreaterThan(0);
      expect(now.groups[0]?.level, id).toBeGreaterThan(0.2);
      expect(now.groups[0]?.level, id).toBeLessThanOrEqual(1.4);
      const plain = record(recipeOf(id), { plain: true });
      expect(plain.groups, id).toHaveLength(0);
      expect(plain.tones.length + plain.noises.length, id).toBe(0);
    }
  });

  it('the variants of a reworked sound are no longer one waveform: the layer under the take moves with the variant', () => {
    withFiles();
    let moved = 0;
    for (const id of REWORKED) {
      const r = recipeOf(id);
      if ((r.variants ?? 1) < 2) continue;
      const a = record(r, { i: 0, j: () => 1 });
      const b = record(r, { i: 1, j: (amount) => 1 + amount });
      if (JSON.stringify([a.tones, a.noises]) !== JSON.stringify([b.tones, b.noises])) moved++;
    }
    expect(moved).toBeGreaterThanOrEqual(10);
  });
});

describe('hit-feel pass: the sounds as they were, for the sound board', () => {
  it('keeps one `was_` version of every reworked sound: the same recipe, its take alone, never baked ahead, in no family', () => {
    for (const id of WAS_SFX_IDS) {
      const of = id.slice(4) as SfxId;
      const r = recipeOf(id);
      expect(r.legacy, id).toBe(true);
      expect(r.plain, id).toBe(true);
      expect(r.variants, id).toBe(1);
      expect(r.seed, id).toBe(`sfx:${of}`);
      expect(r.cat, id).toBe(recipeOf(of).cat);
      expect(r.needs, id).toEqual(recipeOf(of).needs);
      expect(familyOf(id as SoundKey), id).toBeUndefined();
      expect(GAME_SFX_IDS as readonly string[], id).not.toContain(id);
    }
  });

  it(`the board has a row for each, with the take alone as "지금" and the game's sound as "새것"`, () => {
    for (const id of REWORKED) {
      const key = FEEL + id;
      const row = ROW_BY_KEY.get(key);
      expect(row, key).toBeDefined();
      expect(row?.section).toBe('feel');
      expect(NEW_VERSIONS[key], key).toEqual(row?.now);
      expect(NEW_VERSIONS[key]?.map((c) => c.sfx), key).toEqual([id]);
      expect(OLD_VERSIONS[key]?.map((c) => c.sfx), key).toEqual([`was_${id}`]);
    }
    expect(was('hit_heavy')).toBe('was_hit_heavy');
    expect(was('coin')).toBe('coin');
  });

  it('plays a whole kill both ways: before the pass no confirm, the death at its old level and the weight as it was', () => {
    const now = NEW_VERSIONS[FEEL_KILL] ?? [];
    const old = OLD_VERSIONS[FEEL_KILL] ?? [];
    expect(now.map((c) => c.sfx)).toEqual(['imp_w_sword', 'hit_heavy', 'foe_juicy_die', 'kill_pop']);
    // (the wooden sword's landing got its wooden layer in round 11, so its old version is on the old side too)
    expect(old.map((c) => c.sfx)).toEqual(['was_imp_w_sword', 'was_hit_heavy', 'foe_juicy_die']);
    const death = (cues: typeof now): number => cues.find((c) => c.sfx === 'foe_juicy_die')?.volume ?? 0;
    expect(death(now) / death(old)).toBeCloseTo(KILL_GAIN, 6);
    expect(now.find((c) => c.sfx === 'kill_pop')?.volume).toBe(KILL_POP_VOLUME);
  });
});

describe('hit-feel pass: a kill is confirmed, and the landings are closer together', () => {
  it('`kill_pop` is a short pitched pop that climbs an octave with a streak, in a voice no hit has', () => {
    const r = recipeOf('kill_pop');
    expect(r.cat).toBe('tick');
    expect(r.climb).toBe(12);
    expect(r.ms[1]).toBeLessThanOrEqual(150);
    const s = record(r);
    expect(s.tones.length).toBeGreaterThan(0);
    // pitched: its loudest voices are tones at A5 and up, not a noise
    expect(Math.min(...s.tones.map((t) => t.f))).toBeGreaterThan(700);
    expect(familyOf('kill_pop')?.name).toBe('sticker and tine');
  });

  it(`has a budget of its own, outside the crowd's pool, so a kill is never the sound a busy wave swallows`, () => {
    const rules = createRules();
    // fill the shared pool of the fight (9 starts in 0.3 s)
    let t = 0;
    for (let i = 0; i < 40; i++) {
      rules.die.allow(t);
      t += 0.01;
    }
    expect(rules.die.allow(t)).toBe(false);
    expect(rules.killPop.allow(t)).toBe(true);
    expect(GAP_SECONDS.killPop).toBe(0.07);
  });

  it('lets a landing start 0.045 s after the last (0.06 before) and a heavy one 0.1 s after (0.14 before); a release is as thin as it was', () => {
    expect(GAP_SECONDS.hit).toBe(0.045);
    expect(GAP_SECONDS.heavyHit).toBe(0.1);
    expect(GAP_SECONDS.shoot).toBe(0.1);
    const rules = createRules();
    expect(rules.hit.allow(1)).toBe(true);
    expect(rules.hit.allow(1.03)).toBe(false);
    expect(rules.hit.allow(1.05)).toBe(true);
  });
});

describe(`round 11 (the owner's answers): more than one take of a sound, and the cats' voices`, () => {
  it('a sound with several takes plays another take per baked variant, and only the first one as it was before the pass', () => {
    const have = new Set(['elevenlabs/x', 'elevenlabs/x_2', 'elevenlabs/x_3']);
    vi.spyOn(sampleStore, 'get').mockImplementation((id) => (have.has(id) ? { data: new Float32Array(441), rate: 44100 } : undefined));
    expect(takesOf('x')).toEqual(['elevenlabs/x', 'elevenlabs/x_2', 'elevenlabs/x_3']);
    expect(takesOf('y')).toEqual([]);
    const played = (v: Partial<Variant>): string | undefined => {
      const s = new Recorder();
      recording(s as unknown as Synth, 'x', { j: () => 1, ...v });
      return s.samples[0]?.id;
    };
    expect([0, 1, 2, 3].map((i) => played({ i }))).toEqual(['elevenlabs/x', 'elevenlabs/x_2', 'elevenlabs/x_3', 'elevenlabs/x']);
    expect(played({ i: 2, plain: true })).toBe('elevenlabs/x');
    expect(recording(new Recorder() as unknown as Synth, 'y')).toBe(false);
  });

  it('the takes the owner picked as variants are asked for by their recipes (the sling, its pebble, the bell)', () => {
    expect(recipeOf('atk_r_sling').needs).toEqual(['elevenlabs/atk_r_sling', 'elevenlabs/atk_r_sling_2']);
    expect(recipeOf('imp_r_sling').needs).toEqual(['elevenlabs/imp_r_sling', 'elevenlabs/imp_r_sling_2', 'elevenlabs/imp_r_sling_3']);
    expect(recipeOf('imp_t_bell').needs).toEqual(['elevenlabs/imp_t_bell', 'elevenlabs/imp_t_bell_2']);
    for (const id of ['atk_r_sling', 'imp_r_sling', 'imp_t_bell'] as const) expect(recipeOf(id).variants ?? 1, id).toBeGreaterThanOrEqual((recipeOf(id).needs ?? []).length);
  });

  it('a cat grumbles in four takes, a 대왕 cries in the voice of its class, a rank 5 cat has a battle cry: each a recording with a mew behind it', () => {
    const no = recipeOf('cat_no');
    expect(no.variants).toBe(4);
    expect(no.needs).toEqual(['elevenlabs/cat_no', 'elevenlabs/cat_no_2', 'elevenlabs/cat_no_3', 'elevenlabs/cat_no_4']);
    for (const id of ['cat_no', 'cat_king_w', 'cat_king_r', 'cat_king_m', 'cat_king_t', 'cat_battlecry'] as const) {
      expect(GAME_SFX_IDS, id).toContain(id);
      expect(familyOf(id)?.name, id).toBe('cat voice');
      // without the file: a small synthesised mew, a whole sound
      const s = record(recipeOf(id));
      expect(s.tones.length, id).toBeGreaterThan(0);
      expect(s.samples, id).toHaveLength(0);
    }
  });

  it(`the boss's cry and the robot vacuum's fall are the takes alone again (the owner: the old ones were better)`, () => {
    withFiles();
    for (const id of ['boss_roar', 'foe_motor_die'] as const) {
      const s = record(recipeOf(id));
      expect(s.groups, id).toHaveLength(0);
      expect(s.samples.map((x) => x.id), id).toEqual([`elevenlabs/${id}`]);
      expect(WAS_SFX_IDS as readonly string[], id).not.toContain(`was_${id}`);
    }
  });
});

describe(`round 12 (the owner's answers to round 11)`, () => {
  it('a win purrs twice over the victory jingle, the second a little higher', () => {
    const play = vi.spyOn(audio, 'play').mockImplementation(() => undefined);
    winPurr();
    expect(play.mock.calls.map((c) => c[0])).toEqual(['purr', 'purr']);
    expect(play.mock.calls[1]?.[1]?.pitch).toBeGreaterThan(1);
    expect(play.mock.calls[1]?.[1]?.delay).toBeGreaterThan(play.mock.calls[0]?.[1]?.delay ?? 0);
  });

  it('the sounds the owner gave more takes have one variant per take, the clock is tin and plays alone, a guardian has a cry per class', () => {
    const takes = { atk_w_paw: 4, imp_w_paw: 7, foe_plastic_hit: 6, foe_rubber_hit: 4, hit_heavy: 4, foe_tin_hit: 4 } as const;
    for (const [id, n] of Object.entries(takes) as Array<[SfxId, number]>) {
      const r = recipeOf(id);
      expect(r.variants, id).toBe(n);
      expect(r.needs, id).toEqual([`elevenlabs/${id}`, ...Array.from({ length: n - 1 }, (_, i) => `elevenlabs/${id}_${i + 2}`)]);
    }
    withFiles();
    expect(record(recipeOf('foe_tin_hit')).groups).toHaveLength(0);
    for (const id of ['cat_guard_w', 'cat_guard_r', 'cat_guard_m', 'cat_guard_t'] as const) {
      expect(GAME_SFX_IDS, id).toContain(id);
      expect(familyOf(id)?.name, id).toBe('cat voice');
    }
  });
});
