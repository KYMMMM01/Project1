import { initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { setGlobalOptions } from 'firebase-functions/v2';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import * as v1 from 'firebase-functions/v1';
import { boardId, cleanName, defaultName, isBoardKind, NAME_COOLDOWN_MS, validateRun, type BoardKind, type Run } from './rules';

initializeApp();
const db = getFirestore();
const REGION = 'asia-northeast3';
setGlobalOptions({ region: REGION, maxInstances: 10 });

const BOARDS: BoardKind[] = ['endless', 'week'];

// Typed error codes the client switches on; the message carries the same code.
function reject(reason: string): never {
  throw new HttpsError(reason === 'too-soon' ? 'resource-exhausted' : 'invalid-argument', reason);
}

// One finished endless run: its waves raise the player's record on every board it beats (the all-time one and this week's, the week
// taken from the server's clock in Seoul time). One call per run, so the per-player cooldown never drops a board.
export const submitRun = onCall(async (req) => {
  const uid = req.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'unauthenticated');
  const run = (req.data as { run?: unknown } | undefined)?.run;
  const now = Date.now();
  const rateRef = db.doc(`rate/${uid}`);

  return db.runTransaction(async (tx) => {
    const rate = await tx.get(rateRef);
    const last = (rate.get('at') as number | undefined) ?? null;
    const why = validateRun(run, now, last);
    if (why) reject(why);
    const s = (run as Run).waves;

    const refs = BOARDS.map((kind) => db.doc(`boards/${boardId(kind, now)}/entries/${uid}`));
    const [user, ...entries] = await Promise.all([tx.get(db.doc(`users/${uid}`)), ...refs.map((r) => tx.get(r))]);
    const name = (user.get('name') as string | undefined) ?? defaultName(uid);
    // The cooldown counts every accepted call, even one that raises nothing.
    tx.set(rateRef, { at: now }, { merge: true });
    const best: Record<string, number> = {};
    entries.forEach((entry, i) => {
      const prev = entry.exists ? (entry.get('score') as number) : 0;
      best[BOARDS[i] as BoardKind] = Math.max(prev, s);
      if (s > prev) tx.set(refs[i]!, { score: s, name, at: Timestamp.fromMillis(now) });
    });
    return { ok: true, best };
  });
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
      const top = docs[BOARDS.length + i]!.get('top') as { uid: string; name: string; score: number }[] | undefined;
      if (top?.some((row) => row.uid === uid)) tx.update(ref, { top: top.map((row) => (row.uid === uid ? { ...row, name } : row)) });
    });
    return { ok: true, name };
  });
});

// Runs every 10 minutes: 2 boards x (up to 100 reads + 1 count aggregation) + 2 writes.
export const refreshBoards = onSchedule('every 10 minutes', async () => {
  const now = Date.now();
  for (const kind of BOARDS) {
    const id = boardId(kind, now);
    const entries = db.collection(`boards/${id}/entries`);
    const [top, count] = await Promise.all([
      entries.orderBy('score', 'desc').orderBy('at', 'asc').limit(100).get(),
      entries.count().get(),
    ]);
    const doc: Record<string, unknown> = {
      top: top.docs.map((d) => ({ uid: d.id, name: d.get('name'), score: d.get('score') })),
      total: count.data().count,
      updatedAt: FieldValue.serverTimestamp(),
    };
    if (kind === 'week') doc.weekId = id;
    await db.doc(`boards/${kind}`).set(doc);
  }
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
  for (const b of boards) batch.delete(b.collection('entries').doc(uid));
  await batch.commit();
});
