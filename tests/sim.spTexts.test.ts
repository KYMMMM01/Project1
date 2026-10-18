import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getLang, setLang, t } from '@/core/i18n';
import { SP_SKILL_IDS, UNIT_IDS, type SpSkillId } from '@/game/api';
import { SP_ROWS, SP_UNIT_OF } from '@/game/data/spSkills';
import { spArgs, spArgsOfRow, spDescKey, spGuideFacts, spLaterText, spTexts, spTextsOfUnit } from '@/game/data/spTexts';
import { allUnitDefs, unitDef } from '@/game/data/units';
import { EN } from '@/guide/stringsEn';
import { KO } from '@/guide/stringsKo';
import '@/guide/strings';
import '@/screens/cats/strings';
import '@/view/hud/strings';

/**
 * Step 3, the words (docs/qa/directive_2026-10-13_skills_build.md decisions 29 to 32): one Korean and one English line for each of the twelve
 * skills, with every figure filled from the skill's own row, and the labels around them.
 */

const original = getLang();
const LANGS = ['ko', 'en'] as const;

beforeAll(() => {
  // setLang touches document.documentElement; give the node environment a stand-in.
  (globalThis as { document?: unknown }).document = { documentElement: { lang: '' } };
});

afterAll(() => {
  setLang(original);
});

const slots = (s: string): string[] => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1] as string);
/** The grades' old names (decision 28): never in anything a player reads. */
const OLD_RANK_WORDS = /일반|희귀|영웅|전설|신화|common|rare|epic|legendary|mythic/i;

/** Change one cell of a row; the returned function puts it back. */
function cell<T extends object, K extends keyof T>(row: T, key: K, value: T[K]): () => void {
  const old = row[key];
  row[key] = value;
  return () => {
    row[key] = old;
  };
}

describe('the one line of each skill', () => {
  it('exists for all twelve in both languages, built from the row with no hole left', () => {
    expect(SP_SKILL_IDS).toHaveLength(12);
    for (const lang of LANGS) {
      setLang(lang);
      for (const id of SP_SKILL_IDS) {
        expect(t(spDescKey(id)), `${lang} ${id}`).not.toBe(spDescKey(id));
        const { desc } = spTexts(id);
        expect(desc, `${lang} ${id}`).not.toMatch(/[{}]|undefined|NaN|null/);
        expect(desc.length, `${lang} ${id}`).toBeGreaterThan(20);
      }
    }
  });

  it('types no figure into a text: every number is a placeholder (the rows own them)', () => {
    const keys = [...SP_SKILL_IDS.map(spDescKey), 'sp.label.skill', 'sp.label.ability', 'sp.cooldown', 'sp.auto', 'sp.rank', 'sp.later', 'sp.pick.tip'];
    for (const lang of LANGS) {
      setLang(lang);
      for (const key of keys) {
        const raw = t(key);
        expect(raw, `${lang} ${key}`).not.toBe(key);
        expect(raw.replace(/\{\w+\}/g, ''), `${lang} ${key}`).not.toMatch(/\d/);
      }
    }
  });

  it('quotes exactly the figures its row gives, in both languages (nothing unfilled, nothing given and left unused)', () => {
    for (const lang of LANGS) {
      setLang(lang);
      for (const id of SP_SKILL_IDS) {
        expect([...new Set(slots(t(spDescKey(id))))].sort(), `${lang} ${id}`).toEqual(Object.keys(spArgs(id)).sort());
      }
    }
  });

  it('gives a distance in tiles, the way the passives do, and a share in per cent', () => {
    setLang('ko');
    expect(spArgs('shove')).toEqual({ push: '1.6칸' });
    expect(spArgs('cut')).toEqual({ span: '4.5칸', max: 10, fuse: 1.2 });
    expect(spArgs('charge')).toEqual({ dist: '11칸' });
    expect(spArgs('wanted')).toEqual({ bite: 6, pool: 12 });
    expect(spArgs('knock')).toEqual({ radius: '2.6칸', slowed: 3, frozen: 5 });
    expect(spArgs('meteor')).toEqual({ warn: 1, outer: '2칸', crater: 4 });
    expect(spArgs('lap')).toEqual({ sec: 1.2 });
    expect(spArgs('cloud')).toEqual({ life: 3.2, bolts: 8 });
    expect(spArgs('clones')).toEqual({ clones: 2, throws: 4 });
    expect(spArgs('jam')).toEqual({ notes: 4, fill: 20 });
    expect(spArgs('fish')).toEqual({ flasks: 5, boss: 4, elite: 2.5, bounty: 2 });
    expect(spArgs('capsule')).toEqual({ fish: 1, purr: 2, guardian: '수호신' });
    setLang('en');
    expect(spArgs('shove')).toEqual({ push: '1.6 tiles' });
    expect(spArgs('charge')).toEqual({ dist: '11 tiles' });
    expect(spArgs('capsule')).toEqual({ fish: 1, purr: 2, guardian: 'Guardian' });
  });

  it('builds the arguments from any row of the shape, not only the live one', () => {
    setLang('ko');
    expect(spArgsOfRow({ ...SP_ROWS.shove, push: 300 })).toEqual({ push: '3칸' });
    expect(spArgsOfRow(SP_ROWS.cut)).toEqual(spArgs('cut'));
    expect(SP_ROWS.shove.push).toBe(160);
  });

  /** Each case changes one cell of a row and says what the line must then say (the figure is read from the row, not typed in the text). */
  const CASES: Array<{ id: SpSkillId; change: () => () => void; ko: string; en: string }> = [
    { id: 'shove', change: () => cell(SP_ROWS.shove, 'push', 300), ko: '3칸 밀려나요', en: 'slide 3 tiles back' },
    { id: 'cut', change: () => cell(SP_ROWS.cut, 'half', 300), ko: '길 6칸 안', en: 'along 6 tiles of road' },
    { id: 'cut', change: () => cell(SP_ROWS.cut, 'max', 8), ko: '최대 8마리', en: 'up to 8 enemies' },
    { id: 'cut', change: () => cell(SP_ROWS.cut, 'fuse', 2), ko: '2초 뒤', en: '2 s later' },
    { id: 'charge', change: () => cell(SP_ROWS.charge, 'dist', 900), ko: '길을 9칸 거슬러', en: 'charges 9 tiles' },
    { id: 'clones', change: () => cell(SP_ROWS.clones, 'clones', 3), ko: '분신 3마리', en: '3 clones' },
    { id: 'clones', change: () => cell(SP_ROWS.clones, 'throws', 5), ko: '5번 던지면', en: 'After 5 throws' },
    { id: 'wanted', change: () => cell(SP_ROWS.wanted, 'bite', 0.08), ko: '체력의 8%', en: 'Takes 8% of' },
    { id: 'wanted', change: () => cell(SP_ROWS.wanted, 'pool', 0.16), ko: '한 마리당 16%까지', en: 'up to 16% each' },
    { id: 'lap', change: () => cell(SP_ROWS.lap, 'speed', 1000), ko: '한 바퀴(2.4초)', en: 'in 2.4 s' },
    { id: 'cloud', change: () => cell(SP_ROWS.cloud, 'life', 4.8), ko: '4.8초 동안 번개를 12번', en: 'for 4.8 s, dropping 12 bolts' },
    { id: 'knock', change: () => cell(SP_ROWS.knock, 'radius', 300), ko: '파편이 3칸 안', en: 'within 3 tiles' },
    { id: 'knock', change: () => cell(SP_ROWS.knock, 'slowed', 2), ko: '느린 적 2배', en: 'for 2x or 5x' },
    { id: 'knock', change: () => cell(SP_ROWS.knock, 'frozen', 4), ko: '언 적 4배', en: 'for 3x or 4x' },
    { id: 'meteor', change: () => cell(SP_ROWS.meteor, 'warn', 1.5), ko: '1.5초 동안 자라난', en: 'grows for 1.5 s' },
    { id: 'meteor', change: () => cell(SP_ROWS.meteor.outer, 'radius', 300), ko: '3칸 안을 때리고', en: 'all within 3 tiles' },
    { id: 'meteor', change: () => cell(SP_ROWS.meteor.crater, 'life', 6), ko: '6초 동안 타올라요', en: 'burning for 6 s' },
    { id: 'jam', change: () => cell(SP_ROWS.jam, 'targets', 3), ko: '음표 3개', en: 'Sends out 3 golden notes' },
    { id: 'jam', change: () => cell(SP_ROWS.jam, 'fill', 0.25), ko: '그 동그라미를 25% 채워요', en: 'fills 25% of the emptiest' },
    { id: 'fish', change: () => cell(SP_ROWS.fish.fishTime, 'boss', 5), ko: '보스 5초', en: 'boss 5 s' },
    { id: 'fish', change: () => cell(SP_ROWS.fish.fishTime, 'elite', 3), ko: '정예 3초', en: 'elite 3 s' },
    { id: 'fish', change: () => cell(SP_ROWS.fish.smallTargets, 'withBig', 5), ko: '플라스크 6개를 던져요', en: 'Throws 6 flasks' },
    { id: 'fish', change: () => cell(SP_ROWS.fish, 'big', 2), ko: '플라스크 6개를 던져요', en: 'Throws 6 flasks' },
    { id: 'fish', change: () => cell(SP_ROWS.fish, 'bounty', 3), ko: '보상은 3배', en: 'paying 3x the reward' },
    { id: 'capsule', change: () => cell(SP_ROWS.capsule, 'fish', 2), ko: '소환 2번 값', en: '(2x a summon' },
    { id: 'capsule', change: () => cell(SP_ROWS.capsule, 'purr', 3), ko: '골골 +3', en: '+3 purr' },
  ];

  it('changes with the row: a number retuned in a row is a different number in the line, in both languages', () => {
    for (const c of CASES) {
      for (const lang of LANGS) {
        setLang(lang);
        const before = spTexts(c.id).desc;
        const undo = c.change();
        try {
          expect(spTexts(c.id).desc, `${lang} ${c.id} ${c.ko}`).toContain(c[lang]);
          expect(spTexts(c.id).desc, `${lang} ${c.id}`).not.toBe(before);
        } finally {
          undo();
        }
        expect(spTexts(c.id).desc, `${lang} ${c.id} restored`).toBe(before);
      }
    }
  });

  it('has a case for every skill', () => {
    const covered = new Set(CASES.map((c) => c.id));
    for (const id of SP_SKILL_IDS) expect(covered.has(id), id).toBe(true);
  });

  it('says what the owner asked it to say', () => {
    setLang('ko');
    expect(spTexts('charge').desc).toContain('가장 많이 몰린');
    expect(spTexts('capsule').desc).toMatch(/복고양이가 여럿이어도 동그라미는 같이 써요/);
    expect(spTexts('wanted').desc).toContain('보스·정예 웨이브 전에는 총을 아껴요');
    expect(spTexts('shove').desc).toContain('보스·정예는 조금만 밀려요');
    setLang('en');
    expect(spTexts('charge').desc).toContain('where enemies are thickest');
    expect(spTexts('capsule').desc).toContain('Several lucky cats share one ring');
    expect(spTexts('wanted').desc).toContain('Holds its fire before a boss or elite wave');
    expect(spTexts('shove').desc).toContain('Bosses and elites hardly budge');
  });

  it('names the six prizes of the capsule in plain words, as many as the odds row has', () => {
    expect(Object.keys(SP_ROWS.capsule.weights)).toHaveLength(6);
    const prizes = {
      ko: ['생선', '골골', '짝꿍 고양이', '한 번 더', '장난감', '수호신 각성'],
      en: ['fish', 'purr', 'buddy cat', 'one more capsule', 'toy', 'Guardian awakening'],
    } as const;
    for (const lang of LANGS) {
      setLang(lang);
      for (const word of prizes[lang]) expect(spTexts('capsule').desc, `${lang} ${word}`).toContain(word);
    }
  });

  it('fits where it is shown: no line is longer than the longest ordinary line of a cat (99 characters in Korean, 183 in English today)', () => {
    const limit = { ko: { line: 95, capsule: 100 }, en: { line: 175, capsule: 175 } } as const;
    for (const lang of LANGS) {
      setLang(lang);
      const longestPassive = Math.max(...allUnitDefs().map((d) => d.skillText().length));
      expect(longestPassive, lang).toBeGreaterThan(90);
      for (const id of SP_SKILL_IDS) {
        const max = id === 'capsule' ? limit[lang].capsule : limit[lang].line;
        expect(spTexts(id).desc.length, `${lang} ${id}`).toBeLessThanOrEqual(max);
        expect(spTexts(id).desc.length, `${lang} ${id} against the longest passive`).toBeLessThanOrEqual(longestPassive);
      }
    }
  });

  it('uses no internal term a player would not know, and none of the old grade names', () => {
    const banned = { ko: /대상|광역|연쇄|반경|게이지|쿨타임|SP/, en: /radius|\bpx\b|gauge|cooldown|\bSP\b|\btargets?\b/i } as const;
    for (const lang of LANGS) {
      setLang(lang);
      for (const id of SP_SKILL_IDS) {
        const x = spTexts(id);
        for (const text of [x.desc, x.cooldown, x.auto, x.rank, x.head, x.meta, x.bubble, spLaterText()]) {
          expect(text, `${lang} ${id}: ${text}`).not.toMatch(OLD_RANK_WORDS);
          expect(text, `${lang} ${id}: ${text}`).not.toMatch(banned[lang]);
        }
      }
    }
  });
});

describe('the words around a skill', () => {
  it('has the labels: Skill is the new thing, the ordinary line stays 특기 in Korean and becomes Ability in English', () => {
    setLang('ko');
    expect(t('sp.label.skill')).toBe('스킬');
    expect(t('sp.label.ability')).toBe('특기');
    expect(t('sp.cooldown', { s: 12 })).toBe('12초마다');
    expect(t('sp.auto')).toBe('저절로 써요');
    setLang('en');
    expect(t('sp.label.skill')).toBe('Skill');
    expect(t('sp.label.ability')).toBe('Ability');
    expect(t('sp.cooldown', { s: 12 })).toBe('every 12 s');
    expect(t('sp.auto')).toBe('casts itself');
  });

  it('leaves today\'s labels alone, because with skills off every screen is exactly today\'s', () => {
    setLang('ko');
    expect(t('cats.unit.skill')).toBe('특기');
    expect(t('hud.pick.tip')).toBe('꾹 누르면 능력이 보여요');
    setLang('en');
    expect(t('cats.unit.skill')).toBe('Skill');
    expect(t('hud.pick.tip')).toBe('Hold a card to see its skill');
  });

  it('shows the cooldown of the row for every skill, and the five the owner settled', () => {
    expect(SP_ROWS.shove.cooldown).toBe(12);
    expect(SP_ROWS.lap.cooldown).toBe(26);
    expect(SP_ROWS.cut.cooldown).toBe(20);
    expect(SP_ROWS.knock.cooldown).toBe(20);
    expect(SP_ROWS.charge.cooldown).toBe(30);
    for (const lang of LANGS) {
      setLang(lang);
      for (const id of SP_SKILL_IDS) {
        const x = spTexts(id);
        expect(x.cooldown, `${lang} ${id}`).toContain(String(SP_ROWS[id].cooldown));
        expect(x.bubble, `${lang} ${id}`).toContain(x.cooldown);
        expect(x.meta, `${lang} ${id}`).toBe(`${x.cooldown} · ${x.auto}`);
      }
      expect(spTexts('shove').cooldown).toContain('12');
      expect(spTexts('lap').cooldown).toContain('26');
      expect(spTexts('cut').cooldown).toContain('20');
      expect(spTexts('knock').cooldown).toContain('20');
      expect(spTexts('charge').cooldown).toContain('30');
    }
    const undo = cell(SP_ROWS.shove, 'cooldown', 15);
    try {
      setLang('ko');
      expect(spTexts('shove').cooldown).toBe('15초마다');
    } finally {
      undo();
    }
  });

  it('puts the name, how often it casts (and that it casts itself) and the line in a bubble after the ordinary line, one under the other', () => {
    setLang('ko');
    const x = spTexts('shove');
    expect(x.head).toBe('스킬 · 방패 밀치기');
    expect(x.bubble).toBe(`스킬 · 방패 밀치기\n12초마다 · 저절로 써요\n${x.desc}`);
    setLang('en');
    expect(spTexts('shove').bubble).toBe(`Skill · Shield Shove\nevery 12 s · casts itself\n${spTexts('shove').desc}`);
  });

  it('names the rank a skill comes with by the game\'s own words only (Alley Boss, King, Guardian)', () => {
    setLang('ko');
    expect(spTexts('shove').rank).toBe('골목대장 스킬');
    expect(spTexts('cut').rank).toBe('대왕 스킬');
    expect(spTexts('charge').rank).toBe('수호신 스킬');
    expect(spLaterText()).toBe('골목대장부터 스킬이 생겨요');
    setLang('en');
    expect(spTexts('shove').rank).toBe('Alley Boss skill');
    expect(spTexts('cut').rank).toBe('King skill');
    expect(spTexts('charge').rank).toBe('Guardian skill');
    expect(spLaterText()).toBe('Gets a skill at Alley Boss');
    for (const id of SP_SKILL_IDS) expect([3, 4, 5]).toContain(SP_ROWS[id].rank);
  });

  it('finds the words of the skill a cat has, and null for a cat without one', () => {
    setLang('ko');
    const withSkill = UNIT_IDS.filter((id) => unitDef(id).spSkill);
    expect(withSkill).toHaveLength(12);
    for (const id of withSkill) {
      const x = spTextsOfUnit(id);
      expect(x, id).not.toBeNull();
      expect(x?.id, id).toBe(unitDef(id).spSkill?.id);
      expect(SP_UNIT_OF[x?.id as SpSkillId], id).toBe(id);
      expect(x?.name, id).toBe(t(unitDef(id).spSkill?.nameKey as string));
    }
    for (const id of UNIT_IDS.filter((u) => !unitDef(u).spSkill)) expect(spTextsOfUnit(id), id).toBeNull();
    expect(spTextsOfUnit('w_paw')).toBeNull();
    expect(spTextsOfUnit('w_viking')?.desc).toBe(spTexts('shove').desc);
  });
});

describe('the guide topic and the lesson', () => {
  const PARTS = ['title', 'teach', 'full'] as const;

  it('is in both languages, all three parts, with the same keys', () => {
    for (const part of PARTS) {
      expect(KO[`guide.sp_skill.${part}`], `ko ${part}`).toBeTruthy();
      expect(EN[`guide.sp_skill.${part}`], `en ${part}`).toBeTruthy();
    }
  });

  it('takes its figures and rank names from spGuideFacts, all of them quoted, none missing, none typed', () => {
    const facts = spGuideFacts();
    for (const [lang, table] of [['ko', KO], ['en', EN]] as const) {
      setLang(lang);
      const used = new Set<string>();
      for (const part of PARTS) {
        const raw = table[`guide.sp_skill.${part}`] as string;
        for (const slot of slots(raw)) {
          used.add(slot);
          expect(slot in spGuideFacts(), `${lang} ${part} {${slot}}`).toBe(true);
        }
        expect(raw.replace(/\{\w+\}/g, ''), `${lang} ${part}`).not.toMatch(/\d/);
        expect(t(`guide.sp_skill.${part}`, facts), `${lang} ${part}`).not.toMatch(/[{}]|undefined|NaN/);
      }
      expect([...used].sort(), lang).toEqual(Object.keys(facts).sort());
    }
  });

  it('tells the lesson the way the directive words it, and keeps it to two short lines like every other lesson', () => {
    setLang('ko');
    expect(t('guide.sp_skill.teach', spGuideFacts())).toBe('고양이 옆 동그라미가 가득 차면 스킬을 써요. 누르지 않아도 돼요.');
    for (const lang of LANGS) {
      setLang(lang);
      expect(t('guide.sp_skill.teach', spGuideFacts()).length, lang).toBeLessThanOrEqual(lang === 'ko' ? 40 : 72);
      expect(t('guide.sp_skill.title', spGuideFacts()).length, lang).toBeLessThanOrEqual(24);
    }
  });

  it('teaches the ring: it fills, a full ring waits for a target and casts by itself, the cats from Alley Boss up have one, it goes along when moved and starts at half when merged', () => {
    setLang('ko');
    const facts = spGuideFacts();
    expect(facts).toMatchObject({ rank: '골목대장', below: '꼬마 · 동네', merge: 50, cosmo: '우주냥' });
    const ko = t('guide.sp_skill.full', facts);
    for (const part of ['골목대장 이상', '차오르다가', '가득 찬 채로 기다렸다가', '저절로', '옮기거나 자리를 바꾸면', '50%에서 시작', '꼬마 · 동네']) expect(ko, part).toContain(part);
    expect(ko.split('\n').length).toBeGreaterThanOrEqual(5);
    setLang('en');
    const en = t('guide.sp_skill.full', spGuideFacts());
    for (const part of ['Cats from Alley Boss up', 'fills bit by bit', 'waits, full', 'by themselves', 'move or swap', 'starts at 50%', 'Kitten · Street']) expect(en, part).toContain(part);
    expect(en.split('\n').length).toBeGreaterThanOrEqual(5);
    expect(en).toContain('Cosmo Cat');
  });

  it('uses only the game\'s own rank words', () => {
    for (const lang of LANGS) {
      setLang(lang);
      for (const part of PARTS) expect(t(`guide.sp_skill.${part}`, spGuideFacts()), `${lang} ${part}`).not.toMatch(OLD_RANK_WORDS);
    }
  });
});

describe('the game\'s rank words in a text that is not about skills', () => {
  it('names the cat the tunnel toy brings (a rank 1 cat) by the game\'s own word, never "일반" or "common" (decision 28)', () => {
    for (const lang of LANGS) {
      setLang(lang);
      const text = t('relic.cat_tunnel.desc', { a: 3 });
      expect(text, lang).toContain(t('rarity.common'));
      expect(text, lang).not.toMatch(OLD_RANK_WORDS);
    }
  });
});
