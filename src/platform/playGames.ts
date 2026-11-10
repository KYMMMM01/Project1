/**
 * Google Play Games Services on the Android app (android/.../PlayGamesPlugin.java): the platform sign-in the title and the settings show,
 * the leaderboards and the cloud save. PGS signs the player in by itself at start; `connect()` is the manual retry of the connect button.
 * Everything here answers "not available" on other builds and before the Play Console setup (no project id in the app): the game never
 * depends on it (Google's guidance: PGS is not the game's identity; guests keep playing on the device's save).
 */
import { getCapacitorPlugins, type CapPlayGames } from './bridges';
import { errorMessage } from './util';

/** none: no Play Games on this build; wait: asking; on: signed in; off: not signed in (the connect button). */
export type PlayGamesState = { status: 'none' } | { status: 'wait' } | { status: 'on'; name: string } | { status: 'off' };

/** The game's board ids and the Play Console leaderboard ids they map to (set per build, .env.store; read when asked). */
const boards = (): Readonly<Record<string, string | undefined>> => ({
  endless_best: import.meta.env.VITE_PGS_LEADERBOARD_ENDLESS,
});

let state: PlayGamesState = { status: 'none' };
const listeners = new Set<(s: PlayGamesState) => void>();

const plugin = (): CapPlayGames | undefined => getCapacitorPlugins()?.PlayGames;

function set(next: PlayGamesState): void {
  state = next;
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

  /** The Play Console id of a game board, when this build has one. */
  boardId(board: string): string | undefined {
    const id = boards()[board];
    return typeof id === 'string' && id !== '' ? id : undefined;
  },

  /** A record for a board; silently nothing when not signed in or the board has no id. */
  async submit(board: string, score: number): Promise<void> {
    const p = plugin();
    const id = playGames.boardId(board);
    if (!p || !id || state.status !== 'on' || !Number.isFinite(score) || score <= 0) return;
    await p.submitScore({ leaderboardId: id, score: Math.trunc(score) }).catch(() => undefined);
  },

  /** Google's leaderboard screen for a board. False when it cannot be shown. */
  async showBoard(board: string): Promise<boolean> {
    const p = plugin();
    const id = playGames.boardId(board);
    if (!p || !id || state.status !== 'on') return false;
    try {
      await p.showLeaderboard({ leaderboardId: id });
      return true;
    } catch {
      return false;
    }
  },

  /** The cloud save's text, null when there is none (or no Play Games). Throws when the read itself failed. */
  async load(name: string): Promise<string | null> {
    const p = plugin();
    if (!p || state.status !== 'on') return null;
    const r = await p.loadSnapshot({ name });
    return r.found && typeof r.data === 'string' ? r.data : null;
  },

  /** Writes the cloud save. False when not signed in or the write failed. */
  async save(name: string, data: string, description: string): Promise<boolean> {
    const p = plugin();
    if (!p || state.status !== 'on') return false;
    try {
      return (await p.saveSnapshot({ name, data, description })).saved === true;
    } catch (e) {
      console.warn('[playGames] cloud save failed:', errorMessage(e));
      return false;
    }
  },
};

/** Tests: forget the state between cases. */
export function resetPlayGamesForTests(): void {
  state = { status: 'none' };
  listeners.clear();
}
