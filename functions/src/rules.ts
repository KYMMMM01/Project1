// Pure validation for ranking submissions and ranking names. No firebase imports: the game imports this file too (the name check runs
// on the phone first, then again here), and so do the root vitest run and tsc.

export type BoardKind = 'endless' | 'week';

/**
 * Most waves a run is believed to reach (the record is the waves). Bots: the best of 480 runs went to 111 and none passed 120, enemy health
 * growing x1.12 a wave past 80. This cap, not the time floor, is what bounds a forged record; raise it with a redeploy if a player nears it.
 */
export const MAX_WAVES = 150;
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

export type RejectReason = 'bad-board' | 'bad-run' | 'too-fast' | 'too-soon' | NameReject;

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
 * and the week's), so one call per run feeds both. `lastAtMs` is the previous accepted submit of this uid.
 */
export function validateRun(run: unknown, nowMs: number, lastAtMs: number | null): RejectReason | null {
  const r = run as Partial<Run> | null;
  if (!r || typeof r !== 'object' || !isInt(r.waves) || r.waves < 1 || r.waves > MAX_WAVES) return 'bad-run';
  if (typeof r.seconds !== 'number' || !Number.isFinite(r.seconds) || r.seconds < 0) return 'bad-run';
  if (r.seconds > (r.waves + 1) * MAX_WAVE_SECONDS) return 'bad-run';
  if (r.seconds < minRunSeconds(r.waves)) return 'too-fast';
  if (lastAtMs !== null && nowMs - lastAtMs < SUBMIT_COOLDOWN_MS) return 'too-soon';
  return null;
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
