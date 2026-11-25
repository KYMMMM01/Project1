// Pure validation for ranking submissions and ranking names. No firebase imports: the game imports this file too (the name check runs
// on the phone first, then again here), and so do the root vitest run and tsc.

export type BoardKind = 'endless' | 'week';

/**
 * Most waves a run is believed to reach (the record is the waves). Bots: the best of 480 runs went to 111 and none passed 120, enemy health
 * growing x1.12 a wave past 80. This cap, with the run ticket's real time, is what bounds a forged record: lowered from 150 to 130 on
 * 2026-11-26 (security review); the function log warns past NEAR_MAX_WAVES, raise it with a redeploy if a real player nears it.
 */
export const MAX_WAVES = 130;
/** A record this high is logged, so the cap is raised before an honest player reaches it. */
export const NEAR_MAX_WAVES = 125;
export const SUBMIT_COOLDOWN_MS = 20_000;

export type WaveKind = 'normal' | 'elite' | 'boss';

/**
 * Fewest simulated seconds a cleared endless wave can take, about 25% under the floor the battle rules set. The run's seconds are simulated
 * time, so x2 and x3 speed, pauses and ads change nothing, and endless runs at butler level 0, so no stake cuts a limit.
 *  - normal: "call the next wave" opens only when spawning ends, 0.6 + 9 s => 9.6 s.
 *  - elite: the target comes out after 1 s and takes at most maxHp / (0.45 x limit) a second plus a 1.5 s burst; the gunner's bounty skips
 *    that cap for 12% of its health at most. With the shortest limit, 40 s: 1 + 0.88 x 0.45 x 40 - 1.5, plus 2.2 s of clear and next-wave
 *    delay => 17.5 s.
 *  - boss: the same with a 50 s limit => 21.5 s.
 * tests/functions.rules.test.ts derives these floors from src/game/data/balance.ts and fails when the battle rules move under them.
 */
export const MIN_WAVE_SECONDS: Readonly<Record<WaveKind, number>> = { normal: 7, elite: 13, boss: 16 };

/** Most simulated seconds per wave a run may claim: a generous bound that only catches nonsense (an honest wave is 15 to 60 s). */
export const MAX_WAVE_SECONDS = 120;

/** Kind of endless wave `wave` (1-based): an elite every 8 waves from wave 4, a boss every 8th wave (src/game/data/waves.ts scriptFor). */
export function endlessWaveKind(wave: number): WaveKind {
  const r = wave % 8;
  return r === 0 ? 'boss' : r === 4 ? 'elite' : 'normal';
}

/** Fewest simulated seconds a run that cleared `waves` waves can have taken. */
export function minRunSeconds(waves: number): number {
  let s = 0;
  for (let w = 1; w <= waves; w++) s += MIN_WAVE_SECONDS[endlessWaveKind(w)];
  return s;
}

export interface Run {
  waves: number;
  seconds: number;
}

export type RejectReason = 'bad-board' | 'bad-run' | 'too-fast' | 'too-soon' | 'no-ticket' | 'banned' | NameReject;

/**
 * The run ticket: the server writes down when an endless run starts (startRun) and the run hands the ticket back with its record, so the
 * real time a run took is known from the server's clock alone. The battle runs at most this many times faster than real time (BattleScene
 * setSpeed clamps to 3; pauses and frame-time caps only make the real time longer), so a run's simulated seconds can never be more than
 * this many times the real seconds between its ticket and its record.
 */
export const MAX_GAME_SPEED = 3;
/**
 * Grace for the ticket arriving after the run began: it is fetched without holding the start back, and asked again 20 and 45 seconds in
 * when the first try fails (signed in a moment late, a weak signal), each try waiting up to 8 seconds.
 */
export const TICKET_SLACK_MS = 60_000;
/** A ticket older than this is void: a forger cannot keep aged tickets to post at will (a run resumed days later loses its ranking). */
export const TICKET_MAX_AGE_MS = 48 * 3_600_000;
/** Tickets a player keeps: a run whose record could not go up (offline, too soon) is sent later with its own ticket. */
export const TICKETS_KEPT = 5;
/** Within this long of the last ticket a new run gets that ticket again instead of a new one (a restart right after a start). */
export const TICKET_COOLDOWN_MS = 5_000;

/** Shortest wait between two name changes of one player. */
export const NAME_COOLDOWN_MS = 30_000;
export const NAME_MIN = 2;
export const NAME_MAX = 12;

/**
 * Pieces a ranking name may not hold, checked with the spaces taken out and in lower case: swearing, and posing as the game's staff.
 * Short on purpose; widen it from players' reports.
 */
const BLOCKED = ['시발', '씨발', '병신', '븅신', '좆', '존나', '개새', '니애미', '느금', 'fuck', 'shit', 'bitch', 'sex', '운영자', '관리자', 'admin', 'official'];

export type NameReject = 'bad-name' | 'blocked-name';

/**
 * The ranking name as it is stored, or why it cannot be one: 2 to 12 letters of complete Hangul syllables, Latin letters and digits, with
 * single spaces inside (lone jamo are refused: they are how a blocked word gets spelled around).
 */
export function cleanName(raw: unknown): { name: string } | { why: NameReject } {
  if (typeof raw !== 'string') return { why: 'bad-name' };
  const name = raw.normalize('NFC').trim().replace(/\s+/g, ' ');
  const n = [...name].length;
  if (n < NAME_MIN || n > NAME_MAX || !/^[가-힣A-Za-z0-9 ]+$/.test(name)) return { why: 'bad-name' };
  const flat = name.replace(/ /g, '').toLowerCase();
  if (BLOCKED.some((w) => flat.includes(w))) return { why: 'blocked-name' };
  return { name };
}

function isInt(n: unknown): n is number {
  return typeof n === 'number' && Number.isInteger(n);
}

export function isBoardKind(b: unknown): b is BoardKind {
  return b === 'endless' || b === 'week';
}

/**
 * Returns null when one finished endless run is acceptable, else why not. The run's waves are its record on both boards (the all-time
 * and the week's), so one call per run feeds both. `lastAtMs` is the previous accepted submit of this uid; `ticketAtMs` is when the
 * run's ticket was given (null: the run brought no ticket this player holds), and the real time since then must cover the simulated
 * seconds at the fastest game speed.
 */
export function validateRun(run: unknown, nowMs: number, lastAtMs: number | null, ticketAtMs: number | null): RejectReason | null {
  const r = run as Partial<Run> | null;
  if (!r || typeof r !== 'object' || !isInt(r.waves) || r.waves < 1 || r.waves > MAX_WAVES) return 'bad-run';
  if (typeof r.seconds !== 'number' || !Number.isFinite(r.seconds) || r.seconds < 0) return 'bad-run';
  if (r.seconds > (r.waves + 1) * MAX_WAVE_SECONDS) return 'bad-run';
  if (r.seconds < minRunSeconds(r.waves)) return 'too-fast';
  if (ticketAtMs === null || nowMs - ticketAtMs > TICKET_MAX_AGE_MS) return 'no-ticket';
  if (nowMs - ticketAtMs + TICKET_SLACK_MS < (r.seconds * 1000) / MAX_GAME_SPEED) return 'too-fast';
  if (lastAtMs !== null && nowMs - lastAtMs < SUBMIT_COOLDOWN_MS) return 'too-soon';
  return null;
}

/** A player's live tickets, newest first: malformed entries (not a number) and void ones (past TICKET_MAX_AGE_MS) left out. */
export function liveTickets(tickets: unknown, nowMs: number): [string, number][] {
  return Object.entries(tickets && typeof tickets === 'object' ? (tickets as Record<string, unknown>) : {})
    .filter((e): e is [string, number] => typeof e[1] === 'number' && nowMs - e[1] <= TICKET_MAX_AGE_MS)
    .sort((a, b) => b[1] - a[1]);
}

/** A player's tickets after a new one is given: `id` at `nowMs` added to the live ones, the oldest dropped past TICKETS_KEPT. */
export function addTicket(tickets: unknown, id: string, nowMs: number): Record<string, number> {
  return Object.fromEntries([...liveTickets(tickets, nowMs).slice(0, TICKETS_KEPT - 1), [id, nowMs]]);
}

/** Monday (YYYY-MM-DD) of the week containing `nowMs`, in Asia/Seoul time; same value as the client's weekKey. */
export function seoulWeekKey(nowMs: number): string {
  // The sv-SE locale formats dates as YYYY-MM-DD.
  const day = new Date(nowMs).toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' });
  const t = Date.parse(day + 'T00:00:00Z');
  const sinceMonday = (new Date(t).getUTCDay() + 6) % 7;
  return new Date(t - sinceMonday * 86_400_000).toISOString().slice(0, 10);
}

export function boardId(board: BoardKind, nowMs: number): string {
  return board === 'endless' ? 'endless' : 'week-' + seoulWeekKey(nowMs);
}

/** Default display name from the uid, e.g. '집사 1234'. */
export function defaultName(uid: string): string {
  let h = 0;
  for (let i = 0; i < uid.length; i++) h = (h * 31 + uid.charCodeAt(i)) % 10000;
  return '집사 ' + String(h).padStart(4, '0');
}
