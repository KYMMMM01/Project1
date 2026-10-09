import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CLASS_IDS, ENEMY_IDS, RELIC_IDS, UNIT_IDS } from '@/game/api';
import {
  ACT_LENGTH, BOSS_HP, CC_IMMUNE_AFTER, CHAPTER_COUNT, CHAPTER_HP_MULT, CHAPTER_WAVES, ELITE_HP, ENDLESS_GROWTH, HP_INDEX, PULL_IMMUNE_AFTER,
  SUMMON_ODDS, SUN_SPEED, WAVE_BUDGET, hpIndex, specialHp, specialLimit,
} from '@/game/data/balance';
import { allClassDefs, classDef, synergyTier, tierForDistinct } from '@/game/data/classes';
import { allEnemyDefs, bossSpec, budgetMult, enemyDef } from '@/game/data/enemies';
import { MODIFIER_IDS, modifierName, modifierText } from '@/game/data/modifiers';
import { allRelicDefs, relicDef, relicSpec } from '@/game/data/relics';
import { RARITIES, RELIC_RARITY, UNIT_GRID, unitClass, unitRarityIndex } from '@/game/data/roster';
import { STAKE_STEPS, stakeRules, stakeText } from '@/game/data/stakes';
import { TRAINING, TRAINING_IDS, trainingBonus } from '@/game/data/training';
import { allUnitDefs, auraScale, unitDef, unitSpec } from '@/game/data/units';
import { SPECIAL_CELLS, allSpecialCells, cellShown, specialCellName, specialCellOf, specialCellText } from '@/game/data/cells';
import { tilesOf, tilesText } from '@/game/data/lengthText';
import { actFeatures, chapterWaves, entriesBudget, scriptFor, waveEntries, waveKindOf } from '@/game/data/waves';
import { getLang, setLang, t } from '@/core/i18n';
import '@/game/index';

const original = getLang();

beforeAll(() => {
  // setLang touches document.documentElement; give the node environment a stand-in.
  (globalThis as { document?: unknown }).document = { documentElement: { lang: '' } };
});

afterAll(() => {
  setLang(original);
});

const LANGS = ['ko', 'en'] as const;

describe('unit table', () => {
  it('has 20 units in class / rarity order', () => {
    expect(allUnitDefs()).toHaveLength(20);
    for (const c of CLASS_IDS) {
      UNIT_GRID[c].forEach((id, r) => {
        const d = unitDef(id);
        expect(d.classId).toBe(c);
        expect(d.rarity).toBe(RARITIES[r]);
        expect(unitClass(id)).toBe(c);
        expect(unitRarityIndex(id)).toBe(r);
      });
    }
    expect(new Set(UNIT_IDS).size).toBe(20);
  });

  it('has sane stats and three perks at levels 4, 7 and 10', () => {
    for (const d of allUnitDefs()) {
      expect(d.base.damage).toBeGreaterThan(0);
      expect(d.base.interval).toBeGreaterThan(0.2);
      expect(d.base.range).toBeGreaterThan(100);
      expect(d.base.crit).toBeGreaterThanOrEqual(0);
      expect(d.base.crit).toBeLessThanOrEqual(1);
      expect(d.base.critMult).toBeGreaterThanOrEqual(1);
      expect(d.perks.map((p) => p.level)).toEqual([4, 7, 10]);
      expect(d.projectileSpeed).toBeGreaterThanOrEqual(0);
    }
  });

  it('keeps the damage type by class: warriors and rangers physical, mages and tricksters magic', () => {
    for (const d of allUnitDefs()) {
      expect(d.damageType).toBe(d.classId === 'warrior' || d.classId === 'ranger' ? 'physical' : 'magic');
    }
  });

  it('builds every skill and perk sentence from data, in both languages, with no placeholder left', () => {
    for (const lang of LANGS) {
      setLang(lang);
      for (const d of allUnitDefs()) {
        const skill = d.skillText();
        expect(skill, `${d.id} skill ${lang}`).not.toMatch(/[{}]|undefined|NaN/);
        expect(skill.length).toBeGreaterThan(5);
        expect(t(d.nameKey)).not.toBe(d.nameKey);
        expect(t(d.descKey)).not.toBe(d.descKey);
        for (const p of d.perks) expect(p.text(), `${d.id} perk`).not.toMatch(/[{}]|undefined|NaN/);
      }
    }
  });

  it('states in every skill sentence only numbers that unit data holds, so a retune cannot leave a stale text', () => {
    const numbers = (v: unknown, out: Set<number>): Set<number> => {
      if (typeof v === 'number') {
        out.add(v);
        out.add(Math.round(v * 100));
      } else if (v && typeof v === 'object') for (const x of Object.values(v)) numbers(x, out);
      return out;
    };
    for (const d of allUnitDefs()) {
      const spec = unitSpec(d.id);
      // The windows the black hole and the freeze quote are rules of the whole game (data/balance), a bell's chance
      // grows with its level-7 perk, and the cells around a helper follow from its reach: all data too.
      const around = (2 * (spec.aura.reach ?? 0) + 1) ** 2 - 1;
      const known = numbers(
        [spec.attack, spec.aura, spec.base.critMult, spec.base.crit, CC_IMMUNE_AFTER, PULL_IMMUNE_AFTER, (spec.aura.dodge ?? 0) * auraScale(spec, 7), around],
        new Set<number>(),
      );
      for (const [key, value] of Object.entries(spec.skillArgs)) {
        expect(known.has(value), `${d.id} skill {${key}} = ${value}`).toBe(true);
      }
    }
  });

  it('puts the data values into the skill text, the distances in tiles', () => {
    setLang('en');
    const s = unitSpec('w_sword');
    expect(unitDef('w_sword').skillText()).toContain(tilesText(s.skillArgs.a as number));
    expect(unitDef('w_sword').skillText()).toContain(String(s.skillArgs.b));
    const tiger = unitSpec('w_tiger');
    expect(unitDef('w_tiger').skillText()).toContain(String(tiger.skillArgs.b));
    setLang('ko');
    expect(unitDef('w_samurai').skillText()).toContain('앞뒤 1칸');
  });

  it('gives every distance in a skill sentence in tiles (a tile counts 100 px), never as pixels', () => {
    expect(tilesOf(100)).toBe(1);
    expect(tilesOf(130)).toBe(1.3);
    expect(tilesOf(55)).toBe(0.6);
    setLang('ko');
    expect(tilesText(130)).toBe('1.3칸');
    expect(tilesText(100)).toBe('1칸');
    setLang('en');
    expect(tilesText(130)).toBe('1.3 tiles');
    expect(tilesText(100)).toBe('1 tile');
    for (const lang of LANGS) {
      setLang(lang);
      for (const id of UNIT_IDS) {
        const spec = unitSpec(id);
        const text = unitDef(id).skillText();
        for (const key of Object.keys(spec.skillArgs)) {
          const px = spec.skillArgs[key] as number;
          // A pixel distance is one of the attack's own lengths (radius, reach): its value must not stand in the sentence bare.
          const lengths = [spec.attack].flatMap((a) => ('radius' in a ? [a.radius] : 'reach' in a ? [a.reach] : 'blastRadius' in a ? [a.blastRadius] : []));
          if (!lengths.includes(px) || px < 50) continue;
          expect(text, `${id} ${lang} {${key}}`).not.toMatch(new RegExp(`(?<![\\d.])${px}(?![\\d.%])`));
          expect(text, `${id} ${lang} {${key}}`).toContain(tilesText(px));
        }
      }
    }
  });

  it('uses no internal terms in any unit, perk, toy, class or daily-rule sentence a player reads', () => {
    const banned = { ko: /대상|광역|연쇄|반경/, en: /radius|chain distance|area size|\bpx\b/i } as const;
    for (const lang of LANGS) {
      setLang(lang);
      const texts: string[] = [];
      for (const d of allUnitDefs()) texts.push(d.skillText(), ...d.perks.map((p) => p.text()));
      for (const id of RELIC_IDS) texts.push(relicDef(id).descText());
      for (const c of allClassDefs()) texts.push(c.tierText(1), c.tierText(2), c.tierText(3), c.specialText(), t(c.roleKey));
      for (const id of MODIFIER_IDS) texts.push(modifierText(id));
      for (const text of texts) expect(text, lang).not.toMatch(banned[lang]);
    }
  });

  it('says in the sentences of the viking and the tiger that they aim at bosses and elites first, and only there', () => {
    for (const id of UNIT_IDS) expect(unitDef(id).targetsElitesFirst, id).toBe(id === 'w_viking' || id === 'w_tiger');
    for (const lang of LANGS) {
      setLang(lang);
      for (const id of ['w_viking', 'w_tiger'] as const) expect(unitDef(id).skillText(), `${id} ${lang}`).toMatch(lang === 'ko' ? /보스·정예/ : /boss or elite/);
    }
  });

  it('says in every sentence of an armour break or an armour ignore that it reaches the ward too', () => {
    for (const lang of LANGS) {
      setLang(lang);
      const need = lang === 'ko' ? /결계/ : /ward/;
      expect(unitDef('w_viking').skillText()).toMatch(need);
      expect(unitDef('w_tiger').skillText()).toMatch(need);
      expect(classDef('warrior').tierText(2)).toMatch(need);
      expect(classDef('warrior').tierText(3)).toMatch(need);
      expect(classDef('warrior').specialText()).toMatch(need);
    }
  });
});

describe('special cells', () => {
  it('has one kind per chapter, each with one stat: 0.2 of it, and 0.15 fish a second a cat for the treat cell (measured as the same worth)', () => {
    expect(allSpecialCells().map((c) => c.id)).toEqual(['sun', 'bowl', 'bubble', 'stump', 'treat']);
    expect([1, 2, 3, 4, 5].map((ch) => specialCellOf(ch).id)).toEqual(['sun', 'bowl', 'bubble', 'stump', 'treat']);
    expect(allSpecialCells().map((c) => c.stat)).toEqual(['speed', 'damage', 'crit', 'range', 'fish']);
    expect(allSpecialCells().map((c) => c.value)).toEqual([0.2, 0.2, 0.2, 0.2, 0.15]);
    expect(SUN_SPEED).toBe(SPECIAL_CELLS.sun.value);
    expect(specialCellOf(0).id).toBe('sun');
    expect(specialCellOf(9).id).toBe('treat');
  });

  it('names every kind and describes its one bonus with its real number, in both languages', () => {
    for (const lang of LANGS) {
      setLang(lang);
      for (const c of allSpecialCells()) {
        expect(specialCellName(c.id), `${c.id} ${lang}`).not.toBe(c.nameKey);
        const text = specialCellText(c.id);
        expect(text, `${c.id} ${lang}`).not.toMatch(/[{}]|undefined|NaN/);
        expect(text).toContain(String(cellShown(c)));
        expect(specialCellText(c.id, 0.1)).toContain(String(cellShown(c, c.value + 0.1)));
      }
    }
    expect(cellShown(SPECIAL_CELLS.treat)).toBe(0.15);
    expect(cellShown(SPECIAL_CELLS.treat, 0.25)).toBe(0.25);
    expect(cellShown(SPECIAL_CELLS.sun)).toBe(20);
  });

  it('calls the toy and the daily rule by "special cell", not by the sun', () => {
    for (const lang of LANGS) {
      setLang(lang);
      const toy = relicDef('sunny_spot');
      const words = lang === 'ko' ? /특수 칸/ : /special tiles?/i;
      expect(toy.descText()).toMatch(words);
      expect(modifierText('sunny_day')).toMatch(words);
      expect(`${t(toy.nameKey)} ${t('modifier.sunny_day.name')}`).not.toMatch(/햇살|sun/i);
    }
  });
});

describe('enemies', () => {
  it('defines all 19 enemies with names in both languages', () => {
    expect(allEnemyDefs()).toHaveLength(ENEMY_IDS.length);
    for (const lang of LANGS) {
      setLang(lang);
      for (const d of allEnemyDefs()) {
        expect(t(d.nameKey)).not.toBe(d.nameKey);
        expect(t(d.descKey)).not.toBe(d.descKey);
        for (const trait of d.traits) expect(t(`trait.${trait}.name`)).not.toBe(`trait.${trait}.name`);
      }
    }
  });

  it('matches the rules table for the traits that matter to counters', () => {
    expect(enemyDef('roomba').armor).toBeGreaterThan(0);
    expect(enemyDef('tangerine').ward).toBeGreaterThan(0);
    expect(enemyDef('balloon').traits).toContain('split');
    expect(enemyDef('drop').speed).toBeGreaterThan(enemyDef('cucumber').speed * 1.5);
    expect(enemyDef('dust').hpMult).toBeLessThan(enemyDef('cucumber').hpMult);
    for (const id of ENEMY_IDS) {
      const d = enemyDef(id);
      expect(d.armor).toBeGreaterThanOrEqual(0);
      expect(d.armor).toBeLessThanOrEqual(0.9);
      expect(d.ward).toBeLessThanOrEqual(0.9);
      expect(d.radius).toBeGreaterThan(5);
      expect(d.bounty).toBeGreaterThan(0);
    }
  });

  it('gives every boss exactly one ability with data', () => {
    for (const id of ENEMY_IDS.filter((e) => e.startsWith('boss_'))) {
      const ability = enemyDef(id).ability;
      expect(ability).toBeDefined();
      expect(bossSpec(ability!).id).toBe(ability);
    }
  });

  it('counts a splitter together with its children in the wave budget', () => {
    expect(budgetMult('balloon')).toBeCloseTo(enemyDef('balloon').hpMult + 2 * enemyDef('balloon_small').hpMult);
  });
});

describe('relics', () => {
  it('has 30 relics with rarities from the roster', () => {
    expect(allRelicDefs()).toHaveLength(30);
    expect(new Set(RELIC_IDS).size).toBe(30);
    for (const d of allRelicDefs()) expect(d.rarity).toBe(RELIC_RARITY[d.id]);
  });

  it('builds descriptions from the numbers, in both languages', () => {
    for (const lang of LANGS) {
      setLang(lang);
      for (const id of RELIC_IDS) {
        const text = relicDef(id).descText();
        expect(text, `${id} ${lang}`).not.toMatch(/[{}]|undefined|NaN/);
        const args = relicSpec(id).args;
        if (args.a !== undefined) expect(text).toContain(String(args.a));
        if (args.b !== undefined) expect(text).toContain(String(args.b));
        expect(t(relicDef(id).nameKey)).not.toBe(relicDef(id).nameKey);
      }
    }
  });

  it('keeps the rule values of §13', () => {
    expect(relicSpec('yarn_ball').fx.speedWarriorRanger).toBe(0.12);
    expect(relicSpec('snack_stick').fx.jumpChance).toBe(0.12);
    expect(relicSpec('sardine_crate').fx).toEqual({ instantFish: 150, costCapCut: 15 });
    expect(relicSpec('golden_catnip').fx.synergyScale).toBe(0.25);
    expect(relicSpec('hourglass').fx.bossTime).toBe(15);
  });
});

describe('classes and synergy', () => {
  it('maps distinct unit types 2 / 3 / 4 to tiers 1 / 2 / 3', () => {
    expect([0, 1, 2, 3, 4, 5].map(tierForDistinct)).toEqual([0, 0, 1, 2, 3, 3]);
  });

  it('keeps the rule values of §6', () => {
    expect(synergyTier('warrior', 3).damage).toBe(0.65);
    expect(synergyTier('warrior', 3).armorIgnore).toBe(0.3);
    expect(synergyTier('ranger', 2).critMult).toBe(0.05);
    expect([1, 2, 3].map((n) => synergyTier('ranger', n).damage)).toEqual([0.08, 0.2, 0.45]);
    expect(synergyTier('mage', 1).crit).toBe(0);
    expect(synergyTier('mage', 2).statusMult).toBe(0.2);
    expect(synergyTier('trickster', 3).rewardMult).toBe(0.3);
    expect(synergyTier('trickster', 0).speed).toBe(0);
  });

  it('builds tier text from the values', () => {
    for (const lang of LANGS) {
      setLang(lang);
      for (const c of allClassDefs()) {
        for (const tier of [1, 2, 3] as const) expect(c.tierText(tier)).not.toMatch(/[{}]|undefined|NaN/);
      }
    }
    setLang('en');
    expect(classDef('warrior').tierText(2)).toContain('30');
    expect(classDef('warrior').tierText(2)).toContain('15');
  });
});

describe('summon odds table', () => {
  it('sums to 100 percent in every grade and improves with grade', () => {
    expect(SUMMON_ODDS).toHaveLength(6);
    SUMMON_ODDS.forEach((row, i) => {
      expect(row.reduce((a, v) => a + v, 0)).toBeCloseTo(100, 9);
      if (i > 0) {
        const prev = SUMMON_ODDS[i - 1] as readonly number[];
        expect(row[0]).toBeLessThan(prev[0] as number);
        expect(row[3]).toBeGreaterThan(prev[3] as number);
      }
    });
  });
});

describe('health tables', () => {
  it('grows every wave and continues past 24 by the endless factor', () => {
    expect(HP_INDEX).toHaveLength(25);
    for (let w = 2; w <= 24; w++) expect(hpIndex(w)).toBeGreaterThan(hpIndex(w - 1));
    expect(hpIndex(25)).toBeCloseTo(hpIndex(24) * ENDLESS_GROWTH, 9);
    expect(hpIndex(26)).toBeCloseTo(hpIndex(24) * ENDLESS_GROWTH * ENDLESS_GROWTH, 9);
  });

  it('has increasing elite and boss health and chapter multipliers', () => {
    expect(ELITE_HP[0]).toBeLessThan(ELITE_HP[1] as number);
    expect(ELITE_HP[1]).toBeLessThan(ELITE_HP[2] as number);
    expect(BOSS_HP[0]).toBeLessThan(BOSS_HP[1] as number);
    expect(BOSS_HP[1]).toBeLessThan(BOSS_HP[2] as number);
    expect(specialHp('boss', 3)).toBeGreaterThan(specialHp('boss', 2));
    expect(CHAPTER_HP_MULT).toHaveLength(CHAPTER_COUNT);
    expect(CHAPTER_HP_MULT[0]).toBeGreaterThanOrEqual(1);
    for (let i = 1; i < CHAPTER_COUNT; i++) expect(CHAPTER_HP_MULT[i]).toBeGreaterThanOrEqual(CHAPTER_HP_MULT[i - 1] as number);
  });

  it('uses the rule time limits for elites and bosses', () => {
    expect([0, 1, 2].map((i) => specialLimit('elite', i))).toEqual([40, 45, 50]);
    expect([0, 1, 2].map((i) => specialLimit('boss', i))).toEqual([50, 55, 60]);
    expect(specialLimit('boss', 7)).toBe(60);
  });
});

describe('wave scripts', () => {
  it('has 24 waves per chapter with the elite / boss rhythm', () => {
    for (let ch = 1; ch <= CHAPTER_COUNT; ch++) {
      const waves = chapterWaves(ch);
      expect(waves).toHaveLength(CHAPTER_WAVES);
      waves.forEach((s, i) => {
        expect(s.wave).toBe(i + 1);
        expect(s.act).toBe(Math.ceil((i + 1) / ACT_LENGTH));
        expect(s.kind).toBe(waveKindOf(i + 1));
        expect(s.boss !== null).toBe(s.kind !== 'normal');
      });
      expect(waves.filter((s) => s.kind === 'elite').map((s) => s.wave)).toEqual([4, 12, 20]);
      expect(waves.filter((s) => s.kind === 'boss').map((s) => s.wave)).toEqual([8, 16, 24]);
    }
  });

  it('ends every boss wave of a chapter with that chapter\'s own boss', () => {
    const bosses = ['boss_vacuum', 'boss_blender', 'boss_bath', 'boss_cloud', 'boss_needle'];
    bosses.forEach((boss, i) => {
      for (const s of chapterWaves(i + 1)) if (s.kind === 'boss') expect(s.boss).toBe(boss);
    });
  });

  it('fills a normal wave with its health budget, a gentler one in the opening waves', () => {
    for (let ch = 1; ch <= CHAPTER_COUNT; ch++) {
      for (const s of chapterWaves(ch)) {
        if (s.kind !== 'normal') continue;
        const budget = entriesBudget(waveEntries(s));
        expect(budget, `ch${ch} w${s.wave}`).toBeGreaterThan(s.budget * 0.8);
        expect(budget, `ch${ch} w${s.wave}`).toBeLessThan(s.budget * 1.25);
        expect(s.budget).toBeLessThanOrEqual(WAVE_BUDGET);
        if (s.wave > 3) expect(s.budget).toBe(WAVE_BUDGET);
      }
    }
  });

  it('never asks for a physical and a magic counter in the same normal wave', () => {
    for (let ch = 1; ch <= CHAPTER_COUNT; ch++) {
      for (const s of chapterWaves(ch)) {
        if (s.kind !== 'normal') continue;
        const ids = s.groups.map((g) => g.enemy);
        expect(ids.includes('roomba') && ids.includes('tangerine'), `ch${ch} w${s.wave}`).toBe(false);
      }
    }
  });

  it('follows a swarm wave with a breather', () => {
    for (let ch = 1; ch <= CHAPTER_COUNT; ch++) {
      const waves = chapterWaves(ch);
      const swarmShare = (i: number): number => {
        const s = waves[i] as (typeof waves)[number];
        const total = s.groups.reduce((a, g) => a + g.weight, 0);
        return s.groups.filter((g) => g.enemy === 'dust').reduce((a, g) => a + g.weight, 0) / total;
      };
      for (let i = 0; i < waves.length - 1; i++) {
        if ((waves[i] as (typeof waves)[number]).kind === 'normal' && swarmShare(i) >= 0.5) {
          expect(swarmShare(i + 1), `ch${ch} wave ${i + 2}`).toBeLessThan(0.5);
        }
      }
    }
  });

  it('introduces at most two new enemy kinds per act', () => {
    for (let ch = 1; ch <= CHAPTER_COUNT; ch++) {
      const seen = new Set<string>();
      for (let act = 1; act <= 6; act++) {
        const fresh = new Set<string>();
        for (const s of chapterWaves(ch).filter((w) => w.act === act)) {
          for (const g of s.groups) if (!seen.has(g.enemy)) fresh.add(g.enemy);
        }
        for (const id of fresh) seen.add(id);
        fresh.delete('cucumber');
        for (const s of chapterWaves(ch).filter((w) => w.act === act)) if (s.boss) seen.add(s.boss);
        expect(fresh.size, `ch${ch} act ${act}`).toBeLessThanOrEqual(2);
      }
    }
  });

  it('lists the elite or boss first in a preview and counts it once', () => {
    const s = scriptFor(1, 8);
    const entries = waveEntries(s);
    expect(entries[0]).toEqual({ enemy: 'boss_vacuum', count: 1 });
    expect(entries.length).toBeGreaterThan(1);
  });

  it('scales counts with the daily count multiplier', () => {
    const s = scriptFor(1, 2);
    const base = waveEntries(s).reduce((a, e) => a + e.count, 0);
    expect(waveEntries(s, 1.5).reduce((a, e) => a + e.count, 0)).toBeGreaterThan(base);
    expect(waveEntries(s, 0.6).reduce((a, e) => a + e.count, 0)).toBeLessThan(base);
  });

  it('repeats acts 3 to 6 in endless mode and keeps elite / boss on every 4th / 8th wave', () => {
    for (let w = 25; w <= 80; w++) {
      const s = scriptFor(1, w);
      expect(s.wave).toBe(w);
      expect(s.kind).toBe(waveKindOf(w));
      expect(s.boss !== null).toBe(s.kind !== 'normal');
    }
    expect(scriptFor(2, 28).kind).toBe('elite');
    expect(scriptFor(2, 32).kind).toBe('boss');
  });

  it('names the traits that open an act, for the counter-toy offer', () => {
    expect(actFeatures(1, 1)).toContain('swarm');
    expect(actFeatures(1, 2)).toEqual(expect.arrayContaining(['fast', 'armored']));
    expect(actFeatures(3, 3)).toContain('hazard');
  });
});

describe('stakes, modifiers and training text', () => {
  it('adds one rule per stake, cumulatively', () => {
    expect(stakeRules(0)).toEqual({ enemyCapCut: 0, actPurr: 2, summonCostMult: 1, bossTimeCut: 0, relicChoices: 3, freeRerolls: 1, specialHpMult: 1 });
    expect(stakeRules(1).enemyCapCut).toBe(STAKE_STEPS.enemyCapCut);
    expect(stakeRules(2).actPurr).toBe(1);
    expect(stakeRules(3).summonCostMult).toBeCloseTo(1.1);
    expect(stakeRules(4).bossTimeCut).toBe(13);
    expect(stakeRules(5)).toEqual({
      enemyCapCut: STAKE_STEPS.enemyCapCut, actPurr: 1, summonCostMult: 1.1, bossTimeCut: 13, relicChoices: 2, freeRerolls: 0,
      specialHpMult: STAKE_STEPS.specialHpMult,
    });
    expect(stakeRules(9)).toEqual(stakeRules(5));
  });

  it('builds the stake and modifier sentences from values', () => {
    for (const lang of LANGS) {
      setLang(lang);
      for (let n = 0; n <= 5; n++) expect(stakeText(n)).not.toMatch(/[{}]|undefined|NaN/);
      for (const id of MODIFIER_IDS) {
        expect(modifierName(id)).not.toBe(`modifier.${id}.name`);
        expect(modifierText(id)).not.toMatch(/[{}]|undefined|NaN/);
      }
    }
    setLang('en');
    expect(stakeText(1)).toContain(String(60 - STAKE_STEPS.enemyCapCut));
  });

  it('turns training levels into bonuses and caps them', () => {
    const b = trainingBonus({ start_fish: 3, kill_fish: 5, damage: 10, boss_time: 2, enemy_cap: 4, start_purr: 6, laser_cd: 2 });
    expect(b).toEqual({ startFish: 15, killFish: 0.1, damage: 0.2, bossTime: 2, enemyCap: 4, startPurr: 2, laserCooldownCut: 0.6 });
    expect(trainingBonus({ damage: 99 }).damage).toBeCloseTo(0.2);
    expect(trainingBonus({}).damage).toBe(0);
    expect(TRAINING_IDS.every((id) => TRAINING[id].cost(1) === 200)).toBe(true);
    expect(TRAINING.damage.cost(2)).toBe(320);
  });
});
