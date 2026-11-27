import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

// Rules agents keep to because a test fails, not because a document asks. Each ALLOWED list freezes what already broke a rule
// when the rule came in: it may only shrink, and a file on it that no longer breaks the rule fails the test until it is taken off.

const ROOT = join(__dirname, '..');
const SRC = join(ROOT, 'src');

interface Source { path: string; dir: string; code: string; raw: string }

/** The text with its comments blanked out (line breaks kept), so a rule is not tripped by a comment that names what it bans. */
function stripComments(text: string): string {
  let out = '';
  let i = 0;
  while (i < text.length) {
    const c = text[i]!;
    const n = text[i + 1];
    if (c === '/' && n === '/') {
      while (i < text.length && text[i] !== '\n') i++;
    } else if (c === '/' && n === '*') {
      const end = text.indexOf('*/', i + 2);
      const stop = end < 0 ? text.length : end + 2;
      out += text.slice(i, stop).replace(/[^\n]/g, ' ');
      i = stop;
    } else if (c === "'" || c === '"' || c === '`') {
      // A quote inside a regex literal opens no string: a plain string ends at its line, so a stray quote costs one line at most.
      let j = i + 1;
      while (j < text.length && text[j] !== c && (c === '`' || text[j] !== '\n')) j += text[j] === '\\' ? 2 : 1;
      out += text.slice(i, j + 1);
      i = j + 1;
    } else {
      out += c;
      i++;
    }
  }
  return out;
}

function readSources(base: string): Source[] {
  const list: Source[] = [];
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (name.endsWith('.ts')) {
        const path = relative(ROOT, p).split(sep).join('/');
        const raw = readFileSync(p, 'utf8');
        list.push({ path, dir: topDir(p), code: stripComments(raw), raw });
      }
    }
  };
  walk(base);
  return list;
}

/** The folder of src a file belongs to: 'game' for src/game/sim/sim.ts, '' for src/main.ts, 'functions' for the shared server rules. */
function topDir(abs: string): string {
  const parts = relative(SRC, abs).split(sep);
  if (parts[0] === '..') return parts[1] === 'functions' ? 'functions' : '..';
  return parts.length === 1 ? '' : parts[0]!;
}

/** Where each import of a file points: a src folder (or 'functions'), 'pixi' for Pixi, or null for any other package. */
function importsOf(file: Source): { to: string | null; spec: string; line: number }[] {
  const found: { to: string | null; spec: string; line: number }[] = [];
  for (const m of file.code.matchAll(/(?:\bfrom\s*|\bimport\s*\(?\s*)['"]([^'"]+)['"]/g)) {
    const spec = m[1]!;
    let to: string | null = null;
    if (spec.startsWith('@/')) to = folderOf(join(SRC, spec.slice(2)));
    else if (spec.startsWith('.')) to = folderOf(resolve(join(ROOT, dirname(file.path)), spec));
    else if (/^(pixi\.js|@pixi\/)/.test(spec)) to = 'pixi';
    found.push({ to, spec, line: lineAt(file.code, m.index) });
  }
  return found;
}

/** The folder an import lands in: '@/game' is the folder's index, so it is game, not a file at the root of src. */
function folderOf(abs: string): string {
  return topDir(existsSync(abs) && statSync(abs).isDirectory() ? join(abs, 'index.ts') : abs);
}

function lineAt(code: string, index: number): number {
  return code.slice(0, index).split('\n').length;
}

/** `file:line  text` for every match of a pattern in the comment-free code (or in the file as written, for what lives in comments). */
function hits(file: Source, pattern: RegExp, text = file.code): string[] {
  const g = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g');
  return [...text.matchAll(g)].map((m) => `${file.path}:${lineAt(text, m.index)}  ${m[0]}`);
}

/** The file an import names, as 'src/core/game' (no extension), for following imports from file to file. */
function targetOf(file: Source, spec: string): string {
  const abs = spec.startsWith('@/') ? join(SRC, spec.slice(2)) : resolve(join(ROOT, dirname(file.path)), spec);
  return relative(ROOT, abs).split(sep).join('/').replace(/\.ts$/, '');
}

/** The offenders outside the frozen list, and the frozen files that no longer offend. */
function judge(offenders: Map<string, string[]>, allowed: readonly string[]): { fresh: string[]; cleared: string[] } {
  const fresh = [...offenders].filter(([path]) => !allowed.includes(path)).flatMap(([, list]) => list);
  const cleared = allowed.filter((path) => !offenders.has(path));
  return { fresh, cleared };
}

function collect(files: Source[], find: (f: Source) => string[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const f of files) {
    const list = find(f);
    if (list.length > 0) map.set(f.path, list);
  }
  return map;
}

const FILES = readSources(SRC);

// --- Layers: a folder imports its own layer or the ones below it, never one above.
const LAYER: Record<string, number> = {
  functions: 0, core: 0,
  game: 1, meta: 1, audio: 1, platform: 1,
  ui: 2, fx: 2,
  view: 3, codex: 3, guide: 3,
  screens: 4, scenes: 4,
  app: 5, diag: 5, demo: 5, soundboard: 5, '': 5,
};

const LAYER_ALLOWED = [
  'src/core/game.ts',
  'src/core/scene.ts',
  'src/core/skillSwitch.ts',
  'src/game/api.ts',
  'src/platform/adapters/devOverlay.ts',
  'src/view/field/debug.ts',
  'src/view/field/lab.ts',
  'src/view/hud/homeClaim.ts',
  'src/screens/system/settingsScreen.ts',
  'src/scenes/HomeScene.ts',
] as const;

// --- The rules of a fight (src/game) run the same on the server, in the bots and in the replays: no screen, sound, page or clock.
const PURE_RULES = /\bMath\.random\s*\(|\bDate\.now\s*\(|\bnew Date\b|\b(?:window|document|localStorage|navigator)\s*\.|\b(?:setTimeout|setInterval|requestAnimationFrame)\s*\(/;

// --- Screens wait on their scene's clock (this.tweens.call / wait): it is killed when the scene goes and stops with the pause.
const UI_DIRS = new Set(['ui', 'fx', 'view', 'codex', 'guide', 'screens', 'scenes']);
const RAW_TIMER = /\b(?:setTimeout|setInterval)\s*\(/;
const TIMER_ALLOWED = [
  'src/ui/backGesture.ts',
  'src/view/info.ts',
  'src/screens/system/lookSync.ts',
  'src/scenes/BootScene.ts',
] as const;

// --- A screen that rebuilds on a change (the language, signing in) waits for the handler that made it with onSettled (core/events).
const RAW_MICROTASK = /\bqueueMicrotask\s*\(/;

// --- No way around the type checker: no any in a type (as any, : any, Record<string, any>, any[]), and no switch-off in a comment.
// Built from parts so this file does not match itself.
const ANY_TYPE = new RegExp(['\\bas any\\b', ':\\s*any\\b', '=\\s*any\\s*;', '[<,|&]\\s*any\\s*[>,|&\\[\\]]', '\\bany\\[\\]'].join('|'));
const SWITCH_OFF = new RegExp(['@ts-' + 'ignore', '@ts-' + 'expect-error', '@ts-' + 'nocheck', 'eslint-' + 'disable'].join('|'));

describe('architecture guard', () => {
  it('reads the sources, and knows the layer of every folder of src', () => {
    expect(FILES.length).toBeGreaterThan(500);
    const unknown = [...new Set(FILES.map((f) => f.dir))].filter((d) => !(d in LAYER));
    expect(unknown, 'a new folder in src needs a layer in LAYER (tests/arch.guard.test.ts)').toEqual([]);
  });

  it('a folder imports only its own layer or a lower one', () => {
    const offenders = collect(FILES, (f) =>
      importsOf(f)
        .filter((i) => i.to !== null && i.to !== 'pixi' && i.to !== f.dir && (LAYER[i.to] ?? 99) > LAYER[f.dir]!)
        .map((i) => `${f.path}:${i.line}  ${f.dir || 'src'} (layer ${LAYER[f.dir]}) imports ${i.spec} (layer ${LAYER[i.to!] ?? '?'})`),
    );
    const { fresh, cleared } = judge(offenders, LAYER_ALLOWED);
    expect(fresh, 'move the shared piece down to the lower layer, or pass it in from above (a callback, an event), instead of importing upward').toEqual([]);
    expect(cleared, 'these files keep to the layers now: take them off LAYER_ALLOWED').toEqual([]);
  });

  it('the rules of a fight import nothing but core and the shared server rules', () => {
    const offenders = collect(
      FILES.filter((f) => f.dir === 'game'),
      (f) => importsOf(f).filter((i) => i.to !== null && !['game', 'core', 'functions'].includes(i.to)).map((i) => `${f.path}:${i.line}  ${i.spec}`),
    );
    const { fresh, cleared } = judge(offenders, ['src/game/api.ts']);
    expect(fresh, 'src/game is the deterministic simulation: put what it needs in src/game or src/core').toEqual([]);
    expect(cleared, 'take src/game/api.ts off the list').toEqual([]);
  });

  it('the rules of a fight use no random number, clock, timer or page of their own', () => {
    const offenders = collect(FILES.filter((f) => f.dir === 'game'), (f) => hits(f, PURE_RULES));
    expect([...offenders.values()].flat(), 'draw from the seeded Rng (src/core/rng.ts) and count time in the simulation’s own ticks').toEqual([]);
  });

  it('the fight, the profile and the sound draw nothing: no Pixi, and no core module that pulls Pixi in, even through another', () => {
    const core = FILES.filter((f) => f.dir === 'core');
    const drawing = new Set(core.filter((f) => importsOf(f).some((i) => i.to === 'pixi')).map((f) => f.path.replace(/\.ts$/, '')));
    expect(drawing.size).toBeGreaterThan(0);
    for (let grew = true; grew; ) {
      grew = false;
      for (const f of core) {
        const name = f.path.replace(/\.ts$/, '');
        if (!drawing.has(name) && importsOf(f).some((i) => i.to === 'core' && drawing.has(targetOf(f, i.spec)))) {
          drawing.add(name);
          grew = true;
        }
      }
    }
    const offenders = collect(
      FILES.filter((f) => ['game', 'meta', 'audio'].includes(f.dir)),
      (f) => importsOf(f).filter((i) => i.to === 'pixi' || (i.to === 'core' && drawing.has(targetOf(f, i.spec)))).map((i) => `${f.path}:${i.line}  ${i.spec}`),
    );
    const allowed = ['src/audio/engine.ts', 'src/audio/devtools.ts'];
    const { fresh, cleared } = judge(offenders, allowed);
    expect(fresh, 'keep drawing in ui, fx, view and the screens; hand these folders plain data').toEqual([]);
    expect(cleared, 'these files pull no Pixi now: take them off the list').toEqual([]);
  });

  it('screens set no raw timers: they wait on the scene’s clock', () => {
    const offenders = collect(FILES.filter((f) => UI_DIRS.has(f.dir)), (f) => hits(f, RAW_TIMER));
    const { fresh, cleared } = judge(offenders, TIMER_ALLOWED);
    expect(fresh, 'wait on the scene’s clock, this.tweens.call(seconds, fn) or this.tweens.wait(seconds): it dies with the scene and stops with the pause, while a raw timer fires on a destroyed screen (uiTweens and game.onUpdate outlive the screen, so release them when it closes)').toEqual([]);
    expect(cleared, 'these files set no raw timer now: take them off TIMER_ALLOWED').toEqual([]);
  });

  it('screens wait for a change through onSettled, not a raw microtask', () => {
    const offenders = collect(FILES.filter((f) => UI_DIRS.has(f.dir)), (f) => hits(f, RAW_MICROTASK));
    expect([...offenders.values()].flat(), 'subscribe with onSettled(fn, ...sources) from core/events: it runs once however many changes came, and its unsubscribe drops a run still waiting, so nothing is rebuilt on a closed screen').toEqual([]);
  });

  it('nothing steps around the type checker (no any, no ts-ignore, no lint switch-off)', () => {
    const files = [...FILES, ...readSources(join(ROOT, 'functions', 'src'))];
    const offenders = collect(files, (f) => [...hits(f, ANY_TYPE), ...hits(f, SWITCH_OFF, f.raw)]);
    expect([...offenders.values()].flat(), 'give the value its real type (a type guard, unknown and a check, a declared interface)').toEqual([]);
  });

  it('the comment stripper keeps strings and line numbers, and drops both kinds of comment', () => {
    const code = stripComments("const a = 'http://x'; // Math.random()\n/* setTimeout(\n */ const b = `//`;");
    expect(code).toContain("'http://x'");
    expect(code).toContain('`//`');
    expect(code).not.toMatch(/Math\.random|setTimeout/);
    expect(code.split('\n')).toHaveLength(3);
  });
});
