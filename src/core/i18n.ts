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
    s = fixParticles(s);
  }
  return s;
}

const PARTICLES: Record<string, readonly [string, string]> = {
  '이(가)': ['이', '가'],
  '을(를)': ['을', '를'],
  '은(는)': ['은', '는'],
  '와(과)': ['과', '와'],
  '(으)로': ['으로', '로'],
};
const PARTICLE_RE = /(.)(이\(가\)|을\(를\)|은\(는\)|와\(과\)|\(으\)로)/g;

/**
 * Korean particles depend on whether the word before them ends in a consonant, which a template
 * cannot know: "{chapter}을(를)" becomes "주방을" / "욕조를". A word ending in ㄹ takes "로".
 */
export function fixParticles(text: string): string {
  return text.replace(PARTICLE_RE, (whole, prev: string, mark: string) => {
    const code = prev.charCodeAt(0);
    const pair = PARTICLES[mark];
    if (!pair) return whole;
    let closed: boolean;
    if (code >= 0xac00 && code <= 0xd7a3) {
      const final = (code - 0xac00) % 28;
      closed = mark === '(으)로' ? final !== 0 && final !== 8 : final !== 0;
    } else if (prev >= '0' && prev <= '9') {
      // Read aloud: 0 영, 1 일, 3 삼, 6 육, 7 칠, 8 팔 end in a consonant (1, 7, 8 in ㄹ).
      closed = mark === '(으)로' ? '036'.includes(prev) : '013678'.includes(prev);
    } else {
      return whole;
    }
    return prev + pair[closed ? 0 : 1];
  });
}

export function hasString(key: string): boolean {
  return key in tables[current] || key in tables.en || key in tables.ko;
}

/** Every string in every language — the font subsetter reads this to know which glyphs to keep. */
export function allStrings(): string[] {
  return [...Object.values(tables.ko), ...Object.values(tables.en)];
}
