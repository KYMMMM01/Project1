// What other players see of a player's profile (the icon, frame and name plate they wear, and their account level): the ids the server
// accepts and the checks on them. No firebase imports: the game imports this file too (src/meta/data/catalog.ts must list the same ids,
// tests/functions.looks.test.ts checks it), and so do the root vitest run and tsc. docs/명세_프로필꾸미기.md 5.2.

/** A look as it is stored on users/{uid}, on the board entries and on the folded top 100 rows: short keys, about 60 bytes a row. */
export interface LookWire {
  /** Icon id (icon_*). */
  i: string;
  /** Frame id (frame_*). */
  f: string;
  /** Name plate id (plate_*). */
  p: string;
  /** Account level, 1 to LOOK_MAX_LEVEL. */
  lv: number;
}

export type LookPart = 'i' | 'f' | 'p';

export const ICON_IDS: readonly string[] = [
  'icon_w_paw', 'icon_w_sword', 'icon_w_viking', 'icon_w_samurai', 'icon_w_tiger',
  'icon_r_sling', 'icon_r_archer', 'icon_r_ninja', 'icon_r_gunner', 'icon_r_star',
  'icon_m_snow', 'icon_m_fire', 'icon_m_storm', 'icon_m_frost', 'icon_m_cosmo',
  'icon_t_chef', 'icon_t_bell', 'icon_t_bard', 'icon_t_alch', 'icon_t_lucky',
];

export const FRAME_IDS: readonly string[] = [
  'frame_default', 'frame_wood', 'frame_leaf', 'frame_ribbon', 'frame_yarn', 'frame_star', 'frame_sakura',
  'frame_chapter', 'frame_butler', 'frame_dungeon', 'frame_endless', 'frame_awaken', 'frame_honor_butler', 'frame_honor_endless',
  'frame_rank_1', 'frame_rank_3', 'frame_rank_10', 'frame_rank_100',
];

export const PLATE_IDS: readonly string[] = [
  'plate_default', 'plate_dots', 'plate_stripe', 'plate_fish', 'plate_paw', 'plate_night', 'plate_garden',
  'plate_wins', 'plate_merge', 'plate_daily', 'plate_units', 'plate_account', 'plate_honor_relics', 'plate_honor_wins',
  'plate_rank_1', 'plate_rank_10',
];

/** Ids only the weekly ranking hands out: the server lets a player wear one only when grants/{uid} lists it (5.3). */
export const RANK_IDS: readonly string[] = ['frame_rank_1', 'frame_rank_3', 'frame_rank_10', 'frame_rank_100', 'plate_rank_1', 'plate_rank_10'];

/** What a player wears before choosing anything; also what an id this app does not know is drawn as. */
export const LOOK_DEFAULTS: Readonly<Record<LookPart, string>> = { i: 'icon_w_paw', f: 'frame_default', p: 'plate_default' };

const IDS: Readonly<Record<LookPart, readonly string[]>> = { i: ICON_IDS, f: FRAME_IDS, p: PLATE_IDS };

export const LOOK_MAX_LEVEL = 99;
/** Shortest wait between two look uploads of one player (rate/{uid}.lookAt). */
export const LOOK_COOLDOWN_MS = 30_000;

/** The rank items grants/{uid} holds: every item of every settled week ({ weeks: { [weekId]: { rank, items } } }). */
export function grantedItems(grants: unknown): Set<string> {
  return new Set(grantWeeks(grants).flatMap((g) => g.items));
}

/**
 * The look a setLook call asks for, as the server stores it, or null when the call is malformed (not an object, an id that is not a
 * string of the right kind, a level that is not an integer 1 to 99). A rank item the player was not granted is stored as the default.
 */
export function cleanLook(raw: unknown, granted: ReadonlySet<string>): LookWire | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const lv = r.level;
  if (typeof lv !== 'number' || !Number.isInteger(lv) || lv < 1 || lv > LOOK_MAX_LEVEL) return null;
  const pick = (part: LookPart, v: unknown): string | null => {
    if (typeof v !== 'string' || !IDS[part].includes(v)) return null;
    return RANK_IDS.includes(v) && !granted.has(v) ? LOOK_DEFAULTS[part] : v;
  };
  const i = pick('i', r.icon);
  const f = pick('f', r.frame);
  const p = pick('p', r.plate);
  return i && f && p ? { i, f, p, lv } : null;
}

/**
 * A stored look as the game draws it: an id this build does not know (a newer app's item) becomes the default of its part, and a
 * level out of range is clamped. Null when there is no look at all (a row folded before looks existed).
 */
export function readLook(v: unknown): LookWire | null {
  if (!v || typeof v !== 'object') return null;
  const r = v as Record<string, unknown>;
  const id = (part: LookPart): string => {
    const x = r[part];
    return typeof x === 'string' && IDS[part].includes(x) ? x : LOOK_DEFAULTS[part];
  };
  const n = typeof r.lv === 'number' && Number.isFinite(r.lv) ? Math.trunc(r.lv) : 1;
  return { i: id('i'), f: id('f'), p: id('p'), lv: Math.min(LOOK_MAX_LEVEL, Math.max(1, n)) };
}

/** Same look, field by field. */
export function sameLook(a: LookWire | null, b: LookWire | null): boolean {
  return !!a && !!b && a.i === b.i && a.f === b.f && a.p === b.p && a.lv === b.lv;
}

// --- Weekly ranking rewards (docs/명세_프로필꾸미기.md 5.3) ---

export type RankTier = 1 | 3 | 10 | 100;

/** The tier a place on a settled week falls in (1st, 2nd to 3rd, 4th to 10th, 11th to 100th), or null past 100. */
export function rankTier(place: number): RankTier | null {
  if (!Number.isInteger(place) || place < 1) return null;
  return place === 1 ? 1 : place <= 3 ? 3 : place <= 10 ? 10 : place <= 100 ? 100 : null;
}

/**
 * What each tier hands out. Only the tier's own items: a higher tier does not add the lower ones. The 1st place's trophy cat icon
 * (icon_rank_1) joins when its picture exists; the game's catalogue lists these ids with source { type: 'rank', tier }.
 */
export const RANK_REWARDS: Readonly<Record<RankTier, readonly string[]>> = {
  1: ['frame_rank_1', 'plate_rank_1'],
  3: ['frame_rank_3'],
  10: ['frame_rank_10', 'plate_rank_10'],
  100: ['frame_rank_100'],
};

/** Weeks of grants a player gets back (the app keeps as many rankClaimed keys). */
export const GRANT_WEEKS_KEPT = 52;

const WEEK_MS = 7 * 86_400_000;
const WEEK_ID = /^week-(\d{4}-\d{2}-\d{2})$/;

/**
 * The week boards settleWeek still has to settle, oldest first: every week after `last` (a board id, 'week-YYYY-MM-DD') up to the week
 * before the one holding `nowMs`; only last week when nothing was settled yet. At most GRANT_WEEKS_KEPT, the newest ones. `weekKey`
 * is seoulWeekKey (functions/src/rules.ts), passed in so this file keeps no other import.
 */
export function weeksToSettle(last: string | null, nowMs: number, weekKey: (ms: number) => string): string[] {
  const prev = Date.parse(weekKey(nowMs - WEEK_MS) + 'T00:00:00Z');
  const m = last ? WEEK_ID.exec(last) : null;
  const from = m ? Date.parse(m[1] + 'T00:00:00Z') + WEEK_MS : prev;
  const out: string[] = [];
  for (let t = from; t <= prev; t += WEEK_MS) out.push('week-' + new Date(t).toISOString().slice(0, 10));
  return out.slice(-GRANT_WEEKS_KEPT);
}

/** One settled week of a player's grants: the board id, the place and the items it hands out. */
export interface GrantWeek {
  week: string;
  rank: number;
  items: string[];
}

/** The well-formed weeks of a grants/{uid} document, oldest first, the newest GRANT_WEEKS_KEPT of them. */
export function grantWeeks(grants: unknown): GrantWeek[] {
  const weeks = (grants as { weeks?: unknown } | null | undefined)?.weeks;
  if (!weeks || typeof weeks !== 'object') return [];
  const out: GrantWeek[] = [];
  for (const [week, v] of Object.entries(weeks as Record<string, unknown>)) {
    const g = v as { rank?: unknown; items?: unknown } | null;
    if (!WEEK_ID.test(week) || !g || !Number.isInteger(g.rank) || !Array.isArray(g.items)) continue;
    out.push({ week, rank: g.rank as number, items: g.items.filter((x): x is string => typeof x === 'string') });
  }
  return out.sort((a, b) => (a.week < b.week ? -1 : a.week > b.week ? 1 : 0)).slice(-GRANT_WEEKS_KEPT);
}
