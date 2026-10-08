/**
 * The drawn sprites of the battle effects (`art/fx_v3`, made by the image generator in the game's own cartoon style and cut by
 * `art/fx_v3/build_fx.py`; the files are `src/assets/img/fx_<id>.webp`): flat colours, a thick dark-brown outline, no light and no glow.
 * The flat shapes of the atlas in `textures.ts` are the particles that go with them.
 */
import type { Texture } from 'pixi.js';
import { tex } from '@/core/assets';

export const PAINT_IDS = [
  'shot_pebble', 'shot_arrow', 'shot_shuriken', 'shot_cork', 'shot_moon', 'shot_coin', 'shot_snow', 'shot_fire', 'shot_ice',
  'shot_void', 'shot_note', 'shot_flask', 'shot_ladle', 'shot_bell',
  'burst_star', 'burst_ring', 'burst_glint', 'burst_slash', 'burst_sparks', 'burst_puff',
  'mark_scorch', 'mark_snow',
  'bolt_0', 'bolt_1', 'bolt_2', 'bolt_3', 'bolt_4', 'bolt_5',
  'badge_shield', 'shard_0', 'shard_1', 'shard_2', 'shard_3', 'shard_4',
  'zone_frost', 'zone_snow', 'zone_hole', 'zone_holearms', 'zone_ooze', 'zone_puddle',
] as const;

export type PaintId = (typeof PAINT_IDS)[number];

/** Image key of a painted sprite. */
export function paintKey(id: PaintId): string {
  return `fx_${id}`;
}

/** The texture of a painted sprite (an empty one, with a single warning, when the image is missing). */
export function paint(id: PaintId): Texture {
  return tex(paintKey(id));
}

/** The six lightning bolts, one of which an arc shows each flicker. */
export const BOLT_IDS: readonly PaintId[] = ['bolt_0', 'bolt_1', 'bolt_2', 'bolt_3', 'bolt_4', 'bolt_5'];
/** The five pieces a shield breaks into (a break throws three or four of them). */
export const SHARD_IDS: readonly PaintId[] = ['shard_0', 'shard_1', 'shard_2', 'shard_3', 'shard_4'];
