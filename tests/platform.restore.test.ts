import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  emptyLedger,
  normalizeLedger,
  type GrantHandler,
  type IapLedger,
  type IapLedgerStore,
  type RevokeHandler,
} from '@/platform/iapService';
import type { OrderRecord } from '@/platform/types';
import { fakeAdapter, makeIap } from './platformHelpers';

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

/** A ledger store that, like a real disk, keeps only what was written. */
function diskLedger(): IapLedgerStore & { disk: IapLedger } {
  const s = {
    disk: emptyLedger(),
    load: () => normalizeLedger(JSON.parse(JSON.stringify(s.disk))),
    save(l: IapLedger) {
      s.disk = JSON.parse(JSON.stringify(l)) as IapLedger;
    },
  };
  return s;
}

/** The game side: a grant and a revoke function, both idempotent on orderId like the real ones must be. */
function game() {
  const owned = new Set<string>();
  const grants: Array<{ productId: string; orderId: string; source: string; replay: boolean }> = [];
  const revokes: Array<{ productId: string; orderId: string; wasGranted: boolean }> = [];
  const grant: GrantHandler = (productId, orderId, ctx) => {
    grants.push({ productId, orderId, source: ctx.source, replay: ctx.replay });
    owned.add(orderId);
  };
  const revoke: RevokeHandler = (productId, orderId, ctx) => {
    revokes.push({ productId, orderId, wasGranted: ctx.wasGranted });
    owned.delete(orderId);
  };
  return { owned, grants, revokes, grant, revoke };
}

const done = (orderId: string, productId = 'premium_pass'): OrderRecord => ({ orderId, productId, status: 'completed' });
const refunded = (orderId: string, productId = 'premium_pass'): OrderRecord => ({ orderId, productId, status: 'refunded' });

describe('IapService.restorePurchases: no server needed', () => {
  it('a new device (empty ledger) gets its completed orders back, each exactly once', async () => {
    const fake = fakeAdapter();
    fake.state.listing = [done('o-pass'), done('o-skin', 'skin_rug')];
    const t = makeIap({ fake });
    const g = game();
    t.iap.setGrantHandler(g.grant);
    t.iap.setRevokeHandler(g.revoke);
    const r = await t.iap.restorePurchases();
    expect(r).toMatchObject({ ok: true, granted: 2, revoked: 0 });
    expect(g.grants.map((c) => [c.orderId, c.source, c.replay])).toEqual([
      ['o-pass', 'restore', false],
      ['o-skin', 'restore', false],
    ]);
    expect(t.iap.hasGranted('o-pass')).toBe(true);
    // completed orders are not "completed" again on the platform
    expect(fake.state.completed).toEqual([]);
    // restoring again (every boot, the settings button) changes nothing
    expect(await t.iap.restorePurchases()).toMatchObject({ ok: true, granted: 0, revoked: 0 });
    expect(g.grants).toHaveLength(2);
  });

  it('only grants what the ledger is missing', async () => {
    const fake = fakeAdapter();
    fake.state.listing = [done('o-1'), done('o-2')];
    const disk = diskLedger();
    disk.disk = { v: 1, orders: { 'o-1': { p: 'premium_pass', s: 'granted', t: 1 } } };
    const t = makeIap({ fake, ledger: disk });
    const g = game();
    t.iap.setGrantHandler(g.grant);
    const r = await t.iap.restorePurchases();
    expect(r.granted).toBe(1);
    expect(g.grants.map((c) => c.orderId)).toEqual(['o-2']);
  });

  it('finishes pending orders first, then restores the completed ones (the boot sequence)', async () => {
    const fake = fakeAdapter();
    fake.state.pending = [{ orderId: 'o-paid', productId: 'gems_80' }];
    fake.state.listing = [done('o-old')];
    const t = makeIap({ fake });
    const g = game();
    t.iap.setGrantHandler(g.grant);
    const r = await t.iap.restorePurchases();
    expect(r).toMatchObject({ ok: true, granted: 2, finished: 1 });
    expect(g.grants.map((c) => [c.orderId, c.source])).toEqual([
      ['o-paid', 'pending'],
      ['o-old', 'restore'],
    ]);
    expect(fake.state.completed).toEqual(['o-paid']);
  });

  it('a grant that fails leaves the order unrecorded and is retried by the next restore', async () => {
    const fake = fakeAdapter();
    fake.state.listing = [done('o-1')];
    const disk = diskLedger();
    const t = makeIap({ fake, ledger: disk });
    let fail = true;
    const g = game();
    t.iap.setGrantHandler((p, o, c) => {
      if (fail) throw new Error('profile not ready');
      return g.grant(p, o, c);
    });
    expect(await t.iap.restorePurchases()).toMatchObject({ ok: false, granted: 0 });
    expect(t.iap.hasGranted('o-1')).toBe(false);
    fail = false;
    expect(await t.iap.restorePurchases()).toMatchObject({ ok: true, granted: 1 });
    expect(g.grants.map((c) => c.replay)).toEqual([true]); // the failed attempt left a "granting" entry: replay
  });

  it('survives a platform without a completed-orders listing, and one that hangs or throws', async () => {
    const fake = fakeAdapter();
    fake.state.pending = [{ orderId: 'o-p', productId: 'gems_80' }];
    delete fake.adapter.iap!.completedOrders;
    const t = makeIap({ fake, callTimeoutMs: 500 });
    const g = game();
    t.iap.setGrantHandler(g.grant);
    expect(await t.iap.restorePurchases()).toMatchObject({ ok: true, granted: 1 });

    const hang = fakeAdapter();
    hang.adapter.iap!.completedOrders = () => new Promise(() => undefined);
    hang.state.pending = [{ orderId: 'o-q', productId: 'gems_80' }];
    const u = makeIap({ fake: hang, callTimeoutMs: 500 });
    u.iap.setGrantHandler(g.grant);
    const p = u.iap.restorePurchases();
    await vi.advanceTimersByTimeAsync(500);
    expect(await p).toMatchObject({ ok: false, reason: 'failed', granted: 1 }); // the pending part still went through

    hang.adapter.iap!.completedOrders = () => Promise.reject(new Error('UNSUPPORTED_APP_VERSION'));
    expect(await u.iap.restorePurchases()).toMatchObject({ ok: false, reason: 'failed' });
  });

  it('says why nothing was checked: no IAP on this platform, or no grant handler yet', async () => {
    const none = makeIap({ fake: fakeAdapter({ iap: false }) });
    none.iap.setGrantHandler(game().grant);
    expect(await none.iap.restorePurchases()).toMatchObject({ ok: false, reason: 'unavailable', granted: 0 });
    const t = makeIap();
    expect(await t.iap.restorePurchases()).toMatchObject({ ok: false, reason: 'no_handler' });
  });

  it('boot defers the restore until the handler exists, then runs it by itself', async () => {
    const fake = fakeAdapter();
    fake.state.listing = [done('o-1')];
    const t = makeIap({ fake });
    await t.iap.restorePurchases(); // boot: nothing registered yet
    const g = game();
    t.iap.setGrantHandler(g.grant);
    await vi.advanceTimersByTimeAsync(0);
    expect(g.grants.map((c) => c.orderId)).toEqual(['o-1']);
  });

  it('a restore asked for while a pending-only recovery runs still returns the full result', async () => {
    const fake = fakeAdapter();
    fake.state.pending = [{ orderId: 'o-p', productId: 'gems_80' }];
    fake.state.listing = [done('o-c')];
    const t = makeIap({ fake });
    const g = game();
    t.iap.setGrantHandler(g.grant);
    const quick = t.iap.recoverPending();
    const full = t.iap.restorePurchases();
    expect(await quick).toBe(1);
    expect(await full).toMatchObject({ ok: true, granted: 1 }); // o-p was already granted by the quick pass
    expect(g.grants.map((c) => c.orderId).sort()).toEqual(['o-c', 'o-p']);
    expect(g.grants).toHaveLength(2);
  });

  it('a live purchase and a restore racing on one order grant it once', async () => {
    const fake = fakeAdapter();
    const t = makeIap({ fake });
    const g = game();
    t.iap.setGrantHandler(g.grant);
    let pay!: (id: string) => Promise<boolean>;
    fake.state.purchase = (onPaid) =>
      new Promise(() => {
        pay = onPaid;
      });
    void t.iap.purchase('premium_pass');
    await vi.advanceTimersByTimeAsync(0);
    fake.state.listing = [done('o-race')];
    const [paid, restored] = await Promise.all([pay('o-race'), t.iap.restorePurchases()]);
    expect(paid).toBe(true);
    expect(restored.ok).toBe(true);
    expect(g.grants).toHaveLength(1);
  });
});

describe('IapService: refunds go to the revoke handler', () => {
  it('reports a refunded order once, tells whether it was granted here, and never grants it', async () => {
    const fake = fakeAdapter();
    const disk = diskLedger();
    disk.disk = { v: 1, orders: { 'o-bought': { p: 'premium_pass', s: 'granted', t: 1 } } };
    fake.state.listing = [refunded('o-bought'), refunded('o-elsewhere', 'skin_rug')];
    const t = makeIap({ fake, ledger: disk });
    const g = game();
    t.iap.setGrantHandler(g.grant);
    t.iap.setRevokeHandler(g.revoke);
    const r = await t.iap.restorePurchases();
    expect(r).toMatchObject({ ok: true, granted: 0, revoked: 2 });
    expect(g.revokes).toEqual([
      { productId: 'premium_pass', orderId: 'o-bought', wasGranted: true },
      { productId: 'skin_rug', orderId: 'o-elsewhere', wasGranted: false },
    ]);
    expect(g.grants).toEqual([]);
    expect(disk.disk.orders['o-bought']).toMatchObject({ s: 'revoked' });
    // every boot lists them again: they are not reported again
    expect(await t.iap.restorePurchases()).toMatchObject({ ok: true, revoked: 0 });
    expect(g.revokes).toHaveLength(2);
    // and a revoked order that shows up as pending or completed is never granted back
    fake.state.pending = [{ orderId: 'o-bought', productId: 'premium_pass' }];
    fake.state.listing = [done('o-bought')];
    await t.iap.restorePurchases();
    expect(g.grants).toEqual([]);
  });

  it('keeps the refund for later when there is no revoke handler or it throws', async () => {
    const fake = fakeAdapter();
    fake.state.listing = [refunded('o-1')];
    const t = makeIap({ fake });
    const g = game();
    t.iap.setGrantHandler(g.grant);
    expect(await t.iap.restorePurchases()).toMatchObject({ ok: false, revoked: 0 });
    // setting the handler runs the deferred sync by itself
    t.iap.setRevokeHandler(g.revoke);
    await vi.advanceTimersByTimeAsync(0);
    expect(g.revokes.map((c) => c.orderId)).toEqual(['o-1']);

    const fake2 = fakeAdapter();
    fake2.state.listing = [refunded('o-2')];
    const u = makeIap({ fake: fake2 });
    u.iap.setGrantHandler(g.grant);
    let boom = true;
    u.iap.setRevokeHandler((p, o, c) => {
      if (boom) throw new Error('profile locked');
      return g.revoke(p, o, c);
    });
    expect(await u.iap.restorePurchases()).toMatchObject({ ok: false, revoked: 0 });
    boom = false;
    expect(await u.iap.restorePurchases()).toMatchObject({ ok: true, revoked: 1 });
  });

  it('a purchase later refunded: bought, then the store lists it as refunded', async () => {
    const fake = fakeAdapter();
    const t = makeIap({ fake });
    const g = game();
    t.iap.setGrantHandler(g.grant);
    t.iap.setRevokeHandler(g.revoke);
    expect(await t.iap.purchase('premium_pass')).toBe('purchased');
    const orderId = g.grants[0]?.orderId ?? '';
    expect(g.owned.has(orderId)).toBe(true);
    fake.state.listing = [refunded(orderId)];
    await t.iap.restorePurchases();
    expect(g.owned.has(orderId)).toBe(false);
    expect(g.revokes).toEqual([{ productId: 'premium_pass', orderId, wasGranted: true }]);
  });

  it('writes restore results to analytics', async () => {
    const fake = fakeAdapter();
    fake.state.listing = [done('o-1'), refunded('o-2')];
    const t = makeIap({ fake });
    t.iap.setGrantHandler(game().grant);
    t.iap.setRevokeHandler(game().revoke);
    await t.iap.restorePurchases();
    const params = t.analytics.buffer().map((e) => e.params);
    expect(params).toContainEqual(expect.objectContaining({ outcome: 'restored', order: 'o-1' }));
    expect(params).toContainEqual(expect.objectContaining({ outcome: 'restore', granted: 1, revoked: 1 }));
  });
});
