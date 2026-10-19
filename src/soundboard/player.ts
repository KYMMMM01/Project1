/**
 * The board's playing logic, free of the DOM: turn a row's cues into calls on the audio engine and the sample player. A tap plays the cues once;
 * "x5 at 3x" plays them five times at the spacing a busy 3x board gets; "both" plays the old and the new one after the other. Every call goes
 * through the engine's own `play` / `playStep` / `stinger`, so what is heard is what the game would do (variants, pitch spread, the voice
 * limiter and all). Nothing here starts a sound by itself: only a method call does, and the page only calls them from a tap.
 */
import type { SfxId } from '@/audio/api';
import { GAP_SECONDS, type Cue, type Gap } from './catalog';
import type { BoardAudio, SampleBackend, Timers } from './types';

/**
 * How long a sound may take to get ready (baking, fetching) before it is played anyway. Long on purpose: the engine bakes every sound once, in the
 * background, in the seconds after the first tap, and a press during that waits its turn on a slow phone. The engine itself drops a sound that is
 * still unbaked when asked (it would be late in a fight), so playing early would be silence; the button shows that it is waiting.
 */
export const READY_TIMEOUT_MS = 8000;
/** Pause between the two halves of a before / after pair (seconds) after the first one ends. */
const AB_PAUSE = 0.45;
/** The pitch spread of a stacked run (the director detunes every play by this much, so a pile never phases). */
const STACK_DETUNE = 0.05;
export const STACK_COUNT = 5;

export interface PlayOptions {
  /** Repeat the cues this many times, `gap` seconds apart. */
  repeat?: { count: number; gap: number; ladder?: boolean };
}

export class Player {
  /** Bumped by `stopAll()`: a play that was still getting ready when the stop came does not start afterwards. */
  private epoch = 0;
  private readonly timeouts = new Set<unknown>();
  /** Seconds each sample lasts, learned when it was loaded. */
  private readonly lengths = new Map<string, number>();

  constructor(
    private readonly audio: BoardAudio,
    private readonly samples: SampleBackend,
    private readonly timers: Timers,
    private readonly random: () => number = Math.random,
  ) {}

  /**
   * Play these cues now. Resolves with how many seconds the whole thing lasts (0 when it was cancelled).
   */
  async play(cues: readonly Cue[], options: PlayOptions = {}): Promise<number> {
    const epoch = this.epoch;
    await this.prepare(cues);
    if (epoch !== this.epoch) return 0;
    return this.schedule(cues, options.repeat);
  }

  /** The way a busy 3x board stacks a sound: `STACK_COUNT` plays at the director's own gap for this kind of sound. */
  stack(cues: readonly Cue[], gap: Gap, ladder = false): Promise<number> {
    return this.play(cues, { repeat: { count: STACK_COUNT, gap: GAP_SECONDS[gap], ladder } });
  }

  /** The old version, a pause, then the new one. Resolves with the total length. */
  async both(first: readonly Cue[], second: readonly Cue[]): Promise<number> {
    const epoch = this.epoch;
    await this.prepare([...first, ...second]);
    if (epoch !== this.epoch) return 0;
    const a = this.schedule(first, undefined, 0);
    return this.schedule(second, undefined, a + AB_PAUSE);
  }

  /** A stinger or an SFX is silenced right away; timers that were waiting to start one are dropped. */
  stopAll(): void {
    this.epoch++;
    for (const h of this.timeouts) this.timers.clear(h);
    this.timeouts.clear();
    this.audio.stopAll();
    this.samples.stopAll();
  }

  private async prepare(cues: readonly Cue[]): Promise<void> {
    const ids = new Set<SfxId>();
    const files = new Set<string>();
    for (const c of cues) {
      if (c.sfx) ids.add(c.sfx);
      if (c.file) files.add(c.file);
    }
    const jobs: Array<Promise<unknown>> = [];
    if (ids.size > 0) jobs.push(this.audio.ready([...ids]));
    for (const f of files) {
      jobs.push(
        this.samples.load(f).then((seconds) => {
          if (seconds !== null) this.lengths.set(f, seconds);
        }),
      );
    }
    if (jobs.length === 0) return;
    let timer: unknown;
    const timeout = new Promise<void>((resolve) => {
      timer = this.timers.set(() => {
        this.timeouts.delete(timer);
        resolve();
      }, READY_TIMEOUT_MS);
      this.timeouts.add(timer);
    });
    await Promise.race([Promise.allSettled(jobs), timeout]);
    this.timers.clear(timer);
    this.timeouts.delete(timer);
  }

  /** Start the cues (every one `offset` seconds later than its own `at`); returns the time the last one ends. */
  private schedule(cues: readonly Cue[], repeat?: PlayOptions['repeat'], offset = 0): number {
    const count = repeat?.count ?? 1;
    const gap = repeat?.gap ?? 0;
    const detune = repeat ? STACK_DETUNE : 0;
    let end = 0;
    for (let i = 0; i < count; i++) {
      for (const c of cues) {
        const at = offset + i * gap + (c.at ?? 0);
        const pitch = (c.pitch ?? 1) * (1 + (this.random() * 2 - 1) * detune);
        const volume = c.volume ?? 1;
        if (c.sfx) {
          const opts = { volume, pitch, delay: at };
          const step = (c.step ?? 0) + (repeat?.ladder ? i : 0);
          if (c.step !== undefined || repeat?.ladder) this.audio.playStep(c.sfx, step, opts);
          else this.audio.play(c.sfx, opts);
          end = Math.max(end, at + this.audio.lengthOf(c.sfx) / pitch);
        } else if (c.stinger) {
          const id = c.stinger;
          if (at <= 0) this.audio.stinger(id);
          else {
            const h = this.timers.set(() => {
              this.timeouts.delete(h);
              this.audio.stinger(id);
            }, at * 1000);
            this.timeouts.add(h);
          }
          end = Math.max(end, at + 2);
        } else if (c.file) {
          this.samples.play(c.file, { volume, pitch, delay: at });
          end = Math.max(end, at + (this.lengths.get(c.file) ?? 0.4) / pitch);
        }
      }
    }
    return end;
  }
}
