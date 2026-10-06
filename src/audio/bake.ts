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
}

/** Highest peak a baked buffer may reach even after a positive trim. */
const MAX_PEAK = 0.95;
/** Samples quieter than this (about -56 dBFS) count as the end of the sound. */
const END_THRESHOLD = 0.0015;
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
  const channels = recipe.stereo ? 2 : 1;
  const length = Math.ceil(recipe.len * sampleRate);
  const ctx = new OfflineAudioContext(channels, length, sampleRate);

  // 25 Hz high-pass on the way out: removes inaudible sub-rumble and any DC the recipe's sweeps leave.
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 25;
  hp.Q.value = 0.5;
  hp.connect(ctx.destination);
  const master = ctx.createGain();
  master.connect(hp);

  const rng = new Rng(hashKey(key) + variant * 7919 + 1);
  const synth = new Synth(ctx, master, 0, () => rng.next(), false);
  recipe.build(synth, {
    i: variant,
    j: (amount) => (variant === 0 ? 1 : 1 + (rng.next() * 2 - 1) * amount),
  });
  const rendered = await ctx.startRendering();

  const ch: Float32Array<ArrayBuffer>[] = [];
  for (let c = 0; c < channels; c++) ch.push(rendered.getChannelData(c));
  const raw = analyse(ch, sampleRate, false);
  let gain = normalisationGain(raw.peak, raw.loudRms, CAT_TARGET[recipe.cat]) * dbToGain(recipe.trim ?? 0);
  if (raw.peak * gain > MAX_PEAK) gain = MAX_PEAK / raw.peak;
  for (const c of ch) for (let i = 0; i < c.length; i++) c[i] = (c[i] as number) * gain;

  const end = audibleEnd(ch, END_THRESHOLD);
  const outLen = Math.max(32, Math.min(length, end + Math.round(TAIL_PAD_S * sampleRate)));
  const fade = Math.min(Math.round(FADE_S * sampleRate), outLen >> 2);
  const out = ctx.createBuffer(channels, outLen, sampleRate);
  const outCh: Float32Array<ArrayBuffer>[] = [];
  for (let c = 0; c < channels; c++) {
    const src = ch[c] as Float32Array<ArrayBuffer>;
    const dst = out.getChannelData(c);
    dst.set(src.subarray(0, outLen));
    for (let i = 0; i < fade; i++) {
      const k = 0.5 + 0.5 * Math.cos((Math.PI * i) / fade);
      dst[outLen - fade + i] = (dst[outLen - fade + i] as number) * k;
    }
    dst[outLen - 1] = 0;
    outCh.push(dst);
  }
  const stats = analyse(outCh, sampleRate, spectral);
  return { buffer: out, stats, gainDb: gainToDb(gain), rawPeak: raw.peak };
}
