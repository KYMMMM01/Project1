/**
 * A trail of where the game was, kept in local storage, so that the next start can tell whether the last one ended on its own.
 *
 * A phone that is short of memory closes a page without a word: nothing in the page runs after it, and the player only sees the game start again. The page can,
 * though, leave a mark each time something changes (a scene, a wave, a screen coming forward or going away) and read the marks at the next start: a trail that ends
 * with "hidden" is a player who went to another app (the system may have closed the page there, which is its right); a trail that ends anywhere else is a page that
 * was closed while it was in front of the player.
 *
 * The count and the place of those are what the settings screen shows (a test build is read by its owner from a screenshot of a tester) and `window.__dbg.crumbs`
 * returns (a debug session).
 */

const KEY = 'meowguard.crumbs';
/** Marks kept of the running page and of the one before it. */
const MAX_CRUMBS = 24;
/** Unclean ends remembered, and how long (ms). */
const MAX_ENDS = 12;
export const END_MEMORY_MS = 14 * 24 * 3600 * 1000;

export interface Crumb {
  /** Wall clock (ms). */
  t: number;
  /** What happened: `boot`, `scene`, `wave`, `hidden`, `visible`, `gl-lost`, `gl-reload`, `screen` ... */
  k: string;
  /** Where: a scene name, a wave number, a screen's name. */
  d?: string;
}

/** A page that was closed while it was in front of the player: when, and in what (the last scene its trail names). */
export interface End {
  t: number;
  where: string;
}

export interface CrumbStore {
  crumbs: Crumb[];
  ends: End[];
}

/** The kinds after which a page is not counted as having ended on its own: the player left it (another app, another tab, the browser's own close). */
const LEFT: ReadonlySet<string> = new Set(['hidden', 'unload']);

/** The last scene named in a trail (what the player was doing), or `boot` when the page never got further. */
export function whereOf(crumbs: readonly Crumb[]): string {
  for (let i = crumbs.length - 1; i >= 0; i--) {
    const c = crumbs[i] as Crumb;
    if (c.k === 'scene' && c.d) return c.d;
  }
  return 'boot';
}

/** Whether a trail ended in the way of a page that was closed under the player: it has marks, and the last one is not a leaving. */
export function endedUnderPlayer(crumbs: readonly Crumb[]): boolean {
  const last = crumbs[crumbs.length - 1];
  return !!last && !LEFT.has(last.k);
}

/** The store as the next page start sees it: the trail of the page before, judged, and a fresh trail for this one. */
export function startTrail(previous: CrumbStore | null, now: number): CrumbStore {
  const ends = (previous?.ends ?? []).filter((e) => now - e.t < END_MEMORY_MS);
  const before = previous?.crumbs ?? [];
  if (endedUnderPlayer(before)) {
    const last = before[before.length - 1] as Crumb;
    ends.push({ t: last.t, where: whereOf(before) });
  }
  return { crumbs: [{ t: now, k: 'boot' }], ends: ends.slice(-MAX_ENDS) };
}

/** `crumb` appended to a trail, the oldest dropped past `MAX_CRUMBS`. */
export function appendCrumb(store: CrumbStore, crumb: Crumb): CrumbStore {
  const crumbs = [...store.crumbs, crumb];
  if (crumbs.length > MAX_CRUMBS) crumbs.splice(0, crumbs.length - MAX_CRUMBS);
  return { crumbs, ends: store.ends };
}

/** How many ends are on record in the last `windowMs` before `now`, and the place of the latest. */
export function endsWithin(store: CrumbStore, now: number, windowMs: number): { count: number; where: string | null } {
  const recent = store.ends.filter((e) => now - e.t < windowMs);
  const last = recent[recent.length - 1];
  return { count: recent.length, where: last ? last.where : null };
}

function parse(raw: string | null): CrumbStore | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<CrumbStore> | null;
    if (!v || !Array.isArray(v.crumbs) || !Array.isArray(v.ends)) return null;
    const crumbs = v.crumbs.filter((c): c is Crumb => !!c && typeof c.t === 'number' && typeof c.k === 'string');
    const ends = v.ends.filter((e): e is End => !!e && typeof e.t === 'number' && typeof e.where === 'string');
    return { crumbs, ends };
  } catch {
    return null;
  }
}

let state: CrumbStore = { crumbs: [], ends: [] };

/** The store as local storage holds it now (the diagnostics page reads it without starting a trail of its own). */
export function readStore(): CrumbStore {
  return readStoreOrNull() ?? { crumbs: [], ends: [] };
}

function readStoreOrNull(): CrumbStore | null {
  try {
    return parse(localStorage.getItem(KEY));
  } catch {
    return null;
  }
}

function save(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // storage is full or not allowed: the trail then lives for this page only
  }
}

/** Begin the trail of this page (once, at boot): reads the one before it, notes whether it ended under the player. */
export function startCrumbs(now = Date.now()): void {
  state = startTrail(readStoreOrNull(), now);
  save();
}

/** Leave a mark. Cheap enough for a scene change or a wave, not for a frame. */
export function crumb(kind: string, detail?: string, now = Date.now()): void {
  state = appendCrumb(state, detail === undefined ? { t: now, k: kind } : { t: now, k: kind, d: detail });
  save();
}

/** What the trails say: ends of earlier pages within `windowMs` (default a week) and where the latest was. */
export function previousEnds(windowMs = 7 * 24 * 3600 * 1000, now = Date.now()): { count: number; where: string | null } {
  return endsWithin(state, now, windowMs);
}

/** The running page's trail (debug). */
export function currentTrail(): readonly Crumb[] {
  return state.crumbs;
}
