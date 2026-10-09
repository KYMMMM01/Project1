import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { RELIC_IDS, type RelicId, type UnitId } from '@/game/api';
import { FIRST_SUN_CELLS, LASER_DURATION, SUN_CELLS, hpIndex } from '@/game/data/balance';
import { RELIC_FX_KEYS, relicSpec } from '@/game/data/relics';
import { unitRarityIndex } from '@/game/data/roster';
import { unitSpec } from '@/game/data/units';
import { cellCenterX, cellCenterY } from '@/game/geometry';
import { damageEnemy } from '@/game/sim/enemies';
import { gainRelic, startWave } from '@/game/sim/flow';
import type { Sim } from '@/game/sim/sim';
import { advance, foe, newSim, put, quietWave, record, slay } from './simHelpers';

function withRelic(id: RelicId, over: Parameters<typeof newSim>[0] = {}): Sim {
  const sim = newSim(over);
  gainRelic(sim, id);
  return sim;
}

describe('relic bookkeeping', () => {
  it('announces every gain and keeps the list', () => {
    const sim = newSim();
    const gains = record(sim, 'relicGain');
    for (const id of RELIC_IDS) gainRelic(sim, id);
    expect(gains.map((g) => g.relic)).toEqual([...RELIC_IDS]);
    expect(sim.relics).toEqual([...RELIC_IDS]);
    expect(sim.getStats().relics).toEqual([...RELIC_IDS]);
  });

  it('sums the effect data of the held relics, and nothing for the others', () => {
    const sim = newSim();
    expect(sim.fx.rangeAll ?? 0).toBe(0);
    gainRelic(sim, 'fishing_rod');
    gainRelic(sim, 'cat_tower');
    expect(sim.fx.rangeAll).toBe(0.12);
    expect(sim.fx.topRowRange).toBe(0.25);
    expect(relicSpec('fishing_rod').fx.rangeAll).toBe(0.12);
  });
});

describe('stat relics', () => {
  it('yarn ball: warriors and rangers attack 12% faster, mages and tricksters do not', () => {
    const sim = newSim();
    const units = [put(sim, 20, 'w_paw'), put(sim, 21, 'r_sling'), put(sim, 22, 'm_snow'), put(sim, 23, 't_bell')];
    const before = units.map((u) => u.stats.interval);
    gainRelic(sim, 'yarn_ball');
    expect(units[0]!.stats.interval).toBeCloseTo(before[0]! / 1.12, 9);
    expect(units[1]!.stats.interval).toBeCloseTo(before[1]! / 1.12, 9);
    expect(units[2]!.stats.interval).toBeCloseTo(before[2]!, 9);
    expect(units[3]!.stats.interval).toBeCloseTo(before[3]!, 9);
  });

  it('glitter ball and toy mouse: +15% magic and physical damage respectively', () => {
    const sim = newSim();
    const phys = put(sim, 16, 'w_paw');
    const magic = put(sim, 18, 'm_snow');
    const trick = put(sim, 19, 't_chef');
    const [p, m, t] = [phys.stats.damage, magic.stats.damage, trick.stats.damage];
    gainRelic(sim, 'glitter_ball');
    expect(phys.stats.damage).toBeCloseTo(p, 9);
    expect(magic.stats.damage).toBeCloseTo(m * 1.15, 9);
    expect(trick.stats.damage).toBeCloseTo(t * 1.15, 9);
    gainRelic(sim, 'mouse_toy');
    expect(phys.stats.damage).toBeCloseTo(p * 1.15, 9);
  });

  it('fishing rod: range +12% for every cat', () => {
    const sim = newSim();
    const u = put(sim, 16, 'r_sling');
    const range = u.stats.range;
    gainRelic(sim, 'fishing_rod');
    expect(u.stats.range).toBeCloseTo(range * 1.12, 9);
  });

  it('feather wand and silvervine: +6 points of crit chance, +0.5 crit multiplier', () => {
    const sim = newSim();
    const u = put(sim, 16, 'm_snow');
    const crit = u.stats.crit;
    const mult = u.stats.critMult;
    gainRelic(sim, 'feather_wand');
    gainRelic(sim, 'silvervine');
    expect(u.stats.crit).toBeCloseTo(crit + 0.06, 9);
    expect(u.stats.critMult).toBeCloseTo(mult + 0.5, 9);
  });

  it('cat tower: only the top row gets +25% range and +10% damage', () => {
    const sim = newSim();
    const top = put(sim, 2, 'r_sling');
    const low = put(sim, 17, 'r_sling');
    const t = { range: top.stats.range, damage: top.stats.damage };
    const l = { range: low.stats.range, damage: low.stats.damage };
    gainRelic(sim, 'cat_tower');
    expect(top.stats.range).toBeCloseTo(t.range * 1.25, 9);
    expect(top.stats.damage).toBeCloseTo(t.damage * 1.1, 9);
    expect(low.stats.range).toBeCloseTo(l.range, 9);
    expect(low.stats.damage).toBeCloseTo(l.damage, 9);
  });

  it('kneading cushion: +12% damage with a neighbour of the same class', () => {
    const sim = newSim();
    const a = put(sim, 16, 'w_paw');
    const b = put(sim, 18, 'w_paw');
    put(sim, 17, 'm_snow');
    const raw = unitSpec('w_paw').base.damage;
    gainRelic(sim, 'kneading_cushion');
    expect(a.stats.damage).toBeCloseTo(raw, 9);
    put(sim, 17, 'w_sword');
    // The kitten rank does not count toward a synergy, so the sword makes one kind and the cushion's +12% stands alone.
    expect(sim.synergyTier('warrior')).toBe(0);
    expect(a.stats.damage).toBeCloseTo(raw * 1.12, 9);
    expect(b.stats.damage).toBeCloseTo(raw * 1.12, 9);
  });

  it('window perch: the outer ring attacks 15% faster', () => {
    const sim = newSim();
    const edge = put(sim, 15, 'w_paw');
    const inner = put(sim, 11, 'w_paw');
    const [e, i] = [edge.stats.interval, inner.stats.interval];
    gainRelic(sim, 'window_perch');
    expect(edge.stats.interval).toBeCloseTo(e / 1.15, 9);
    expect(inner.stats.interval).toBeCloseTo(i, 9);
  });

  it('sunny spot: two more sunbeam tiles and +10 points of sunbeam speed', () => {
    const sim = newSim();
    const sun = record(sim, 'sunbeams');
    const u = put(sim, 12, 'w_paw');
    const before = u.stats.interval;
    gainRelic(sim, 'sunny_spot');
    expect(sim.sunbeams).toHaveLength(SUN_CELLS + 2);
    expect(sun).toHaveLength(1);
    expect(sim.sunbeams.slice(0, FIRST_SUN_CELLS.length)).toEqual([...FIRST_SUN_CELLS]);
    expect(new Set(sim.sunbeams).size).toBe(SUN_CELLS + 2);
    expect(u.stats.interval).toBeCloseTo((before * 1.2) / 1.3, 9);
  });

  it('golden catnip: all synergy numbers 25% larger', () => {
    const sim = newSim();
    put(sim, 0, 'w_sword');
    put(sim, 1, 'w_viking');
    put(sim, 2, 'w_samurai');
    const u = sim.units[0]!;
    const base = u.stats.damage;
    expect(sim.synergyTier('warrior')).toBe(2);
    gainRelic(sim, 'golden_catnip');
    expect(u.stats.damage).toBeCloseTo((base / 1.3) * (1 + 0.3 * 1.25), 9);
    expect(u.armorIgnore).toBeCloseTo(0.15 * 1.25, 9);
  });

  it('royal crown: legendary and mythic cats deal 30% more', () => {
    const sim = newSim();
    const low = put(sim, 16, 'w_viking');
    const high = put(sim, 17, 'm_frost');
    const mythic = put(sim, 18, 'm_cosmo');
    const l = low.stats.damage;
    gainRelic(sim, 'royal_crown');
    expect(low.stats.damage).toBeCloseTo(l, 9);
    // Bonuses add up: the frost queen and the cosmic cat are two mage types (+12%) and the crown adds +30%.
    expect(high.stats.damage).toBeCloseTo(unitSpec('m_frost').base.damage * (1 + 0.12 + 0.3), 9);
    expect(mythic.stats.damage).toBeCloseTo(unitSpec('m_cosmo').base.damage * (1 + 0.12 + 0.3), 9);
  });
});

describe('economy relics', () => {
  it('auto feeder: +6 fish every 10 seconds', () => {
    const sim = newSim();
    quietWave(sim);
    const fish = record(sim, 'fish');
    gainRelic(sim, 'auto_feeder');
    const fed = (): number => fish.filter((f) => f.reason === 'relic').reduce((a, f) => a + f.delta, 0);
    advance(sim, 9.9);
    expect(fed()).toBe(0);
    advance(sim, 0.2);
    expect(fed()).toBe(6);
    advance(sim, 10);
    expect(fed()).toBe(12);
  });

  it('sardine crate: +150 fish at once', () => {
    const sim = newSim();
    const fish = sim.fish;
    gainRelic(sim, 'sardine_crate');
    expect(sim.fish - fish).toBe(150);
  });

  it('lucky coin: elites and bosses pay one more purr', () => {
    const sim = newSim();
    gainRelic(sim, 'lucky_coin');
    quietWave(sim);
    startWave(sim, 4);
    advance(sim, 1.1);
    const purr = sim.purr;
    slay(sim);
    expect(sim.purr - purr).toBe(2);
  });

  it('twin bells, cardboard box, tuna cans and purr pillow keep their rule values', () => {
    expect(relicSpec('twin_bells').fx.twinChance).toBe(0.1);
    expect(relicSpec('cardboard_box').fx.costCut).toBe(0.1);
    expect(relicSpec('tuna_cans').fx.waveFish).toBe(12);
    expect(relicSpec('purr_pillow').fx.actPurr).toBe(1);
  });
});

describe('behaviour relics', () => {
  it('cat tunnel: a free common cat arrives at the start of every wave, while there is room', () => {
    const sim = newSim();
    gainRelic(sim, 'cat_tunnel');
    const placed = record(sim, 'summon');
    advance(sim, 3.05);
    expect(placed).toHaveLength(1);
    expect(placed[0]!.source).toBe('relic');
    expect(unitRarityIndex(placed[0]!.unit.id)).toBe(0);
    advance(sim, 15);
    expect(placed).toHaveLength(2);
    expect(sim.paidSummons).toBe(0);
  });

  it('snack stick: a merge may jump two rarities, always in the same class and never past legendary', () => {
    const sim = newSim();
    gainRelic(sim, 'snack_stick');
    sim.fx.jumpChance = 1;
    const merges = record(sim, 'merge');
    const pairs: UnitId[] = ['w_paw', 'w_sword', 'w_viking', 'r_sling', 'm_fire', 't_bard'];
    pairs.forEach((id, i) => {
      put(sim, i * 2, id);
      put(sim, i * 2 + 1, id);
    });
    pairs.forEach((_, i) => sim.drop(i * 2, i * 2 + 1));
    expect(merges.map((m) => [m.jumped, m.result.id])).toEqual([
      [true, 'w_viking'], [true, 'w_samurai'], [false, 'w_samurai'], [true, 'r_ninja'], [true, 'm_frost'], [false, 't_alch'],
    ]);
  });

  it('heating pad: slows 30% stronger and slowed enemies take 15% more', () => {
    const sim = withRelic('heating_pad');
    quietWave(sim);
    const e = foe(sim, 'cucumber', 100, 1e5);
    const hits = record(sim, 'hit');
    damageEnemy(sim, e, 100, 'magic', null, false, null);
    expect(hits[0]!.amount).toBeCloseTo(100, 9);
    const f = foe(sim, 'cucumber', 100, 1e5);
    f.slow = 0.2;
    f.mask |= 1;
    f.slowUntil = sim.time + 5;
    damageEnemy(sim, f, 100, 'magic', null, false, null);
    expect(hits[1]!.amount).toBeCloseTo(115, 9);
  });

  it('batteries: the laser lasts 2 seconds longer and comes back 3 seconds sooner', () => {
    const sim = withRelic('batteries');
    quietWave(sim);
    expect(sim.laser.duration).toBe(LASER_DURATION + 2);
    expect(sim.laser.cooldownTotal).toBe(12);
    sim.setLaser(100, 100);
    advance(sim, LASER_DURATION + 2 - 0.1);
    expect(sim.laser.active).toBe(true);
    advance(sim, 0.2);
    expect(sim.laser.active).toBe(false);
    expect(sim.laser.cooldownTotal).toBe(12);
  });

  it('glass marble: area attacks reach 25% further', () => {
    for (const marble of [false, true]) {
      const sim = marble ? withRelic('glass_marble') : newSim();
      quietWave(sim);
      put(sim, 7, 'm_snow');
      const x = cellCenterX(7) + 200;
      const y = cellCenterY(7);
      const a = foe(sim, 'cucumber', 600, 1e9);
      a.frozen = true;
      a.x = x;
      a.y = y;
      const b = foe(sim, 'cucumber', 100, 1e9);
      b.frozen = true;
      b.x = x + 82;
      b.y = y;
      advance(sim, 1.5);
      expect(b.slow > 0, marble ? 'with marble' : 'without').toBe(marble);
    }
  });

  it('nap blanket: every enemy walks 10% slower', () => {
    const slow = withRelic('nap_blanket');
    const plain = newSim();
    quietWave(slow);
    quietWave(plain);
    const a = foe(slow, 'cucumber', 0);
    const b = foe(plain, 'cucumber', 0);
    advance(slow, 1);
    advance(plain, 1);
    expect(a.travelled / b.travelled).toBeCloseTo(0.9, 6);
  });

  it('shooting star: every 15 seconds up to 5 enemies take wave-health x 0.6 of magic damage', () => {
    const sim = newSim();
    quietWave(sim);
    gainRelic(sim, 'shooting_star');
    const enemies = Array.from({ length: 8 }, (_, i) => {
      const e = foe(sim, 'cucumber', 300 + i * 30, 1e9);
      e.frozen = true;
      return e;
    });
    const strikes = record(sim, 'strike');
    const hits = record(sim, 'hit');
    advance(sim, 14.8);
    expect(strikes).toHaveLength(0);
    advance(sim, 0.4);
    expect(strikes).toHaveLength(1);
    expect(strikes[0]).toMatchObject({ unitId: null, relic: 'shooting_star' });
    expect(strikes[0]!.points).toHaveLength(5);
    expect(hits).toHaveLength(5);
    const amount = hpIndex(sim.wave) * 0.6;
    for (const h of hits) {
      expect(h.amount).toBeCloseTo(amount, 9);
      expect(h.unitId).toBeNull();
      expect(h.type).toBe('magic');
    }
    expect(enemies.filter((e) => e.hp < 1e9)).toHaveLength(5);
  });

  it('nine lives: once, a run about to be lost drops to half the limit instead', () => {
    const sim = withRelic('nine_lives');
    quietWave(sim);
    for (let i = 0; i < 65; i++) foe(sim, 'cucumber', i * 4).frozen = true;
    const rescued = record(sim, 'rescued');
    advance(sim, 2.2);
    expect(sim.phase).toBe('wave');
    expect(rescued).toEqual([{ removed: 35 }]);
    expect(sim.enemyCount).toBe(30);
    for (let i = 0; i < 40; i++) foe(sim, 'cucumber', i).frozen = true;
    advance(sim, 2.3);
    expect(sim.phase).toBe('lost');
    expect(rescued).toHaveLength(1);
  });

  it('hourglass: enemies arrive about 10% more slowly and bosses give 15 more seconds', () => {
    const plain = newSim();
    const glass = withRelic('hourglass');
    const last = (sim: Sim): number => {
      const times: number[] = [];
      sim.events.on('enemySpawn', () => times.push(sim.time));
      advance(sim, 3.05);
      const t0 = sim.time;
      advance(sim, 12);
      return times.at(-1)! - t0;
    };
    const a = last(plain);
    const b = last(glass);
    expect(b).toBeGreaterThan(a);
    expect(b).toBeLessThan(a * 1.2);
  });
});

describe('no dead toys', () => {
  it('reads every effect field somewhere in the simulation sources', () => {
    const dir = fileURLToPath(new URL('../src/game/sim/', import.meta.url));
    const source = readdirSync(dir)
      .filter((f) => f.endsWith('.ts'))
      .map((f) => readFileSync(dir + f, 'utf8'))
      .join('\n');
    for (const key of RELIC_FX_KEYS) expect(new RegExp('\\b' + key + '\\b').test(source), key).toBe(true);
    for (const id of RELIC_IDS) expect(Object.keys(relicSpec(id).fx).length, id).toBeGreaterThan(0);
  });
});
