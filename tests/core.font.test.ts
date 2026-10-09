import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { allStrings, fixParticles, getLang } from '@/core/i18n';
import { fmt, fmtDuration } from '@/core/format';
import { GAME_FACES, fontsReady, loadGameFonts, resetGameFonts, type FontSetLike } from '@/core/fonts';
import '@/codex/strings';
import '@/game/data/strings';
import '@/game/data/stringsGame';
import '@/guide/strings';
import '@/meta/strings';
import '@/platform/adapters/devOverlay';
import '@/screens/battle/strings';
import '@/screens/cats/strings';
import '@/screens/missions/strings';
import '@/screens/pass/strings';
import '@/screens/shell/strings';
import '@/screens/shop/strings';
import '@/screens/system/strings';
import '@/ui/strings';
import '@/view/director/strings';
import '@/view/hud/strings';
import '@/view/strings';
import {
  RUNTIME_CHARS, collectChars, fontNamesIn, fontUrlRe, hashedName, isHangul, sourceFiles, withFontNames, woff2Codepoints,
} from '../scripts/fontTools.mjs';

const ROOT = join(__dirname, '..');
const FONTS = join(ROOT, 'public', 'fonts');

const fontFiles = readdirSync(FONTS).filter((n) => n.endsWith('.woff2'));
const pick = (stem: string): string => fontFiles.find((n) => n.startsWith(stem + '.')) ?? '';
const KR = pick('game-kr');
const LATIN = pick('game-latin');
const kr = woff2Codepoints(readFileSync(join(FONTS, KR)));
const latin = woff2Codepoints(readFileSync(join(FONTS, LATIN)));
const covered = (ch: string): boolean => kr.has(ch.codePointAt(0) as number) || latin.has(ch.codePointAt(0) as number);

/**
 * Symbols that neither Jua nor Lilita One has, so the browser draws them from a system font (src/view/glyphs.ts warms that font up).
 * Today: the arrow of the guide, the codex and the result page, and the circled 1 and 2 of two guide titles. A new symbol in a string is a
 * decision: draw it in a face the game carries (a plain ">" or "1)"), or add it here knowing it will look different.
 */
const SYSTEM_GLYPHS = '→①②';

const STRING_MODULES = [
  'codex/strings.ts', 'game/data/strings.ts', 'game/data/stringsGame.ts', 'guide/strings.ts', 'meta/strings.ts', 'platform/adapters/devOverlay.ts',
  'screens/battle/strings.ts', 'screens/cats/strings.ts', 'screens/missions/strings.ts', 'screens/pass/strings.ts', 'screens/shell/strings.ts',
  'screens/shop/strings.ts', 'screens/system/strings.ts', 'ui/strings.ts', 'view/director/strings.ts', 'view/hud/strings.ts', 'view/strings.ts',
];

function charsOf(texts: readonly string[]): Set<string> {
  const out = new Set<string>();
  for (const s of texts) for (const ch of s) if ((ch.codePointAt(0) as number) > 0x7f) out.add(ch);
  return out;
}

function missingFrom(chars: Iterable<string>): string[] {
  return [...chars].filter((ch) => !covered(ch) && !SYSTEM_GLYPHS.includes(ch));
}

describe('the font files of the build', () => {
  it('are one display subset and one Korean subset, named by a digest of their bytes', () => {
    expect(fontFiles).toHaveLength(2);
    expect(LATIN).not.toBe('');
    expect(KR).not.toBe('');
    for (const [stem, file] of [['game-latin', LATIN], ['game-kr', KR]] as const) {
      expect(file).toBe(hashedName(stem, readFileSync(join(FONTS, file))));
    }
  });

  it('are the ones index.html asks for, so a page always loads the subset built with it', () => {
    const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
    expect(fontNamesIn(html, ['game-latin', 'game-kr'])).toEqual({ 'game-latin': LATIN, 'game-kr': KR });
    expect(html.match(/\.woff2/g)).toHaveLength(2);
    expect(html).not.toMatch(/game-(kr|latin)\.woff2/);
  });

  it('are read back from the files: the Korean subset holds Hangul, the display subset the ASCII range', () => {
    expect([...kr].filter((c) => c >= 0xac00 && c <= 0xd7a3).length).toBeGreaterThan(500);
    for (let c = 0x21; c < 0x7f; c++) expect(latin.has(c), String.fromCharCode(c)).toBe(true);
    expect(kr.has('몬'.codePointAt(0) as number)).toBe(true);
    expect(kr.has('항'.codePointAt(0) as number)).toBe(true);
  });
});

describe('index.html font rules', () => {
  const page = "src: url('./fonts/game-latin.00000000.woff2') format('woff2');\nsrc: url('./fonts/game-kr.woff2') format('woff2');";

  it('are rewritten to new file names, whether the old name had a digest or not', () => {
    const next = withFontNames(page, { 'game-latin': 'game-latin.aaaaaaaa.woff2', 'game-kr': 'game-kr.bbbbbbbb.woff2' });
    expect(next).toBe("src: url('./fonts/game-latin.aaaaaaaa.woff2') format('woff2');\nsrc: url('./fonts/game-kr.bbbbbbbb.woff2') format('woff2');");
    expect(fontUrlRe('game-kr').test(next)).toBe(true);
  });

  it('refuse a page that lost one of its rules (a font would silently stop loading)', () => {
    expect(() => withFontNames("url('./fonts/game-latin.woff2')", { 'game-latin': 'x.woff2', 'game-kr': 'y.woff2' })).toThrow(/game-kr/);
  });
});

describe('the glyphs the game can show', () => {
  it('has every Korean syllable of every source file in the Korean subset (strings, data, codex, guide, game and comments alike)', () => {
    const syllables = [...collectChars(ROOT)].filter(isHangul);
    expect(syllables.length).toBeGreaterThan(500);
    expect(syllables.filter((ch) => !kr.has(ch.codePointAt(0) as number))).toEqual([]);
  });

  it('has every character of every Korean and English string covered by the subsets', () => {
    const strings = allStrings();
    expect(strings.length).toBeGreaterThan(2500);
    expect(missingFrom(charsOf(strings))).toEqual([]);
  });

  it('knows every file that registers strings, so a new table cannot hide from the check above', () => {
    const found: string[] = [];
    const walk = (dir: string): void => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (name.endsWith('.ts') && /\baddStrings\(/.test(readFileSync(p, 'utf8'))) found.push(p.slice(join(ROOT, 'src').length + 1).replace(/\\/g, '/'));
      }
    };
    walk(join(ROOT, 'src'));
    // i18n.ts defines addStrings and src/demo is a dev gallery that never ships.
    const shipped = found.filter((f) => f !== 'core/i18n.ts' && !f.startsWith('demo/'));
    expect(shipped.sort()).toEqual([...STRING_MODULES].sort());
  });

  it('covers the text the game assembles at run time: number suffixes, durations, particles, and the browser\'s own date names', () => {
    expect(getLang()).toBe('ko');
    const made: string[] = [
      ...[1e4, 12_345, 1e8, 2.5e8, 1e12, 7e12, 999, -52_000].map(fmt),
      fmtDuration(2 * 86400 + 3 * 3600),
      fmtDuration(125),
      ...['이(가)', '을(를)', '은(는)', '와(과)', '(으)로'].flatMap((p) => ['가', '각', '길', '0', '1', '3', '6', '7', '8'].map((w) => fixParticles(w + p))),
    ];
    const date = new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long', timeZone: 'UTC' });
    const short = new Intl.DateTimeFormat('ko-KR', { month: 'long', day: 'numeric', weekday: 'short', hour: 'numeric', minute: 'numeric', timeZone: 'UTC' });
    for (let day = 0; day < 14; day++) {
      for (let month = 0; month < 12; month++) {
        const when = new Date(Date.UTC(2026, month, 1 + day));
        made.push(date.format(when), short.format(when));
      }
    }
    expect(missingFrom(charsOf(made))).toEqual([]);
    expect(missingFrom(RUNTIME_CHARS)).toEqual([]);
  });

  it('keeps the symbols nobody carries a short, known list', () => {
    const symbols = [...charsOf(allStrings())].filter((ch) => !isHangul(ch) && !covered(ch));
    expect(symbols.sort().join('')).toBe(SYSTEM_GLYPHS);
  });

  it('would catch a missing glyph: a character no face carries is reported', () => {
    expect(missingFrom('가힣'.split('')).length).toBeGreaterThanOrEqual(0);
    // U+4E00 is a Han character: neither face has it, and the source files do not use it.
    expect(missingFrom(['一'])).toEqual(['一']);
    expect(sourceFiles(ROOT).length).toBeGreaterThan(100);
  });
});

describe('waiting for the fonts', () => {
  afterEach(() => resetGameFonts());

  const loaded = (): FontSetLike => ({ load: () => Promise.resolve([{}]) });

  it('asks for every face once and says ready only when all of them loaded', async () => {
    const asked: string[] = [];
    const set: FontSetLike = {
      load: (font, text) => {
        asked.push(`${font}|${text}`);
        return Promise.resolve([{}]);
      },
    };
    expect(fontsReady()).toBe(false);
    expect(await loadGameFonts(set)).toBe('ready');
    expect(fontsReady()).toBe(true);
    expect(asked).toEqual(GAME_FACES.map((f) => `32px ${f.family}|${f.sample}`));
    // One attempt per page: a second call neither asks again nor changes the answer.
    expect(await loadGameFonts(loaded())).toBe('ready');
    expect(asked).toHaveLength(GAME_FACES.length);
  });

  it('says failed, and logs it, when a face does not load or the page has no rule for it', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      const broken: FontSetLike = { load: (font) => (font.includes('GameKR') ? Promise.reject(new Error('404')) : Promise.resolve([{}])) };
      expect(await loadGameFonts(broken)).toBe('failed');
      expect(fontsReady()).toBe(false);
      resetGameFonts();
      expect(await loadGameFonts({ load: () => Promise.resolve([]) })).toBe('failed');
      expect(warn).toHaveBeenCalledTimes(2);
    } finally {
      warn.mockRestore();
    }
  });

  it('does not settle until the slowest face is in', async () => {
    let release: () => void = () => undefined;
    const slow = new Promise<readonly unknown[]>((resolve) => {
      release = () => resolve([{}]);
    });
    const set: FontSetLike = { load: (font) => (font.includes('GameKR') ? slow : Promise.resolve([{}])) };
    let state = 'waiting';
    void loadGameFonts(set).then((o) => {
      state = o;
    });
    await new Promise((r) => setTimeout(r, 5));
    expect(state).toBe('waiting');
    release();
    await new Promise((r) => setTimeout(r, 5));
    expect(state).toBe('ready');
  });
});
