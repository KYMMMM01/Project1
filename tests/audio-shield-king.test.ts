import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { GAME_SFX_IDS, LEGACY_SFX_IDS, SFX_IDS } from '@/audio/api';
import { busOf } from '@/audio/graph';
import { FAMILIES, familyOf } from '@/audio/families';
import { SOUNDS, sfxIndexOf, stingerIndexOf } from '@/audio/sounds';
import { STINGER_DUCK, STINGER_RECIPES } from '@/audio/stingers';

const SRC = (f: string): string => readFileSync(new URL(`../src/audio/${f}`, import.meta.url), 'utf8');
const IDS = ['foe_shield_hit'] as const;

describe('the six old sounds nothing plays (shoot_arrow, shoot_cannon, shoot_ice, shoot_lightning, shoot_magic, enemy_die)', () => {
  const gone = ['shoot_arrow', 'shoot_cannon', 'shoot_ice', 'shoot_lightning', 'shoot_magic', 'enemy_die'];

  it('are out of the id list, the catalogue and the families', () => {
    for (const id of gone) {
      expect(SFX_IDS as readonly string[], id).not.toContain(id);
      expect(SOUNDS.some((d) => d.id === id), id).toBe(false);
      expect(
        FAMILIES.some((f) => (f.members as readonly string[]).includes(id)),
        id,
      ).toBe(false);
    }
  });

  it('leave the "old_" versions of the board as they were: LEGACY_SFX_IDS is still the 54 ids and none of them is a game sound', () => {
    expect(LEGACY_SFX_IDS).toHaveLength(54);
    for (const id of LEGACY_SFX_IDS) expect(GAME_SFX_IDS as readonly string[], id).not.toContain(id);
    expect(GAME_SFX_IDS.length + LEGACY_SFX_IDS.length).toBe(SFX_IDS.length);
  });
});

describe('foe_shield_hit: what a hit on a shielded enemy sounds like', () => {
  const idx = sfxIndexOf(IDS[0]);
  const def = SOUNDS[idx];

  it('is a short fight sound of the enemy-hit family that two or three hits a second cannot stack', () => {
    expect(idx).toBeGreaterThanOrEqual(0);
    expect(def?.recipe.cat).toBe('foe');
    expect(busOf('foe')).toBe('fight');
    expect(familyOf('foe_shield_hit')?.name).toBe('enemy hit');
    expect(def?.recipe.ms[1]).toBeLessThanOrEqual(300);
    expect(def?.recipe.variants).toBeGreaterThanOrEqual(2);
    expect(def?.recipe.rate).toBeGreaterThan(0);
    // at most two at a time and 90 ms apart: ten shielded enemies hit in one volley are heard as a short rattle, not a wall
    expect(def?.rule.maxVoices).toBeLessThanOrEqual(2);
    expect(def?.rule.minGap).toBeGreaterThanOrEqual(0.09);
  });

  it('plays an ElevenLabs file alone when one ships, like the ten the owner recorded: it asks for the file and its recipe begins with the hook', () => {
    expect(def?.recipe.needs).toEqual(['elevenlabs/foe_shield_hit']);
    expect(SRC('sfx-foes.ts')).toMatch(/foe_shield_hit: foe\(\{[\s\S]*?build\(s, v\) \{\s*\/\/[^\n]*\n\s*if \(recording\(s, 'foe_shield_hit'\)\) return;/);
  });
});

describe('the king stinger: a merge that makes a top rank (대왕)', () => {
  it('is a stinger of its own with a duck and a place in the fanfare family, played as its synthesis (the owner kept it over a recording)', () => {
    expect(stingerIndexOf('king')).toBeGreaterThanOrEqual(0);
    const r = STINGER_RECIPES.king;
    expect(r.cat).toBe('stinger');
    expect(r.ms[0]).toBeGreaterThanOrEqual(1000);
    expect(r.ms[1]).toBeLessThanOrEqual(1500);
    expect(r.needs ?? []).toEqual([]);
    expect(STINGER_DUCK.king).toBeGreaterThan(0);
    expect(STINGER_DUCK.king).toBeLessThan(STINGER_DUCK.mythic);
    expect(familyOf('stinger:king')?.name).toBe('fanfare');
    expect(SRC('stingers.ts')).not.toMatch(/recording\(s, 'king'\)/);
  });
});
