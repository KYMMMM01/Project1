/**
 * The one stream of chance the sound effects draw from (which pitch a hit is played at, how loud, the little detune the director adds): a seeded
 * generator instead of `Math.random`, so the same fight gives the same sounds. A test, the sound board and a measurement can then say "play it
 * again" and mean it, and a bug heard once can be heard again. It starts from a fixed seed; `seedAudio(n)` starts it over.
 *
 * Which variant of a sound plays is not chance at all: the engine takes them in turn (round robin, see `AudioEngine.startBuffer`).
 */
import { Rng } from '@/core/rng';

/** The seed every run starts from. */
export const AUDIO_SEED = 0x5eed1c47;

const rng = new Rng(AUDIO_SEED);

/** Uniform in [0, 1). */
export function audioRandom(): number {
  return rng.next();
}

/** Start the stream over from `seed` (0 or a non-number gives the default seed). */
export function seedAudio(seed: number = AUDIO_SEED): void {
  rng.state = (Number.isFinite(seed) ? seed >>> 0 : 0) || AUDIO_SEED;
}

/** Uniform in [-1, 1): a symmetric spread around nothing, for pitch and level. */
export function audioSpread(): number {
  return rng.next() * 2 - 1;
}
