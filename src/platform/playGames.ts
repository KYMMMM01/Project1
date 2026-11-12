/**
 * Google Play Games Services on the Android app (android/.../PlayGamesPlugin.java): achievements only, plus the platform sign-in they
 * need (the title and the settings show its state). Accounts and the cloud save are Firebase's, the ranking is Cloud Functions'.
 * PGS signs the player in by itself at start; `connect()` is the manual retry of the connect button. Achievement calls are silent no-ops
 * when signed out or for a key with no id; an unlock made while the sign-in runs is queued. Everything here answers "not available" on
 * other builds and before the Play Console setup (no project id in the app): the game never depends on it.
 */
import { getCapacitorPlugins, type CapPlayGames } from './bridges';
import { errorMessage } from './util';

/** none: no Play Games on this build; wait: asking; on: signed in; off: not signed in (the connect button). */
export type PlayGamesState = { status: 'none' } | { status: 'wait' } | { status: 'on'; name: string } | { status: 'off' };

/** Game-side achievement keys and the Play Console ids they map to (a JSON object set per build, .env.store; read when asked). */
function achievements(): Readonly<Record<string, unknown>> {
  try {
    const map: unknown = JSON.parse(import.meta.env.VITE_PGS_ACHIEVEMENTS || '{}');
    return map !== null && typeof map === 'object' ? (map as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

let state: PlayGamesState = { status: 'none' };
const listeners = new Set<(s: PlayGamesState) => void>();
/** Achievement ids unlocked while the sign-in was still running (a set, so a repeat is one call). */
const pending = new Set<string>();

const plugin = (): CapPlayGames | undefined => getCapacitorPlugins()?.PlayGames;

/** A failed achievement call is only a log line: the game never waits on it. */
async function send(call: Promise<unknown> | undefined): Promise<void> {
  await call?.catch((e) => console.warn('[playGames] achievement call failed:', errorMessage(e)));
}

function set(next: PlayGamesState): void {
  state = next;
  if (next.status === 'on') for (const id of pending) void send(plugin()?.unlockAchievement({ id }));
  if (next.status !== 'wait') pending.clear();
  for (const fn of [...listeners]) fn(state);
}

async function afterAuth(r: { available: boolean; authenticated: boolean }): Promise<boolean> {
  const p = plugin();
  if (!r.available || !p) {
    set({ status: 'none' });
    return false;
  }
  if (!r.authenticated) {
    set({ status: 'off' });
    return false;
  }
  const player = await p.getPlayer().catch(() => null);
  set({ status: 'on', name: player?.displayName?.trim() || 'Player' });
  return true;
}

export const playGames = {
  state(): PlayGamesState {
    return state;
  },

  /** Calls `fn` on every change; returns the unsubscribe. */
  onChange(fn: (s: PlayGamesState) => void): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },

  /** Boot: read the automatic sign-in's result. Never throws; leaves 'none' where there is no Play Games. */
  async start(): Promise<void> {
    const p = plugin();
    if (!p) return;
    set({ status: 'wait' });
    try {
      await afterAuth(await p.isAuthenticated());
    } catch {
      set({ status: 'off' });
    }
  },

  /** The connect button: Play Games' own sign-in screens. True when the player is signed in afterwards. */
  async connect(): Promise<boolean> {
    const p = plugin();
    if (!p) return false;
    set({ status: 'wait' });
    try {
      return await afterAuth(await p.signIn());
    } catch {
      set({ status: 'off' });
      return false;
    }
  },

  /** The Play Console id of a game-side achievement key, when this build has one. */
  achievementId(key: string): string | undefined {
    const id = achievements()[key];
    return typeof id === 'string' && id !== '' ? id : undefined;
  },

  /** Unlocks an achievement; while the sign-in runs it is queued and sent once signed in. Unknown keys do nothing. */
  unlock(key: string): void {
    const id = playGames.achievementId(key);
    if (!id) return;
    if (state.status === 'on') void send(plugin()?.unlockAchievement({ id }));
    else if (state.status === 'wait') pending.add(id);
  },

  /** Adds steps to an incremental achievement; silently nothing when signed out or the key is unknown. */
  increment(key: string, steps: number): void {
    const id = playGames.achievementId(key);
    if (!id || state.status !== 'on' || !Number.isFinite(steps) || steps < 1) return;
    void send(plugin()?.incrementAchievement({ id, steps: Math.trunc(steps) }));
  },

  /** Google's achievements screen. False when it cannot be shown. */
  async showAchievements(): Promise<boolean> {
    const p = plugin();
    if (!p || state.status !== 'on') return false;
    try {
      await p.showAchievements();
      return true;
    } catch {
      return false;
    }
  },
};

/** Tests: forget the state between cases. */
export function resetPlayGamesForTests(): void {
  state = { status: 'none' };
  listeners.clear();
  pending.clear();
}
