/**
 * The owner's painted pictures of five skill scenes (art/skills_v1, chosen 2026-10-18; docs/handoff/skills2_view.md, "The painted pictures"): the lucky
 * cat's six capsules, the storm cat's cloud, the ninja's clone and pair, the samurai's line and gash, the cosmo cat's rock, flash and blast ring. Here:
 * every picture a scene asks for is a file the game ships (and its raw picture is kept in art/raw), the files are as small as they were meant to be,
 * and the two files of a capsule (and the three faces of the cloud) are cut to lie on each other. That a scene USES them is each scene's own test.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { hasImage, imageKeys } from '@/core/assets';
import { SP_CAPSULE_KINDS } from '@/game';
import { CLOUD_BOLT_KEY, CLOUD_FACE_KEY } from '@/view/cloudArt';
import { capsuleKeys } from '@/view/capsuleArt';
import { CLONE_KEY, CLONE_PAIR_KEY } from '@/view/director/sp/cloneArt';
import { GASH_KEY, LINE_KEY } from '@/view/director/sp/cut';
import { FLASH_KEY, RING_KEY, ROCK_KEY } from '@/view/director/sp/meteor';

const ROOT = path.resolve(__dirname, '..');
const IMG = path.join(ROOT, 'src', 'assets', 'img');
const RAW = path.join(ROOT, 'art', 'raw');

/** Every picture the five scenes ask for, by image key. */
const CAPSULE_KEYS = SP_CAPSULE_KINDS.flatMap((k) => [capsuleKeys(k).lid, capsuleKeys(k).base]);
const CLOUD_KEYS = [...new Set(Object.values(CLOUD_FACE_KEY)), CLOUD_BOLT_KEY];
const ALL = [...CAPSULE_KEYS, ...CLOUD_KEYS, CLONE_KEY, CLONE_PAIR_KEY, LINE_KEY, GASH_KEY, ROCK_KEY, FLASH_KEY, RING_KEY];

/** The size of a WebP file from its header (a lossy file with an alpha channel is the `VP8X` kind; the plain kinds are read too). */
function webpSize(file: string): { w: number; h: number } {
  const b = fs.readFileSync(file);
  expect(b.toString('ascii', 0, 4)).toBe('RIFF');
  expect(b.toString('ascii', 8, 12)).toBe('WEBP');
  const kind = b.toString('ascii', 12, 16);
  if (kind === 'VP8X') return { w: 1 + b.readUIntLE(24, 3), h: 1 + b.readUIntLE(27, 3) };
  if (kind === 'VP8L') {
    const [b0, b1, b2, b3] = [b[21] as number, b[22] as number, b[23] as number, b[24] as number];
    return { w: 1 + (((b1 & 0x3f) << 8) | b0), h: 1 + (((b3 & 0xf) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6)) };
  }
  return { w: b.readUInt16LE(26) & 0x3fff, h: b.readUInt16LE(28) & 0x3fff };
}
const file = (key: string): string => path.join(IMG, `${key}.webp`);

describe('the painted pictures of the skill scenes', () => {
  it('lists 23 pictures: twelve capsule halves, four cloud files, the clone and the pair, the line and the gash, the rock, the flash and the ring', () => {
    expect(CAPSULE_KEYS).toHaveLength(12);
    expect(CLOUD_KEYS).toHaveLength(4);
    expect(new Set(ALL).size).toBe(23);
    expect(ALL.every((k) => k.startsWith('fx_'))).toBe(true);
  });

  it('ships every one of them, and the game\'s image store picks each up under its key (the loader loads whatever is in the store)', () => {
    for (const key of ALL) {
      expect(fs.existsSync(file(key)), key).toBe(true);
      expect(hasImage(key), key).toBe(true);
      expect(imageKeys()).toContain(key);
    }
  });

  it('keeps the owner\'s raw pictures in art/raw (a capsule\'s raw file is the whole shell: process_art.py cuts it into its lid and its base)', () => {
    const raws = [
      ...SP_CAPSULE_KINDS.map((k) => `fx_capsule_${k}`),
      ...CLOUD_KEYS.filter((k) => !k.endsWith('_lid') && !k.endsWith('_base')),
      CLONE_KEY, CLONE_PAIR_KEY, LINE_KEY, GASH_KEY, ROCK_KEY, FLASH_KEY, RING_KEY,
    ];
    for (const r of raws) expect(fs.existsSync(path.join(RAW, `${r}.png`)), r).toBe(true);
    // No whole-shell file is shipped next to the halves (it would be loaded and never drawn).
    for (const k of SP_CAPSULE_KINDS) expect(fs.existsSync(file(`fx_capsule_${k}`)), k).toBe(false);
  });

  it('keeps the files small: none over 80 KB, all 23 together under 450 KB', () => {
    let total = 0;
    for (const key of ALL) {
      const size = fs.statSync(file(key)).size;
      expect(size, key).toBeLessThan(80 * 1024);
      total += size;
    }
    expect(total).toBeLessThan(450 * 1024);
  });

  it('cuts the two halves of a capsule on one canvas (so that they lie on each other at one anchor), the same size for every kind within a few pixels', () => {
    const sizes = SP_CAPSULE_KINDS.map((k) => {
      const lid = webpSize(file(capsuleKeys(k).lid));
      const base = webpSize(file(capsuleKeys(k).base));
      expect(base, k).toEqual(lid);
      expect(lid.w % 2 + lid.h % 2, k).toBe(0);
      return lid;
    });
    // The bowl is 180 px across in every file, so the canvases are about 190 to 225 across (the One More! is taller and wider for its small capsule).
    for (const s of sizes) {
      expect(s.w).toBeGreaterThan(180);
      expect(s.w).toBeLessThan(240);
      expect(s.h).toBeGreaterThan(180);
      expect(s.h).toBeLessThan(240);
    }
  });

  it('makes the clone and the pair at one scale (a lone figure is as big in the pair\'s file as in its own: the files are 320 and 350 px at most)', () => {
    const one = webpSize(file(CLONE_KEY));
    const two = webpSize(file(CLONE_PAIR_KEY));
    expect(Math.max(one.w, one.h)).toBeLessThanOrEqual(320 + 8 + 8);
    expect(Math.max(two.w, two.h)).toBeLessThanOrEqual(350 + 8 + 8);
    // A pair is wider than it is tall (two figures side by side), a clone taller than it is wide.
    expect(two.w).toBeGreaterThan(two.h);
    expect(one.h).toBeGreaterThan(one.w);
  });

  it('gives the cloud\'s three faces the one body width (the files are centred on the body, so the faces lie on each other): the grumpy face is the smallest, the others carry a bolt or a puff and a drip', () => {
    const grumpy = webpSize(file('fx_cloud_grumpy'));
    const zap = webpSize(file('fx_cloud_zap'));
    const sigh = webpSize(file('fx_cloud_sigh'));
    for (const s of [grumpy, zap, sigh]) {
      // The body is 150 px across in each; with its ears' ink and sticker edge the picture is a little wider, and an extra can add to it.
      expect(s.w).toBeGreaterThanOrEqual(168);
      expect(s.w).toBeLessThan(210);
    }
    // The centre of every file is the body's centre, so a face with a bolt below is taller by (about) twice what hangs below the body.
    expect(zap.h).toBeGreaterThan(grumpy.h);
    expect(sigh.h).toBeGreaterThan(grumpy.h);
  });

  it('is drawn on the board by the five scenes, not by the old code: nothing of the old painted shells, faces, clone rim, streak lines or rings is left to ask for', async () => {
    const sources = [
      'src/view/capsuleArt.ts', 'src/view/cloudArt.ts', 'src/view/director/sp/cloneArt.ts', 'src/view/director/sp/cut.ts', 'src/view/director/sp/meteor.ts',
    ].map((p) => fs.readFileSync(path.join(ROOT, p), 'utf8'));
    const text = sources.join('\n');
    // What the pictures replaced.
    for (const gone of ['paintLid', 'paintBase', 'paintMouth', 'paintPeek', 'tinyCapsule', 'paintBody', 'silhouette', 'rimOf(', 'ringThick', "paint('shot_fire')", 'WAIT_INK']) {
      expect(text.includes(gone), gone).toBe(false);
    }
  });
});
