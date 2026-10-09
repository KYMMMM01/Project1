/**
 * What the player is told about the 2026-10-10 enemy numbers: the "slow resistance" row on a codex monster page, the same figure on
 * the list row, the line in the battle's enemy bubble, the guidebook sentence, and the "open" tip that must still read sensibly.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { setLang, t } from '@/core/i18n';
import { ENEMY_IDS, type EnemyId } from '@/game/api';
import { ENEMY_SPECS } from '@/game/data/enemies';
import '@/game/data/strings';
import { FOE_IDS, foeRank, foeStats, tipsOf, type Level } from '@/codex/foes';
import { foeItem, foePage } from '@/codex/foeText';
import { topicFull } from '@/guide/text';
import { enemyInfo } from '@/view/hud/enemyInfo';

const LEVELS: Level[] = [{ chapter: 1, stake: 0 }, { chapter: 3, stake: 2 }, { chapter: 5, stake: 5 }];
const PCT: Partial<Record<EnemyId, number>> = { drop: 30, clock: 30, roomba: 20 };

beforeAll(() => {
  vi.stubGlobal('document', { documentElement: { lang: '' } });
});
afterAll(() => {
  setLang('ko');
  vi.unstubAllGlobals();
});

describe('the codex monster page: slow resistance', () => {
  for (const lang of ['ko', 'en'] as const) {
    it(`has a "${lang === 'ko' ? '둔화 저항' : 'Slow resistance'}" row for every enemy, 0% included, right after armour and ward and without a bar (${lang})`, () => {
      setLang(lang);
      const label = lang === 'ko' ? '둔화 저항' : 'Slow resistance';
      for (const id of FOE_IDS) {
        const rows = foePage(id, LEVELS[0] as Level).stats;
        const labels = rows.map((r) => r.label);
        const armor = labels.indexOf(t('codex.stat.armor'));
        expect(armor, id).toBeGreaterThanOrEqual(0);
        expect(labels[armor + 1], id).toBe(t('codex.stat.ward'));
        expect(labels[armor + 2], id).toBe(label);
        const row = rows[armor + 2];
        expect(row?.value, id).toBe(`${PCT[id] ?? 0}%`);
        expect(row?.bar, id).toBeUndefined();
        expect(foeStats(id).slowResistPct, id).toBe(PCT[id] ?? 0);
      }
    });

    it(`gives the list row a second line for the enemies that resist slows, and none for the others, at every level (${lang})`, () => {
      setLang(lang);
      for (const id of FOE_IDS) {
        for (const level of LEVELS) {
          const lines = foeItem(id, level).line.split('\n');
          const pct = PCT[id] ?? 0;
          expect(lines.length, `${id} ${level.chapter}/${level.stake}`).toBe(pct > 0 ? 2 : 1);
          if (pct > 0) expect(lines[1], id).toBe(lang === 'ko' ? `둔화 저항 ${pct}%` : `Slow resistance ${pct}%`);
          expect(lines[0], id).not.toMatch(lang === 'ko' ? /둔화/ : /Slow/);
          expect(lines.join(' '), id).not.toMatch(/\{\w+\}|undefined|NaN/);
        }
      }
    });
  }

  it('prints the exact strings for the three enemies that have some', () => {
    setLang('ko');
    expect(foeItem('drop', LEVELS[0] as Level).line).toMatch(/방어 5% · 저항 0%\n둔화 저항 30%$/);
    expect(foeItem('clock', LEVELS[0] as Level).line).toMatch(/방어 10% · 저항 0%\n둔화 저항 30%$/);
    expect(foeItem('roomba', LEVELS[0] as Level).line).toMatch(/방어 35% · 저항 0%\n둔화 저항 20%$/);
    expect(foeItem('cucumber', LEVELS[0] as Level).line).toMatch(/방어 8% · 저항 0%$/);
    setLang('en');
    expect(foeItem('drop', LEVELS[0] as Level).line).toMatch(/Armour 5% · Ward 0%\nSlow resistance 30%$/);
    expect(foeItem('roomba', LEVELS[0] as Level).line).toMatch(/Armour 35% · Ward 0%\nSlow resistance 20%$/);
    expect(foePage('drop', LEVELS[0] as Level).stats.find((r) => r.label === 'Slow resistance')?.value).toBe('30%');
  });

  it('shows the armour of the ordinary enemies on the page and on its bar', () => {
    setLang('ko');
    for (const id of FOE_IDS.filter((x) => foeRank(x) === 'normal')) {
      const page = foePage(id, LEVELS[0] as Level);
      expect(page.armorPct, id).toBe(Math.round(ENEMY_SPECS[id].armor * 100));
      expect(page.armorPct, id).toBeGreaterThanOrEqual(5);
      expect(page.stats.find((r) => r.label === t('codex.stat.armor'))?.bar?.pct, id).toBe(page.armorPct);
    }
    expect(foePage('cucumber', LEVELS[0] as Level).stats.find((r) => r.label === t('codex.stat.armor'))?.value).toBe('8%');
  });
});

describe('the codex tips with the new armour numbers', () => {
  it('gives an ordinary enemy no tip at all, so a 5 to 10% armour never reads as "armoured"', () => {
    for (const id of FOE_IDS.filter((x) => foeRank(x) === 'normal')) expect(tipsOf(id, LEVELS[0] as Level), id).toEqual([]);
  });

  it('keeps the elite and boss tips as they were: armour tip at 25% and up only, "open" for the rest', () => {
    const open = (id: EnemyId): boolean => tipsOf(id, LEVELS[0] as Level).some((tip) => tip.kind === 'open');
    const armoured = (id: EnemyId): boolean => tipsOf(id, LEVELS[0] as Level).some((tip) => tip.kind === 'armor');
    expect(open('firecracker')).toBe(true);
    expect(open('boss_cucumber')).toBe(true);
    expect(open('spray')).toBe(true);
    expect(open('boss_vacuum')).toBe(false);
    expect(armoured('boss_vacuum')).toBe(true);
    expect(armoured('spray')).toBe(false);
    expect(armoured('boss_cucumber')).toBe(false);
  });

  for (const lang of ['ko', 'en'] as const) {
    it(`reads sensibly with a one-digit armour (${lang})`, () => {
      setLang(lang);
      const text = t('codex.tip.open', { armor: 8, ward: 0 });
      expect(text).toContain('8%');
      expect(text).toContain('0%');
      expect(text).not.toMatch(/\{\w+\}|undefined|NaN/);
    });
  }
});

describe('the battle bubble of an enemy', () => {
  const lines = (id: EnemyId): string[] => enemyInfo(id, () => undefined).text.split('\n');

  it('prints the armour and ward line of an enemy that has armour only, and a slow resistance line when there is some', () => {
    setLang('ko');
    expect(lines('cucumber')).toContain('방어 8% · 저항 0%');
    expect(lines('cucumber').some((l) => l.includes('둔화 저항'))).toBe(false);
    expect(lines('drop')).toContain('방어 5% · 저항 0%');
    expect(lines('drop')).toContain('둔화 저항 30%');
    expect(lines('clock')).toContain('방어 10% · 저항 0%');
    expect(lines('clock')).toContain('둔화 저항 30%');
    expect(lines('roomba')).toContain('방어 35% · 저항 0%');
    expect(lines('roomba')).toContain('둔화 저항 20%');
    setLang('en');
    expect(lines('drop')).toContain('Armour 5% · Ward 0%');
    expect(lines('drop')).toContain('Slow resistance 30%');
    expect(lines('roomba')).toContain('Slow resistance 20%');
    expect(lines('cucumber').some((l) => l.includes('Slow resistance'))).toBe(false);
  });

  it('puts the slow resistance line straight after the defence line and before the traits', () => {
    for (const lang of ['ko', 'en'] as const) {
      setLang(lang);
      const all = lines('drop');
      const def = all.findIndex((l) => l.includes(lang === 'ko' ? '방어 5%' : 'Armour 5%'));
      expect(def).toBeGreaterThan(0);
      expect(all[def + 1]).toBe(lang === 'ko' ? '둔화 저항 30%' : 'Slow resistance 30%');
    }
  });

  it('leaves the elites and bosses with their old defence line and no slow line, and a bare enemy with neither', () => {
    setLang('ko');
    expect(lines('boss_vacuum')).toContain('방어 35% · 저항 10%');
    expect(lines('spray')).toContain('방어 20% · 저항 20%');
    for (const id of ['boss_vacuum', 'spray', 'boss_needle']) expect(lines(id as EnemyId).some((l) => l.includes('둔화 저항')), id).toBe(false);
    expect(lines('firecracker').some((l) => l.includes('방어') || l.includes('둔화 저항'))).toBe(false);
  });

  it('prints a slow resistance line exactly for the enemies that have one', () => {
    setLang('ko');
    for (const id of ENEMY_IDS) {
      const has = lines(id).some((l) => l.startsWith('둔화 저항'));
      expect(has, id).toBe(ENEMY_SPECS[id].slowResist > 0);
    }
  });

  it('never tells the player that slows work well on an enemy that shrugs off part of them (the drop\'s fast trait used to)', () => {
    for (const lang of ['ko', 'en'] as const) {
      setLang(lang);
      for (const id of ENEMY_IDS) {
        if (ENEMY_SPECS[id].slowResist <= 0) continue;
        const text = enemyInfo(id, () => undefined).text;
        expect(text, `${id} ${lang}`).not.toMatch(lang === 'ko' ? /둔화가 잘 통해요/ : /Slows work well/);
      }
    }
    setLang('ko');
    expect(lines('drop')).toContain('신속: 빠르게 움직여요. 둔화가 조금 덜 통해요.');
    setLang('en');
    expect(lines('drop')).toContain('Fast: Moves quickly. Slows work a little less well.');
  });
});

describe('the guidebook', () => {
  it('says in the fast-enemy topic that some enemies shrug off part of a slow and that the codex shows the number', () => {
    setLang('ko');
    const ko = topicFull('trait_fast').join(' ');
    expect(ko).toContain('일부 적은 느려지는 효과를 조금 버티는데, 그 수치는 도감에서 볼 수 있어요.');
    setLang('en');
    const en = topicFull('trait_fast').join(' ');
    expect(en).toContain('Some enemies shrug off part of a slow, and the codex shows how much.');
  });
});
