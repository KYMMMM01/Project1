/** Idle patrol gold and the free-chest timer. Pure. */
import {
  CHAPTER_MULT,
  PATROL_CAP_COMEBACK_MS,
  PATROL_CAP_MS,
  PATROL_CAP_PASS_MS,
  PATROL_GOLD_PER_HOUR,
  PATROL_MIN_MS,
} from './data/economy';

/** Gold per hour: it follows the first chapter the player has not cleared yet (capped at the last one). */
export function patrolRate(chaptersCleared: number): number {
  const mult = CHAPTER_MULT[Math.min(CHAPTER_MULT.length - 1, chaptersCleared)] ?? 1;
  return Math.round(PATROL_GOLD_PER_HOUR * mult);
}

/** How long patrol keeps counting: 8 h, 12 h with the pass, 24 h once after a comeback. */
export function patrolCapMs(butler: boolean, comebackBoost: boolean): number {
  const base = butler ? PATROL_CAP_PASS_MS : PATROL_CAP_MS;
  return comebackBoost ? Math.max(base, PATROL_CAP_COMEBACK_MS) : base;
}

export interface PatrolStatus {
  /** Counted time, never above the cap and zero when the clock is behind `since`. */
  ms: number;
  gold: number;
  full: boolean;
  /** Enough has piled up to collect (10 minutes). */
  collectable: boolean;
}

export function patrolStatus(since: number, now: number, capMs: number, goldPerHour: number): PatrolStatus {
  const ms = Math.min(capMs, Math.max(0, now - since));
  return {
    ms,
    gold: Math.floor((ms / 3_600_000) * goldPerHour),
    full: ms >= capMs,
    collectable: ms >= PATROL_MIN_MS,
  };
}

export function freeChestReady(readyAt: number, now: number): boolean {
  return now >= readyAt;
}

/** Milliseconds until the free chest is ready (0 when it is). */
export function freeChestWait(readyAt: number, now: number): number {
  return Math.max(0, readyAt - now);
}
