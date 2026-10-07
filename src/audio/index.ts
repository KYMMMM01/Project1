import type { AudioApi } from './api';
import { AudioEngine } from './engine';

export * from './api';
export * from './combat';

/** Engine instance, kept separate so dev tooling (the demo HUD) can read counters without widening AudioApi. */
const engine = new AudioEngine();

/** Game-facing audio. Call `audio.init()` once at boot; everything else is safe at any time. */
export const audio: AudioApi = engine;

export type { AudioStats } from './engine';
/** Live counters for dev HUDs. Not part of the gameplay contract. */
export const audioStats = (): ReturnType<AudioEngine['stats']> => engine.stats();
