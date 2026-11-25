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
  const out = new Set<string>();
  const weeks = (grants as { weeks?: unknown } | null | undefined)?.weeks;
  if (!weeks || typeof weeks !== 'object') return out;
  for (const w of Object.values(weeks as Record<string, unknown>)) {
    const items = (w as { items?: unknown } | null)?.items;
    if (Array.isArray(items)) for (const id of items) if (typeof id === 'string') out.add(id);
  }
  return out;
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
