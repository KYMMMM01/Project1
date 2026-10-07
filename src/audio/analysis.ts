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
  /** Milliseconds the first note takes to rise from 10 % to 90 % of its own peak: how soft or hard the touch is. */
  attackMs: number;
  /**
   * Share of the A-weighted energy of the first ~21 ms (one 1024-sample window from the start) that lies between 2 and 6 kHz: the crisp
   * bite of a contact. A-weighted because a low body under it is mostly inaudible on a phone, so it must not drown the bite in the figure.
   */
  snapFrac: number;
  /** Share of the whole spectral energy between 80 and 200 Hz: the low body of a heavy hit (what a phone speaker can still reproduce). */
  bodyFrac: number;
  /** What the sound looks like to a distinctness check: duration, brightness, how the brightness moves and the shape of the level. */
  sig: Signature;
}

/**
 * A fingerprint of a sound for telling two of them apart: `logMs` the natural log of the audible duration, `logHz` of the spectral
 * centroid, `contour` how the centroid moves (its log relative to the mean, in four equal time slices: a pitch glide or a noise band
 * sweeping up or down) and `env` the level in eight equal time slices, normalised to the loudest and square-rooted.
 */
export interface Signature {
  logMs: number;
  logHz: number;
  contour: number[];
  env: number[];
}

/** Differences that count as "one unit apart": 35 % in duration, 35 % in centroid, 0.25 in log-centroid movement, 0.2 in envelope. */
const SIG_UNIT = { ms: 0.3, hz: 0.3, contour: 0.25, env: 0.2 } as const;

/** Distance between two fingerprints in units (see SIG_UNIT): 0 identical, 1 clearly different in at least one respect. */
export function signatureDistance(a: Signature, b: Signature): number {
  const rms = (x: readonly number[], y: readonly number[]) => Math.sqrt(x.reduce((sum, v, i) => sum + (v - (y[i] ?? 0)) ** 2, 0) / Math.max(1, x.length));
  const terms = [
    (a.logMs - b.logMs) / SIG_UNIT.ms,
    (a.logHz - b.logHz) / SIG_UNIT.hz,
    rms(a.contour, b.contour) / SIG_UNIT.contour,
    rms(a.env, b.env) / SIG_UNIT.env,
  ];
  return Math.sqrt(terms.reduce((sum, t) => sum + t * t, 0));
}

const SILENT_PEAK = 0.01;
const CLIP_PEAK = 0.99;
const ZERO_EDGE = 0.01;
const END_EDGE = 0.005;
/** Loudness integration window in seconds. */
const LOUD_WINDOW = 0.2;
/** Envelope block for the attack measurement. */
const ATTACK_BLOCK_S = 0.001;

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

/** The touch of the first note, not of the loudest one: later notes of a figure may be louder. */
const ATTACK_HEAD_S = 0.08;

/**
 * Attack time in ms of the first note or grain: the envelope is 1 ms peak blocks widened to 3 ms (so a carrier cycle cannot
 * ripple it), the clock starts at 10 % of the loudest block in the first 80 ms and stops at 90 % of the first local peak,
 * which ends when the envelope falls to half of its running maximum.
 */
export function attackTime(ch: readonly Float32Array[], sampleRate: number, start: number, end: number): number {
  const block = Math.max(1, Math.round(sampleRate * ATTACK_BLOCK_S));
  const head = Math.min(end, start + Math.round(sampleRate * ATTACK_HEAD_S));
  const env: number[] = [];
  for (let i = start; i < head; i += block) {
    let m = 0;
    for (const c of ch) for (let j = i; j < Math.min(end, i + block); j++) m = Math.max(m, Math.abs(c[j] as number));
    env.push(m);
  }
  const wide = env.map((m, i) => Math.max(env[i - 1] ?? 0, m, env[i + 1] ?? 0));
  const first = wide.findIndex((m) => m >= Math.max(...wide) * 0.1);
  if (first < 0) return 0;
  let run = 0;
  let stop = wide.length;
  for (let i = first; i < wide.length; i++) {
    run = Math.max(run, wide[i] as number);
    if ((wide[i] as number) < run * 0.5) {
      stop = i;
      break;
    }
  }
  const last = wide.findIndex((m, i) => i >= first && i < stop && m >= run * 0.9);
  return last < first ? 0 : ((last - first) * block * 1000) / sampleRate;
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
): { centroidHz: number; brightHz: number; lowFrac: number; highFrac: number; bodyFrac: number } {
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
  let mid = 0;
  let high = 0;
  let upper = 0;
  let upperWeighted = 0;
  for (let k = 1; k < bins; k++) {
    const p = power[k] as number;
    const fHz = k * binHz;
    total += p;
    weighted += p * fHz;
    if (fHz < 200) low += p;
    if (fHz >= 80 && fHz < 200) mid += p;
    if (fHz > 4000) high += p;
    if (fHz >= 300) {
      upper += p;
      upperWeighted += p * fHz;
    }
  }
  if (total <= 0) return { centroidHz: 0, brightHz: 0, lowFrac: 0, highFrac: 0, bodyFrac: 0 };
  return {
    centroidHz: weighted / total,
    brightHz: upper > 0 ? upperWeighted / upper : 0,
    lowFrac: low / total,
    highFrac: high / total,
    bodyFrac: mid / total,
  };
}

const SNAP_FFT = 1024;

/** Power weight of the A-weighting curve at `f` Hz (IEC 61672): what a listener hears of that frequency. */
function aWeightPower(f: number): number {
  const f2 = f * f;
  const ra = (12194 ** 2 * f2 * f2) / ((f2 + 20.6 ** 2) * Math.sqrt((f2 + 107.7 ** 2) * (f2 + 737.9 ** 2)) * (f2 + 12194 ** 2));
  return ra * ra;
}

/** A-weighted share of the energy in the first SNAP_FFT samples from `start` that lies between 2 and 6 kHz. */
function snapShare(ch: readonly Float32Array[], sampleRate: number, start: number, end: number): number {
  const re = new Float64Array(SNAP_FFT);
  const im = new Float64Array(SNAP_FFT);
  // A flat window with 5 % cosine ends: a Hann window would silence the very first milliseconds, which is where the bite is.
  const taper = SNAP_FFT * 0.05;
  for (let i = 0; i < SNAP_FFT; i++) {
    let x = 0;
    if (start + i < end) for (const c of ch) x += c[start + i] as number;
    const edge = Math.min(i, SNAP_FFT - 1 - i);
    re[i] = (x / ch.length) * (edge < taper ? 0.5 - 0.5 * Math.cos((Math.PI * edge) / taper) : 1);
  }
  fft(re, im);
  const binHz = sampleRate / SNAP_FFT;
  let total = 0;
  let band = 0;
  for (let k = 1; k < SNAP_FFT / 2; k++) {
    const fHz = k * binHz;
    const p = ((re[k] as number) ** 2 + (im[k] as number) ** 2) * aWeightPower(fHz);
    total += p;
    if (fHz >= 2000 && fHz <= 6000) band += p;
  }
  return total > 0 ? band / total : 0;
}

const SLICE_FFT = 256;

/** Spectral centroid in Hz of each of `n` equal time slices of the audible region (a 256-point window every 128 samples inside a slice). */
function sliceCentroids(ch: readonly Float32Array[], sampleRate: number, start: number, end: number, n: number): number[] {
  const re = new Float64Array(SLICE_FFT);
  const im = new Float64Array(SLICE_FFT);
  const binHz = sampleRate / SLICE_FFT;
  const out: number[] = [];
  for (let k = 0; k < n; k++) {
    const from = start + Math.floor(((end - start) * k) / n);
    const to = start + Math.floor(((end - start) * (k + 1)) / n);
    let total = 0;
    let weighted = 0;
    // A slice shorter than one window still gets one window, centred on it.
    for (let o = Math.max(start, Math.min(from, to - SLICE_FFT)); o < Math.max(to - SLICE_FFT / 2, from + 1); o += SLICE_FFT / 2) {
      for (let i = 0; i < SLICE_FFT; i++) {
        let x = 0;
        if (o + i < end) for (const c of ch) x += c[o + i] as number;
        re[i] = (x / ch.length) * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (SLICE_FFT - 1)));
        im[i] = 0;
      }
      fft(re, im);
      for (let b = 1; b < SLICE_FFT / 2; b++) {
        const p = (re[b] as number) ** 2 + (im[b] as number) ** 2;
        total += p;
        weighted += p * b * binHz;
      }
    }
    out.push(total > 0 ? weighted / total : 0);
  }
  return out;
}

const SIG_SLICES = 4;
const SIG_ENV = 8;

/** The fingerprint of the audible region (see `Signature`). */
export function signatureOf(ch: readonly Float32Array[], sampleRate: number, start: number, end: number, centroidHz: number): Signature {
  const cents = sliceCentroids(ch, sampleRate, start, end, SIG_SLICES).map((c) => Math.log(Math.max(60, c)));
  const mean = cents.reduce((a, b) => a + b, 0) / cents.length;
  const env: number[] = [];
  for (let k = 0; k < SIG_ENV; k++) {
    const from = start + Math.floor(((end - start) * k) / SIG_ENV);
    const to = Math.max(from + 1, start + Math.floor(((end - start) * (k + 1)) / SIG_ENV));
    let sum = 0;
    for (const c of ch) for (let i = from; i < to; i++) sum += (c[i] as number) ** 2;
    env.push(Math.sqrt(sum / ((to - from) * ch.length)));
  }
  const top = Math.max(...env, 1e-9);
  return {
    logMs: Math.log(Math.max(1, ((end - start) / sampleRate) * 1000)),
    logHz: Math.log(Math.max(60, centroidHz)),
    contour: cents.map((c) => c - mean),
    env: env.map((e) => Math.sqrt(e / top)),
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
  const spec = silent || !spectral ? { centroidHz: 0, brightHz: 0, lowFrac: 0, highFrac: 0, bodyFrac: 0 } : spectrum(ch, sampleRate, start, end);
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
    centroidHz: spec.centroidHz,
    brightHz: spec.brightHz,
    lowFrac: spec.lowFrac,
    highFrac: spec.highFrac,
    bodyFrac: spec.bodyFrac,
    modHz: mod.hz,
    modDepth: mod.depth,
    attackMs: silent ? 0 : attackTime(ch, sampleRate, start, end),
    snapFrac: silent || !spectral ? 0 : snapShare(ch, sampleRate, start, end),
    sig: silent || !spectral ? { logMs: 0, logHz: 0, contour: [], env: [] } : signatureOf(ch, sampleRate, start, end, spec.centroidHz),
  };
}

const SPECTROGRAM_FFT = 512;

/**
 * A picture of the audible region: `frames` equal time slices by `bins` equal frequency steps up to `maxHz` (row 0 the lowest), one byte
 * per cell over 60 dB under the loudest cell. For looking at a sound (the hand-off's spectrogram sheets), not for measuring it.
 */
export function spectrogram(ch: readonly Float32Array[], sampleRate: number, frames: number, bins: number, maxHz: number): { ms: number; data: Uint8Array } {
  const threshold = Math.max(1e-5, peakOf(ch) * 0.003);
  const end = audibleEnd(ch, threshold);
  const start = audibleStart(ch, threshold, end);
  const region = Math.max(SPECTROGRAM_FFT, end - start);
  const re = new Float64Array(SPECTROGRAM_FFT);
  const im = new Float64Array(SPECTROGRAM_FFT);
  const binHz = sampleRate / SPECTROGRAM_FFT;
  const power = new Float64Array(frames * bins);
  let top = 1e-30;
  for (let f = 0; f < frames; f++) {
    const from = start + Math.floor(((f + 0.5) * region) / frames) - SPECTROGRAM_FFT / 2;
    for (let i = 0; i < SPECTROGRAM_FFT; i++) {
      const idx = from + i;
      let x = 0;
      if (idx >= 0 && idx < end) for (const c of ch) x += c[idx] as number;
      re[i] = (x / ch.length) * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (SPECTROGRAM_FFT - 1)));
      im[i] = 0;
    }
    fft(re, im);
    const sum = new Float64Array(bins);
    const count = new Float64Array(bins);
    for (let k = 1; k < SPECTROGRAM_FFT / 2; k++) {
      const row = Math.floor(((k * binHz) / maxHz) * bins);
      if (row >= bins) break;
      sum[row] = (sum[row] as number) + (re[k] as number) ** 2 + (im[k] as number) ** 2;
      count[row] = (count[row] as number) + 1;
    }
    for (let b = 0; b < bins; b++) {
      const p = (sum[b] as number) / Math.max(1, count[b] as number);
      power[f * bins + b] = p;
      if (p > top) top = p;
    }
  }
  const data = new Uint8Array(frames * bins);
  for (let i = 0; i < data.length; i++) {
    const db = 10 * Math.log10(Math.max(1e-30, power[i] as number) / top);
    data[i] = Math.round((Math.max(-60, db) + 60) * (255 / 60));
  }
  return { ms: ((end - start) / sampleRate) * 1000, data };
}
