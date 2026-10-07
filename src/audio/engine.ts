/**
 * The procedural audio engine behind the frozen AudioApi. Everything audible is synthesised: SFX
 * and stingers are baked to AudioBuffers by OfflineAudioContext (with a live-synthesis fallback),
 * music is a look-ahead sequencer. All public methods are exception-safe and silently no-op when
 * WebAudio is missing, locked, muted or rate limited.
 *
 * Locked means "the context is not running": one-shot calls (play, playStep, stinger, duck) made
 * then are dropped, while state calls (music, setIntensity, volumes, mute) are remembered and take
 * effect the moment audio can run, so a game may start its soundtrack before the first tap.
 */
import { game } from '@/core/game';
import type { AudioApi, MusicId, PlayOpts, SfxId, StingerId } from './api';
import { SoundBank } from './bank';
import { offlineSupported } from './bake';
import { duckPlan, volumeTaper } from './envelopes';
import { MUSIC_BASE, MUSIC_LPF_OPEN, SFX_BASE, createGraph, type AudioGraph } from './graph';
import { MusicPlayer, type MusicStats } from './music';
import { PRERENDER_ORDER, SOUNDS, sfxIndexOf, stingerIndexOf } from './sounds';
import { STINGER_DUCK, STINGER_MUFFLE } from './stingers';
import { Synth, nodeStats, resetNodeStats } from './synth';
import { stepRatio } from './theory';
import { CAT_TARGET } from './recipe';
import { COMBAT_CAP, CUT_SECONDS, GLOBAL_VOICE_CAP, VoiceLimiter } from './voices';

const MAX_VOICE_OBJECTS = GLOBAL_VOICE_CAP + 8;
/** A suspend/resume that has not settled by now is abandoned so later gestures can retry. */
const RESUME_TIMEOUT_MS = 1500;
/**
 * A first-use sound still baking is dropped instead of played late once it is this old. Frequent
 * ids (hits, shots) are stale after 0.3 s; a big moment or stinger is rare and worth waiting for.
 */
const MAX_DEFER_S = 0.3;
const MAX_DEFER_BIG_S = 2;
/** Gestures that may (re)start a suspended context; iOS only honours touchend / pointerup / click. */
const GESTURES = ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown'] as const;
const GESTURE_OPTS = { capture: true, passive: true } as const;
/** Ramp times of the music low-pass under a muffling stinger (in, then back out). */
const MUFFLE_IN_S = 1.2;
const MUFFLE_OUT_S = 0.8;

type ACtor = typeof AudioContext;

/** One pooled playback chain: source -> gain -> (pan) -> sfxBus. Only the source node is created per play. */
class SfxVoice {
  readonly gain: GainNode;
  readonly pan: StereoPannerNode | null;
  private src: AudioBufferSourceNode | null = null;
  /** Place in the engine's combat table while this voice is a fight sound, otherwise -1. */
  slot = -1;

  constructor(
    ctx: AudioContext,
    dest: AudioNode,
    private readonly free: SfxVoice[],
    private readonly onFree: (voice: SfxVoice) => void,
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
    this.onFree(this);
    this.free.push(this);
  };

  /** Fade out within a few ms and stop: the voice gives its place to a more important sound. */
  cut(ctx: AudioContext): void {
    const now = ctx.currentTime;
    const g = this.gain.gain;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(0, now + CUT_SECONDS);
    this.src?.stop(now + CUT_SECONDS + 0.004);
  }

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
  sfxDropped: { gap: number; perId: number; global: number; bucket: number; cap: number; stolen: number };
  /** Fight voices sounding now (the cap is `COMBAT_CAP`) and the most there have been since the last reset. */
  combatActive: number;
  combatActivePeak: number;
  /**
   * WebAudio nodes this engine keeps alive: the fixed graph, the pooled SFX voices (gain + panner each, one source
   * node per sound that is playing) and the tracked music / live-synthesis nodes with the peak since the last reset.
   */
  nodes: { pooledVoices: number; sfxSources: number; musicLive: number; musicPeak: number; musicCreated: number };
  /** Current values of the bus gains (they move while ramps run), for verifying ducks and mutes. */
  gains: { sfx: number; music: number; mute: number; duck: number };
  /** Cut-off of the music low-pass in Hz (it only moves under a muffling stinger). */
  musicLpfHz: number;
  /** Track the game asked for; differs from `music.track` only while the context is locked or hidden. */
  wantedTrack: MusicId;
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
  /** The voice behind every slot of the limiter's combat table, so a full table can cut the oldest quiet one. */
  private readonly combatVoices: Array<SfxVoice | null> = new Array<SfxVoice | null>(COMBAT_CAP).fill(null);
  private readonly releaseCombat = (voice: SfxVoice): void => {
    if (voice.slot >= 0 && this.combatVoices[voice.slot] === voice) this.combatVoices[voice.slot] = null;
    voice.slot = -1;
  };
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
  /** Whether the context has ever run: a hidden or shown page only suspends / resumes one that has. */
  private everRan = false;
  /** Suspend / resume operations run one at a time; `queued` counts those not yet settled. */
  private lifecycle: Promise<unknown> = Promise.resolve();
  private queued = 0;
  private watch: ReturnType<typeof setTimeout> | null = null;
  /** Undo functions for every listener init() registered. */
  private readonly disposers: Array<() => void> = [];
  /** Music is state, not a one-shot: the latest request is kept and applied whenever audio can run. */
  private wantedId: MusicId = 'none';
  private wantedFade = 0.8;
  private duckEnd = 0;
  private duckFloor = 1;
  private played = 0;
  private activePeak = 0;
  private combatPeak = 0;

  get unlocked(): boolean {
    return this.ctx?.state === 'running';
  }

  init(): void {
    if (this.inited) return;
    this.inited = true;
    try {
      this.visible = game.visible;
      this.build();
      this.disposers.push(game.events.on('firstInput', this.onGesture), game.events.on('visibility', this.onVisibility));
      // iOS Safari can drop back to 'suspended' / 'interrupted' (calls, silent switch, tab swaps) and
      // only honours touchend / pointerup / click as audio gestures: every later real gesture is a
      // fresh chance to resume, and it costs one state check.
      for (const type of GESTURES) {
        window.addEventListener(type, this.onGesture, GESTURE_OPTS);
        this.disposers.push(() => window.removeEventListener(type, this.onGesture, GESTURE_OPTS));
      }
      if (game.hasFirstInput) this.unlock();
      // Dev / ?debug=1 builds only: the report tooling is a separate lazy chunk.
      if (window.__dbg) void import('./devtools').then((m) => m.installAudioDebug(this)).catch(() => undefined);
    } catch {
      // No WebAudio (or construction refused): every method below checks `ctx` and stays silent.
      this.ctx = null;
    }
  }

  /** Release every listener, timer and node and forget all state; init() starts a fresh engine. */
  dispose(): void {
    for (const off of this.disposers) off();
    this.disposers.length = 0;
    this.clearWatch();
    this.music_?.dispose();
    this.bank?.dispose();
    const ctx = this.ctx;
    this.ctx = null;
    this.graph = null;
    this.bank = null;
    this.music_ = null;
    this.freeVoices.length = 0;
    this.combatVoices.fill(null);
    this.voiceCount = 0;
    this.limiter.reset();
    this.lastVariant.fill(-1);
    this.muteCount = 0;
    this.intensity = 0;
    this.wantedId = 'none';
    this.prerenderStarted = false;
    this.rebuilds = 0;
    this.duckEnd = 0;
    this.everRan = false;
    this.inited = false;
    void ctx?.close().catch(() => undefined);
  }

  private readonly onGesture = (): void => this.unlock();

  private readonly onVisibility = ({ visible }: { visible: boolean }): void => {
    this.visible = visible;
    const ctx = this.ctx;
    if (!ctx) return;
    // A context that never ran is still waiting for its first gesture; resume() outside one would
    // only leave a hanging promise that blocks the gesture that follows.
    if (!visible) {
      this.music_?.pause();
      if (this.everRan) this.chain(() => ctx.suspend());
    } else if (this.everRan) {
      this.chain(() => ctx.resume());
    }
  };

  /** Create the context and everything bound to it; also used to start over when iOS freezes the clock. */
  private build(): void {
    const Ctor: ACtor | undefined =
      typeof window === 'undefined' ? undefined : (window.AudioContext ?? (window as unknown as { webkitAudioContext?: ACtor }).webkitAudioContext);
    if (!Ctor) return;
    // Let silent-switch iPhones play: the default "ambient" session is muted by the ringer switch.
    const session = typeof navigator === 'undefined' ? undefined : (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
    if (session) session.type = 'playback';
    // No sampleRate option: forcing one makes iOS resample (and breaks after Bluetooth route changes).
    const ctx = new Ctor({ latencyHint: 'interactive' });
    this.ctx = ctx;
    this.graph = createGraph(ctx);
    this.bank = new SoundBank(ctx.sampleRate);
    this.music_ = new MusicPlayer(ctx, this.graph.musicBus, this.graph.reverbIn);
    this.music_.setIntensity(this.intensity);
    this.everRan = false;
    this.freeVoices.length = 0;
    this.combatVoices.fill(null);
    this.voiceCount = 0;
    this.limiter.reset();
    this.prerenderStarted = false;
    this.applyVolumes();
    ctx.addEventListener('statechange', () => {
      if (this.ctx === ctx && ctx.state === 'running') this.onRunning();
    });
  }

  /**
   * (Re)start the context. Safe to call on every gesture: it only acts while the context is not
   * running and no resume is already in flight, and resume() is called synchronously so it still
   * counts as part of the user's gesture.
   */
  private unlock(): void {
    const ctx = this.ctx;
    if (!ctx || !this.visible || ctx.state === 'running' || this.queued > 0) return;
    this.chain(() => ctx.resume());
    // The classic iOS unlock: touch the output once with a one-sample silent buffer, inside the gesture.
    const src = ctx.createBufferSource();
    src.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
    src.connect(ctx.destination);
    src.onended = () => src.disconnect();
    src.start(0);
  }

  /**
   * Serialise suspend/resume; a promise that never settles (iOS) must not block the queue for good.
   * The first operation of an idle queue starts synchronously, later ones wait their turn.
   */
  private chain(op: () => Promise<void>): void {
    const guarded = (): Promise<void> => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timeout = new Promise<void>((_, reject) => {
        timer = setTimeout(() => reject(new Error('audio op timeout')), RESUME_TIMEOUT_MS);
      });
      let started: Promise<void>;
      try {
        started = op();
      } catch (err) {
        started = Promise.reject(err);
      }
      return Promise.race([started, timeout]).finally(() => clearTimeout(timer));
    };
    const run = this.queued === 0 ? guarded() : this.lifecycle.then(guarded);
    this.queued++;
    this.lifecycle = run
      .catch(() => undefined)
      .then(() => {
        this.queued--;
      });
  }

  private onRunning(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    this.everRan = true;
    if (!this.prerenderStarted) {
      this.prerenderStarted = true;
      if (offlineSupported()) this.bank?.enqueue(PRERENDER_ORDER);
    }
    this.syncMusic();
    this.watchClock(ctx);
  }

  /** Bring the music player in line with what the game asked for, once audio can actually run. */
  private syncMusic(): void {
    const ctx = this.ctx;
    const player = this.music_;
    if (!ctx || !player || !this.visible || ctx.state !== 'running') return;
    if (player.track !== this.wantedId) player.play(this.wantedId, this.wantedFade);
    else player.resume();
  }

  /**
   * WebKit can report 'running' while currentTime is frozen after returning from the background.
   * If the clock has not moved shortly after running, nudge it with suspend/resume; if it is still
   * frozen, start over with a fresh context (once per session so a device with no output cannot loop).
   */
  private watchClock(ctx: AudioContext): void {
    this.clearWatch();
    const t0 = ctx.currentTime;
    this.watch = setTimeout(() => {
      this.watch = null;
      if (this.ctx !== ctx || ctx.state !== 'running' || !this.visible || ctx.currentTime > t0) return;
      this.chain(() => ctx.suspend().then(() => ctx.resume()));
      this.watch = setTimeout(() => {
        this.watch = null;
        if (this.ctx === ctx && ctx.state === 'running' && ctx.currentTime <= t0 && this.rebuilds < 1) this.rebuild();
      }, 700);
    }, 400);
  }

  private clearWatch(): void {
    if (this.watch !== null) clearTimeout(this.watch);
    this.watch = null;
  }

  private rebuild(): void {
    this.rebuilds++;
    const old = this.ctx;
    this.music_?.dispose();
    this.bank?.dispose();
    try {
      this.build();
    } catch {
      this.ctx = null;
      return;
    }
    void old?.close().catch(() => undefined);
    this.unlock();
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
      // The climb is capped at +24 semitones; a noise-based tick may ask for less.
      const idx = sfxIndexOf(id);
      this.playIndex(idx, opts, stepRatio(step, SOUNDS[idx]?.recipe.climb));
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
      if (this.playIndex(idx, undefined, 1)) {
        this.duck(STINGER_DUCK[id], dur + 0.15);
        const cutoff = STINGER_MUFFLE[id];
        if (cutoff) this.muffleMusic(cutoff, dur);
      }
    } catch {
      // see play()
    }
  }

  music(id: MusicId, fadeSeconds = 0.8): void {
    this.wantedId = id;
    this.wantedFade = clampNum(fadeSeconds, 0.05, 30, 0.8);
    try {
      this.syncMusic();
    } catch {
      // see play()
    }
  }

  setIntensity(v: number): void {
    this.intensity = clampNum(v, 0, 1, 0);
    this.music_?.setIntensity(this.intensity);
  }

  duck(depth: number, seconds: number): void {
    const ctx = this.ctx;
    const g = this.graph;
    // A duck requested while locked would otherwise fire the moment the clock starts.
    if (!ctx || !g || ctx.state !== 'running') return;
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

  /** Sweep the music low-pass down to `hz`, hold it for `seconds`, then open it again. */
  private muffleMusic(hz: number, seconds: number): void {
    const ctx = this.ctx;
    const g = this.graph;
    if (!ctx || !g) return;
    const f = g.musicLpf.frequency;
    const now = ctx.currentTime;
    const hold = now + Math.max(seconds, MUFFLE_IN_S);
    f.cancelScheduledValues(now);
    f.setValueAtTime(f.value, now);
    f.exponentialRampToValueAtTime(hz, now + MUFFLE_IN_S);
    f.setValueAtTime(hz, hold);
    f.exponentialRampToValueAtTime(MUSIC_LPF_OPEN, hold + MUFFLE_OUT_S);
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

    if (!offlineSupported() || bank.hasFailed(idx)) return this.playLive(ctx, idx, now + delay, rate, volume, pan);

    // First use: bake now (tens of ms, more for the long ones) and start as soon as it resolves.
    const patience = def.recipe.cat === 'big' || def.stinger ? MAX_DEFER_BIG_S : MAX_DEFER_S;
    void bank.ensure(idx).then((baked) => {
      if (ctx.state !== 'running' || this.ctx !== ctx) return;
      const late = ctx.currentTime - now;
      if (late > patience) return;
      const when = ctx.currentTime + Math.max(0, delay - late);
      // A bake that failed falls back to live synthesis for this and every later play.
      if (baked) this.startBuffer(ctx, idx, baked, when, rate, volume, pan);
      else this.playLive(ctx, idx, when, rate, volume, pan);
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
    const scale = this.limiter.request(idx, when, buf.duration / rate, volume);
    if (scale <= 0) return false;
    const voice = this.acquireVoice(ctx, g.sfxBus);
    if (!voice) return false;
    this.seatCombat(ctx, voice);
    voice.start(ctx, buf, when, rate, volume * scale, pan);
    this.played++;
    this.duckFor(idx);
    const active = this.limiter.active(ctx.currentTime);
    if (active > this.activePeak) this.activePeak = active;
    const fighting = this.limiter.combatActive(ctx.currentTime);
    if (fighting > this.combatPeak) this.combatPeak = fighting;
    return true;
  }

  /** A fight sound takes its place in the combat table; the voice it replaces (the oldest quiet one) is faded out. */
  private seatCombat(ctx: AudioContext, voice: SfxVoice): void {
    const { slot, victim } = this.limiter;
    if (slot < 0) return;
    if (victim >= 0) {
      this.combatVoices[victim]?.cut(ctx);
      this.combatVoices[victim] = null;
    }
    voice.slot = slot;
    this.combatVoices[slot] = voice;
  }

  private acquireVoice(ctx: AudioContext, dest: AudioNode): SfxVoice | undefined {
    // Voices that ended after a context rebuild belong to the dead context: drop them.
    for (let v = this.freeVoices.pop(); v; v = this.freeVoices.pop()) if (v.gain.context === ctx) return v;
    if (this.voiceCount >= MAX_VOICE_OBJECTS) return undefined;
    this.voiceCount++;
    return new SfxVoice(ctx, dest, this.freeVoices, this.releaseCombat);
  }

  /** Live synthesis for browsers without OfflineAudioContext: same recipe, no normalisation pass. */
  private playLive(ctx: AudioContext, idx: number, when: number, rate: number, volume: number, pan: number): boolean {
    const g = this.graph;
    const def = SOUNDS[idx];
    if (!g || !def) return false;
    const scale = this.limiter.request(idx, when, def.recipe.len / rate, volume);
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
    let lp: BiquadFilterNode | null = null;
    let head: AudioNode = out;
    if (def.recipe.lp) {
      lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = def.recipe.lp;
      lp.Q.value = 0.6;
      lp.connect(out);
      head = lp;
    }
    const synth = new Synth(ctx, head, when, Math.random, true);
    def.recipe.build(synth, { j: () => 1 });
    synth.seal(() => {
      lp?.disconnect();
      out.disconnect();
      if (dest !== out) dest.disconnect();
    });
    this.played++;
    this.duckFor(idx);
    return true;
  }

  /** A sound that takes the room (the awakening) dips the music for as long as it lasts. */
  private duckFor(idx: number): void {
    const d = SOUNDS[idx]?.recipe.duck;
    if (d) this.duck(d.depth, d.seconds);
  }

  /** Bake these sounds now (dev tooling: a measurement must not start before the bank has what it plays). */
  async prime(ids: readonly SfxId[]): Promise<void> {
    const bank = this.bank;
    if (!bank) return;
    for (const id of ids) await bank.ensure(sfxIndexOf(id));
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
      combatActive: this.limiter.combatActive(now),
      combatActivePeak: this.combatPeak,
      nodes: {
        pooledVoices: this.voiceCount,
        sfxSources: this.voiceCount - this.freeVoices.length,
        musicLive: nodeStats.live,
        musicPeak: nodeStats.peak,
        musicCreated: nodeStats.created,
      },
      gains: {
        sfx: this.graph?.sfxBus.gain.value ?? 0,
        music: this.graph?.musicBus.gain.value ?? 0,
        mute: this.graph?.muteGain.gain.value ?? 0,
        duck: this.graph?.duckGain.gain.value ?? 0,
      },
      musicLpfHz: Math.round(this.graph?.musicLpf.frequency.value ?? 0),
      wantedTrack: this.wantedId,
      music: this.music_?.stats() ?? null,
    };
  }

  resetStats(): void {
    this.activePeak = 0;
    this.played = 0;
    this.limiter.dropped = { gap: 0, perId: 0, global: 0, bucket: 0, cap: 0, stolen: 0 };
    this.combatPeak = 0;
    resetNodeStats();
    this.music_?.resetStats();
  }

  get sampleRate(): number {
    return this.ctx?.sampleRate ?? 48000;
  }
}
