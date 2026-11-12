// Pure validation for ranking submissions and ranking names. No firebase imports: the game imports this file too (the name check runs
// on the phone first, then again here), and so do the root vitest run and tsc.

export type BoardKind = 'endless' | 'week';

export const MAX_SCORE = 10000;
export const SUBMIT_COOLDOWN_MS = 20_000;

/**
 * Fastest believable time per wave. PLACEHOLDER: must be tuned against real runs
 * (record the shortest honest seconds / waves from playtests, then set this a bit below it).
 */
export const MIN_SECONDS_PER_WAVE = 3;

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
  if (!r || typeof r !== 'object' || !isInt(r.waves) || r.waves < 1 || r.waves > MAX_SCORE) return 'bad-run';
  if (typeof r.seconds !== 'number' || !Number.isFinite(r.seconds) || r.seconds < 0) return 'bad-run';
  if (r.seconds < r.waves * MIN_SECONDS_PER_WAVE) return 'too-fast';
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
