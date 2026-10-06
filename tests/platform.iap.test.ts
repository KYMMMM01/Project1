import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createMemoryLedgerStore,
  emptyLedger,
  mergeLedgers,
  normalizeLedger,
  type GrantHandler,
  type IapLedger,
  type IapLedgerStore,
} from '@/platform/iapService';
import { fakeAdapter, makeIap, makePauser } from './platformHelpers';

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

const BRACKET = ['block:true', 'pause:true', 'mute:true', 'block:false', 'mute:false', 'pause:false'];

/** A ledger store that, like a real disk, keeps only what was written (deep copies). */
function diskLedger(): IapLedgerStore & { disk: IapLedger; writes: number } {
  const s = {
    disk: emptyLedger(),
    writes: 0,
    load: () => normalizeLedger(JSON.parse(JSON.stringify(s.disk))),
    save(l: IapLedger) {
      s.writes++;
      s.disk = JSON.parse(JSON.stringify(l)) as IapLedger;
    },
  };
  return s;
}

/** The game's grant function: idempotent on orderId, like docs/명세_메타.md section 7 requires. */
function wallet() {
  const applied = new Set<string>();
  const calls: Array<{ productId: string; orderId: string; replay: boolean; source: string }> = [];
  let gems = 0;
  const handler: GrantHandler = (productId, orderId, ctx) => {
    calls.push({ productId, orderId, replay: ctx.replay, source: ctx.source });
    if (applied.has(orderId)) return; // profile already holds this order
    applied.add(orderId);
    gems += productId === 'gems_80' ? 80 : 0;
  };
  return { handler, calls, applied, gems: () => gems };
}

describe('IapService.purchase', () => {
  it('grants once, completes the order, pauses and mutes around the sheet', async () => {
    const t = makeIap();
    const w = wallet();
    t.iap.setGrantHandler(w.handler);
    expect(await t.iap.purchase('gems_80')).toBe('purchased');
    expect(w.calls).toHaveLength(1);
    expect(w.gems()).toBe(80);
    expect(t.pauser.calls).toEqual(BRACKET);
    const orderId = w.calls[0]?.orderId ?? '';
    expect(t.iap.hasGranted(orderId)).toBe(true);
    expect(t.ledger.load().orders[orderId]).toMatchObject({ p: 'gems_80', s: 'granted' });
  });

  it('is paused and muted while the platform sheet is open', async () => {
    const t = makeIap();
    t.iap.setGrantHandler(wallet().handler);
    let finish!: () => void;
    t.fake.state.purchase = (onPaid, productId) =>
      new Promise((resolve) => {
        finish = () => void onPaid(`o-${productId}`).then((ok) => resolve(ok ? 'purchased' : 'failed'));
      });
    const p = t.iap.purchase('gems_80');
    await vi.advanceTimersByTimeAsync(0);
    expect(t.pauser.calls).toEqual(['block:true', 'pause:true', 'mute:true']);
    expect(t.modal.busy).toBe(true);
    finish();
    expect(await p).toBe('purchased');
    expect(t.pauser.calls).toEqual(BRACKET);
    expect(t.modal.busy).toBe(false);
  });

  it.each([
    ['cancelled', 'cancelled'],
    ['failed', 'failed'],
  ] as const)("passes through '%s' and restores pause/mute without granting", async (outcome, expected) => {
    const t = makeIap();
    const w = wallet();
    t.iap.setGrantHandler(w.handler);
    t.fake.state.purchase = async () => outcome;
    expect(await t.iap.purchase('gems_80')).toBe(expected);
    expect(w.calls).toHaveLength(0);
    expect(t.pauser.calls).toEqual(BRACKET);
  });

  it("is 'unavailable' without a grant handler, for unknown products, without platform IAP, while a modal is open", async () => {
    const a = makeIap();
    expect(await a.iap.purchase('gems_80')).toBe('unavailable'); // never sell what cannot be granted
    expect(a.pauser.calls).toEqual([]);

    const b = makeIap();
    b.iap.setGrantHandler(wallet().handler);
    expect(await b.iap.purchase('nope')).toBe('unavailable');

    const c = makeIap({ fake: fakeAdapter({ iap: false }) });
    c.iap.setGrantHandler(wallet().handler);
    expect(c.iap.isAvailable()).toBe(false);
    expect(await c.iap.purchase('gems_80')).toBe('unavailable');

    const d = makeIap();
    d.fake.state.iapAvailable = false; // bridge missing at runtime
    d.iap.setGrantHandler(wallet().handler);
    expect(await d.iap.purchase('gems_80')).toBe('unavailable');

    const e = makeIap();
    e.iap.setGrantHandler(wallet().handler);
    const lease = e.modal.acquire('ad:rewarded:revive');
    expect(lease).not.toBeNull();
    expect(await e.iap.purchase('gems_80')).toBe('unavailable'); // an ad is on screen
    lease?.release();
  });

  it('settles when the platform sheet never answers, and the game is released', async () => {
    const t = makeIap({ purchaseWatchdogMs: 60_000 });
    t.iap.setGrantHandler(wallet().handler);
    t.fake.state.purchase = () => new Promise(() => undefined);
    const p = t.iap.purchase('gems_80');
    await vi.advanceTimersByTimeAsync(60_000);
    expect(await p).toBe('failed');
    expect(t.pauser.calls).toEqual(BRACKET);
    expect(t.modal.busy).toBe(false);
  });

  it('a late payment after the watchdog is still granted exactly once', async () => {
    const t = makeIap({ purchaseWatchdogMs: 1000 });
    const w = wallet();
    t.iap.setGrantHandler(w.handler);
    let pay!: () => Promise<boolean>;
    t.fake.state.purchase = (onPaid, productId) =>
      new Promise(() => {
        pay = () => onPaid(`late-${productId}`);
      });
    const p = t.iap.purchase('gems_80');
    await vi.advanceTimersByTimeAsync(1000);
    expect(await p).toBe('failed');
    expect(await pay()).toBe(true);
    expect(await pay()).toBe(true);
    expect(w.calls).toHaveLength(1);
  });

  it('refuses to claim success when the adapter never reported an order', async () => {
    const t = makeIap();
    const w = wallet();
    t.iap.setGrantHandler(w.handler);
    t.fake.state.purchase = async () => 'purchased'; // bug: never called onPaid
    expect(await t.iap.purchase('gems_80')).toBe('failed');
  });

  it('shows the definition price for the language, preferring a store price', async () => {
    const t = makeIap();
    expect(t.iap.priceText('gems_80')).toBe('$1.29');
    expect(t.iap.productName('gems_80')).toBe('80 Gems');
    expect(t.iap.productName('premium_pass')).toBe('premium_pass');
    t.fake.adapter.iap!.products = async () => [{ id: 'gems_80', priceText: '₩1,600' }];
    await t.iap.refreshPrices();
    expect(t.iap.priceText('gems_80')).toBe('₩1,600');
    expect(t.iap.priceText('premium_pass')).toBe('$7.99');
  });

  it('asks the store for localised prices as soon as products are registered after boot', async () => {
    const t = makeIap();
    t.fake.adapter.iap!.products = async (ids) => ids.map((id) => ({ id, priceText: '₩1,600' }));
    expect(t.iap.priceText('gems_80')).toBe('$1.29');
    t.iap.registerProducts([{ id: 'extra', type: 'consumable', price: { ko: '', en: '$0.99' } }]);
    await vi.advanceTimersByTimeAsync(0);
    expect(t.iap.priceText('gems_80')).toBe('₩1,600');
    expect(t.iap.priceText('extra')).toBe('₩1,600');
  });

  it("emits 'iap_view' and 'iap_result'", async () => {
    const t = makeIap();
    t.iap.setGrantHandler(wallet().handler);
    await t.iap.purchase('gems_80');
    const names = t.analytics.buffer().map((e) => e.event);
    expect(names).toEqual(['iap_view', 'iap_result']);
    expect(t.analytics.buffer()[1]?.params).toMatchObject({ product: 'gems_80', outcome: 'purchased' });
  });
});

describe('IapService: exactly-once grants', () => {
  it('never calls the handler twice for one order, even with concurrent deliveries', async () => {
    const t = makeIap();
    const w = wallet();
    t.iap.setGrantHandler(w.handler);
    let pay!: (id: string) => Promise<boolean>;
    t.fake.state.purchase = (onPaid) =>
      new Promise(() => {
        pay = onPaid;
      });
    void t.iap.purchase('gems_80');
    await vi.advanceTimersByTimeAsync(0);
    const results = await Promise.all([pay('order-1'), pay('order-1'), pay('order-1')]);
    expect(results).toEqual([true, true, true]);
    expect(await pay('order-1')).toBe(true); // already granted: no handler call
    expect(w.calls).toHaveLength(1);
    expect(w.gems()).toBe(80);
  });

  it('crash between payment and grant: the next boot grants the pending order once', async () => {
    const fake = fakeAdapter();
    const disk = diskLedger();
    const w = wallet();

    // Boot 1: the store takes the money, the app dies before the grant handler ever runs.
    const boot1 = makeIap({ fake, ledger: disk });
    boot1.iap.setGrantHandler(w.handler);
    fake.state.purchase = async (_onPaid, productId) => {
      fake.state.pending.push({ orderId: 'order-77', productId });
      return 'failed'; // process killed here: onPaid never ran
    };
    expect(await boot1.iap.purchase('gems_80')).toBe('failed');
    expect(w.calls).toHaveLength(0);
    expect(fake.state.pending).toEqual([{ orderId: 'order-77', productId: 'gems_80' }]);

    // Boot 2: a fresh service over the same disk and the same platform recovers it.
    const boot2 = makeIap({ fake, ledger: disk });
    boot2.iap.setGrantHandler(w.handler);
    expect(await boot2.iap.recoverPending()).toBe(1);
    expect(w.calls).toEqual([{ productId: 'gems_80', orderId: 'order-77', replay: false, source: 'pending' }]);
    expect(w.gems()).toBe(80);
    expect(fake.state.completed).toEqual(['order-77']);
    expect(fake.state.pending).toEqual([]);
    expect(disk.disk.orders['order-77']).toMatchObject({ s: 'granted' });

    // Boot 3: nothing left to do, nothing granted again.
    const boot3 = makeIap({ fake, ledger: disk });
    boot3.iap.setGrantHandler(w.handler);
    expect(await boot3.iap.recoverPending()).toBe(0);
    expect(w.calls).toHaveLength(1);
  });

  it('crash after the grant ran but before the ledger said "granted": replayed once with replay=true, no double grant', async () => {
    const fake = fakeAdapter();
    const w = wallet();
    const disk = diskLedger();

    // The disk only ever sees the write-ahead entry: the "granted" write is lost with the process.
    const dyingStore: IapLedgerStore = {
      load: () => disk.load(),
      save: (l) => {
        if (Object.values(l.orders).some((e) => e.s === 'granted')) return; // process died before this write
        disk.save(l);
      },
    };
    const boot1 = makeIap({ fake, ledger: dyingStore });
    boot1.iap.setGrantHandler(w.handler);
    fake.state.purchase = async (onPaid, productId) => {
      fake.state.pending.push({ orderId: 'order-88', productId });
      await onPaid('order-88'); // grant applied to the profile...
      return 'failed'; // ...then the app died before the platform order was completed
    };
    await boot1.iap.purchase('gems_80');
    expect(w.gems()).toBe(80);
    expect(disk.disk.orders['order-88']).toMatchObject({ s: 'granting' });
    expect(fake.state.pending).toHaveLength(1);

    const boot2 = makeIap({ fake, ledger: disk });
    boot2.iap.setGrantHandler(w.handler);
    expect(await boot2.iap.recoverPending()).toBe(1);
    expect(w.calls.map((c) => c.replay)).toEqual([false, true]); // the handler is told it is a replay
    expect(w.gems()).toBe(80); // idempotent on orderId: still one grant
    expect(fake.state.completed).toEqual(['order-88']);
    expect(disk.disk.orders['order-88']).toMatchObject({ s: 'granted' });
  });

  it('an order the ledger knows as granted is only completed, never granted again', async () => {
    const fake = fakeAdapter();
    const disk = diskLedger();
    disk.disk = { v: 1, orders: { 'order-5': { p: 'gems_80', s: 'granted', t: 1 } } };
    fake.state.pending = [{ orderId: 'order-5', productId: 'gems_80' }]; // the app died before completing it
    const t = makeIap({ fake, ledger: disk });
    const w = wallet();
    t.iap.setGrantHandler(w.handler);
    expect(await t.iap.recoverPending()).toBe(1);
    expect(w.calls).toHaveLength(0);
    expect(fake.state.completed).toEqual(['order-5']);
  });

  it('a failing handler leaves the order pending and the next recovery retries it', async () => {
    const fake = fakeAdapter();
    const disk = diskLedger();
    fake.state.pending = [{ orderId: 'order-9', productId: 'gems_80' }];
    const t = makeIap({ fake, ledger: disk });
    let fail = true;
    const seen: boolean[] = [];
    t.iap.setGrantHandler((_p, _o, ctx) => {
      seen.push(ctx.replay);
      if (fail) throw new Error('profile not ready');
    });
    expect(await t.iap.recoverPending()).toBe(0);
    expect(fake.state.completed).toEqual([]);
    expect(fake.state.pending).toHaveLength(1);
    fail = false;
    expect(await t.iap.recoverPending()).toBe(1);
    expect(seen).toEqual([false, true]);
    expect(fake.state.completed).toEqual(['order-9']);
  });

  it('defers boot recovery until a grant handler exists, then runs by itself', async () => {
    const fake = fakeAdapter();
    fake.state.pending = [{ orderId: 'order-3', productId: 'gems_80' }];
    const t = makeIap({ fake });
    expect(await t.iap.recoverPending()).toBe(0); // boot: no handler yet
    expect(fake.state.pending).toHaveLength(1);
    const w = wallet();
    t.iap.setGrantHandler(w.handler); // the meta layer registers its handler
    await vi.advanceTimersByTimeAsync(0);
    await t.iap.recoverPending();
    expect(w.calls).toHaveLength(1);
    expect(fake.state.completed).toEqual(['order-3']);
  });

  it('boot race: a handler set in the same tick as the (deferred) boot recovery still triggers it', async () => {
    const fake = fakeAdapter();
    fake.state.pending = [{ orderId: 'order-4', productId: 'gems_80' }];
    const t = makeIap({ fake });
    const w = wallet();
    void t.iap.recoverPending(); // initPlatform(): no handler registered yet
    t.iap.setGrantHandler(w.handler); // the meta layer registers it before the boot pass has even settled
    await vi.advanceTimersByTimeAsync(0);
    expect(w.calls).toEqual([{ productId: 'gems_80', orderId: 'order-4', replay: false, source: 'pending' }]);
    expect(fake.state.completed).toEqual(['order-4']);
  });

  it('a platform that hangs or throws during recovery cannot hang the game', async () => {
    const fake = fakeAdapter();
    fake.adapter.iap!.pendingOrders = () => new Promise(() => undefined);
    const t = makeIap({ fake, callTimeoutMs: 500 });
    t.iap.setGrantHandler(wallet().handler);
    const p = t.iap.recoverPending();
    await vi.advanceTimersByTimeAsync(500);
    expect(await p).toBe(0);
    fake.adapter.iap!.pendingOrders = () => Promise.reject(new Error('offline'));
    expect(await t.iap.recoverPending()).toBe(0);
  });

  it('the pending-order recovery is single-flight', async () => {
    const fake = fakeAdapter();
    fake.state.pending = [{ orderId: 'order-1', productId: 'gems_80' }];
    const t = makeIap({ fake });
    const w = wallet();
    t.iap.setGrantHandler(w.handler);
    const [a, b] = await Promise.all([t.iap.recoverPending(), t.iap.recoverPending()]);
    expect(a).toBe(1);
    expect(b).toBe(1);
    expect(w.calls).toHaveLength(1);
  });
});

describe('IapService ledger store', () => {
  it('prunes old granted entries and merges stores without losing orders', () => {
    const a: IapLedger = { v: 1, orders: { x: { p: 'p', s: 'granting', t: 5 }, y: { p: 'p', s: 'granted', t: 1 } } };
    const b: IapLedger = { v: 1, orders: { x: { p: 'p', s: 'granted', t: 2 }, z: { p: 'q', s: 'granted', t: 3 } } };
    const m = mergeLedgers(a, b);
    expect(Object.keys(m.orders).sort()).toEqual(['x', 'y', 'z']);
    expect(m.orders.x?.s).toBe('granted'); // granted beats granting
    const r = mergeLedgers(m, { v: 1, orders: { x: { p: 'p', s: 'revoked', t: 0 } } });
    expect(r.orders.x?.s).toBe('revoked'); // a refund is final, however old the entry
    expect(normalizeLedger({ orders: { q: { p: 'p', s: 'revoked', t: 3 } } }).orders.q?.s).toBe('revoked');
  });

  it('attachLedger keeps what the old store knew', async () => {
    const t = makeIap();
    const w = wallet();
    t.iap.setGrantHandler(w.handler);
    await t.iap.purchase('gems_80');
    const orderId = w.calls[0]?.orderId ?? '';
    const profile = createMemoryLedgerStore();
    t.iap.attachLedger(profile);
    expect(t.iap.hasGranted(orderId)).toBe(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(profile.load().orders[orderId]).toMatchObject({ s: 'granted' });
  });

  it('survives a ledger store that throws on save', async () => {
    const throwing: IapLedgerStore = {
      load: () => emptyLedger(),
      save: () => {
        throw new Error('disk full');
      },
    };
    const t = makeIap({ ledger: throwing, pauser: makePauser() });
    t.iap.setGrantHandler(wallet().handler);
    expect(await t.iap.purchase('gems_80')).toBe('purchased');
  });
});
