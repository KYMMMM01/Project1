import type { AudioApi } from './api';
import { AudioEngine } from './engine';

export * from './api';
export * from './combat';
export { battleMusic } from './playlist';
export { audioRandom, audioSpread, seedAudio } from './random';

/** Engine instance, kept separate so dev tooling (the demo HUD) can read counters without widening AudioApi. */
const engine = new AudioEngine();

/** Game-facing audio. Call `audio.init()` once at boot; everything else is safe at any time. */
export const audio: AudioApi = engine;

/**
 * Keep the bake of the whole sound catalogue (the background queue the first tap starts) quiet for `ms` more milliseconds: a battle that is being built and
 * starting asks for it, because that is when a phone has the least to spare. Sounds asked for by name are not held.
 */
export const deferBackgroundBake = (ms: number): void => engine.deferBackgroundBake(ms);

export type { AudioStats } from './engine';
/** Live counters for dev HUDs. Not part of the gameplay contract. */
export const audioStats = (): ReturnType<AudioEngine['stats']> => engine.stats();
