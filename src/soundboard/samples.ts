/**
 * Plays the candidate samples (the CC0 WAV files). They are not part of the game's engine, so this is a small player of its own with the game's
 * own mixing graph (`createGraph`: the same sound bus, master gain and limiter), which makes a pile of samples behave like a pile of the game's
 * sounds. It is created inside a tap (iOS) and never plays anything by itself.
 */
import { volumeTaper } from '@/audio/envelopes';
import { SFX_BASE, createGraph, type AudioGraph } from '@/audio/graph';
import { matchGain, type Candidate, type SampleBackend } from './types';

type ACtor = typeof AudioContext;

function decode(ctx: AudioContext, data: ArrayBuffer): Promise<AudioBuffer> {
  // Older Safari only knows the callback form; newer ones return a promise as well. Either settles this one.
  return new Promise((resolve, reject) => {
    const p = ctx.decodeAudioData(data, resolve, reject) as Promise<AudioBuffer> | undefined;
    if (p && typeof p.then === 'function') p.then(resolve, reject);
  });
}

export class SampleEngine implements SampleBackend {
  private ctx: AudioContext | null = null;
  private graph: AudioGraph | null = null;
  private readonly loading = new Map<string, Promise<number | null>>();
  private readonly decoded = new Map<string, AudioBuffer>();
  private readonly live = new Set<AudioBufferSourceNode>();
  private volume = 0.7;
  private match = true;

  constructor(
    private readonly find: (key: string) => Candidate | undefined,
    private readonly urlOf: (file: string) => string,
    private readonly fetcher: (url: string) => Promise<Response> = (url) => fetch(url),
  ) {}

  get unlocked(): boolean {
    return this.ctx?.state === 'running';
  }

  unlock(): void {
    try {
      if (!this.ctx) {
        const Ctor: ACtor | undefined = window.AudioContext ?? (window as unknown as { webkitAudioContext?: ACtor }).webkitAudioContext;
        if (!Ctor) return;
        this.ctx = new Ctor({ latencyHint: 'interactive' });
        this.graph = createGraph(this.ctx);
        this.applyVolume();
      }
      const ctx = this.ctx;
      if (ctx.state !== 'running') void ctx.resume().catch(() => undefined);
      // The classic iOS unlock: touch the output once with a one-sample silent buffer, inside the tap.
      const src = ctx.createBufferSource();
      src.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
      src.connect(ctx.destination);
      src.onended = () => src.disconnect();
      src.start(0);
    } catch {
      // no WebAudio: the candidates stay silent
    }
  }

  setVolume(v: number): void {
    this.volume = v;
    this.applyVolume();
  }

  setMatch(on: boolean): void {
    this.match = on;
  }

  private applyVolume(): void {
    if (this.ctx && this.graph) this.graph.sfxBus.gain.setTargetAtTime(SFX_BASE * volumeTaper(this.volume), this.ctx.currentTime, 0.03);
  }

  load(key: string): Promise<number | null> {
    const have = this.decoded.get(key);
    if (have) return Promise.resolve(have.duration);
    let job = this.loading.get(key);
    if (!job) {
      job = this.fetchAndDecode(key);
      this.loading.set(key, job);
    }
    return job;
  }

  private async fetchAndDecode(key: string): Promise<number | null> {
    const ctx = this.ctx;
    const cand = this.find(key);
    if (!ctx || !cand) {
      this.loading.delete(key);
      return null;
    }
    try {
      const res = await this.fetcher(this.urlOf(cand.file));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = await decode(ctx, await res.arrayBuffer());
      this.decoded.set(key, buf);
      return buf.duration;
    } catch (err) {
      console.warn('[soundboard] could not load', key, err);
      this.loading.delete(key);
      return null;
    }
  }

  play(key: string, opts: { volume?: number; pitch?: number; delay?: number }): void {
    const ctx = this.ctx;
    const g = this.graph;
    const buf = this.decoded.get(key);
    const cand = this.find(key);
    if (!ctx || !g || !buf || !cand || ctx.state !== 'running') return;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = Math.min(8, Math.max(0.1, opts.pitch ?? 1));
    const gain = ctx.createGain();
    gain.gain.value = (opts.volume ?? 1) * (this.match ? matchGain(cand) : 1);
    src.connect(gain);
    gain.connect(g.sfxBus);
    this.live.add(src);
    src.onended = () => {
      this.live.delete(src);
      src.disconnect();
      gain.disconnect();
    };
    src.start(ctx.currentTime + Math.max(0, opts.delay ?? 0));
  }

  stopAll(): void {
    for (const src of this.live) {
      try {
        src.stop();
      } catch {
        // already ended
      }
    }
    this.live.clear();
  }
}
