/**
 * The rankings (functions/src/index.ts): each finished endless run goes up through the submitRun function, which checks it and keeps the
 * player's best on the all-time board and on the week's (Seoul time);
 * every 10 minutes the server folds the top 100 of each board into one document, so opening the ranking costs one read. The player's own
 * place is asked for separately (myRank). Two boards: the endless mode's all-time best, and its best of the current week (Seoul time).
 */
import { defaultName, type NameReject } from '../../functions/src/rules';
import { account } from './account';
import { firebase } from './firebase';
import { errorMessage, settleWithin } from './util';

/** How long the ranking screen waits for the server before it says the board cannot be read (a weak signal keeps retrying). */
const READ_TIMEOUT_MS = 8_000;

export type BoardKey = 'endless' | 'week';

export interface BoardRow {
  uid: string;
  name: string;
  score: number;
}

export interface BoardView {
  top: BoardRow[];
  total: number;
  /** Epoch ms of the server's last fold; 0 when unknown. */
  updatedAt: number;
  /** The week board's week ('week-YYYY-MM-DD', its Monday in Seoul time); '' for the all-time board. */
  weekId: string;
}

export interface MyPlace {
  score: number;
  name: string;
  rank: number;
}

/** How a name change ended (the server's setName). */
export type NameResult = 'ok' | NameReject | 'too-soon' | 'failed';

/** What the server needs to judge a record: the waves of the run and its simulated seconds. */
export interface RunProof {
  waves: number;
  seconds: number;
}

const rows = (v: unknown): BoardRow[] =>
  Array.isArray(v)
    ? v.flatMap((r: { uid?: unknown; name?: unknown; score?: unknown }) =>
        typeof r?.uid === 'string' && typeof r.score === 'number' ? [{ uid: r.uid, name: String(r.name ?? ''), score: r.score }] : [],
      )
    : [];

/** Monday (YYYY-MM-DD) of the week holding `ms` in Seoul time: the server's week (functions/src/rules.ts seoulWeekKey). */
export function seoulWeek(ms: number): string {
  // Seoul has no daylight saving: its day is UTC + 9 hours.
  const day = new Date(ms + 9 * 3_600_000);
  const sinceMonday = (day.getUTCDay() + 6) % 7;
  return new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate() - sinceMonday)).toISOString().slice(0, 10);
}

export const ranking = {
  /** Sends one finished endless run. False when signed out, offline or refused; never throws (not the player's problem mid-game). */
  async submitRun(run: RunProof): Promise<boolean> {
    if (account.state().status !== 'on' || !Number.isFinite(run.waves) || run.waves <= 0) return false;
    const k = await firebase();
    if (!k) return false;
    try {
      const call = k.fnMod.httpsCallable(k.fns, 'submitRun');
      await call({ run: { waves: Math.trunc(run.waves), seconds: Math.round(run.seconds) } });
      return true;
    } catch (e) {
      console.warn('[ranking] submit refused:', errorMessage(e));
      return false;
    }
  },

  /**
   * Sets the player's ranking name (already checked with cleanName: the server checks it again and puts it on the boards at once).
   * Never throws.
   */
  async setName(name: string): Promise<NameResult> {
    if (account.state().status !== 'on') return 'failed';
    const k = await firebase();
    if (!k) return 'failed';
    try {
      await k.fnMod.httpsCallable(k.fns, 'setName', { timeout: 15_000 })({ name });
      return 'ok';
    } catch (e) {
      const why = /too-soon|blocked-name|bad-name/.exec(errorMessage(e))?.[0] as NameResult | undefined;
      if (!why) console.warn('[ranking] name refused:', errorMessage(e));
      return why ?? 'failed';
    }
  },

  /** The signed-in player's ranking name (the game's default one until they pick one); null signed out or offline. */
  async myName(): Promise<string | null> {
    const s = account.state();
    if (s.status !== 'on') return null;
    const k = await firebase();
    if (!k) return null;
    try {
      const snap = await settleWithin(k.dbMod.getDoc(k.dbMod.doc(k.db, 'users', s.uid)), READ_TIMEOUT_MS, null);
      if (!snap) return null;
      const name: unknown = snap.data()?.name;
      return typeof name === 'string' ? name : defaultName(s.uid);
    } catch (e) {
      console.warn('[ranking] name read failed:', errorMessage(e));
      return null;
    }
  },

  /** A board's top 100 as the server last folded it; null when it cannot be read (offline, no Firebase). Readable signed out too. */
  async board(board: BoardKey): Promise<BoardView | null> {
    const k = await firebase();
    if (!k) return null;
    try {
      const snap = await settleWithin(k.dbMod.getDoc(k.dbMod.doc(k.db, 'boards', board)), READ_TIMEOUT_MS, null);
      if (!snap) return null;
      if (!snap.exists()) return { top: [], total: 0, updatedAt: 0, weekId: '' };
      const d = snap.data();
      const at = d.updatedAt as { toMillis?: () => number } | undefined;
      const weekId = typeof d.weekId === 'string' ? d.weekId : '';
      // Just after Monday 00:00 in Seoul the fold may still hold last week (it runs every 10 minutes): that is an empty new week.
      if (board === 'week' && weekId !== '' && weekId !== `week-${seoulWeek(Date.now())}`) return { top: [], total: 0, updatedAt: 0, weekId };
      return { top: rows(d.top), total: Number(d.total) || 0, updatedAt: at?.toMillis?.() ?? 0, weekId };
    } catch (e) {
      console.warn('[ranking] board read failed:', errorMessage(e));
      return null;
    }
  },

  /** The signed-in player's record and place on a board; null without a record (or signed out, offline). */
  async mine(board: BoardKey): Promise<MyPlace | null> {
    if (account.state().status !== 'on') return null;
    const k = await firebase();
    if (!k) return null;
    try {
      const call = k.fnMod.httpsCallable<{ board: BoardKey }, { entry: { score: number; name: string } | null; rank: number | null }>(k.fns, 'myRank');
      const r = await settleWithin(call({ board }).then((x) => x.data), READ_TIMEOUT_MS, null);
      if (!r) return null;
      return r.entry && r.rank ? { score: r.entry.score, name: r.entry.name, rank: r.rank } : null;
    } catch (e) {
      console.warn('[ranking] place read failed:', errorMessage(e));
      return null;
    }
  },
};
