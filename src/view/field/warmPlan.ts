/**
 * What a wave needs on screen before it walks in, as plain data: the texture of each kind that will be in it, the ground area
 * an aura draws, and how many bodies the pool should have ready. Pure, so the rules are tested without a renderer.
 */
import type { WavePreviewEntry } from '@/game/api';
import { enemySpec } from '@/game';
import type { DiscKind } from '@/fx';

/** Fewest and most enemy views kept ready: a wave's first crowd is built ahead, a long wave still builds its tail as it goes. */
export const SPARE_MIN = 4;
export const SPARE_MAX = 12;

/** Texture key of an enemy: bosses use their own id, the small balloon borrows the big one's art (the same rule as `enemyTextureKey`). */
export function enemyArtKey(id: string, has: (key: string) => boolean): string {
  const key = id.startsWith('boss_') ? id : `enemy_${id}`;
  return has(key) ? key : key.replace(/_small$/, '');
}

/** The disc area an enemy's aura is drawn with, or null (a kind with no aura). */
export function auraAreaOf(id: WavePreviewEntry['enemy']): DiscKind | null {
  const aura = enemySpec(id).aura;
  return aura ? aura.kind : null;
}

export interface WaveNeeds {
  /** Image keys, in the order the wave's kinds are listed. */
  images: string[];
  /** Ground areas the wave's enemies draw. */
  areas: DiscKind[];
  /** Enemies the wave brings in total. */
  count: number;
}

/** What a wave's preview list needs: every kind's picture once (a split kind's pieces borrow it), the aura areas, and the head count. */
export function waveNeeds(entries: readonly WavePreviewEntry[], has: (key: string) => boolean): WaveNeeds {
  const images: string[] = [];
  const areas: DiscKind[] = [];
  let count = 0;
  for (const e of entries) {
    count += e.count;
    const key = enemyArtKey(e.enemy, has);
    if (!images.includes(key)) images.push(key);
    const area = auraAreaOf(e.enemy);
    if (area && !areas.includes(area)) areas.push(area);
  }
  return { images, areas, count };
}

/** How many spare views a wave of `count` enemies is worth: all of a small wave, a dozen of a big one. */
export function spareFor(count: number): number {
  return Math.max(SPARE_MIN, Math.min(SPARE_MAX, count));
}
