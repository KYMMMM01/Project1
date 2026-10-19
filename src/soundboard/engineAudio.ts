/**
 * The board's window on the game's audio engine: the same `audio` object the game plays through (so a sound here goes through the same bank,
 * voice limiter and buses as in a fight), plus the two dev methods the class has beyond the frozen contract: `prime` (bake ahead, as the
 * battle warm-up does) and `stopAll`.
 */
import { audio } from '@/audio';
import type { SfxId } from '@/audio/api';
import type { AudioEngine } from '@/audio/engine';
import { SOUNDS, sfxIndexOf } from '@/audio/sounds';
import type { BoardAudio } from './types';

/**
 * The levels the game starts with (`defaults` of src/view/hud/settings.ts): sounds 0.8, music 0.5. The board has one master slider; it moves both so
 * the mix stays the game's one, the music at 5/8 of the sounds (a test keeps these numbers equal to the settings'). The slider starts at `SFX_DEFAULT`.
 */
export const SFX_DEFAULT = 0.8;
export const MUSIC_DEFAULT = 0.5;

export function engineAudio(): BoardAudio {
  const engine = audio as unknown as Pick<AudioEngine, 'prime' | 'stopAll' | 'wake'>;
  return {
    init: () => audio.init(),
    get unlocked() {
      return audio.unlocked;
    },
    wake: () => engine.wake(),
    async ready(ids: readonly SfxId[]) {
      try {
        await engine.prime(ids);
      } catch {
        // an id that cannot be baked is played live by the engine
      }
    },
    play: (id, opts) => audio.play(id, opts),
    playStep: (id, step, opts) => audio.playStep(id, step, opts),
    stinger: (id) => audio.stinger(id),
    music: (id, fade) => audio.music(id, fade),
    setIntensity: (v) => audio.setIntensity(v),
    setVolume(v) {
      audio.setSfxVolume(v);
      audio.setMusicVolume(Math.min(1, (v * MUSIC_DEFAULT) / SFX_DEFAULT));
    },
    stopAll() {
      engine.stopAll();
      audio.music('none', 0.05);
    },
    lengthOf: (id) => SOUNDS[sfxIndexOf(id)]?.recipe.len ?? 0.6,
  };
}
