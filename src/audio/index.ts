import type { AudioApi } from './api';

export * from './api';

/** Placeholder engine: keeps the contract callable until the synthesis engine replaces it. */
class SilentAudio implements AudioApi {
  readonly unlocked = false;
  init(): void {}
  setSfxVolume(): void {}
  setMusicVolume(): void {}
  setMuted(): void {}
  play(): void {}
  playStep(): void {}
  music(): void {}
  setIntensity(): void {}
  stinger(): void {}
  duck(): void {}
}

export const audio: AudioApi = new SilentAudio();
