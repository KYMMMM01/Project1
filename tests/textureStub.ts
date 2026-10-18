/**
 * A stand-in for `tex(key)` in the tests of scenes that draw the owner's painted pictures: one distinct, memoized texture per image key (the real
 * loader needs a browser), so a test can tell which picture a sprite wears and that two kinds wear two different ones. That the files behind the
 * keys exist is `view.skillPictures.test.ts`'s job.
 */
import { Texture } from 'pixi.js';

const made = new Map<string, Texture>();

export function stubTex(key: string): Texture {
  let t = made.get(key);
  if (!t) {
    t = new Texture({ label: key });
    made.set(key, t);
  }
  return t;
}
