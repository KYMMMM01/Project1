import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { GROUP_KO, PACK_KO, groupOf } from '@/soundboard/catalog';
import { candidateKey, candidateUrl, db, groupManifest, loadManifest, parseManifest } from '@/soundboard/candidates';
import { isSoundBoardRoute } from '@/soundboard/route';
import { matchGain } from '@/soundboard/types';

// These tests read a few hundred files (the sources of the game, the 208 WAVs): a machine under load takes longer than the default 5 s.
vi.setConfig({ testTimeout: 60_000 });

const ROOT = join(__dirname, '..');
const SERVED = join(ROOT, 'public', 'soundboard', 'kenney');
const SOURCE = join(ROOT, 'art', 'sfx_src', 'kenney');
const LEDGER = readFileSync(join(ROOT, 'docs', 'licenses', 'sounds.md'), 'utf8');
const MANIFEST = parseManifest(JSON.parse(readFileSync(join(SERVED, 'manifest.json'), 'utf8')));

const PACKS: Record<string, { dir: string; url: string }> = {
  'impact-sounds': { dir: 'kenney_impact-sounds', url: 'https://kenney.nl/assets/impact-sounds' },
  'rpg-audio': { dir: 'kenney_rpg-audio', url: 'https://kenney.nl/assets/rpg-audio' },
  'interface-sounds': { dir: 'kenney_interface-sounds', url: 'https://kenney.nl/assets/interface-sounds' },
};

describe('sound board route', () => {
  it('is ?scene=sounds, with no debug flag', () => {
    expect(isSoundBoardRoute('?scene=sounds')).toBe(true);
    expect(isSoundBoardRoute('?foo=1&scene=sounds&bar=2')).toBe(true);
  });

  it('is nothing else', () => {
    for (const q of ['', '?', '?scene=home', '?scene=battle', '?scene=sound', '?demo=audio', '?scene=Sounds', '?sounds=1']) expect(isSoundBoardRoute(q), q).toBe(false);
  });

  it('main.ts opens it before it touches the game, the profile or the canvas', () => {
    const main = readFileSync(join(ROOT, 'src', 'main.ts'), 'utf8');
    const route = main.indexOf('isSoundBoardRoute(location.search)');
    expect(route).toBeGreaterThan(0);
    expect(route).toBeLessThan(main.indexOf('game.init('));
    expect(route).toBeLessThan(main.indexOf('createApp()'));
    expect(route).toBeLessThan(main.indexOf('debugEnabled()', main.indexOf('async function main')));
    // a release build can leave it out
    expect(main).toContain("import.meta.env.VITE_SOUNDBOARD !== 'off'");
  });

  it('the board imports no game screen, profile or save (it changes nothing the owner has)', () => {
    const dir = join(ROOT, 'src', 'soundboard');
    for (const f of readdirSync(dir)) {
      const text = readFileSync(join(dir, f), 'utf8');
      for (const m of text.matchAll(/from '@\/([a-z]+)/g)) {
        expect(['audio', 'game'], `${f} imports @/${m[1]}`).toContain(m[1]);
      }
      expect(text, f).not.toMatch(/@\/meta|@\/core\/save|localStorage\.(removeItem|clear)/);
    }
  });
});

describe('sound board candidates: the manifest', () => {
  it('reads what the converter wrote and drops entries that do not look right', () => {
    expect(parseManifest(null).files).toEqual([]);
    expect(parseManifest({ files: [{ pack: 'x' }, 7, null] }).files).toEqual([]);
    expect(MANIFEST.files.length).toBeGreaterThan(200);
  });

  it('has the impact pack, the rpg pack and the interface pack’s clicks, nothing else', () => {
    const by = new Map<string, number>();
    for (const c of MANIFEST.files) by.set(c.pack, (by.get(c.pack) ?? 0) + 1);
    expect([...by.keys()].sort()).toEqual(Object.keys(PACKS).sort());
    expect(by.get('impact-sounds')).toBe(130);
    expect(by.get('rpg-audio')).toBe(51);
    expect(by.get('interface-sounds')).toBe(27);
    for (const c of MANIFEST.files.filter((f) => f.pack === 'interface-sounds')) expect(c.name).toMatch(/^(click|tick|select|switch|toggle)_/);
  });

  it('every file is a WAV that plays everywhere (16-bit mono 44.1 kHz PCM), as long and as big as the manifest says, and not clipped', () => {
    for (const c of MANIFEST.files) {
      expect(c.file, c.name).toBe(`${c.pack}/${c.name}.wav`);
      const path = join(SERVED, c.file);
      expect(existsSync(path), c.file).toBe(true);
      const b = readFileSync(path);
      expect(b.length, `${c.file} bytes`).toBe(c.bytes);
      expect(b.toString('latin1', 0, 4), c.file).toBe('RIFF');
      expect(b.toString('latin1', 8, 16), c.file).toBe('WAVEfmt ');
      expect(b.readUInt16LE(20), `${c.file} PCM`).toBe(1);
      expect(b.readUInt16LE(22), `${c.file} channels`).toBe(1);
      expect(b.readUInt32LE(24), `${c.file} rate`).toBe(44100);
      expect(b.readUInt16LE(34), `${c.file} bits`).toBe(16);
      expect(b.toString('latin1', 36, 40), c.file).toBe('data');
      const dataBytes = b.readUInt32LE(40);
      expect(dataBytes, c.file).toBe(b.length - 44);
      expect(Math.round((dataBytes / 2 / 44100) * 1000), `${c.file} ms`).toBe(c.ms);
      expect(c.peak, `${c.file} peak`).toBeLessThanOrEqual(0.98 + 1e-9);
      expect(c.loud, c.file).toBeGreaterThan(0);
      // nothing is flat-topped at full scale
      let full = 0;
      for (let i = 44; i + 1 < b.length; i += 2) if (Math.abs(b.readInt16LE(i)) >= 32767) full++;
      expect(full, `${c.file} clipped samples`).toBe(0);
    }
  });

  it('there is no file on disk that the manifest does not know, and the set stays small', () => {
    const known = new Set(MANIFEST.files.map((c) => c.file));
    let total = 0;
    for (const pack of Object.keys(PACKS)) {
      for (const f of readdirSync(join(SERVED, pack))) {
        expect(known.has(`${pack}/${f}`), `${pack}/${f}`).toBe(true);
        total += statSync(join(SERVED, pack, f)).size;
      }
    }
    expect(total).toBeLessThan(8 * 1024 * 1024);
    for (const c of MANIFEST.files) expect(c.bytes, c.file).toBeLessThan(200 * 1024);
  });

  it('only Ogg or WAV files are served, never anything else (no mp3, no unknown formats)', () => {
    for (const pack of Object.keys(PACKS)) for (const f of readdirSync(join(SERVED, pack))) expect(f).toMatch(/\.wav$/);
  });
});

describe('sound board candidates: licenses (the ledger of docs/licenses/sounds.md)', () => {
  it('every served file comes from one of the three CC0 packs the owner approved, and its source file is in the repository with the pack’s license text', () => {
    for (const [pack, info] of Object.entries(PACKS)) {
      const license = readFileSync(join(SOURCE, info.dir, 'License.txt'), 'utf8');
      expect(license, pack).toContain('Creative Commons Zero');
      expect(license, pack).toContain('commercial');
    }
    for (const c of MANIFEST.files) expect(existsSync(join(SOURCE, PACKS[c.pack]!.dir, 'Audio', `${c.name}.ogg`)), `${c.pack}/${c.name}.ogg`).toBe(true);
  });

  it('lists every served file with its source pack and file, URL, CC0 and a date', () => {
    for (const c of MANIFEST.files) {
      const row = LEDGER.split('\n').find((l) => l.includes(`public/soundboard/kenney/${c.file} `));
      expect(row, c.file).toBeDefined();
      expect(row).toContain(`${c.pack} / ${c.name}.ogg`);
      expect(row).toContain(PACKS[c.pack]!.url);
      expect(row).toContain('CC0');
      expect(row).toMatch(/\| \d{4}-\d{2}-\d{2} \|/);
    }
  });

  it('lists no file that is not served', () => {
    const rows = LEDGER.split('\n').filter((l) => l.startsWith('| public/soundboard/'));
    expect(rows).toHaveLength(MANIFEST.files.length);
  });

  it('names the three sources of sound and says how the Ogg was converted', () => {
    expect(LEDGER).toContain('src/audio');
    expect(LEDGER).toContain('ElevenLabs');
    expect(LEDGER).toContain('WAV');
    for (const info of Object.values(PACKS)) expect(LEDGER).toContain(info.url);
  });
});

describe('sound files in the game', () => {
  const AUDIO = /\.(wav|ogg|oga|mp3|m4a|aac|flac|opus|webm|mp4)$/i;
  const found: string[] = [];
  const walk = (dir: string, skip: (p: string) => boolean): void => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (skip(p)) continue;
      if (statSync(p).isDirectory()) walk(p, skip);
      else if (AUDIO.test(name)) found.push(p.slice(ROOT.length + 1).split('\\').join('/'));
    }
  };
  walk(join(ROOT, 'src'), () => false);
  walk(join(ROOT, 'public'), (p) => p === join(ROOT, 'public', 'soundboard'));

  it('every sound file that ships with the game has a row in the ledger "In the game" (none yet: the game’s own sounds are synthesised)', () => {
    const inGame = LEDGER.slice(LEDGER.indexOf('## In the game'));
    for (const f of found) expect(inGame, f).toContain(f);
  });

  it('nothing of the game loads the board’s candidate files (they are served for the board only)', () => {
    const offenders: string[] = [];
    const scan = (dir: string): void => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) {
          if (p !== join(ROOT, 'src', 'soundboard')) scan(p);
        } else if (/\.(ts|html|json|css)$/.test(name) && readFileSync(p, 'utf8').includes('soundboard/kenney')) offenders.push(p.slice(ROOT.length + 1));
      }
    };
    scan(join(ROOT, 'src'));
    expect(offenders).toEqual([]);
    expect(readFileSync(join(ROOT, 'index.html'), 'utf8')).not.toContain('soundboard');
  });
});

describe('sound board candidates: how the page groups them', () => {
  const packs = groupManifest(MANIFEST);

  it('every file lands in a group with a Korean name', () => {
    expect(packs.map((p) => p.pack)).toEqual(['impact-sounds', 'rpg-audio', 'interface-sounds']);
    for (const p of packs) {
      expect(PACK_KO[p.pack], p.pack).toBeDefined();
      for (const g of p.groups) expect(GROUP_KO[g.group], `${p.pack}/${g.group} needs a Korean name`).toBeDefined();
    }
    expect(packs.reduce((n, p) => n + p.count, 0)).toBe(MANIFEST.files.length);
    expect(packs.flatMap((p) => p.groups.flatMap((g) => g.files)).every((c) => groupOf(c.name) !== '')).toBe(true);
  });

  it('puts the "챙" (metal on metal) sounds where the owner will look: metal and plate impacts, and the pots', () => {
    const impact = packs.find((p) => p.pack === 'impact-sounds');
    const names = impact?.groups.map((g) => g.group) ?? [];
    for (const g of ['impactMetal_heavy', 'impactMetal_light', 'impactMetal_medium', 'impactPlate_heavy', 'impactPlate_light', 'impactPlate_medium']) expect(names).toContain(g);
    expect(GROUP_KO.impactMetal_heavy).toContain('챙');
  });

  it('keys and addresses', () => {
    const c = MANIFEST.files[0]!;
    expect(candidateKey(c)).toBe(`${c.pack}/${c.name}`);
    expect(candidateUrl(c.file, 'https://kymmmm01.github.io/Project1/?scene=sounds')).toBe(`https://kymmmm01.github.io/Project1/soundboard/kenney/${c.file}`);
    expect(candidateUrl('manifest.json', 'http://127.0.0.1:5251/')).toBe('http://127.0.0.1:5251/soundboard/kenney/manifest.json');
  });

  it('measures in decibels, and matches a candidate to the game’s impact level without clipping', () => {
    expect(db(1)).toBe('0.0');
    expect(db(0.5)).toBe('-6.0');
    expect(db(0)).toBe('-inf');
    for (const c of MANIFEST.files) {
      const g = matchGain(c);
      expect(g, c.file).toBeGreaterThan(0);
      // the game's rule: never past the target peak of its category (impact 0.28, the interface clicks 0.2)
      expect(c.peak * g, c.file).toBeLessThanOrEqual((c.pack === 'interface-sounds' ? 0.2 : 0.28) + 1e-9);
    }
    expect(matchGain({ pack: 'impact-sounds', peak: 0, loud: 0 })).toBe(1);
    // a short loud hit is held back by its peak, a long quiet pad by its loudness
    expect(matchGain({ pack: 'impact-sounds', peak: 0.9, loud: 0.09 })).toBeCloseTo(0.28 / 0.9, 6);
    expect(matchGain({ pack: 'impact-sounds', peak: 0.2, loud: 0.1 })).toBeCloseTo(0.42, 6);
    expect(matchGain({ pack: 'interface-sounds', peak: 0.6, loud: 0.07 })).toBeCloseTo(0.2 / 0.6, 6);
  });

  it('reads the manifest over the network address, and fails on an error status', async () => {
    const ok = await loadManifest('http://x.test/', () => Promise.resolve(new Response(JSON.stringify(MANIFEST), { status: 200 })));
    expect(ok.files).toHaveLength(MANIFEST.files.length);
    await expect(loadManifest('http://x.test/', () => Promise.resolve(new Response('no', { status: 404 })))).rejects.toThrow('HTTP 404');
  });
});
