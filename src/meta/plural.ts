/** Counted texts: English has a singular where Korean has none. */
import { getLang, hasString, t } from '@/core/i18n';

/**
 * `t` for a string that holds a count. In English a count of exactly 1 reads `key.one` when the key has
 * one ("1 wild card", not "1 wild cards"); every other count and every other language reads `key`.
 * `n` is filled with the count unless `vars` brings its own (a formatted "1,200").
 */
export function tn(key: string, count: number, vars?: Record<string, string | number>): string {
  const one = key + '.one';
  return t(count === 1 && getLang() === 'en' && hasString(one) ? one : key, { n: count, ...vars });
}
