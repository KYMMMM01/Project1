/**
 * IapService: purchases with exactly-once grants.
 *
 * Money flow: platform confirms payment -> onPaid(orderId) -> grantOnce() -> handler(productId, orderId)
 * -> ledger marks the order granted -> adapter completes the order on the platform. The ledger is
 * persisted before AND after the handler runs, so:
 *   - app dies after payment, before the handler: the order is still pending on the platform; the next
 *     boot's recoverPending() grants it, once;
 *   - app dies after the handler, before the ledger says "granted": the entry is still "granting", the
 *     next boot calls the handler again with ctx.replay === true. The handler MUST be idempotent on
 *     orderId (docs/명세_메타.md section 7), which also makes the meta layer's own profile write atomic
 *     with the grant;
 *   - an order the ledger knows as granted is never passed to the handler again, only completed.
 *
 * Pure with respect to the DOM and to game/audio (they arrive through the injected ModalGate).
 */
import { getLang, type Lang } from '@/core/i18n';
import type { Analytics } from './analytics';
import type { ModalGate } from './modal';
import type { IapOutcome, IapProductDef, PendingOrder, PlatformAdapter } from './types';
import { errorMessage, settleWithin } from './util';

export interface GrantContext {
  /** true when an earlier attempt for this order may already have applied the grant. */
  replay: boolean;
}

/** Grant the product. Throw (or reject) to signal failure; the order then stays pending. */
export type GrantHandler = (productId: string, orderId: string, ctx: GrantContext) => Promise<void> | void;

export interface LedgerEntry {
  /** product id */
  p: string;
  /** granting = handler started (outcome unknown after a crash), granted = handler finished */
  s: 'granting' | 'granted';
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

export const LEDGER_MAX_ENTRIES = 500;

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
    if (r.s !== 'granting' && r.s !== 'granted') continue;
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

/** Union of two ledgers. 'granted' beats 'granting'; otherwise the newer entry wins. */
export function mergeLedgers(a: IapLedger, b: IapLedger): IapLedger {
  const out = emptyLedger();
  for (const src of [a, b]) {
    for (const [id, e] of Object.entries(src.orders)) {
      const cur = out.orders[id];
      if (!cur || (cur.s !== 'granted' && (e.s === 'granted' || e.t > cur.t))) out.orders[id] = { ...e };
    }
  }
  return out;
}

export interface IapServiceDeps {
  getAdapter(): PlatformAdapter;
  modal: ModalGate;
  analytics: Pick<Analytics, 'track'>;
  ledger?: IapLedgerStore;
  now?: () => number;
  lang?: () => Lang;
  /** A purchase sheet open longer than this settles 'failed' and is left to recoverPending(). Default 5 min. */
  purchaseWatchdogMs?: number;
  /** Timeout for each platform call during recovery. Default 8 s. */
  callTimeoutMs?: number;
}

export class IapService {
  private readonly products = new Map<string, IapProductDef>();
  private readonly storePrices = new Map<string, string>();
  private handler: GrantHandler | null = null;
  private store: IapLedgerStore;
  private ledger: IapLedger;
  private readonly inflight = new Map<string, Promise<boolean>>();
  private recovering: Promise<number> | null = null;
  /** A recovery was requested while one was already running: run once more when it ends. */
  private recoverAgain = false;
  private recoverDeferred = false;
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

  registerProducts(defs: readonly IapProductDef[]): void {
    for (const d of defs) this.products.set(d.id, d);
  }

  /**
   * The one place products are granted. Must be idempotent on orderId. Setting it also triggers any
   * recovery that boot had to defer because no handler existed yet.
   */
  setGrantHandler(handler: GrantHandler | null): void {
    this.handler = handler;
    if (handler && this.recoverDeferred) void this.recoverPending();
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
            return this.grantOnce(productId, orderId);
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
    // platform keeps pending is finished by recoverPending() at boot and whenever the app resumes.
    return outcome;
  }

  // ----- recovery --------------------------------------------------------------------------

  /**
   * Complete orders that were paid but never granted/completed (call at boot; boot does). Safe to call
   * any time and concurrently. Resolves with the number of orders it finished.
   */
  recoverPending(): Promise<number> {
    if (this.recovering) {
      // Single flight, but the request is not lost: whatever changed since the running pass began (a
      // grant handler that was just set, a payment that just landed) gets one more pass afterwards.
      this.recoverAgain = true;
      return this.recovering;
    }
    const run = this.doRecover()
      .catch(() => 0)
      .finally(() => {
        this.recovering = null;
        if (this.recoverAgain) {
          this.recoverAgain = false;
          void this.recoverPending();
        }
      });
    this.recovering = run;
    return run;
  }

  private async doRecover(): Promise<number> {
    const adapter = this.deps.getAdapter();
    const iap = adapter.iap;
    if (!iap || !adapter.capabilities.iap || !this.isAvailable()) return 0;
    if (!this.handler) {
      this.recoverDeferred = true;
      return 0;
    }
    this.recoverDeferred = false;
    const pending = await settleWithin<PendingOrder[]>(
      Promise.resolve().then(() => iap.pendingOrders()),
      this.callTimeoutMs,
      [],
    );
    let done = 0;
    for (const o of pending) {
      if (!o || typeof o.orderId !== 'string' || typeof o.productId !== 'string') continue;
      const ok = await this.grantOnce(o.productId, o.orderId);
      if (!ok) continue;
      await settleWithin(
        Promise.resolve().then(() => iap.complete(o.orderId)),
        this.callTimeoutMs,
        undefined,
      );
      done++;
      this.deps.analytics.track('iap_result', { product: o.productId, outcome: 'recovered', order: o.orderId });
    }
    return done;
  }

  // ----- the ledger ------------------------------------------------------------------------

  private grantOnce(productId: string, orderId: string): Promise<boolean> {
    const existing = this.inflight.get(orderId);
    if (existing) return existing;
    const p = this.doGrant(productId, orderId).finally(() => {
      this.inflight.delete(orderId);
    });
    this.inflight.set(orderId, p);
    return p;
  }

  private async doGrant(productId: string, orderId: string): Promise<boolean> {
    const entry = this.ledger.orders[orderId];
    if (entry?.s === 'granted') return true;
    const handler = this.handler;
    if (!handler) return false;
    const replay = entry?.s === 'granting';
    // Write-ahead: the order is on record before the handler can change anything.
    this.ledger.orders[orderId] = { p: productId, s: 'granting', t: this.now() };
    await this.persist();
    try {
      await handler(productId, orderId, { replay });
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
