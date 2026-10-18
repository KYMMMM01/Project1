/**
 * The little black cloud of "Tagalong Cloud" (docs/design_skills_v2.md 3.7), as the owner chose it (art/skills_v1, set B of the first round,
 * 2026-10-18): a slate cloud with cat ears, three faces and a yellow bolt. `tools/process_art.py` centres each face's file on the cloud's body and
 * scales them to one body width, so the three lie on each other and a mood change is one texture:
 *   grumpy   `fx_cloud_grumpy`  the cross face while it trots (and in the air between two hosts: the squash and stretch of the jump say "startled")
 *   zap      `fx_cloud_zap`     squeezed brows, an open mouth and a little bolt out of its belly, while a bolt falls
 *   sigh     `fx_cloud_sigh`    half-lidded, a puff of breath and a drip, at the end of its time (and for a cloud that lost its host: the drip is its tear)
 * and `fx_cloud_bolt`, the bolt the cloud drops on the enemy.
 */
import type { Texture } from 'pixi.js';
import { tex } from '@/core/assets';

/** Design px per pixel of the pictures: the slate body is 150 px across in the files and about 72 design px on the field (the whole sticker about 83 x 60). */
export const CLOUD_K = 0.48;
/** The body's height in design px (what the cloud sits on a health bar by, and where its belly is). */
export const CLOUD_H = 50;
/** The middle of every face's file is the middle of the cloud's body. */
export const CLOUD_ANCHOR = 0.5;

/** A storm cloud's slate, read off the pictures: what the puffs and the drops it lets out wear. */
export const CLOUD_BODY = 0x7d7e8a;

export type CloudMood = 'grumpy' | 'zap' | 'startled' | 'sigh' | 'sad';
export const CLOUD_MOODS: readonly CloudMood[] = ['grumpy', 'zap', 'startled', 'sigh', 'sad'];

/** The picture each mood wears (the owner's set has three faces: the two moods without one borrow the nearest). */
export const CLOUD_FACE_KEY: Readonly<Record<CloudMood, string>> = {
  grumpy: 'fx_cloud_grumpy',
  zap: 'fx_cloud_zap',
  startled: 'fx_cloud_grumpy',
  sigh: 'fx_cloud_sigh',
  sad: 'fx_cloud_sigh',
};
export const CLOUD_BOLT_KEY = 'fx_cloud_bolt';

export interface CloudArt {
  faces: Record<CloudMood, Texture>;
  bolt: Texture;
}

/** The cloud's pictures (the image store's; nothing to paint or free). */
export function cloudArt(): CloudArt {
  const faces = {} as Record<CloudMood, Texture>;
  for (const m of CLOUD_MOODS) faces[m] = tex(CLOUD_FACE_KEY[m]);
  return { faces, bolt: tex(CLOUD_BOLT_KEY) };
}
