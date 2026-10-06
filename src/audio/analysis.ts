/**
 * Offline signal analysis on plain Float32Array channels: the loudness normaliser uses it when
 * baking a sound, and the machine-checkable quality report uses it to prove no sound is silent,
 * clipped, clicky or DC-shifted. Pure functions, no WebAudio.
 */

export interface SoundStats {
  durationMs: number;
  peak: number;
  /** RMS over the audible region. */
  rms: number;
  /** RMS with short sounds integrated over 200 ms, which is how loudness is actually perceived. */
  loudRms: number;
  dcOffset: number;
  startsAtZero: boolean;
  endsNearZero: boolean;
  silent: boolean;
  clipped: boolean;
  /** Energy-weighted mean frequency, a "brightness" proxy. */
  centroidHz: number;
  /** Centroid of the energy above 300 Hz only, so sub-bass weight cannot mask how bright the body is. */
  brightHz: number;
  /** Share of spectral energy below 200 Hz ("weight"). */
  lowFrac: number;
  /** Share of spectral energy above 4 kHz ("sparkle"). */
  highFrac: number;
  /** Dominant amplitude-modulation rate in Hz (purr, tremolo, crackle); 0 when the envelope is flat. */
  modHz: number;
  /** Modulation index at `modHz`: envelope swing relative to its mean. */
  modDepth: number;
}

const SILENT_PEAK = 0.01;
const CLIP_PEAK = 0.99;
const ZERO_EDGE = 0.01;
const END_EDGE = 0.005;
/** Loudness integration window in seconds. */
const LOUD_WINDOW = 0.2;

export function peakOf(ch: readonly Float32Array[]): number {
  let p = 0;
  for (const c of ch) {
    for (let i = 0; i < c.length; i++) {
      const a = Math.abs(c[i] as number);
      if (a > p) p = a;
    }
  }
  return p;
}

/** Index one past the last sample whose magnitude exceeds `threshold` (0 when nothing does). */
export function audibleEnd(ch: readonly Float32Array[], threshold: number): number {
  let end = 0;
  for (const c of ch) {
    for (let i = c.length - 1; i >= end; i--) {
      if (Math.abs(c[i] as number) > threshold) {
        end = i + 1;
        break;
      }
    }
  }
  return end;
}

function audibleStart(ch: readonly Float32Array[], threshold: number, end: number): number {
  let start = end;
  for (const c of ch) {
    for (let i = 0; i < start; i++) {
      if (Math.abs(c[i] as number) > threshold) {
        start = i;
        break;
      }
    }
  }
  return start;
}

/**
 * Gain that brings a sound to its category target: limited by peak for transient sounds and by
 * loudness for sustained ones, whichever is quieter, so a click and a pad land at the same level.
 */
export function normalisationGain(peak: number, loudRms: number, target: { peak: number; rms: number }): number {
  if (peak < 1e-6) return 1;
  const byPeak = target.peak / peak;
  const byRms = loudRms > 1e-7 ? target.rms / loudRms : Infinity;
  return Math.min(byPeak, byRms);
}

const twiddles = new Map<number, { cos: Float64Array; sin: Float64Array }>();

/** In-place iterative radix-2 FFT. `re`/`im` length must be a power of two. */
export function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  let tw = twiddles.get(n);
  if (!tw) {
    tw = { cos: new Float64Array(n / 2), sin: new Float64Array(n / 2) };
    for (let i = 0; i < n / 2; i++) {
      tw.cos[i] = Math.cos((2 * Math.PI * i) / n);
      tw.sin[i] = -Math.sin((2 * Math.PI * i) / n);
    }
    twiddles.set(n, tw);
  }
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const tr = re[i] as number;
      re[i] = re[j] as number;
      re[j] = tr;
      const ti = im[i] as number;
      im[i] = im[j] as number;
      im[j] = ti;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const half = len >> 1;
    const step = n / len;
    for (let i = 0; i < n; i += len) {
      for (let k = 0; k < half; k++) {
        const wr = tw.cos[k * step] as number;
        const wi = tw.sin[k * step] as number;
        const a = i + k;
        const b = a + half;
        const xr = (re[b] as number) * wr - (im[b] as number) * wi;
        const xi = (re[b] as number) * wi + (im[b] as number) * wr;
        re[b] = (re[a] as number) - xr;
        im[b] = (im[a] as number) - xi;
        re[a] = (re[a] as number) + xr;
        im[a] = (im[a] as number) + xi;
      }
    }
  }
}

const FFT_SIZE = 2048;

/** Spectral centroid and low/high energy shares over the audible region, Hann-windowed frames. */
function spectrum(
  ch: readonly Float32Array[],
  sampleRate: number,
  start: number,
  end: number,
): { centroidHz: number; brightHz: number; lowFrac: number; highFrac: number } {
  const re = new Float64Array(FFT_SIZE);
  const im = new Float64Array(FFT_SIZE);
  const bins = FFT_SIZE / 2;
  const binHz = sampleRate / FFT_SIZE;
  const power = new Float64Array(bins);
  const hop = FFT_SIZE / 2;
  const frames = Math.max(1, Math.ceil((end - start) / hop));
  for (let f = 0; f < frames; f++) {
    const o = start + f * hop;
    for (let i = 0; i < FFT_SIZE; i++) {
      const idx = o + i;
      let s = 0;
      if (idx < end) for (const c of ch) s += c[idx] as number;
      const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (FFT_SIZE - 1));
      re[i] = (s / ch.length) * w;
      im[i] = 0;
    }
    fft(re, im);
    for (let k = 1; k < bins; k++) power[k] = (power[k] as number) + (re[k] as number) ** 2 + (im[k] as number) ** 2;
  }
  let total = 0;
  let weighted = 0;
  let low = 0;
  let high = 0;
  let upper = 0;
  let upperWeighted = 0;
  for (let k = 1; k < bins; k++) {
    const p = power[k] as number;
    const fHz = k * binHz;
    total += p;
    weighted += p * fHz;
    if (fHz < 200) low += p;
    if (fHz > 4000) high += p;
    if (fHz >= 300) {
      upper += p;
      upperWeighted += p * fHz;
    }
  }
  if (total <= 0) return { centroidHz: 0, brightHz: 0, lowFrac: 0, highFrac: 0 };
  return {
    centroidHz: weighted / total,
    brightHz: upper > 0 ? upperWeighted / upper : 0,
    lowFrac: low / total,
    highFrac: high / total,
  };
}

const MOD_FFT = 1024;
/** Envelope frames per second for the modulation analysis. */
const MOD_RATE = 1000;

/**
 * Amplitude-modulation analysis of the audible region: a rectified signal smoothed over 5 ms (which
 * also nulls the carrier ripple at 200 Hz) gives an envelope at 1 kHz; its slow trend is removed and
 * the spectrum between 8 and 80 Hz is searched for the strongest line. Used to prove that a purr
 * really flutters at about 25 Hz instead of trusting the recipe's parameters.
 */
export function modulation(ch: readonly Float32Array[], sampleRate: number, start: number, end: number): { hz: number; depth: number } {
  const hop = Math.max(1, Math.round(sampleRate / MOD_RATE));
  const box = hop * 5;
  const frames = Math.min(MOD_FFT, Math.floor((end - start - box) / hop));
  if (frames < 128) return { hz: 0, depth: 0 };
  const env = new Float64Array(frames);
  let mean = 0;
  for (let k = 0; k < frames; k++) {
    const from = start + k * hop;
    let sum = 0;
    for (const c of ch) for (let i = from; i < from + box; i++) sum += Math.abs(c[i] as number);
    env[k] = sum / (box * ch.length);
    mean += env[k] as number;
  }
  mean /= frames;
  if (mean < 1e-6) return { hz: 0, depth: 0 };

  // Remove the slow trend (attack / release / decay) with a 100 ms moving average.
  const half = 50;
  const flat = new Float64Array(frames);
  for (let k = 0; k < frames; k++) {
    const lo = Math.max(0, k - half);
    const hi = Math.min(frames - 1, k + half);
    let sum = 0;
    for (let j = lo; j <= hi; j++) sum += env[j] as number;
    flat[k] = (env[k] as number) - sum / (hi - lo + 1);
  }
  const re = new Float64Array(MOD_FFT);
  const im = new Float64Array(MOD_FFT);
  let windowSum = 0;
  for (let k = 0; k < frames; k++) {
    const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * k) / (frames - 1));
    re[k] = (flat[k] as number) * w;
    windowSum += w;
  }
  fft(re, im);
  const binHz = MOD_RATE / MOD_FFT;
  let best = 0;
  let bestMag = 0;
  for (let k = Math.ceil(8 / binHz); k <= Math.floor(80 / binHz); k++) {
    const mag = Math.hypot(re[k] as number, im[k] as number);
    if (mag > bestMag) {
      bestMag = mag;
      best = k;
    }
  }
  // A sinusoid of amplitude A through a Hann window of sum S has a spectral line of height A*S/2.
  const amplitude = (2 * bestMag) / windowSum;
  return { hz: best * binHz, depth: amplitude / mean };
}

export function analyse(ch: readonly Float32Array[], sampleRate: number, spectral = true): SoundStats {
  const peak = peakOf(ch);
  const len = (ch[0] as Float32Array).length;
  const silent = peak < SILENT_PEAK;
  const threshold = Math.max(1e-5, peak * 0.003);
  const end = audibleEnd(ch, threshold);
  const start = audibleStart(ch, threshold, end);
  const region = Math.max(1, end - start);

  let sumSq = 0;
  let sum = 0;
  for (const c of ch) {
    for (let i = start; i < end; i++) {
      const x = c[i] as number;
      sumSq += x * x;
      sum += x;
    }
  }
  const n = region * ch.length;
  const window = Math.max(region, LOUD_WINDOW * sampleRate) * ch.length;
  const spec = silent || !spectral ? { centroidHz: 0, brightHz: 0, lowFrac: 0, highFrac: 0 } : spectrum(ch, sampleRate, start, end);
  const mod = silent || !spectral ? { hz: 0, depth: 0 } : modulation(ch, sampleRate, start, end);

  const first = ch.reduce((m, c) => Math.max(m, Math.abs(c[0] as number)), 0);
  const last = ch.reduce((m, c) => Math.max(m, Math.abs(c[len - 1] as number)), 0);

  return {
    durationMs: (end / sampleRate) * 1000,
    peak,
    rms: Math.sqrt(sumSq / n),
    loudRms: Math.sqrt(sumSq / window),
    dcOffset: sum / n,
    startsAtZero: first < ZERO_EDGE,
    endsNearZero: last < END_EDGE,
    silent,
    clipped: peak > CLIP_PEAK,
    ...spec,
    modHz: mod.hz,
    modDepth: mod.depth,
  };
}
