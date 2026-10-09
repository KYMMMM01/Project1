// Builds two subset webfonts into public/fonts:
//   game-latin.<hash>.woff2  Lilita One  — digits, Latin, punctuation (chunky display face)
//   game-kr.<hash>.woff2     Jua         — only the Hangul actually used by the game's strings
// A full Korean font is several MB; subsetting to the glyphs in use keeps it around 100 KB, which
// matters for web-portal initial-download budgets. Re-run after adding strings: `npm run font`
// (it also runs automatically before `dev` and `build`; tests/core.font.test.ts fails when a string has a glyph the subset lacks).
//
// The file names carry a digest of their bytes and index.html's @font-face rules are rewritten to match, so a browser or a
// CDN that kept an older subset under the old name can never be handed to a newer page: before this, a fixed name
// `game-kr.woff2` let an old subset live on, and every character added since then fell back to the thin system font.
import { mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import subsetFont from 'subset-font';
import {
  EXTRA_LATIN, collectChars, fontFileRe, hashedName, isHangul, withFontNames, woff2Codepoints,
} from './fontTools.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'public', 'fonts');
mkdirSync(outDir, { recursive: true });

const used = collectChars(root);

const ascii = Array.from({ length: 0x7f - 0x20 }, (_, i) => String.fromCharCode(0x20 + i)).join('');
const all = [...used].join('');
// Both subsets get every used character: the subsetter keeps what its face carries and drops the rest, and the page's font stack
// (display face first, Korean face second) then draws each character from the first face that has it.
const latinText = ascii + EXTRA_LATIN + all;
const krText = all + EXTRA_LATIN + '가나다라마바사아자차카타파하' + ascii; // never ship an empty subset

const jua = readFileSync(join(root, 'node_modules/@expo-google-fonts/jua/400Regular/Jua_400Regular.ttf'));
const lilita = readFileSync(
  join(root, 'node_modules/@expo-google-fonts/lilita-one/400Regular/LilitaOne_400Regular.ttf'),
);

const latin = await subsetFont(lilita, latinText, { targetFormat: 'woff2' });
const kr = await subsetFont(jua, krText, { targetFormat: 'woff2' });

const files = { 'game-latin': hashedName('game-latin', latin), 'game-kr': hashedName('game-kr', kr) };
writeFileSync(join(outDir, files['game-latin']), latin);
writeFileSync(join(outDir, files['game-kr']), kr);
// Older subsets (the plain names, and earlier hashes) go away so dist/ never ships two copies.
for (const name of readdirSync(outDir)) {
  const stale = Object.entries(files).some(([stem, file]) => name !== file && fontFileRe(stem).test(name));
  if (stale) unlinkSync(join(outDir, name));
}

const pagePath = join(root, 'index.html');
const page = readFileSync(pagePath, 'utf8');
const next = withFontNames(page, files);
if (next !== page) writeFileSync(pagePath, next);

// What the two faces really carry, read back from the files just written (not from what was asked of the subsetter).
const inLatin = woff2Codepoints(latin);
const inKr = woff2Codepoints(kr);
const missing = [...used].filter((ch) => !inLatin.has(ch.codePointAt(0)) && !inKr.has(ch.codePointAt(0)));
const hangulMissing = missing.filter(isHangul);
const hangul = [...used].filter(isHangul).length;
console.log(
  `[font] ${files['game-latin']} ${(latin.length / 1024).toFixed(1)} KB, ` +
    `${files['game-kr']} ${(kr.length / 1024).toFixed(1)} KB (${hangul} Hangul syllables, ${used.size} non-ASCII chars)`,
);
if (hangulMissing.length > 0) {
  console.warn(`[font] WARNING: ${hangulMissing.length} Hangul syllables the game uses are not in Jua and will be drawn in a system font: ${hangulMissing.join('')}`);
}
if (missing.length > hangulMissing.length) {
  console.log(`[font] symbols neither face carries (drawn from the system font): ${missing.filter((ch) => !isHangul(ch)).join('')}`);
}
