/**
 * Machine-checkable quality report. Bakes every SFX and stinger exactly like the runtime does and
 * measures what comes out: duration, peak, RMS, DC, click safety at both ends, plus brightness
 * (spectral centroid) and weight (low-frequency share) to sanity-check design intent. Also renders
 * each music track offline through the real graph to check level and polyphony. Dev tooling only:
 * it is imported lazily from devtools.ts.
 */
import { analyse, type SoundStats } from './analysis';
import { bakeVariant } from './bake';
import { createGraph } from './graph';
import { MusicPlayer } from './music';
import { SOUNDS, type SoundDef } from './sounds';
import type { MusicTrackId } from './scores';

export interface ReportRow {
  id: string;
  kind: 'sfx' | 'stinger';
  cat: string;
  variants: number;
  durationMs: number;
  expectedMs: readonly [number, number];
  peak: number;
  rms: number;
  /** RMS with short sounds integrated over 200 ms: the figure the loudness tiers are compared on. */
  loudRms: number;
  silent: boolean;
  clipped: boolean;
  dcOffset: number;
  startsAtZero: boolean;
  endsNearZero: boolean;
  centroidHz: number;
  /** Centroid of the energy above 300 Hz. */
  brightHz: number;
  lowFrac: number;
  highFrac: number;
  /** Normalisation gain applied to the raw synth output. */
  gainDb: number;
  ok: boolean;
  issues: string[];
}

export interface Check {
  name: string;
  ok: boolean;
  detail: string;
}

export interface SoundReport {
  sampleRate: number;
  sfx: ReportRow[];
  stingers: ReportRow[];
  checks: Check[];
  failing: string[];
  /** The same rows as a printable ASCII table. */
  table: string;
  elapsedMs: number;
}

const DC_LIMIT = 0.02;

async function rowFor(def: SoundDef, sampleRate: number): Promise<ReportRow> {
  const n = def.recipe.variants ?? 1;
  const all: SoundStats[] = [];
  let gainDb = 0;
  for (let v = 0; v < n; v++) {
    const baked = await bakeVariant(def.recipe, def.key, v, sampleRate, true);
    all.push(baked.stats);
    gainDb = baked.gainDb;
  }
  const max = (f: (s: SoundStats) => number) => all.reduce((m, s) => Math.max(m, f(s)), -Infinity);
  const mean = (f: (s: SoundStats) => number) => all.reduce((m, s) => m + f(s), 0) / all.length;
  const [lo, hi] = def.recipe.ms;
  const issues: string[] = [];
  if (all.some((s) => s.silent)) issues.push('silent');
  if (all.some((s) => s.clipped)) issues.push('clipped');
  if (all.some((s) => Math.abs(s.dcOffset) > DC_LIMIT)) issues.push('dc');
  if (all.some((s) => !s.startsAtZero)) issues.push('click-start');
  if (all.some((s) => !s.endsNearZero)) issues.push('click-end');
  if (all.some((s) => s.durationMs < lo || s.durationMs > hi)) issues.push(`duration ${Math.round(max((s) => s.durationMs))}ms not in ${lo}-${hi}`);
  return {
    id: def.id,
    kind: def.stinger ? 'stinger' : 'sfx',
    cat: def.recipe.cat,
    variants: n,
    durationMs: Math.round(max((s) => s.durationMs)),
    expectedMs: def.recipe.ms,
    peak: round(max((s) => s.peak), 3),
    rms: round(mean((s) => s.rms), 4),
    loudRms: round(mean((s) => s.loudRms), 4),
    silent: all.some((s) => s.silent),
    clipped: all.some((s) => s.clipped),
    dcOffset: round(max((s) => Math.abs(s.dcOffset)), 4),
    startsAtZero: all.every((s) => s.startsAtZero),
    endsNearZero: all.every((s) => s.endsNearZero),
    centroidHz: Math.round(mean((s) => s.centroidHz)),
    brightHz: Math.round(mean((s) => s.brightHz)),
    lowFrac: round(mean((s) => s.lowFrac), 3),
    highFrac: round(mean((s) => s.highFrac), 3),
    gainDb: round(gainDb, 1),
    ok: issues.length === 0,
    issues,
  };
}

function round(v: number, digits: number): number {
  const k = Math.pow(10, digits);
  return Math.round(v * k) / k;
}

/** Design-intent checks: the escalation ladder, weight, brightness and tier ordering. */
function designChecks(rows: ReportRow[]): Check[] {
  const by = new Map(rows.map((r) => [`${r.kind}:${r.id}`, r]));
  const r = (id: string): ReportRow => by.get(`sfx:${id}`) as ReportRow;
  const checks: Check[] = [];
  const check = (name: string, ok: boolean, detail: string) => checks.push({ name, ok, detail });

  const ladder = ['summon_common', 'summon_rare', 'summon_epic', 'summon_legendary', 'summon_mythic'].map(r);
  check(
    'summon escalates in length',
    ladder.every((x, i) => i === 0 || x.durationMs > (ladder[i - 1] as ReportRow).durationMs),
    ladder.map((x) => x.durationMs).join(' < '),
  );
  check(
    'summon escalates in peak level',
    ladder.every((x, i) => i === 0 || x.peak >= (ladder[i - 1] as ReportRow).peak - 0.001),
    ladder.map((x) => x.peak).join(' <= '),
  );
  check(
    'summon_mythic has more low end than summon_common',
    r('summon_mythic').lowFrac > r('summon_common').lowFrac,
    `${r('summon_common').lowFrac} -> ${r('summon_mythic').lowFrac}`,
  );
  check(
    'summon_legendary/mythic carry sub weight',
    r('summon_legendary').lowFrac > 0.1 && r('summon_mythic').lowFrac > 0.1,
    `${r('summon_legendary').lowFrac}, ${r('summon_mythic').lowFrac}`,
  );
  check(
    'summon escalates in brightness (centroid above 300 Hz)',
    ladder.every((x, i) => i === 0 || x.brightHz >= (ladder[i - 1] as ReportRow).brightHz),
    ladder.map((x) => x.brightHz).join(' <= '),
  );
  check(
    'summon escalates in loudness (200 ms RMS)',
    ladder.every((x, i) => i === 0 || x.loudRms >= (ladder[i - 1] as ReportRow).loudRms * 0.97),
    ladder.map((x) => x.loudRms).join(' <= '),
  );
  check('coin is bright', r('coin').centroidHz > 1500, `${r('coin').centroidHz} Hz`);
  check('gem is bright', r('gem').centroidHz > 1800, `${r('gem').centroidHz} Hz`);
  check('hit_heavy heavier than hit_light', r('hit_heavy').lowFrac > r('hit_light').lowFrac, `${r('hit_light').lowFrac} -> ${r('hit_heavy').lowFrac}`);
  check('hit_light is band limited (no sub)', r('hit_light').lowFrac < 0.35, `${r('hit_light').lowFrac}`);
  check('explosion has low end', r('explosion').lowFrac > 0.25, `${r('explosion').lowFrac}`);
  check('boss_die has low end', r('boss_die').lowFrac > 0.25, `${r('boss_die').lowFrac}`);
  check('crit brighter than hit_heavy', r('crit').centroidHz > r('hit_heavy').centroidHz, `${r('hit_heavy').centroidHz} -> ${r('crit').centroidHz} Hz`);
  check('ui_click shorter than 120 ms', r('ui_click').durationMs <= 120, `${r('ui_click').durationMs} ms`);
  check('ui_error is dull (below ui_click brightness)', r('ui_error').centroidHz < r('ui_click').centroidHz, `${r('ui_error').centroidHz} vs ${r('ui_click').centroidHz} Hz`);
  const tier = (id: string) => r(id).loudRms;
  check(
    'tier order UI < combat < big (200 ms RMS)',
    tier('ui_click') < tier('hit_heavy') && tier('hit_heavy') < tier('summon_mythic'),
    `${tier('ui_click')} < ${tier('hit_heavy')} < ${tier('summon_mythic')}`,
  );
  const stingers = rows.filter((x) => x.kind === 'stinger');
  check('stingers are 1-2.3 s', stingers.every((x) => x.durationMs >= 1000 && x.durationMs <= 2300), stingers.map((x) => `${x.id} ${x.durationMs}`).join(', '));
  return checks;
}

export async function runReport(sampleRate: number): Promise<SoundReport> {
  const t0 = performance.now();
  const rows: ReportRow[] = [];
  for (const def of SOUNDS) rows.push(await rowFor(def, sampleRate));
  const checks = designChecks(rows);
  const failing = [
    ...rows.filter((x) => !x.ok).map((x) => `${x.kind}:${x.id} ${x.issues.join(', ')}`),
    ...checks.filter((c) => !c.ok).map((c) => `check: ${c.name} (${c.detail})`),
  ];
  const sfx = rows.filter((x) => x.kind === 'sfx');
  const stingers = rows.filter((x) => x.kind === 'stinger');
  return {
    sampleRate,
    sfx,
    stingers,
    checks,
    failing,
    table: `${formatTable(sfx)}

STINGERS
${formatTable(stingers)}`,
    elapsedMs: Math.round(performance.now() - t0),
  };
}

export function formatTable(rows: readonly ReportRow[]): string {
  const head = 'id                 var  ms    peak  rms    loud   dc      0 end  cent  bright low   high  gain  ok';
  const lines = rows.map((x) =>
    [
      x.id.padEnd(18),
      String(x.variants).padStart(3),
      String(x.durationMs).padStart(5),
      x.peak.toFixed(3),
      x.rms.toFixed(4),
      x.loudRms.toFixed(4),
      x.dcOffset.toFixed(4),
      x.startsAtZero ? 'Y' : 'n',
      x.endsNearZero ? 'Y' : 'n',
      String(x.centroidHz).padStart(5),
      String(x.brightHz).padStart(6),
      x.lowFrac.toFixed(2),
      x.highFrac.toFixed(2),
      x.gainDb.toFixed(1).padStart(5),
      x.ok ? 'ok' : x.issues.join(';'),
    ].join(' '),
  );
  return [head, ...lines].join('\n');
}

export interface MusicRow {
  track: MusicTrackId;
  intensity: number;
  seconds: number;
  peak: number;
  rms: number;
  centroidHz: number;
  lowFrac: number;
  clipped: boolean;
  dcOffset: number;
  /** Highest simultaneous voices the budget admitted while scheduling the clip. */
  peakOverlap: number;
  droppedByBudget: number;
  voices: number;
}

/** Render `seconds` of a track through the real graph (limiter included) and measure it. */
export async function renderMusic(track: MusicTrackId, intensity: number, seconds: number, sampleRate: number): Promise<MusicRow> {
  const ctx = new OfflineAudioContext(2, Math.ceil(seconds * sampleRate), sampleRate);
  const graph = createGraph(ctx);
  const player = new MusicPlayer(ctx, graph.musicBus, graph.reverbIn);
  player.setIntensity(intensity);
  player.play(track, 0.05);
  player.pump(seconds);
  player.pause();
  const buf = await ctx.startRendering();
  const ch = [buf.getChannelData(0), buf.getChannelData(1)];
  const a = analyse(ch, sampleRate, true);
  const st = player.stats();
  return {
    track,
    intensity,
    seconds,
    peak: round(a.peak, 3),
    rms: round(a.rms, 4),
    centroidHz: Math.round(a.centroidHz),
    lowFrac: round(a.lowFrac, 3),
    clipped: a.clipped,
    dcOffset: round(a.dcOffset, 4),
    peakOverlap: st.peakOverlap,
    droppedByBudget: st.droppedByBudget,
    voices: st.voicesCreated,
  };
}
