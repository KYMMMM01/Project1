import { describe, expect, it } from 'vitest';
import { analyse, audibleEnd, fft, normalisationGain, peakOf } from '@/audio/analysis';
import {
  SILENCE,
  adsrPoints,
  dbToGain,
  duckPlan,
  equalPowerCurve,
  gainToDb,
  type EnvPoints,
  smoothstep,
  softClipCurve,
  volumeTaper,
} from '@/audio/envelopes';
import { LayerMixer, StepClock, barPosition, stepSeconds } from '@/audio/sequencer';
import {
  MAX_STEP_SEMITONES,
  hz,
  midiToHz,
  noteToMidi,
  pentatonicSemitones,
  semitoneRatio,
} from '@/audio/theory';
import { VoiceBudget, VoiceLimiter, type VoiceRule } from '@/audio/voices';

describe('theory', () => {
  it('maps steps onto the major pentatonic', () => {
    const first = Array.from({ length: 11 }, (_, i) => pentatonicSemitones(i));
    expect(first).toEqual([0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24]);
  });

  it('caps the climb at +24 semitones and floors negatives at an octave down', () => {
    expect(pentatonicSemitones(11)).toBe(MAX_STEP_SEMITONES);
    expect(pentatonicSemitones(500)).toBe(MAX_STEP_SEMITONES);
    expect(pentatonicSemitones(-1)).toBe(-3);
    expect(pentatonicSemitones(-100)).toBe(-12);
  });

  it('tolerates junk input', () => {
    expect(pentatonicSemitones(Number.NaN)).toBe(0);
    expect(pentatonicSemitones(2.6)).toBe(7);
  });

  it('every ladder step is consonant: all intervals to the root stay inside the pentatonic set', () => {
    for (let i = 0; i <= 10; i++) {
      const pc = pentatonicSemitones(i) % 12;
      expect([0, 2, 4, 7, 9]).toContain(pc);
    }
  });

  it('converts notes and frequencies', () => {
    expect(noteToMidi('C4')).toBe(60);
    expect(noteToMidi('A4')).toBe(69);
    expect(noteToMidi('F#3')).toBe(54);
    expect(noteToMidi('Bb2')).toBe(46);
    expect(hz('A4')).toBeCloseTo(440, 6);
    expect(midiToHz(81)).toBeCloseTo(880, 6);
    expect(semitoneRatio(12)).toBeCloseTo(2, 9);
    expect(() => noteToMidi('H9')).toThrow();
  });

});

/** Evaluate breakpoints the way WebAudio would: linear for the attack and holds, exponential where flagged. */
function sampleEnvelope(env: EnvPoints, t: number): number {
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
      return env.exp[i] ? v0 * Math.pow(v1 / v0, k) : v0 + (v1 - v0) * k;
    }
  }
  return env.v[n - 1] as number;
}

describe('envelopes', () => {
  it('volume taper is 0 at 0, 1 at 1, monotonic and sanitises input', () => {
    expect(volumeTaper(0)).toBe(0);
    expect(volumeTaper(1)).toBe(1);
    expect(volumeTaper(2)).toBe(1);
    expect(volumeTaper(-1)).toBe(0);
    expect(volumeTaper(Number.NaN)).toBe(0);
    let prev = -1;
    for (let v = 0; v <= 1; v += 0.05) {
      const g = volumeTaper(v);
      expect(g).toBeGreaterThanOrEqual(prev);
      prev = g;
    }
    expect(volumeTaper(0.5)).toBeLessThan(0.5);
  });

  it('db conversions round trip', () => {
    expect(dbToGain(-6)).toBeCloseTo(0.501, 3);
    expect(gainToDb(dbToGain(-12.5))).toBeCloseTo(-12.5, 6);
  });

  it('adsr starts silent, peaks after the attack and ends at silence (click safe)', () => {
    const e = adsrPoints(0.8, 0.01, 0.2, 0.3, 0.1, 0.5);
    expect(e.v[0]).toBe(0);
    expect(e.t[e.t.length - 1]).toBeCloseTo(0.5, 9);
    expect(e.v[e.v.length - 1]).toBe(SILENCE);
    expect(sampleEnvelope(e, 0.01)).toBeCloseTo(0.8, 9);
    expect(sampleEnvelope(e, 0.21)).toBeCloseTo(0.24, 9);
    // The sustain holds, then the release falls monotonically.
    expect(sampleEnvelope(e, 0.3)).toBeCloseTo(0.24, 9);
    let prev = sampleEnvelope(e, 0.4);
    for (let t = 0.41; t <= 0.5; t += 0.01) {
      const v = sampleEnvelope(e, t);
      expect(v).toBeLessThanOrEqual(prev + 1e-12);
      prev = v;
    }
  });

  it('adsr clamps degenerate parameters', () => {
    const e = adsrPoints(1, 5, 5, 0, 5, 0.05);
    for (let i = 1; i < e.t.length; i++) expect(e.t[i] as number).toBeGreaterThanOrEqual(e.t[i - 1] as number);
    expect(e.t[e.t.length - 1]).toBeCloseTo(0.05, 9);
    expect(Math.min(...e.v)).toBeGreaterThanOrEqual(0);
  });

  it('duck plan dips fast, holds, then recovers slowly and never to zero', () => {
    const p = duckPlan(1, 1.2);
    expect(p.floor).toBeGreaterThan(0);
    expect(p.releaseTc).toBeGreaterThan(p.attackTc);
    expect(p.hold + p.releaseTc * 1.5).toBeCloseTo(1.2, 9);
    expect(duckPlan(0, 1).floor).toBe(1);
    expect(duckPlan(0.5, 1).floor).toBeCloseTo(0.5, 9);
    expect(duckPlan(Number.NaN, Number.NaN).floor).toBe(1);
  });

  it('equal-power cross-fade keeps summed power constant', () => {
    const a = equalPowerCurve(33, false);
    const b = equalPowerCurve(33, true);
    for (let i = 0; i < a.length; i++) expect((a[i] as number) ** 2 + (b[i] as number) ** 2).toBeCloseTo(1, 6);
    expect(a[0]).toBeCloseTo(1, 9);
    expect(b[b.length - 1]).toBeCloseTo(1, 9);
  });

  it('soft clip is odd, bounded and normalised to +/-1', () => {
    const c = softClipCurve(0.6, 257);
    expect(c[0]).toBeCloseTo(-1, 6);
    expect(c[256]).toBeCloseTo(1, 6);
    expect(c[128]).toBeCloseTo(0, 9);
    for (const v of c) expect(Math.abs(v)).toBeLessThanOrEqual(1 + 1e-9);
  });

  it('smoothstep is 0/1 outside and 0.5 in the middle', () => {
    expect(smoothstep(0.2, 0.4, 0.1)).toBe(0);
    expect(smoothstep(0.2, 0.4, 0.5)).toBe(1);
    expect(smoothstep(0.2, 0.4, 0.3)).toBeCloseTo(0.5, 9);
  });
});

const RULES: VoiceRule[] = [
  { maxVoices: 2, minGap: 0.05, falloff: 0 },
  { maxVoices: 4, minGap: 0.01, falloff: 0.2 },
  { maxVoices: 6, minGap: 0, falloff: 0 },
];

describe('VoiceLimiter', () => {
  it('drops a retrigger inside the minimum gap', () => {
    const l = new VoiceLimiter(RULES);
    expect(l.request(0, 1, 0.5)).toBe(1);
    expect(l.request(0, 1.02, 0.5)).toBe(0);
    expect(l.dropped.gap).toBe(1);
    expect(l.request(0, 1.06, 0.5)).toBe(1);
  });

  it('caps simultaneous voices per id and frees slots when they end', () => {
    const l = new VoiceLimiter(RULES);
    expect(l.request(0, 0, 1)).toBe(1);
    expect(l.request(0, 0.1, 1)).toBe(1);
    expect(l.request(0, 0.2, 1)).toBe(0);
    expect(l.dropped.perId).toBe(1);
    expect(l.activeOf(0, 0.5)).toBe(2);
    expect(l.request(0, 1.05, 1)).toBe(1);
  });

  it('enforces the global cap across ids', () => {
    const l = new VoiceLimiter(RULES, 5);
    for (let i = 0; i < 5; i++) expect(l.request(2, i * 0.001, 10)).toBe(1);
    expect(l.request(2, 0.01, 10)).toBe(0);
    expect(l.request(1, 0.011, 10)).toBe(0);
    expect(l.dropped.global).toBe(2);
    expect(l.active(0.5)).toBe(5);
  });

  it('scales volume down as a rapid id gets denser', () => {
    const l = new VoiceLimiter([{ maxVoices: 8, minGap: 0.01, falloff: 0.25 }]);
    const scales: number[] = [];
    for (let i = 0; i < 6; i++) scales.push(l.request(0, i * 0.04, 0.05));
    expect(scales[0]).toBe(1);
    for (let i = 1; i < scales.length; i++) expect(scales[i] as number).toBeLessThan(scales[i - 1] as number);
    expect(scales[5]).toBeGreaterThan(0.25);
    // A pause lets the density window empty again.
    expect(l.request(0, 5, 0.05)).toBe(1);
  });

  it('survives a 15 hits/s stream without dropping or runaway voices', () => {
    const l = new VoiceLimiter([{ maxVoices: 5, minGap: 0.045, falloff: 0.2 }]);
    let played = 0;
    for (let i = 0; i < 150; i++) if (l.request(0, i / 15, 0.06) > 0) played++;
    expect(played).toBe(150);
    expect(l.activeOf(0, 10 - 0.001)).toBeLessThanOrEqual(2);
  });

  it('reset clears everything', () => {
    const l = new VoiceLimiter(RULES);
    l.request(0, 0, 5);
    l.request(0, 0.1, 5);
    l.reset();
    expect(l.active(0.2)).toBe(0);
    expect(l.dropped).toEqual({ gap: 0, perId: 0, global: 0 });
    expect(l.request(0, 0.2, 1)).toBe(1);
  });

  it('rejects unknown ids', () => {
    expect(new VoiceLimiter(RULES).request(9, 0, 1)).toBe(0);
  });
});

describe('VoiceBudget', () => {
  it('lets low priority stop at the soft cap and important notes use the hard cap', () => {
    const b = new VoiceBudget(3, 5);
    for (let i = 0; i < 3; i++) expect(b.tryAdd(0, 10, 0)).toBe(true);
    expect(b.tryAdd(0, 10, 0)).toBe(false);
    expect(b.tryAdd(0, 10, 3)).toBe(true);
    expect(b.tryAdd(0, 10, 3)).toBe(true);
    expect(b.tryAdd(0, 10, 3)).toBe(false);
    expect(b.peak).toBe(5);
    expect(b.dropped).toBe(2);
  });

  it('recycles voices that have ended before the new note starts', () => {
    const b = new VoiceBudget(2, 2);
    expect(b.tryAdd(0, 1, 2)).toBe(true);
    expect(b.tryAdd(0.5, 1.5, 2)).toBe(true);
    expect(b.tryAdd(0.6, 2, 2)).toBe(false);
    expect(b.tryAdd(1.2, 2, 2)).toBe(true);
    expect(b.activeAt(1.3)).toBe(2);
  });
});

describe('StepClock', () => {
  it('computes step length from BPM', () => {
    expect(stepSeconds(120)).toBeCloseTo(0.125, 9);
    expect(stepSeconds(96)).toBeCloseTo(0.15625, 9);
  });

  it('hands out steps inside the look-ahead window in order, with exact times', () => {
    const c = new StepClock(120, 256);
    c.start(10);
    const seen: number[] = [];
    while (c.due(10.3)) {
      seen.push(c.nextTime);
      c.advance();
    }
    expect(seen).toEqual([10, 10.125, 10.25]);
    expect(c.stepIndex).toBe(3);
  });

  it('wraps the loop position', () => {
    const c = new StepClock(120, 32);
    c.start(0);
    for (let i = 0; i < 40; i++) c.advance();
    expect(c.loopStep).toBe(8);
  });

  it('skips steps that fell into the past instead of replaying them', () => {
    const c = new StepClock(120, 256);
    c.start(0);
    const skipped = c.skipLate(5);
    expect(skipped).toBeGreaterThan(30);
    expect(c.nextTime).toBeGreaterThanOrEqual(5 - 0.04);
    expect(c.nextTime).toBeLessThan(5 + c.stepDur);
    // Nothing to skip when on time.
    expect(c.skipLate(c.nextTime - 0.01)).toBe(0);
  });

  it('splits loop steps into bar and step', () => {
    const out = { bar: 0, step: 0 };
    barPosition(37, out);
    expect(out).toEqual({ bar: 2, step: 5 });
  });
});

describe('LayerMixer', () => {
  it('layer 0 is always on and the others follow intensity thresholds', () => {
    const m = new LayerMixer(4, [0.25, 0.5, 0.75]);
    m.setIntensity(0);
    expect(Array.from(m.targets)).toEqual([1, 0, 0, 0]);
    m.setIntensity(0.3);
    expect(m.targets[1]).toBeGreaterThan(0.5);
    expect(m.targets[2]).toBe(0);
    m.setIntensity(1);
    expect(Array.from(m.targets)).toEqual([1, 1, 1, 1]);
  });

  it('fades over more than a second and never jumps', () => {
    const m = new LayerMixer(4, [0.25, 0.5, 0.75]);
    m.setIntensity(1);
    let prev = 0;
    let t = 0;
    let reached90 = 0;
    while (t < 6) {
      m.update(0.025);
      t += 0.025;
      const v = m.smooth[3] as number;
      expect(v - prev).toBeLessThan(0.06);
      prev = v;
      if (!reached90 && v >= 0.9) reached90 = t;
    }
    expect(reached90).toBeGreaterThan(1);
    expect(prev).toBeGreaterThan(0.99);
  });

  it('only schedules audible layers', () => {
    const m = new LayerMixer(2, [0.5]);
    expect(m.audible(1)).toBe(false);
    m.setIntensity(1);
    expect(m.audible(1)).toBe(true);
    m.snap();
    m.setIntensity(0);
    expect(m.audible(1)).toBe(true);
    for (let i = 0; i < 400; i++) m.update(0.025);
    expect(m.audible(1)).toBe(false);
  });

  it('sanitises intensity', () => {
    const m = new LayerMixer(2, [0.5]);
    m.setIntensity(Number.NaN);
    expect(m.intensity).toBe(0);
    m.setIntensity(9);
    expect(m.intensity).toBe(1);
  });
});

function sine(freq: number, seconds: number, sr: number, amp = 0.5): Float32Array {
  const n = Math.floor(seconds * sr);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = amp * Math.sin((2 * Math.PI * freq * i) / sr);
  return out;
}

describe('analysis', () => {
  const SR = 44100;

  it('fft finds a pure tone bin', () => {
    const n = 1024;
    const re = new Float64Array(n);
    const im = new Float64Array(n);
    for (let i = 0; i < n; i++) re[i] = Math.sin((2 * Math.PI * 64 * i) / n);
    fft(re, im);
    let best = 0;
    for (let k = 1; k < n / 2; k++) if (Math.hypot(re[k] as number, im[k] as number) > Math.hypot(re[best] as number, im[best] as number)) best = k;
    expect(best).toBe(64);
  });

  it('measures peak, centroid and weight of tones', () => {
    const lo = analyse([sine(100, 0.5, SR)], SR);
    const hi = analyse([sine(5000, 0.5, SR)], SR);
    expect(lo.peak).toBeCloseTo(0.5, 2);
    expect(lo.centroidHz).toBeGreaterThan(80);
    expect(lo.centroidHz).toBeLessThan(130);
    expect(lo.lowFrac).toBeGreaterThan(0.95);
    expect(hi.centroidHz).toBeGreaterThan(4500);
    expect(hi.highFrac).toBeGreaterThan(0.95);
    expect(hi.brightHz).toBeGreaterThan(4500);
  });

  it('flags silence, clipping, DC and click edges', () => {
    expect(analyse([new Float32Array(1000)], SR).silent).toBe(true);
    const clip = sine(440, 0.1, SR, 1.2).map((x) => Math.max(-1, Math.min(1, x)));
    expect(analyse([clip], SR).clipped).toBe(true);
    const dc = new Float32Array(2000).fill(0.2);
    expect(analyse([dc], SR).dcOffset).toBeCloseTo(0.2, 3);
    const s = analyse([dc], SR);
    expect(s.startsAtZero).toBe(false);
    expect(s.endsNearZero).toBe(false);
    const ok = sine(440, 0.1, SR);
    for (let i = 0; i < 200; i++) {
      const k = i / 200;
      ok[i] = (ok[i] as number) * k;
      ok[ok.length - 1 - i] = (ok[ok.length - 1 - i] as number) * k;
    }
    const a = analyse([ok], SR);
    expect(a.startsAtZero).toBe(true);
    expect(a.endsNearZero).toBe(true);
    expect(Math.abs(a.dcOffset)).toBeLessThan(0.01);
  });

  it('integrates short sounds over 200 ms for loudness', () => {
    const short = sine(440, 0.05, SR);
    const a = analyse([short], SR, false);
    expect(a.loudRms).toBeLessThan(a.rms * 0.6);
    const long = analyse([sine(440, 0.5, SR)], SR, false);
    expect(long.loudRms).toBeCloseTo(long.rms, 3);
  });

  it('finds where a sound ends', () => {
    const x = new Float32Array(1000);
    x[100] = 0.5;
    x[400] = -0.2;
    expect(audibleEnd([x], 0.01)).toBe(401);
    expect(audibleEnd([x], 0.3)).toBe(101);
    expect(peakOf([x])).toBeCloseTo(0.5, 6);
  });

  it('normalisation is limited by peak for clicks and by loudness for tones', () => {
    const target = { peak: 0.3, rms: 0.05 };
    // A transient: huge peak, tiny loudness -> peak decides.
    expect(normalisationGain(2, 0.02, target)).toBeCloseTo(0.15, 9);
    // A sustained tone: modest peak, loud -> loudness decides.
    expect(normalisationGain(0.5, 0.4, target)).toBeCloseTo(0.125, 9);
    expect(normalisationGain(0, 0, target)).toBe(1);
  });
});
