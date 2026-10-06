/**
 * Profile commands about spending: unit levels, training, chests, the daily shop, sweep tickets,
 * cosmetics, the piggy bank and the pay-with-ad-or-gems path. Rules are in the pure modules; this
 * class checks, charges, applies and reports.
 */
import { Rng } from '@/core/rng';
import { chestTotals, drawChest, pityTarget } from './chests';
import { ProfileCore } from './core';
import {
  CHEST_GEM_PRICE,
  MAX_LEVEL,
  PLACEMENTS,
  OFFERS,
  PIGGY_CAP,
  PIGGY_FREE_BREAK_DAYS,
  PIGGY_FREE_SHARE,
  SHOP_REFRESHES_PER_DAY,
  TICKET_AD_AMOUNT,
  TICKET_AD_DAILY,
  TICKET_GEMS,
  TICKET_HARD_CAP,
  TICKET_STOCK,
  TICKET_STOCK_PASS,
  TRAINING_MAX,
  type OfferId,
} from './data/economy';
import { COSMETICS, cosmetic, type CosmeticDef } from './data/catalog';
import { ODDS, oddsView, type OddsView } from './odds';
import { shopOffers, type ShopOffer } from './shop';
import { trainCost, quoteLevelUp, trainingEffects, RARITY_OF, type LevelQuote, type TrainingEffects } from './units';
import {
  BASE_UNITS,
  CHEST_RARITIES,
  TRAINING_IDS,
  fail,
  ok,
  type BaseUnitId,
  type Bundle,
  type ChestKind,
  type ChestRarity,
  type ChestResult,
  type Result,
  type TrainingId,
} from './types';

export type PayVia = 'ad' | 'gems';

const DAY_MS = 86_400_000;

export interface UnitView {
  id: BaseUnitId;
  rarity: ChestRarity;
  level: number;
  cards: number;
  /** Wild cards of this unit's rarity. */
  wild: number;
  quote: LevelQuote;
}

export interface TrainingRow {
  id: TrainingId;
  level: number;
  max: number;
  /** Gold for the next level, or null at the top. */
  cost: number | null;
}

export interface ShopView {
  date: string;
  offers: ShopOffer[];
  bought: boolean[];
  refreshesLeft: number;
}

export interface TicketView {
  count: number;
  stock: number;
  adsLeft: number;
  gemPrice: number;
}

export interface CosmeticRow extends CosmeticDef {
  owned: boolean;
  equipped: boolean;
}

export interface PiggyView {
  gems: number;
  cap: number;
  /** Free break is open (7 days since it started filling). */
  freeBreakReady: boolean;
  freeBreakGems: number;
  daysUntilFree: number;
}

export class EconomyProfile extends ProfileCore {
  // ───────────────────────────── paying ─────────────────────────────

  /** Show a rewarded ad. The AdService itself skips it for Butler Pass owners where the pass covers it. */
  protected async watchAd(placement: string): Promise<Result<void>> {
    const out = await this.deps.ads.showRewarded(placement);
    if (out === 'rewarded') return ok(undefined);
    return fail(out === 'capped' ? 'limit_reached' : out === 'dismissed' ? 'ad_failed' : 'unavailable');
  }

  /**
   * Pay for a rewarded offer with an ad or with gems. Only the payment happens here: the caller
   * applies the effect (revive the battle, reroll the relics, ...) when this returns ok.
   */
  async pay(offer: OfferId, via: PayVia): Promise<Result<void>> {
    const o = OFFERS[offer];
    if (via === 'gems') {
      if (!this.spend('gems', o.gems, o.reason)) return fail('not_enough_gems');
      this.commit();
      return ok(undefined);
    }
    return this.watchAd(o.ad);
  }

  // ───────────────────────────── unit levels ─────────────────────────────

  unitView(id: BaseUnitId): UnitView {
    const d = this.data;
    const rarity = RARITY_OF[id];
    return {
      id,
      rarity,
      level: d.levels[id],
      cards: d.cards[id],
      wild: d.wild[rarity],
      quote: quoteLevelUp(id, d.levels[id], d.cards[id], d.wild[rarity], d.gold),
    };
  }

  units(): UnitView[] {
    return BASE_UNITS.map((u) => this.unitView(u));
  }

  /** Spend the unit's cards (then wild cards) and gold for the next level. Returns the new level. */
  levelUp(id: BaseUnitId): Result<number> {
    const d = this.data;
    const rarity = RARITY_OF[id];
    const q = quoteLevelUp(id, d.levels[id], d.cards[id], d.wild[rarity], d.gold);
    if (q.maxed) return fail('max_level');
    if (!q.enoughCards) return fail('not_enough_cards');
    if (!q.enoughGold) return fail('not_enough_gold');
    this.spend('gold', q.gold, 'level_up');
    d.cards[id] -= q.ownUsed;
    d.wild[rarity] -= q.wildUsed;
    const level = ++d.levels[id];
    if (level >= MAX_LEVEL) this.settleMaxed(id);
    this.deps.analytics.track('unit_level', { unit: id, level });
    this.events.emit('unitLevel', { unit: id, level });
    this.commit();
    return ok(level);
  }

  // ───────────────────────────── training ─────────────────────────────

  trainingRows(): TrainingRow[] {
    return TRAINING_IDS.map((id) => {
      const level = this.data.training[id];
      return { id, level, max: TRAINING_MAX, cost: level >= TRAINING_MAX ? null : trainCost(level + 1) };
    });
  }

  trainingEffects(): TrainingEffects {
    return trainingEffects(this.data.training);
  }

  train(id: TrainingId): Result<number> {
    const level = this.data.training[id];
    if (level >= TRAINING_MAX) return fail('max_level');
    if (!this.spend('gold', trainCost(level + 1), 'training')) return fail('not_enough_gold');
    this.data.training[id] = level + 1;
    this.commit();
    return ok(level + 1);
  }

  // ───────────────────────────── chests ─────────────────────────────

  /** The odds screen of a chest, with the pity counter and the current bonus target. */
  oddsOf(kind: ChestKind): OddsView {
    const d = this.data;
    return oddsView(ODDS[kind], { goldOpened: d.goldOpened, target: pityTarget(d) });
  }

  buyChest(kind: ChestKind): Result<number> {
    const price = CHEST_GEM_PRICE[kind];
    if (price <= 0) return fail('invalid');
    if (!this.spend('gems', price, 'chest_buy')) return fail('not_enough_gems');
    this.addChest(kind, 1);
    this.commit();
    return ok(this.data.chests[kind]);
  }

  /**
   * Open a chest from the inventory. The whole draw is decided and written to disk before this
   * resolves, so an animation can never show something other than what was stored.
   */
  async openChest(kind: ChestKind): Promise<Result<ChestResult>> {
    const d = this.data;
    if (d.chests[kind] <= 0) return fail('nothing_to_claim');
    const seed = this.deps.seed() >>> 0;
    const table = ODDS[kind];
    const draw = drawChest(table, { levels: d.levels, cards: d.cards, goldOpened: d.goldOpened }, new Rng(seed));
    d.chests[kind]--;
    if (kind === 'gold') d.goldOpened++;
    const totals = chestTotals(draw.cards, draw.pity);
    let overflowGold = 0;
    for (const u of BASE_UNITS) overflowGold += this.addCards(u, totals.cards[u] ?? 0, 'chest_overflow');
    for (const r of CHEST_RARITIES) overflowGold += this.addWild(r, totals.wild[r] ?? 0, 'chest_overflow');
    const result: ChestResult = {
      id: d.nextRevealId++,
      kind,
      seed,
      oddsVersion: table.version,
      cards: draw.cards,
      pity: draw.pity,
      overflowGold,
      upgraded: draw.upgraded,
    };
    d.reveals.push(result);
    if (d.reveals.length > 20) d.reveals.shift();
    this.deps.analytics.track('chest_open', {
      chest: kind, cards: result.cards.length, upgraded: result.upgraded, pity: draw.pity.cards, odds: table.version,
    });
    this.events.emit('chest', result);
    this.commit();
    await this.flush();
    return ok(result);
  }

  /** The animation finished (or was skipped): forget the stored reveal. */
  ackReveal(id: number): void {
    const d = this.data;
    const i = d.reveals.findIndex((r) => r.id === id);
    if (i < 0) return;
    d.reveals.splice(i, 1);
    this.commit();
  }

  // ───────────────────────────── daily shop ─────────────────────────────

  shopView(): ShopView {
    const d = this.data;
    return {
      date: d.shop.date,
      offers: shopOffers(d.seed, d.shop.date, d.shop.salt),
      bought: d.shop.bought.slice(),
      refreshesLeft: Math.max(0, SHOP_REFRESHES_PER_DAY - d.day.shopRefreshes),
    };
  }

  buyShop(slot: number): Result<Bundle> {
    if (!this.featureUnlocked('shop')) return fail('locked');
    const d = this.data;
    const offer = shopOffers(d.seed, d.shop.date, d.shop.salt)[slot];
    if (!offer) return fail('invalid');
    if (d.shop.bought[slot]) return fail('already_claimed');
    if (offer.price.gold !== undefined && !this.spend('gold', offer.price.gold, 'shop_buy')) return fail('not_enough_gold');
    if (offer.price.gems !== undefined && !this.spend('gems', offer.price.gems, 'shop_buy')) return fail('not_enough_gems');
    d.shop.bought[slot] = true;
    this.applyBundle(offer.bundle, 'shop_buy');
    this.commit();
    return ok(offer.bundle);
  }

  /** New offers for one ad (twice a day). */
  async refreshShop(): Promise<Result<void>> {
    if (!this.featureUnlocked('shop')) return fail('locked');
    if (this.data.day.shopRefreshes >= SHOP_REFRESHES_PER_DAY) return fail('limit_reached');
    const paid = await this.watchAd(PLACEMENTS.shopRefresh);
    if (!paid.ok) return paid;
    const d = this.data;
    d.day.shopRefreshes++;
    d.shop.salt++;
    d.shop.bought = d.shop.bought.map(() => false);
    this.commit();
    return ok(undefined);
  }

  // ───────────────────────────── sweep tickets ─────────────────────────────

  private ticketStock(): number {
    return this.data.owned.butler ? TICKET_STOCK_PASS : TICKET_STOCK;
  }

  ticketView(): TicketView {
    const d = this.data;
    return {
      count: d.tickets,
      stock: this.ticketStock(),
      adsLeft: Math.max(0, TICKET_AD_DAILY - d.day.ticketAds),
      gemPrice: TICKET_GEMS,
    };
  }

  buyTicket(): Result<number> {
    if (this.data.tickets >= TICKET_HARD_CAP) return fail('limit_reached');
    if (!this.spend('gems', TICKET_GEMS, 'ticket_buy')) return fail('not_enough_gems');
    this.grant('tickets', 1, 'ticket_buy');
    this.commit();
    return ok(this.data.tickets);
  }

  async watchTicketAd(): Promise<Result<number>> {
    const d = this.data;
    if (d.day.ticketAds >= TICKET_AD_DAILY || d.tickets >= this.ticketStock()) return fail('limit_reached');
    const paid = await this.watchAd(PLACEMENTS.ticket);
    if (!paid.ok) return paid;
    d.day.ticketAds++;
    this.grant('tickets', Math.min(TICKET_AD_AMOUNT, Math.max(0, this.ticketStock() - d.tickets)), 'ticket_ad');
    this.commit();
    return ok(d.tickets);
  }

  // ───────────────────────────── cosmetics ─────────────────────────────

  get equipped(): { rug: string; fx: string } {
    return { rug: this.data.cosmetics.rug, fx: this.data.cosmetics.fx };
  }

  cosmetics(): CosmeticRow[] {
    const c = this.data.cosmetics;
    return COSMETICS.map((def) => ({
      ...def,
      owned: c.owned.includes(def.id),
      equipped: c.rug === def.id || c.fx === def.id,
    }));
  }

  buyCosmetic(id: string): Result<void> {
    const def = cosmetic(id);
    if (!def || def.source.type !== 'gems') return fail('invalid');
    if (this.data.cosmetics.owned.includes(id)) return fail('already_owned');
    if (!this.spend('gems', def.source.price, 'cosmetic_buy')) return fail('not_enough_gems');
    this.data.cosmetics.owned.push(id);
    this.commit();
    return ok(undefined);
  }

  equip(id: string): Result<void> {
    const def = cosmetic(id);
    if (!def) return fail('invalid');
    const c = this.data.cosmetics;
    if (!c.owned.includes(id)) return fail('not_owned');
    c[def.kind] = id;
    this.commit();
    return ok(undefined);
  }

  // ───────────────────────────── piggy bank ─────────────────────────────

  addPiggy(gems: number): void {
    const p = this.data.piggy;
    if (p.since === 0) p.since = this.now();
    p.gems = Math.min(PIGGY_CAP, p.gems + gems);
  }

  piggyView(): PiggyView {
    const p = this.data.piggy;
    const ageDays = p.since === 0 ? 0 : (this.now() - p.since) / DAY_MS;
    const ready = p.gems > 0 && ageDays >= PIGGY_FREE_BREAK_DAYS && !this.frozen;
    return {
      gems: p.gems,
      cap: PIGGY_CAP,
      freeBreakReady: ready,
      freeBreakGems: Math.floor(p.gems * PIGGY_FREE_SHARE),
      daysUntilFree: ready ? 0 : Math.max(0, Math.ceil(PIGGY_FREE_BREAK_DAYS - ageDays)),
    };
  }

  /** After 7 days the pool can be opened without paying, for a quarter of what is inside. */
  breakPiggyFree(): Result<number> {
    const v = this.piggyView();
    if (!v.freeBreakReady) return fail('not_ready');
    this.data.piggy = { gems: 0, since: 0 };
    this.grant('gems', v.freeBreakGems, 'piggy');
    this.commit();
    return ok(v.freeBreakGems);
  }
}
