import { randomUUID } from 'node:crypto';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { setGlobalOptions } from 'firebase-functions/v2';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import * as v1 from 'firebase-functions/v1';
import * as logger from 'firebase-functions/logger';
import { GoogleAuth } from 'google-auth-library';
import { cleanOrderIds, nextCursor, parseVoidedPage, startTimeFor, type RefundRecord } from './refunds';
import { cleanLook, grantedItems, grantWeeks, LOOK_COOLDOWN_MS, rankTier, RANK_REWARDS, weeksToSettle, type LookWire } from './looks';
import { addTicket, boardId, liveTickets, cleanName, defaultName, isBoardKind, NAME_COOLDOWN_MS, NEAR_MAX_WAVES, seoulWeekKey, TICKET_COOLDOWN_MS, validateRun, type BoardKind, type Run } from './rules';

initializeApp();
const db = getFirestore();
const REGION = 'asia-northeast3';
setGlobalOptions({ region: REGION, maxInstances: 10 });

const BOARDS: BoardKind[] = ['endless', 'week'];

// Typed error codes the client switches on; the message carries the same code.
function reject(reason: string): never {
  throw new HttpsError(reason === 'too-soon' ? 'resource-exhausted' : 'invalid-argument', reason);
}

/**
 * Accounts kept off the rankings (bans/{uid}, made by hand in the Firebase console, see docs/계정_Firebase.md): their records are refused,
 * and the folded boards and the weekly settlement leave them out. Read whole: a short list, one read per document.
 */
async function bannedUids(): Promise<Set<string>> {
  return new Set((await db.collection('bans').get()).docs.map((d) => d.id));
}

// An endless run starts: the server writes down when (runs/{uid}.tickets.<id>), so the record it sends at the end can be checked against
// real time (validateRun). The app asks for it at the run's start without waiting (and again a little later when that fails); a run that
// gets none does not reach the rankings. Within TICKET_COOLDOWN_MS of the last ticket the newest live one is given again: an older
// ticket only makes the real-time check stricter. Cost: 1 read + at most 1 write.
export const startRun = onCall(async (req) => {
  const uid = req.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'unauthenticated');
  const now = Date.now();
  const ref = db.doc(`runs/${uid}`);
  return db.runTransaction(async (tx) => {
    const doc = await tx.get(ref);
    const last = doc.get('at') as number | undefined;
    const newest = liveTickets(doc.get('tickets'), now)[0];
    if (newest && last !== undefined && now - last < TICKET_COOLDOWN_MS) return { ticket: newest[0] };
    const ticket = randomUUID().replace(/-/g, '');
    tx.set(ref, { at: now, tickets: addTicket(doc.get('tickets'), ticket, now) });
    return { ticket };
  });
});

// One finished endless run: its waves raise the player's record on every board it beats (the all-time one and this week's, the week
// taken from the server's clock in Seoul time). One call per run, so the per-player cooldown never drops a board. The run's ticket
// (startRun) is used up when the record is accepted, and also when it is refused as too fast, so a forger cannot probe the bound with it.
export const submitRun = onCall(async (req) => {
  const uid = req.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'unauthenticated');
  const data = req.data as { run?: unknown; ticket?: unknown } | undefined;
  const run = data?.run;
  const ticket = typeof data?.ticket === 'string' && /^[0-9a-f]{32}$/.test(data.ticket) ? data.ticket : null;
  const now = Date.now();
  const rateRef = db.doc(`rate/${uid}`);
  const runsRef = db.doc(`runs/${uid}`);

  // A refusal is returned out of the transaction, not thrown in it, so the burnt ticket's delete is kept.
  const result = await db.runTransaction(async (tx) => {
    const [rate, runs, ban] = await Promise.all([tx.get(rateRef), tx.get(runsRef), tx.get(db.doc(`bans/${uid}`))]);
    if (ban.exists) return { why: 'banned' as const };
    const last = (rate.get('at') as number | undefined) ?? null;
    const at = ticket ? (runs.get('tickets') as Record<string, unknown> | undefined)?.[ticket] : undefined;
    const why = validateRun(run, now, last, typeof at === 'number' ? at : null);
    if (why) {
      // Kept in the function log to tune the time floor and the waves cap from real runs (docs/계정_Firebase.md).
      if (why !== 'too-soon') logger.warn('submitRun rejected', { uid, why, run, ticketAge: typeof at === 'number' ? now - at : null });
      if (why === 'too-fast' && typeof at === 'number') tx.update(runsRef, { [`tickets.${ticket}`]: FieldValue.delete() });
      return { why };
    }
    const s = (run as Run).waves;
    if (s >= NEAR_MAX_WAVES) logger.warn('submitRun near the waves cap', { uid, run });

    const refs = BOARDS.map((kind) => db.doc(`boards/${boardId(kind, now)}/entries/${uid}`));
    const [user, ...entries] = await Promise.all([tx.get(db.doc(`users/${uid}`)), ...refs.map((r) => tx.get(r))]);
    const name = (user.get('name') as string | undefined) ?? defaultName(uid);
    // tx.set replaces the whole entry, so the player's look is carried over here (the field is left out when there is none: admin rejects undefined).
    const look = user.get('look') as LookWire | undefined;
    // The cooldown counts every accepted call, even one that raises nothing; the ticket cannot be sent twice.
    tx.set(rateRef, { at: now }, { merge: true });
    tx.update(runsRef, { [`tickets.${ticket}`]: FieldValue.delete() });
    const best: Record<string, number> = {};
    entries.forEach((entry, i) => {
      const prev = entry.exists ? (entry.get('score') as number) : 0;
      best[BOARDS[i] as BoardKind] = Math.max(prev, s);
      // The run's simulated seconds stay beside the record, to check the time floor against real runs later.
      if (s > prev) tx.set(refs[i]!, { score: s, name, at: Timestamp.fromMillis(now), seconds: (run as Run).seconds, ...(look && { look }) });
    });
    return { ok: true, best };
  });
  if (result.why) reject(result.why);
  return result;
});

// The player's ranking name: checked here (the rules keep clients from writing it), then put on the save document, on the player's records
// of both current boards and on the folded top 100s, so the ranking shows it at once instead of after the next fold.
// Cost: 1 rate read + 2 entry reads + 2 fold reads, and up to 6 writes.
export const setName = onCall(async (req) => {
  const uid = req.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'unauthenticated');
  const got = cleanName((req.data as { name?: unknown } | undefined)?.name);
  if ('why' in got) reject(got.why);
  const name = got.name;
  const now = Date.now();
  const rateRef = db.doc(`rate/${uid}`);
  const entryRefs = BOARDS.map((kind) => db.doc(`boards/${boardId(kind, now)}/entries/${uid}`));
  const foldRefs = BOARDS.map((kind) => db.doc(`boards/${kind}`));

  return db.runTransaction(async (tx) => {
    const [rate, ...docs] = await Promise.all([tx.get(rateRef), ...entryRefs.map((r) => tx.get(r)), ...foldRefs.map((r) => tx.get(r))]);
    const last = rate.get('nameAt') as number | undefined;
    if (last !== undefined && now - last < NAME_COOLDOWN_MS) reject('too-soon');
    tx.set(rateRef, { nameAt: now }, { merge: true });
    tx.set(db.doc(`users/${uid}`), { name }, { merge: true });
    entryRefs.forEach((ref, i) => {
      if (docs[i]!.exists) tx.update(ref, { name });
    });
    foldRefs.forEach((ref, i) => {
      const top = docs[BOARDS.length + i]!.get('top') as { uid: string; name: string; score: number; look?: LookWire }[] | undefined;
      if (top?.some((row) => row.uid === uid)) tx.update(ref, { top: top.map((row) => (row.uid === uid ? { ...row, name } : row)) });
    });
    return { ok: true, name };
  });
});

// The icon, frame, name plate and level the player wears, for the ranking rows other players see (docs/명세_프로필꾸미기.md 5.2). Same
// places as setName. Only rank items need an owner check (grants/{uid}); every other id just has to be a catalogue id of the right kind.
// Cost: 1 rate read + 1 grants read + 2 entry reads + 2 fold reads, and up to 6 writes.
export const setLook = onCall(async (req) => {
  const uid = req.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'unauthenticated');
  const now = Date.now();
  const rateRef = db.doc(`rate/${uid}`);
  const entryRefs = BOARDS.map((kind) => db.doc(`boards/${boardId(kind, now)}/entries/${uid}`));
  const foldRefs = BOARDS.map((kind) => db.doc(`boards/${kind}`));

  return db.runTransaction(async (tx) => {
    const [rate, grants, ...docs] = await Promise.all([
      tx.get(rateRef),
      tx.get(db.doc(`grants/${uid}`)),
      ...entryRefs.map((r) => tx.get(r)),
      ...foldRefs.map((r) => tx.get(r)),
    ]);
    const last = rate.get('lookAt') as number | undefined;
    if (last !== undefined && now - last < LOOK_COOLDOWN_MS) reject('too-soon');
    const look = cleanLook(req.data, grantedItems(grants.data()));
    if (!look) reject('bad-look');
    tx.set(rateRef, { lookAt: now }, { merge: true });
    tx.set(db.doc(`users/${uid}`), { look }, { merge: true });
    entryRefs.forEach((ref, i) => {
      if (docs[i]!.exists) tx.update(ref, { look });
    });
    foldRefs.forEach((ref, i) => {
      const top = docs[BOARDS.length + i]!.get('top') as { uid: string; look?: LookWire }[] | undefined;
      if (top?.some((row) => row.uid === uid)) tx.update(ref, { top: top.map((row) => (row.uid === uid ? { ...row, look } : row)) });
    });
    return { ok: true, look };
  });
});

// Runs every 10 minutes: 1 read per ban + 2 boards x (up to 100 reads + 1 per ban + 1 count aggregation) + 2 writes.
export const refreshBoards = onSchedule('every 10 minutes', async () => {
  const now = Date.now();
  const banned = await bannedUids();
  for (const kind of BOARDS) {
    const id = boardId(kind, now);
    const entries = db.collection(`boards/${id}/entries`);
    const [top, count] = await Promise.all([
      entries.orderBy('score', 'desc').orderBy('at', 'asc').limit(100 + banned.size).get(),
      entries.count().get(),
    ]);
    const doc: Record<string, unknown> = {
      // An entry written before looks existed has none; the row then leaves the field out (admin rejects undefined).
      top: top.docs.filter((d) => !banned.has(d.id)).slice(0, 100).map((d) => {
        const look = d.get('look') as LookWire | undefined;
        return { uid: d.id, name: d.get('name'), score: d.get('score'), ...(look && { look }) };
      }),
      total: count.data().count,
      updatedAt: FieldValue.serverTimestamp(),
    };
    if (kind === 'week') doc.weekId = id;
    await db.doc(`boards/${kind}`).set(doc);
  }
});

// Every hour: settles each finished week board that is not settled yet (meta/weekSettle.last is the newest settled week id) by writing the
// rank items of its top 100 to grants/{uid}.weeks.<week> (docs/명세_프로필꾸미기.md 5.3). The place is the position in the same query
// refreshBoards uses, so it needs no new index. The cursor moves only after a week's writes all succeeded; on a failure the run stops
// and the next hour retries, which is safe because rewriting the same values changes nothing. A merged set keeps the other weeks.
// Cost when a week is due (about once a week): 1 cursor read + per week 1 read per ban, up to 100 reads (plus 1 per ban) and 100 writes,
// 1 cursor write. Other hours: 1 read.
export const settleWeek = onSchedule({ schedule: 'every 1 hours', timeZone: 'Asia/Seoul' }, async () => {
  const cursorRef = db.doc('meta/weekSettle');
  const last = ((await cursorRef.get()).get('last') as string | undefined) ?? null;
  const weeks = weeksToSettle(last, Date.now(), seoulWeekKey);
  if (weeks.length === 0) return;
  for (const week of weeks) {
    try {
      // Banned accounts give up their places, read fresh for each week so a ban made during a retry counts.
      const banned = await bannedUids();
      const top = await db.collection(`boards/${week}/entries`).orderBy('score', 'desc').orderBy('at', 'asc').limit(100 + banned.size).get();
      const grants = top.docs.filter((d) => !banned.has(d.id)).slice(0, 100).flatMap((d, i) => {
        const tier = rankTier(i + 1);
        return tier ? [{ uid: d.id, rank: i + 1, items: RANK_REWARDS[tier] }] : [];
      });
      // At most 100 rows, so one batch (limit 500) always holds them.
      const batch = db.batch();
      for (const g of grants) batch.set(db.doc(`grants/${g.uid}`), { weeks: { [week]: { rank: g.rank, items: g.items } } }, { merge: true });
      await batch.commit();
      await cursorRef.set({ last: week, updatedAt: FieldValue.serverTimestamp() });
      logger.info('settleWeek done', { week, granted: grants.length });
    } catch (e) {
      logger.error('settleWeek failed; the cursor stays', { week, error: e instanceof Error ? e.message : String(e) });
      return;
    }
  }
});

// The rank rewards the signed-in player has earned, newest GRANT_WEEKS_KEPT weeks, for the app to claim (rules keep clients from writing
// grants). Cost: 1 read, no writes.
export const claimGrants = onCall(async (req) => {
  const uid = req.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'unauthenticated');
  return { weeks: grantWeeks((await db.doc(`grants/${uid}`).get()).data()) };
});

// Cost: one count() aggregation is billed as roughly 1 document read per 1000 index entries counted
// (minimum 1), plus 1 read for the caller's own entry. Rank = players with a strictly higher score + 1.
export const myRank = onCall(async (req) => {
  const uid = req.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'unauthenticated');
  const board = (req.data as { board?: unknown } | undefined)?.board;
  if (!isBoardKind(board)) reject('bad-board');
  const id = boardId(board, Date.now());
  const entries = db.collection(`boards/${id}/entries`);
  const mine = await entries.doc(uid).get();
  if (!mine.exists) return { ok: true, boardId: id, entry: null, rank: null };
  const score = mine.get('score') as number;
  const higher = await entries.where('score', '>', score).count().get();
  return { ok: true, boardId: id, entry: { score, name: mine.get('name') as string }, rank: higher.data().count + 1 };
});

// Entries do not store a uid field, so a collection group query could not find them without an extra index.
// Instead list the board documents (including week boards that exist only as parents of entries) and
// delete entries/{uid} in each: one list call plus one delete per board.
export const onUserDeleted = v1.region(REGION).auth.user().onDelete(async (user) => {
  const uid = user.uid;
  const boards = await db.collection('boards').listDocuments();
  const batch = db.batch();
  batch.delete(db.doc(`users/${uid}`));
  batch.delete(db.doc(`rate/${uid}`));
  batch.delete(db.doc(`grants/${uid}`));
  batch.delete(db.doc(`runs/${uid}`));
  for (const b of boards) batch.delete(b.collection('entries').doc(uid));
  await batch.commit();
});

const PACKAGE_NAME = 'com.bulssistudio.meowguard';
const VOIDED_URL = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${PACKAGE_NAME}/purchases/voidedpurchases`;
const CURSOR_REF = db.doc('meta/refundCursor');

// Every 6 hours: reads the voided one-time purchases Google Play lists since the saved cursor and writes refunds/{orderId}. The cursor
// (meta/refundCursor, server-only) moves only after every page was read and written, so any failure is simply retried by the next run.
// The cursor is the run start minus 1 day, so a void Google lists late is read again by the next runs.
// Cost: 1 cursor read, 1 write per voided order (batches of 500), 1 cursor write, and one API call per 1000 voided orders.
// Needs the Play Android Developer API on the Cloud project and the runtime service account added in Play Console (docs/계정_Firebase.md).
export const pollVoidedPurchases = onSchedule({ schedule: 'every 6 hours', timeZone: 'Asia/Seoul' }, async () => {
  const now = Date.now();
  const cursor = ((await CURSOR_REF.get()).get('at') as number | undefined) ?? null;
  const startTime = startTimeFor(cursor, now);
  const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/androidpublisher'] });
  let written = 0;
  let pageToken: string | null = null;
  try {
    do {
      const url = new URL(VOIDED_URL);
      url.searchParams.set('startTime', String(startTime));
      url.searchParams.set('maxResults', '1000');
      url.searchParams.set('type', '0');
      if (pageToken) url.searchParams.set('token', pageToken);
      const res = await (await auth.getClient()).request<unknown>({ url: url.toString() });
      const page = parseVoidedPage(res.data);
      for (let i = 0; i < page.records.length; i += 500) {
        const batch = db.batch();
        for (const r of page.records.slice(i, i + 500)) batch.set(db.doc(`refunds/${r.orderId}`), refundDoc(r, now));
        await batch.commit();
      }
      written += page.records.length;
      pageToken = page.nextPageToken;
    } while (pageToken);
  } catch (e) {
    logger.error('pollVoidedPurchases failed; the cursor stays', { startTime, written, error: e instanceof Error ? e.message : String(e) });
    return;
  }
  const next = nextCursor(cursor, now);
  if (next !== cursor) await CURSOR_REF.set({ at: next, updatedAt: FieldValue.serverTimestamp() });
  logger.info('pollVoidedPurchases done', { startTime, written, cursor: next });
});

function refundDoc(r: RefundRecord, seenAt: number) {
  return { voidedAt: Timestamp.fromMillis(r.voidedTimeMillis), reason: r.reason, source: r.source, seenAt: Timestamp.fromMillis(seenAt) };
}

// The client asks which of its purchase order ids Google Play has refunded. No sign-in (most players are guests); the answer only
// reports what pollVoidedPurchases wrote, so a client can never mark anything refunded. Cost: up to 200 document reads per call.
// TODO: enforce App Check here once the app registers a provider; until then only maxInstances bounds the load.
export const refundedOrders = onCall(async (req) => {
  const ids = cleanOrderIds((req.data as { orderIds?: unknown } | undefined)?.orderIds);
  if (!ids) throw new HttpsError('invalid-argument', 'bad-order-ids');
  if (ids.length === 0) return { refunded: [] as string[] };
  const docs = await db.getAll(...ids.map((id) => db.doc(`refunds/${id}`)));
  const refunded = ids.filter((_, i) => docs[i]!.exists);
  return { refunded };
});
