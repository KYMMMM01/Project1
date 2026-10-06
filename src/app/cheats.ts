/**
 * QA helpers on `window.__dbg.meta` (debug builds and `?debug=1` only): give currencies and cards,
 * fake finished runs, unlock everything, and move the meta clock. Never part of the normal flow.
 */
import { debugEnabled, debugExpose } from '@/core/debug';
import type { RunStats } from '@/game';
import { BASE_UNITS, profile, systemClock, type ChestKind } from '@/meta';

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

const SHIFT_KEY = 'meowguard.debug.clockShift';

/**
 * Wall-clock offset added to the meta clock. It is kept across reloads: the save remembers the
 * latest time it saw, so a page that came back on the real clock would read as "clock set back" and
 * freeze every time reward. `?fresh=1` and `reset()` clear it together with the save.
 */
let clockShift = 0;

function loadShift(): number {
  if (new URLSearchParams(location.search).has('fresh')) return 0;
  try {
    return Number(localStorage.getItem(SHIFT_KEY)) || 0;
  } catch {
    return 0;
  }
}

function storeShift(): void {
  try {
    if (clockShift === 0) localStorage.removeItem(SHIFT_KEY);
    else localStorage.setItem(SHIFT_KEY, String(clockShift));
  } catch {
    // Private mode: the shift then lasts for this page load only.
  }
}

function changed(): void {
  profile.events.emit('change', null);
  profile.persist();
}

function fakeStats(chapter: number, stake: number, victory: boolean): RunStats {
  return {
    mode: 'chapter', chapter, stake, seed: 1, victory, wavesCleared: victory ? 24 : 9, totalWaves: 24, kills: 120,
    bossesKilled: 2, summons: 30, merges: 12, molts: 1, awakenings: 0, relics: [], bestRarity: 'rare', peakEnemies: 20,
    duration: 420, revived: false, summonLuck: 0.5, damageByUnit: {},
  };
}

/** Put the saved clock offset on the meta clock. Boot calls this before the profile loads, so the load already sees the shifted time. */
export function installClockShift(): void {
  if (!debugEnabled()) return;
  const realWall = systemClock.wall.bind(systemClock);
  clockShift = loadShift();
  storeShift();
  systemClock.wall = () => realWall() + clockShift;
}

export function installCheats(): void {
  if (!debugEnabled()) return;
  debugExpose('meta', {
    profile,
    addGold(n = 1000) {
      profile.grant('gold', n, 'run_reward');
      changed();
    },
    addGems(n = 100) {
      profile.grant('gems', n, 'run_reward');
      changed();
    },
    addTickets(n = 3) {
      profile.grant('tickets', n, 'ticket_daily');
      changed();
    },
    addCards(n = 20) {
      for (const unit of BASE_UNITS) profile.addCards(unit, n, 'run_reward');
      changed();
    },
    addChest(kind: ChestKind = 'wooden', n = 1) {
      profile.addChest(kind, n);
      changed();
    },
    /** Pay out `n` finished runs (victories by default) through the real settle path. */
    async finishRuns(n = 1, o: { chapter?: number; stake?: number; victory?: boolean } = {}) {
      for (let i = 0; i < n; i++) await profile.finishRun(fakeStats(o.chapter ?? 1, o.stake ?? 0, o.victory ?? true));
    },
    /** Every chapter and stake cleared, plenty of runs and XP: every feature unlocks. */
    unlockAll() {
      const d = profile.data;
      d.cleared = d.cleared.map(() => 6);
      d.stats.runs = Math.max(d.stats.runs, 10);
      d.accountXp = Math.max(d.accountXp, 200_000);
      profile.refresh();
    },
    /** Move the meta clock forward (like waiting): free chest, patrol, calendar, daily limits. */
    advance(o: { hours?: number; days?: number } = {}) {
      clockShift += (o.hours ?? 0) * HOUR_MS + (o.days ?? 0) * DAY_MS;
      storeShift();
      profile.resume();
    },
    /** Pretend the app was killed mid-run: the next boot offers "continue". */
    async startPending(chapter = 1) {
      const r = await profile.prepareRun({ mode: 'chapter', chapter, stake: 0 });
      return r.ok;
    },
    /** Reload with an empty save and the real clock (`?fresh=1` clears both at boot). */
    reset() {
      location.search = '?fresh=1&debug=1';
    },
  });
}
