// The sound track: the owner's music (video/bgm.*) as the bed, the narration on top, the bed ducked under every line, a fade-out at the end,
// and a peak limiter so the sum stays below the ceiling. Everything is computed offline, sample by sample, so it is the same every time.
export const SR = 48000;

const db = (x) => 20 * Math.log10(Math.max(x, 1e-9));
const lin = (d) => 10 ** (d / 20);

function rmsOf(a, from = 0, to = a.length) {
  let s = 0;
  const n = Math.max(1, to - from);
  for (let i = from; i < to; i++) s += a[i] * a[i];
  return Math.sqrt(s / n);
}

/** `count` samples of the music from `start`, looping on a bar-aligned crossfade if the track is too short. */
function extractBed(track, start, count, beatSeconds, limitSeconds) {
  const L = track.getChannelData(0);
  const R = track.numberOfChannels > 1 ? track.getChannelData(1) : L;
  const end = limitSeconds ? Math.min(track.length, start + Math.round(limitSeconds * SR)) : track.length;
  const outL = new Float32Array(count), outR = new Float32Array(count);
  const bar = Math.round(beatSeconds * 4 * SR);
  const loopLen = bar * 16;
  const xf = bar;
  let pos = start, w = 0, loops = 0;
  const loopAt = [];
  while (w < count) {
    const avail = end - xf - pos;
    if (avail > 0) {
      const n = Math.min(avail, count - w);
      outL.set(L.subarray(pos, pos + n), w);
      outR.set(R.subarray(pos, pos + n), w);
      pos += n; w += n;
      if (w >= count) break;
    }
    if (pos - loopLen < 0) throw new Error('the music is too short to loop on a 16-bar phrase');
    loops++;
    loopAt.push(w);
    for (let i = 0; i < xf && w + i < count; i++) {
      const a = (i / xf) * Math.PI / 2;
      const gA = Math.cos(a), gB = Math.sin(a);
      outL[w + i] = L[pos + i] * gA + L[pos - loopLen + i] * gB;
      outR[w + i] = R[pos + i] * gA + R[pos - loopLen + i] * gB;
    }
    w += xf;
    pos = pos - loopLen + xf;
  }
  return { L: outL, R: outR, loops, loopAt };
}

/** Peak limiter with a 2 ms look-ahead (a gain that is never above what each sample needs) and a 60 ms release. */
function limit(L, R, thr) {
  const n = L.length;
  const look = Math.round(0.002 * SR);
  const g = new Float32Array(n);
  for (let i = 0; i < n; i++) { const a = Math.max(Math.abs(L[i]), Math.abs(R[i])); g[i] = a > thr ? thr / a : 1; }
  // min over [i, i+look] with a monotone deque
  const mm = new Float32Array(n);
  const dq = new Int32Array(n);
  let head = 0, tail = 0;
  for (let i = n - 1; i >= 0; i--) {
    while (tail > head && g[dq[tail - 1]] >= g[i]) tail--;
    dq[tail++] = i;
    while (dq[head] > i + look) head++;
    mm[i] = g[dq[head]];
  }
  // average over the last look+1 values of mm, then a slow release
  let acc = 0;
  const rel = 1 - Math.exp(-1 / (0.06 * SR));
  let env = 1, maxRed = 0;
  for (let i = 0; i < n; i++) {
    acc += mm[i];
    if (i > look) acc -= mm[i - look - 1];
    const avg = acc / Math.min(i + 1, look + 1);
    env = Math.min(avg, env + (1 - env) * rel);
    if (env < 1) { L[i] *= env; R[i] *= env; if (env < maxRed || maxRed === 0) maxRed = Math.min(maxRed || 1, env); }
  }
  return maxRed === 0 ? 0 : db(maxRed);
}

export async function buildMix(S, log = () => {}) {
  const cfg = S.script.mix;
  const tl = S.tl;
  const bar4 = Math.round(S.script.bgm.beat * 4 * SR);
  const N = tl.frames * Math.round(SR / tl.fps);
  const ac = new OfflineAudioContext(2, SR, SR);

  // narration: decode, even out the level, and place
  const speechL = new Float32Array(N), speechR = new Float32Array(N);
  const zones = [];
  const target = lin(cfg.speechRmsDb);
  const lineStats = [];
  const clipT = cfg.speechClipFrom ? lin(cfg.speechClipFrom) : 0, clipC = cfg.speechClipTo ? lin(cfg.speechClipTo) : 0;
  for (const c of tl.cards) {
    const bytes = await (await fetch(c.wav)).arrayBuffer();
    const buf = await ac.decodeAudioData(bytes);
    const x = buf.getChannelData(0).slice();
    let peak = 0, sum = 0, cnt = 0;
    for (let i = 0; i < x.length; i++) { const a = Math.abs(x[i]); if (a > peak) peak = a; if (a > 0.01) { sum += x[i] * x[i]; cnt++; } }
    const rms = Math.sqrt(sum / Math.max(1, cnt));
    const gain = Math.min(target / Math.max(rms, 1e-5), 0.95 / Math.max(peak, 1e-5));
    const fade = Math.round(0.004 * SR);
    const at = Math.round(c.narrStart * SR);
    for (let i = 0; i < x.length && at + i < N; i++) {
      let v = x[i] * gain;
      if (clipT) { const a = Math.abs(v); if (a > clipT) v = Math.sign(v) * (clipT + (clipC - clipT) * Math.tanh((a - clipT) / (clipC - clipT))); } // soft ceiling: the voice's rare peaks, not its body
      if (i < fade) v *= i / fade;
      else if (i > x.length - fade) v *= (x.length - i) / fade;
      speechL[at + i] += v; speechR[at + i] += v;
    }
    zones.push([c.narrStart, c.narrStart + x.length / SR]);
    lineStats.push({ id: c.id, rmsDb: +db(rms).toFixed(1), peakDb: +db(peak).toFixed(1), gainDb: +db(gain).toFixed(1) });
  }

  // music: take the stretch that starts where script.json says, level it gently, duck it under the lines, fade it out
  const track = await ac.decodeAudioData(await (await fetch('/bgm/track')).arrayBuffer());
  const startSample = Math.round(tl.bgmStart * SR);
  const limitSeconds = Number(new URLSearchParams(location.search).get('bedLimit')) || 0;
  const { L: bedL, R: bedR, loops, loopAt } = extractBed(track, startSample, N, S.script.bgm.beat, limitSeconds);
  log(`music ${track.duration.toFixed(1)} s long, ${loops} loop crossfades`);
  const hop = Math.round(0.5 * SR), win = SR;
  const frames = Math.ceil(N / hop);
  const lvDb = new Float32Array(frames);
  for (let k = 0; k < frames; k++) {
    const mid = k * hop;
    const a = Math.max(0, mid - win / 2), b = Math.min(N, mid + win / 2);
    lvDb[k] = db((rmsOf(bedL, a, b) + rmsOf(bedR, a, b)) / 2);
  }
  // smooth over +-2 s, then ride toward the target by `levelAmount` of the distance
  const gainDb = new Float32Array(frames);
  for (let k = 0; k < frames; k++) {
    let s = 0, n = 0;
    for (let j = Math.max(0, k - 4); j <= Math.min(frames - 1, k + 4); j++) { s += lvDb[j]; n++; }
    const sm = s / n;
    gainDb[k] = Math.max(-8, Math.min(10, (cfg.bedRmsDb - sm) * cfg.levelAmount));
  }
  // base gain so the average level of the stretch lands on bedRmsDb
  let avg = 0;
  for (let k = 0; k < frames; k++) avg += lvDb[k] + gainDb[k];
  avg /= frames;
  const base = cfg.bedRmsDb - avg;

  // duck envelope: merge lines closer than holdGap
  const merged = [];
  for (const z of zones) {
    const last = merged[merged.length - 1];
    if (last && z[0] - last[1] < cfg.holdGap) last[1] = z[1]; else merged.push([z[0], z[1]]);
  }
  const duck = lin(cfg.duckDb);
  const pts = [[0, 1]];
  for (const [a, b] of merged) {
    pts.push([Math.max(0, a - cfg.duckAttack), 1], [a, duck], [b, duck], [b + cfg.duckRelease, 1]);
  }
  pts.push([tl.total + 1, 1]);
  const dEnv = new Float32Array(N);
  {
    let pi = 0;
    for (let i = 0; i < N; i++) {
      const t = i / SR;
      while (pi < pts.length - 2 && pts[pi + 1][0] <= t) pi++;
      const [t0, g0] = pts[pi], [t1, g1] = pts[pi + 1];
      const p = t1 > t0 ? Math.min(1, Math.max(0, (t - t0) / (t1 - t0))) : 1;
      const s = p * p * (3 - 2 * p);
      dEnv[i] = g0 + (g1 - g0) * s;
    }
  }
  const mixL = new Float32Array(N), mixR = new Float32Array(N);
  const bedOutL = new Float32Array(N), bedOutR = new Float32Array(N);
  const fadeStart = tl.total - cfg.fadeOut;
  const fadeIn = Math.round(0.03 * SR);
  for (let i = 0; i < N; i++) {
    const kf = i / hop;
    const k0 = Math.min(frames - 1, Math.floor(kf)), k1 = Math.min(frames - 1, k0 + 1);
    const gd = gainDb[k0] + (gainDb[k1] - gainDb[k0]) * (kf - k0) + base;
    let g = lin(gd) * dEnv[i];
    const t = i / SR;
    if (t > fadeStart) { const f = Math.max(0, 1 - (t - fadeStart) / cfg.fadeOut); g *= Math.cos((1 - f) * Math.PI / 2); }
    if (i < fadeIn) g *= i / fadeIn;
    bedOutL[i] = bedL[i] * g; bedOutR[i] = bedR[i] * g;
    mixL[i] = bedOutL[i] + speechL[i]; mixR[i] = bedOutR[i] + speechR[i];
  }

  // stats of the stems over the lines (before the master gain)
  let sS = 0, sB = 0, nS = 0;
  for (const [a, b] of zones) {
    const i0 = Math.round(a * SR), i1 = Math.min(N, Math.round(b * SR));
    for (let i = i0; i < i1; i++) { sS += speechL[i] * speechL[i]; sB += bedOutL[i] * bedOutL[i]; nS++; }
  }
  const speechRms = Math.sqrt(sS / nS), bedUnderRms = Math.sqrt(sB / nS);

  // master: bring the top 0.01 % of samples to the ceiling, then limit what still sticks out
  const thr = lin(cfg.peakDb);
  const bins = 8192;
  const hist = new Uint32Array(bins + 1);
  let maxAbs = 0;
  for (let i = 0; i < N; i++) {
    const a = Math.max(Math.abs(mixL[i]), Math.abs(mixR[i]));
    if (a > maxAbs) maxAbs = a;
    hist[Math.min(bins, Math.floor(a * bins / 2))]++;
  }
  let acc = 0, q = 0;
  for (let b = bins; b >= 0; b--) { acc += hist[b]; if (acc >= N * 0.0001) { q = (b + 1) * 2 / bins; break; } }
  const master = Math.min(cfg.maxMasterBoost ?? 4, thr / Math.max(q, 1e-4));
  for (let i = 0; i < N; i++) { mixL[i] *= master; mixR[i] *= master; }
  const reductionDb = limit(mixL, mixR, thr);
  let peak = 0;
  for (let i = 0; i < N; i++) peak = Math.max(peak, Math.abs(mixL[i]), Math.abs(mixR[i]));

  // loudness per 5 s of the result
  const windows = [];
  for (let s = 0; s < N; s += 5 * SR) {
    const e = Math.min(N, s + 5 * SR);
    let p = 0;
    for (let i = s; i < e; i++) p = Math.max(p, Math.abs(mixL[i]), Math.abs(mixR[i]));
    windows.push({ at: s / SR, rmsDb: +db((rmsOf(mixL, s, e) + rmsOf(mixR, s, e)) / 2).toFixed(1), peakDb: +db(p).toFixed(1) });
  }
  const loopDebug = loopAt.map((w) => {
    const rows = [];
    for (let k = -8; k < 8 + Math.round(bar4 / (SR / 8)); k++) {
      const a = w + Math.round(k * SR / 8);
      if (a < 0 || a + SR / 8 > N) continue;
      rows.push(+db((rmsOf(bedL, a, a + SR / 8) + rmsOf(bedR, a, a + SR / 8)) / 2).toFixed(1));
    }
    return { at: +(w / SR).toFixed(2), rms125msDb: rows };
  });
  const stats = {
    loopDebug,
    seconds: N / SR, bgmStart: tl.bgmStart, loops, lineStats,
    speechRmsDb: +db(speechRms * master).toFixed(1), bedUnderSpeechRmsDb: +db(bedUnderRms * master).toFixed(1),
    speechOverBedDb: +db(speechRms / bedUnderRms).toFixed(1),
    masterDb: +db(master).toFixed(1), preLimitMaxDb: +db(maxAbs * master).toFixed(1), limiterMaxReductionDb: +reductionDb.toFixed(2), peakDb: +db(peak).toFixed(2),
    duckZones: merged.map(([a, b]) => [+a.toFixed(2), +b.toFixed(2)]), windows,
  };
  return { L: mixL, R: mixR, stats, zones };
}
