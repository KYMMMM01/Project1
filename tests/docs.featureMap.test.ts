import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// docs/기능지도.md is how a person or an agent reaches a screen; it stays true because this test fails when a hook it names is gone,
// or when a hook in the code is not in it.

const ROOT = join(__dirname, '..');
const MAP = readFileSync(join(ROOT, 'docs', '기능지도.md'), 'utf8');

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? sources(p) : name.endsWith('.ts') ? [readFileSync(p, 'utf8')] : [];
  });
}

const code = sources(join(ROOT, 'src'));
const exposed = new Set(code.flatMap((text) => [...text.matchAll(/debugExpose\('([A-Za-z]+)'/g)].map((m) => m[1]!)));
// The hooks installDebug puts on window.__dbg itself (src/core/debug.ts).
const debugTs = readFileSync(join(ROOT, 'src', 'core', 'debug.ts'), 'utf8');
const core = debugTs.slice(debugTs.indexOf('window.__dbg = {'), debugTs.indexOf('\n  };', debugTs.indexOf('window.__dbg = {')));
for (const m of core.matchAll(/^ {4}([A-Za-z]+)(?:[,:(]| =)/gm)) exposed.add(m[1]!);
const named = new Set([...MAP.matchAll(/__dbg\.([A-Za-z]+)/g)].map((m) => m[1]!));

describe('docs/기능지도.md (the feature map)', () => {
  it('finds the hooks in the code', () => {
    for (const name of ['game', 'scenes', 'toClient', 'texts', 'scrollTo', 'help', 'meta', 'routine', 'battle']) expect(exposed, name).toContain(name);
  });

  it('names only hooks that exist', () => {
    expect([...named].filter((n) => !exposed.has(n)), 'docs/기능지도.md names a window.__dbg hook the code no longer has').toEqual([]);
  });

  it('lists every hook the code installs', () => {
    expect([...exposed].filter((n) => !named.has(n)), 'a new window.__dbg hook needs a row in docs/기능지도.md section 5').toEqual([]);
  });
});
