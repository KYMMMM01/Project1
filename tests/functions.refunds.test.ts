import { describe, expect, it } from 'vitest';
import {
  CURSOR_OVERLAP_MS,
  MAX_LOOKUP_IDS,
  VOIDED_WINDOW_MS,
  cleanOrderIds,
  nextCursor,
  parseVoidedPage,
  startTimeFor,
} from '../functions/src/refunds';

describe('parseVoidedPage', () => {
  it('keeps items with a string orderId and reads the times and the next page token', () => {
    const page = parseVoidedPage({
      voidedPurchases: [
        { kind: 'androidpublisher#voidedPurchase', orderId: 'GPA.3300-1111-2222-33333', voidedTimeMillis: '1700000005000', voidedReason: 4 },
        { orderId: 'GPA.3300-1111-2222-44444', voidedTimeMillis: '1700000009000' },
        { voidedTimeMillis: '1700000010000' },
        { orderId: 42, voidedTimeMillis: '1700000011000' },
        { orderId: '' },
        null,
      ],
      tokenPagination: { nextPageToken: 'abc' },
    });
    expect(page.records).toEqual([
      { orderId: 'GPA.3300-1111-2222-33333', voidedTimeMillis: 1700000005000, reason: 4, source: 'play-voided' },
      { orderId: 'GPA.3300-1111-2222-44444', voidedTimeMillis: 1700000009000, reason: null, source: 'play-voided' },
    ]);
    expect(page.nextPageToken).toBe('abc');
  });

  it('survives an empty or malformed body', () => {
    for (const body of [undefined, null, {}, [], 'x', { voidedPurchases: 'no' }, { tokenPagination: {} }]) {
      expect(parseVoidedPage(body)).toEqual({ records: [], nextPageToken: null });
    }
    expect(parseVoidedPage({ tokenPagination: { nextPageToken: '' } }).nextPageToken).toBeNull();
  });
});

describe('cursor', () => {
  it('trails the run start by one day, so a void listed late is still read, and never moves back', () => {
    const run = 2_000_000_000_000;
    expect(nextCursor(null, run)).toBe(run - CURSOR_OVERLAP_MS);
    expect(nextCursor(run * 2, run)).toBe(run * 2);
    expect(nextCursor(5, run)).toBe(run - CURSOR_OVERLAP_MS);
    expect(CURSOR_OVERLAP_MS).toBe(24 * 3_600_000);
  });

  it('starts a first run, or one with an old cursor, at the API window and otherwise at the cursor', () => {
    const now = 2_000_000_000_000;
    expect(startTimeFor(null, now)).toBe(now - VOIDED_WINDOW_MS);
    expect(startTimeFor(1, now)).toBe(now - VOIDED_WINDOW_MS);
    expect(startTimeFor(now - 1000, now)).toBe(now - 1000);
    expect(VOIDED_WINDOW_MS).toBeLessThan(30 * 24 * 3_600_000);
  });
});

describe('cleanOrderIds', () => {
  const ok = 'GPA.3300-1111-2222-33333';

  it('keeps distinct Play order ids in order, including the renewal and test suffix', () => {
    expect(cleanOrderIds([ok, 'GPA.1234-5678-9012-34567..0', ok])).toEqual([ok, 'GPA.1234-5678-9012-34567..0']);
    expect(cleanOrderIds([])).toEqual([]);
  });

  it('drops anything that is not a Play order id', () => {
    const bad = ['', 'GPA.1', 'gpa.3300-1111-2222-33333', 'premium_pass:1700000000000', `refunds/${ok}`, `${ok}/x`, `${ok}\n`, 7, null, {}, `GPA.${'1'.repeat(41)}`];
    expect(cleanOrderIds([...bad, ok])).toEqual([ok]);
  });

  it('refuses a non array and more than the cap, and accepts exactly the cap', () => {
    for (const v of [undefined, null, ok, {}, 5]) expect(cleanOrderIds(v)).toBeNull();
    const ids = Array.from({ length: MAX_LOOKUP_IDS }, (_, i) => `GPA.0000-0000-0000-${10000 + i}`);
    expect(cleanOrderIds(ids)).toHaveLength(MAX_LOOKUP_IDS);
    expect(cleanOrderIds([...ids, ok])).toBeNull();
  });
});
