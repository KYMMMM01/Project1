/** Which track plays where. Pure, so the director and the tests share one table. */
import type { MusicId } from './api';

/** The chapter tracks in chapter order: living room, kitchen, bathroom, garden, vet clinic. */
const CHAPTER_TRACKS: readonly MusicId[] = ['battle', 'kitchen', 'bath', 'garden', 'clinic'];

/** The battle track of a run: the gold dungeon has its own, every other mode plays the music of its chapter (1-based; out of range wraps). */
export function battleMusic(chapter: number, mode: string): MusicId {
  if (mode === 'gold') return 'gold';
  const i = Number.isFinite(chapter) ? Math.floor(chapter) - 1 : 0;
  return CHAPTER_TRACKS[((i % CHAPTER_TRACKS.length) + CHAPTER_TRACKS.length) % CHAPTER_TRACKS.length] as MusicId;
}
