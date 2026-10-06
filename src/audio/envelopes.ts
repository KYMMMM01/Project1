/**
 * Pure envelope / curve maths. Everything here returns plain numbers or typed arrays so the
 * engine can feed them to AudioParam automation and the tests can check them without a context.
 */

/** Floor used instead of 0 for exponential ramps (WebAudio rejects non-positive targets). */
export const SILENCE = 0.0001;

export function dbToGain(db: number): number {
  return Math.pow(10, db / 20);
}

export function gainToDb(gain: number): number {
  return 20 * Math.log10(Math.max(gain, 1e-9));
}

/**
 * User volume slider -> gain. Loudness is perceived roughly as gain^0.6, so v^1.5 makes the slider
 * feel linear while keeping 1.0 at unity and 0 at true silence.
 */
export function volumeTaper(v: number): number {
  const x = v < 0 || !Number.isFinite(v) ? 0 : v > 1 ? 1 : v;
  return x * Math.sqrt(x);
}

export interface EnvPoints {
  /** Seconds from note start, ascending. */
  t: Float64Array;
  /** Gain at each time. */
  v: Float64Array;
  /** True where the segment ending at this point is exponential, false where it is linear / a hard set. */
  exp: Uint8Array;
}

/**
 * Attack / decay / sustain / release as breakpoints. A 0 sustain means a pure pluck that decays
 * to near-silence over `d`. `dur` is the total length including the release, so the note is
 * guaranteed to end at (almost) zero: this is what keeps every recipe click-free.
 *
 *   t=0 : 0                      (hard set, starts silent)
 *   t=a : peak                   (linear attack, at least 2 ms)
 *   t=a+d : peak*s               (exponential decay)
 *   t=dur-r : peak*s             (hold)
 *   t=dur : SILENCE              (exponential release)
 */
export function adsrPoints(peak: number, a: number, d: number, s: number, r: number, dur: number): EnvPoints {
  const att = Math.max(0.002, Math.min(a, dur * 0.5));
  const rel = Math.max(0.004, Math.min(r, dur - att));
  const gate = dur - rel;
  const dec = Math.max(0, Math.min(d, gate - att));
  const sus = Math.max(SILENCE, peak * s);
  const t = [0, att, att + dec, gate, dur];
  const v = [0, peak, sus, sus, SILENCE];
  const exp = [0, 0, 1, 0, 1];
  return { t: Float64Array.from(t), v: Float64Array.from(v), exp: Uint8Array.from(exp) };
}

/** Value of an {@link EnvPoints} envelope at time `t` (used by tests to verify the shape). */
export function sampleEnvelope(env: EnvPoints, t: number): number {
  const n = env.t.length;
  if (t <= (env.t[0] as number)) return env.v[0] as number;
  if (t >= (env.t[n - 1] as number)) return env.v[n - 1] as number;
  for (let i = 1; i < n; i++) {
    const t1 = env.t[i] as number;
    if (t <= t1) {
      const t0 = env.t[i - 1] as number;
      const v0 = env.v[i - 1] as number;
      const v1 = env.v[i] as number;
      const k = (t - t0) / Math.max(1e-9, t1 - t0);
      if (env.exp[i]) return v0 * Math.pow(v1 / v0, k);
      // A hold segment (equal values) and the attack are both linear in WebAudio.
      return v0 + (v1 - v0) * k;
    }
  }
  return env.v[n - 1] as number;
}

export interface DuckPlan {
  /** Gain the duck bus dips to. */
  floor: number;
  /** Time constant of the dip (fast, so the stinger lands on a clear bed). */
  attackTc: number;
  /** Seconds the bus stays down before recovery starts. */
  hold: number;
  /** Time constant of the recovery (slow, so the music swells back in rather than snapping). */
  releaseTc: number;
}

/** Plan for a music duck of `depth` (0..1) lasting `seconds`; recovery takes about 3x `releaseTc`. */
export function duckPlan(depth: number, seconds: number): DuckPlan {
  const d = Math.min(1, Math.max(0, Number.isFinite(depth) ? depth : 0));
  const len = Math.max(0.05, Number.isFinite(seconds) ? seconds : 0);
  const releaseTc = Math.min(0.35, Math.max(0.08, len * 0.18));
  return {
    floor: Math.max(0.03, 1 - d),
    attackTc: 0.025,
    hold: Math.max(0, len - releaseTc * 1.5),
    releaseTc,
  };
}

/**
 * Equal-power cross-fade curve: sin for the incoming track, cos for the outgoing one, so the summed
 * loudness stays constant through the fade (a linear fade dips about 3 dB in the middle).
 */
export function equalPowerCurve(points: number, incoming: boolean): Float32Array {
  const n = Math.max(2, points | 0);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * Math.PI * 0.5;
    out[i] = incoming ? Math.sin(x) : Math.cos(x);
  }
  return out;
}

/** Soft-clip curve for WaveShaperNode: tanh with a normalised slope so `drive` 0 is nearly linear. */
export function softClipCurve(drive: number, size = 1024): Float32Array<ArrayBuffer> {
  const k = 1 + Math.max(0, drive) * 6;
  const norm = Math.tanh(k);
  const out = new Float32Array(size);
  for (let i = 0; i < size; i++) {
    const x = (i / (size - 1)) * 2 - 1;
    out[i] = Math.tanh(k * x) / norm;
  }
  return out;
}

/** Smoothstep on [lo, hi]; used to turn the 0..1 battle intensity into per-layer gain targets. */
export function smoothstep(lo: number, hi: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - lo) / (hi - lo)));
  return t * t * (3 - 2 * t);
}
