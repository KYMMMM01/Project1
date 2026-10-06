/**
 * Synthesis toolkit shared by SFX recipes, stingers and music voices. A `Synth` writes oscillator /
 * noise voices into any BaseAudioContext (a live AudioContext or an OfflineAudioContext), so one
 * recipe serves both the pre-rendered buffers and the live fallback. Importing this module has no
 * side effects; nothing touches WebAudio until a Synth is constructed.
 */
import { Rng } from '@/core/rng';
import { SILENCE, adsrPoints, softClipCurve } from './envelopes';

export type NoiseKind = 'white' | 'pink' | 'brown';

export interface FilterOpts {
  t: BiquadFilterType;
  f: number;
  /** Sweep target (exponential) reached after `sw` seconds. */
  f2?: number;
  sw?: number;
  q?: number;
  /** dB gain for peaking / shelf types. */
  g?: number;
}

interface Voice {
  /** Start offset from the synth's t0, seconds. */
  at?: number;
  /** Total length including release. */
  dur: number;
  /** Peak gain. */
  v?: number;
  /** Attack (linear, min 2 ms). */
  a?: number;
  /** Time to decay from peak to the sustain level. Default: the whole body, i.e. a pluck. */
  d?: number;
  /** Sustain level relative to the peak. Default 0.02: a natural exponential tail. */
  s?: number;
  /** Release (exponential to silence). */
  r?: number;
  filter?: FilterOpts | readonly FilterOpts[];
  /** tanh drive 0..1+: adds harmonics (growls, explosions). */
  sat?: number;
  /** Amplitude wobble. */
  trem?: { rate: number; depth: number };
  /** Extra copy of the signal into an echo / reverb bus. */
  send?: { bus: Send; amt: number };
  /** Output override (defaults to the synth's out). */
  to?: AudioNode;
}

export interface ToneOpts extends Voice {
  w?: OscillatorType;
  f: number;
  /** Pitch sweep target; exponential unless `lin`. */
  f2?: number;
  sw?: number;
  lin?: boolean;
  /** Static detune in cents. */
  det?: number;
  /** Extra oscillators detuned by these cents (supersaw / chorus). */
  uni?: readonly number[];
  vib?: { rate: number; cents: number; delay?: number };
  /** Two-operator FM: modulator at ratio*f, index in multiples of the modulator frequency. */
  fm?: { ratio: number; idx: number; idx2?: number; idxT?: number };
}

export interface NoiseOpts extends Voice {
  kind?: NoiseKind;
}

export interface Send {
  input: AudioNode;
  /** Seconds the wet signal keeps ringing after the dry voice ends. */
  tail: number;
}

const noiseCache = new Map<string, AudioBuffer>();
const impulseCache = new Map<string, AudioBuffer>();
const NOISE_SECONDS = 2;
const NOISE_RMS = 0.3;

/** 2 s of looping noise, generated once per sample rate and shared by every context. */
function noiseBuffer(ctx: BaseAudioContext, kind: NoiseKind): AudioBuffer {
  const key = `${kind}:${ctx.sampleRate}`;
  const hit = noiseCache.get(key);
  if (hit) return hit;
  const n = Math.floor(ctx.sampleRate * NOISE_SECONDS);
  // Seamless loop: generate `xf` extra samples, then fade them over the start so that the sample
  // after the last one (index 0) continues the raw sequence instead of jumping.
  const xf = 512;
  const g = new Float64Array(n + xf);
  const rng = new Rng(kind === 'white' ? 0x1234567 : kind === 'pink' ? 0x7654321 : 0x2468ace);
  if (kind === 'white') {
    for (let i = 0; i < g.length; i++) g[i] = rng.next() * 2 - 1;
  } else if (kind === 'pink') {
    // Paul Kellet's economy pink filter: -3 dB/oct, enough for wind/whoosh beds.
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < g.length; i++) {
      const w = rng.next() * 2 - 1;
      b0 = 0.99886 * b0 + w * 0.0555179;
      b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856;
      b4 = 0.55 * b4 + w * 0.5329522;
      b5 = -0.7616 * b5 - w * 0.016898;
      g[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362;
      b6 = w * 0.115926;
    }
  } else {
    let last = 0;
    for (let i = 0; i < g.length; i++) {
      last = (last + 0.02 * (rng.next() * 2 - 1)) / 1.02;
      g[i] = last;
    }
  }
  let sum = 0;
  for (let i = 0; i < g.length; i++) sum += (g[i] as number) ** 2;
  const k = NOISE_RMS / Math.sqrt(sum / g.length);
  const buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) {
    const t = i < xf ? i / xf : 1;
    d[i] = k * (t < 1 ? (g[i] as number) * t + (g[n + i] as number) * (1 - t) : (g[i] as number));
  }
  noiseCache.set(key, buf);
  return buf;
}

/** Stereo exponential-decay noise impulse that darkens as it decays, like a small bright room. */
export function impulseBuffer(ctx: BaseAudioContext, seconds: number, brightness = 0.6): AudioBuffer {
  const key = `${ctx.sampleRate}:${seconds}:${brightness}`;
  const hit = impulseCache.get(key);
  if (hit) return hit;
  const sr = ctx.sampleRate;
  const n = Math.floor(sr * seconds);
  const buf = ctx.createBuffer(2, n, sr);
  const pre = Math.floor(sr * 0.008);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    const rng = new Rng(0xabc123 + c * 7919);
    let y = 0;
    for (let i = pre; i < n; i++) {
      const t = (i - pre) / (n - pre);
      const amp = Math.exp(-6.9 * t);
      const a = 0.04 + brightness * 0.6 * (1 - t);
      y += a * (rng.next() * 2 - 1 - y);
      d[i] = y * amp * 3;
    }
  }
  impulseCache.set(key, buf);
  return buf;
}

const shaperCache = new Map<number, Float32Array<ArrayBuffer>>();
function shaperCurve(drive: number): Float32Array<ArrayBuffer> {
  const key = Math.round(drive * 10);
  let c = shaperCache.get(key);
  if (!c) {
    c = softClipCurve(key / 10);
    shaperCache.set(key, c);
  }
  return c;
}

export class Synth {
  readonly ctx: BaseAudioContext;
  readonly out: AudioNode;
  readonly t0: number;
  readonly rand: () => number;
  /** Latest time (context seconds) at which any voice or echo tail is still sounding. */
  end: number;

  private readonly nodes: AudioNode[] | null;
  private lastSource: AudioScheduledSourceNode | null = null;
  private lastSourceEnd = 0;
  private hasTail = false;

  /**
   * @param track keep every node so the whole voice can be disconnected when it ends (live and
   *   music voices); offline renders skip it because the context is thrown away.
   */
  constructor(ctx: BaseAudioContext, out: AudioNode, t0: number, rand: () => number, track: boolean) {
    this.ctx = ctx;
    this.out = out;
    this.t0 = t0;
    this.rand = rand;
    this.end = t0;
    this.nodes = track ? [] : null;
  }

  private keep<T extends AudioNode>(n: T): T {
    this.nodes?.push(n);
    return n;
  }

  private source<T extends AudioScheduledSourceNode>(n: T, start: number, stop: number): T {
    n.start(start);
    n.stop(stop);
    this.keep(n);
    if (stop > this.lastSourceEnd) {
      this.lastSourceEnd = stop;
      this.lastSource = n;
    }
    if (stop > this.end) this.end = stop;
    return n;
  }

  private makeFilter(o: FilterOpts, t: number, dur: number): BiquadFilterNode {
    const f = this.keep(this.ctx.createBiquadFilter());
    f.type = o.t;
    f.frequency.setValueAtTime(o.f, t);
    if (o.f2 !== undefined && o.f2 !== o.f) f.frequency.exponentialRampToValueAtTime(o.f2, t + (o.sw ?? dur));
    if (o.q !== undefined) f.Q.value = o.q;
    if (o.g !== undefined) f.gain.value = o.g;
    return f;
  }

  /** Wire filters -> shaper -> envelope -> tremolo -> out/sends and return the head node. */
  private chain(o: Voice, t: number): AudioNode {
    const ctx = this.ctx;
    const dur = o.dur;
    const env = this.keep(ctx.createGain());
    const pts = adsrPoints(o.v ?? 1, o.a ?? 0.004, o.d ?? dur, o.s ?? 0.02, o.r ?? Math.min(0.03, dur * 0.3), dur);
    const g = env.gain;
    g.setValueAtTime(0, t);
    for (let i = 1; i < pts.t.length; i++) {
      const at = t + (pts.t[i] as number);
      const v = pts.v[i] as number;
      if (pts.exp[i]) g.exponentialRampToValueAtTime(v, at);
      else if (i === 1) g.linearRampToValueAtTime(v, at);
      else g.setValueAtTime(v, at);
    }
    g.setValueAtTime(0, t + dur + 0.001);

    let tail: AudioNode = env;
    if (o.trem) {
      const tg = this.keep(ctx.createGain());
      tg.gain.value = 1 - o.trem.depth / 2;
      const lfo = this.source(ctx.createOscillator(), t, t + dur + 0.02);
      lfo.frequency.value = o.trem.rate;
      const lg = this.keep(ctx.createGain());
      lg.gain.value = o.trem.depth / 2;
      lfo.connect(lg);
      lg.connect(tg.gain);
      tail.connect(tg);
      tail = tg;
    }
    tail.connect(o.to ?? this.out);
    if (o.send) {
      const sg = this.keep(ctx.createGain());
      sg.gain.value = o.send.amt;
      tail.connect(sg);
      sg.connect(o.send.bus.input);
      this.end = Math.max(this.end, t + dur + o.send.bus.tail);
      this.hasTail = true;
    }

    // Everything upstream of the envelope: filters chained in order, then the optional shaper.
    let head: AudioNode = env;
    if (o.sat) {
      const sh = this.keep(ctx.createWaveShaper());
      sh.curve = shaperCurve(o.sat);
      sh.oversample = '2x';
      sh.connect(head);
      head = sh;
    }
    if (o.filter) {
      const list: readonly FilterOpts[] = Array.isArray(o.filter) ? o.filter : [o.filter as FilterOpts];
      for (let i = list.length - 1; i >= 0; i--) {
        const f = this.makeFilter(list[i] as FilterOpts, t, dur);
        f.connect(head);
        head = f;
      }
    }
    return head;
  }

  tone(o: ToneOpts): void {
    const ctx = this.ctx;
    const t = this.t0 + (o.at ?? 0);
    const stop = t + o.dur + 0.02;
    const head = this.chain(o, t);

    const oscs: OscillatorNode[] = [];
    const cents = o.uni ? [0, ...o.uni] : [0];
    const mix = cents.length > 1 ? this.keep(ctx.createGain()) : null;
    if (mix) {
      mix.gain.value = 1 / Math.sqrt(cents.length);
      mix.connect(head);
    }
    for (const c of cents) {
      const osc = this.source(ctx.createOscillator(), t, stop);
      osc.type = o.w ?? 'sine';
      osc.frequency.setValueAtTime(o.f, t);
      if (o.f2 !== undefined && o.f2 !== o.f) {
        const at = t + (o.sw ?? o.dur);
        if (o.lin) osc.frequency.linearRampToValueAtTime(o.f2, at);
        else osc.frequency.exponentialRampToValueAtTime(o.f2, at);
      }
      const det = (o.det ?? 0) + c;
      if (det) osc.detune.value = det;
      osc.connect(mix ?? head);
      oscs.push(osc);
    }

    if (o.vib) {
      const lfo = this.source(ctx.createOscillator(), t, stop);
      lfo.frequency.value = o.vib.rate;
      const depth = this.keep(ctx.createGain());
      const delay = o.vib.delay ?? 0;
      // Vibrato fades in after `delay`, the way a singer or a bowed string does.
      depth.gain.setValueAtTime(0, t);
      depth.gain.setValueAtTime(0, t + delay);
      depth.gain.linearRampToValueAtTime(o.vib.cents, t + delay + 0.08);
      lfo.connect(depth);
      for (const osc of oscs) depth.connect(osc.detune);
    }

    if (o.fm) {
      const modF = o.f * o.fm.ratio;
      const mod = this.source(ctx.createOscillator(), t, stop);
      mod.frequency.setValueAtTime(modF, t);
      if (o.f2 !== undefined && o.f2 !== o.f) {
        const at = t + (o.sw ?? o.dur);
        if (o.lin) mod.frequency.linearRampToValueAtTime(o.f2 * o.fm.ratio, at);
        else mod.frequency.exponentialRampToValueAtTime(o.f2 * o.fm.ratio, at);
      }
      const mg = this.keep(ctx.createGain());
      const i0 = o.fm.idx * modF;
      mg.gain.setValueAtTime(i0, t);
      mg.gain.exponentialRampToValueAtTime(Math.max(SILENCE, (o.fm.idx2 ?? 0) * modF), t + (o.fm.idxT ?? o.dur));
      mod.connect(mg);
      for (const osc of oscs) mg.connect(osc.frequency);
    }
  }

  noise(o: NoiseOpts): void {
    const ctx = this.ctx;
    const t = this.t0 + (o.at ?? 0);
    const stop = t + o.dur + 0.02;
    const head = this.chain(o, t);
    const src = ctx.createBufferSource();
    const buf = noiseBuffer(ctx, o.kind ?? 'white');
    src.buffer = buf;
    src.loop = true;
    src.connect(head);
    this.keep(src);
    // Random start offset: two hits of the same recipe never share the exact same grain.
    src.start(t, this.rand() * (buf.duration - 0.05));
    src.stop(stop);
    if (stop > this.lastSourceEnd) {
      this.lastSourceEnd = stop;
      this.lastSource = src;
    }
    if (stop > this.end) this.end = stop;
  }

  /** Feedback delay bus with a damped loop: the cheap "shimmer / sparkle trail". */
  echo(time: number, feedback: number, wet: number, lp = 6000): Send {
    const ctx = this.ctx;
    const input = this.keep(ctx.createGain());
    const delay = this.keep(ctx.createDelay(1));
    delay.delayTime.value = time;
    const damp = this.keep(ctx.createBiquadFilter());
    damp.type = 'lowpass';
    damp.frequency.value = lp;
    const fb = this.keep(ctx.createGain());
    fb.gain.value = feedback;
    const out = this.keep(ctx.createGain());
    out.gain.value = wet;
    input.connect(delay);
    delay.connect(damp);
    damp.connect(fb);
    fb.connect(delay);
    damp.connect(out);
    out.connect(this.out);
    // Time for the loop to fall below -50 dB.
    const tail = time * Math.min(24, Math.ceil(Math.log(0.003) / Math.log(Math.max(0.05, feedback)))) + time;
    return { input, tail };
  }

  /** Convolution reverb bus; the impulse is shared and cached per sample rate. */
  reverb(seconds: number, wet: number, brightness = 0.6): Send {
    const ctx = this.ctx;
    const input = this.keep(ctx.createGain());
    const conv = this.keep(ctx.createConvolver());
    conv.buffer = impulseBuffer(ctx, seconds, brightness);
    const out = this.keep(ctx.createGain());
    out.gain.value = wet;
    input.connect(conv);
    conv.connect(out);
    out.connect(this.out);
    return { input, tail: seconds };
  }

  /**
   * Call after the last voice has been added. For tracked synths this arranges disconnection of every
   * node once the last source (or echo tail) has finished, then reports completion.
   */
  seal(onDone?: () => void): void {
    const nodes = this.nodes;
    if (!nodes) return;
    const finish = () => {
      for (const n of nodes) n.disconnect();
      nodes.length = 0;
      onDone?.();
    };
    if (!this.lastSource) {
      finish();
      return;
    }
    if (!this.hasTail) {
      this.lastSource.onended = finish;
      return;
    }
    // Echo/reverb tails outlive every source: a silent timer oscillator marks the true end.
    const timer = this.ctx.createOscillator();
    const mute = this.ctx.createGain();
    mute.gain.value = 0;
    timer.connect(mute);
    mute.connect(this.out);
    nodes.push(timer, mute);
    timer.start(this.t0);
    timer.stop(this.end + 0.05);
    timer.onended = finish;
  }
}
