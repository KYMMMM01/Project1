/** Recording stand-ins for what the sound board talks to (the audio engine, the sample player, timers), shared by the board's tests. */
import type { MusicId, PlayOpts, SfxId, StingerId } from '@/audio/api';
import type { BoardAudio, SampleBackend, Timers } from '@/soundboard/types';

export interface Logged {
  fn: string;
  args: unknown[];
}

export class FakeAudio implements BoardAudio {
  readonly log: Logged[] = [];
  unlocked = false;
  /** Seconds `lengthOf` answers with. */
  length = 0.5;
  /** When set, `ready()` waits for it (a first-use bake that is slow). */
  hold: Promise<void> | null = null;
  private rec(fn: string, ...args: unknown[]): void {
    this.log.push({ fn, args });
  }
  init(): void {
    this.rec('init');
  }
  wake(): void {
    this.rec('wake');
  }
  ready(ids: readonly SfxId[]): Promise<void> {
    this.rec('ready', [...ids]);
    return this.hold ?? Promise.resolve();
  }
  play(id: SfxId, opts: PlayOpts): void {
    this.rec('play', id, opts);
  }
  playStep(id: SfxId, step: number, opts: PlayOpts): void {
    this.rec('playStep', id, step, opts);
  }
  stinger(id: StingerId): void {
    this.rec('stinger', id);
  }
  music(id: MusicId, fade: number): void {
    this.rec('music', id, fade);
  }
  setIntensity(v: number): void {
    this.rec('setIntensity', v);
  }
  setVolume(v: number): void {
    this.rec('setVolume', v);
  }
  stopAll(): void {
    this.rec('stopAll');
  }
  lengthOf(): number {
    return this.length;
  }
  calls(fn: string): Logged[] {
    return this.log.filter((l) => l.fn === fn);
  }
  /** Every call that makes a sound (as opposed to setting up or turning something down). */
  sounding(): Logged[] {
    return this.log.filter((l) => l.fn === 'play' || l.fn === 'playStep' || l.fn === 'stinger' || l.fn === 'music');
  }
}

export class FakeSamples implements SampleBackend {
  readonly log: Logged[] = [];
  unlocked = false;
  /** Seconds each load resolves with, or null for a file that cannot be loaded. */
  seconds: number | null = 0.3;
  private rec(fn: string, ...args: unknown[]): void {
    this.log.push({ fn, args });
  }
  unlock(): void {
    this.unlocked = true;
    this.rec('unlock');
  }
  setVolume(v: number): void {
    this.rec('setVolume', v);
  }
  setMatch(on: boolean): void {
    this.rec('setMatch', on);
  }
  load(key: string): Promise<number | null> {
    this.rec('load', key);
    return Promise.resolve(this.seconds);
  }
  play(key: string, opts: { volume?: number; pitch?: number; delay?: number }): void {
    this.rec('play', key, opts);
  }
  stopAll(): void {
    this.rec('stopAll');
  }
  calls(fn: string): Logged[] {
    return this.log.filter((l) => l.fn === fn);
  }
}

/** A clock the test turns by hand. */
export class FakeTimers implements Timers {
  now = 0;
  private next = 1;
  private readonly pending = new Map<number, { at: number; fn: () => void }>();
  set(fn: () => void, ms: number): number {
    const id = this.next++;
    this.pending.set(id, { at: this.now + ms, fn });
    return id;
  }
  clear(handle: unknown): void {
    this.pending.delete(handle as number);
  }
  get count(): number {
    return this.pending.size;
  }
  /** Move the clock on and run what falls due, in order. */
  advance(ms: number): void {
    const end = this.now + ms;
    for (;;) {
      let pick: [number, { at: number; fn: () => void }] | null = null;
      for (const e of this.pending) if (e[1].at <= end && (!pick || e[1].at < pick[1].at)) pick = e;
      if (!pick) break;
      this.pending.delete(pick[0]);
      this.now = Math.max(this.now, pick[1].at);
      pick[1].fn();
    }
    this.now = end;
  }
}

/** Let the promise chains of a tap settle (the board awaits a few before it plays). */
export async function settle(): Promise<void> {
  for (let i = 0; i < 30; i++) await Promise.resolve();
}
