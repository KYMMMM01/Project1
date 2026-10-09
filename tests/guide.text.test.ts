import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { hasString, setLang, t } from '@/core/i18n';
import '@/game/data/strings';
import {
  ACT_LENGTH, AWAKEN_COST, BASE_FISH_PER_SECOND, CHAPTER_WAVES, LASER_COOLDOWN, LASER_DURATION, MOLT_COSTS, OFFER_EVERY, SELL_FISH, START_FISH, SUMMON_BASE, SUMMON_STEP, SUN_CELLS,
} from '@/game/data/balance';
import { SPECIAL_CELL_IDS } from '@/game/api';
import { specialCellName, specialCellText } from '@/game/data/cells';
import { CHAPTERS } from '@/game/data/roster';
import { GOLD_DUNGEON_WAVES } from '@/game/data/goldDungeon';
import { DUNGEON_ENTRY_GEMS, DUNGEON_FREE_ENTRIES, DUNGEON_VICTORY_MULT } from '@/meta/data/dungeon';
import { factsOf, setGuideCell } from '@/guide/facts';
import { EN } from '@/guide/stringsEn';
import { KO } from '@/guide/stringsKo';
import { topicFull, topicTeach, topicTitle } from '@/guide/text';
import { SECTIONS, TOPIC_IDS, TOPICS, topicsOf } from '@/guide/topics';
import { ODDS } from '@/meta/odds';

const slots = (s: string): string[] => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1] as string);

describe('guide topics', () => {
  beforeAll(() => {
    vi.stubGlobal('document', { documentElement: { lang: '' } });
  });
  afterAll(() => {
    setLang('ko');
    vi.unstubAllGlobals();
  });

  it('has unique ids, every section in use, and the whole game covered', () => {
    expect(new Set(TOPIC_IDS).size).toBe(TOPIC_IDS.length);
    for (const s of SECTIONS) expect(topicsOf(s).length, s).toBeGreaterThan(0);
    for (const id of [
      'summon', 'summon_grade', 'pity', 'merge', 'class_lines', 'classes', 'synergy', 'class_sheet', 'class_upgrade', 'pick3', 'purr', 'molt', 'awaken',
      'sell', 'move_swap', 'sun', 'hazards', 'laser', 'call_wave', 'speed', 'toys', 'toy_reroll', 'elite', 'boss', 'lose_gauge', 'lose_boss', 'continue',
      'acts', 'stakes', 'cards', 'wild_cards', 'chests', 'missions', 'daily_chest', 'calendar', 'pass', 'patrol', 'sweep', 'daily_challenge', 'weekly_cup',
      'endless', 'backup_code',
    ] as const) expect(TOPIC_IDS, id).toContain(id);
    for (const trait of ['armored', 'warded', 'fast', 'swarm', 'split', 'haste_aura', 'heal_aura', 'shield', 'weaken']) expect(TOPIC_IDS).toContain(`trait_${trait}`);
  });

  it('has a title, a teaching text and a full text for every topic in both languages', () => {
    for (const lang of ['ko', 'en'] as const) {
      const table = lang === 'ko' ? KO : EN;
      for (const id of TOPIC_IDS) {
        for (const part of ['title', 'teach', 'full']) {
          const key = `guide.${id}.${part}`;
          expect(table[key], `${lang} ${key}`).toBeTruthy();
        }
      }
    }
    for (const key of Object.keys(KO)) expect(EN[key], `en ${key}`).toBeDefined();
    for (const key of Object.keys(EN)) expect(KO[key], `ko ${key}`).toBeDefined();
  });

  it('types no number into a string: every figure is a placeholder', () => {
    const typed: string[] = [];
    for (const [lang, table] of [['ko', KO], ['en', EN]] as const) {
      for (const [key, text] of Object.entries(table)) {
        if (key.startsWith('guide.') && /\d/.test(text.replace(/\{\w+\}/g, ''))) typed.push(`${lang} ${key}`);
      }
    }
    expect(typed).toEqual([]);
  });

  it('resolves every placeholder from the topic facts, and every fact is quoted', () => {
    const problems: string[] = [];
    for (const lang of ['ko', 'en'] as const) {
      setLang(lang);
      const table = lang === 'ko' ? KO : EN;
      for (const id of TOPIC_IDS) {
        const facts = factsOf(id);
        const used = new Set<string>();
        for (const part of ['title', 'teach', 'full']) {
          for (const slot of slots(table[`guide.${id}.${part}`] as string)) {
            used.add(slot);
            if (!(slot in facts)) problems.push(`${lang} ${id}.${part} has no fact {${slot}}`);
          }
        }
        for (const key of Object.keys(facts)) if (!used.has(key)) problems.push(`${lang} ${id} never quotes fact ${key}`);
        const text = [topicTitle(id), topicTeach(id), ...topicFull(id)].join('\n');
        if (/\{\w+\}|undefined|NaN/.test(text)) problems.push(`${lang} ${id} prints a hole`);
      }
    }
    expect(problems).toEqual([]);
  });

  it('keeps the teaching text short enough for a bubble of two lines', () => {
    for (const lang of ['ko', 'en'] as const) {
      setLang(lang);
      const limit = lang === 'ko' ? 40 : 72;
      for (const id of TOPIC_IDS) expect(topicTeach(id).length, `${lang} ${id}: ${topicTeach(id)}`).toBeLessThanOrEqual(limit);
    }
  });

  it('says in the synergy lesson itself that the first rank does not count (v1.4)', () => {
    for (const lang of ['ko', 'en'] as const) {
      setLang(lang);
      expect(topicTeach('synergy'), lang).toContain(t('rarity.common'));
    }
  });

  it('names the molt prices by rank, the awakening price and the fish a second, with the numbers of the data (both languages)', () => {
    for (const lang of ['ko', 'en'] as const) {
      setLang(lang);
      const molt = topicFull('molt').join(' ');
      for (const [i, cost] of MOLT_COSTS.entries()) expect(molt, `${lang} rank ${i}`).toContain(`${t(`rarity.${['common', 'rare', 'epic', 'legendary'][i]}`)} ${cost}`);
      expect(topicFull('awaken').join(' ')).toContain(String(AWAKEN_COST));
      expect(topicFull('purr').join(' ')).toContain(String(AWAKEN_COST));
      expect(topicFull('summon').join(' ')).toContain(String(BASE_FISH_PER_SECOND));
    }
  });

  it('teaches the special cell of the chapter being played and lists all five on the page with their real numbers', () => {
    for (const lang of ['ko', 'en'] as const) {
      setLang(lang);
      for (const id of SPECIAL_CELL_IDS) {
        setGuideCell(id);
        expect(topicTeach('sun'), `${lang} ${id}`).toContain(specialCellName(id));
      }
      setGuideCell('sun');
      const page = topicFull('sun').join(' ');
      for (const c of CHAPTERS) {
        expect(page).toContain(specialCellName(c.cell));
        expect(page).toContain(specialCellText(c.cell));
        expect(page).toContain(t(`chapter.${c.id}.name`));
      }
      expect(page).not.toMatch(/햇살 칸에 고양이를|sunny cell/i);
    }
  });

  it('says that armour break and armour ignore cut the ward as well, on both defence traits', () => {
    for (const lang of ['ko', 'en'] as const) {
      setLang(lang);
      expect(topicFull('trait_warded').join(' ')).toMatch(lang === 'ko' ? /방어 깎기와 방어 무시는 마법 저항도/ : /cut the ward as well/);
      expect(topicFull('trait_armored').join(' ')).toMatch(lang === 'ko' ? /방어 깎기와 방어 무시/ : /armour ignore/i);
    }
  });

  it('says in the laser topic that the dot sticks to an elite or a boss and follows it', () => {
    for (const lang of ['ko', 'en'] as const) {
      setLang(lang);
      const text = topicFull('laser').join(' ');
      expect(text).toMatch(lang === 'ko' ? /따라가요/ : /follows it/);
    }
  });

  it('quotes the numbers of the game data', () => {
    setLang('ko');
    expect(factsOf('gold_dungeon')).toMatchObject({ waves: GOLD_DUNGEON_WAVES, free: DUNGEON_FREE_ENTRIES, gems: DUNGEON_ENTRY_GEMS, win: DUNGEON_VICTORY_MULT });
    expect(factsOf('summon')).toMatchObject({ start: START_FISH, first: SUMMON_BASE, step: SUMMON_STEP, rate: BASE_FISH_PER_SECOND });
    expect(factsOf('sell')).toMatchObject({ f1: SELL_FISH[0], f5: SELL_FISH[4] });
    expect(factsOf('molt')).toMatchObject({ limit: 6 });
    for (const cost of MOLT_COSTS) expect(String(factsOf('molt').prices)).toContain(String(cost));
    expect(factsOf('awaken')).toMatchObject({ cost: AWAKEN_COST });
    expect(factsOf('laser')).toMatchObject({ dur: LASER_DURATION, cd: LASER_COOLDOWN });
    expect(factsOf('sun')).toMatchObject({ cells: SUN_CELLS });
    expect(factsOf('pick3')).toMatchObject({ every: OFFER_EVERY });
    expect(factsOf('acts')).toMatchObject({ actLen: ACT_LENGTH, waves: CHAPTER_WAVES });
    expect(factsOf('chests')).toMatchObject({ goldCards: ODDS.gold.cards, every: ODDS.gold.pity?.every });
    expect(factsOf('elite')).toMatchObject({ first: 4, gap: 8 });
    expect(factsOf('boss')).toMatchObject({ first: 8, gap: 8 });
    expect(topicTeach('pick3')).toContain(String(OFFER_EVERY));
    expect(topicFull('summon').join('')).toContain(String(START_FISH));
  });

  it('names a known section and a real title for every topic', () => {
    for (const topic of TOPICS) {
      expect(SECTIONS).toContain(topic.section);
      expect(hasString(`guide.section.${topic.section}`)).toBe(true);
      expect(t(`guide.${topic.id}.title`)).not.toBe(`guide.${topic.id}.title`);
    }
  });
});
