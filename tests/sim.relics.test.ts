import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { RELIC_IDS, type EnemyId, type RelicId, type UnitId } from '@/game/api';
import { AWAKEN_COST, ELITE_PURR, FIRST_SUN_CELLS, LASER_DURATION, SUMMON_CAP, SUN_CELLS, TICK, VULNERABLE_CAP, hpIndex } from '@/game/data/balance';
import { RELIC_FX_KEYS, relicSpec } from '@/game/data/relics';
import { enemySpec } from '@/game/data/enemies';
import { unitRarityIndex } from '@/game/data/roster';
import { unitSpec } from '@/game/data/units';
import { cellCenterX, cellCenterY } from '@/game/geometry';
import { applyStatus, damageEnemy } from '@/game/sim/enemies';
import { gainRelic, startWave } from '@/game/sim/flow';
import type { Sim } from '@/game/sim/sim';
import type { SimEnemy } from '@/game/sim/types';
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
    expect(sim.fx.topRowRange).toBe(0.45);
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

  it('glitter ball and toy mouse: +15% magic and +15% physical damage respectively', () => {
    // Parity with the mouse toy: the mages are not to be buffed (the lead put it back to 15% from 20%, v1.7).
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

  it('feather wand and silvervine: +10 points of crit chance, +1.0 crit multiplier', () => {
    const sim = newSim();
    const u = put(sim, 16, 'm_snow');
    const crit = u.stats.crit;
    const mult = u.stats.critMult;
    gainRelic(sim, 'feather_wand');
    gainRelic(sim, 'silvervine');
    expect(u.stats.crit).toBeCloseTo(crit + 0.1, 9);
    expect(u.stats.critMult).toBeCloseTo(mult + 1.0, 9);
  });

  it('cat tower: only the top row gets +45% range and +22% damage', () => {
    const sim = newSim();
    const top = put(sim, 2, 'r_sling');
    const low = put(sim, 17, 'r_sling');
    const t = { range: top.stats.range, damage: top.stats.damage };
    const l = { range: low.stats.range, damage: low.stats.damage };
    gainRelic(sim, 'cat_tower');
    expect(top.stats.range).toBeCloseTo(t.range * 1.45, 9);
    expect(top.stats.damage).toBeCloseTo(t.damage * 1.22, 9);
    expect(low.stats.range).toBeCloseTo(l.range, 9);
    expect(low.stats.damage).toBeCloseTo(l.damage, 9);
  });

  it('kneading cushion: +22% damage with a neighbour of the same class', () => {
    const sim = newSim();
    const a = put(sim, 16, 'w_paw');
    const b = put(sim, 18, 'w_paw');
    put(sim, 17, 'm_snow');
    const raw = unitSpec('w_paw').base.damage;
    gainRelic(sim, 'kneading_cushion');
    expect(a.stats.damage).toBeCloseTo(raw, 9);
    put(sim, 17, 'w_sword');
    // The kitten rank does not count toward a synergy, so the sword makes one kind and the cushion's +22% stands alone.
    expect(sim.synergyTier('warrior')).toBe(0);
    expect(a.stats.damage).toBeCloseTo(raw * 1.22, 9);
    expect(b.stats.damage).toBeCloseTo(raw * 1.22, 9);
  });

  it('window perch: the outer ring attacks 18% faster', () => {
    const sim = newSim();
    const edge = put(sim, 15, 'w_paw');
    const inner = put(sim, 11, 'w_paw');
    const [e, i] = [edge.stats.interval, inner.stats.interval];
    gainRelic(sim, 'window_perch');
    expect(edge.stats.interval).toBeCloseTo(e / 1.18, 9);
    expect(inner.stats.interval).toBeCloseTo(i, 9);
  });

  it('sunny spot: three more sunbeam tiles and +10 points of sunbeam speed', () => {
    const sim = newSim();
    const sun = record(sim, 'sunbeams');
    const u = put(sim, 12, 'w_paw');
    const before = u.stats.interval;
    gainRelic(sim, 'sunny_spot');
    expect(sim.sunbeams).toHaveLength(SUN_CELLS + 3);
    expect(sun).toHaveLength(1);
    expect(sim.sunbeams.slice(0, FIRST_SUN_CELLS.length)).toEqual([...FIRST_SUN_CELLS]);
    expect(new Set(sim.sunbeams).size).toBe(SUN_CELLS + 3);
    expect(u.stats.interval).toBeCloseTo((before * 1.2) / 1.3, 9);
  });

  it('golden catnip: all synergy numbers 50% larger', () => {
    const sim = newSim();
    put(sim, 0, 'w_sword');
    put(sim, 1, 'w_viking');
    put(sim, 2, 'w_samurai');
    const u = sim.units[0]!;
    const base = u.stats.damage;
    expect(sim.synergyTier('warrior')).toBe(2);
    gainRelic(sim, 'golden_catnip');
    expect(u.stats.damage).toBeCloseTo((base / 1.3) * (1 + 0.3 * 1.5), 9);
    expect(u.armorIgnore).toBeCloseTo(0.15 * 1.5, 9);
  });

  it('royal crown: legendary and mythic cats deal 50% more', () => {
    const sim = newSim();
    const low = put(sim, 16, 'w_viking');
    const high = put(sim, 17, 'm_frost');
    const mythic = put(sim, 18, 'm_cosmo');
    const l = low.stats.damage;
    gainRelic(sim, 'royal_crown');
    expect(low.stats.damage).toBeCloseTo(l, 9);
    // Bonuses add up: the frost queen and the cosmic cat are two mage types (+12%) and the crown adds +50%.
    expect(high.stats.damage).toBeCloseTo(unitSpec('m_frost').base.damage * (1 + 0.12 + 0.5), 9);
    expect(mythic.stats.damage).toBeCloseTo(unitSpec('m_cosmo').base.damage * (1 + 0.12 + 0.5), 9);
  });
});

describe('economy relics', () => {
  it('auto feeder: +10 fish every 10 seconds', () => {
    const sim = newSim();
    quietWave(sim);
    const fish = record(sim, 'fish');
    gainRelic(sim, 'auto_feeder');
    const fed = (): number => fish.filter((f) => f.reason === 'relic').reduce((a, f) => a + f.delta, 0);
    advance(sim, 9.9);
    expect(fed()).toBe(0);
    advance(sim, 0.2);
    expect(fed()).toBe(10);
    advance(sim, 10);
    expect(fed()).toBe(20);
  });

  it('sardine crate: +100 fish at once, and the summon price tops out 15 lower', () => {
    const sim = newSim();
    const fish = sim.fish;
    gainRelic(sim, 'sardine_crate');
    expect(sim.fish - fish).toBe(100);
    sim.paidSummons = 100;
    expect(sim.summonCost()).toBe(SUMMON_CAP - 15);
  });

  it('lucky coin: elites and bosses pay two more purr', () => {
    const sim = newSim();
    gainRelic(sim, 'lucky_coin');
    quietWave(sim);
    startWave(sim, 4);
    advance(sim, 1.1);
    const purr = sim.purr;
    slay(sim);
    expect(sim.purr - purr).toBe(ELITE_PURR + 2);
  });

  it('twin bells, cardboard box, tuna cans and the purr toys keep their rule values', () => {
    expect(relicSpec('twin_bells').fx.twinChance).toBe(0.3);
    expect(relicSpec('cardboard_box').fx.costCut).toBe(0.1);
    expect(relicSpec('tuna_cans').fx.waveFish).toBe(16);
    expect(relicSpec('purr_pillow').fx.actPurr).toBe(2);
    expect(relicSpec('lucky_coin').fx.bossPurr).toBe(2);
  });

  it('the purr toys pay two fifths of an awakening where they first show up, twice what +1 paid (v1.7, +2 each)', () => {
    // The first offer that can hold an epic toy comes after act 3. The acts that still pay purr after it are 4 and 5 (the last act ends
    // the run); the elite or boss waves still ahead are 16 and 20 (the last boss falls with the run already won).
    const acts = 2;
    const specials = 2;
    expect(acts * (relicSpec('purr_pillow').fx.actPurr ?? 0)).toBeGreaterThanOrEqual((AWAKEN_COST * 2) / 5);
    expect(specials * (relicSpec('lucky_coin').fx.bossPurr ?? 0)).toBeGreaterThanOrEqual((AWAKEN_COST * 2) / 5);
    // ...and neither is so rich that one toy pays a whole awakening at that point.
    expect(acts * (relicSpec('purr_pillow').fx.actPurr ?? 0)).toBeLessThan(AWAKEN_COST);
    expect(specials * (relicSpec('lucky_coin').fx.bossPurr ?? 0)).toBeLessThan(AWAKEN_COST);
  });
});

describe('behaviour relics', () => {
  it('cat tunnel: a free common cat arrives at the start of every third wave (3, 6, 9...), while there is room', () => {
    const sim = newSim();
    gainRelic(sim, 'cat_tunnel');
    const placed = record(sim, 'summon');
    advance(sim, 3.05);
    expect(sim.wave).toBe(1);
    advance(sim, 15);
    expect(sim.wave).toBe(2);
    expect(placed).toHaveLength(0);
    advance(sim, 15);
    expect(sim.wave).toBe(3);
    expect(placed).toHaveLength(1);
    expect(placed[0]!.source).toBe('relic');
    expect(unitRarityIndex(placed[0]!.unit.id)).toBe(0);
    // The wave number decides, so a run picked up from a save agrees: waves 5 and 7 bring nobody, wave 6 does.
    startWave(sim, 5);
    startWave(sim, 7);
    expect(placed).toHaveLength(1);
    startWave(sim, 6);
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

  it('batteries: the laser lasts 3 seconds longer and comes back 4 seconds sooner', () => {
    const sim = withRelic('batteries');
    quietWave(sim);
    expect(sim.laser.duration).toBe(LASER_DURATION + 3);
    expect(sim.laser.cooldownTotal).toBe(11);
    sim.setLaser(100, 100);
    advance(sim, LASER_DURATION + 3 - 0.1);
    expect(sim.laser.active).toBe(true);
    advance(sim, 0.2);
    expect(sim.laser.active).toBe(false);
    expect(sim.laser.cooldownTotal).toBe(11);
  });

  it('glass marble: area attacks reach 30% further (not 25%, not 40%, not 60%)', () => {
    // A hit lands when an enemy's centre is within splash radius x scale + its own body of the impact. For the snow cat (55) and a
    // cucumber (18) that is 73 without the marble, 86.75 at +25% (the original number), 89.5 at +30% (55 x 1.3 + 18, the owner's
    // number), 95 at +40% and 106 at +60% (the first v1.7 number).
    const snow = unitSpec('m_snow').attack;
    const radius = snow.shape === 'splash' ? snow.radius : 0;
    const body = enemySpec('cucumber').radius;
    const scale = relicSpec('glass_marble').fx.areaScale ?? 0;
    expect(radius * (1 + scale) + body).toBeCloseTo(89.5, 9);
    for (const marble of [false, true]) {
      const sim = marble ? withRelic('glass_marble') : newSim();
      quietWave(sim);
      put(sim, 7, 'm_snow');
      const x = cellCenterX(7) + 200;
      const y = cellCenterY(7);
      // `a` leads and is the target, so the shell lands on it; `near` (88) is inside 89.5 but out of reach of the original +25% (86.75), and
      // `far` (91) is outside 89.5 but inside +40% (95) and +60% (106), so the pair pins the reach between 88 and 91 from both sides.
      const a = foe(sim, 'cucumber', 600, 1e9);
      const near = foe(sim, 'cucumber', 100, 1e9);
      const far = foe(sim, 'cucumber', 50, 1e9);
      for (const [e, dx] of [[a, 0], [near, 88], [far, 91]] as const) {
        e.frozen = true;
        e.x = x + dx;
        e.y = y;
      }
      advance(sim, 1.5);
      expect(a.slow > 0, 'the target is always hit').toBe(true);
      expect(near.slow > 0, marble ? 'with marble' : 'without').toBe(marble);
      expect(far.slow > 0, 'beyond even the marble').toBe(false);
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

  it('nap blanket: every enemy takes 8% more damage from every source, physical and magic, hits and damage over time, shield and health alike', () => {
    // The data: the blanket slows the walk and raises the damage taken; it no longer stretches the spawn window (that is the hourglass's).
    expect(relicSpec('nap_blanket').fx).toEqual({ enemySlow: 0.1, enemyDamageTaken: 0.08 });
    const plain = newSim();
    const blanket = withRelic('nap_blanket');
    quietWave(plain);
    quietWave(blanket);
    const dummy = (sim: Sim, id: EnemyId): SimEnemy => foe(sim, id, 0, 1e5);
    const lost = (sim: Sim, e: SimEnemy, amount: number, type: 'physical' | 'magic'): number => {
      const before = e.hp + e.shield;
      damageEnemy(sim, e, amount, type, null, false, null);
      return before - (e.hp + e.shield);
    };
    // Physical: the cucumber's 8% armour comes off first, the factor multiplies what is left.
    expect(lost(plain, dummy(plain, 'cucumber'), 100, 'physical')).toBeCloseTo(100 * (1 - 0.08), 9);
    expect(lost(blanket, dummy(blanket, 'cucumber'), 100, 'physical')).toBeCloseTo(100 * (1 - 0.08) * 1.08, 9);
    // Magic: the tangerine's 35% ward.
    expect(lost(plain, dummy(plain, 'tangerine'), 100, 'magic')).toBeCloseTo(100 * (1 - 0.35), 9);
    expect(lost(blanket, dummy(blanket, 'tangerine'), 100, 'magic')).toBeCloseTo(100 * (1 - 0.35) * 1.08, 9);
    // Damage over time: one tick of a burn of 100 a second is half a second of it (the cucumber has no ward), and a tick of bleed is physical.
    for (const [kind, armour] of [['burn', 1], ['bleed', 1 - 0.08]] as const) {
      const ticks = [plain, blanket].map((sim) => {
        const e = dummy(sim, 'cucumber');
        applyStatus(sim, e, kind, 100, 3, null);
        advance(sim, 0.52);
        return 1e5 - e.hp;
      });
      expect(ticks[0], `${kind} without`).toBeCloseTo(100 * 0.5 * armour, 9);
      expect(ticks[1], `${kind} with`).toBeCloseTo(100 * 0.5 * armour * 1.08, 9);
    }
    // A shield takes the same 8% more as the health does: two blows of 30 at a cone (100 health, 40 shield) cost 32.4 + 32.4 in all, the shield first.
    for (const [sim, factor] of [[plain, 1], [blanket, 1.08]] as const) {
      const cone = foe(sim, 'cone', 0, 100);
      const wall = 100 * (enemySpec('cone').shield ?? NaN);
      expect(cone.shield).toBeCloseTo(wall, 9);
      expect(lost(sim, cone, 30, 'magic')).toBeCloseTo(30 * factor, 9);
      expect(cone.shield).toBeCloseTo(wall - 30 * factor, 9);
      expect(cone.hp).toBe(100);
      expect(lost(sim, cone, 30, 'magic')).toBeCloseTo(30 * factor, 9);
      expect(cone.shield).toBe(0);
      expect(cone.hp).toBeCloseTo(100 - (60 * factor - wall), 9);
    }
  });

  it('nap blanket: the damage factor is one of the vulnerability factors, multiplied with them and held under their cap of 2x', () => {
    const plain = newSim();
    const blanket = withRelic('nap_blanket');
    gainRelic(blanket, 'heating_pad');
    gainRelic(plain, 'heating_pad');
    quietWave(plain);
    quietWave(blanket);
    const armoured = 100 * (1 - 0.08);
    const hit = (sim: Sim, e: SimEnemy): number => {
      const before = e.hp;
      damageEnemy(sim, e, 100, 'physical', null, false, null);
      return before - e.hp;
    };
    const [a, b] = [plain, blanket].map((sim) => foe(sim, 'cucumber', 0, 1e5)) as [SimEnemy, SimEnemy];
    // The factor alone, then multiplied (not added) with a vulnerability of 25%: 1.25 x 1.08 = 1.35, not 1.33.
    expect(hit(blanket, b)).toBeCloseTo(armoured * 1.08, 9);
    for (const [sim, e] of [[plain, a], [blanket, b]] as const) applyStatus(sim, e, 'vulnerable', 0.25, 5, null);
    expect(hit(plain, a)).toBeCloseTo(armoured * 1.25, 9);
    expect(hit(blanket, b)).toBeCloseTo(armoured * 1.25 * 1.08, 9);
    // With the laser's focus (+15%) and a slowed enemy under the heating pad (+15%): 1.25 x 1.15 x 1.15 x 1.08 = 1.79, still under 2.
    for (const [sim, e] of [[plain, a], [blanket, b]] as const) {
      e.focused = true;
      applyStatus(sim, e, 'slow', 0.2, 5, null);
    }
    expect(hit(plain, a)).toBeCloseTo(armoured * 1.25 * 1.15 * 1.15, 9);
    expect(hit(blanket, b)).toBeCloseTo(armoured * 1.25 * 1.15 * 1.15 * 1.08, 9);
    expect(1.25 * 1.15 * 1.15 * 1.08).toBeLessThan(VULNERABLE_CAP);
    // A vulnerability of 60% brings the product to 1.6 x 1.15 x 1.15 = 2.1 before the blanket, so the cap holds it at 2x with or without it.
    for (const [sim, e] of [[plain, a], [blanket, b]] as const) applyStatus(sim, e, 'vulnerable', 0.6, 5, null);
    expect(hit(plain, a)).toBeCloseTo(armoured * VULNERABLE_CAP, 9);
    expect(hit(blanket, b)).toBeCloseTo(armoured * VULNERABLE_CAP, 9);
    // The blanket reaches the cap on its own account: a vulnerability of 65% alone is 1.65 x 1.08 = 1.78 with it; with the focus only, 1.65 x 1.15 x 1.08 = 2.05 is held at 2x
    // (1.65 x 1.15 = 1.90 without it is not). At 60% the same sum is 1.6 x 1.15 x 1.08 = 1.99, which no longer crosses the cap, so this case uses 65%.
    const [c, d] = [plain, blanket].map((sim) => foe(sim, 'cucumber', 0, 1e5)) as [SimEnemy, SimEnemy];
    for (const [sim, e] of [[plain, c], [blanket, d]] as const) applyStatus(sim, e, 'vulnerable', 0.65, 5, null);
    expect(hit(plain, c)).toBeCloseTo(armoured * 1.65, 9);
    expect(hit(blanket, d)).toBeCloseTo(armoured * 1.65 * 1.08, 9);
    for (const e of [c, d]) e.focused = true;
    expect(hit(plain, c)).toBeCloseTo(armoured * 1.65 * 1.15, 9);
    expect(hit(blanket, d)).toBeCloseTo(armoured * VULNERABLE_CAP, 9);
    expect(1.65 * 1.15).toBeLessThan(VULNERABLE_CAP);
    expect(1.65 * 1.15 * 1.08).toBeGreaterThan(VULNERABLE_CAP);
  });

  it('the hourglass alone keeps every enemy of the daily rule\'s 11-second wave inside it, and a bigger stretch still ends on the last tick', () => {
    // 0.6 s + 9 s x 1.1 = 10.5 s fits in the 11-second wave. buildSpawns also cuts the schedule at the last tick: were the summed stretch ever
    // larger (it was 18% while the blanket stretched the window as well; no toy does that now, so the second case sets it by hand), the
    // enemies due after the end would never come. A 15-second wave never gets near the end, so it is unchanged.
    for (const stretch of [0.1, 0.18]) {
      let atTheEnd = 0;
      for (let wave = 1; wave <= 23; wave++) {
        const sim = newSim({ mode: 'daily', modifiers: ['rush'] });
        gainRelic(sim, 'hourglass');
        sim.fx.spawnSlow = stretch;
        startWave(sim, wave);
        if (sim.waveKind !== 'normal') continue;
        expect(sim.waveDuration).toBe(11);
        for (const t of sim.spawnTimes) {
          expect(t, `${stretch} wave ${wave}`).toBeLessThan(sim.waveDuration);
          if (t > sim.waveDuration - 2 * TICK) atTheEnd++;
        }
        expect([...sim.spawnTimes], `${stretch} wave ${wave}`).toEqual([...sim.spawnTimes].sort((a, b) => a - b));
      }
      if (stretch === 0.1) expect(atTheEnd, 'the hourglass alone never gets there').toBe(0);
      else expect(atTheEnd).toBeGreaterThan(0);
    }
  });

  it('shooting star: every 12 seconds up to 5 enemies take wave-health x 0.7 of magic damage', () => {
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
    advance(sim, 11.8);
    expect(strikes).toHaveLength(0);
    advance(sim, 0.4);
    expect(strikes).toHaveLength(1);
    expect(strikes[0]).toMatchObject({ unitId: null, relic: 'shooting_star' });
    expect(strikes[0]!.points).toHaveLength(5);
    expect(hits).toHaveLength(5);
    const amount = hpIndex(sim.wave) * 0.7;
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
