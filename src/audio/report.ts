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
import { FAMILIES } from './families';
import { createGraph } from './graph';
import { MusicPlayer } from './music';
import { CAT_TARGET } from './recipe';
import { SOUNDS, sfxIndexOf, type SoundDef } from './sounds';
import { SCORES, type MusicTrackId } from './scores';
import { STEPS_PER_BAR, stepSeconds } from './sequencer';
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
  /** Time from 10 % to 90 % of the peak envelope in ms (mean over variants). */
  attackMs: number;
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
    attackMs: round(mean((s) => s.attackMs), 1),
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

/** Family targets: every member of a family has to measure inside the family's window (see families.ts). */
function familyChecks(rows: ReportRow[]): Check[] {
  const by = new Map(rows.map((r) => [r.kind === 'stinger' ? `stinger:${r.id}` : r.id, r]));
  return FAMILIES.map((fam) => {
    const bad: string[] = [];
    for (const key of fam.members) {
      const r = by.get(key);
      if (!r) {
        bad.push(`${key} missing`);
        continue;
      }
      if (r.durationMs > fam.maxMs) bad.push(`${key} ${r.durationMs} ms`);
      if (r.attackMs > fam.maxAttackMs) bad.push(`${key} attack ${r.attackMs} ms`);
      if (r.centroidHz < fam.centroid[0] || r.centroidHz > fam.centroid[1]) bad.push(`${key} centroid ${r.centroidHz} Hz`);
      if (r.lowFrac > fam.maxLow) bad.push(`${key} low ${r.lowFrac}`);
      if (r.highFrac > fam.maxHigh) bad.push(`${key} high ${r.highFrac}`);
    }
    return {
      name: `family "${fam.name}": at most ${fam.maxMs} ms, attack <= ${fam.maxAttackMs} ms, centroid ${fam.centroid[0]}-${fam.centroid[1]} Hz, low <= ${fam.maxLow}, high <= ${fam.maxHigh}`,
      ok: bad.length === 0,
      detail: bad.length === 0 ? `${fam.members.length} sounds inside` : bad.join('; '),
    };
  });
}

/** Design-intent checks: the escalation ladder, the material of each family and the loudness order. */
function designChecks(rows: ReportRow[]): Check[] {
  const by = new Map(rows.map((r) => [`${r.kind}:${r.id}`, r]));
  const r = (id: string): ReportRow => by.get(`sfx:${id}`) as ReportRow;
  const checks: Check[] = [];
  const check = (name: string, ok: boolean, detail: string) => checks.push({ name, ok, detail });

  const ladder = ['summon_common', 'summon_rare', 'summon_epic', 'summon_legendary', 'summon_mythic'].map(r);
  const climbs = (pick: (x: ReportRow) => number, slack: number) => ladder.every((x, i) => i === 0 || pick(x) >= pick(ladder[i - 1] as ReportRow) * slack);
  check('summon escalates in length', ladder.every((x, i) => i === 0 || x.durationMs > (ladder[i - 1] as ReportRow).durationMs), ladder.map((x) => x.durationMs).join(' < '));
  check('summon escalates in peak level', climbs((x) => x.peak, 0.999), ladder.map((x) => x.peak).join(' <= '));
  check('summon escalates in loudness (200 ms RMS)', climbs((x) => x.loudRms, 0.97), ladder.map((x) => x.loudRms).join(' <= '));
  check('summon escalates in low-end weight (energy below 200 Hz)', climbs((x) => x.lowFrac, 1), ladder.map((x) => x.lowFrac).join(' <= '));
  check('summon escalates in brightness (centroid above 300 Hz, 5 % slack)', climbs((x) => x.brightHz, 0.95), ladder.map((x) => x.brightHz).join(' <= '));
  check('summon_legendary/mythic carry sub weight', r('summon_legendary').lowFrac > 0.1 && r('summon_mythic').lowFrac > 0.1, `${r('summon_legendary').lowFrac}, ${r('summon_mythic').lowFrac}`);

  // Paper, wood and felt: soft touches, no sparkle.
  check('ui_click is a paper tap: under 80 ms, attack under 4 ms, no pitched sustain (centroid 400-1500)', r('ui_click').durationMs < 80 && r('ui_click').attackMs < 4 && r('ui_click').centroidHz > 400 && r('ui_click').centroidHz < 1500, `${r('ui_click').durationMs} ms, attack ${r('ui_click').attackMs} ms, ${r('ui_click').centroidHz} Hz`);
  check('ui_error is a dull knock, darker than the click', r('ui_error').centroidHz < r('ui_click').centroidHz, `${r('ui_error').centroidHz} vs ${r('ui_click').centroidHz} Hz`);
  check('ui_tab is a double slide (longer than a tap, shorter than 125 ms)', r('ui_tab').durationMs > r('ui_click').durationMs && r('ui_tab').durationMs <= 125, `${r('ui_tab').durationMs} ms`);
  check('reward_claim is a stamp: weight under a hard touch (low share 0.1-0.5, attack under 6 ms)', r('reward_claim').lowFrac >= 0.1 && r('reward_claim').lowFrac <= 0.5 && r('reward_claim').attackMs < 6, `low ${r('reward_claim').lowFrac}, attack ${r('reward_claim').attackMs} ms`);
  check('coin is a soft pitched tine and gem the brighter one', r('coin').centroidHz > 500 && r('coin').centroidHz < 1200 && r('gem').centroidHz > r('coin').centroidHz, `${r('coin').centroidHz} < ${r('gem').centroidHz} Hz`);
  check('star is a sticker pop (pitched, 400-900 Hz, attack under 4 ms)', r('star').centroidHz > 400 && r('star').centroidHz < 900 && r('star').attackMs < 4, `${r('star').centroidHz} Hz, attack ${r('star').attackMs} ms`);

  // Battle texture.
  check('hit_heavy heavier than hit_light', r('hit_heavy').lowFrac > r('hit_light').lowFrac, `${r('hit_light').lowFrac} -> ${r('hit_heavy').lowFrac}`);
  check('hit_light is band limited (no sub)', r('hit_light').lowFrac < 0.35, `${r('hit_light').lowFrac}`);
  check('crit is the same thwack made brighter and louder', r('crit').centroidHz > r('hit_heavy').centroidHz && r('crit').centroidHz > r('hit_light').centroidHz && r('crit').peak > r('hit_light').peak, `${r('hit_light').centroidHz}, ${r('hit_heavy').centroidHz} -> ${r('crit').centroidHz} Hz`);
  check('explosion and boss_die carry low end', r('explosion').lowFrac > 0.25 && r('boss_die').lowFrac > 0.25, `${r('explosion').lowFrac}, ${r('boss_die').lowFrac}`);
  check('boss_warning is a low mallet roll, not a siren (centroid under 500 Hz, 0.8-1.45 s)', r('boss_warning').centroidHz < 500 && r('boss_warning').durationMs >= 800 && r('boss_warning').durationMs <= 1450, `${r('boss_warning').centroidHz} Hz, ${r('boss_warning').durationMs} ms`);
  check('danger_alarm is a short heartbeat knock', r('danger_alarm').durationMs <= 330, `${r('danger_alarm').durationMs} ms`);
  check('hazard_warn is shorter than danger_alarm', r('hazard_warn').durationMs < r('danger_alarm').durationMs, `${r('hazard_warn').durationMs} < ${r('danger_alarm').durationMs} ms`);
  check('laser_off is the shorter blip of the pair', r('laser_off').durationMs < r('laser_on').durationMs, `${r('laser_off').durationMs} < ${r('laser_on').durationMs} ms`);
  check('molt is a soft puff (little energy above 4 kHz)', r('molt').highFrac < 0.2, `${r('molt').highFrac}`);
  check('purr flutters at about 25 Hz', Math.abs(r('purr').modHz - 25) <= 4 && r('purr').modDepth > 0.2, `${r('purr').modHz} Hz, index ${r('purr').modDepth}`);
  check('purr is low-end warm and quieter than the combat family', r('purr').lowFrac > 0.3 && r('purr').loudRms < r('merge').loudRms, `low ${r('purr').lowFrac}, ${r('purr').loudRms} < ${r('merge').loudRms}`);
  const mythic = by.get('stinger:mythic') as ReportRow;
  check('awaken is a short proud fanfare under 1.5 s with the highest peak of any SFX and a loudness within 3 dB of the big tier', r('awaken').durationMs < 1500 && rows.filter((x) => x.kind === 'sfx').every((x) => x.peak <= r('awaken').peak + 0.001) && gainToDb(r('awaken').loudRms / CAT_TARGET.big.rms) > -3, `${r('awaken').durationMs} ms, peak ${r('awaken').peak}, loud ${r('awaken').loudRms}`);
  check('call_wave is brighter than the plain wave_start pair', r('call_wave').centroidHz > r('wave_start').centroidHz, `${r('call_wave').centroidHz} vs ${r('wave_start').centroidHz} Hz`);
  check('sunbeam is warm and airy, not shrill', r('sunbeam').highFrac < 0.15 && r('sunbeam').centroidHz > 500 && r('sunbeam').centroidHz < 2000, `${r('sunbeam').centroidHz} Hz, high ${r('sunbeam').highFrac}`);
  check('splash is broadband water noise', r('splash').centroidHz > 700, `${r('splash').centroidHz} Hz`);
  check('zap is a short fizz (under 200 ms, centroid 600-2500 Hz)', r('zap').durationMs < 200 && r('zap').centroidHz > 600 && r('zap').centroidHz < 2500, `${r('zap').centroidHz} Hz, ${r('zap').durationMs} ms`);
  check('weaken is dull and droopy (darker than a coin)', r('weaken').centroidHz < 1000 && r('weaken').centroidHz < r('coin').centroidHz, `${r('weaken').centroidHz} Hz`);
  check('shield_break is a scatter (longer and brighter than a plain knock, quieter highs than glass)', r('shield_break').durationMs > 200 && r('shield_break').highFrac < 0.1, `${r('shield_break').durationMs} ms, high ${r('shield_break').highFrac}`);

  // Loudness order of the families, by peak: UI < shots/hits < combat < rewards < big.
  const peakOf = (id: string) => r(id).peak;
  check('loudness order UI < hit < combat < reward < big (peak)', peakOf('ui_click') < peakOf('hit_heavy') && peakOf('hit_heavy') < peakOf('merge') && peakOf('merge') < peakOf('reward_claim') && peakOf('reward_claim') < peakOf('summon_mythic'), `${peakOf('ui_click')} < ${peakOf('hit_heavy')} < ${peakOf('merge')} < ${peakOf('reward_claim')} < ${peakOf('summon_mythic')}`);

  const stingers = rows.filter((x) => x.kind === 'stinger');
  check('stingers are 1-2.3 s', stingers.every((x) => x.durationMs >= 1000 && x.durationMs <= 2300), stingers.map((x) => `${x.id} ${x.durationMs}`).join(', '));
  check('defeat is gentle: no low thud, a soft centroid', (by.get('stinger:defeat') as ReportRow).lowFrac < 0.2 && (by.get('stinger:defeat') as ReportRow).centroidHz < 800, `low ${(by.get('stinger:defeat') as ReportRow).lowFrac}, ${(by.get('stinger:defeat') as ReportRow).centroidHz} Hz`);
  check('victory is a warm tune (centroid 500-1500 Hz)', (by.get('stinger:victory') as ReportRow).centroidHz > 500 && (by.get('stinger:victory') as ReportRow).centroidHz < 1500, `${(by.get('stinger:victory') as ReportRow).centroidHz} Hz`);
  check('mythic stinger sits within 3 dB of awaken', Math.abs(gainToDb(r('awaken').loudRms) - gainToDb(mythic.loudRms)) < 3, `${r('awaken').loudRms} vs ${mythic.loudRms}`);
  return [...checks, ...familyChecks(rows)];
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
  const head = 'id                 var  ms    peak  rms    loud   dc      0 end  cent  bright low   high  mod   atk   KB    gain  ok';
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
      x.attackMs.toFixed(1).padStart(5),
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

export interface SeamRow {
  track: MusicTrackId;
  loopSeconds: number;
  /** Deepest 50 ms level dip around the loop point, in dB under the mean level of that stretch. */
  seamDipDb: number;
  /** The deepest such dip around any other bar line of the form: the loop point must be no worse. */
  barDipDb: number;
}

/** How far the quietest 50 ms window within +-0.75 s of `at` sits under that stretch's mean level, in dB. */
function dipAround(ch: readonly Float32Array[], sampleRate: number, at: number): number {
  const win = Math.round(sampleRate * 0.05);
  const levels: number[] = [];
  for (let s = Math.round((at - 0.75) * sampleRate); s + win <= Math.round((at + 0.75) * sampleRate); s += win) {
    let sum = 0;
    for (const c of ch) for (let i = s; i < s + win; i++) sum += (c[i] as number) ** 2;
    levels.push(sum / (win * ch.length));
  }
  const mean = levels.reduce((a, b) => a + b, 0) / levels.length;
  return round(gainToDb(Math.sqrt(mean)) - gainToDb(Math.sqrt(Math.min(...levels))), 1);
}

/** Render one loop of a track at full intensity plus two seconds and measure the dip at the loop point against every other bar line. */
export async function renderSeam(track: MusicTrackId, sampleRate: number): Promise<SeamRow> {
  const score = SCORES[track];
  const bar = STEPS_PER_BAR * stepSeconds(score.bpm);
  const loop = score.bars * bar;
  const ctx = new OfflineAudioContext(2, Math.ceil((loop + 2) * sampleRate), sampleRate);
  const graph = createGraph(ctx);
  const player = new MusicPlayer(ctx, graph.musicBus, graph.reverbIn);
  player.setIntensity(1);
  player.play(track, 0.05);
  player.pump(loop + 2);
  player.pause();
  const buf = await ctx.startRendering();
  const ch = [buf.getChannelData(0), buf.getChannelData(1)];
  let barDip = 0;
  for (let b = 2; b < score.bars - 1; b++) barDip = Math.max(barDip, dipAround(ch, sampleRate, b * bar));
  return { track, loopSeconds: round(loop, 2), seamDipDb: dipAround(ch, sampleRate, loop), barDipDb: barDip };
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
