/**
 * The toys by rank (v1.7, directive batch 4 D1-D3): how many toys each rank has, that the data order follows the ranks, which toys the
 * offers push as answers, the texts that changed, and the measuring hook of the balance report.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RELIC_IDS, type RelicId } from '@/game/api';
import type { RelicFx } from '@/game/data/types';
import { RELIC_RARITY_WEIGHTS } from '@/game/data/balance';
import { COUNTER_RELICS, allRelicDefs, relicDef, relicSpec } from '@/game/data/relics';
import { RARITIES, RELIC_RARITY } from '@/game/data/roster';
import { playRun } from '@/game/sim/runner';
import { setLang, t } from '@/core/i18n';
import { toysFor, TOY_RARITIES } from '@/codex/toys';
import { pairedDelta, signed, type BatchSummary } from './simReportKit';
import { initOf } from './simHelpers';

const RANKS = ['common', 'rare', 'epic', 'legendary'] as const;

beforeAll(() => {
  // setLang touches document.documentElement; give the node environment a stand-in.
  (globalThis as { document?: unknown }).document = { documentElement: { lang: '' } };
  setLang('ko');
});

afterAll(() => {
  setLang('ko');
  delete (globalThis as { document?: unknown }).document;
});

describe('toy ranks', () => {
  it('has 9 common, 7 rare, 8 epic and 6 legendary toys, and every rank can fill an offer of three twice over', () => {
    const count = Object.fromEntries(RANKS.map((r) => [r, RELIC_IDS.filter((id) => RELIC_RARITY[id] === r).length]));
    expect(count).toEqual({ common: 9, rare: 7, epic: 8, legendary: 6 });
    for (const r of RANKS) expect(count[r], r).toBeGreaterThanOrEqual(6);
  });

  it('does what the owner asked of the three toys they named: the tunnel and the pad went up a rank, the blanket got a damage effect and a rank above common', () => {
    // Cat tunnel: "too good" -> a higher rank and a slower pace (it was rare, every wave).
    expect(RELIC_RARITY.cat_tunnel).toBe('epic');
    expect(relicSpec('cat_tunnel').fx.tunnel).toBe(3);
    // Heating pad: "too good" -> epic, the numbers (slow +30%, +15% damage on slowed enemies) as they were. The lead's call after the
    // bots measured it weak at rare: the rank goes up, not the numbers (docs/명세_전투규칙.md §13, "리드 조정").
    expect(RELIC_RARITY.heating_pad).toBe('epic');
    expect(relicSpec('heating_pad').fx).toEqual({ slowBoost: 0.3, slowedDamage: 0.15 });
    // Nap blanket: "weak" -> rare, with the walk slowed 10% as before and a second effect: every enemy takes 12% more damage. The spawn-window
    // stretch the lead tried first (spawnSlow 0.08) measured neutral and was taken out again; only the hourglass has one.
    expect(RELIC_RARITY.nap_blanket).toBe('rare');
    expect(relicSpec('nap_blanket').fx).toEqual({ enemySlow: 0.1, enemyDamageTaken: 0.12 });
    expect(relicSpec('nap_blanket').fx.spawnSlow).toBeUndefined();
    expect(relicSpec('hourglass').fx.spawnSlow).toBe(0.1);
  });

  it('lists the toys rank by rank in the data (the toy codex shows them in that order)', () => {
    const order = RELIC_IDS.map((id) => RARITIES.indexOf(RELIC_RARITY[id]));
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(TOY_RARITIES.flatMap((r) => toysFor(r))).toEqual([...RELIC_IDS]);
    expect(allRelicDefs().map((d) => d.rarity)).toEqual(RELIC_IDS.map((id) => RELIC_RARITY[id]));
  });

  it('draws offers from ranks that all have toys: the weights name only ranks the roster fills', () => {
    for (const row of RELIC_RARITY_WEIGHTS) {
      row.forEach((w, i) => {
        if (w > 0) expect(RELIC_IDS.some((id) => RELIC_RARITY[id] === RANKS[i]), RANKS[i]).toBe(true);
      });
    }
  });

  it('names real toys as the answers to an act\'s trait, and none that the bots found harmful (the nap blanket)', () => {
    for (const list of Object.values(COUNTER_RELICS)) {
      expect(list.length).toBeGreaterThan(0);
      for (const id of list) {
        expect(RELIC_IDS as readonly string[]).toContain(id);
        expect(id).not.toBe('nap_blanket');
      }
    }
  });

  it('gives the tunnel its pace as a number the text shows', () => {
    expect(relicSpec('cat_tunnel').fx.tunnel).toBe(3);
    for (const lang of ['ko', 'en'] as const) {
      setLang(lang);
      expect(relicDef('cat_tunnel').descText()).toContain('3');
    }
    setLang('ko');
  });
});

describe('toy texts', () => {
  it('says "위기의 순간" in the nine lives text, not "질 뻔한 순간" (D1)', () => {
    setLang('ko');
    const text = relicDef('nine_lives').descText();
    expect(text).toContain('위기의 순간');
    expect(text).not.toContain('질 뻔');
    setLang('en');
    expect(relicDef('nine_lives').descText()).toContain('crisis');
    setLang('ko');
  });

  it('shows in every text the numbers its effect uses (the shown number is the effect\'s, in percent or as it is)', () => {
    // `args` feed the {a} and {b} of the text; nothing else ties them to `fx`, so a text could say 70 while the effect does 40.
    // A toy added later has to be listed here (the record is complete by type).
    const pct = (x: number | undefined): number => Math.round((x ?? NaN) * 100);
    const n = (x: number | undefined): number => x ?? NaN;
    const shown: Record<RelicId, (fx: RelicFx) => { a?: number; b?: number }> = {
      yarn_ball: (fx) => ({ a: pct(fx.speedWarriorRanger) }),
      glitter_ball: (fx) => ({ a: pct(fx.damageMagic) }),
      mouse_toy: (fx) => ({ a: pct(fx.damagePhysical) }),
      cardboard_box: (fx) => ({ a: pct(fx.costCut) }),
      bell_collar: (fx) => ({ a: pct(fx.killFish) }),
      fishing_rod: (fx) => ({ a: pct(fx.rangeAll) }),
      scratcher: (fx) => ({ a: pct(fx.defenceCut) }),
      feather_wand: (fx) => ({ a: pct(fx.crit) }),
      cat_tower: (fx) => ({ a: pct(fx.topRowRange), b: pct(fx.topRowDamage) }),
      kneading_cushion: (fx) => ({ a: pct(fx.sameClassNeighbourDamage) }),
      cat_tunnel: (fx) => ({ a: n(fx.tunnel) }),
      heating_pad: (fx) => ({ a: pct(fx.slowBoost), b: pct(fx.slowedDamage) }),
      batteries: (fx) => ({ a: n(fx.laserDuration), b: n(fx.laserCooldownCut) }),
      snack_stick: (fx) => ({ a: pct(fx.jumpChance) }),
      tuna_cans: (fx) => ({ a: n(fx.waveFish) }),
      window_perch: (fx) => ({ a: pct(fx.edgeSpeed) }),
      purr_pillow: (fx) => ({ a: n(fx.actPurr) }),
      silvervine: (fx) => ({ a: pct(fx.critMult) }),
      auto_feeder: (fx) => ({ a: n(fx.feederEvery), b: n(fx.feederFish) }),
      glass_marble: (fx) => ({ a: pct(fx.areaScale) }),
      nap_blanket: (fx) => ({ a: pct(fx.enemySlow), b: pct(fx.enemyDamageTaken) }),
      twin_bells: (fx) => ({ a: pct(fx.twinChance) }),
      lucky_coin: (fx) => ({ a: n(fx.bossPurr) }),
      sardine_crate: (fx) => ({ a: n(fx.instantFish), b: n(fx.costCapCut) }),
      sunny_spot: (fx) => ({ a: n(fx.sunCells), b: pct(fx.sunSpeed) }),
      nine_lives: () => ({}),
      shooting_star: (fx) => ({ a: n(fx.starEvery), b: n(fx.starTargets) }),
      golden_catnip: (fx) => ({ a: pct(fx.synergyScale) }),
      royal_crown: (fx) => ({ a: pct(fx.royalDamage) }),
      hourglass: (fx) => ({ a: n(fx.bossTime) }),
    };
    for (const id of RELIC_IDS as readonly RelicId[]) {
      const spec = relicSpec(id);
      expect(spec.args, id).toEqual(shown[id](spec.fx));
    }
  });

  it('keeps every toy name and text filled in both languages', () => {
    for (const lang of ['ko', 'en'] as const) {
      setLang(lang);
      for (const id of RELIC_IDS as readonly RelicId[]) {
        expect(t(relicDef(id).nameKey), `${id} ${lang}`).not.toBe(relicDef(id).nameKey);
        expect(relicDef(id).descText(), `${id} ${lang}`).not.toMatch(/[{}]|undefined|NaN/);
      }
    }
    setLang('ko');
  });
});

describe('the report\'s toy hook', () => {
  it('hands the run a toy before the wave asked for, and counts the purr that came in', () => {
    const early = playRun(initOf(), 'merge', { toy: { id: 'yarn_ball', wave: 1 }, maxSeconds: 20 });
    expect(early.stats.relics).toEqual(['yarn_ball']);
    const never = playRun(initOf(), 'merge', { toy: { id: 'yarn_ball', wave: 99 }, maxSeconds: 20 });
    expect(never.stats.relics).toEqual([]);
    expect(early.purrIn).toBeGreaterThanOrEqual(0);
  });
});

describe('the report paired difference', () => {
  const batchOf = (runs: { victory: boolean; wave: number; purrIn: number; awakenings: number }[]): BatchSummary =>
    ({ runs: runs.length, results: runs.map((r) => ({ victory: r.victory, wave: r.wave, purrIn: r.purrIn, stats: { awakenings: r.awakenings } })) }) as unknown as BatchSummary;

  it('compares run by run: wins in points, waves, purr and awakenings per run, with a standard error', () => {
    const base = batchOf([
      { victory: false, wave: 8, purrIn: 7, awakenings: 0 },
      { victory: true, wave: 24, purrIn: 19, awakenings: 1 },
      { victory: false, wave: 12, purrIn: 10, awakenings: 1 },
      { victory: true, wave: 24, purrIn: 19, awakenings: 1 },
    ]);
    const held = batchOf([
      { victory: true, wave: 24, purrIn: 17, awakenings: 1 },
      { victory: true, wave: 24, purrIn: 19, awakenings: 1 },
      { victory: false, wave: 14, purrIn: 12, awakenings: 1 },
      { victory: false, wave: 20, purrIn: 15, awakenings: 1 },
    ]);
    const d = pairedDelta(base, held);
    expect(d.win).toBeCloseTo(0, 9);
    expect(d.wave).toBeCloseTo((16 + 0 + 2 - 4) / 4, 9);
    expect(d.purr).toBeCloseTo((10 + 0 + 2 - 4) / 4, 9);
    expect(d.awakenings).toBeCloseTo(0.25, 9);
    expect(d.winSe).toBeGreaterThan(0);
    expect(signed(1.234)).toBe('+1.2');
    expect(signed(-0.04, 2)).toBe('-0.04');
  });
});
