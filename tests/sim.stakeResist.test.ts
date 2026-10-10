/**
 * Butler levels and control (rules §13): from level 1 up, elites and bosses take less of a slow (cap 25% -> 23 / 21 / 19 / 17 / 15%) and
 * an elite's stun and freeze last a smaller share (50% -> 46 / 42 / 38 / 34 / 30%). Level 0, normal enemies, bosses' stun immunity, the
 * black-hole pull, armour break and vulnerability do not move. The simulation reads both numbers from the run's `StakeRules`.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { EnemyId } from '@/game/api';
import { ELITE_CC_FACTOR, SLOW_CAP, SLOW_CAP_BOSS, STAKE_ELITE_CC_STEP, STAKE_SLOW_CAP_STEP } from '@/game/data/balance';
import { ENEMY_SPECS } from '@/game/data/enemies';
import { MAX_STAKE } from '@/game/data/roster';
import { stakeControlText, stakeRules } from '@/game/data/stakes';
import { createBattle } from '@/game/sim/create';
import { applyStatus, pullEnemy } from '@/game/sim/enemies';
import { gainRelic } from '@/game/sim/flow';
import { SIM_VERSION } from '@/game/sim/snapshot';
import type { Sim } from '@/game/sim/sim';
import type { SimZone } from '@/game/sim/types';
import { getLang, setLang } from '@/core/i18n';
import '@/game/index';
import { advance, foe, initOf, newSim, quietWave, rich } from './simHelpers';

const original = getLang();

beforeAll(() => {
  // setLang touches document.documentElement; give the node environment a stand-in.
  (globalThis as { document?: unknown }).document = { documentElement: { lang: '' } };
});

afterAll(() => {
  setLang(original);
});

const ELITES: EnemyId[] = (Object.keys(ENEMY_SPECS) as EnemyId[]).filter((id) => ENEMY_SPECS[id].traits.includes('elite'));
const BOSSES: EnemyId[] = (Object.keys(ENEMY_SPECS) as EnemyId[]).filter((id) => ENEMY_SPECS[id].traits.includes('boss'));
const NORMALS: EnemyId[] = (Object.keys(ENEMY_SPECS) as EnemyId[]).filter((id) => !ENEMY_SPECS[id].traits.includes('elite') && !ENEMY_SPECS[id].traits.includes('boss'));
const LEVELS = [0, 1, 2, 3, 4, 5];

function field(stake: number): Sim {
  const sim = newSim({ stake });
  quietWave(sim);
  return sim;
}

describe('stake rules: the control numbers are derived from two steps', () => {
  it('has the ladder the owner asked for', () => {
    expect(LEVELS.map((s) => Math.round(stakeRules(s).specialSlowCap * 100))).toEqual([25, 23, 21, 19, 17, 15]);
    expect(LEVELS.map((s) => Math.round(stakeRules(s).eliteCcFactor * 100))).toEqual([50, 46, 42, 38, 34, 30]);
    expect(MAX_STAKE).toBe(5);
  });

  it('takes one step per level off the base values, without float noise', () => {
    for (const s of LEVELS.slice(1)) {
      expect(stakeRules(s).specialSlowCap).toBeCloseTo(SLOW_CAP_BOSS - s * STAKE_SLOW_CAP_STEP, 12);
      expect(stakeRules(s).eliteCcFactor).toBeCloseTo(ELITE_CC_FACTOR - s * STAKE_ELITE_CC_STEP, 12);
      // 0.25 - 0.02 x 3 is 0.19000000000000003 in floating point: the rules hand out the clean 0.19.
      expect(stakeRules(s).specialSlowCap).toBe(Math.round(stakeRules(s).specialSlowCap * 1000) / 1000);
      expect(stakeRules(s).eliteCcFactor).toBe(Math.round(stakeRules(s).eliteCcFactor * 1000) / 1000);
    }
  });

  it('hands out the base constants themselves at level 0 and clamps a level outside the table', () => {
    expect(Object.is(stakeRules(0).specialSlowCap, SLOW_CAP_BOSS)).toBe(true);
    expect(Object.is(stakeRules(0).eliteCcFactor, ELITE_CC_FACTOR)).toBe(true);
    expect(stakeRules(-3)).toEqual(stakeRules(0));
    expect(stakeRules(9)).toEqual(stakeRules(5));
  });

  it('gets stricter with every level and never shuts control out altogether', () => {
    for (const s of LEVELS.slice(1)) {
      expect(stakeRules(s).specialSlowCap).toBeLessThan(stakeRules(s - 1).specialSlowCap);
      expect(stakeRules(s).eliteCcFactor).toBeLessThan(stakeRules(s - 1).eliteCcFactor);
    }
    expect(stakeRules(5).specialSlowCap).toBeGreaterThan(0);
    expect(stakeRules(5).eliteCcFactor).toBeGreaterThan(0);
  });

  it('leaves every other rule of a level as it was', () => {
    expect(stakeRules(3)).toMatchObject({ enemyCapCut: 18, actPurr: 1, summonCostMult: 1.1, bossTimeCut: 0, relicChoices: 3, freeRerolls: 1, specialHpMult: 1 });
    expect(stakeRules(5)).toMatchObject({ enemyCapCut: 18, actPurr: 1, summonCostMult: 1.1, bossTimeCut: 13, relicChoices: 2, freeRerolls: 0, specialHpMult: 1.4 });
  });
});

describe('the simulation reads the run\'s rules', () => {
  it('caps a slow on an elite or a boss at the level\'s cap, and on a normal enemy at the same 50% at every level', () => {
    for (const stake of LEVELS) {
      const sim = field(stake);
      for (const id of [...ELITES, ...BOSSES]) {
        const e = foe(sim, id);
        applyStatus(sim, e, 'slow', 0.99, 5, null);
        expect(e.slow, `${id}, level ${stake}`).toBe(stakeRules(stake).specialSlowCap);
      }
      for (const id of NORMALS) {
        const e = foe(sim, id);
        applyStatus(sim, e, 'slow', 0.99, 5, null);
        expect(e.slow, `${id}, level ${stake}`).toBeCloseTo(SLOW_CAP * (1 - ENEMY_SPECS[id].slowResist), 12);
      }
    }
  });

  it('lets a slow below the cap through whole', () => {
    for (const stake of LEVELS) {
      const sim = field(stake);
      const e = foe(sim, ELITES[0] as EnemyId);
      applyStatus(sim, e, 'slow', 0.1, 3, null);
      expect(e.slow, `level ${stake}`).toBe(0.1);
    }
  });

  it('puts the level\'s cap inside the min and the enemy\'s own resistance after it, with the toy\'s boost before the cap', () => {
    // Level 3: cap 19%. An elite that shrugs off 20% of a slow (none does today; the rule is the data's to use) gets 19% x 0.8.
    const sim = field(3);
    const e = foe(sim, ELITES[0] as EnemyId);
    e.spec = { ...e.spec, slowResist: 0.2 };
    applyStatus(sim, e, 'slow', 0.99, 5, null);
    expect(e.slow).toBeCloseTo(0.19 * 0.8, 12);
    // The heating pad's boost comes before the cap: a small slow stretched by it still lands whole under the level-5 cap of 15%, a big one is cut to it.
    const top = field(5);
    gainRelic(top, 'heating_pad');
    const boost = top.fx.slowBoost ?? 0;
    expect(boost).toBeGreaterThan(0);
    const low = foe(top, BOSSES[0] as EnemyId);
    applyStatus(top, low, 'slow', 0.05, 3, null);
    expect(low.slow).toBeCloseTo(0.05 * (1 + boost), 12);
    expect(low.slow).toBeLessThan(0.15);
    const high = foe(top, BOSSES[1] as EnemyId);
    applyStatus(top, high, 'slow', 0.2, 3, null);
    expect(high.slow).toBe(0.15);
  });

  it('shortens an elite\'s stun and freeze to the level\'s share, leaves a normal enemy\'s whole, and a boss immune', () => {
    for (const stake of LEVELS) {
      const sim = field(stake);
      const share = stakeRules(stake).eliteCcFactor;
      for (const id of ELITES) {
        const stun = foe(sim, id);
        const freeze = foe(sim, id);
        applyStatus(sim, stun, 'stun', 0, 2, null);
        applyStatus(sim, freeze, 'freeze', 0, 2, null);
        expect(stun.stunUntil - sim.time, `${id} stun, level ${stake}`).toBeCloseTo(2 * share, 9);
        expect(freeze.freezeUntil - sim.time, `${id} freeze, level ${stake}`).toBeCloseTo(2 * share, 9);
      }
      for (const id of NORMALS) {
        const e = foe(sim, id);
        applyStatus(sim, e, 'stun', 0, 2, null);
        applyStatus(sim, e, 'freeze', 0, 2, null);
        expect(e.stunUntil - sim.time, `${id} stun, level ${stake}`).toBeCloseTo(2, 9);
        expect(e.freezeUntil - sim.time, `${id} freeze, level ${stake}`).toBeCloseTo(2, 9);
      }
      for (const id of BOSSES) {
        const e = foe(sim, id);
        applyStatus(sim, e, 'stun', 0, 2, null);
        applyStatus(sim, e, 'freeze', 0, 2, null);
        expect(e.stunned || e.frozen, `${id}, level ${stake}`).toBe(false);
      }
    }
  });

  it('applies the share to the duration a cat\'s status strength already stretched', () => {
    // A src with statusMult stretches a magic status first (freeze is one); the elite's share comes after, so 4 s x 1.5 x 0.3 at level 5.
    const sim = field(5);
    const e = foe(sim, ELITES[0] as EnemyId);
    const src = { statusMult: 1.5 } as Parameters<typeof applyStatus>[5];
    applyStatus(sim, e, 'freeze', 0, 4, src);
    expect(e.freezeUntil - sim.time).toBeCloseTo(4 * 1.5 * 0.3, 9);
  });

  it('leaves the black-hole pull, armour break and vulnerability of elites and bosses the same at every level', () => {
    const zone = { uid: 99, timeLeft: 2 } as SimZone;
    const pulled: number[] = [];
    const broken: [number, number][] = [];
    const vuln: [number, number][] = [];
    for (const stake of LEVELS) {
      const sim = field(stake);
      const elite = foe(sim, ELITES[0] as EnemyId, 600);
      const boss = foe(sim, BOSSES[0] as EnemyId, 600);
      pulled.push(pullEnemy(sim, elite, 100, zone), pullEnemy(sim, boss, 100, zone));
      for (const e of [elite, boss]) {
        applyStatus(sim, e, 'armor_break', 0.3, 4, null);
        applyStatus(sim, e, 'vulnerable', 0.4, 4, null);
        broken.push([e.breakAmount, e.breakUntil - sim.time]);
        vuln.push([e.vulnAmount, e.vulnUntil - sim.time]);
      }
    }
    expect(new Set(pulled).size).toBe(2);
    for (const row of broken) expect(row).toEqual([0.3, expect.closeTo(4, 9)]);
    for (const row of vuln) expect(row).toEqual([0.4, expect.closeTo(4, 9)]);
  });

  it('holds level 0 exactly where it was: the base caps, so a level-0 run plays as before', () => {
    const sim = field(0);
    const elite = foe(sim, ELITES[0] as EnemyId);
    applyStatus(sim, elite, 'slow', 0.99, 5, null);
    expect(elite.slow).toBe(SLOW_CAP_BOSS);
    applyStatus(sim, elite, 'stun', 0, 2, null);
    expect(elite.stunUntil - sim.time).toBeCloseTo(2 * ELITE_CC_FACTOR, 9);
  });
});

/**
 * A wave-start save written by the code of commit a3b8536 (before this change): butler level 3, seed 2024, four cats on the board, the start
 * of wave 3. Kept as it was written, byte for byte, to show that a save made before the control rules existed still loads and plays.
 */
const SAVE_FROM_BEFORE = {
  simVersion: 3,
  wave: 3,
  data: "{\"init\":{\"seed\":2024,\"mode\":\"chapter\",\"chapter\":1,\"stake\":3,\"loadout\":{\"unitLevels\":{\"w_paw\":1,\"w_sword\":1,\"w_viking\":1,\"w_samurai\":1,\"r_sling\":1,\"r_archer\":1,\"r_ninja\":1,\"r_gunner\":1,\"m_snow\":1,\"m_fire\":1,\"m_storm\":1,\"m_frost\":1,\"t_chef\":1,\"t_bell\":1,\"t_bard\":1,\"t_alch\":1},\"training\":{},\"relicPool\":[\"yarn_ball\",\"glitter_ball\",\"mouse_toy\",\"cardboard_box\",\"bell_collar\",\"fishing_rod\",\"scratcher\",\"feather_wand\",\"cat_tower\",\"kneading_cushion\",\"cat_tunnel\",\"heating_pad\",\"batteries\",\"snack_stick\",\"tuna_cans\",\"window_perch\",\"purr_pillow\",\"silvervine\",\"auto_feeder\",\"glass_marble\",\"nap_blanket\",\"twin_bells\",\"lucky_coin\",\"sardine_crate\",\"sunny_spot\",\"nine_lives\",\"shooting_star\",\"golden_catnip\",\"royal_crown\",\"hourglass\"]}},\"wave\":3,\"time\":33.016666666666076,\"fish\":1951,\"fishFrac\":-1.5987211554602254e-14,\"purr\":6,\"units\":[\"w_paw\",0,0,0,0,0,0,0,0,0,0,0,\"t_chef\",0,\"r_sling\",0,0,0,0,0,0,\"r_sling\",0,0,0],\"relics\":[],\"classLevels\":[0,0,0,0],\"summonGrade\":0,\"paidSummons\":4,\"epicDry\":4,\"molts\":0,\"revived\":false,\"rescueUsed\":false,\"freeRerolls\":1,\"paidRerollUsed\":false,\"tutorialFree\":0,\"tutorialOffer\":false,\"sun\":[7,11,12,13,17],\"rng\":[2787711949,2559099402,1308552080,316777715,3291862683,1509819682,294314822],\"stats\":{\"kills\":7,\"bossesKilled\":0,\"summoned\":4,\"merges\":0,\"awakenings\":0,\"wavesCleared\":2,\"peak\":34,\"bestRarity\":0,\"damage\":[320.1,0,0,0,0,394.88000000000017,0,0,0,0,0,0,0,0,0,0,0,0,0,0],\"luck\":{\"score\":0,\"mean\":1.6,\"variance\":2.16}}}",
};

describe('a run restored from a save made before this change', () => {
  // A wave-start save never held the stake rules: it holds `init` (with the stake), the board and counters, and the rules are rebuilt from
  // `init.stake` when the battle is created. So a save from before has the same shape as one made now and simply plays under the new rules.
  const SAVED_KEYS = [
    'init', 'wave', 'time', 'fish', 'fishFrac', 'purr', 'units', 'relics', 'classLevels', 'summonGrade', 'paidSummons', 'epicDry', 'molts', 'revived',
    'rescueUsed', 'freeRerolls', 'paidRerollUsed', 'tutorialFree', 'tutorialOffer', 'sun', 'rng', 'stats',
  ];

  function played(stake: number): Sim {
    const sim = newSim({ stake, seed: 2024 });
    rich(sim, 2000, 6);
    for (let i = 0; i < 4; i++) sim.summon();
    advance(sim, 3.05 + 15 * 2 + 0.2);
    return sim;
  }

  it('keeps the save format as it was (no rules in it), so an old save is a save like any new one', () => {
    expect(SIM_VERSION).toBe(3);
    const snap = played(3).snapshot();
    expect(snap).not.toBeNull();
    expect(Object.keys(JSON.parse(snap!.data)).sort()).toEqual([...SAVED_KEYS].sort());
    expect(snap!.data).not.toMatch(/specialSlowCap|eliteCcFactor/);
  });

  it('rebuilds the rules from the stake in the save: the restored run caps and shortens at that level', () => {
    for (const stake of [0, 2, 5]) {
      const sim = played(stake);
      const snap = sim.snapshot()!;
      // What a save from before looks like: exactly the keys above and nothing else (re-serialised to be sure no new field rides along).
      const old = { simVersion: snap.simVersion, wave: snap.wave, data: JSON.stringify(JSON.parse(snap.data)) };
      const copy = createBattle(initOf({ stake, seed: 2024 }), old) as Sim;
      expect(copy, `level ${stake}`).not.toBeNull();
      expect(copy.rules).toEqual(stakeRules(stake));
      advance(copy, 3.05);
      quietWave(copy);
      const elite = foe(copy, ELITES[0] as EnemyId);
      applyStatus(copy, elite, 'slow', 0.99, 5, null);
      expect(elite.slow).toBe(stakeRules(stake).specialSlowCap);
      applyStatus(copy, elite, 'stun', 0, 2, null);
      expect(elite.stunUntil - copy.time).toBeCloseTo(2 * stakeRules(stake).eliteCcFactor, 9);
    }
  });

  it('opens a save written by the code from before (commit a3b8536) and plays it under the level\'s control rules', () => {
    const copy = createBattle(initOf({ stake: 3, seed: 2024 }), SAVE_FROM_BEFORE) as Sim;
    expect(copy).not.toBeNull();
    expect(copy.stake).toBe(3);
    // The rules are not in the save: they are the ones `stakeRules(3)` gives now, with the new control numbers.
    expect(copy.rules).toEqual(stakeRules(3));
    expect(copy.rules.specialSlowCap).toBe(0.19);
    expect(copy.rules.eliteCcFactor).toBe(0.38);
    expect(copy.phase).toBe('prep');
    expect(copy.wave).toBe(2);
    // It plays on: the wave starts, enemies come, and a slow and a stun on an elite land by the level-3 numbers.
    advance(copy, 3.05 + 12);
    expect(copy.wave).toBe(3);
    expect(copy.enemyCount).toBeGreaterThan(0);
    const elite = foe(copy, ELITES[0] as EnemyId);
    applyStatus(copy, elite, 'slow', 0.99, 5, null);
    applyStatus(copy, elite, 'stun', 0, 2, null);
    expect(elite.slow).toBe(0.19);
    expect(elite.stunUntil - copy.time).toBeCloseTo(2 * 0.38, 9);
    advance(copy, 20);
    expect(copy.phase === 'wave' || copy.phase === 'prep' || copy.phase === 'choice').toBe(true);
  });

  it('does not carry anything of the first run into the second: a restored level-5 run is as strict as a fresh one', () => {
    const fresh = field(5);
    const restored = createBattle(initOf({ stake: 5, seed: 2024 }), played(5).snapshot()!) as Sim;
    expect(restored.rules).toEqual(fresh.rules);
  });
});

describe('the line that says it', () => {
  it('is empty at level 0 and says that level\'s own numbers from 1 to 5, in both languages', () => {
    for (const lang of ['ko', 'en'] as const) {
      setLang(lang);
      expect(stakeControlText(0)).toBe('');
      expect(stakeControlText(-1)).toBe('');
      expect(stakeControlText(Number.NaN)).toBe('');
      const slow = [23, 21, 19, 17, 15];
      const stun = [46, 42, 38, 34, 30];
      for (let n = 1; n <= 5; n++) {
        const line = stakeControlText(n);
        expect(line, `${lang} ${n}`).toContain(`${slow[n - 1]}%`);
        expect(line, `${lang} ${n}`).toContain(`${stun[n - 1]}%`);
        expect(line, `${lang} ${n}`).not.toMatch(/[{}]|undefined|NaN/);
        // The numbers are not summed over the levels: a level names only its own.
        if (n > 1) expect(line).not.toContain(`${slow[n - 2]}%`);
      }
      expect(stakeControlText(9)).toBe(stakeControlText(5));
    }
  });

  it('is one short line: it fits the chapter card\'s bubble under the rule (two lines of 24 px text)', () => {
    // The card wraps this line at 560 px in 24 px type. A Korean character is about one em wide and a Latin one about half of that, so
    // two lines hold about 46 Korean characters or 94 Latin ones; the exact measure on the real screen is in docs/handoff/batch4_stakes.md.
    setLang('ko');
    for (let n = 1; n <= 5; n++) expect(stakeControlText(n).length).toBeLessThanOrEqual(46);
    setLang('en');
    for (let n = 1; n <= 5; n++) expect(stakeControlText(n).length).toBeLessThanOrEqual(110);
  });
});
