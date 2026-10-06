/**
 * IapService: purchases with exactly-once grants, restorable without a server.
 *
 * Money flow: platform confirms payment -> onPaid(orderId) -> grantOnce() -> handler(productId, orderId)
 * -> ledger marks the order granted -> adapter completes the order on the platform. The ledger is
 * persisted before AND after the handler runs, so:
 *   - app dies after payment, before the handler: the order is still pending on the platform; the next
 *     boot's sync grants it, once;
 *   - app dies after the handler, before the ledger says "granted": the entry is still "granting", the
 *     next boot calls the handler again with ctx.replay === true. The handler MUST be idempotent on
 *     orderId (docs/명세_메타.md section 7), which also makes the meta layer's own profile write atomic
 *     with the grant;
 *   - an order the ledger knows as granted is never passed to the handler again, only completed.
 *
 * Restore (GDD 8.3): every boot, and the settings button, syncs with the platform's listings: pending
 * orders are granted and completed, completed orders missing from the ledger are granted again
 * (idempotently, ctx.source === 'restore'), refunded orders are reported once to the revoke handler.
 *
 * Pure with respect to the DOM and to game/audio (they arrive through the injected ModalGate).
 */
import { getLang, type Lang } from '@/core/i18n';
import type { Analytics } from './analytics';
import type { ModalGate } from './modal';
import { validateCatalogue, type PriceIssue } from './pricing';
import type { IapOutcome, IapProductDef, OrderRecord, PendingOrder, PlatformAdapter } from './types';
import { errorMessage, settleWithin } from './util';

/** Where a grant request came from. The meta layer may treat restored consumables differently. */
export type GrantSource = 'purchase' | 'pending' | 'restore';

export interface GrantContext {
  /** true when an earlier attempt for this order may already have applied the grant. */
  replay: boolean;
  source: GrantSource;
}

/** Grant the product. Throw (or reject) to signal failure; the order then stays pending. Idempotent on orderId. */
export type GrantHandler = (productId: string, orderId: string, ctx: GrantContext) => Promise<void> | void;

export interface RevokeContext {
  /** This device's ledger had granted the order: the entitlement really exists here. */
  wasGranted: boolean;
}

/** Take the product away because the platform refunded the order. Called once per order; idempotent on orderId. */
export type RevokeHandler = (productId: string, orderId: string, ctx: RevokeContext) => Promise<void> | void;

export interface LedgerEntry {
  /** product id */
  p: string;
  /**
   * granting = handler started (outcome unknown after a crash), granted = handler finished,
   * revoked = refunded and reported to the revoke handler (terminal: never granted again).
   */
  s: 'granting' | 'granted' | 'revoked';
  /** epoch ms of the last state change */
  t: number;
}

export interface IapLedger {
  v: 1;
  orders: Record<string, LedgerEntry>;
}

/** Where the ledger of processed order ids lives. The meta layer may store it in the profile. */
export interface IapLedgerStore {
  load(): IapLedger;
  save(ledger: IapLedger): void | Promise<void>;
}

/**
 * Oldest granted entries beyond this are dropped. Restore re-grants a completed order the ledger no
 * longer knows, so the bound sits far above any real player's order count.
 */
export const LEDGER_MAX_ENTRIES = 1000;

export function emptyLedger(): IapLedger {
  return { v: 1, orders: {} };
}

export function normalizeLedger(raw: unknown): IapLedger {
  const out = emptyLedger();
  if (!raw || typeof raw !== 'object') return out;
  const orders = (raw as { orders?: unknown }).orders;
  if (!orders || typeof orders !== 'object' || Array.isArray(orders)) return out;
  for (const [id, e] of Object.entries(orders as Record<string, unknown>)) {
    if (!e || typeof e !== 'object') continue;
    const r = e as Record<string, unknown>;
    if (typeof r.p !== 'string') continue;
    if (r.s !== 'granting' && r.s !== 'granted' && r.s !== 'revoked') continue;
    out.orders[id] = { p: r.p, s: r.s, t: typeof r.t === 'number' ? r.t : 0 };
  }
  return out;
}

export function createMemoryLedgerStore(): IapLedgerStore {
  let l = emptyLedger();
  return {
    load: () => l,
    save: (next) => {
      l = next;
    },
  };
}

const STATE_RANK: Record<LedgerEntry['s'], number> = { granting: 0, granted: 1, revoked: 2 };

/** Union of two ledgers. The further state wins (revoked > granted > granting); equal states: the newer entry. */
export function mergeLedgers(a: IapLedger, b: IapLedger): IapLedger {
  const out = emptyLedger();
  for (const src of [a, b]) {
    for (const [id, e] of Object.entries(src.orders)) {
      const cur = out.orders[id];
      if (!cur || STATE_RANK[e.s] > STATE_RANK[cur.s] || (e.s === cur.s && e.t > cur.t)) out.orders[id] = { ...e };
    }
  }
  return out;
}

/** What one sync with the platform's order listings did. */
export interface RestoreSummary {
  /** The platform answered every listing it offers and every grant/revoke went through. */
  ok: boolean;
  /** Orders newly granted by this pass (paid-but-pending ones and restored ones). */
  granted: number;
  /** Refunded orders newly reported to the revoke handler. */
  revoked: number;
  /** Pending orders finished (granted if needed, then completed on the platform). */
  finished: number;
  /** Why nothing could be checked. */
  reason?: 'unavailable' | 'no_handler' | 'failed';
}

export interface IapServiceDeps {
  getAdapter(): PlatformAdapter;
  modal: ModalGate;
  analytics: Pick<Analytics, 'track'>;
  ledger?: IapLedgerStore;
  now?: () => number;
  lang?: () => Lang;
  /** Build channel (VITE_PLATFORM), for catalogue price checks. */
  channel?: string;
  /** A purchase sheet open longer than this settles 'failed' and is left to the next sync. Default 5 min. */
  purchaseWatchdogMs?: number;
  /** Timeout for each platform call during a sync. Default 8 s. */
  callTimeoutMs?: number;
}

export class IapService {
  private readonly products = new Map<string, IapProductDef>();
  private readonly storePrices = new Map<string, string>();
  private handler: GrantHandler | null = null;
  private revoker: RevokeHandler | null = null;
  private store: IapLedgerStore;
  private ledger: IapLedger;
  private readonly inflight = new Map<string, Promise<boolean>>();
  private syncing: Promise<RestoreSummary> | null = null;
  private queuedFull: Promise<RestoreSummary> | null = null;
  /** A pending-only sync was requested while another ran: run once more when it ends. */
  private syncAgain = false;
  /** A boot-time sync found a handler missing: run the full sync as soon as it is set. */
  private syncDeferred = false;
  private persistQueue: Promise<void> = Promise.resolve();
  private readonly now: () => number;
  private readonly lang: () => Lang;
  private readonly purchaseWatchdogMs: number;
  private readonly callTimeoutMs: number;

  constructor(private readonly deps: IapServiceDeps) {
    this.now = deps.now ?? Date.now;
    this.lang = deps.lang ?? getLang;
    this.purchaseWatchdogMs = deps.purchaseWatchdogMs ?? 5 * 60_000;
    this.callTimeoutMs = deps.callTimeoutMs ?? 8000;
    this.store = deps.ledger ?? createMemoryLedgerStore();
    this.ledger = normalizeLedger(this.store.load());
  }

  // ----- configuration ---------------------------------------------------------------------

  /** Register the catalogue. Returns the price problems found (see pricing.ts); empty means clean. */
  registerProducts(defs: readonly IapProductDef[]): PriceIssue[] {
    for (const d of defs) this.products.set(d.id, d);
    const issues = validateCatalogue(defs, this.deps.channel);
    if (issues.length > 0 && import.meta.env.DEV) {
      console.warn('[iap] catalogue price problems:', issues);
    }
    void this.refreshPrices(); // boot may have asked before any product existed
    return issues;
  }

  /**
   * The one place products are granted. Must be idempotent on orderId. Setting it also runs the
   * sync that boot had to defer because no handler existed yet.
   */
  setGrantHandler(handler: GrantHandler | null): void {
    this.handler = handler;
    if (handler && this.syncDeferred) void this.restorePurchases();
  }

  /**
   * Where refunds go: take the entitlement away. Called once per refunded order. Setting it also runs
   * the sync boot had to defer.
   */
  setRevokeHandler(handler: RevokeHandler | null): void {
    this.revoker = handler;
    if (handler && this.syncDeferred) void this.restorePurchases();
  }

  /** Persist the ledger somewhere else (the profile). Entries already known are merged into it. */
  attachLedger(store: IapLedgerStore): void {
    this.ledger = mergeLedgers(normalizeLedger(store.load()), this.ledger);
    this.store = store;
    void this.persist();
  }

  // ----- queries ---------------------------------------------------------------------------

  /** IAP is sellable on this build right now. With an id: and that product is registered. */
  isAvailable(productId?: string): boolean {
    const a = this.deps.getAdapter();
    if (!a.capabilities.iap || !a.iap) return false;
    try {
      if (a.iap.isAvailable && !a.iap.isAvailable()) return false;
    } catch {
      return false;
    }
    return productId === undefined || this.products.has(productId);
  }

  product(id: string): IapProductDef | undefined {
    return this.products.get(id);
  }

  list(): IapProductDef[] {
    return [...this.products.values()];
  }

  /** Price to show: the store's localised price when known, else the definition's text for the language. */
  priceText(id: string): string {
    const store = this.storePrices.get(id);
    if (store) return store;
    const d = this.products.get(id);
    if (!d) return '';
    return d.price[this.lang()] || d.price.en || '';
  }

  productName(id: string): string {
    const d = this.products.get(id);
    return d?.name?.[this.lang()] ?? d?.name?.en ?? id;
  }

  /** Ask the platform for localised prices (Toss / store). Failures keep the definition's text. */
  async refreshPrices(): Promise<void> {
    const a = this.deps.getAdapter();
    const fn = a.iap?.products;
    if (!a.iap || !fn || !this.isAvailable()) return;
    const ids = [...this.products.keys()];
    if (ids.length === 0) return;
    const list = await settleWithin(
      Promise.resolve().then(() => fn.call(a.iap, ids)),
      this.callTimeoutMs,
      [],
    );
    for (const p of list) if (p && typeof p.id === 'string' && p.priceText) this.storePrices.set(p.id, p.priceText);
  }

  hasGranted(orderId: string): boolean {
    return this.ledger.orders[orderId]?.s === 'granted';
  }

  /** Snapshot for QA / debug. */
  ledgerSnapshot(): IapLedger {
    return JSON.parse(JSON.stringify(this.ledger)) as IapLedger;
  }

  // ----- purchasing ------------------------------------------------------------------------

  /**
   * Run the purchase flow for a registered product. While the platform sheet is open the game is
   * paused and muted (same gate as ads). Always settles.
   */
  async purchase(productId: string): Promise<IapOutcome> {
    const finish = (outcome: IapOutcome, why?: string): IapOutcome => {
      this.deps.analytics.track('iap_result', { product: productId, outcome, why });
      return outcome;
    };
    if (!this.handler) return finish('unavailable', 'no_grant_handler');
    if (!this.isAvailable(productId)) return finish('unavailable', 'not_available');
    const adapter = this.deps.getAdapter();
    const iap = adapter.iap;
    if (!iap) return finish('unavailable', 'no_iap');
    const lease = this.deps.modal.acquire(`iap:${productId}`);
    if (!lease) return finish('unavailable', 'busy');

    this.deps.analytics.track('iap_view', { product: productId });
    let paid = false;
    let outcome: IapOutcome;
    try {
      const info = { name: this.productName(productId), priceText: this.priceText(productId) };
      const attempt = Promise.resolve().then(() =>
        iap.purchase(
          productId,
          async (orderId) => {
            paid = true;
            return this.grantOnce(productId, orderId, 'purchase');
          },
          info,
        ),
      );
      outcome = await settleWithin<IapOutcome>(attempt, this.purchaseWatchdogMs, 'failed');
    } finally {
      lease.release();
    }
    if (outcome === 'purchased' && !paid) {
      // An adapter claiming success without ever reporting an order id is a bug: do not claim a grant.
      outcome = 'failed';
      this.deps.analytics.track('iap_result', { product: productId, outcome, why: 'purchased_without_order' });
    } else {
      finish(outcome);
    }
    // A payment that lands after the watchdog is still granted (onPaid stays live); anything the
    // platform keeps pending is finished by the next sync (boot, resume, restorePurchases()).
    return outcome;
  }

  // ----- sync with the platform ------------------------------------------------------------

  /**
   * Finish orders that were paid but never granted/completed. Cheap (one listing): boot, resume and
   * the dev tools use it. Safe to call any time and concurrently. Resolves with the number of
   * pending orders it finished.
   */
  recoverPending(): Promise<number> {
    return this.sync(false).then((r) => r.finished);
  }

  /**
   * Full restore, without a server: pending orders, then the platform's completed and refunded
   * listings (where it offers them). Anything completed that the ledger lacks is granted again,
   * idempotently; refunded orders go to the revoke handler once. Boot calls it; settings expose it as
   * the "restore purchases" button. Never rejects.
   */
  restorePurchases(): Promise<RestoreSummary> {
    return this.sync(true);
  }

  private sync(full: boolean): Promise<RestoreSummary> {
    const running = this.syncing;
    if (running) {
      if (!full) {
        // Single flight, but the request is not lost: whatever changed since the running pass began
        // (a handler that was just set, a payment that just landed) gets one more pass afterwards.
        this.syncAgain = true;
        return running;
      }
      // A caller that asked for the full restore must get its result, not that of a pending-only pass.
      this.queuedFull ??= running.then(() => {
        this.queuedFull = null;
        return this.sync(true);
      });
      return this.queuedFull;
    }
    const run = this.doSync(full)
      .catch((): RestoreSummary => ({ ok: false, granted: 0, revoked: 0, finished: 0, reason: 'failed' }))
      .finally(() => {
        this.syncing = null;
        if (this.syncAgain) {
          this.syncAgain = false;
          void this.sync(false);
        }
      });
    this.syncing = run;
    return run;
  }

  private async doSync(full: boolean): Promise<RestoreSummary> {
    const summary: RestoreSummary = { ok: true, granted: 0, revoked: 0, finished: 0 };
    const adapter = this.deps.getAdapter();
    const iap = adapter.iap;
    if (!iap || !adapter.capabilities.iap || !this.isAvailable()) return { ...summary, ok: false, reason: 'unavailable' };
    if (!this.handler) {
      this.syncDeferred = true;
      return { ...summary, ok: false, reason: 'no_handler' };
    }
    this.syncDeferred = false;

    const pending = await settleWithin<PendingOrder[] | null>(
      Promise.resolve().then(() => iap.pendingOrders()),
      this.callTimeoutMs,
      null,
    );
    if (pending === null) {
      summary.ok = false;
      summary.reason = 'failed';
    } else {
      for (const o of pending) {
        if (!o || typeof o.orderId !== 'string' || typeof o.productId !== 'string') continue;
        const known = this.hasGranted(o.orderId);
        if (!(await this.grantOnce(o.productId, o.orderId, 'pending'))) {
          summary.ok = false;
          continue;
        }
        await settleWithin(Promise.resolve().then(() => iap.complete(o.orderId)), this.callTimeoutMs, undefined);
        summary.finished++;
        if (!known) summary.granted++;
        this.deps.analytics.track('iap_result', { product: o.productId, outcome: 'recovered', order: o.orderId });
      }
    }
    if (!full || !iap.completedOrders) return summary;

    const listing = iap.completedOrders.bind(iap);
    const records = await settleWithin<OrderRecord[] | null>(Promise.resolve().then(listing), this.callTimeoutMs, null);
    if (records === null) {
      summary.ok = false;
      summary.reason = 'failed';
      return summary;
    }
    for (const o of records) {
      if (!o || typeof o.orderId !== 'string' || typeof o.productId !== 'string') continue;
      if (o.status === 'completed') {
        const known = this.hasGranted(o.orderId);
        if (await this.grantOnce(o.productId, o.orderId, 'restore')) {
          if (!known) {
            summary.granted++;
            this.deps.analytics.track('iap_result', { product: o.productId, outcome: 'restored', order: o.orderId });
          }
        } else if (this.ledger.orders[o.orderId]?.s !== 'revoked') {
          summary.ok = false;
        }
      } else if (o.status === 'refunded') {
        const r = await this.revokeOnce(o.productId, o.orderId);
        if (r === 'revoked') summary.revoked++;
        else if (r === 'deferred') summary.ok = false;
      }
    }
    if (summary.granted > 0 || summary.revoked > 0) {
      this.deps.analytics.track('iap_result', { outcome: 'restore', granted: summary.granted, revoked: summary.revoked });
    }
    return summary;
  }

  // ----- the ledger ------------------------------------------------------------------------

  private grantOnce(productId: string, orderId: string, source: GrantSource): Promise<boolean> {
    const existing = this.inflight.get(orderId);
    if (existing) return existing;
    const p = this.doGrant(productId, orderId, source).finally(() => {
      this.inflight.delete(orderId);
    });
    this.inflight.set(orderId, p);
    return p;
  }

  private async doGrant(productId: string, orderId: string, source: GrantSource): Promise<boolean> {
    const entry = this.ledger.orders[orderId];
    if (entry?.s === 'granted') return true;
    if (entry?.s === 'revoked') return false; // refunded: never grant it again
    const handler = this.handler;
    if (!handler) return false;
    const replay = entry?.s === 'granting';
    // Write-ahead: the order is on record before the handler can change anything.
    this.ledger.orders[orderId] = { p: productId, s: 'granting', t: this.now() };
    await this.persist();
    try {
      await handler(productId, orderId, { replay, source });
    } catch (e) {
      this.deps.analytics.track('iap_result', {
        product: productId,
        outcome: 'grant_failed',
        order: orderId,
        why: errorMessage(e),
      });
      return false;
    }
    this.ledger.orders[orderId] = { p: productId, s: 'granted', t: this.now() };
    this.prune();
    await this.persist();
    return true;
  }

  /** Report one refunded order to the revoke handler, once. 'deferred': no handler yet or it failed; retried next sync. */
  private async revokeOnce(productId: string, orderId: string): Promise<'revoked' | 'known' | 'deferred'> {
    const entry = this.ledger.orders[orderId];
    if (entry?.s === 'revoked') return 'known';
    const revoker = this.revoker;
    if (!revoker) {
      this.syncDeferred = true;
      return 'deferred';
    }
    // A grant still in flight for this order must finish first, so wasGranted tells the truth.
    await this.inflight.get(orderId)?.catch(() => false);
    const wasGranted = this.ledger.orders[orderId]?.s === 'granted';
    try {
      await revoker(productId, orderId, { wasGranted });
    } catch (e) {
      this.deps.analytics.track('iap_result', {
        product: productId,
        outcome: 'revoke_failed',
        order: orderId,
        why: errorMessage(e),
      });
      return 'deferred';
    }
    this.ledger.orders[orderId] = { p: productId, s: 'revoked', t: this.now() };
    await this.persist();
    return 'revoked';
  }

  private prune(): void {
    const granted = Object.entries(this.ledger.orders).filter(([, e]) => e.s === 'granted');
    if (granted.length <= LEDGER_MAX_ENTRIES) return;
    granted.sort((a, b) => a[1].t - b[1].t);
    for (const [id] of granted.slice(0, granted.length - LEDGER_MAX_ENTRIES)) delete this.ledger.orders[id];
  }

  private persist(): Promise<void> {
    this.persistQueue = this.persistQueue.then(async () => {
      try {
        await this.store.save(this.ledger);
      } catch {
        /* a failed ledger write must not fail a paid purchase; the platform order stays pending */
      }
    });
    return this.persistQueue;
  }
}
