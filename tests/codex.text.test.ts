import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { setLang, t } from '@/core/i18n';
import { RELIC_IDS, SPECIAL_CELL_IDS } from '@/game/api';
import {
  DODGE_CAP, ENEMY_CAP, HAZARD_RECOVER, HAZARD_WARNING, OVERFLOW_GRACE, SUN_CELLS, SLOW_CAP_BOSS,
} from '@/game/data/balance';
import { BOSS_SPECS, ENEMY_SPECS } from '@/game/data/enemies';
import { relicDef, relicSpec } from '@/game/data/relics';
import { stakeRules } from '@/game/data/stakes';
import { unitSpec } from '@/game/data/units';
import { CELL_COUNT, COLS, ROWS, PATH_LENGTH, isEdgeCell, pathPoint } from '@/game/geometry';
import '@/game/data/strings';
import { CELL_KINDS, auraBoard, cellBoard, laneDiagram, toyBoard } from '@/codex/boards';
import { CELL_GROUPS, bellDodgePct, cellFacts } from '@/codex/cells';
import { cellPage, cellTextKey } from '@/codex/cellText';
import { FOE_IDS, abilitiesOf, foeRank, healthSpan, targetRows, type Level } from '@/codex/foes';
import { basisText, exact, foeItem, foePage, plain, waveText } from '@/codex/foeText';
import { EN } from '@/codex/stringsEn';
import { KO } from '@/codex/stringsKo';
import { TOY_FILTERS, TOY_RARITIES, toyItem, toysFor } from '@/codex/toys';

const slots = (s: string): string[] => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1] as string);
const holes = (s: string): boolean => /\{\w+\}|undefined|NaN|\[object/.test(s);

const LEVELS: Level[] = [];
for (let chapter = 1; chapter <= 5; chapter++) for (let stake = 0; stake <= 5; stake++) LEVELS.push({ chapter, stake });

beforeAll(() => {
  vi.stubGlobal('document', { documentElement: { lang: '' } });
});
afterAll(() => {
  setLang('ko');
  vi.unstubAllGlobals();
});

describe('codex strings', () => {
  it('has the same keys in Korean and English', () => {
    expect(Object.keys(EN).sort()).toEqual(Object.keys(KO).sort());
  });

  it('types no number into a string: every figure is a placeholder', () => {
    const typed: string[] = [];
    for (const [lang, table] of [['ko', KO], ['en', EN]] as const) {
      for (const [key, text] of Object.entries(table)) if (/\d/.test(text.replace(/\{\w+\}/g, ''))) typed.push(`${lang} ${key}`);
    }
    expect(typed).toEqual([]);
  });
});

describe('codex monster pages quote the data', () => {
  for (const lang of ['ko', 'en'] as const) {
    it(`prints no hole in any list line or page (${lang})`, () => {
      setLang(lang);
      const bad: string[] = [];
      for (const id of FOE_IDS) {
        for (const level of LEVELS) {
          const item = foeItem(id, level);
          const page = foePage(id, level);
          const text = [
            item.name, item.line, ...item.traits, page.flavour, ...page.traits.flatMap((x) => [x.name, x.text]), ...page.stats.flatMap((r) => [r.label, r.value, r.note ?? '']),
            ...page.appears.flatMap((r) => [r.label, r.value]), ...page.abilities.flatMap((a) => [a.name, a.text]),
            ...(page.special ? [
              ...page.special.waves.flatMap((w) => [w.head, ...w.lines]), page.special.imaginedNote ?? '', page.special.toyNote, page.special.rule,
              ...page.special.control.flatMap((r) => [r.label, r.value]), ...page.special.tips,
            ] : []),
          ].join('\n');
          if (holes(text)) bad.push(`${lang} ${id} ${level.chapter}/${level.stake}`);
        }
      }
      expect(bad).toEqual([]);
    });
  }

  it('shows the health, the limit and the allowance of every elite and boss wave at every level', () => {
    for (const lang of ['ko', 'en'] as const) {
      setLang(lang);
      for (const id of FOE_IDS.filter((x) => foeRank(x) !== 'normal')) {
        for (const level of LEVELS) {
          const rows = targetRows(id, level);
          const page = foePage(id, level);
          expect(page.special?.waves, `${id} ${level.chapter}/${level.stake}`).toHaveLength(rows.length);
          rows.forEach((row, i) => {
            const block = page.special?.waves[i];
            expect(block?.lines[0]).toContain(exact(row.hp));
            expect(block?.lines[0]).toContain(plain(row.times));
            expect(block?.lines[1]).toContain(`${row.limit}`);
            if (row.cut > 0) expect(block?.lines[1]).toContain(`${row.limitBase}`);
            expect(block?.lines[2]).toContain(exact(row.cap.perSecond));
            expect(block?.head).toContain(`${row.wave}`);
          });
          const first = rows[0];
          expect(page.special?.rule).toContain(plain(first?.cap.minSeconds ?? 0));
          expect(page.special?.rule).toContain(plain(first?.cap.percent ?? 0));
        }
      }
    }
  });

  it('shows the health, the speed, armour and ward of an ordinary enemy as the data has them, the multiple only as a side fact', () => {
    setLang('ko');
    for (const id of FOE_IDS.filter((x) => foeRank(x) === 'normal')) {
      const spec = ENEMY_SPECS[id];
      const page = foePage(id, { chapter: 1, stake: 0 });
      const values = Object.fromEntries(page.stats.map((r) => [r.label, r.value]));
      expect(values[t('codex.stat.hpMult')], id).toContain(plain(spec.hpMult));
      const labels = page.stats.map((r) => r.label);
      expect(labels.indexOf(t('codex.stat.hp')), id).toBeLessThan(labels.indexOf(t('codex.stat.hpMult')));
      expect(values[t('codex.stat.speed')], id).toContain(String(spec.speed));
      expect(values[t('codex.stat.armor')], id).toBe(`${Math.round(spec.armor * 100)}%`);
      expect(values[t('codex.stat.ward')], id).toBe(`${Math.round(spec.ward * 100)}%`);
      expect(page.armorPct).toBe(Math.round(spec.armor * 100));
      expect(page.wardPct).toBe(Math.round(spec.ward * 100));
    }
  });

  for (const lang of ['ko', 'en'] as const) {
    it(`lists an ordinary enemy by its real health at the chosen chapter and butler level, not by a multiple (${lang})`, () => {
      setLang(lang);
      for (const id of FOE_IDS.filter((x) => foeRank(x) === 'normal')) {
        for (const level of LEVELS) {
          const line = foeItem(id, level).line;
          const health = healthSpan(id, level);
          if (!health) {
            expect(line, `${id} ${level.chapter}`).toContain(t('codex.row.normal.none', { speed: ENEMY_SPECS[id].speed, armor: Math.round(ENEMY_SPECS[id].armor * 100), ward: Math.round(ENEMY_SPECS[id].ward * 100) }));
            continue;
          }
          expect(line, `${id} ${level.chapter}/${level.stake}`).toContain(exact(health.first.hp));
          if (health.first.hp !== health.last.hp) expect(line).toContain(exact(health.last.hp));
          expect(line).not.toMatch(/[×x]\s?\d/);
        }
      }
    });
  }

  it('lists the health of a cucumber as the first and last wave it walks in', () => {
    setLang('ko');
    const level = { chapter: 2, stake: 3 };
    const health = healthSpan('cucumber', level);
    expect(health).not.toBeNull();
    const line = foeItem('cucumber', level).line;
    expect(line).toContain(`${exact(health?.first.hp ?? 0)} ~ ${exact(health?.last.hp ?? 0)}`);
    const other = foeItem('cucumber', { chapter: 5, stake: 3 }).line;
    expect(other).not.toBe(line);
  });

  it('says in the armour and ward tips that armour break and armour ignore cut the ward as well, in both languages', () => {
    for (const lang of ['ko', 'en'] as const) {
      setLang(lang);
      const armoured = foePage('boss_vacuum', { chapter: 1, stake: 0 }).special?.tips ?? [];
      const warded = foePage('boss_cloud', { chapter: 1, stake: 0 }).special?.tips ?? [];
      expect(armoured.join(' ')).toMatch(lang === 'ko' ? /마법 저항도 같이 줄여요/ : /cut the ward too/);
      expect(warded.join(' ')).toMatch(lang === 'ko' ? /마법 저항도 줄여요/ : /cut the ward too/);
    }
  });

  it('changes the printed health when the chapter or the butler level changes', () => {
    setLang('ko');
    const at = (chapter: number, stake: number): string => (foePage('boss_vacuum', { chapter, stake }).special?.waves[0]?.lines[0] ?? '');
    expect(at(1, 0)).not.toBe(at(2, 0));
    expect(at(1, 0)).not.toBe(at(1, 5));
    expect(at(1, 4)).toBe(at(1, 0));
    const limit = (stake: number): string => (foePage('boss_vacuum', { chapter: 1, stake }).special?.waves[0]?.lines[1] ?? '');
    expect(limit(3)).not.toBe(limit(4));
    expect(limit(0)).toBe(limit(3));
  });

  it('prints every number of an ability that the data has', () => {
    for (const lang of ['ko', 'en'] as const) {
      setLang(lang);
      for (const id of FOE_IDS) {
        const lines = foePage(id, { chapter: 1, stake: 0 }).abilities;
        const abilities = abilitiesOf(id);
        abilities.forEach((a, i) => {
          const text = lines[i]?.text ?? '';
          for (const [key, v] of Object.entries(a.vars)) expect(text, `${lang} ${id} ${a.kind} ${key}`).toContain(String(v));
        });
      }
    }
    expect(foePage('boss_vacuum', { chapter: 1, stake: 0 }).abilities[0]?.text).toContain(String(BOSS_SPECS.inhale.cooldown));
    expect(foePage('boss_cloud', { chapter: 1, stake: 0 }).abilities[0]?.text).toContain(String(BOSS_SPECS.lightning.duration));
  });

  it('quotes the elite and boss tips from the enemy own armour, ward and control numbers', () => {
    setLang('ko');
    const vacuum = foePage('boss_vacuum', { chapter: 1, stake: 0 }).special?.tips ?? [];
    expect(vacuum[0]).toContain(`${Math.round(ENEMY_SPECS.boss_vacuum.armor * 100)}%`);
    expect(vacuum.join(' ')).toContain(`${Math.round(SLOW_CAP_BOSS * 100)}%`);
    const cloud = foePage('boss_cloud', { chapter: 4, stake: 0 }).special?.tips ?? [];
    expect(cloud[0]).toContain(`${Math.round(ENEMY_SPECS.boss_cloud.ward * 100)}%`);
  });

  it('says what the chosen level means: the chapter multiple, the time cut from butler level four, the health multiple at five', () => {
    setLang('en');
    expect(basisText({ chapter: 3, stake: 0 }).rules).not.toContain('-');
    expect(basisText({ chapter: 3, stake: 4 }).rules).toContain('-13s');
    expect(basisText({ chapter: 3, stake: 5 }).rules).toContain('x1.4');
    expect(basisText({ chapter: 3, stake: 2 }).head).toContain('3');
  });

  it('writes wave lists as runs', () => {
    expect(waveText([1, 2, 3, 4, 7, 9, 10])).toBe('1~4, 7, 9, 10');
    expect(waveText([6])).toBe('6');
  });
});

describe('codex toys', () => {
  it('lists the 30 toys, by rarity, and prints the toy own effect text', () => {
    setLang('ko');
    expect(toysFor('all')).toEqual([...RELIC_IDS]);
    expect(TOY_FILTERS).toEqual(['all', ...TOY_RARITIES]);
    expect(TOY_RARITIES.flatMap((r) => toysFor(r)).sort()).toEqual([...RELIC_IDS].sort());
    for (const id of RELIC_IDS) {
      const item = toyItem(id);
      expect(item.effect).toBe(relicDef(id).descText());
      expect(item.rarity).toBe(relicDef(id).rarity);
      expect(holes(item.effect)).toBe(false);
    }
  });

  it('marks exactly the three position toys with a diagram, on the cells the battle marks', () => {
    const boards = RELIC_IDS.filter((id) => toyBoard(id) !== null);
    expect(boards).toEqual(['cat_tower', 'kneading_cushion', 'window_perch']);
    const marked = (id: Parameters<typeof toyBoard>[0]): number[] => (toyBoard(id)?.tones ?? []).flatMap((tone, c) => (tone ? [c] : []));
    expect(marked('cat_tower')).toEqual(Array.from({ length: COLS }, (_, c) => c));
    expect(marked('window_perch')).toEqual(Array.from({ length: CELL_COUNT }, (_, c) => c).filter(isEdgeCell));
    const pairs = toyBoard('kneading_cushion');
    expect(marked('kneading_cushion')).toHaveLength(2);
    for (const c of marked('kneading_cushion')) expect(pairs?.cats.some((cat) => cat.cell === c)).toBe(true);
    expect(pairs?.cats.length).toBeGreaterThan(2);
  });
});

describe('codex board cells', () => {
  for (const lang of ['ko', 'en'] as const) {
    it(`quotes every number of every cell page and no more (${lang})`, () => {
      setLang(lang);
      const table = lang === 'ko' ? KO : EN;
      for (const kind of CELL_KINDS) {
        const facts = cellFacts(kind);
        const text = table[cellTextKey(kind)] as string;
        const used = slots(text);
        for (const slot of used) expect(slot in facts, `${lang} ${kind} {${slot}}`).toBe(true);
        for (const key of Object.keys(facts)) expect(used, `${lang} ${kind} fact ${key}`).toContain(key);
        const page = cellPage(kind);
        expect(holes(page.name + page.text), `${lang} ${kind}`).toBe(false);
        expect(page.name).not.toMatch(/^(codex\.cell|cell)\./);
      }
    });
  }

  it('reads the numbers from the data', () => {
    setLang('ko');
    expect(cellFacts('sun')).toMatchObject({ cells: SUN_CELLS, toyCells: relicSpec('sunny_spot').fx.sunCells });
    expect(cellFacts('plain')).toMatchObject({ cells: CELL_COUNT, cols: COLS, rows: ROWS });
    expect(cellFacts('wet')).toMatchObject({
      warn: HAZARD_WARNING, recover: HAZARD_RECOVER, sprayEvery: ENEMY_SPECS.spray.hazardPulse?.every, soakCells: BOSS_SPECS.splash.soakCells, dodge: 40,
    });
    expect(cellFacts('zap')).toMatchObject({ every: BOSS_SPECS.lightning.cooldown, dur: BOSS_SPECS.lightning.duration, side: 2 });
    expect(cellFacts('tower')).toMatchObject({ range: 25, damage: 10, cells: COLS });
    expect(cellFacts('perch')).toMatchObject({ speed: 15, cells: CELL_COUNT - (COLS - 2) * (ROWS - 2) });
    expect(cellFacts('cushion')).toMatchObject({ damage: 12, sides: 4 });
    expect(cellFacts('bard')).toMatchObject({ damage: 15, cells: 8, level: 7, max: 22.5 });
    expect(cellFacts('bell')).toMatchObject({ speed: 8, dodge: 40, dodgeMax: 60, cells: 8, level: 7 });
    expect(cellFacts('lane')).toMatchObject({
      cap: ENEMY_CAP, grace: OVERFLOW_GRACE, low: ENEMY_CAP - stakeRules(1).enemyCapCut, lap: Math.round(PATH_LENGTH / ENEMY_SPECS.cucumber.speed),
    });
    expect(bellDodgePct(1)).toBe(Math.round(Math.min(DODGE_CAP, unitSpec('t_bell').aura.dodge ?? 0) * 100));
  });

  it('draws the aura on the 8 cells around a cat in the middle and the toy cells where the battle marks them', () => {
    for (const unit of ['t_bard', 't_bell'] as const) {
      const board = auraBoard(unit);
      expect(board.tones.filter((x) => x === 'aura')).toHaveLength(8);
      expect(board.tones.filter((x) => x === 'self')).toHaveLength(1);
    }
    for (const kind of SPECIAL_CELL_IDS) {
      const board = cellBoard(kind);
      expect(board.tones.filter((x) => x === 'cell')).toHaveLength(SUN_CELLS);
      expect(board.cell).toBe(kind);
    }
    expect(cellBoard('wet').tones.filter((x) => x === 'wet')).toHaveLength(BOSS_SPECS.splash.soakCells);
    expect(cellBoard('zap').tones.filter((x) => x === 'zap')).toHaveLength(4);
    expect(cellBoard('tower').tones.filter((x) => x === 'row')).toHaveLength(COLS);
  });

  it('covers every kind in the groups and traces the real loop for the lane', () => {
    expect(CELL_GROUPS.flatMap((g) => g.kinds)).toEqual([...CELL_KINDS]);
    const lane = laneDiagram();
    const start = pathPoint(0);
    expect(lane.entrance).toEqual({ x: start.x, y: start.y, angle: start.angle });
    expect(lane.loop.length % 2).toBe(0);
    expect(lane.loop[0]).toBeCloseTo(start.x, 9);
    expect(lane.zone.radius).toBeGreaterThan(0);
  });
});
