// Pure helpers for the Google Play refund check. No firebase imports, so the root vitest and tsc can import this file like rules.ts.

export const MAX_LOOKUP_IDS = 200;

/** The voided purchases API looks back 30 days at most; one hour less keeps the first request clear of the edge. */
export const VOIDED_WINDOW_MS = 30 * 24 * 3_600_000 - 3_600_000;

/** The cursor stays this far behind the run's own start time (not the newest void seen), so a void Google lists up to a day late is read again, never lost. */
export const CURSOR_OVERLAP_MS = 24 * 3_600_000;

export interface RefundRecord {
  orderId: string;
  voidedTimeMillis: number;
  reason: number | null;
  source: 'play-voided';
}

export interface VoidedPage {
  records: RefundRecord[];
  nextPageToken: string | null;
}

/**
 * One page of purchases.voidedpurchases.list (androidpublisher v3): { voidedPurchases: [{ orderId, voidedTimeMillis (a string),
 * voidedReason (a number), ... }], tokenPagination: { nextPageToken } }. Items without a string orderId are skipped (nothing to look up).
 */
export function parseVoidedPage(body: unknown): VoidedPage {
  const b = (body ?? {}) as { voidedPurchases?: unknown; tokenPagination?: { nextPageToken?: unknown } };
  const items = Array.isArray(b.voidedPurchases) ? (b.voidedPurchases as unknown[]) : [];
  const records: RefundRecord[] = [];
  for (const it of items) {
    const o = (it ?? {}) as { orderId?: unknown; voidedTimeMillis?: unknown; voidedReason?: unknown };
    if (typeof o.orderId !== 'string' || o.orderId === '') continue;
    const t = Number(o.voidedTimeMillis);
    const voidedTimeMillis = Number.isFinite(t) && t > 0 ? t : 0;
    records.push({
      orderId: o.orderId,
      voidedTimeMillis,
      reason: typeof o.voidedReason === 'number' ? o.voidedReason : null,
      source: 'play-voided',
    });
  }
  const token = b.tokenPagination?.nextPageToken;
  return { records, nextPageToken: typeof token === 'string' && token !== '' ? token : null };
}

/** The cursor to save after a run that read everything: the run's start time minus the overlap, never moving back. */
export function nextCursor(prev: number | null, runStart: number): number {
  return Math.max(prev ?? 0, runStart - CURSOR_OVERLAP_MS);
}

/** startTime for the next request: the cursor, but never older than the API's window (first run: the window's start). */
export function startTimeFor(cursor: number | null, now: number): number {
  return Math.max(cursor ?? 0, now - VOIDED_WINDOW_MS);
}

/**
 * Order ids a client may ask about. RevenueCat reports the Google Play order id as the transaction id: "GPA." plus digit groups joined
 * by dashes, with a ".." and a number after it on renewals and some test orders. Anything else (the app's own fallback ids, purchase
 * tokens, strings that could be read as a document path) is dropped here: it can never match a refund the server wrote from Play, so
 * dropping loses nothing, and the character set keeps a client from steering the Firestore reads.
 */
const ORDER_ID = /^GPA\.[0-9-]{10,40}(\.\.[0-9]{1,3})?$/;

/**
 * The cleaned lookup list: distinct valid order ids in the order given. null when the input is not an array of at most MAX_LOOKUP_IDS
 * items (the caller rejects the call; the client sends the ledger in chunks of that size).
 */
export function cleanOrderIds(input: unknown): string[] | null {
  if (!Array.isArray(input) || input.length > MAX_LOOKUP_IDS) return null;
  const out = new Set<string>();
  for (const id of input) if (typeof id === 'string' && ORDER_ID.test(id)) out.add(id);
  return [...out];
}
