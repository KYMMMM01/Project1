/**
 * Machine-checkable quality report. Bakes every SFX and stinger exactly like the runtime does and
 * measures what comes out: duration, peak, RMS, DC, click safety at both ends, plus brightness
 * (spectral centroid) and weight (low-frequency share) to sanity-check design intent. Also renders
 * each music track offline through the real graph to check level and polyphony. Dev tooling only:
 * it is imported lazily from devtools.ts.
 */
import type { SfxId } from './api';
import { analyse, type SoundStats } from './analysis';
import { bakeVariant } from './bake';
import { gainToDb } from './envelopes';
import { createGraph } from './graph';
import { MusicPlayer } from './music';
import { SOUNDS, sfxIndexOf, type SoundDef } from './sounds';
import type { MusicTrackId } from './scores';
import { VoiceLimiter } from './voices';

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
  truncated: boolean;
  dcOffset: number;
  startsAtZero: boolean;
  endsNearZero: boolean;
  centroidHz: number;
  /** Centroid of the energy above 300 Hz. */
  brightHz: number;
  lowFrac: number;
  highFrac: number;
  /** Dominant amplitude-modulation rate (Hz) and index: proves a purr flutters at about 25 Hz. */
  modHz: number;
  modDepth: number;
  /** Decoded size of every variant at the report's sample rate, in bytes (float32 PCM). */
  bytes: number;
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

export interface MemorySummary {
  sampleRate: number;
  /** Decoded bytes of all pre-rendered SFX variants and of all stingers, at `sampleRate`. */
  sfxBytes: number;
  stingerBytes: number;
  /** Everything the bank holds, scaled to a 48 kHz device (the worst common case). */
  totalMBAt48k: number;
  /** The same total for 44.1 kHz. */
  totalMBAt44k: number;
}

export interface SoundReport {
  sampleRate: number;
  sfx: ReportRow[];
  stingers: ReportRow[];
  memory: MemorySummary;
  checks: Check[];
  failing: string[];
  /** The same rows as a printable ASCII table. */
  table: string;
  elapsedMs: number;
}

const DC_LIMIT = 0.02;
/** Decimal megabytes, the stricter reading of the budget. */
const MB = 1_000_000;
/** Budget for every pre-rendered buffer (SFX variants plus stingers); music is live-synthesised and costs none. */
const MEMORY_BUDGET_MB = 8;

async function rowFor(def: SoundDef, sampleRate: number): Promise<ReportRow> {
  const n = def.recipe.variants ?? 1;
  const all: SoundStats[] = [];
  let gainDb = 0;
  let truncated = false;
  let bytes = 0;
  for (let v = 0; v < n; v++) {
    const baked = await bakeVariant(def.recipe, def.key, v, sampleRate, true);
    all.push(baked.stats);
    gainDb = baked.gainDb;
    truncated ||= baked.truncated;
    bytes += baked.buffer.length * baked.buffer.numberOfChannels * 4;
  }
  const max = (f: (s: SoundStats) => number) => all.reduce((m, s) => Math.max(m, f(s)), -Infinity);
  const mean = (f: (s: SoundStats) => number) => all.reduce((m, s) => m + f(s), 0) / all.length;
  const [lo, hi] = def.recipe.ms;
  const issues: string[] = [];
  if (all.some((s) => s.silent)) issues.push('silent');
  if (all.some((s) => s.clipped)) issues.push('clipped');
  if (truncated) issues.push('truncated');
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
    truncated,
    dcOffset: round(max((s) => Math.abs(s.dcOffset)), 4),
    startsAtZero: all.every((s) => s.startsAtZero),
    endsNearZero: all.every((s) => s.endsNearZero),
    centroidHz: Math.round(mean((s) => s.centroidHz)),
    brightHz: Math.round(mean((s) => s.brightHz)),
    lowFrac: round(mean((s) => s.lowFrac), 3),
    highFrac: round(mean((s) => s.highFrac), 3),
    modHz: round(mean((s) => s.modHz), 1),
    modDepth: round(mean((s) => s.modDepth), 2),
    bytes,
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
    'summon escalates in low-end weight (energy below 200 Hz)',
    ladder.every((x, i) => i === 0 || x.lowFrac >= (ladder[i - 1] as ReportRow).lowFrac),
    ladder.map((x) => x.lowFrac).join(' <= '),
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

  // v1.0 battle verbs: each one is checked against the property its design leans on.
  check('laser_on is a bright pew and laser_off is the shorter blip', r('laser_on').centroidHz > 1000 && r('laser_off').durationMs < r('laser_on').durationMs, `${r('laser_on').centroidHz} Hz; ${r('laser_off').durationMs} < ${r('laser_on').durationMs} ms`);
  check('molt is a soft puff (little energy above 4 kHz)', r('molt').highFrac < 0.2, `${r('molt').highFrac}`);
  check('purr flutters at about 25 Hz', Math.abs(r('purr').modHz - 25) <= 4 && r('purr').modDepth > 0.2, `${r('purr').modHz} Hz, index ${r('purr').modDepth}`);
  check('purr is low-end warm and quieter than the combat tier', r('purr').lowFrac > 0.3 && r('purr').loudRms < r('merge').loudRms, `low ${r('purr').lowFrac}, ${r('purr').loudRms} < ${r('merge').loudRms}`);
  const others = rows.filter((x) => x.kind === 'sfx' && x.id !== 'awaken');
  const mythic = by.get('stinger:mythic') as ReportRow;
  check(
    'awaken is the biggest battle sound (peak and loudness) and sits within 3 dB of the mythic stinger',
    others.every((x) => x.peak <= r('awaken').peak + 0.001 && x.loudRms <= r('awaken').loudRms / 0.97) && Math.abs(gainToDb(r('awaken').loudRms) - gainToDb(mythic.loudRms)) < 3,
    `peak ${r('awaken').peak}, loud ${r('awaken').loudRms} vs mythic ${mythic.loudRms}`,
  );
  check('call_wave is a bright brass stab (over 1.2 kHz, twice as bright as the warm wave_start horn)', r('call_wave').centroidHz > 1200 && r('call_wave').centroidHz > r('wave_start').centroidHz * 2, `${r('call_wave').centroidHz} vs ${r('wave_start').centroidHz} Hz`);
  check('sunbeam is warm and airy, not shrill', r('sunbeam').highFrac < 0.15 && r('sunbeam').centroidHz > 600 && r('sunbeam').centroidHz < 3500, `${r('sunbeam').centroidHz} Hz, high ${r('sunbeam').highFrac}`);
  check('hazard_warn is shorter than danger_alarm', r('hazard_warn').durationMs < r('danger_alarm').durationMs, `${r('hazard_warn').durationMs} < ${r('danger_alarm').durationMs} ms`);
  check('splash is broadband water noise', r('splash').centroidHz > 900, `${r('splash').centroidHz} Hz`);
  check('zap is a bright crack', r('zap').brightHz > 2000 && r('zap').durationMs < 300, `${r('zap').brightHz} Hz, ${r('zap').durationMs} ms`);
  check('weaken is dull and droopy (darker than a coin)', r('weaken').centroidHz < 1500 && r('weaken').centroidHz < r('coin').centroidHz, `${r('weaken').centroidHz} Hz`);
  check('shield_break is glassy (high-frequency share, brighter than freeze)', r('shield_break').highFrac > 0.25 && r('shield_break').centroidHz > r('freeze').centroidHz, `high ${r('shield_break').highFrac}, ${r('shield_break').centroidHz} vs ${r('freeze').centroidHz} Hz`);
  return checks;
}

export async function runReport(sampleRate: number): Promise<SoundReport> {
  const t0 = performance.now();
  const rows: ReportRow[] = [];
  for (const def of SOUNDS) rows.push(await rowFor(def, sampleRate));
  const checks = designChecks(rows);
  const sfx = rows.filter((x) => x.kind === 'sfx');
  const stingers = rows.filter((x) => x.kind === 'stinger');
  const sum = (list: readonly ReportRow[]) => list.reduce((n, x) => n + x.bytes, 0);
  const memory: MemorySummary = {
    sampleRate,
    sfxBytes: sum(sfx),
    stingerBytes: sum(stingers),
    totalMBAt48k: round((sum(rows) * 48000) / sampleRate / MB, 2),
    totalMBAt44k: round((sum(rows) * 44100) / sampleRate / MB, 2),
  };
  checks.push({
    name: `pre-rendered SFX stay under ${MEMORY_BUDGET_MB} MB decoded (worst case 48 kHz, stingers included)`,
    ok: memory.totalMBAt48k <= MEMORY_BUDGET_MB,
    detail: `${memory.totalMBAt48k} MB at 48 kHz, ${memory.totalMBAt44k} MB at 44.1 kHz`,
  });
  const failing = [
    ...rows.filter((x) => !x.ok).map((x) => `${x.kind}:${x.id} ${x.issues.join(', ')}`),
    ...checks.filter((c) => !c.ok).map((c) => `check: ${c.name} (${c.detail})`),
  ];
  return {
    sampleRate,
    sfx,
    stingers,
    memory,
    checks,
    failing,
    table: `${formatTable(sfx)}

STINGERS
${formatTable(stingers)}`,
    elapsedMs: Math.round(performance.now() - t0),
  };
}

function formatTable(rows: readonly ReportRow[]): string {
  const head = 'id                 var  ms    peak  rms    loud   dc      0 end  cent  bright low   high  mod   KB    gain  ok';
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
      (x.modDepth > 0.15 ? String(Math.round(x.modHz)) : '-').padStart(3),
      String(Math.round(x.bytes / 1024)).padStart(5),
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

export interface MixRow {
  scenario: string;
  /** Output with the safety limiter acting, and the same mix with it neutralised. */
  peakOut: number;
  peakDry: number;
  rmsOut: number;
  rmsDry: number;
  /** Level change the limiter caused, in dB (negative = pulled down). */
  peakChangeDb: number;
  rmsChangeDb: number;
  /** Spread (max - min) of the limiter's gain change across 100 ms windows: large values mean audible pumping. */
  pumpDb: number;
  clipped: boolean;
  voices: number;
  dropped: number;
}

interface MixEvent {
  at: number;
  id: SfxId;
  pitch?: number;
}

/** A battle's worth of overlapping effects: 16 hits/s, 4 deaths/s, 8 shots/s, 5 coins/s, a blast every 2 s. */
function battleEvents(seconds: number): MixEvent[] {
  const ev: MixEvent[] = [];
  for (let t = 0.2; t < seconds; t += 1 / 16) ev.push({ at: t, id: 'hit_light' });
  for (let t = 0.3; t < seconds; t += 0.25) ev.push({ at: t, id: 'enemy_die' });
  for (let t = 0.1, k = 0; t < seconds; t += 1 / 8, k++) ev.push({ at: t, id: k % 2 ? 'shoot_arrow' : 'shoot_magic' });
  for (let t = 0.4; t < seconds; t += 0.2) ev.push({ at: t, id: 'coin' });
  for (let t = 1; t < seconds; t += 2) ev.push({ at: t, id: 'explosion' });
  for (let t = 0.7; t < seconds; t += 1.1) ev.push({ at: t, id: 'hit_heavy' });
  return ev.sort((a, b) => a.at - b.at);
}

/** The worst pile-up: every big moment at once, over the battle mix. */
function bigEvents(): MixEvent[] {
  const big: MixEvent[] = [
    { at: 1.0, id: 'summon_mythic' },
    { at: 1.1, id: 'merge_big' },
    { at: 1.2, id: 'boss_die' },
    { at: 1.3, id: 'boss_roar' },
    { at: 1.4, id: 'jackpot' },
    { at: 1.5, id: 'summon_legendary' },
    { at: 1.6, id: 'awaken' },
  ];
  return [...battleEvents(5), ...big].sort((a, b) => a.at - b.at);
}

async function renderMixOnce(events: readonly MixEvent[], seconds: number, limiterOn: boolean, sampleRate: number) {
  const ctx = new OfflineAudioContext(2, Math.ceil(seconds * sampleRate), sampleRate);
  const graph = createGraph(ctx);
  if (!limiterOn) {
    graph.limiter.threshold.value = 0;
    graph.limiter.ratio.value = 1;
    graph.limiter.knee.value = 0;
  }
  const player = new MusicPlayer(ctx, graph.musicBus, graph.reverbIn);
  player.setIntensity(1);
  player.play('battle', 0.05);
  player.pump(seconds);
  player.pause();

  const baked = new Map<string, AudioBuffer[]>();
  const limiter = new VoiceLimiter(SOUNDS.map((d) => d.rule));
  let played = 0;
  for (const e of events) {
    const idx = sfxIndexOf(e.id);
    const def = SOUNDS[idx];
    if (!def) continue;
    let list = baked.get(e.id);
    if (!list) {
      list = [];
      for (let v = 0; v < (def.recipe.variants ?? 1); v++) list.push((await bakeVariant(def.recipe, def.key, v, sampleRate)).buffer);
      baked.set(e.id, list);
    }
    const buf = list[played % list.length] as AudioBuffer;
    const rate = (e.pitch ?? 1) * (def.recipe.rate ? 1 + Math.sin(played * 12.9898) * def.recipe.rate : 1);
    const scale = limiter.request(idx, e.at, buf.duration / rate);
    if (scale <= 0) continue;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    const g = ctx.createGain();
    g.gain.value = scale;
    src.connect(g);
    g.connect(graph.sfxBus);
    src.start(e.at);
    played++;
  }
  const out = await ctx.startRendering();
  const ch = [out.getChannelData(0), out.getChannelData(1)];
  return { stats: analyse(ch, sampleRate, false), ch, played, dropped: limiter.dropped.gap + limiter.dropped.perId + limiter.dropped.global };
}

/** Level (dB) of consecutive 100 ms windows. */
function windowedDb(ch: readonly Float32Array[], sampleRate: number): number[] {
  const win = Math.round(sampleRate * 0.1);
  const out: number[] = [];
  for (let s = 0; s + win <= (ch[0] as Float32Array).length; s += win) {
    let sum = 0;
    for (const c of ch) for (let i = s; i < s + win; i++) sum += (c[i] as number) ** 2;
    out.push(gainToDb(Math.sqrt(sum / (win * ch.length))));
  }
  return out;
}

/** Render a mix with and without the limiter to see how hard it works (pumping shows as a large RMS drop). */
export async function renderMix(scenario: 'battle' | 'big', sampleRate: number): Promise<MixRow> {
  const seconds = scenario === 'battle' ? 6 : 5;
  const events = scenario === 'battle' ? battleEvents(seconds) : bigEvents();
  const on = await renderMixOnce(events, seconds, true, sampleRate);
  const off = await renderMixOnce(events, seconds, false, sampleRate);
  const a = windowedDb(on.ch, sampleRate);
  const b = windowedDb(off.ch, sampleRate);
  // Skip the first windows (music fade-in) and silent ones.
  const diffs: number[] = [];
  for (let i = 3; i < Math.min(a.length, b.length); i++) if ((b[i] as number) > -60) diffs.push((a[i] as number) - (b[i] as number));
  return {
    scenario,
    peakOut: round(on.stats.peak, 3),
    peakDry: round(off.stats.peak, 3),
    rmsOut: round(on.stats.rms, 4),
    rmsDry: round(off.stats.rms, 4),
    peakChangeDb: round(gainToDb(on.stats.peak) - gainToDb(off.stats.peak), 1),
    rmsChangeDb: round(gainToDb(on.stats.rms) - gainToDb(off.stats.rms), 1),
    pumpDb: round(Math.max(...diffs) - Math.min(...diffs), 1),
    clipped: on.stats.clipped,
    voices: on.played,
    dropped: on.dropped,
  };
}
