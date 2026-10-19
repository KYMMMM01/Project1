import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { audio } from '@/audio';
import { MUSIC_DEFAULT, SFX_DEFAULT, engineAudio } from '@/soundboard/engineAudio';
import type { AudioEngine } from '@/audio/engine';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('the board’s window on the game’s audio engine', () => {
  it('uses the very same engine object the game plays through', () => {
    const play = vi.spyOn(audio, 'play').mockImplementation(() => undefined);
    const step = vi.spyOn(audio, 'playStep').mockImplementation(() => undefined);
    const stinger = vi.spyOn(audio, 'stinger').mockImplementation(() => undefined);
    const music = vi.spyOn(audio, 'music').mockImplementation(() => undefined);
    const board = engineAudio();
    board.play('hit_heavy', { volume: 0.8, pitch: 0.9, delay: 0.1 });
    board.playStep('coin', 3, { volume: 1 });
    board.stinger('victory');
    board.music('battle', 0.4);
    expect(play).toHaveBeenCalledWith('hit_heavy', { volume: 0.8, pitch: 0.9, delay: 0.1 });
    expect(step).toHaveBeenCalledWith('coin', 3, { volume: 1 });
    expect(stinger).toHaveBeenCalledWith('victory');
    expect(music).toHaveBeenCalledWith('battle', 0.4);
  });

  it('the master level moves the sounds and the music together at the game’s own mix', () => {
    const sfx = vi.spyOn(audio, 'setSfxVolume').mockImplementation(() => undefined);
    const mus = vi.spyOn(audio, 'setMusicVolume').mockImplementation(() => undefined);
    const board = engineAudio();
    board.setVolume(SFX_DEFAULT);
    expect(sfx).toHaveBeenLastCalledWith(SFX_DEFAULT);
    expect(mus).toHaveBeenLastCalledWith(MUSIC_DEFAULT);
    board.setVolume(1);
    expect(sfx).toHaveBeenLastCalledWith(1);
    expect(mus.mock.calls.at(-1)?.[0]).toBeCloseTo(0.625, 9);
    board.setVolume(0);
    expect(mus).toHaveBeenLastCalledWith(0);
  });

  it('those default levels are the ones the game starts with', () => {
    const settings = readFileSync(join(__dirname, '..', 'src', 'view', 'hud', 'settings.ts'), 'utf8');
    expect(settings).toContain(`sfx: ${SFX_DEFAULT},`);
    expect(settings).toContain(`music: ${MUSIC_DEFAULT},`);
  });

  it('stop-all silences the one-shots and fades the music out', () => {
    const engine = audio as unknown as Pick<AudioEngine, 'stopAll'>;
    const cut = vi.spyOn(engine, 'stopAll').mockReturnValue(3);
    const music = vi.spyOn(audio, 'music').mockImplementation(() => undefined);
    engineAudio().stopAll();
    expect(cut).toHaveBeenCalledTimes(1);
    expect(music).toHaveBeenCalledWith('none', expect.any(Number));
  });

  it('knows how long each sound lasts (for the lit button), with a fallback', () => {
    const board = engineAudio();
    expect(board.lengthOf('boss_roar')).toBeGreaterThan(board.lengthOf('ui_click'));
    expect(board.lengthOf('ui_click')).toBeGreaterThan(0);
    expect(board.lengthOf('no_such_sound' as never)).toBeGreaterThan(0);
  });

  it('is silent and safe before audio has started: nothing throws, nothing sounds', () => {
    const board = engineAudio();
    expect(board.unlocked).toBe(false);
    expect(() => {
      board.play('ui_click', {});
      board.stinger('victory');
      board.music('home', 0.2);
      board.stopAll();
    }).not.toThrow();
  });
});
