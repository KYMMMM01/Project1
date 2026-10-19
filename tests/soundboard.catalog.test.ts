import { describe, expect, it } from 'vitest';
import { GAME_SFX_IDS, LEGACY_SFX_IDS, SFX_IDS, isLegacySfx, type MusicId, type StingerId } from '@/audio/api';
import { sfxIndexOf, stingerIndexOf } from '@/audio/sounds';
import { createRules } from '@/view/director/stage';
import { GAP_SECONDS, GROUP_KO, MUSIC_ROWS, PACK_KO, ROWS, ROW_BY_KEY, SECTIONS, STINGER_ROWS, groupOf, type Cue, type Gap } from '@/soundboard/catalog';
import { HIT_PASS_KEYS, NEW_ONLY_IDS, NEW_VERSIONS, OLD_VERSIONS, before } from '@/soundboard/next';
import { SOUNDS } from '@/audio/sounds';

const HANGUL = /[가-힣]/;

const cuesOf = (r: { now: readonly Cue[] }): Cue[] => [...r.now];

describe('sound board catalog: every sound of the game can be heard', () => {
  it('has a row of its own for every SFX id (so a new id cannot be added without the owner being able to hear it)', () => {
    const rowIds = ROWS.map((r) => r.id).filter((id): id is NonNullable<typeof id> => id !== undefined);
    expect(new Set(rowIds).size).toBe(rowIds.length);
    const missing = GAME_SFX_IDS.filter((id) => !rowIds.includes(id) && !NEW_ONLY_IDS.includes(id));
    expect(missing).toEqual([]);
    for (const id of rowIds) expect(SFX_IDS).toContain(id);
  });

  it('keys are unique and a single-sound row is keyed by its id', () => {
    const keys = ROWS.map((r) => r.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const r of ROWS) if (r.id) expect(r.key).toBe(r.id);
  });

  it('every row sits in a section, is named in Korean and says when it is heard', () => {
    const sectionIds = new Set(SECTIONS.map((s) => s.id));
    expect(sectionIds.size).toBe(SECTIONS.length);
    for (const s of SECTIONS) {
      expect(HANGUL.test(s.ko), s.id).toBe(true);
      expect(s.rows.length, s.id).toBeGreaterThan(0);
      for (const r of s.rows) expect(r.section, r.key).toBe(s.id);
    }
    for (const r of ROWS) {
      expect(HANGUL.test(r.ko), `${r.key} ko`).toBe(true);
      expect(HANGUL.test(r.when), `${r.key} when`).toBe(true);
      expect(r.now.length, r.key).toBeGreaterThan(0);
    }
  });

  it('every cue names a sound the engine really has', () => {
    for (const r of ROWS) {
      for (const c of cuesOf(r)) {
        const kinds = [c.sfx, c.stinger, c.file].filter((x) => x !== undefined).length;
        expect(kinds, `${r.key}: one kind of cue`).toBe(1);
        if (c.sfx) expect(sfxIndexOf(c.sfx), `${r.key}: ${c.sfx}`).toBeGreaterThanOrEqual(0);
        if (c.stinger) expect(stingerIndexOf(c.stinger), `${r.key}: ${c.stinger}`).toBeGreaterThanOrEqual(0);
        expect(c.at ?? 0, r.key).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('has the twenty cats’ shots (a pair row plus the two halves) and the twelve skills', () => {
    const pairs = ROWS.filter((r) => r.key.startsWith('pair:'));
    expect(pairs).toHaveLength(20);
    for (const p of pairs) {
      const [atk, imp, answer] = p.now;
      expect(atk?.sfx, p.key).toMatch(/^atk_/);
      expect(imp?.sfx, p.key).toMatch(/^imp_/);
      expect(answer?.sfx, p.key).toMatch(/^foe_/);
      expect(imp?.at, p.key).toBeGreaterThan(0);
    }
    expect(ROWS.filter((r) => r.key.startsWith('atk_'))).toHaveLength(20);
    expect(ROWS.filter((r) => r.key.startsWith('imp_'))).toHaveLength(20);
    const skills = ROWS.filter((r) => r.key.startsWith('skill:'));
    expect(skills).toHaveLength(12);
    for (const s of skills) expect(s.section).toBe('skills');
  });

  it('lists every music track and every stinger', () => {
    const tracks: Record<Exclude<MusicId, 'none'>, true> = { home: true, home2: true, battle: true, kitchen: true, bath: true, garden: true, clinic: true, elite: true, boss: true, gold: true, win: true, lose: true };
    expect(MUSIC_ROWS.map((m) => m.id).sort()).toEqual(Object.keys(tracks).sort());
    const stingers: Record<StingerId, true> = { victory: true, defeat: true, boss_intro: true, mythic: true, level_up: true, jackpot: true };
    expect(STINGER_ROWS.map((s) => s.id).sort()).toEqual(Object.keys(stingers).sort());
    for (const m of MUSIC_ROWS) expect(HANGUL.test(m.ko + m.when), m.id).toBe(true);
    for (const s of STINGER_ROWS) expect(HANGUL.test(s.ko + s.when), s.id).toBe(true);
  });
});

describe('sound board catalog: "x5 at 3x" stacks the way the director lets a busy board stack', () => {
  it('uses exactly the gaps of the director’s sound rules', () => {
    const rules = createRules() as unknown as Record<string, { gap: number }>;
    expect(Object.keys(GAP_SECONDS).sort()).toEqual(Object.keys(rules).sort());
    for (const key of Object.keys(GAP_SECONDS) as Gap[]) expect(rules[key]?.gap, key).toBe(GAP_SECONDS[key]);
  });

  it('gives every row a known gap', () => {
    for (const r of ROWS) expect(GAP_SECONDS[r.gap], r.key).toBeGreaterThan(0);
  });
});

describe('sound board catalog: before / after (next.ts)', () => {
  it('only offers a "새것" for rows that exist, with cues that are well formed', () => {
    for (const table of [NEW_VERSIONS, OLD_VERSIONS]) {
      for (const [key, cues] of Object.entries(table)) {
        expect(ROW_BY_KEY.has(key), key).toBe(true);
        expect(cues.length, key).toBeGreaterThan(0);
        for (const c of cues) expect([c.sfx, c.stinger, c.file].filter((x) => x !== undefined)).toHaveLength(1);
      }
    }
  });

  it('exempts only ids that exist and have no row', () => {
    for (const id of NEW_ONLY_IDS) {
      expect(SFX_IDS).toContain(id);
      expect(ROWS.some((r) => r.id === id)).toBe(false);
    }
  });
});

describe('sound board catalog: names of the candidate groups', () => {
  it('splits a file name into its group', () => {
    expect(groupOf('impactMetal_heavy_002')).toBe('impactMetal_heavy');
    expect(groupOf('bookFlip2')).toBe('bookFlip');
    expect(groupOf('footstep09')).toBe('footstep');
    expect(groupOf('click_001')).toBe('click');
    expect(groupOf('chop')).toBe('chop');
  });

  it('knows the three packs in Korean', () => {
    for (const pack of ['impact-sounds', 'rpg-audio', 'interface-sounds']) {
      expect(HANGUL.test(PACK_KO[pack]?.ko ?? ''), pack).toBe(true);
      expect(HANGUL.test(PACK_KO[pack]?.blurb ?? ''), pack).toBe(true);
    }
    for (const g of Object.values(GROUP_KO)) expect(HANGUL.test(g)).toBe(true);
  });
});

describe('sound board catalog: the hit pass, before and after', () => {
  it('has a row with an old and a new version for every cat\'s release, landing and shot, the layers of a blow, the explosion, every enemy\'s answer and the boss\'s warning and cry', () => {
    expect(HIT_PASS_KEYS.length).toBe(20 * 3 + 4 + 10 + 2 - 1);
    // (all but the snow cat's release, which did not change)
    expect(HIT_PASS_KEYS).not.toContain('atk_m_snow');
    for (const key of HIT_PASS_KEYS) {
      expect(ROW_BY_KEY.has(key), key).toBe(true);
      expect(NEW_VERSIONS[key], key).toBeDefined();
      expect(OLD_VERSIONS[key], key).toBeDefined();
      expect(OLD_VERSIONS[key]?.length, key).toBe(NEW_VERSIONS[key]?.length);
    }
  });

  it('plays the game\'s own sounds as "새것" (the very cues of the row) and the old recipes as "지금", at the same times, levels and pitches', () => {
    for (const key of HIT_PASS_KEYS) {
      const row = ROW_BY_KEY.get(key);
      expect(NEW_VERSIONS[key], key).toEqual(row?.now);
      const old = OLD_VERSIONS[key] ?? [];
      const now = NEW_VERSIONS[key] ?? [];
      let changed = 0;
      old.forEach((c, i) => {
        const n = now[i] as Cue;
        expect({ ...c, sfx: undefined }, key).toEqual({ ...n, sfx: undefined });
        if (c.sfx !== n.sfx) {
          changed++;
          expect(c.sfx, key).toBe(`old_${n.sfx}`);
          expect(isLegacySfx(c.sfx as string), key).toBe(true);
        }
      });
      expect(changed, key).toBeGreaterThan(0);
    }
  });

  it('keeps every old version under an id that the game never plays, that is a legacy recipe, and that some row of the board plays', () => {
    const used = new Set<string>();
    for (const cues of Object.values(OLD_VERSIONS)) for (const c of cues) if (c.sfx && isLegacySfx(c.sfx)) used.add(c.sfx);
    expect([...used].sort()).toEqual([...LEGACY_SFX_IDS].sort());
    for (const id of LEGACY_SFX_IDS) {
      expect(SOUNDS[sfxIndexOf(id)]?.recipe.legacy, id).toBe(true);
      // no row of the game plays one (only the old side of a before / after does)
      for (const r of ROWS) for (const c of r.now) expect(c.sfx, `${r.key} plays ${id}`).not.toBe(id);
    }
  });

  it('finds the old version of a sound only where there is one', () => {
    expect(before('imp_w_sword')).toBe('old_imp_w_sword');
    expect(before('hit_light')).toBe('hit_light');
    expect(before('atk_m_snow')).toBe('atk_m_snow');
  });
});
