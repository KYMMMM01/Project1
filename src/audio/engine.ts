/**
 * The procedural audio engine behind the frozen AudioApi. Everything audible is synthesised: SFX
 * and stingers are baked to AudioBuffers by OfflineAudioContext (with a live-synthesis fallback),
 * music is a look-ahead sequencer. All public methods are exception-safe and silently no-op when
 * WebAudio is missing, locked, muted or rate limited.
 */
import { game } from '@/core/game';
import type { AudioApi, MusicId, PlayOpts, SfxId, StingerId } from './api';
import { SoundBank } from './bank';
import { offlineSupported } from './bake';
import { duckPlan, volumeTaper } from './envelopes';
import { MUSIC_BASE, SFX_BASE, createGraph, type AudioGraph } from './graph';
import { MusicPlayer, type MusicStats } from './music';
import { PRERENDER_ORDER, SOUNDS, sfxIndexOf, stingerIndexOf } from './sounds';
import { STINGER_DUCK } from './stingers';
import { Synth } from './synth';
import { pentatonicSemitones, semitoneRatio } from './theory';
import { CAT_TARGET } from './recipe';
import { GLOBAL_VOICE_CAP, VoiceLimiter } from './voices';

const MAX_VOICE_OBJECTS = GLOBAL_VOICE_CAP + 8;
/** A suspend/resume that has not settled by now is abandoned so later gestures can retry. */
const RESUME_TIMEOUT_MS = 1500;
/** A deferred first-use sound older than this is dropped instead of played late. */
const MAX_DEFER_S = 0.3;

type ACtor = typeof AudioContext;

/** One pooled playback chain: source -> gain -> (pan) -> sfxBus. Only the source node is created per play. */
class SfxVoice {
  readonly gain: GainNode;
  readonly pan: StereoPannerNode | null;
  private src: AudioBufferSourceNode | null = null;

  constructor(
    ctx: AudioContext,
    dest: AudioNode,
    private readonly free: SfxVoice[],
  ) {
    this.gain = ctx.createGain();
    if (typeof ctx.createStereoPanner === 'function') {
      this.pan = ctx.createStereoPanner();
      this.gain.connect(this.pan);
      this.pan.connect(dest);
    } else {
      this.pan = null;
      this.gain.connect(dest);
    }
  }

  readonly onEnded = (): void => {
    this.src?.disconnect();
    this.src = null;
    this.free.push(this);
  };

  start(ctx: AudioContext, buf: AudioBuffer, when: number, rate: number, volume: number, pan: number): void {
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    this.gain.gain.value = volume;
    if (this.pan) this.pan.pan.value = pan;
    src.connect(this.gain);
    src.onended = this.onEnded;
    this.src = src;
    src.start(when);
  }
}

export interface AudioStats {
  state: string;
  unlocked: boolean;
  muted: boolean;
  sampleRate: number;
  baked: number;
  total: number;
  bakePending: number;
  bakeMs: number;
  /** Memory held by baked buffers. */
  bakedKB: number;
  sfxActive: number;
  sfxActivePeak: number;
  sfxPlayed: number;
  sfxDropped: { gap: number; perId: number; global: number };
  /** Current values of the bus gains (they move while ramps run), for verifying ducks and mutes. */
  gains: { sfx: number; music: number; mute: number; duck: number };
  music: MusicStats | null;
}

function clampNum(v: number | undefined, lo: number, hi: number, dflt: number): number {
  if (v === undefined || !Number.isFinite(v)) return dflt;
  return v < lo ? lo : v > hi ? hi : v;
}

export class AudioEngine implements AudioApi {
  private ctx: AudioContext | null = null;
  private graph: AudioGraph | null = null;
  private bank: SoundBank | null = null;
  private music_: MusicPlayer | null = null;
  private readonly limiter = new VoiceLimiter(SOUNDS.map((d) => d.rule));
  private readonly freeVoices: SfxVoice[] = [];
  private voiceCount = 0;

  private inited = false;
  private visible = true;
  private muteCount = 0;
  private sfxVol = 1;
  private musicVol = 1;
  private intensity = 0;
  private rebuilds = 0;
  private lastVariant: number[] = SOUNDS.map(() => -1);
  private prerenderStarted = false;
  private lifecycle: Promise<unknown> = Promise.resolve();
  private duckEnd = 0;
  private duckFloor = 1;
  private played = 0;
  private activePeak = 0;

  get unlocked(): boolean {
    return this.ctx?.state === 'running';
  }

  init(): void {
    if (this.inited) return;
    this.inited = true;
    try {
      this.build();
      game.events.on('firstInput', () => this.unlock());
      game.events.on('visibility', ({ visible }) => this.onVisibility(visible));
      // iOS Safari can drop back to 'suspended' / 'interrupted' (calls, silent switch, tab swaps) and
      // only honours touchend / pointerup / click as audio gestures: every later real gesture is a
      // fresh chance to resume, and it costs one state check.
      for (const type of ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown'] as const) {
        window.addEventListener(type, () => this.unlock(), { capture: true, passive: true });
      }
      if (game.hasFirstInput) this.unlock();
      // Dev / ?debug=1 builds only: the report tooling is a separate lazy chunk.
      if (window.__dbg) void import('./devtools').then((m) => m.installAudioDebug(this)).catch(() => undefined);
    } catch {
      // No WebAudio (or construction refused): every method below checks `ctx` and stays silent.
      this.ctx = null;
    }
  }

  /** Create the context and everything bound to it; also used to start over when iOS freezes the clock. */
  private build(): void {
    const Ctor: ACtor | undefined =
      typeof window === 'undefined' ? undefined : (window.AudioContext ?? (window as unknown as { webkitAudioContext?: ACtor }).webkitAudioContext);
    if (!Ctor) return;
    // No sampleRate option: forcing one makes iOS resample (and breaks after Bluetooth route changes).
    const ctx = new Ctor({ latencyHint: 'interactive' });
    this.ctx = ctx;
    this.graph = createGraph(ctx);
    this.bank = new SoundBank(ctx.sampleRate);
    this.music_ = new MusicPlayer(ctx, this.graph.musicBus, this.graph.reverbIn);
    this.freeVoices.length = 0;
    this.voiceCount = 0;
    this.limiter.reset();
    this.prerenderStarted = false;
    this.applyVolumes();
    ctx.addEventListener('statechange', () => {
      if (this.ctx === ctx && ctx.state === 'running') this.onRunning();
    });
  }

  /** (Re)start the context. Safe to call on every gesture; it only acts while the context is not running. */
  private unlock(): void {
    const ctx = this.ctx;
    if (!ctx || !this.visible || ctx.state === 'running') return;
    this.chain(() => ctx.resume());
  }

  /** Serialise suspend/resume; a promise that never settles (iOS) must not block the queue for good. */
  private chain(op: () => Promise<void>): void {
    const guarded = () =>
      Promise.race([op(), new Promise<void>((_, reject) => setTimeout(() => reject(new Error('audio op timeout')), RESUME_TIMEOUT_MS))]);
    this.lifecycle = this.lifecycle.then(guarded).catch(() => undefined);
  }

  private onRunning(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    // The classic iOS unlock: touch the output once with a one-sample silent buffer.
    const src = ctx.createBufferSource();
    src.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
    src.connect(ctx.destination);
    src.start(0);
    // Let silent-switch iPhones play: the default "ambient" session is muted by the ringer switch.
    const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
    if (session) session.type = 'playback';
    if (!this.prerenderStarted) {
      this.prerenderStarted = true;
      if (offlineSupported()) this.bank?.enqueue(PRERENDER_ORDER);
    }
    if (this.visible) this.music_?.resume();
    this.watchClock(ctx);
  }

  /**
   * WebKit can report 'running' while currentTime is frozen after returning from the background.
   * If the clock has not moved shortly after running, nudge it with suspend/resume; if it is still
   * frozen, start over with a fresh context (once per session so a device with no output cannot loop).
   */
  private watchClock(ctx: AudioContext): void {
    const t0 = ctx.currentTime;
    setTimeout(() => {
      if (this.ctx !== ctx || ctx.state !== 'running' || !this.visible || ctx.currentTime > t0) return;
      this.chain(() => ctx.suspend().then(() => ctx.resume()));
      setTimeout(() => {
        if (this.ctx === ctx && ctx.state === 'running' && ctx.currentTime <= t0 && this.rebuilds < 1) this.rebuild();
      }, 700);
    }, 400);
  }

  private rebuild(): void {
    this.rebuilds++;
    const old = this.ctx;
    const track = this.music_?.track ?? 'none';
    this.music_?.pause();
    try {
      this.build();
    } catch {
      this.ctx = null;
      return;
    }
    void old?.close().catch(() => undefined);
    this.music_?.setIntensity(this.intensity);
    if (track !== 'none') this.music_?.play(track, 0.3);
    this.unlock();
  }

  private onVisibility(visible: boolean): void {
    this.visible = visible;
    const ctx = this.ctx;
    if (!ctx) return;
    if (!visible) {
      this.music_?.pause();
      this.chain(() => ctx.suspend());
    } else {
      this.music_?.resume();
      this.chain(() => ctx.resume());
    }
  }

  setSfxVolume(v: number): void {
    this.sfxVol = clampNum(v, 0, 1, 1);
    this.applyVolumes();
  }

  setMusicVolume(v: number): void {
    this.musicVol = clampNum(v, 0, 1, 1);
    this.applyVolumes();
  }

  setMuted(muted: boolean): void {
    this.muteCount = Math.max(0, this.muteCount + (muted ? 1 : -1));
    this.applyVolumes();
  }

  /** Ramp every bus to its target; time constants of 20-30 ms are inaudible as steps but kill zipper noise. */
  private applyVolumes(): void {
    const ctx = this.ctx;
    const g = this.graph;
    if (!ctx || !g) return;
    const now = ctx.currentTime;
    g.sfxBus.gain.setTargetAtTime(SFX_BASE * volumeTaper(this.sfxVol), now, 0.03);
    g.musicBus.gain.setTargetAtTime(MUSIC_BASE * volumeTaper(this.musicVol), now, 0.03);
    g.muteGain.gain.setTargetAtTime(this.muteCount > 0 ? 0 : 1, now, 0.02);
  }

  play(id: SfxId, opts?: PlayOpts): void {
    try {
      this.playIndex(sfxIndexOf(id), opts, 1);
    } catch {
      // Audio must never take gameplay down.
    }
  }

  playStep(id: SfxId, step: number, opts?: PlayOpts): void {
    try {
      // pentatonicSemitones already caps the climb at +24 semitones.
      this.playIndex(sfxIndexOf(id), opts, semitoneRatio(pentatonicSemitones(step)));
    } catch {
      // see play()
    }
  }

  stinger(id: StingerId): void {
    try {
      const idx = stingerIndexOf(id);
      if (idx < 0) return;
      const ctx = this.ctx;
      if (!ctx || ctx.state !== 'running' || this.muteCount > 0) return;
      const def = SOUNDS[idx];
      const buf = this.bank?.get(idx)?.[0];
      const dur = buf ? buf.duration : (def?.recipe.len ?? 2) * 0.8;
      if (this.playIndex(idx, undefined, 1)) this.duck(STINGER_DUCK[id], dur + 0.15);
    } catch {
      // see play()
    }
  }

  music(id: MusicId, fadeSeconds = 0.8): void {
    try {
      this.music_?.play(id, fadeSeconds);
    } catch {
      // see play()
    }
  }

  setIntensity(v: number): void {
    this.intensity = clampNum(v, 0, 1, 0);
    try {
      this.music_?.setIntensity(this.intensity);
    } catch {
      // see play()
    }
  }

  duck(depth: number, seconds: number): void {
    const ctx = this.ctx;
    const g = this.graph;
    if (!ctx || !g) return;
    try {
      const plan = duckPlan(depth, seconds);
      const now = ctx.currentTime;
      const end = now + Math.max(0.05, seconds);
      // Overlapping ducks merge: the deeper floor wins and the later end wins.
      this.duckFloor = this.duckEnd > now ? Math.min(this.duckFloor, plan.floor) : plan.floor;
      this.duckEnd = Math.max(this.duckEnd > now ? this.duckEnd : 0, end);
      const p = g.duckGain.gain;
      p.cancelScheduledValues(now);
      p.setValueAtTime(p.value, now);
      p.setTargetAtTime(this.duckFloor, now, plan.attackTc);
      p.setTargetAtTime(1, Math.max(now, this.duckEnd - plan.releaseTc * 1.5), plan.releaseTc);
    } catch {
      // see play()
    }
  }

  /** Core of play/playStep/stinger. Returns true when a voice was started (or queued behind a first-use bake). */
  private playIndex(idx: number, opts: PlayOpts | undefined, pitchMul: number): boolean {
    const ctx = this.ctx;
    const bank = this.bank;
    if (idx < 0 || !ctx || !bank || ctx.state !== 'running' || this.muteCount > 0) return false;
    const def = SOUNDS[idx];
    if (!def) return false;

    let rate = clampNum(pitchMul * clampNum(opts?.pitch, 0.1, 8, 1), 0.1, 8, 1);
    if (def.recipe.rate) rate *= 1 + (Math.random() * 2 - 1) * def.recipe.rate;
    let volume = clampNum(opts?.volume, 0, 4, 1);
    // +/-1 dB level jitter on the ids that repeat constantly, on top of the pitch and variant rotation.
    if (def.recipe.rate) volume *= 1 + (Math.random() * 2 - 1) * 0.12;
    const pan = clampNum(opts?.pan, -1, 1, 0);
    const now = ctx.currentTime;
    const delay = clampNum(opts?.delay, 0, 30, 0);

    const buffers = bank.get(idx);
    if (buffers) return this.startBuffer(ctx, idx, buffers, now + delay, rate, volume, pan);

    if (!offlineSupported()) return this.playLive(ctx, idx, now + delay, rate, volume, pan);

    // First use: bake now (a few ms) and start as soon as it resolves; a stale request is dropped.
    void bank.ensure(idx).then((baked) => {
      if (!baked || ctx.state !== 'running') return;
      const late = ctx.currentTime - now;
      if (late > MAX_DEFER_S) return;
      this.startBuffer(ctx, idx, baked, ctx.currentTime + Math.max(0, delay - late), rate, volume, pan);
    });
    return true;
  }

  private startBuffer(
    ctx: AudioContext,
    idx: number,
    buffers: AudioBuffer[],
    when: number,
    rate: number,
    volume: number,
    pan: number,
  ): boolean {
    const g = this.graph;
    if (!g) return false;
    // Rotate through the baked variants, never repeating the previous one back to back.
    let v = 0;
    if (buffers.length > 1) {
      const last = this.lastVariant[idx] as number;
      v = (Math.max(0, last) + 1 + Math.floor(Math.random() * (buffers.length - 1))) % buffers.length;
      this.lastVariant[idx] = v;
    }
    const buf = buffers[v] as AudioBuffer;
    const scale = this.limiter.request(idx, when, buf.duration / rate);
    if (scale <= 0) return false;
    const voice = this.acquireVoice(ctx, g.sfxBus);
    if (!voice) return false;
    voice.start(ctx, buf, when, rate, volume * scale, pan);
    this.played++;
    const active = this.limiter.active(ctx.currentTime);
    if (active > this.activePeak) this.activePeak = active;
    return true;
  }

  private acquireVoice(ctx: AudioContext, dest: AudioNode): SfxVoice | undefined {
    // Voices that ended after a context rebuild belong to the dead context: drop them.
    for (let v = this.freeVoices.pop(); v; v = this.freeVoices.pop()) if (v.gain.context === ctx) return v;
    if (this.voiceCount >= MAX_VOICE_OBJECTS) return undefined;
    this.voiceCount++;
    return new SfxVoice(ctx, dest, this.freeVoices);
  }

  /** Live synthesis for browsers without OfflineAudioContext: same recipe, no normalisation pass. */
  private playLive(ctx: AudioContext, idx: number, when: number, rate: number, volume: number, pan: number): boolean {
    const g = this.graph;
    const def = SOUNDS[idx];
    if (!g || !def) return false;
    const scale = this.limiter.request(idx, when, def.recipe.len / rate);
    if (scale <= 0) return false;
    const out = ctx.createGain();
    out.gain.value = CAT_TARGET[def.recipe.cat].peak * 0.8 * volume * scale;
    let dest: AudioNode = out;
    if (pan !== 0 && typeof ctx.createStereoPanner === 'function') {
      const p = ctx.createStereoPanner();
      p.pan.value = pan;
      out.connect(p);
      dest = p;
    }
    dest.connect(g.sfxBus);
    const synth = new Synth(ctx, out, when, Math.random, true);
    def.recipe.build(synth, { j: () => 1 });
    synth.seal(() => {
      out.disconnect();
      if (dest !== out) dest.disconnect();
    });
    this.played++;
    return true;
  }

  /** Counters for the debug hooks and the demo's HUD. */
  stats(): AudioStats {
    const ctx = this.ctx;
    const now = ctx?.currentTime ?? 0;
    return {
      state: ctx?.state ?? 'none',
      unlocked: this.unlocked,
      muted: this.muteCount > 0,
      sampleRate: ctx?.sampleRate ?? 0,
      baked: this.bank?.bakedCount ?? 0,
      total: SOUNDS.length,
      bakePending: this.bank?.pending ?? 0,
      bakeMs: Math.round(this.bank?.bakeMs ?? 0),
      bakedKB: Math.round((this.bank?.bytes ?? 0) / 1024),
      sfxActive: this.limiter.active(now),
      sfxActivePeak: this.activePeak,
      sfxPlayed: this.played,
      sfxDropped: { ...this.limiter.dropped },
      gains: {
        sfx: this.graph?.sfxBus.gain.value ?? 0,
        music: this.graph?.musicBus.gain.value ?? 0,
        mute: this.graph?.muteGain.gain.value ?? 0,
        duck: this.graph?.duckGain.gain.value ?? 0,
      },
      music: this.music_?.stats() ?? null,
    };
  }

  resetStats(): void {
    this.activePeak = 0;
    this.played = 0;
    this.limiter.dropped = { gap: 0, perId: 0, global: 0 };
    this.music_?.resetStats();
  }

  get sampleRate(): number {
    return this.ctx?.sampleRate ?? 48000;
  }
}
