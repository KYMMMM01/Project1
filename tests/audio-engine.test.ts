import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SfxId } from '@/audio/api';
import { AudioEngine } from '@/audio/engine';
import type { AudioGraph } from '@/audio/graph';
import { MusicPlayer } from '@/audio/music';
import { seedAudio } from '@/audio/random';
import type { Recipe } from '@/audio/recipe';
import { Inst } from '@/audio/scores';
import { SOUNDS, sfxIndexOf } from '@/audio/sounds';
import { game } from '@/core/game';
import { startLean } from '@/core/lean';

/**
 * Baking is real unless a test switches `mode` to 'fake': then every bake is a promise the test settles by hand and the engine believes it
 * has an offline renderer (the stand-in context below has none).
 */
const baking = vi.hoisted(() => ({ mode: 'real' as 'real' | 'fake', jobs: [] as Array<{ key: string; variant: number; land: () => void }> }));
vi.mock('@/audio/bake', async (orig) => {
  const real = await orig<typeof import('@/audio/bake')>();
  return {
    ...real,
    offlineSupported: () => (baking.mode === 'fake' ? true : real.offlineSupported()),
    bakeVariant: (...args: Parameters<typeof real.bakeVariant>) =>
      baking.mode === 'fake'
        ? new Promise((resolve) => {
            baking.jobs.push({ key: args[1], variant: args[2], land: () => resolve({ buffer: { length: 2400, numberOfChannels: 1, duration: 0.05, variant: args[2] } }) });
          })
        : real.bakeVariant(...args),
  };
});

/**
 * A recording stand-in for WebAudio, just rich enough for the engine, the graph, the music player
 * and the live synthesis fallback. Every AudioParam logs its automation calls; every node factory
 * counts its calls; the context state is flipped by the test (or by resume()/suspend()).
 */
interface Call {
  fn: string;
  args: unknown[];
}

class FakeParam {
  readonly calls: Call[] = [];
  constructor(public value = 1) {}
  private rec(fn: string, args: unknown[]): this {
    this.calls.push({ fn, args });
    return this;
  }
  setValueAtTime(...a: unknown[]): this {
    return this.rec('setValueAtTime', a);
  }
  linearRampToValueAtTime(...a: unknown[]): this {
    return this.rec('linearRampToValueAtTime', a);
  }
  exponentialRampToValueAtTime(...a: unknown[]): this {
    return this.rec('exponentialRampToValueAtTime', a);
  }
  setTargetAtTime(...a: unknown[]): this {
    return this.rec('setTargetAtTime', a);
  }
  setValueCurveAtTime(...a: unknown[]): this {
    return this.rec('setValueCurveAtTime', a);
  }
  cancelScheduledValues(...a: unknown[]): this {
    return this.rec('cancelScheduledValues', a);
  }
  of(fn: string): Call[] {
    return this.calls.filter((c) => c.fn === fn);
  }
}

type FakeNode = Record<string, unknown>;

/** Any property that is read before being written is an AudioParam (gain, frequency, Q, ...). */
function makeNode(params: Record<string, FakeParam>, extra: FakeNode = {}): FakeNode {
  const to: unknown[] = [];
  const target: FakeNode = {
    __to: to,
    connect: (n: unknown) => {
      to.push(n);
      return n;
    },
    disconnect: () => {
      to.length = 0;
    },
    start: () => undefined,
    stop: () => undefined,
    ...params,
    ...extra,
  };
  return new Proxy(target, {
    get(t, p) {
      if (typeof p === 'symbol' || p === 'then') return t[p as string];
      if (!(p in t)) t[p] = new FakeParam(0);
      return t[p];
    },
    set(t, p, v) {
      t[p as string] = v;
      return true;
    },
  });
}

class FakeContext {
  static instances: FakeContext[] = [];
  state = 'suspended';
  currentTime = 0;
  sampleRate = 48000;
  readonly destination = makeNode({});
  readonly made = new Map<string, number>();
  readonly nodes = new Map<string, FakeNode[]>();
  readonly params: FakeParam[] = [];
  resumeCalls = 0;
  suspendCalls = 0;
  closed = false;
  /** When set, resume() returns this instead of settling, like an iOS promise that never resolves. */
  hangResume: Promise<void> | null = null;
  private readonly listeners: Array<() => void> = [];

  constructor(_opts?: unknown) {
    FakeContext.instances.push(this);
  }

  addEventListener(_type: string, fn: () => void): void {
    this.listeners.push(fn);
  }

  setState(state: string): void {
    this.state = state;
    for (const fn of this.listeners) fn();
  }

  resume(): Promise<void> {
    this.resumeCalls++;
    if (this.hangResume) return this.hangResume;
    this.setState('running');
    return Promise.resolve();
  }

  suspend(): Promise<void> {
    this.suspendCalls++;
    this.setState('suspended');
    return Promise.resolve();
  }

  close(): Promise<void> {
    this.closed = true;
    this.state = 'closed';
    return Promise.resolve();
  }

  private make(kind: string, gain?: number, extra: FakeNode = {}): FakeNode {
    this.made.set(kind, (this.made.get(kind) ?? 0) + 1);
    const params: Record<string, FakeParam> = {};
    if (gain !== undefined) params.gain = new FakeParam(gain);
    const node = makeNode(params, { context: this, ...extra });
    const list = this.nodes.get(kind) ?? [];
    list.push(node);
    this.nodes.set(kind, list);
    if (params.gain) this.params.push(params.gain);
    return node;
  }

  /** The AudioParam `name` of the `index`-th node made by factory `kind`. */
  paramsOf(kind: string, index: number, name: string): FakeParam {
    return (this.nodes.get(kind) as FakeNode[])[index]?.[name] as FakeParam;
  }

  count(kind: string): number {
    return this.nodes.get(kind)?.length ?? 0;
  }

  createGain = (): FakeNode => this.make('createGain', 1);
  createStereoPanner = (): FakeNode => this.make('createStereoPanner');
  createDynamicsCompressor = (): FakeNode => this.make('createDynamicsCompressor');
  createConvolver = (): FakeNode => this.make('createConvolver');
  createBiquadFilter = (): FakeNode => this.make('createBiquadFilter', undefined, { frequency: new FakeParam(20000) });
  createOscillator = (): FakeNode => this.make('createOscillator');
  createWaveShaper = (): FakeNode => this.make('createWaveShaper');
  createDelay = (): FakeNode => this.make('createDelay');
  createBufferSource = (): FakeNode => this.make('createBufferSource');
  createBuffer = (channels: number, length: number, sampleRate: number): FakeNode =>
    makeNode({}, { numberOfChannels: channels, length, sampleRate, duration: length / sampleRate, getChannelData: () => new Float32Array(length) });
}

/** Window listeners by type, so the tests can fire gestures and count what the engine left behind. */
const windowListeners = new Map<string, Set<() => void>>();
const fakeWindow = {
  AudioContext: FakeContext,
  addEventListener(type: string, fn: () => void): void {
    const set = windowListeners.get(type) ?? new Set();
    set.add(fn);
    windowListeners.set(type, set);
  },
  removeEventListener(type: string, fn: () => void): void {
    windowListeners.get(type)?.delete(fn);
  },
  __dbg: undefined,
};
const listenerCount = (): number => [...windowListeners.values()].reduce((n, s) => n + s.size, 0);
const fire = (type: string): void => {
  // (a listener gets the event, whose type tells a tap's touchend / click from a pointer event)
  for (const fn of [...(windowListeners.get(type) ?? [])]) (fn as (e: { type: string }) => void)({ type });
};
const flush = async (): Promise<void> => {
  await vi.advanceTimersByTimeAsync(0);
};

const recipeOfId = (id: SfxId): Recipe => SOUNDS[sfxIndexOf(id)]?.recipe as Recipe;

let engine: AudioEngine;
const ctxOf = (): FakeContext => FakeContext.instances[FakeContext.instances.length - 1] as FakeContext;

beforeEach(() => {
  vi.useFakeTimers();
  FakeContext.instances.length = 0;
  windowListeners.clear();
  vi.stubGlobal('window', fakeWindow);
  vi.stubGlobal('navigator', { audioSession: { type: 'auto' } });
  engine = new AudioEngine();
});

afterEach(() => {
  engine.dispose();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('AudioEngine lifecycle', () => {
  it('init() is idempotent: one context, one set of listeners', () => {
    engine.init();
    const listeners = listenerCount();
    engine.init();
    engine.init();
    expect(FakeContext.instances.length).toBe(1);
    expect(listenerCount()).toBe(listeners);
    expect(listeners).toBe(5);
  });

  it('opts the page into the playback audio session before any sound', () => {
    engine.init();
    expect((navigator as unknown as { audioSession: { type: string } }).audioSession.type).toBe('playback');
  });

  it('without WebAudio everything is a silent no-op', () => {
    vi.stubGlobal('window', { ...fakeWindow, AudioContext: undefined });
    engine.init();
    expect(engine.unlocked).toBe(false);
    expect(() => {
      engine.play('coin');
      engine.playStep('coin', 3);
      engine.stinger('victory');
      engine.duck(0.5, 1);
      engine.music('home');
      engine.setIntensity(1);
      engine.setMuted(true);
      engine.setSfxVolume(0.3);
    }).not.toThrow();
    expect(FakeContext.instances.length).toBe(0);
  });

  it('survives a context constructor that throws', () => {
    vi.stubGlobal('window', {
      ...fakeWindow,
      AudioContext: class {
        constructor() {
          throw new Error('denied');
        }
      },
    });
    expect(() => engine.init()).not.toThrow();
    expect(() => engine.play('coin')).not.toThrow();
    expect(engine.unlocked).toBe(false);
  });

  it('drops one-shot calls made before the context is running', () => {
    engine.init();
    const ctx = ctxOf();
    const before = new Map(ctx.made);
    engine.play('coin');
    engine.playStep('coin', 4);
    engine.stinger('victory');
    engine.stinger('defeat');
    engine.duck(0.8, 1);
    expect(ctx.made.get('createOscillator') ?? 0).toBe(before.get('createOscillator') ?? 0);
    expect(ctx.made.get('createBufferSource') ?? 0).toBe(before.get('createBufferSource') ?? 0);
    expect(ctx.params.some((p) => p.of('cancelScheduledValues').length > 0)).toBe(false);
    expect(engine.stats().sfxPlayed).toBe(0);
  });

  it('unlocks on the first gesture and plays afterwards', async () => {
    engine.init();
    const ctx = ctxOf();
    game.events.emit('firstInput', null);
    await flush();
    expect(ctx.resumeCalls).toBe(1);
    expect(engine.unlocked).toBe(true);
    engine.play('coin');
    expect(engine.stats().sfxPlayed).toBe(1);
    expect(ctx.made.get('createOscillator') ?? 0).toBeGreaterThan(0);
  });

  it('touches the output with a silent buffer inside the gesture and resumes synchronously', () => {
    engine.init();
    const ctx = ctxOf();
    fire('pointerup');
    // No await: resume() must already have been called, or iOS would not count it as part of the tap.
    expect(ctx.resumeCalls).toBe(1);
    expect(ctx.made.get('createBufferSource')).toBe(1);
  });

  it('keeps retrying on later gestures after an interruption, once per attempt', async () => {
    engine.init();
    const ctx = ctxOf();
    fire('touchend');
    await flush();
    expect(ctx.resumeCalls).toBe(1);
    // Already running: more gestures cost nothing.
    fire('click');
    fire('pointerdown');
    expect(ctx.resumeCalls).toBe(1);
    ctx.setState('interrupted');
    fire('pointerdown');
    fire('pointerup');
    fire('click');
    await flush();
    expect(ctx.resumeCalls).toBe(2);
    expect(engine.unlocked).toBe(true);
  });

  it('does not stack resume calls from pointer events while one is hanging, and retries after the timeout', async () => {
    engine.init();
    const ctx = ctxOf();
    ctx.hangResume = new Promise<void>(() => undefined);
    fire('pointerdown');
    fire('pointerup');
    fire('pointerdown');
    expect(ctx.resumeCalls).toBe(1);
    await vi.advanceTimersByTimeAsync(1600);
    fire('pointerdown');
    expect(ctx.resumeCalls).toBe(2);
  });

  it('a tap that ends in a click or a touchend resumes inside that event even while the pointerdown attempt hangs (the first tap of a phone counts)', async () => {
    engine.init();
    const ctx = ctxOf();
    ctx.hangResume = new Promise<void>(() => undefined);
    fire('pointerdown');
    expect(ctx.resumeCalls).toBe(1);
    // a touch screen does not count the pointerdown as a gesture: the touchend does
    fire('touchend');
    expect(ctx.resumeCalls).toBe(2);
    fire('click');
    expect(ctx.resumeCalls).toBe(3);
    // the context runs once the browser lets it: later taps cost nothing
    ctx.hangResume = null;
    ctx.setState('running');
    fire('touchend');
    fire('click');
    fire('pointerdown');
    expect(ctx.resumeCalls).toBe(3);
  });

  it('nests setMuted and never goes negative', () => {
    engine.init();
    engine.setMuted(true);
    engine.setMuted(true);
    engine.setMuted(false);
    expect(engine.stats().muted).toBe(true);
    engine.setMuted(false);
    expect(engine.stats().muted).toBe(false);
    engine.setMuted(false);
    engine.setMuted(true);
    expect(engine.stats().muted).toBe(true);
  });

  it('does not play while muted', async () => {
    engine.init();
    game.events.emit('firstInput', null);
    await flush();
    engine.setMuted(true);
    engine.play('coin');
    engine.stinger('victory');
    expect(engine.stats().sfxPlayed).toBe(0);
  });

  it('remembers the music request and intensity made while locked, and starts them at unlock', async () => {
    engine.init();
    const ctx = ctxOf();
    const gainsBefore = ctx.made.get('createGain') ?? 0;
    engine.setIntensity(0.8);
    engine.music('battle', 1.2);
    expect(engine.stats().wantedTrack).toBe('battle');
    expect(engine.stats().music?.track).toBe('none');
    expect(ctx.made.get('createGain')).toBe(gainsBefore);
    game.events.emit('firstInput', null);
    await flush();
    const m = engine.stats().music;
    expect(m?.track).toBe('battle');
    expect(m?.intensity).toBeCloseTo(0.8, 6);
    expect(m?.runs).toBe(1);
  });

  it('stops the music scheduler when hidden and restarts it, without a burst, when shown', async () => {
    engine.init();
    game.events.emit('firstInput', null);
    await flush();
    engine.music('home');
    const running = vi.getTimerCount();
    const ctx = ctxOf();
    game.events.emit('visibility', { visible: false });
    await flush();
    expect(ctx.suspendCalls).toBe(1);
    expect(vi.getTimerCount()).toBeLessThan(running);
    // A call made while hidden is remembered, not played.
    engine.music('boss');
    expect(engine.stats().music?.track).toBe('home');
    expect(engine.stats().wantedTrack).toBe('boss');
    const resumes = ctx.resumeCalls;
    game.events.emit('visibility', { visible: true });
    await flush();
    expect(ctx.resumeCalls).toBe(resumes + 1);
    expect(engine.stats().music?.track).toBe('boss');
    expect(vi.getTimerCount()).toBeGreaterThanOrEqual(running);
  });

  it('does not call resume() for a page shown before its first gesture', async () => {
    engine.init();
    const ctx = ctxOf();
    game.events.emit('visibility', { visible: false });
    game.events.emit('visibility', { visible: true });
    await flush();
    expect(ctx.resumeCalls).toBe(0);
    expect(ctx.suspendCalls).toBe(0);
    // ...and the first gesture afterwards still unlocks it.
    fire('pointerdown');
    await flush();
    expect(ctx.resumeCalls).toBe(1);
  });

  it('falls back to live synthesis when baking fails, and stops retrying the bake', async () => {
    let attempts = 0;
    vi.stubGlobal(
      'OfflineAudioContext',
      class {
        constructor() {
          attempts++;
          throw new Error('unsupported');
        }
      },
    );
    engine.init();
    game.events.emit('firstInput', null);
    await flush();
    engine.play('coin');
    await flush();
    expect(engine.stats().sfxPlayed).toBe(1);
    // The failed id plays live at once from now on, without another bake attempt.
    const tried = attempts;
    ctxOf().currentTime += 0.5;
    engine.play('coin');
    expect(engine.stats().sfxPlayed).toBe(2);
    expect(attempts).toBe(tried);
  });

  it('keeps the track state bounded under rapid repeated music calls', async () => {
    engine.init();
    game.events.emit('firstInput', null);
    await flush();
    const ids = ['home', 'battle', 'boss', 'none', 'home', 'boss', 'battle', 'home'] as const;
    let most = 0;
    // A call every 30 ms is already far faster than any game switches tracks.
    for (let round = 0; round < 6; round++) {
      for (const id of ids) {
        engine.music(id, 0.8);
        ctxOf().currentTime += 0.03;
        most = Math.max(most, engine.stats().music?.runs ?? 0);
      }
    }
    expect(most).toBeLessThanOrEqual(6);
    // After every fade has played out the pump retires them all.
    ctxOf().currentTime += 5;
    engine.music('none', 0.1);
    ctxOf().currentTime += 5;
    await vi.advanceTimersByTimeAsync(100);
    expect(engine.stats().music?.runs).toBe(0);
  });

  it('muffles the music under the defeat stinger only', async () => {
    engine.init();
    game.events.emit('firstInput', null);
    await flush();
    const ctx = ctxOf();
    // The first low-pass created is the music low-pass of the graph.
    const lpf = ctx.paramsOf('createBiquadFilter', 0, 'frequency');
    engine.stinger('victory');
    expect(lpf.of('exponentialRampToValueAtTime')).toHaveLength(0);
    ctx.currentTime += 5;
    engine.stinger('defeat');
    const ramps = lpf.of('exponentialRampToValueAtTime');
    expect(ramps.length).toBe(2);
    expect(ramps[0]?.args[0]).toBe(400);
    expect(ramps[1]?.args[0]).toBeGreaterThan(10000);
  });

  it('applies a duck once unlocked and merges overlapping ducks', async () => {
    engine.init();
    game.events.emit('firstInput', null);
    await flush();
    const ctx = ctxOf();
    engine.duck(0.5, 1);
    engine.duck(0.9, 0.5);
    const duckParam = ctx.params.find((p) => p.of('cancelScheduledValues').length > 0) as FakeParam;
    const floors = duckParam.of('setTargetAtTime').filter((c) => c.args[0] !== 1).map((c) => c.args[0] as number);
    expect(floors[0]).toBeCloseTo(0.5, 6);
    // The second, deeper duck wins the floor; the earlier end still wins the recovery time.
    expect(floors[1]).toBeCloseTo(0.1, 6);
  });

  it('dips the music when the awakening plays and for no ordinary sound', async () => {
    vi.stubGlobal(
      'OfflineAudioContext',
      class {
        constructor() {
          throw new Error('unsupported');
        }
      },
    );
    engine.init();
    game.events.emit('firstInput', null);
    await flush();
    const ctx = ctxOf();
    const ducks = (): number => ctx.params.filter((p) => p.of('cancelScheduledValues').length > 0).length;
    engine.play('coin');
    engine.play('merge_big');
    await flush();
    expect(ducks()).toBe(0);
    engine.play('awaken');
    await flush();
    expect(ducks()).toBeGreaterThan(0);
    const duckParam = ctx.params.find((p) => p.of('cancelScheduledValues').length > 0) as FakeParam;
    const floor = duckParam.of('setTargetAtTime').find((c) => c.args[0] !== 1)?.args[0] as number;
    expect(floor).toBeLessThan(0.6);
  });

  it('counts the nodes the music keeps alive and lets the debug stats reset the peak', async () => {
    engine.init();
    game.events.emit('firstInput', null);
    await flush();
    engine.music('home', 0.1);
    await vi.advanceTimersByTimeAsync(300);
    const nodes = engine.stats().nodes;
    expect(nodes.musicCreated).toBeGreaterThan(0);
    expect(nodes.musicPeak).toBeGreaterThanOrEqual(nodes.musicLive);
    engine.resetStats();
    expect(engine.stats().nodes.musicCreated).toBe(0);
  });

  it('dispose() removes every listener, closes the context and lets init() start fresh', async () => {
    engine.init();
    const first = ctxOf();
    game.events.emit('firstInput', null);
    await flush();
    expect(first.resumeCalls).toBe(1);
    engine.dispose();
    expect(listenerCount()).toBe(0);
    expect(first.closed).toBe(true);
    // Nothing reacts any more.
    game.events.emit('firstInput', null);
    game.events.emit('visibility', { visible: false });
    fire('pointerdown');
    await flush();
    expect(first.resumeCalls).toBe(1);
    expect(first.suspendCalls).toBe(0);
    expect(() => engine.play('coin')).not.toThrow();
    engine.init();
    expect(FakeContext.instances.length).toBe(2);
    expect(listenerCount()).toBe(5);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('MusicPlayer scheduling', () => {
  function makePlayer(): { ctx: FakeContext; player: MusicPlayer } {
    const ctx = new FakeContext();
    const bus = ctx.createGain() as unknown as AudioNode;
    const reverb = ctx.createGain() as unknown as AudioNode;
    return { ctx, player: new MusicPlayer(ctx as unknown as BaseAudioContext, bus, reverb) };
  }

  /** Advance the fake clock the way the 25 ms timer would, pumping the look-ahead each time. */
  function run(ctx: FakeContext, player: MusicPlayer, until: number): void {
    while (ctx.currentTime < until) {
      ctx.currentTime += 0.025;
      player.pump(0.12);
    }
  }

  it('applies an intensity change on the next bar line, not at once', () => {
    const { ctx, player } = makePlayer();
    player.play('battle', 0.1);
    // Gains created so far: bus, reverb, fade, level, verb, then the four layer gains.
    const layer1 = ctx.paramsOf('createGain', 6, 'gain');
    run(ctx, player, 1.0);
    player.setIntensity(1);
    // Up to 1.7 s the look-ahead (120 ms) has not reached the bar line at 1.935 s: nothing is touched.
    run(ctx, player, 1.7);
    expect(layer1.of('setTargetAtTime')).toHaveLength(0);
    run(ctx, player, 2.0);
    const hits = layer1.of('setTargetAtTime');
    expect(hits).toHaveLength(1);
    // Bar 1 of a 128 BPM track that started at 0.06 s begins at 0.06 + 16 * 60/128/4 = 1.935 s.
    expect(hits[0]?.args[1]).toBeCloseTo(0.06 + 16 * (60 / 128 / 4), 6);
    expect(hits[0]?.args[0]).toBeGreaterThan(0.9);
    expect(hits[0]?.args[2]).toBeGreaterThanOrEqual(0.4);
  });

  it('enters a new track on a bar line of the outgoing one, but stops without waiting', () => {
    const { ctx, player } = makePlayer();
    player.play('home', 0.5);
    run(ctx, player, 1.0);
    const now = ctx.currentTime;
    // The first gain a play() makes is the new run's cross-fade gain.
    const next = ctx.count('createGain');
    player.play('battle', 0.8);
    const fadeIn = ctx.paramsOf('createGain', next, 'gain');
    const curve = fadeIn.of('setValueCurveAtTime')[0];
    // The ramp starts 0.2 s ahead of the bar line it enters on.
    const at = (curve?.args[1] as number) + 0.2;
    // 96 BPM: a bar is 2.5 s and the clock started at 0.06 s.
    const bars = (at - 0.06) / 2.5;
    expect(bars).toBeCloseTo(Math.round(bars), 6);
    expect(at).toBeGreaterThanOrEqual(now + 0.03 - 1e-9);
    expect(at - now).toBeLessThanOrEqual(2.6);
    // The outgoing track keeps playing until then, and fades from the same instant.
    const outgoing = ctx.paramsOf('createGain', 2, 'gain').of('setValueCurveAtTime').pop();
    expect(outgoing?.args[1]).toBeCloseTo(at, 9);

    run(ctx, player, ctx.currentTime + 3);
    const t = ctx.currentTime;
    player.play('none', 0.4);
    const out = fadeIn.of('setValueCurveAtTime').pop();
    expect(out?.args[1]).toBeCloseTo(t, 9);
  });

  it('releases every node and the scheduler on dispose', () => {
    const { ctx, player } = makePlayer();
    player.play('battle', 0.1);
    run(ctx, player, 0.5);
    expect(player.running).toBe(true);
    player.dispose();
    expect(player.running).toBe(false);
    expect(player.stats().runs).toBe(0);
    expect(player.track).toBe('none');
  });
});

describe('AudioEngine priming', () => {
  beforeEach(() => {
    baking.mode = 'fake';
    baking.jobs.length = 0;
  });
  afterEach(() => {
    baking.mode = 'real';
  });

  const landAll = async (): Promise<void> => {
    for (let guard = 0; guard < 20 && baking.jobs.length > 0; guard++) {
      for (const job of baking.jobs.splice(0)) job.land();
      await flush();
    }
  };

  it('has nothing to bake before init, or on a device without an offline renderer', () => {
    expect(engine.primeLeft({ sfx: 'hit_light' })).toBe(0);
    expect(engine.primeStep({ sfx: 'hit_light' })).toBe(0);
    baking.mode = 'real';
    engine.init();
    expect(engine.primeLeft({ sfx: 'hit_light' })).toBe(0);
    expect(engine.primeStep({ sfx: 'hit_light' })).toBe(0);
  });

  it('starts baking the whole catalogue in the background once the context runs, and leaves it unbaked in the lean mode', async () => {
    engine.init();
    game.events.emit('firstInput', null);
    await vi.advanceTimersByTimeAsync(200);
    expect(baking.jobs.length).toBeGreaterThan(0);
    engine.dispose();
    baking.jobs.length = 0;
    FakeContext.instances.length = 0;
    startLean(2, '');
    try {
      engine = new AudioEngine();
      engine.init();
      game.events.emit('firstInput', null);
      await vi.advanceTimersByTimeAsync(200);
      expect(engine.unlocked).toBe(true);
      expect(baking.jobs).toHaveLength(0);
      // What is asked for by name is still baked.
      expect(engine.primeStep({ sfx: 'hit_light' })).toBe(2);
      expect(baking.jobs).toHaveLength(1);
    } finally {
      startLean(0, '');
    }
  });

  it('keeps the background bake quiet while a scene asks for it, and starts it afterwards', async () => {
    engine.init();
    engine.deferBackgroundBake(5000);
    game.events.emit('firstInput', null);
    await vi.advanceTimersByTimeAsync(4000);
    expect(baking.jobs).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1500);
    expect(baking.jobs.length).toBeGreaterThan(0);
  });

  it('bakes one variant a step, even while the context is locked, and says how many are left', async () => {
    engine.init();
    expect(engine.unlocked).toBe(false);
    expect(engine.primeLeft({ sfx: 'hit_light' })).toBe(3);
    expect(engine.primeStep({ sfx: 'hit_light' })).toBe(2);
    expect(baking.jobs.map((j) => j.variant)).toEqual([0]);
    expect(engine.primeLeft({ sfx: 'hit_light' })).toBe(2);
    expect(engine.primeStep({ sfx: 'hit_light' })).toBe(1);
    expect(engine.primeStep({ sfx: 'hit_light' })).toBe(0);
    expect(engine.primeStep({ sfx: 'hit_light' })).toBe(0);
    expect(baking.jobs.map((j) => j.variant)).toEqual([0, 1, 2]);
    await landAll();
    const stats = engine.stats();
    expect(stats.baked).toBe(1);
    expect(stats.bakedKB).toBe(Math.round((3 * 2400 * 4) / 1024));
    expect(engine.primeLeft({ sfx: 'hit_light' })).toBe(0);
  });

  it('never makes a sound: nothing is played, no voice or source is made, nothing is ducked', async () => {
    engine.init();
    game.events.emit('firstInput', null);
    await flush();
    const ctx = ctxOf();
    const sources = ctx.count('createBufferSource');
    const voices = ctx.count('createStereoPanner');
    for (const id of ['hit_light', 'boss_warning', 'ui_click'] as const) while (engine.primeStep({ sfx: id }) > 0) continue;
    while (engine.primeStep({ stinger: 'victory' }) > 0) continue;
    await landAll();
    expect(engine.stats().sfxPlayed).toBe(0);
    expect(engine.stats().baked).toBe(4);
    expect(ctx.count('createBufferSource')).toBe(sources);
    expect(ctx.count('createStereoPanner')).toBe(voices);
    expect(ctx.params.some((p) => p.of('cancelScheduledValues').length > 0)).toBe(false);
  });

  it('tells a stinger from a sound effect of the same name', () => {
    engine.init();
    engine.primeStep({ stinger: 'level_up' });
    engine.primeStep({ sfx: 'level_up' });
    expect(baking.jobs.map((j) => j.key)).toEqual(['stinger:level_up', 'sfx:level_up']);
  });

  it('plays a primed sound at once, without baking again', async () => {
    engine.init();
    game.events.emit('firstInput', null);
    await flush();
    for (const id of ['hit_light'] as const) while (engine.primeStep({ sfx: id }) > 0) continue;
    await landAll();
    const bakes = baking.jobs.length;
    engine.play('hit_light');
    expect(engine.stats().sfxPlayed).toBe(1);
    expect(baking.jobs.length).toBe(bakes);
  });

  it('does not make a real play wait for the queue: it joins the bake that is on its way and sounds when the first variant lands', async () => {
    engine.init();
    game.events.emit('firstInput', null);
    await flush();
    engine.primeStep({ sfx: 'hit_light' });
    engine.play('hit_light');
    // Still the one bake that priming started.
    expect(baking.jobs).toHaveLength(1);
    expect(engine.stats().sfxPlayed).toBe(0);
    (baking.jobs.splice(0)[0] as { land: () => void }).land();
    await flush();
    expect(engine.stats().sfxPlayed).toBe(1);
  });

  it('bakes a cold sound the moment it is played, and sounds as soon as its first variant lands, not after all three', async () => {
    engine.init();
    game.events.emit('firstInput', null);
    await flush();
    engine.play('hit_light');
    expect(baking.jobs.map((j) => j.variant)).toEqual([0]);
    (baking.jobs.splice(0)[0] as { land: () => void }).land();
    await flush();
    expect(engine.stats().sfxPlayed).toBe(1);
    // The other variants follow one at a time.
    expect(baking.jobs.map((j) => j.variant)).toEqual([1]);
  });

  it('stopAll() cuts every voice that is sounding, frees what the limiter held and lets the music duck go', async () => {
    engine.init();
    game.events.emit('firstInput', null);
    await flush();
    const ctx = ctxOf();
    for (const id of ['hit_light', 'hit_heavy'] as const) while (engine.primeStep({ sfx: id }) > 0) continue;
    await landAll();
    engine.play('hit_light');
    engine.play('hit_heavy');
    expect(engine.stats().sfxActive).toBe(2);
    const ramps = (): number => ctx.params.filter((p) => p.of('linearRampToValueAtTime').some((c) => c.args[0] === 0)).length;
    const before = ramps();
    expect(engine.stopAll()).toBe(2);
    // each voice fades to 0 within a few ms (the same cut the combat table uses) ...
    expect(ramps()).toBe(before + 2);
    // ... the limiter forgets them, so the next play is not refused for a voice that no longer sounds ...
    expect(engine.stats().sfxActive).toBe(0);
    engine.play('hit_light');
    expect(engine.stats().sfxPlayed).toBe(3);
    expect(engine.stats().sfxDropped.gap + engine.stats().sfxDropped.perId + engine.stats().sfxDropped.bucket).toBe(0);
    // ... and a second stop with nothing sounding is harmless.
    engine.stopAll();
    expect(engine.stopAll()).toBe(0);
  });

  it('wake() resumes inside a tap even while an earlier attempt hangs (a touch’s pointerdown is not a gesture), touching the output once', async () => {
    engine.init();
    const ctx = ctxOf();
    ctx.hangResume = new Promise<void>(() => undefined);
    fire('pointerdown');
    expect(ctx.resumeCalls).toBe(1);
    // the touch's pointer events are held back by the hanging attempt, as before (its touchend and click wake the engine themselves: see above) ...
    fire('pointerup');
    expect(ctx.resumeCalls).toBe(1);
    // ... and wake() is how a page that wants the first tap to count gets through
    const sources = ctx.count('createBufferSource');
    engine.wake();
    expect(ctx.resumeCalls).toBe(2);
    expect(ctx.count('createBufferSource')).toBe(sources + 1);
    ctx.hangResume = null;
    ctx.setState('running');
    // a running context is left alone
    engine.wake();
    expect(ctx.resumeCalls).toBe(2);
  });

  it('wake() before init, without WebAudio or on a closed context does nothing and never throws', async () => {
    expect(() => engine.wake()).not.toThrow();
    engine.init();
    const ctx = ctxOf();
    ctx.resume = () => {
      throw new Error('closed');
    };
    expect(() => engine.wake()).not.toThrow();
  });

  it('stopAll() before init, or without WebAudio, does nothing', () => {
    expect(engine.stopAll()).toBe(0);
    vi.stubGlobal('window', { ...fakeWindow, AudioContext: undefined });
    engine.init();
    expect(engine.stopAll()).toBe(0);
  });

  it('reports the memory budget it keeps', () => {
    engine.init();
    expect(engine.stats().budgetKB).toBe(16602);
    expect(engine.stats().evicted).toBe(0);
  });
});

describe('music transitions and hand-overs', () => {
  /** Advance the stand-in clock and the scheduler together, 25 ms at a time. */
  const run = async (seconds: number): Promise<void> => {
    const ctx = ctxOf();
    for (let t = 0; t < seconds - 1e-9; t += 0.025) {
      ctx.currentTime += 0.025;
      await vi.advanceTimersByTimeAsync(25);
    }
  };
  const unlock = async (): Promise<void> => {
    engine.init();
    game.events.emit('firstInput', null);
    await flush();
  };
  /** The cross-fade curves started so far: when each starts, how long it lasts and whether it rises (a track coming in). */
  const curves = (): Array<{ at: number; len: number; rising: boolean }> =>
    ctxOf()
      .params.flatMap((p) => p.of('setValueCurveAtTime'))
      .map((c) => {
        const v = c.args[0] as Float32Array;
        return { at: c.args[1] as number, len: c.args[2] as number, rising: (v[v.length - 1] as number) > (v[0] as number) };
      });

  it('brings the next track in on the next bar line of the outgoing one, and fades the old one out from there', async () => {
    await unlock();
    engine.music('battle', 0.5);
    await run(3);
    const before = curves().length;
    engine.music('boss', 0.5);
    const fresh = curves().slice(before);
    // Battle runs at 128 BPM from 0.06 s: bar lines every 1.875 s, so 3.81 s is the first one after 3.03 s.
    // The old track fades from the line; the new one starts its ramp 0.2 s ahead of it, so its downbeat is already near full.
    expect(fresh).toHaveLength(2);
    expect(fresh.find((c) => !c.rising)?.at).toBeCloseTo(0.06 + 1.875 * 2, 6);
    expect(fresh.find((c) => c.rising)?.at).toBeCloseTo(0.06 + 1.875 * 2 - 0.2, 6);
    expect(fresh.find((c) => c.rising)?.len).toBeCloseTo(0.3, 6);
    expect(fresh.find((c) => !c.rising)?.len).toBeCloseTo(0.5, 6);
  });

  it('comes in fast over another track however long the old one fades, and fades in at full length from silence', async () => {
    await unlock();
    engine.music('kitchen', 1.2);
    const first = curves();
    expect(first).toHaveLength(1);
    expect(first[0]?.len).toBeCloseTo(1.2, 6);
    await run(0.5);
    const before = curves().length;
    engine.music('boss', 1.5);
    const fresh = curves().slice(before);
    expect(fresh.find((c) => !c.rising)?.len).toBeCloseTo(1.5, 6);
    expect(fresh.find((c) => c.rising)?.len).toBeCloseTo(0.3, 6);
  });

  it('waits for the next beat instead when the bar line is further away than 2.6 s', async () => {
    await unlock();
    engine.music('lose', 0.5);
    await run(0.25);
    const before = curves().length;
    engine.music('home', 0.5);
    const fresh = curves().slice(before);
    // The defeat track runs at 72 BPM from 0.06 s: a bar is 3.33 s, a beat 0.833 s; the first beat after 0.28 s is at 0.893 s.
    expect(fresh).toHaveLength(2);
    expect(fresh.find((c) => !c.rising)?.at).toBeCloseTo(0.06 + 60 / 72, 6);
    expect(fresh.find((c) => c.rising)?.at).toBeCloseTo(0.06 + 60 / 72 - 0.2, 6);
  });

  it('does not wait when the music stops', async () => {
    await unlock();
    engine.music('battle', 0.5);
    await run(1);
    const before = curves().length;
    engine.music('none', 0.2);
    for (const c of curves().slice(before)) expect(c.at).toBeCloseTo(ctxOf().currentTime, 6);
  });

  it('plays the boss sting once on entering, then loops without it', async () => {
    const crashes: number[] = [];
    const real = MusicPlayer.prototype.note;
    const spy = vi.spyOn(MusicPlayer.prototype, 'note').mockImplementation(function (this: MusicPlayer, inst, ...rest) {
      if (inst === Inst.crash) crashes.push((this as unknown as { stepTime: number }).stepTime);
      real.call(this, inst, ...rest);
    });
    await unlock();
    engine.music('boss', 0.5);
    // 142 BPM: a bar is 1.69 s and the form 27.1 s; 16 bars of sting + loop + loop end at 56 s, the next downbeat is at 55.9 + 1.69.
    await run(55);
    spy.mockRestore();
    // The sting's crash at the start, then the loop's crashes on bars 0, 4 and 12, twice.
    expect(crashes).toHaveLength(7);
    const bar = (60 / 142) * 4;
    expect(crashes[0]).toBeCloseTo(0.06, 6);
    expect(crashes[1]).toBeCloseTo(0.06 + bar, 6);
    expect(crashes[2]).toBeCloseTo(0.06 + bar * 5, 6);
    expect(crashes[3]).toBeCloseTo(0.06 + bar * 13, 6);
  });

  it('hands the menu track over to the second one at the end of its loop, on the bar line, and keeps asking for home', async () => {
    await unlock();
    engine.music('home', 0.5);
    expect(engine.stats().music?.playing).toBe('home');
    await run(39);
    expect(engine.stats().music?.playing).toBe('home');
    const before = curves().length;
    await run(2.5);
    const m = engine.stats().music;
    expect(m?.track).toBe('home');
    expect(m?.playing).toBe('home2');
    // 96 BPM from 0.06 s: the 16-bar form ends at 40.06 s exactly; both fades start there.
    const fresh = curves().slice(before);
    expect(fresh).toHaveLength(2);
    expect(fresh.find((c) => !c.rising)?.at).toBeCloseTo(0.06 + 40, 6);
    // The hand-over is noticed one look-ahead (0.12 s) before the line; the new track's ramp starts then and is short.
    const rise = fresh.find((c) => c.rising);
    expect(rise?.at).toBeGreaterThan(0.06 + 40 - 0.13);
    expect(rise?.at).toBeLessThanOrEqual(0.06 + 40);
    expect(rise?.len).toBeCloseTo(0.15, 6);
    // The old run no longer schedules anything and goes away once its tail has faded.
    await run(1.5);
    expect(engine.stats().music?.runs).toBe(1);
  });

  it('starts the menu track with the other of the pair on every second visit', async () => {
    await unlock();
    engine.music('home', 0.1);
    expect(engine.stats().music?.playing).toBe('home');
    engine.music('battle', 0.1);
    await run(3);
    engine.music('home', 0.1);
    await run(3);
    expect(engine.stats().music?.playing).toBe('home2');
    engine.music('battle', 0.1);
    await run(3);
    engine.music('home', 0.1);
    await run(3);
    expect(engine.stats().music?.playing).toBe('home');
    // Asking for the second one by name always gets it.
    engine.music('home2', 0.1);
    await run(3);
    expect(engine.stats().music?.playing).toBe('home2');
  });

  it('plays every track by its own id', async () => {
    await unlock();
    for (const id of ['battle', 'kitchen', 'bath', 'garden', 'clinic', 'elite', 'boss', 'gold', 'win', 'lose', 'home2'] as const) {
      engine.music(id, 0.05);
      await run(2.7);
      expect(engine.stats().music?.playing, id).toBe(id);
      expect(engine.stats().music?.track, id).toBe(id);
    }
  });
});

describe('AudioEngine mix: the buses, the hush of the fight, the variants in turn, the stream of chance', () => {
  beforeEach(() => {
    baking.mode = 'fake';
    baking.jobs.length = 0;
    seedAudio();
  });
  afterEach(() => {
    baking.mode = 'real';
  });

  const landAll = async (): Promise<void> => {
    for (let guard = 0; guard < 20 && baking.jobs.length > 0; guard++) {
      for (const job of baking.jobs.splice(0)) job.land();
      await flush();
    }
  };
  /** An engine that runs, with these sounds baked in every variant. */
  const ready = async (ids: readonly SfxId[]): Promise<FakeContext> => {
    engine.init();
    game.events.emit('firstInput', null);
    await flush();
    for (const id of ids) while (engine.primeStep({ sfx: id }) > 0) continue;
    await landAll();
    return ctxOf();
  };
  const graphOf = (): AudioGraph => (engine as unknown as { graph: AudioGraph }).graph;
  const toOf = (node: unknown): unknown[] => (node as { __to: unknown[] }).__to;
  /** The sources that play a baked sound (not the silent one of the unlock), by the variant they play. */
  const playedVariants = (ctx: FakeContext): number[] =>
    (ctx.nodes.get('createBufferSource') ?? [])
      .map((n) => (n.buffer as { variant?: unknown } | undefined)?.variant)
      .filter((v): v is number => typeof v === 'number');

  it('builds the master chain: three effect buses, the fight\'s one through its own dip, all into the effects bus, then master, limiter, soft clip and out', async () => {
    await ready([]);
    const g = graphOf();
    expect(toOf(g.fightBus)).toEqual([g.fightDuck]);
    expect(toOf(g.fightDuck)).toEqual([g.sfxBus]);
    expect(toOf(g.skillBus)).toEqual([g.sfxBus]);
    expect(toOf(g.uiBus)).toEqual([g.sfxBus]);
    expect(toOf(g.sfxBus)).toEqual([g.master]);
    expect(toOf(g.limiter)).toEqual([g.softClip]);
    expect(toOf(g.softClip)).toEqual([ctxOf().destination]);
    expect((g.softClip as unknown as { curve: Float32Array }).curve).toBeInstanceOf(Float32Array);
  });

  it('plays every sound through the bus of its family: a weapon through the fight, a skill\'s signature through the skills, a click through the interface', async () => {
    const ctx = await ready(['imp_w_sword', 'sp_cut_clash', 'ui_click']);
    const g = graphOf();
    for (const id of ['imp_w_sword', 'sp_cut_clash', 'ui_click'] as const) {
      ctx.currentTime += 1;
      engine.play(id);
    }
    expect(engine.stats().sfxPlayed).toBe(3);
    const pans = ctx.nodes.get('createStereoPanner') ?? [];
    expect(pans).toHaveLength(3);
    expect(pans.map((p) => toOf(p)[0])).toEqual([g.fightBus, g.skillBus, g.uiBus]);
  });

  it('moves a pooled voice to the bus of the next sound it plays', async () => {
    const ctx = await ready(['imp_w_sword', 'ui_click']);
    const g = graphOf();
    ctx.currentTime += 1;
    engine.play('imp_w_sword');
    const voice = (ctx.nodes.get('createStereoPanner') ?? [])[0] as FakeNode;
    expect(toOf(voice)).toEqual([g.fightBus]);
    // the sound ends: its source says so, and the voice is free for the next one
    const src = (ctx.nodes.get('createBufferSource') ?? []).find((n) => typeof (n.buffer as { variant?: unknown } | undefined)?.variant === 'number') as FakeNode;
    (src.onended as () => void)();
    ctx.currentTime += 1;
    engine.play('ui_click');
    expect(ctx.nodes.get('createStereoPanner')).toHaveLength(1);
    expect(toOf(voice)).toEqual([g.uiBus]);
  });

  it('dips the fight bus (and the music) when a signature sounds, and does not when a weapon does', async () => {
    const ctx = await ready(['sp_tiger_roar', 'imp_w_sword']);
    const g = graphOf();
    const dip = g.fightDuck.gain as unknown as FakeParam;
    const music = g.duckGain.gain as unknown as FakeParam;
    ctx.currentTime = 10;
    engine.play('imp_w_sword');
    expect(dip.calls).toHaveLength(0);
    ctx.currentTime = 11;
    engine.play('sp_tiger_roar');
    const roar = recipeOfId('sp_tiger_roar');
    expect(roar.hush).toBeDefined();
    const floor = 10 ** (-(roar.hush as { db: number }).db / 20);
    expect(dip.of('cancelScheduledValues')).toHaveLength(1);
    expect(dip.of('setTargetAtTime')[0]?.args).toEqual([floor, 11, 0.005]);
    expect(dip.of('setTargetAtTime')[1]?.args).toEqual([1, 11 + (roar.hush as { seconds: number }).seconds, 0.085]);
    // the music dips under the same moment, by the recipe's own depth
    expect(roar.duck).toBeDefined();
    expect(music.of('setTargetAtTime')[0]?.args[0]).toBeCloseTo(1 - (roar.duck as { depth: number }).depth, 6);
  });

  it('joins the dips of two big moments that overlap: the deeper floor wins, and the end is the later one', async () => {
    const ctx = await ready(['sp_tiger_roar', 'boss_roar']);
    const dip = graphOf().fightDuck.gain as unknown as FakeParam;
    ctx.currentTime = 20;
    engine.play('sp_tiger_roar');
    ctx.currentTime = 20.2;
    engine.play('boss_roar');
    const targets = dip.of('setTargetAtTime');
    expect(targets).toHaveLength(4);
    const a = recipeOfId('sp_tiger_roar').hush as { db: number; seconds: number };
    const b = recipeOfId('boss_roar').hush as { db: number; seconds: number };
    expect(targets[2]?.args[0]).toBeCloseTo(10 ** (-Math.max(a.db, b.db) / 20), 9);
    expect(targets[3]?.args[1]).toBeCloseTo(Math.max(20 + a.seconds, 20.2 + b.seconds), 9);
  });

  it('starts a dip at the time of a delayed sound, not before it', async () => {
    const ctx = await ready(['sp_tiger_roar']);
    const dip = graphOf().fightDuck.gain as unknown as FakeParam;
    ctx.currentTime = 30;
    engine.play('sp_tiger_roar', { delay: 0.25 });
    expect(dip.of('setTargetAtTime')[0]?.args[1]).toBeCloseTo(30.25, 9);
  });

  it('lets stop-all give the fight bus back at once', async () => {
    const ctx = await ready(['sp_tiger_roar']);
    const dip = graphOf().fightDuck.gain as unknown as FakeParam;
    ctx.currentTime = 40;
    engine.play('sp_tiger_roar');
    ctx.currentTime = 40.1;
    engine.stopAll();
    const last = dip.of('setTargetAtTime').slice(-1)[0];
    expect(last?.args).toEqual([1, 40.1, 0.03]);
    expect(dip.of('cancelScheduledValues').slice(-1)[0]?.args[0]).toBe(40.1);
  });

  it('takes the baked variants of a sound in turn, the same one never twice in a row, from the very first play', async () => {
    const ctx = await ready(['imp_w_sword']);
    for (let i = 0; i < 7; i++) {
      ctx.currentTime += 0.3;
      engine.play('imp_w_sword');
    }
    expect(playedVariants(ctx)).toEqual([0, 1, 2, 0, 1, 2, 0]);
  });

  it('starts at the second variant when only the first was baked when it played (the first use of a sound)', async () => {
    engine.init();
    game.events.emit('firstInput', null);
    await flush();
    const ctx = ctxOf();
    engine.play('imp_w_sword');
    (baking.jobs.splice(0)[0] as { land: () => void }).land();
    await flush();
    await landAll();
    for (let i = 0; i < 3; i++) {
      ctx.currentTime += 0.3;
      engine.play('imp_w_sword');
    }
    expect(playedVariants(ctx)).toEqual([0, 1, 2, 0]);
  });

  it('gives the same pitch and level to the same sounds when the stream of chance starts from the same seed, and other ones from another', async () => {
    const run = async (seed: number): Promise<number[]> => {
      engine.dispose();
      FakeContext.instances.length = 0;
      engine = new AudioEngine();
      const ctx = await ready(['imp_w_sword']);
      engine.seed(seed);
      for (let i = 0; i < 6; i++) {
        ctx.currentTime += 0.3;
        engine.play('imp_w_sword');
      }
      return (ctx.nodes.get('createBufferSource') ?? [])
        .filter((n) => typeof (n.buffer as { variant?: unknown } | undefined)?.variant === 'number')
        .map((n) => (n.playbackRate as FakeParam).value);
    };
    const a = await run(11);
    const b = await run(11);
    const c = await run(12);
    expect(a).toHaveLength(6);
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
    // a weapon's impact is detuned by 4 % at most
    for (const r of a) expect(Math.abs(r - 1)).toBeLessThanOrEqual(0.04 + 1e-9);
    expect(new Set(a).size).toBeGreaterThan(3);
  });

  it('does not let a sound start closer than its gap to its own last start, nor more than its voices at once', async () => {
    const ctx = await ready(['imp_w_sword', 'imp_r_star']);
    // three of the same weapon in one instant: one is heard (the gap of an impact is 50 ms)
    ctx.currentTime = 50;
    for (let i = 0; i < 3; i++) engine.play('imp_w_sword');
    expect(engine.stats().sfxPlayed).toBe(1);
    expect(engine.stats().sfxDropped.gap).toBe(2);
    // the star archer's ping is spaced wider still: 60 ms later is too soon, 80 ms is not
    engine.play('imp_r_star');
    ctx.currentTime = 50.06;
    engine.play('imp_r_star');
    expect(engine.stats().sfxDropped.gap).toBe(3);
    ctx.currentTime = 50.08;
    engine.play('imp_r_star');
    expect(engine.stats().sfxPlayed).toBe(3);
  });
});
