/**
 * What the board needs from the outside world, as small interfaces: the real ones are thin adapters over the game's audio engine and WebAudio
 * (`engineAudio.ts`, `samples.ts`, `index.ts`), the tests give fakes. Nothing in the board touches the engine, the clock or the DOM any other way.
 */
import type { MusicId, PlayOpts, SfxId, StingerId } from '@/audio/api';
import { normalisationGain } from '@/audio/analysis';
import { CAT_TARGET } from '@/audio/recipe';

export interface BoardAudio {
  /** Create the context (suspended until a tap) and listen for the unlocking gesture. Safe to call twice. */
  init(): void;
  readonly unlocked: boolean;
  /** Resume the engine from inside a tap, even while an earlier attempt (started by a touch's pointerdown, which is not yet a gesture) hangs. */
  wake(): void;
  /** Bake these sounds now (the game does it ahead of a battle), so the first tap is heard in time. */
  ready(ids: readonly SfxId[]): Promise<void>;
  play(id: SfxId, opts: PlayOpts): void;
  playStep(id: SfxId, step: number, opts: PlayOpts): void;
  stinger(id: StingerId): void;
  music(id: MusicId, fadeSeconds: number): void;
  setIntensity(v: number): void;
  /** The master level, 0..1: the sounds' level; the music moves with it at the game's own ratio (music 0.5 to sounds 0.8). */
  setVolume(v: number): void;
  /** Silence every sound that is sounding or scheduled, and the music. */
  stopAll(): void;
  /** Seconds a sound lasts (a render length, a little long), for the button's glow. */
  lengthOf(id: SfxId): number;
}

/** A candidate sample the page can play: where its WAV is, how long and how loud (measured by `tools/sfx/convert.mjs`). */
export interface Candidate {
  pack: string;
  name: string;
  /** Path under `soundboard/kenney/`. */
  file: string;
  bytes: number;
  /** Length after the silence was trimmed, in ms. */
  ms: number;
  /** Peak (0..1) and loudness (0..1, the game's own `loudRms`: the audible region's energy over the region or 200 ms, whichever is longer), centroid in Hz. */
  peak: number;
  loud: number;
  hz: number;
}

export interface Manifest {
  made: string;
  codec: string;
  files: Candidate[];
}

export interface SampleBackend {
  readonly unlocked: boolean;
  /** Create / resume the sample context. Called inside a tap. */
  unlock(): void;
  setVolume(v: number): void;
  /** Play every sample at the game's impact loudness (true) or as recorded (false). */
  setMatch(on: boolean): void;
  /** Fetch and decode a sample ahead of its play; resolves with its length in seconds, or null when it could not be loaded. */
  load(key: string): Promise<number | null>;
  play(key: string, opts: { volume?: number; pitch?: number; delay?: number }): void;
  stopAll(): void;
}

export interface Timers {
  set(fn: () => void, ms: number): unknown;
  clear(handle: unknown): void;
}

/**
 * The gain that brings a candidate to the level the game gives its own sounds, by the game's own rule (`normalisationGain`: the target peak over the
 * sample's peak or the target loudness over its loudness, the quieter one). A hit or an impact is matched to the "impact" level, the interface pack's
 * clicks to the "ui" level, so a sample next to the game's sound is neither louder nor quieter just because of how it was recorded.
 */
export function matchGain(c: Pick<Candidate, 'pack' | 'peak' | 'loud'>): number {
  if (!(c.loud > 0) || !(c.peak > 0)) return 1;
  return normalisationGain(c.peak, c.loud, CAT_TARGET[c.pack === 'interface-sounds' ? 'ui' : 'impact']);
}
