import { describe, expect, it } from 'vitest';
import { Rng } from '@/core/rng';
import {
  applyGuarantees, chestTotals, drawChest, pityTarget, rarityCounts, rollRarities, type DrawState,
} from '@/meta/chests';
import { ODDS, ODDS_VERSION, type OddsTable } from '@/meta/odds';
import { UNITS_BY_RARITY } from '@/meta/units';
import { BASE_UNITS, CHEST_KINDS, CHEST_RARITIES, type BaseUnitId, type ChestKind, type ChestRarity } from '@/meta/types';
import { createTestProfile } from '@/meta/testing';

/** Critical chi-square values at p = 0.001 by degrees of freedom. */
const CHI_CRIT: Record<number, number> = { 1: 10.83, 2: 13.82, 3: 16.27 };

function chiSquare(observed: readonly number[], probs: readonly number[]): { stat: number; df: number } {
  const n = observed.reduce((a, b) => a + b, 0);
  let stat = 0;
  let df = -1;
  observed.forEach((o, i) => {
    const e = n * (probs[i] ?? 0);
    if (e <= 0) return;
    stat += ((o - e) * (o - e)) / e;
    df++;
  });
  return { stat, df };
}

/** A DrawState the simulation may change. */
type SimState = { levels: Record<BaseUnitId, number>; cards: Record<BaseUnitId, number>; goldOpened: number };

function freshState(rng: Rng): SimState & DrawState {
  const levels = {} as Record<BaseUnitId, number>;
  const cards = {} as Record<BaseUnitId, number>;
  for (const u of BASE_UNITS) {
    levels[u] = rng.int(1, 10);
    cards[u] = rng.int(0, 40);
  }
  return { levels, cards, goldOpened: 0 };
}

describe('chest odds (chi-square)', () => {
  for (const kind of CHEST_KINDS) {
    it(`${kind}: the rarity of a card follows the table (p > 0.001)`, () => {
      const table = ODDS[kind];
      const rng = new Rng(0xc0ffee + kind.length);
      const counts: Record<ChestRarity, number> = { common: 0, rare: 0, epic: 0, legendary: 0 };
      const chests = Math.ceil(200_000 / table.cards);
      for (let i = 0; i < chests; i++) for (const r of rollRarities(table, rng)) counts[r]++;
      const { stat, df } = chiSquare(CHEST_RARITIES.map((r) => counts[r]), table.rows.map((r) => r.p));
      expect(stat, `${kind} chi2=${stat.toFixed(2)} df=${df}`).toBeLessThan(CHI_CRIT[df] ?? Infinity);
    });
  }

  it('wild cards are 30% of every chest, and units inside a rarity are drawn evenly', () => {
    const rng = new Rng(99);
    const state = freshState(rng);
    let wild = 0;
    let all = 0;
    const perUnit = new Map<BaseUnitId, number>();
    for (let i = 0; i < 4000; i++) {
      const draw = drawChest(ODDS.gold, state, rng);
      for (const c of draw.cards) {
        all++;
        if (c.unit === null) wild++;
        else if (c.rarity === 'common') perUnit.set(c.unit, (perUnit.get(c.unit) ?? 0) + 1);
      }
    }
    const w = chiSquare([wild, all - wild], [0.3, 0.7]);
    expect(w.stat, `wild chi2=${w.stat.toFixed(2)}`).toBeLessThan(CHI_CRIT[1]!);
    const u = chiSquare(UNITS_BY_RARITY.common.map((id) => perUnit.get(id) ?? 0), [0.25, 0.25, 0.25, 0.25]);
    expect(u.stat, `unit chi2=${u.stat.toFixed(2)}`).toBeLessThan(CHI_CRIT[3]!);
  });

  it('keeps the effective rarity rates within half a point of the published ones after the guarantees', () => {
    const rng = new Rng(2026);
    const state = freshState(rng);
    const lines: string[] = [];
    for (const kind of ['silver', 'gold'] as const) {
      const table = ODDS[kind];
      const counts: Record<ChestRarity, number> = { common: 0, rare: 0, epic: 0, legendary: 0 };
      let total = 0;
      let upgraded = 0;
      const n = 20_000;
      for (let i = 0; i < n; i++) {
        const d = drawChest(table, state, rng);
        const rc = rarityCounts(d.cards);
        for (const r of CHEST_RARITIES) counts[r] += rc[r];
        total += d.cards.length;
        if (d.upgraded > 0) upgraded++;
      }
      for (const row of table.rows) {
        expect(Math.abs(counts[row.key] / total - row.p), `${kind} ${row.key}`).toBeLessThan(0.005);
      }
      lines.push(`${kind}: ${(100 * upgraded / n).toFixed(2)}% of chests needed the guarantee`);
    }
    console.log('[meta] ' + lines.join(' | '));
  });
});

describe('guarantees and pity over 10,000 simulated profiles', () => {
  it('never breaks: silver has an epic or better, gold has 3 legendary, the 10th gold chest pays its bonus', () => {
    let silverBreaks = 0;
    let goldBreaks = 0;
    let pityBreaks = 0;
    let pityChests = 0;
    let upgradedGold = 0;
    for (let p = 0; p < 10_000; p++) {
      const rng = new Rng(0x1000 + p);
      const state = freshState(rng);

      const silver = drawChest(ODDS.silver, state, rng);
      if (silver.cards.filter((c) => c.rarity === 'epic' || c.rarity === 'legendary').length < 1) silverBreaks++;
      if (silver.cards.length !== 24 || silver.pity.cards !== 0) silverBreaks++;

      for (let g = 0; g < 10; g++) {
        state.goldOpened = g;
        const d = drawChest(ODDS.gold, state, rng);
        const legendary = d.cards.filter((c) => c.rarity === 'legendary').length;
        if (legendary < 3 || d.cards.length !== 60) goldBreaks++;
        if (d.upgraded > 0) upgradedGold++;
        let target: BaseUnitId = UNITS_BY_RARITY.legendary[0]!;
        for (const u of UNITS_BY_RARITY.legendary) {
          if (state.levels[u] < state.levels[target] || (state.levels[u] === state.levels[target] && state.cards[u] < state.cards[target])) target = u;
        }
        if (g === 9) {
          pityChests++;
          if (d.pity.cards !== 8 || d.pity.unit !== target) pityBreaks++;
          state.cards[target] += 8;
        } else if (d.pity.cards !== 0 || d.pity.unit !== null) pityBreaks++;
        for (const c of d.cards) if (c.unit && c.rarity === 'legendary') state.cards[c.unit]++;
      }
    }
    expect({ silverBreaks, goldBreaks, pityBreaks }).toEqual({ silverBreaks: 0, goldBreaks: 0, pityBreaks: 0 });
    expect(pityChests).toBe(10_000);
    console.log(`[meta] 10,000 profiles: ${(upgradedGold / 100_000 * 100).toFixed(2)}% of gold chests were topped up to 3 legendary`);
  });

  it('repairs a chest whose raw roll is below the guarantee, raising only the lowest cards to the guaranteed rarity', () => {
    const table: OddsTable = { ...ODDS.gold, rows: [{ key: 'common', p: 1 }, { key: 'rare', p: 0 }, { key: 'epic', p: 0 }, { key: 'legendary', p: 0 }] };
    const rng = new Rng(5);
    const r = rollRarities(table, rng);
    expect(r.every((x) => x === 'common')).toBe(true);
    expect(applyGuarantees(r, table, rng)).toBe(3);
    expect(r.filter((x) => x === 'legendary')).toHaveLength(3);
    expect(r.filter((x) => x === 'common')).toHaveLength(57);

    const silver: OddsTable = { ...ODDS.silver, rows: table.rows };
    const s = rollRarities(silver, rng);
    applyGuarantees(s, silver, rng);
    expect(s.filter((x) => x === 'epic')).toHaveLength(1);
    expect(s.filter((x) => x === 'legendary')).toHaveLength(0);
  });

  it('draws only from the table it is given', () => {
    const all: OddsTable = { ...ODDS.wooden, rows: [{ key: 'common', p: 0 }, { key: 'rare', p: 1 }, { key: 'epic', p: 0 }, { key: 'legendary', p: 0 }] };
    const d = drawChest(all, freshState(new Rng(1)), new Rng(2));
    expect(d.cards.every((c) => c.rarity === 'rare')).toBe(true);
  });

  it('is decided by the seed alone', () => {
    const state = freshState(new Rng(3));
    const a = drawChest(ODDS.gold, state, new Rng(777));
    const b = drawChest(ODDS.gold, state, new Rng(777));
    const c = drawChest(ODDS.gold, state, new Rng(778));
    expect(a).toEqual(b);
    expect(a.cards).not.toEqual(c.cards);
  });

  it('aims the bonus at the lowest-level legendary, fewer cards then class order on ties', () => {
    const levels = Object.fromEntries(BASE_UNITS.map((u) => [u, 5])) as Record<BaseUnitId, number>;
    const cards = Object.fromEntries(BASE_UNITS.map((u) => [u, 0])) as Record<BaseUnitId, number>;
    expect(pityTarget({ levels, cards })).toBe('w_samurai');
    cards.w_samurai = 3;
    expect(pityTarget({ levels, cards })).toBe('r_gunner');
    levels.m_frost = 4;
    expect(pityTarget({ levels, cards })).toBe('m_frost');
    levels.t_alch = 4;
    cards.t_alch = 9;
    cards.m_frost = 10;
    expect(pityTarget({ levels, cards })).toBe('t_alch');
  });

  it('totals a chest per unit and per wild rarity, pity cards included', () => {
    const t = chestTotals(
      [
        { rarity: 'common', unit: 'w_paw' }, { rarity: 'common', unit: 'w_paw' },
        { rarity: 'rare', unit: null }, { rarity: 'legendary', unit: 'w_samurai' },
      ],
      { unit: 'w_samurai', cards: 8 },
    );
    expect(t).toEqual({ cards: { w_paw: 2, w_samurai: 9 }, wild: { rare: 1 } });
  });
});

describe('opening a chest through the profile', () => {
  async function stocked(kind: ChestKind, n: number) {
    const rig = await createTestProfile();
    rig.profile.data.chests[kind] = n;
    return rig;
  }

  it('stores the result before it resolves: a restart finds the same cards and the same reveal', async () => {
    const rig = await stocked('silver', 1);
    const r = await rig.profile.openChest('silver');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const owned = BASE_UNITS.reduce((a, u) => a + rig.profile.data.cards[u], 0) + CHEST_RARITIES.reduce((a, q) => a + rig.profile.data.wild[q], 0);
    expect(owned).toBe(24);
    expect(r.value.overflowGold).toBe(0);
    expect(rig.profile.data.chests.silver).toBe(0);
    expect(r.value.oddsVersion).toBe(ODDS_VERSION);
    expect(r.value.cards).toHaveLength(24);

    const again = await createTestProfile({ keepStorage: true });
    expect(again.profile.data.reveals).toEqual([r.value]);
    expect(again.profile.data.cards).toEqual(rig.profile.data.cards);
    expect(again.profile.data.wild).toEqual(rig.profile.data.wild);
    again.profile.ackReveal(r.value.id);
    expect(again.profile.data.reveals).toEqual([]);
  });

  it('counts gold chests for the pity cycle and credits the bonus to the target', async () => {
    const rig = await stocked('gold', 10);
    const target = pityTarget(rig.profile.data);
    for (let i = 0; i < 9; i++) {
      const r = await rig.profile.openChest('gold');
      expect(r.ok && r.value.pity.cards).toBe(0);
    }
    const view = rig.profile.oddsOf('gold');
    expect(view.pity?.counter).toBe(9);
    expect(view.pity?.next).toBe(true);
    const before = rig.profile.data.cards[rig.profile.oddsOf('gold').pity?.target ?? target];
    const tenth = await rig.profile.openChest('gold');
    expect(tenth.ok && tenth.value.pity).toEqual({ unit: view.pity?.target, cards: 8 });
    expect(rig.profile.data.cards[view.pity!.target!]).toBeGreaterThanOrEqual(before + 8);
    expect(rig.profile.oddsOf('gold').pity?.counter).toBe(0);
    expect(rig.profile.data.goldOpened).toBe(10);
  });

  it('turns cards nobody can use into gold instead of dropping them', async () => {
    const rig = await stocked('gold', 1);
    const d = rig.profile.data;
    for (const u of BASE_UNITS) d.levels[u] = 10;
    const r = await rig.profile.openChest('gold');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(BASE_UNITS.every((u) => d.cards[u] === 0)).toBe(true);
    expect(CHEST_RARITIES.every((q) => d.wild[q] === 0)).toBe(true);
    expect(d.gold).toBe(r.value.overflowGold);
    expect(r.value.overflowGold).toBeGreaterThan(60 * 10);
  });

  it('refuses to open a chest the player does not have, and to sell a wooden one', async () => {
    const rig = await stocked('wooden', 0);
    expect(await rig.profile.openChest('wooden')).toEqual({ ok: false, error: 'nothing_to_claim' });
    expect(rig.profile.buyChest('wooden')).toEqual({ ok: false, error: 'invalid' });
    expect(rig.profile.buyChest('silver')).toEqual({ ok: false, error: 'not_enough_gems' });
    rig.profile.grant('gems', 650, 'iap');
    expect(rig.profile.buyChest('silver').ok).toBe(true);
    expect(rig.profile.buyChest('gold').ok).toBe(true);
    expect(rig.profile.data.gems).toBe(0);
    expect(rig.profile.data.chests).toMatchObject({ silver: 1, gold: 1 });
  });
});
