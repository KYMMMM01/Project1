import { Emitter } from './events';

export type Lang = 'ko' | 'en';
export type Dict = Record<string, string>;

const tables: Record<Lang, Dict> = { ko: {}, en: {} };
let current: Lang = 'ko';

export const i18nEvents = new Emitter<{ change: Lang }>();

/** Merge strings into a language table. Feature modules register their own keys at import time. */
export function addStrings(lang: Lang, dict: Dict): void {
  Object.assign(tables[lang], dict);
}

export function setLang(lang: Lang): void {
  if (lang === current) return;
  current = lang;
  document.documentElement.lang = lang;
  i18nEvents.emit('change', lang);
}

export function getLang(): Lang {
  return current;
}

export function detectLang(): Lang {
  const nav = (navigator.languages?.[0] ?? navigator.language ?? 'en').toLowerCase();
  return nav.startsWith('ko') ? 'ko' : 'en';
}

/**
 * Look up `key` and substitute `{name}` placeholders. Falls back ko -> en -> the key itself so a
 * missing translation is visible in QA instead of rendering blank.
 */
export function t(key: string, vars?: Record<string, string | number>): string {
  let s = tables[current][key] ?? tables.en[key] ?? tables.ko[key];
  if (s === undefined) return key;
  if (vars) {
    for (const k of Object.keys(vars)) s = s.split('{' + k + '}').join(String(vars[k]));
  }
  return s;
}

export function hasString(key: string): boolean {
  return key in tables[current] || key in tables.en || key in tables.ko;
}

/** Every string in every language — the font subsetter reads this to know which glyphs to keep. */
export function allStrings(): string[] {
  return [...Object.values(tables.ko), ...Object.values(tables.en)];
}
