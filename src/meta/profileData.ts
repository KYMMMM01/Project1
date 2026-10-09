/**
 * The persisted profile: defaults, clamping, migration and the SaveStore that holds it. The schema
 * type is in types.ts. Version 1; add a step to MIGRATIONS (version n -> n + 1) when it changes.
 */
import { SaveStore, deepFill } from '@/core/save';
import { emptyCounters } from '@/platform/adPolicy';
import { emptyLedger } from '@/platform/iapService';
import { DAILY_MISSIONS, WEEKLY_MISSIONS } from './data/schedule';
import { CHAPTER_COUNT, CHEST_BULK_MAX, MAX_LEVEL, TRAINING_MAX, TREAT_SLOTS } from './data/economy';
import { DUNGEON_TIERS } from './data/dungeon';
import { SHOP_SLOTS } from './data/catalog';
import { MAX_STAKE } from '@/game/data/roster';
import { freshDay, freshWeek } from './missions';
import { freshPass } from './pass';
import { BASE_UNITS, CHEST_KINDS, CHEST_RARITIES, TRAINING_IDS, type ProfileData } from './types';

export const PROFILE_VERSION = 1;
export const SAVE_KEY = 'meowguard.profile';

/** Upper bound for any counter: keeps a damaged or hand-edited save from overflowing the UI. */
const COUNTER_MAX = 2_000_000_000;
const ORDERS_KEPT = 300;
const REVEALS_KEPT = CHEST_BULK_MAX;

function zeroed<K extends string>(keys: readonly K[], v = 0): Record<K, number> {
  const out = {} as Record<K, number>;
  for (const k of keys) out[k] = v;
  return out;
}

export function defaultProfile(now: number, seed: number): ProfileData {
  return {
    createdAt: now,
    seed,
    gold: 0,
    gems: 0,
    tickets: 0,
    levels: zeroed(BASE_UNITS, 1),
    cards: zeroed(BASE_UNITS),
    wild: zeroed(CHEST_RARITIES),
    training: zeroed(TRAINING_IDS),
    chests: zeroed(CHEST_KINDS),
    reveals: [],
    nextRevealId: 1,
    goldOpened: 0,
    accountXp: 0,
    cleared: Array.from({ length: CHAPTER_COUNT }, () => 0),
    endless: { best: 0, week: '', weekBest: 0, claimed: [] },
    dungeon: { best: Array.from({ length: DUNGEON_TIERS }, () => ({ waves: 0, kills: 0, gold: 0 })) },
    stats: { runs: 0, wins: 0, merges: 0, kills: 0, bosses: 0, sweeps: 0 },
    time: { lastSeenAt: 0, lastActiveDate: '' },
    day: freshDay(''),
    week: freshWeek(''),
    calendar: { stamp: 0, lastDate: '', cycles: 0 },
    comeback: { pending: false, chestClaimed: false, patrolBoost: false },
    freeChest: { readyAt: 0 },
    patrol: { since: now },
    shop: { date: '', salt: 0, bought: Array.from({ length: SHOP_SLOTS }, () => false) },
    pass: freshPass(-1),
    piggy: { gems: 0, since: 0 },
    cosmetics: { owned: ['rug_default', 'fx_default'], rug: 'rug_default', fx: 'fx_default' },
    owned: { butler: false, once: [] },
    gemPass: { until: 0, lastClaimDate: '' },
    cup: { week: '', days: {}, claimed: [] },
    unlocked: [],
    orders: {},
    iapLedger: emptyLedger(),
    ads: emptyCounters(),
    pending: null,
    lastRun: null,
    nextRunId: 1,
  };
}

function clampInt(v: number, lo: number, hi: number): number {
  return Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.floor(v))) : lo;
}

function clampRecord<K extends string>(rec: Record<K, number>, keys: readonly K[], lo: number, hi: number): void {
  for (const k of keys) rec[k] = clampInt(rec[k], lo, hi);
}

function fitMissions(m: { progress: number[]; claimed: boolean[] }, count: number, defs: readonly { target: number }[]): void {
  m.progress = Array.from({ length: count }, (_, i) => clampInt(m.progress[i] ?? 0, 0, defs[i]?.target ?? 0));
  m.claimed = Array.from({ length: count }, (_, i) => m.claimed[i] === true);
}

/**
 * Bring a loaded or imported profile into range: counters non-negative, levels 1..10, fixed-size
 * arrays the right length. Mutates and returns `p`. Garbage in one field never costs the rest.
 */
export function normalizeProfile(p: ProfileData): ProfileData {
  for (const k of ['gold', 'gems', 'tickets', 'accountXp', 'goldOpened', 'nextRevealId', 'nextRunId'] as const) {
    p[k] = clampInt(p[k], k === 'nextRevealId' || k === 'nextRunId' ? 1 : 0, COUNTER_MAX);
  }
  clampRecord(p.levels, BASE_UNITS, 1, MAX_LEVEL);
  clampRecord(p.cards, BASE_UNITS, 0, COUNTER_MAX);
  clampRecord(p.wild, CHEST_RARITIES, 0, COUNTER_MAX);
  clampRecord(p.training, TRAINING_IDS, 0, TRAINING_MAX);
  clampRecord(p.chests, CHEST_KINDS, 0, COUNTER_MAX);
  p.cleared = Array.from({ length: CHAPTER_COUNT }, (_, i) => clampInt(p.cleared[i] ?? 0, 0, MAX_STAKE + 1));
  fitMissions(p.day.missions, DAILY_MISSIONS.length, DAILY_MISSIONS);
  fitMissions(p.week.missions, WEEKLY_MISSIONS.length, WEEKLY_MISSIONS);
  p.day.dungeon.used = clampInt(p.day.dungeon.used, 0, COUNTER_MAX);
  p.day.dungeon.bought = clampInt(p.day.dungeon.bought, 0, COUNTER_MAX);
  p.dungeon.best = Array.from({ length: DUNGEON_TIERS }, (_, i) => {
    const b = p.dungeon.best[i];
    return { waves: clampInt(b?.waves ?? 0, 0, COUNTER_MAX), kills: clampInt(b?.kills ?? 0, 0, COUNTER_MAX), gold: clampInt(b?.gold ?? 0, 0, COUNTER_MAX) };
  });
  p.day.treat = Array.from({ length: TREAT_SLOTS }, (_, i) => p.day.treat[i] === true);
  p.shop.bought = Array.from({ length: SHOP_SLOTS }, (_, i) => p.shop.bought[i] === true);
  p.piggy.gems = clampInt(p.piggy.gems, 0, COUNTER_MAX);
  p.calendar.stamp = clampInt(p.calendar.stamp, 0, 27);
  p.pass.xp = clampInt(p.pass.xp, 0, COUNTER_MAX);
  if (p.reveals.length > REVEALS_KEPT) p.reveals = p.reveals.slice(-REVEALS_KEPT);
  const ids = Object.keys(p.orders);
  if (ids.length > ORDERS_KEPT) {
    ids.sort((a, b) => (p.orders[a]?.t ?? 0) - (p.orders[b]?.t ?? 0));
    for (const id of ids.slice(0, ids.length - ORDERS_KEPT)) delete p.orders[id];
  }
  if (!p.cosmetics.owned.includes('rug_default')) p.cosmetics.owned.push('rug_default');
  if (!p.cosmetics.owned.includes('fx_default')) p.cosmetics.owned.push('fx_default');
  if (!p.cosmetics.owned.includes(p.cosmetics.rug)) p.cosmetics.rug = 'rug_default';
  if (!p.cosmetics.owned.includes(p.cosmetics.fx)) p.cosmetics.fx = 'fx_default';
  return p;
}

type Step = (raw: Record<string, unknown>) => Record<string, unknown>;

/** MIGRATIONS[n] upgrades a version-n profile to version n + 1. Empty while version 1 is the newest. */
export const MIGRATIONS: Readonly<Record<number, Step>> = {};

/** Walk `raw` from version `from` up to `target`; a missing step leaves the data as it is. */
export function migrateProfile(
  raw: unknown,
  from: number,
  table: Readonly<Record<number, Step>> = MIGRATIONS,
  target: number = PROFILE_VERSION,
): unknown {
  let cur = raw;
  for (let v = from; v < target; v++) {
    const step = table[v];
    if (step && cur && typeof cur === 'object') cur = step(cur as Record<string, unknown>);
  }
  return cur;
}

/**
 * Turn untrusted data (a backup code) into a valid profile, or null when it is not a profile at all.
 * Missing fields fall back to the defaults; out-of-range values are clamped.
 */
export function sanitizeProfile(raw: unknown, now: number, seed: number): ProfileData | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.gold !== 'number' || typeof r.gems !== 'number' || !r.levels || typeof r.levels !== 'object') return null;
  const filled = deepFill(raw, defaultProfile(now, seed)) as ProfileData;
  return normalizeProfile(filled);
}

export function createProfileStore(now: () => number, seed: () => number): SaveStore<ProfileData> {
  return new SaveStore<ProfileData>({
    key: SAVE_KEY,
    version: PROFILE_VERSION,
    defaults: () => defaultProfile(now(), seed()),
    migrate: (raw, from) => migrateProfile(raw, from),
  });
}
