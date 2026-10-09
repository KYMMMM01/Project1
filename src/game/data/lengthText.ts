/**
 * Distances in the texts a player reads: "1.3 tiles" instead of 130 px. The data keeps pixels (they are the sim's unit); only the
 * sentence says tiles, a board tile being the one length the player can see on the screen.
 */
import { getLang } from '@/core/i18n';

/** A board tile is 108 px wide and 96 px high: the texts count 100 px as one tile. */
export const TILE_PX = 100;

/** `px` in tiles, to one decimal (so 55 px reads 0.6, 130 px 1.3 and 100 px 1). */
export function tilesOf(px: number): number {
  return Math.round((px / TILE_PX) * 10) / 10;
}

/** The length with its unit in the current language: "1.3칸" / "1.3 tiles" ("1 tile"). */
export function tilesText(px: number): string {
  const n = tilesOf(px);
  return getLang() === 'ko' ? `${n}칸` : `${n} ${n === 1 ? 'tile' : 'tiles'}`;
}
