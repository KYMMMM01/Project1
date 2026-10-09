// Shared by scripts/build-font.mjs (the builder) and tests/core.font.test.ts (the check on its result), so what the
// builder collects and what the test demands cannot drift apart: the character scan, the WOFF2 reader, the
// content-hashed file names and the @font-face rewrite.
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { brotliDecompressSync } from 'node:zlib';

/** Every file the game's text can come from: all of src (strings, data, codex, guide, comments too) and the page. */
export function sourceFiles(root) {
  const out = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(ts|html|json)$/.test(name)) out.push(p);
    }
  };
  walk(join(root, 'src'));
  out.push(join(root, 'index.html'));
  return out;
}

/** Characters the browser's own locale data writes into the game (`Intl.DateTimeFormat('ko-KR', ...)` in the battle tab's date line and the like): no source file spells them. */
export const RUNTIME_CHARS = '년월일화수목금토오전후시분초요';

/** Characters of the game's symbols that the display face carries and that must stay in its subset. */
export const EXTRA_LATIN = '×÷±·•…‘’“”–—→←↑↓★☆♥♪∞°%‰₩€¥£©®™−§²';

/** Every non-ASCII character in the sources, plus RUNTIME_CHARS, as a Set of one-character strings. */
export function collectChars(root) {
  const used = new Set();
  for (const file of sourceFiles(root)) {
    for (const ch of readFileSync(file, 'utf8')) if (ch.codePointAt(0) > 0x7f) used.add(ch);
  }
  for (const ch of RUNTIME_CHARS) used.add(ch);
  return used;
}

/** True for a Korean syllable block character. */
export function isHangul(ch) {
  const cp = ch.codePointAt(0);
  return cp >= 0xac00 && cp <= 0xd7a3;
}

// ───────────────────────────── WOFF2 ─────────────────────────────

/** Table tags by the index a WOFF2 table directory entry uses (W3C WOFF2 spec, "known table tags"). */
const KNOWN_TAGS = [
  'cmap', 'head', 'hhea', 'hmtx', 'maxp', 'name', 'OS/2', 'post', 'cvt ', 'fpgm', 'glyf', 'loca', 'prep', 'CFF ', 'VORG', 'EBDT',
  'EBLC', 'gasp', 'hdmx', 'kern', 'LTSH', 'PCLT', 'VDMX', 'vhea', 'vmtx', 'BASE', 'GDEF', 'GPOS', 'GSUB', 'EBSC', 'JSTF', 'MATH',
  'CBDT', 'CBLC', 'COLR', 'CPAL', 'SVG ', 'sbix', 'acnt', 'avar', 'bdat', 'bloc', 'bsln', 'cvar', 'fdsc', 'feat', 'fmtx', 'fvar',
  'gvar', 'hsty', 'just', 'lcar', 'mort', 'morx', 'opbd', 'prop', 'trak', 'Zapf', 'Silf', 'Glat', 'Gloc', 'Feat', 'Sill',
];

/** The code points a WOFF2 font maps to a glyph, read from its cmap (formats 4 and 12). */
export function woff2Codepoints(file) {
  const b = new Uint8Array(file.buffer, file.byteOffset, file.byteLength);
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  if (v.getUint32(0) !== 0x774f4632) throw new Error('not a WOFF2 file');
  const count = v.getUint16(12);
  const compressed = v.getUint32(20);
  let pos = 48;
  const base128 = () => {
    let n = 0;
    for (let i = 0; i < 5; i++) {
      const byte = b[pos++];
      n = n * 128 + (byte & 0x7f);
      if ((byte & 0x80) === 0) return n;
    }
    throw new Error('bad UIntBase128');
  };
  let cmapAt = -1;
  let cursor = 0;
  for (let i = 0; i < count; i++) {
    const flags = b[pos++];
    const index = flags & 0x3f;
    let tag;
    if (index === 0x3f) {
      tag = String.fromCharCode(b[pos], b[pos + 1], b[pos + 2], b[pos + 3]);
      pos += 4;
    } else {
      tag = KNOWN_TAGS[index];
    }
    const version = flags >> 6;
    const original = base128();
    const geometry = tag === 'glyf' || tag === 'loca';
    const length = (geometry ? version === 0 : version !== 0) ? base128() : original;
    if (tag === 'cmap') cmapAt = cursor;
    cursor += length;
  }
  if (cmapAt < 0) throw new Error('no cmap table');
  const tables = brotliDecompressSync(b.subarray(pos, pos + compressed));
  const t = new DataView(tables.buffer, tables.byteOffset, tables.byteLength);
  const out = new Set();
  const subtables = t.getUint16(cmapAt + 2);
  for (let i = 0; i < subtables; i++) {
    const at = cmapAt + t.getUint32(cmapAt + 8 + i * 8);
    const format = t.getUint16(at);
    if (format === 12) {
      const groups = t.getUint32(at + 12);
      for (let g = 0; g < groups; g++) {
        const first = t.getUint32(at + 16 + g * 12);
        const last = t.getUint32(at + 20 + g * 12);
        for (let c = first; c <= last; c++) out.add(c);
      }
    } else if (format === 4) {
      const segments = t.getUint16(at + 6) / 2;
      const ends = at + 14;
      const starts = ends + segments * 2 + 2;
      for (let s = 0; s < segments; s++) {
        const last = t.getUint16(ends + s * 2);
        for (let c = t.getUint16(starts + s * 2); c <= last && c < 0xffff; c++) out.add(c);
      }
    }
  }
  return out;
}

// ───────────────────────────── file names and the page ─────────────────────────────

/** `game-kr.3fa91c2e.woff2`: the name carries a digest of the bytes, so a browser or a CDN that kept an older subset can never serve it for a newer page. */
export function hashedName(stem, bytes) {
  return `${stem}.${createHash('sha256').update(bytes).digest('hex').slice(0, 8)}.woff2`;
}

/** The pattern of the hashed (or, before this scheme, plain) font file names of a stem. */
export function fontFileRe(stem) {
  return new RegExp(`^${stem}(\\.[0-9a-f]{8})?\\.woff2$`);
}

/** The `url('./fonts/<stem>...woff2')` of an @font-face rule. */
export function fontUrlRe(stem) {
  return new RegExp(`url\\('\\./fonts/${stem}(?:\\.[0-9a-f]{8})?\\.woff2'\\)`);
}

/** The page with the font rules of `names` ({ 'game-kr': file name, ... }) pointing at those files. Throws when a rule is missing. */
export function withFontNames(html, names) {
  let out = html;
  for (const [stem, file] of Object.entries(names)) {
    const re = fontUrlRe(stem);
    if (!re.test(out)) throw new Error(`index.html has no @font-face rule for ${stem}`);
    out = out.replace(re, `url('./fonts/${file}')`);
  }
  return out;
}

/** The font file names an index.html refers to, by stem. */
export function fontNamesIn(html, stems) {
  const out = {};
  for (const stem of stems) {
    const m = new RegExp(`url\\('\\./fonts/(${stem}(?:\\.[0-9a-f]{8})?\\.woff2)'\\)`).exec(html);
    if (m) out[stem] = m[1];
  }
  return out;
}
