/**
 * Baking: render one recipe variant through an OfflineAudioContext, normalise it to its loudness
 * tier, trim the silent tail and fade the last few ms so no buffer can ever end on a click.
 * The same function feeds both the runtime bank and the machine-checkable quality report.
 */
import { Rng } from '@/core/rng';
import { analyse, audibleEnd, normalisationGain, type SoundStats } from './analysis';
import { dbToGain, gainToDb } from './envelopes';
import { CAT_TARGET, type Recipe } from './recipe';
import { Synth } from './synth';

export interface Baked {
  buffer: AudioBuffer;
  stats: SoundStats;
  /** Normalisation applied to the raw synth output, in dB. */
  gainDb: number;
  /** Peak of the raw synth output before normalisation. */
  rawPeak: number;
  /** The sound was still audible when the offline render ended: a tail was cut off, so `len` is too short. */
  truncated: boolean;
}

/** Highest peak a baked buffer may reach even after a positive trim. */
const MAX_PEAK = 0.95;
/**
 * A sound ends where it has fallen 40 dB below its own peak (and is quieter than -54 dBFS in any
 * case): reverb and echo tails below that are inaudible under a game mix, and keeping them costs
 * decoded memory, which is what holds the whole bank under its 14 MB budget (bank.ts).
 */
const END_FLOOR = 0.002;
const END_REL = 0.01;
const TAIL_PAD_S = 0.012;
const FADE_S = 0.008;

export function offlineSupported(): boolean {
  return typeof OfflineAudioContext === 'function';
}

function hashKey(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export async function bakeVariant(
  recipe: Recipe,
  key: string,
  variant: number,
  sampleRate: number,
  spectral = false,
): Promise<Baked> {
  const length = Math.ceil(recipe.len * sampleRate);
  const ctx = new OfflineAudioContext(1, length, sampleRate);

  // 25 Hz high-pass on the way out: removes inaudible sub-rumble and any DC the recipe's sweeps leave.
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 25;
  hp.Q.value = 0.5;
  hp.connect(ctx.destination);
  const master = ctx.createGain();
  if (recipe.lp) {
    // Sounds that repeat many times a second keep their top end out of the 4-8 kHz region where
    // repetition turns into hiss.
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = recipe.lp;
    lp.Q.value = 0.6;
    master.connect(lp);
    lp.connect(hp);
  } else {
    master.connect(hp);
  }

  const rng = new Rng(hashKey(key) + variant * 7919 + 1);
  const synth = new Synth(ctx, master, 0, () => rng.next(), false);
  recipe.build(synth, { j: (amount) => (variant === 0 ? 1 : 1 + (rng.next() * 2 - 1) * amount) });
  const rendered = await ctx.startRendering();

  const pcm = rendered.getChannelData(0);
  const raw = analyse([pcm], sampleRate, false);
  let gain = normalisationGain(raw.peak, raw.loudRms, CAT_TARGET[recipe.cat]) * dbToGain(recipe.trim ?? 0);
  if (raw.peak * gain > MAX_PEAK) gain = MAX_PEAK / raw.peak;
  for (let i = 0; i < pcm.length; i++) pcm[i] = (pcm[i] as number) * gain;

  const end = audibleEnd([pcm], Math.max(END_FLOOR, raw.peak * gain * END_REL));
  const truncated = end >= length - Math.round(0.004 * sampleRate);
  const outLen = Math.max(32, Math.min(length, end + Math.round(TAIL_PAD_S * sampleRate)));
  const fade = Math.min(Math.round(FADE_S * sampleRate), outLen >> 2);
  const out = ctx.createBuffer(1, outLen, sampleRate);
  const dst = out.getChannelData(0);
  dst.set(pcm.subarray(0, outLen));
  for (let i = 0; i < fade; i++) {
    const k = 0.5 + 0.5 * Math.cos((Math.PI * i) / fade);
    dst[outLen - fade + i] = (dst[outLen - fade + i] as number) * k;
  }
  dst[outLen - 1] = 0;
  const stats = analyse([dst], sampleRate, spectral);
  return { buffer: out, stats, gainDb: gainToDb(gain), rawPeak: raw.peak, truncated };
}
