// Builds two subset webfonts into public/fonts:
//   game-latin.woff2  Lilita One  — digits, Latin, punctuation (chunky display face)
//   game-kr.woff2     Jua         — only the Hangul actually used by the game's strings
// A full Korean font is several MB; subsetting to the glyphs in use keeps it around 100 KB, which
// matters for web-portal initial-download budgets. Re-run after adding strings: `npm run font`
// (it also runs automatically before `dev` and `build`).
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import subsetFont from 'subset-font';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'public', 'fonts');
mkdirSync(outDir, { recursive: true });

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.(ts|html|json)$/.test(name)) out.push(p);
  }
  return out;
}

// Collect every non-ASCII character that appears anywhere in the source. Scanning all of src (not
// just the i18n tables) means a Korean string that someone hard-codes still gets its glyphs.
const sources = [...walk(join(root, 'src')), join(root, 'index.html')];
const used = new Set();
for (const file of sources) {
  const text = readFileSync(file, 'utf8');
  for (const ch of text) {
    const cp = ch.codePointAt(0);
    if (cp > 0x7f) used.add(ch);
  }
}

const ascii = Array.from({ length: 0x7f - 0x20 }, (_, i) => String.fromCharCode(0x20 + i)).join('');
const extraLatin = '×÷±·•…‘’“”–—→←↑↓★☆♥♪∞°%‰₩€¥£©®™';
const latinText = ascii + extraLatin;
const krText = [...used].join('') + extraLatin + '가나다라마바사아자차카타파하'; // never ship an empty subset

const jua = readFileSync(join(root, 'node_modules/@expo-google-fonts/jua/400Regular/Jua_400Regular.ttf'));
const lilita = readFileSync(
  join(root, 'node_modules/@expo-google-fonts/lilita-one/400Regular/LilitaOne_400Regular.ttf'),
);

const latin = await subsetFont(lilita, latinText, { targetFormat: 'woff2' });
const kr = await subsetFont(jua, krText + ascii, { targetFormat: 'woff2' });

writeFileSync(join(outDir, 'game-latin.woff2'), latin);
writeFileSync(join(outDir, 'game-kr.woff2'), kr);

const hangul = [...used].filter((c) => {
  const cp = c.codePointAt(0);
  return cp >= 0xac00 && cp <= 0xd7a3;
}).length;
console.log(
  `[font] game-latin.woff2 ${(latin.length / 1024).toFixed(1)} KB, ` +
    `game-kr.woff2 ${(kr.length / 1024).toFixed(1)} KB (${hangul} Hangul syllables, ${used.size} non-ASCII chars)`,
);
