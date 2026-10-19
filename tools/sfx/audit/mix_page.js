async (args) => {
  const { events, t0, t1, music = 'battle', intensity = 1, sfxUser = 0.8, musicUser = 0.5, render = true, seed = 5, measureFrom = 0.1, measureTo = null } = args;
  const SR = 48000;
  const { SOUNDS, sfxIndexOf } = await import('/src/audio/sounds.ts');
  const { bakeVariant } = await import('/src/audio/bake.ts');
  const { VoiceLimiter, CUT_SECONDS } = await import('/src/audio/voices.ts');
  const { createGraph, busNode, MUSIC_BASE, SFX_BASE } = await import('/src/audio/graph.ts');
  const { Hush } = await import('/src/audio/hush.ts');
  const { seedAudio, audioSpread } = await import('/src/audio/random.ts');
  const { MusicPlayer } = await import('/src/audio/music.ts');
  const { stepRatio } = await import('/src/audio/theory.ts');
  const { volumeTaper, duckPlan } = await import('/src/audio/envelopes.ts');
  const db = (x) => 20 * Math.log10(Math.max(x, 1e-9));
  const dbp = (x) => 10 * Math.log10(Math.max(x, 1e-18));
  // (2026-10-19: the engine takes the variants in turn and draws the little spread of pitch and level from a seeded stream: so does this, with the engine's own code)
  seedAudio(seed);

  const bakedCache = new Map();
  async function variants(idx) {
    if (bakedCache.has(idx)) return bakedCache.get(idx);
    const def = SOUNDS[idx]; const list = [];
    for (let v = 0; v < (def.recipe.variants ?? 1); v++) list.push((await bakeVariant(def.recipe, def.key, v, SR)).buffer);
    bakedCache.set(idx, list); return list;
  }
  const limiter = new VoiceLimiter(SOUNDS.map((d) => d.rule));
  const lastVariant = SOUNDS.map(() => -1);
  const accepted = []; // {t, idx, buf, rate, gain, victim, slot}
  const drops = {}; const reqById = {}; const okById = {};
  const win = events.filter((e) => e[0] >= t0 && e[0] < t1).sort((a, b) => a[0] + (a[6] ?? 0) - (b[0] + (b[6] ?? 0)));
  const seated = [];
  for (const e of win) {
    const [t0e, id, vol, pitch, step, pan = 0, delay = 0] = e; const t = t0e + delay;
    const idx = sfxIndexOf(id); if (idx < 0) continue;
    const def = SOUNDS[idx];
    const buffers = await variants(idx);
    let v = 0;
    if (buffers.length > 1) { v = (lastVariant[idx] + 1) % buffers.length; lastVariant[idx] = v; }
    const buf = buffers[v];
    let rate = (step >= 0 ? stepRatio(step, def.recipe.climb) : 1) * pitch;
    let volume = vol;
    if (def.recipe.rate) { rate *= 1 + audioSpread() * def.recipe.rate; volume *= 1 + audioSpread() * 0.12; }
    reqById[id] = (reqById[id] || 0) + 1;
    const before = { ...limiter.dropped };
    const scale = limiter.request(idx, t - t0, buf.duration / rate, volume);
    if (scale <= 0) { for (const k of Object.keys(before)) if (limiter.dropped[k] !== before[k]) drops[k + ':' + id] = (drops[k + ':' + id] || 0) + 1; continue; }
    okById[id] = (okById[id] || 0) + 1;
    const rec = { t: t - t0, idx, buf, rate, gain: volume * scale, id, cut: -1, pan };
    if (limiter.victim >= 0 && seated[limiter.victim]) seated[limiter.victim].cutAt = t - t0;
    if (limiter.slot >= 0) seated[limiter.slot] = rec;
    accepted.push(rec);
  }
  const ends = accepted.map((a) => a.t + a.buf.duration / a.rate);
  const isCombat = accepted.map((a) => (SOUNDS[a.idx].rule.bucket ?? -1) >= 0);
  let maxAct = 0, sumAct = 0, nAct = 0, maxCombat = 0;
  for (let t = 0; t < t1 - t0; t += 0.05) { let c = 0, cc = 0; for (let i = 0; i < accepted.length; i++) if (accepted[i].t <= t && ends[i] > t) { c++; if (isCombat[i]) cc++; } if (c > maxAct) maxAct = c; if (cc > maxCombat) maxCombat = cc; sumAct += c; nAct++; }
  const out = { window: [t0, t1], requested: win.length, accepted: accepted.length, droppedReasons: { ...limiter.dropped }, reqById, okById, dropsById: drops, concurrency: { max: maxAct, mean: +(sumAct / Math.max(1, nAct)).toFixed(1), combatMax: maxCombat }, spanSec: accepted.length ? +(Math.max(...ends) - Math.min(...accepted.map((a) => a.t))).toFixed(2) : 0, events: accepted.map((a) => [+a.t.toFixed(3), a.id, +a.buf.duration.toFixed(3)]) };
  if (!render) return out;

  const seconds = t1 - t0 + 1.2;
  async function renderMix({ withMusic, withSfx, limiterOn, ids }) {
    const ctx = new OfflineAudioContext(2, Math.ceil(seconds * SR), SR);
    const graph = createGraph(ctx);
    graph.sfxBus.gain.value = SFX_BASE * volumeTaper(sfxUser) * (withSfx ? 1 : 0);
    graph.musicBus.gain.value = MUSIC_BASE * volumeTaper(musicUser) * (withMusic ? 1 : 0);
    if (!limiterOn) { graph.limiter.threshold.value = 0; graph.limiter.ratio.value = 1; graph.limiter.knee.value = 0; graph.softClip.curve = null; }
    if (withMusic) { const player = new MusicPlayer(ctx, graph.musicBus, graph.reverbIn); player.setIntensity(intensity); player.play(music, 0.05); player.pump(seconds); player.pause(); }
    // what the engine does for a sound that takes the room (engine.ts duckFor): the fight bus gives way (the very class the engine uses), and the music dips
    // (engine.duck: the same plan, the same merge of overlapping dips, with the model of the gain the engine reads from the node)
    const hush = new Hush();
    let dEnd = 0, dFloor = 1, dV0 = 1, dT0 = 0, dTarget = 1, dTc = 0.025, dRecover = -Infinity, dRecoverTc = 0.17;
    const dGain = (t) => {
      if (dRecover === -Infinity) return 1;
      if (t < dT0) return dV0;
      if (t < dRecover) return dTarget + (dV0 - dTarget) * Math.exp(-(t - dT0) / dTc);
      const atEnd = dTarget + (dV0 - dTarget) * Math.exp(-(dRecover - dT0) / dTc);
      return 1 + (atEnd - 1) * Math.exp(-(t - dRecover) / dRecoverTc);
    };
    for (const a of accepted) {
      const rc = SOUNDS[a.idx].recipe;
      if (rc.hush) hush.duck(graph.fightDuck.gain, a.t, rc.hush.db, rc.hush.seconds);
      if (rc.duck && withMusic) {
        const plan = duckPlan(rc.duck.depth, rc.duck.seconds); const t = a.t; const end = t + Math.max(0.05, rc.duck.seconds);
        const joining = dEnd > t;
        dFloor = joining ? Math.min(dFloor, plan.floor) : plan.floor; dEnd = Math.max(joining ? dEnd : 0, end);
        const now = dGain(t); const rec = Math.max(t, dEnd - plan.releaseTc * 1.5);
        dV0 = now; dT0 = t; dTarget = dFloor; dTc = plan.attackTc; dRecover = rec; dRecoverTc = plan.releaseTc;
        const p = graph.duckGain.gain; p.cancelScheduledValues(t); p.setValueAtTime(now, t); p.setTargetAtTime(dFloor, t, plan.attackTc); p.setTargetAtTime(1, rec, plan.releaseTc);
      }
    }
    for (const a of accepted) {
      if (ids && !ids.has(a.id)) continue;
      const src = ctx.createBufferSource(); src.buffer = a.buf; src.playbackRate.value = a.rate;
      const g = ctx.createGain(); g.gain.value = a.gain;
      if (a.cutAt !== undefined) { g.gain.setValueAtTime(a.gain, a.cutAt); g.gain.linearRampToValueAtTime(0, a.cutAt + CUT_SECONDS); }
      src.connect(g);
      const bus = busNode(graph, SOUNDS[a.idx].recipe.cat);
      if (a.pan) { const pn = ctx.createStereoPanner(); pn.pan.value = a.pan; g.connect(pn); pn.connect(bus); } else g.connect(bus);
      src.start(a.t);
    }
    const buf = await ctx.startRendering();
    return [buf.getChannelData(0), buf.getChannelData(1)];
  }
  const BANDS = [['sub', 0, 100], ['low', 100, 250], ['lowmid', 250, 800], ['mid', 800, 2500], ['himid', 2500, 6000], ['air', 6000, 24000]];
  function fft(re, im) {
    const n = re.length;
    for (let i = 1, j = 0; i < n; i++) { let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; } }
    for (let len = 2; len <= n; len <<= 1) { const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang); for (let i = 0; i < n; i += len) { let cr = 1, ci = 0; for (let k = 0; k < len / 2; k++) { const a = i + k, b = i + k + len / 2; const tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr; re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti; const nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr; } } }
  }
  function bands(x, a, b) { // power per band over [a,b) in absolute terms (not normalised)
    const N = 4096, hop = 2048; const win = new Float64Array(N); for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * (i + 0.5) / N);
    const p = BANDS.map(() => 0); let frames = 0;
    for (let s0 = a; s0 + N <= b; s0 += hop) { const re = new Float64Array(N), im = new Float64Array(N); for (let i = 0; i < N; i++) re[i] = x[s0 + i] * win[i]; fft(re, im); frames++; for (let k = 1; k < N / 2; k++) { const hz = k * SR / N; const pw = re[k] * re[k] + im[k] * im[k]; for (let q = 0; q < BANDS.length; q++) if (hz >= BANDS[q][1] && hz < BANDS[q][2]) { p[q] += pw; break; } } }
    const tot = p.reduce((u, v) => u + v, 0) || 1;
    return { share: p.map((v) => +(v / tot).toFixed(3)), dbBand: p.map((v) => +dbp(v / Math.max(1, frames) / (N * N / 4) * 2).toFixed(1)) };
  }
  async function kw(x) {
    const ctx = new OfflineAudioContext(1, x.length, SR); const buf = ctx.createBuffer(1, x.length, SR); buf.getChannelData(0).set(x);
    const src = ctx.createBufferSource(); src.buffer = buf; const hs = ctx.createBiquadFilter(); hs.type = 'highshelf'; hs.frequency.value = 1681.97; hs.gain.value = 3.9998;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 38.13; hp.Q.value = 0.5003; src.connect(hs); hs.connect(hp); hp.connect(ctx.destination); src.start();
    return (await ctx.startRendering()).getChannelData(0);
  }
  async function stats(ch, from, to) {
    const a = Math.floor(from * SR), b = Math.min(ch[0].length, Math.floor(to * SR));
    let peak = 0, clip = 0, ss = 0; for (const c of ch) for (let i = a; i < b; i++) { const v = Math.abs(c[i]); if (v > peak) peak = v; if (v >= 0.999) clip++; ss += c[i] * c[i]; }
    const rms = Math.sqrt(ss / ((b - a) * ch.length));
    const k0 = await kw(ch[0]), k1 = await kw(ch[1]);
    let ks = 0; for (let i = a; i < b; i++) ks += k0[i] * k0[i] + k1[i] * k1[i];
    const lufs = -0.691 + dbp(ks / (b - a));
    // short-term: max 400 ms and max 100 ms loudness
    const wmax = (len) => { let best = -200; const w = Math.round(len * SR); for (let s0 = a; s0 + w <= b; s0 += Math.round(0.05 * SR)) { let q = 0; for (let i = s0; i < s0 + w; i++) q += k0[i] * k0[i] + k1[i] * k1[i]; const v = -0.691 + dbp(q / w); if (v > best) best = v; } return +best.toFixed(1); };
    const mono = new Float32Array(b - a); for (let i = a; i < b; i++) mono[i - a] = (ch[0][i] + ch[1][i]) * 0.5;
    const bd = bands(mono, 0, mono.length);
    return { peakDb: +db(peak).toFixed(2), clipped: clip, rmsDb: +db(rms).toFixed(1), lufs: +lufs.toFixed(1), m400: wmax(0.4), m100: wmax(0.1), band: bd.share, bandDb: bd.dbBand };
  }
  const from = measureFrom, to = measureTo === null ? seconds - 1.0 : measureTo;
  const full = await renderMix({ withMusic: true, withSfx: true, limiterOn: true });
  const fullNoLim = await renderMix({ withMusic: true, withSfx: true, limiterOn: false });
  const sfxOnly = await renderMix({ withMusic: false, withSfx: true, limiterOn: false });
  const musicOnly = await renderMix({ withMusic: true, withSfx: false, limiterOn: false });
  out.full = await stats(full, from, to); out.fullNoLimiter = await stats(fullNoLim, from, to); out.sfxOnly = await stats(sfxOnly, from, to); out.musicOnly = await stats(musicOnly, from, to);
  // pumping: windowed (100 ms) level difference of the limited and the dry mix
  const wdb = (ch) => { const w = Math.round(0.1 * SR); const o = []; for (let s0 = Math.round(0.5 * SR); s0 + w <= Math.min(ch[0].length, Math.round(to * SR)); s0 += w) { let q = 0; for (const c of ch) for (let i = s0; i < s0 + w; i++) q += c[i] * c[i]; o.push(dbp(q / (w * ch.length))); } return o; };
  const A = wdb(full), B = wdb(fullNoLim); const diffs = []; for (let i = 0; i < Math.min(A.length, B.length); i++) if (B[i] > -60) diffs.push(A[i] - B[i]);
  out.limiter = { maxReductionDb: +Math.min(...diffs).toFixed(1), meanReductionDb: +(diffs.reduce((u, v) => u + v, 0) / Math.max(1, diffs.length)).toFixed(2), pumpDb: +(Math.max(...diffs) - Math.min(...diffs)).toFixed(1) };
  // who carries the energy: K-weighted exposure per id (own render, no music)
  const idsIn = [...new Set(accepted.map((a) => a.id))];
  const contrib = {};
  let totalE = 0;
  for (const id of idsIn) {
    const ch = await renderMix({ withMusic: false, withSfx: true, limiterOn: false, ids: new Set([id]) });
    const k0 = await kw(ch[0]); let q = 0; for (let i = Math.floor(from * SR); i < Math.floor(to * SR); i++) q += k0[i] * k0[i];
    contrib[id] = q; totalE += q;
  }
  out.share = Object.fromEntries(Object.entries(contrib).sort((a, b) => b[1] - a[1]).slice(0, 14).map(([id, q]) => [id, +(q / totalE * 100).toFixed(1)]));
  out.sumOfParts = +(dbp(totalE / ((to - from) * SR))).toFixed(1);
  return out;
}
