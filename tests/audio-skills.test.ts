import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SFX_IDS } from '@/audio/api';
import { FAMILIES } from '@/audio/families';
import { CAT_TARGET, type Recipe } from '@/audio/recipe';
import { SAMPLE_URLS, SampleStore, parseWav, sampleIdOf } from '@/audio/samples';
import { SKILL_RECIPES } from '@/audio/sfx-skills';
import { SOUNDS, sfxIndexOf } from '@/audio/sounds';
import type { SampleOpts, Send, Synth } from '@/audio/synth';
import { createRules } from '@/view/director/stage';

const ROOT = join(__dirname, '..');
const SFX_DIR = join(ROOT, 'src', 'assets', 'sfx');
const LEDGER = readFileSync(join(ROOT, 'docs', 'licenses', 'sounds.md'), 'utf8');

/** A 16-bit PCM WAV of `frames` frames of `channels` channels at `rate`, every sample `value`. */
function wav(frames: number, { channels = 1, rate = 44100, bits = 16, format = 1, value = 1000 } = {}): ArrayBuffer {
  const data = frames * channels * 2;
  const b = new DataView(new ArrayBuffer(44 + data));
  const tag = (o: number, s: string): void => [...s].forEach((c, i) => b.setUint8(o + i, c.charCodeAt(0)));
  tag(0, 'RIFF');
  b.setUint32(4, 36 + data, true);
  tag(8, 'WAVE');
  tag(12, 'fmt ');
  b.setUint32(16, 16, true);
  b.setUint16(20, format, true);
  b.setUint16(22, channels, true);
  b.setUint32(24, rate, true);
  b.setUint32(28, rate * channels * 2, true);
  b.setUint16(32, channels * 2, true);
  b.setUint16(34, bits, true);
  tag(36, 'data');
  b.setUint32(40, data, true);
  for (let i = 0; i < frames * channels; i++) b.setInt16(44 + i * 2, value, true);
  return b.buffer;
}

/** The part of a Synth a recipe talks to, recording the recorded layers it asks for. */
function recorder(): { s: Synth; samples: string[] } {
  const samples: string[] = [];
  let seed = 99;
  const send: Send = { input: {} as AudioNode, tail: 0.2 };
  const s = {
    tone: () => undefined,
    noise: () => undefined,
    echo: () => send,
    reverb: () => send,
    rand: () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296),
    sample: (id: string, _o?: SampleOpts) => {
      samples.push(id);
      return true;
    },
  } as unknown as Synth;
  return { s, samples };
}

const IDS = Object.keys(SKILL_RECIPES) as Array<keyof typeof SKILL_RECIPES>;
const recipeOf = (id: string): Recipe => SOUNDS[sfxIndexOf(id as (typeof SFX_IDS)[number])]?.recipe as Recipe;

describe('reading a recorded layer', () => {
  it('turns 16-bit PCM into floats at the file\'s own rate (any channel count, mixed to mono)', () => {
    const mono = parseWav(wav(100, { value: 16384 }));
    expect(mono?.rate).toBe(44100);
    expect(mono?.data).toHaveLength(100);
    expect(mono?.data[0]).toBeCloseTo(0.5, 6);
    const stereo = parseWav(wav(50, { channels: 2, rate: 22050, value: -8192 }));
    expect(stereo?.rate).toBe(22050);
    expect(stereo?.data).toHaveLength(50);
    expect(stereo?.data[0]).toBeCloseTo(-0.25, 6);
  });

  it('refuses everything else: not a WAV, not PCM, not 16-bit, no data, an absurd rate', () => {
    expect(parseWav(new ArrayBuffer(10))).toBeNull();
    expect(parseWav(new TextEncoder().encode('OggS'.padEnd(100, 'x')).buffer as ArrayBuffer)).toBeNull();
    expect(parseWav(wav(10, { format: 3 }))).toBeNull();
    expect(parseWav(wav(10, { bits: 8 }))).toBeNull();
    expect(parseWav(wav(10, { rate: 4000 }))).toBeNull();
    expect(parseWav(wav(0))).toBeNull();
  });

  it('is named by the pack and the file, the same key as the sound board\'s candidate list', () => {
    expect(sampleIdOf('/src/assets/sfx/impact-sounds/impactMetal_light_000.wav')).toBe('impact-sounds/impactMetal_light_000');
    expect(sampleIdOf('/src/assets/sfx/rpg-audio/metalLatch.wav')).toBe('rpg-audio/metalLatch');
  });
});

describe('the sample store', () => {
  const urls = new Map([['a/x', 'x.wav'], ['a/y', 'y.wav'], ['a/bad', 'bad.wav'], ['a/slow', 'slow.wav']]);

  it('loads a file once, however often it is asked for, and decodes it', async () => {
    let fetches = 0;
    const store = new SampleStore(urls, async () => {
      fetches++;
      return wav(40);
    });
    expect(store.get('a/x')).toBeUndefined();
    await Promise.all([store.load('a/x'), store.load('a/x'), store.settled(['a/x'])]);
    await store.load('a/x');
    expect(fetches).toBe(1);
    expect(store.get('a/x')?.data).toHaveLength(40);
    expect(store.loaded).toBe(1);
    expect(store.bytes).toBeGreaterThan(80);
  });

  it('gives a file that does not load (a network error, a file that is not a WAV, an unknown id) up quietly, and never rejects', async () => {
    const store = new SampleStore(urls, async (url) => {
      if (url === 'x.wav') throw new Error('offline');
      if (url === 'bad.wav') return new ArrayBuffer(8);
      return wav(10);
    });
    await expect(store.settled(['a/x', 'a/bad', 'a/y', 'a/nowhere'])).resolves.toBeUndefined();
    expect(store.hasFailed('a/x')).toBe(true);
    expect(store.hasFailed('a/bad')).toBe(true);
    expect(store.hasFailed('a/nowhere')).toBe(true);
    expect(store.get('a/y')).toBeDefined();
    expect(store.known('a/y')).toBe(true);
    expect(store.known('a/nowhere')).toBe(false);
    const throwing = new SampleStore(urls, () => {
      throw new Error('refused at once');
    });
    await expect(throwing.preload()).resolves.toBeUndefined();
    expect(throwing.loaded).toBe(0);
  });

  it('lets a bake go on without a file that takes too long, and does not stop the file from arriving later', async () => {
    let release: (b: ArrayBuffer) => void = () => undefined;
    const store = new SampleStore(urls, (url) => (url === 'slow.wav' ? new Promise<ArrayBuffer>((res) => (release = res)) : Promise.resolve(wav(5))));
    const t0 = Date.now();
    const waited = store.settled(['a/slow', 'a/x']);
    // the wait ends on its own after a few seconds; here the file is let through instead, which settles the wait at once
    release(wav(5));
    await waited;
    expect(Date.now() - t0).toBeLessThan(1000);
    expect(store.get('a/slow')).toBeDefined();
  });
});

describe('the sample files the game carries (docs/licenses/sounds.md)', () => {
  const files: string[] = [];
  for (const pack of readdirSync(SFX_DIR)) for (const f of readdirSync(join(SFX_DIR, pack))) files.push(`${pack}/${f}`);

  it('are WAV, 16-bit mono 44.1 kHz, short and small, and the store knows every one of them', () => {
    expect(files.length).toBeGreaterThan(10);
    let total = 0;
    for (const f of files) {
      expect(f, f).toMatch(/\.wav$/);
      const path = join(SFX_DIR, f);
      const size = statSync(path).size;
      total += size;
      expect(size, `${f} bytes`).toBeLessThanOrEqual(60 * 1024);
      const pcm = parseWav(readFileSync(path).buffer.slice(readFileSync(path).byteOffset, readFileSync(path).byteOffset + size) as ArrayBuffer);
      expect(pcm, f).not.toBeNull();
      expect(pcm?.rate, f).toBe(44100);
      expect((pcm?.data.length ?? 0) / 44100, f).toBeLessThanOrEqual(0.4 + 1e-3);
      let peak = 0;
      for (const v of pcm?.data ?? []) peak = Math.max(peak, Math.abs(v));
      expect(peak, `${f} peak`).toBeLessThanOrEqual(0.98 + 1e-3);
      expect(SAMPLE_URLS.has(f.slice(0, -4)), f).toBe(true);
    }
    expect(total).toBeLessThan(1024 * 1024);
    expect(SAMPLE_URLS.size).toBe(files.length);
  });

  it('come only from the three CC0 packs, and each has a row of the ledger with its source, URL, license and date', () => {
    const inGame = LEDGER.slice(LEDGER.indexOf('## In the game'));
    for (const f of files) {
      const [pack, file] = f.split('/') as [string, string];
      expect(['impact-sounds', 'rpg-audio', 'interface-sounds'], f).toContain(pack);
      const row = inGame.split('\n').find((l) => l.includes(`src/assets/sfx/${f} `));
      expect(row, f).toBeDefined();
      expect(row).toContain(`${pack} / ${file.slice(0, -4)}.ogg`);
      expect(row).toContain(`https://kenney.nl/assets/${pack}`);
      expect(row).toContain('CC0');
      expect(row).toMatch(/\| \d{4}-\d{2}-\d{2} \|/);
      // the source file is in the repository
      expect(existsSync(join(ROOT, 'art', 'sfx_src', 'kenney', `kenney_${pack}`, 'Audio', `${file.slice(0, -4)}.ogg`)), f).toBe(true);
    }
    expect(inGame.split('\n').filter((l) => l.startsWith('| src/assets/sfx/'))).toHaveLength(files.length);
  });

  it('are each laid under some recipe (no file ships without a sound that uses it), and every recipe\'s `needs` is a file that ships', () => {
    const needed = new Set<string>();
    for (const d of SOUNDS) for (const id of d.recipe.needs ?? []) needed.add(id);
    for (const id of needed) expect(SAMPLE_URLS.has(id), id).toBe(true);
    for (const f of files) expect(needed.has(f.slice(0, -4)), `${f} is not used`).toBe(true);
  });
});

describe('the skills\' sounds', () => {
  it('are 48: a signature or a small sound for every moment, all named sp_, none lost from the catalogue', () => {
    expect(IDS).toHaveLength(48);
    expect(SFX_IDS.filter((id) => id.startsWith('sp_')).sort()).toEqual([...IDS].sort());
    for (const id of IDS) expect(sfxIndexOf(id), id).toBeGreaterThanOrEqual(0);
  });

  it('are of two tiers: a signature (`skill`) the size of a moment, a small sound (`skillTick`) a texture, and the signature louder', () => {
    expect(CAT_TARGET.skill.peak).toBeGreaterThan(CAT_TARGET.skillTick.peak);
    expect(CAT_TARGET.skill.rms).toBeGreaterThan(CAT_TARGET.skillTick.rms);
    expect(CAT_TARGET.skill.peak).toBeLessThan(CAT_TARGET.big.peak);
    for (const id of IDS) expect(['skill', 'skillTick'], id).toContain(recipeOf(id).cat);
    expect(IDS.filter((id) => recipeOf(id).cat === 'skill').length).toBeGreaterThan(20);
    expect(IDS.filter((id) => recipeOf(id).cat === 'skillTick').length).toBeGreaterThan(15);
  });

  it('keep to the voice rules of their tier: a signature is one at a time, a small sound a few, none join the fight\'s buckets', () => {
    for (const id of IDS) {
      const d = SOUNDS[sfxIndexOf(id)] as (typeof SOUNDS)[number];
      expect(d.rule.bucket, `${id} is not a fight sound`).toBe(-1);
      expect(d.rule.maxVoices, id).toBeLessThanOrEqual(d.recipe.cat === 'skill' ? 2 : 4);
      expect(d.rule.minGap, id).toBeGreaterThanOrEqual(0.03);
      expect(d.rule.minGap, id).toBeLessThanOrEqual(0.4);
    }
  });

  it('is each in one family, which holds it to a window of duration, attack, brightness and weight', () => {
    for (const id of IDS) expect(FAMILIES.filter((f) => (f.members as readonly string[]).includes(id)), id).toHaveLength(1);
    const names = FAMILIES.filter((f) => f.name.startsWith('skill ')).map((f) => f.name);
    expect(names).toHaveLength(5);
  });

  it('give the loudest moments room to be heard: the music dips under the roar, the boom, the clash and the prizes that are a big moment', () => {
    for (const id of ['sp_tiger_roar', 'sp_meteor_boom', 'sp_cut_clash', 'sp_shield_slam', 'sp_glass_shatter', 'sp_flask_pop', 'sp_prize_toy', 'sp_prize_guardian', 'sp_cutin'] as const) {
      expect(recipeOf(id).duck, id).toBeDefined();
    }
    // the roar and the boom take the room longest; a small sound never dips the music
    expect(recipeOf('sp_tiger_roar').duck?.depth).toBeGreaterThanOrEqual(0.5);
    expect(recipeOf('sp_meteor_boom').duck?.seconds).toBeGreaterThanOrEqual(1.2);
    for (const id of IDS.filter((x) => recipeOf(x).cat === 'skillTick')) expect(recipeOf(id).duck, id).toBeUndefined();
  });

  it('lay recorded layers only where they have said they need them (`needs`), so a bake can wait for the files and a missing file costs a layer, not a sound', () => {
    for (const id of IDS) {
      const r = recipeOf(id);
      const variants = r.variants ?? 1;
      const used = new Set<string>();
      for (let i = 0; i < variants; i++) {
        const { s, samples } = recorder();
        r.build(s, { i, j: () => 1 });
        for (const x of samples) used.add(x);
      }
      for (const x of used) expect(r.needs ?? [], `${id} lays ${x}`).toContain(x);
      for (const x of r.needs ?? []) expect(used.has(x), `${id} says it needs ${x} and never lays it`).toBe(true);
    }
  });

  it('use a different recording for each variant of the clash, the shard and the capsule\'s bounce', () => {
    for (const [id, n] of [['sp_cut_clash', 3], ['sp_shard_hit', 5], ['sp_capsule_bounce', 3]] as const) {
      const r = recipeOf(id);
      expect(r.variants, id).toBe(n);
      const first = new Set<string>();
      for (let i = 0; i < n; i++) {
        const { s, samples } = recorder();
        r.build(s, { i, j: () => 1 });
        first.add(samples[0] as string);
      }
      expect(first.size, id).toBe(n);
    }
  });

  it('stay short (a roar is the longest, under 1.2 s) and never reach for the top of the range (no low-pass above 10 kHz)', () => {
    for (const id of IDS) {
      const r = recipeOf(id);
      expect(r.len, id).toBeLessThanOrEqual(1.3);
      expect(r.ms[1], id).toBeLessThanOrEqual(1150);
      if (r.lp) expect(r.lp, id).toBeLessThanOrEqual(10000);
    }
  });
});

describe('the skills\' rules in the director', () => {
  it('has two of its own: the signature is never thinned, the small sounds share a budget of six starts in 0.12 s outside the fight\'s pool', () => {
    const rules = createRules();
    // not thinned: any number of asks in the same instant are all let through
    for (let i = 0; i < 40; i++) expect(rules.skill.allow(5), `ask ${i}`).toBe(true);
    // small sounds: each start at least 0.025 s after the last (and never more than six in 0.12 s)
    const tick = createRules().skillTick;
    expect(tick.allow(1)).toBe(true);
    expect(tick.allow(1.01)).toBe(false);
    expect(tick.allow(1.04)).toBe(true);
    expect(tick.allow(1.08)).toBe(true);
    expect(tick.gap).toBe(0.025);
    // and the fight's busy second cannot starve them: drain the shared pool with fight sounds, the skills still sound
    const busy = createRules();
    for (let i = 0; i < 40; i++) busy.shoot.allow(10 + i * 0.01);
    expect(busy.skillTick.allow(10.5)).toBe(true);
    expect(busy.skill.allow(10.5)).toBe(true);
  });
});
