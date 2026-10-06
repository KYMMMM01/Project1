import { getLang } from './i18n';

function trunc(x: number): string {
  const digits = x >= 100 ? 0 : x >= 10 ? 1 : 2;
  const f = Math.pow(10, digits);
  // Truncate, never round up: a readout must not show more than the player actually owns.
  let s = (Math.floor(x * f + 1e-9) / f).toFixed(digits);
  if (digits > 0) s = s.replace(/\.?0+$/, '');
  return s;
}

/**
 * Locale-aware compact amount for UI text (currencies, costs, stats). Up to four digits are shown
 * in full with separators; beyond that Korean groups by 만/억/조 and English by K/M/B/T.
 * Damage numbers use math.formatNumber instead (their bitmap font carries Latin glyphs only).
 */
export function fmt(n: number): string {
  const sign = n < 0 ? '-' : '';
  const v = Math.floor(Math.abs(n));
  if (v < 10_000) return sign + v.toLocaleString('en-US');
  if (getLang() === 'ko') {
    if (v < 1e8) return sign + trunc(v / 1e4) + '만';
    if (v < 1e12) return sign + trunc(v / 1e8) + '억';
    return sign + trunc(v / 1e12) + '조';
  }
  if (v < 1e6) return sign + trunc(v / 1e3) + 'K';
  if (v < 1e9) return sign + trunc(v / 1e6) + 'M';
  if (v < 1e12) return sign + trunc(v / 1e9) + 'B';
  return sign + trunc(v / 1e12) + 'T';
}

/** "+12%" style signed percentage from a ratio delta (0.12 -> "+12%"). */
export function fmtPct(ratio: number, digits = 0): string {
  const p = ratio * 100;
  const s = digits > 0 ? p.toFixed(digits).replace(/\.?0+$/, '') : String(Math.round(p));
  return (p > 0 ? '+' : '') + s + '%';
}

/** Countdown text: "2:05" under an hour, "3:02:05" above, and "2일 3시간" / "2d 3h" for long waits. */
export function fmtDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (x: number) => (x < 10 ? '0' + x : '' + x);
  if (d > 0) return getLang() === 'ko' ? `${d}일 ${h}시간` : `${d}d ${h}h`;
  if (h > 0) return `${h}:${pad(m)}:${pad(sec)}`;
  return `${m}:${pad(sec)}`;
}
