import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AudioEngine } from '@/audio/engine';
import { MusicPlayer } from '@/audio/music';
import { game } from '@/core/game';

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
  const target: FakeNode = { connect: (n: unknown) => n, disconnect: () => undefined, start: () => undefined, stop: () => undefined, ...params, ...extra };
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
    const node = makeNode(params, extra);
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
  for (const fn of [...(windowListeners.get(type) ?? [])]) fn();
};
const flush = async (): Promise<void> => {
  await vi.advanceTimersByTimeAsync(0);
};

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

  it('does not stack resume calls while one is hanging, and retries after the timeout', async () => {
    engine.init();
    const ctx = ctxOf();
    ctx.hangResume = new Promise<void>(() => undefined);
    fire('pointerdown');
    fire('pointerup');
    fire('click');
    expect(ctx.resumeCalls).toBe(1);
    await vi.advanceTimersByTimeAsync(1600);
    fire('pointerdown');
    expect(ctx.resumeCalls).toBe(2);
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

  it('enters a new track on a beat of the outgoing one, but stops without waiting', () => {
    const { ctx, player } = makePlayer();
    player.play('home', 0.5);
    run(ctx, player, 1.0);
    const now = ctx.currentTime;
    // The first gain a play() makes is the new run's cross-fade gain.
    const next = ctx.count('createGain');
    player.play('battle', 0.8);
    const fadeIn = ctx.paramsOf('createGain', next, 'gain');
    const curve = fadeIn.of('setValueCurveAtTime')[0];
    const at = curve?.args[1] as number;
    // 96 BPM: a beat is 0.625 s and the clock started at 0.06 s.
    const beats = (at - 0.06) / 0.625;
    expect(beats).toBeCloseTo(Math.round(beats), 6);
    expect(at).toBeGreaterThanOrEqual(now + 0.03 - 1e-9);
    expect(at - now).toBeLessThanOrEqual(0.7);
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
