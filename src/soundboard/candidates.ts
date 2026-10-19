/**
 * The candidate samples (CC0 packs by Kenney, converted to WAV by `tools/sfx/convert.mjs`): the manifest the tool writes, and how the page
 * groups it. The WAV files live in `public/soundboard/kenney/` (the test build serves them, nothing in the game loads them).
 */
import { GROUP_KO, PACK_KO, groupOf } from './catalog';
import type { Candidate, Manifest } from './types';

/** Where the files are, relative to the page. */
export const CANDIDATE_DIR = 'soundboard/kenney/';

export const candidateKey = (c: Pick<Candidate, 'pack' | 'name'>): string => `${c.pack}/${c.name}`;

export function candidateUrl(file: string, base: string): string {
  return new URL(CANDIDATE_DIR + file, base).href;
}

function isCandidate(v: unknown): v is Candidate {
  if (typeof v !== 'object' || v === null) return false;
  const c = v as Record<string, unknown>;
  return (
    typeof c.pack === 'string' &&
    typeof c.name === 'string' &&
    typeof c.file === 'string' &&
    typeof c.ms === 'number' &&
    typeof c.peak === 'number' &&
    typeof c.loud === 'number' &&
    typeof c.bytes === 'number' &&
    typeof c.hz === 'number'
  );
}

/** The manifest as the tool wrote it; entries that do not look right are dropped. */
export function parseManifest(json: unknown): Manifest {
  const o = (typeof json === 'object' && json !== null ? json : {}) as Record<string, unknown>;
  const files = Array.isArray(o.files) ? o.files.filter(isCandidate) : [];
  return { made: typeof o.made === 'string' ? o.made : '', codec: typeof o.codec === 'string' ? o.codec : '', files };
}

export async function loadManifest(base: string, fetcher: (url: string) => Promise<Response> = (u) => fetch(u)): Promise<Manifest> {
  const res = await fetcher(candidateUrl('manifest.json', base));
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return parseManifest(await res.json());
}

export interface CandidateGroup {
  group: string;
  ko: string;
  files: Candidate[];
}

export interface PackView {
  pack: string;
  ko: string;
  blurb: string;
  groups: CandidateGroup[];
  count: number;
}

/** The manifest by pack, then by group (the file name without its number), in the order the files come. */
export function groupManifest(m: Manifest): PackView[] {
  const packs: PackView[] = [];
  for (const c of m.files) {
    let p = packs.find((x) => x.pack === c.pack);
    if (!p) {
      const info = PACK_KO[c.pack];
      p = { pack: c.pack, ko: info?.ko ?? c.pack, blurb: info?.blurb ?? '', groups: [], count: 0 };
      packs.push(p);
    }
    const g = groupOf(c.name);
    let grp = p.groups.find((x) => x.group === g);
    if (!grp) {
      grp = { group: g, ko: GROUP_KO[g] ?? g, files: [] };
      p.groups.push(grp);
    }
    grp.files.push(c);
    p.count++;
  }
  return packs;
}

/** dBFS of a linear level, one decimal, for the row's small print ("-3.2"). */
export function db(linear: number): string {
  if (!(linear > 0)) return '-inf';
  return (20 * Math.log10(linear)).toFixed(1);
}
