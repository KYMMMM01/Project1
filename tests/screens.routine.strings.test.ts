import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FEATURES } from '@/meta/data/schedule';

const ROOT = join(__dirname, '..', 'src', 'screens');
const STRING_FILES = ['system', 'missions', 'pass'].map((d) => join(ROOT, d, 'strings.ts'));

function keysOf(source: string, lang: 'ko' | 'en'): string[] {
  const start = source.indexOf(`addStrings('${lang}'`);
  const other = source.indexOf(lang === 'ko' ? "addStrings('en'" : "addStrings('ko'");
  const end = lang === 'ko' ? (other > start ? other : source.length) : source.length;
  const block = source.slice(start, end);
  return [...block.matchAll(/^\s+'(rt\.[A-Za-z0-9_.]+)':/gm)].map((m) => m[1] as string);
}

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...sourceFiles(p));
    else if (p.endsWith('.ts') && !p.endsWith('strings.ts')) out.push(p);
  }
  return out;
}

describe('routine screen strings', () => {
  const sources = STRING_FILES.map((f) => readFileSync(f, 'utf8'));
  const ko = new Set(sources.flatMap((s) => keysOf(s, 'ko')));
  const en = new Set(sources.flatMap((s) => keysOf(s, 'en')));

  it('has every key in Korean and in English', () => {
    expect(ko.size).toBeGreaterThan(100);
    expect([...ko].filter((k) => !en.has(k))).toEqual([]);
    expect([...en].filter((k) => !ko.has(k))).toEqual([]);
  });

  it('defines every literal key the screens ask for', () => {
    const used = new Set<string>();
    for (const dir of ['system', 'missions', 'pass']) {
      for (const file of sourceFiles(join(ROOT, dir))) {
        for (const m of readFileSync(file, 'utf8').matchAll(/['"`](rt\.[A-Za-z0-9_.]+)['"`]/g)) used.add(m[1] as string);
      }
    }
    // A key ending in a dot is a prefix completed at run time (checked below).
    expect([...used].filter((k) => !k.endsWith('.') && !ko.has(k))).toEqual([]);
  });

  it('defines the keys that are built from a variable', () => {
    for (const f of FEATURES) expect(ko.has(`rt.sys.feat.${f}`), f).toBe(true);
    for (const q of ['auto', 'high', 'mid', 'low']) expect(ko.has(`rt.sys.quality.${q}`), q).toBe(true);
    for (const m of ['full', 'reduced', 'off']) expect(ko.has(`rt.sys.shake.${m}`), m).toBe(true);
    for (const m of ['full', 'brief', 'off']) expect(ko.has(`rt.sys.numbers.${m}`), m).toBe(true);
    for (let i = 0; i < 4; i++) expect(ko.has(`rt.pass.season.${i}`), String(i)).toBe(true);
  });

  it('keeps placeholders identical in both languages', () => {
    const table = (lang: 'ko' | 'en'): Map<string, string> => {
      const map = new Map<string, string>();
      for (const s of sources) {
        const start = s.indexOf(`addStrings('${lang}'`);
        const other = s.indexOf(lang === 'ko' ? "addStrings('en'" : "addStrings('ko'");
        const block = s.slice(start, lang === 'ko' && other > start ? other : s.length);
        for (const m of block.matchAll(/^\s+'(rt\.[A-Za-z0-9_.]+)':\s*'((?:[^'\\]|\\.)*)'/gm)) map.set(m[1] as string, m[2] as string);
      }
      return map;
    };
    const k = table('ko');
    const e = table('en');
    const vars = (s: string): string => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
    for (const [key, text] of k) expect(vars(e.get(key) ?? ''), key).toBe(vars(text));
  });
});
