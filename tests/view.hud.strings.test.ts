import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { allStrings, hasString, setLang, t } from '@/core/i18n';
import '@/game/data/strings';
import '@/view/hud/strings';
import { HINT_IDS } from '@/view/hud/policy';
import { SHAKE_MODES } from '@/view/hud/settingsMath';

const DIR = join(process.cwd(), 'src', 'view', 'hud');

function sources(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...sources(p));
    else if (name.endsWith('.ts') && name !== 'strings.ts') out.push(p);
  }
  return out;
}

/** Literal 'hud.x.y' keys used anywhere in the HUD source (template keys are checked separately). */
function literalKeys(): string[] {
  const keys = new Set<string>();
  for (const file of sources(DIR)) {
    const text = readFileSync(file, 'utf8');
    for (const m of text.matchAll(/'(hud\.[A-Za-z0-9_.]+)'/g)) keys.add(m[1] as string);
  }
  return [...keys];
}

/** Placeholders of every string in both languages must agree, or a language would print "{n}". */
function slots(s: string): string[] {
  return [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1] as string).sort();
}

const KO = new Map<string, string>();
const EN = new Map<string, string>();

describe('hud strings', () => {
  beforeAll(() => {
    vi.stubGlobal('document', { documentElement: { lang: '' } });
  });
  afterAll(() => {
    setLang('ko');
    vi.unstubAllGlobals();
  });

  it('has every key the source uses, in Korean and in English', () => {
    for (const lang of ['ko', 'en'] as const) {
      setLang(lang);
      for (const key of literalKeys()) {
        // fail keys are looked up with hasString at runtime; the generic ones are checked below
        if (key.startsWith('hud.fail.') && !hasString(key)) continue;
        expect(hasString(key), `${lang}: ${key}`).toBe(true);
        expect(t(key)).not.toBe(key);
        (lang === 'ko' ? KO : EN).set(key, t(key));
      }
    }
  });

  it('covers the keys built from templates', () => {
    for (const lang of ['ko', 'en'] as const) {
      setLang(lang);
      const keys: string[] = [];
      for (const id of HINT_IDS) keys.push(`hud.hint.${id}`);
      for (const m of SHAKE_MODES) keys.push(`hud.set.shake.${m}`);
      for (const m of ['full', 'brief', 'off']) keys.push(`hud.set.numbers.${m}`);
      for (const m of ['top', 'low', 'avg']) keys.push(`hud.res.luck.${m}`);
      for (const m of ['wooden', 'silver', 'gold']) keys.push(`hud.res.chest.${m}`);
      for (const m of ['gold', 'xp', 'gems', 'tickets', 'cosmetic']) keys.push(`hud.res.r.${m}`);
      for (const key of keys) expect(hasString(key), `${lang}: ${key}`).toBe(true);
    }
  });

  it('uses the same placeholders in both languages', () => {
    const ko = allStrings();
    expect(ko.length).toBeGreaterThan(0);
    for (const [key, text] of KO) expect(slots(EN.get(key) ?? ''), key).toEqual(slots(text));
  });

  it('contains no emoji and no hard line breaks', () => {
    const emoji = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/u;
    for (const text of [...KO.values(), ...EN.values()]) {
      expect(emoji.test(text), text).toBe(false);
      expect(text.includes('\n'), text).toBe(false);
    }
  });

  it('keeps Korean lines in the polite 해요 style', () => {
    setLang('ko');
    // Spot checks of the lines players read most; formal endings would break the tone.
    for (const key of ['hud.pause.quitAsk', 'hud.cont.fix.over', 'hud.hint.laser', 'hud.fail.board_full']) {
      expect(/(요|요!|요\.|요\?)$/.test(t(key)), key).toBe(true);
    }
  });
});
