// Copies the sample files the game's recipes use (`needs` of src/audio/sfx-skills.ts) from the converted candidates of the sound board
// (public/soundboard/kenney/<pack>/<name>.wav, made by tools/sfx/convert.mjs from the CC0 Ogg files of art/sfx_src/kenney) into the game
// (src/assets/sfx/<pack>/<name>.wav) and rewrites the "In the game" table of docs/licenses/sounds.md. Node only, no browser, no sound.
//
//   node tools/sfx/ship.mjs            copy what the table below lists, check every file, rewrite the ledger
//
// The files are copied byte for byte (16-bit mono 44.1 kHz PCM WAV, silence trimmed by convert.mjs), except where a row names a `maxMs`: the
// recording is then cut there with a 12 ms fade-out (a long ring that the game only needs the first part of). Nothing else is recoded: a
// recording of 5 to 45 KB is smaller than the code around it, and PCM has no start delay that would blur the first millisecond of a "chaeng".
// To ship another file, add a row to FILES (with the recipe that uses it) and run this again; the checks refuse anything that is not
// from one of the three approved packs, not 16-bit mono 44.1 kHz, or over 60 KB / 400 ms.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const FROM = path.join(ROOT, 'public', 'soundboard', 'kenney');
const TO = path.join(ROOT, 'src', 'assets', 'sfx');
const LEDGER = path.join(ROOT, 'docs', 'licenses', 'sounds.md');
const DATE = '2026-10-19';
const PACKS = {
  'impact-sounds': 'https://kenney.nl/assets/impact-sounds',
  'rpg-audio': 'https://kenney.nl/assets/rpg-audio',
  'interface-sounds': 'https://kenney.nl/assets/interface-sounds',
};

/** [pack, file, where it is heard, maxMs?] */
const FILES = [
  ['impact-sounds', 'impactMetal_light_000', 'sp_cut_clash: the "chaeng" of the samurai skill (variant 0)'],
  ['impact-sounds', 'impactMetal_light_001', 'sp_cut_clash: the "chaeng" (variant 1)'],
  ['impact-sounds', 'impactMetal_light_003', 'sp_cut_clash: the long ring under variant 0 (cut at 300 ms)', 300],
  ['impact-sounds', 'impactMetal_light_004', 'sp_cut_clash: the "chaeng" (variant 2)'],
  ['impact-sounds', 'impactMetal_heavy_001', 'sp_shield_slam: the iron rim of the viking shield'],
  ['impact-sounds', 'impactWood_heavy_000', 'sp_shield_slam: the wooden body of the viking shield'],
  ['impact-sounds', 'impactMetal_heavy_000', 'sp_meteor_boom: the debris of the meteor'],
  ['impact-sounds', 'impactTin_medium_003', 'sp_poster_hole: the cork through the tin of the poster; imp_r_gunner: the tin plate under the cork'],
  ['impact-sounds', 'impactGlass_light_000', 'sp_shard_hit: a shard of ice glass (variant 0)'],
  ['impact-sounds', 'impactGlass_light_001', 'sp_shard_hit (variant 1), sp_glass_tap: the ice queen\'s tap'],
  ['impact-sounds', 'impactGlass_light_002', 'sp_shard_hit (variant 2), sp_flask_pop: the big flask of the alchemist'],
  ['impact-sounds', 'impactGlass_light_003', 'sp_shard_hit: a shard of ice glass (variant 3)'],
  ['impact-sounds', 'impactGlass_light_004', 'sp_shard_hit: a shard of ice glass (variant 4)'],
  ['impact-sounds', 'impactGlass_heavy_003', 'sp_glass_shatter: the body of the breaking glass'],
  ['impact-sounds', 'impactGlass_medium_004', 'sp_glass_shatter: the pieces of the breaking glass (cut at 300 ms)', 300],
  ['impact-sounds', 'impactGeneric_light_000', 'sp_capsule_bounce: plastic on the board (variant 0)'],
  ['impact-sounds', 'impactGeneric_light_002', 'sp_capsule_bounce (variant 1)'],
  ['impact-sounds', 'impactGeneric_light_004', 'sp_capsule_bounce (variant 2)'],
  ['rpg-audio', 'metalLatch', 'sp_sheath: the sword going home; sp_capsule_pop: the latch of the capsule'],
  ['rpg-audio', 'handleCoins2', 'sp_capsule_rattle: the prize rattling in its shell'],
  ['rpg-audio', 'bookClose', 'sp_poster_slap: the wanted poster slapped on the boss'],
  ['impact-sounds', 'impactWood_light_002', 'imp_w_sword: the wooden bar of the wooden sword (the knock under the crack)'],
  ['impact-sounds', 'impactWood_light_000', 'imp_r_archer: the arrow into the wooden board'],
  ['impact-sounds', 'impactWood_medium_000', 'imp_w_tiger: the shaft of the polearm (cut at 140 ms)', 140],
  ['impact-sounds', 'impactMetal_medium_000', 'imp_r_ninja: the shuriken on tin (cut at 110 ms)', 110],
  ['impact-sounds', 'impactMetal_medium_004', 'imp_w_samurai: the edge of the blade'],
  ['rpg-audio', 'chop', 'imp_w_viking: the axe chopping (the first 60 ms are used; the file is cut at 80 ms)', 80],
  ['rpg-audio', 'metalPot2', 'imp_t_chef: the frying pan (the first 90 ms are used; the file is cut at 130 ms)', 130],
  ['rpg-audio', 'knifeSlice', 'sp_dash: the samurai\'s afterimage tearing down the road (cut at 300 ms)', 300],
];

function check(file, bytes) {
  const b = fs.readFileSync(file);
  const bad = (why) => { throw new Error(`${file}: ${why}`); };
  if (b.toString('latin1', 0, 4) !== 'RIFF' || b.toString('latin1', 8, 16) !== 'WAVEfmt ') bad('not a WAV');
  if (b.readUInt16LE(20) !== 1 || b.readUInt16LE(22) !== 1 || b.readUInt32LE(24) !== 44100 || b.readUInt16LE(34) !== 16) bad('not 16-bit mono 44.1 kHz PCM');
  if (b.toString('latin1', 36, 40) !== 'data') bad('no data chunk where expected');
  const ms = Math.round((b.readUInt32LE(40) / 2 / 44100) * 1000);
  if (b.length > 60 * 1024) bad(`${b.length} bytes is over 60 KB`);
  if (ms > 400) bad(`${ms} ms is over 400 ms`);
  return { bytes: b.length, ms };
}

/** Write `src` to `dst` cut to `maxMs` with a 12 ms fade-out (16-bit mono PCM only: the checks below prove the result). */
function cut(src, dst, maxMs) {
  const b = fs.readFileSync(src);
  const frames = Math.min((b.length - 44) / 2, Math.round((maxMs / 1000) * 44100));
  const out = Buffer.alloc(44 + frames * 2);
  b.copy(out, 0, 0, 44);
  b.copy(out, 44, 44, 44 + frames * 2);
  out.writeUInt32LE(36 + frames * 2, 4);
  out.writeUInt32LE(frames * 2, 40);
  const fade = Math.min(frames, Math.round(0.012 * 44100));
  for (let i = 0; i < fade; i++) out.writeInt16LE(Math.round(out.readInt16LE(44 + (frames - fade + i) * 2) * (0.5 + 0.5 * Math.cos((Math.PI * (i + 1)) / fade))), 44 + (frames - fade + i) * 2);
  fs.writeFileSync(dst, out);
}

let total = 0;
const rows = [];
for (const [pack, name, where, maxMs] of FILES) {
  if (!PACKS[pack]) throw new Error(`pack ${pack} is not one of the three approved packs`);
  const src = path.join(FROM, pack, `${name}.wav`);
  if (!fs.existsSync(src)) throw new Error(`${src} does not exist (run tools/sfx/convert.mjs)`);
  const dst = path.join(TO, pack, `${name}.wav`);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  if (maxMs) cut(src, dst, maxMs);
  else fs.copyFileSync(src, dst);
  const info = check(dst);
  total += info.bytes;
  rows.push(`| src/assets/sfx/${pack}/${name}.wav | ${pack} / ${name}.ogg | ${PACKS[pack]} | CC0 | ${DATE} | ${where} |`);
}
// files of an earlier run that the table no longer lists are removed, so the folder and the ledger cannot disagree
const listed = new Set(FILES.map(([p, n]) => `${p}/${n}.wav`));
for (const pack of fs.existsSync(TO) ? fs.readdirSync(TO) : []) {
  for (const f of fs.readdirSync(path.join(TO, pack))) if (!listed.has(`${pack}/${f}`)) fs.rmSync(path.join(TO, pack, f));
}

const text = fs.readFileSync(LEDGER, 'utf8');
const crlf = text.includes('\r\n');
const lf = text.replace(/\r\n/g, '\n');
const head = lf.indexOf('## In the game');
if (head < 0) throw new Error('the ledger has no "In the game" section');
const section = `## In the game

Sample files that ship with the game, read by \`src/audio/samples.ts\` and laid UNDER a synthesised recipe of \`src/audio/sfx-skills.ts\` (the skills' signatures) or \`src/audio/sfx-impacts.ts\` (the landing of a weapon: wood, tin, steel, an axe, a pot) (a recipe is a whole sound without them: a file that does not load costs the layer, not the sound). Each is a copy of the converted candidate of the sound board (\`public/soundboard/kenney/<pack>/<name>.wav\`, see "How the files are converted" above: 16-bit mono 44.1 kHz PCM WAV, the silence around the sound trimmed), byte for byte, except the ones whose row says "cut at N ms": those are cut there with a 12 ms fade-out because the game only needs the first part of a long ring. Made by \`node tools/sfx/ship.mjs\`, which also writes this table and refuses anything that is not from the three packs, not in that format, or over 60 KB or 400 ms. The date is the day the file was put into the game (the three packs were downloaded on 2026-10-18). ${rows.length} files, ${(total / 1024).toFixed(0)} KB in all. Not recoded to AAC: see above (the start delay of a compressed file would blur the first millisecond of a hit, and 20 to 45 KB per file is smaller than the code around it).

| file in the game | source pack / file | source URL | license | date | where it plays |
|---|---|---|---|---|---|
${rows.join('\n')}
`;
let out = lf.slice(0, head) + section;
if (crlf) out = out.replace(/\n/g, '\r\n');
fs.writeFileSync(LEDGER, out);
console.log(`${rows.length} files, ${total} bytes -> ${path.relative(ROOT, TO)}; ledger rewritten`);
