import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { Container, Graphics, Sprite, Texture, TextureSource } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { putTex } from '@/core/assets';
import { RELIC_IDS } from '@/game/api';
import { CHEST_KINDS } from '@/meta/types';
import { chestKey } from '@/screens/shop/keys';
import { currencyIcon, drawIcon, GLYPH_PICTURE, PICTURE_IDS, PICTURES, type IconName, type PictureId } from '@/ui';

const ART_DIR = join(process.cwd(), 'src/assets/img');

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (path.endsWith('.ts')) out.push(path);
  }
  return out;
}

function onlyChild(c: Container): Container {
  expect(c.children).toHaveLength(1);
  return c.children[0] as Container;
}

/** Each picture's art key as the table has it (null for a picture drawn only). */
function artOf(id: PictureId): string | null {
  return PICTURES[id].art;
}

describe('kit pictures: one picture per currency and countable reward', () => {
  it('every picture with art names an image file that ships, and only the sweep ticket is still drawn', () => {
    for (const id of PICTURE_IDS) {
      const key = artOf(id);
      if (key !== null) expect(existsSync(join(ART_DIR, `${key}.webp`)), `${id} -> ${key}`).toBe(true);
    }
    expect(PICTURE_IDS.filter((id) => artOf(id) === null)).toEqual(['tickets']);
  });

  it('the chest scene finds each closed chest and its two poses under the picture key', () => {
    for (const kind of CHEST_KINDS) {
      expect(chestKey(kind)).toBe(PICTURES[`chest_${kind}`].art);
      for (const suffix of ['', '_ajar', '_open']) expect(existsSync(join(ART_DIR, `${chestKey(kind)}${suffix}.webp`)), `${kind}${suffix}`).toBe(true);
    }
  });

  it('every toy has its own art file', () => {
    for (const id of RELIC_IDS) expect(existsSync(join(ART_DIR, `relic_${id}.webp`)), id).toBe(true);
  });

  it('draws the stand-in glyph while the art is not loaded, and the gem is one of them', () => {
    for (const id of PICTURE_IDS) {
      const picture = currencyIcon(id, 40);
      expect(onlyChild(picture)).toBeInstanceOf(Graphics);
    }
    expect(PICTURES.gems.glyph).toBe('gem');
  });

  it('routes an icon name that means a picture to that picture: asking for the drawn gem gives the gem picture', () => {
    for (const [name, id] of Object.entries(GLYPH_PICTURE) as [IconName, PictureId][]) {
      expect(drawIcon(name, 40)).toBeInstanceOf(Container);
      // The name is the picture's own glyph, so a button that says 'gem' and a shop block that says 'gems' cannot differ.
      if (name !== 'chest') expect(PICTURES[id].glyph).toBe(name);
    }
    expect(Object.keys(GLYPH_PICTURE).sort()).toEqual(['chest', 'coin', 'fish', 'gem', 'purr', 'ticket', 'xp']);
  });

  it('shows the art of each currency once it is loaded, whichever way it is asked for, fitted into its square', () => {
    const textures = new Map<string, Texture>();
    PICTURE_IDS.forEach((id, i) => {
      const key = artOf(id);
      if (key === null) return;
      const texture = new Texture({ source: new TextureSource({ width: 200, height: 100 + i * 10 }) });
      textures.set(key, texture);
      putTex(key, texture);
    });

    for (const id of PICTURE_IDS) {
      const key = artOf(id);
      if (key === null) continue;
      const sprite = onlyChild(currencyIcon(id, 60)) as Sprite;
      expect(sprite, id).toBeInstanceOf(Sprite);
      expect(sprite.texture).toBe(textures.get(key));
      expect(Math.max(sprite.width, sprite.height)).toBeCloseTo(60, 5);
    }

    // The same pictures through the icon names every button, pill and tag uses.
    for (const [name, id] of Object.entries(GLYPH_PICTURE) as [IconName, PictureId][]) {
      const key = artOf(id);
      const sprite = onlyChild(drawIcon(name, 40)) as Container;
      if (key === null) expect(sprite).toBeInstanceOf(Graphics);
      else expect((sprite as Sprite).texture, name).toBe(textures.get(key));
    }

    // The three chests are three pictures, and the generic chest icon is the wooden one.
    const chest = (id: PictureId): Texture => (onlyChild(currencyIcon(id, 40)) as Sprite).texture;
    expect(new Set([chest('chest_wooden'), chest('chest_silver'), chest('chest_gold')]).size).toBe(3);
    expect((onlyChild(drawIcon('chest', 40)) as Sprite).texture).toBe(chest('chest_wooden'));
  });

  it('keeps the art keys in the table alone: no screen names a currency picture by its file', () => {
    const roots = ['src/ui', 'src/screens', 'src/view/hud', 'src/guide', 'src/app'].map((d) => join(process.cwd(), d));
    const keys = PICTURE_IDS.map(artOf).filter((k): k is string => k !== null);
    const offenders: string[] = [];
    for (const root of roots) {
      for (const file of walk(root)) {
        if (file.endsWith(join('src', 'ui', 'pictures.ts'))) continue;
        const text = readFileSync(file, 'utf8');
        for (const key of keys) if (text.includes(key)) offenders.push(`${file}: ${key}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
