(async () => {
  // The landing review (2026-10-19): every sound of the game, baked offline with the game's own recipes (every variant), looked at the way a sceptical audio lead who cannot listen would:
  // harshness (the share of the energy above 4 and 6 kHz), clicks (the first samples, the biggest step against the sound's own roughness, the last samples), length, level,
  // and which two sounds are nearly the same (a descriptor of the spectrum in three slices of time). Nothing is played: OfflineAudioContext only.
  const { SOUNDS } = await import('/src/audio/sounds.ts');
  const { bakeVariant } = await import('/src/audio/bake.ts');
  const graph = await import('/src/audio/graph.ts');
  // (the old tree has no buses: the same script then measures it with a bus level of 1)
  const busOf = graph.busOf ?? (() => 'fight');
  const BUS_LEVEL = graph.BUS_LEVEL ?? { fight: 1, skill: 1, ui: 1 };
  const SR = 48000;
  const db = (x) => 20 * Math.log10(Math.max(x, 1e-9));
  const dbp = (x) => 10 * Math.log10(Math.max(x, 1e-18));
  function fft(re, im) {
    const n = re.length;
    for (let i = 1, j = 0; i < n; i++) { let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; } }
    for (let len = 2; len <= n; len <<= 1) {
      const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
      for (let i = 0; i < n; i += len) {
        let cr = 1, ci = 0;
        for (let k = 0; k < len / 2; k++) {
          const a = i + k, b = i + k + len / 2;
          const tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr;
          re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
          const nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr;
        }
      }
    }
  }
  const N = 2048;
  // power spectrum of x[a, b) (Hann over the slice, zero padded to N); a slice longer than N is averaged over frames
  function power(x, a, b) {
    const out = new Float64Array(N / 2);
    const len = Math.max(8, b - a);
    const wl = Math.min(len, N);
    const win = new Float64Array(wl); for (let i = 0; i < wl; i++) win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * (i + 0.5) / wl);
    const frames = len <= N ? 1 : Math.ceil((len - N) / (N / 2)) + 1;
    for (let f = 0; f < frames; f++) {
      const re = new Float64Array(N), im = new Float64Array(N);
      const s0 = a + f * (N / 2);
      for (let i = 0; i < wl; i++) { const k = s0 + i; re[i] = k < b && k < x.length ? x[k] * win[i] : 0; }
      fft(re, im);
      for (let k = 0; k < N / 2; k++) out[k] += re[k] * re[k] + im[k] * im[k];
    }
    return out;
  }
  const binHz = SR / N;
  const share = (p, lo, hi) => { let s = 0, t = 0; for (let k = 1; k < N / 2; k++) { const h = k * binHz; t += p[k]; if (h >= lo && h < hi) s += p[k]; } return s / Math.max(t, 1e-18); };
  // a 24-band log spectrum (100 Hz to 14 kHz, third-octave-ish), in dB relative to the slice's own total, for the similarity descriptor
  const EDGES = []; for (let i = 0; i <= 24; i++) EDGES.push(100 * Math.pow(14000 / 100, i / 24));
  function bandsDb(p) {
    const e = new Array(24).fill(1e-12); let tot = 1e-12;
    for (let k = 1; k < N / 2; k++) { const h = k * binHz; tot += p[k]; for (let i = 0; i < 24; i++) if (h >= EDGES[i] && h < EDGES[i + 1]) { e[i] += p[k]; break; } }
    return e.map((v) => dbp(v / tot));
  }
  async function kWeigh(x) {
    const ctx = new OfflineAudioContext(1, x.length, SR);
    const buf = ctx.createBuffer(1, x.length, SR); buf.getChannelData(0).set(x);
    const src = ctx.createBufferSource(); src.buffer = buf;
    const hs = ctx.createBiquadFilter(); hs.type = 'highshelf'; hs.frequency.value = 1681.97; hs.gain.value = 3.9998;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 38.13; hp.Q.value = 0.5003;
    src.connect(hs); hs.connect(hp); hp.connect(ctx.destination); src.start();
    return (await ctx.startRendering()).getChannelData(0);
  }
  const rows = [];
  const desc = []; // {key, vec}
  for (const def of SOUNDS) {
    if (def.recipe.legacy) continue;
    const nv = def.recipe.variants ?? 1;
    const vs = [];
    for (let v = 0; v < nv; v++) {
      const baked = await bakeVariant(def.recipe, def.key, v, SR);
      const x = baked.buffer.getChannelData(0);
      const n = x.length;
      let peak = 0, pi = 0, dc = 0; for (let i = 0; i < n; i++) { const a = Math.abs(x[i]); if (a > peak) { peak = a; pi = i; } dc += x[i]; }
      dc /= n;
      // start: the first sample, the biggest of the first millisecond
      const ms1 = Math.round(0.001 * SR);
      let first1 = 0; for (let i = 0; i < ms1; i++) first1 = Math.max(first1, Math.abs(x[i]));
      // the biggest sample-to-sample step against the sound's own roughness: a click is a step far above what the rest of the sound does
      let dmax = 0, dss = 0, di = 0; for (let i = 1; i < n; i++) { const d = Math.abs(x[i] - x[i - 1]); dss += d * d; if (d > dmax) { dmax = d; di = i; } }
      const drms = Math.sqrt(dss / Math.max(1, n - 1));
      // end: the last sample and the level of the last 10 ms before the fade (the baker fades the last 8 ms)
      const fadeStart = Math.max(0, n - Math.round(0.008 * SR));
      let tail = 0; for (let i = Math.max(0, fadeStart - Math.round(0.002 * SR)); i < fadeStart; i++) tail = Math.max(tail, Math.abs(x[i]));
      // K-weighted loudest 100 ms
      const k = await kWeigh(x);
      const w = Math.round(0.1 * SR); let l100 = -200;
      let first = 0; while (first < n && Math.abs(x[first]) < peak * 0.01) first++;
      for (let a = Math.max(0, first - (w >> 1)); a < n; a += Math.round(0.005 * SR)) { let q = 0; const bb = Math.min(a + w, n); for (let i = a; i < bb; i++) q += k[i] * k[i]; const val = -0.691 + dbp(q / w); if (val > l100) l100 = val; }
      const pAll = power(x, 0, n), p100 = power(x, 0, Math.min(n, Math.round(0.1 * SR)));
      vs.push({
        ms: +(n * 1000 / SR).toFixed(0), peakDb: +db(peak).toFixed(1), l100: +l100.toFixed(1), tpeak: +(pi * 1000 / SR).toFixed(0),
        air6: +share(pAll, 6000, 24000).toFixed(3), hi4: +share(pAll, 4000, 24000).toFixed(3), air6first: +share(p100, 6000, 24000).toFixed(3), hi4first: +share(p100, 4000, 24000).toFixed(3),
        sub250: +share(pAll, 0, 250).toFixed(3), mid: +share(pAll, 800, 4000).toFixed(3),
        x0: +(Math.abs(x[0]) / peak).toExponential(1), first1ms: +(first1 / peak).toFixed(3),
        stepCrest: +(dmax / Math.max(drms, 1e-9)).toFixed(1), stepAtMs: +(di * 1000 / SR).toFixed(1), stepRel: +(dmax / peak).toFixed(3),
        xEnd: Math.abs(x[n - 1]), tailDb: +db(tail / peak).toFixed(1), dcRel: +(dc / peak).toExponential(1), truncated: baked.truncated, gainDb: +baked.gainDb.toFixed(1),
      });
      // similarity descriptor: 3 slices (0-30 ms, 30-100 ms, 100-300 ms) of 24 bands, plus the slices' relative levels
      const sl = [[0, 0.03], [0.03, 0.1], [0.1, 0.3]].map(([a, b]) => [Math.round(a * SR), Math.min(n, Math.round(b * SR))]);
      const vec = [];
      let lv = [];
      for (const [a, b] of sl) {
        if (b - a < 64) { for (let i = 0; i < 24; i++) vec.push(-100); lv.push(-100); continue; }
        const p = power(x, a, b); let e = 0; for (let i = 0; i < N / 2; i++) e += p[i];
        const bd = bandsDb(p); for (const v2 of bd) vec.push(v2); lv.push(dbp(e / Math.max(1, b - a) / (N / 2) / 1e0));
      }
      const top = Math.max(...lv); lv = lv.map((v2) => Math.max(-60, v2 - top));
      desc.push({ key: def.key + (nv > 1 ? ' v' + v : ''), id: def.id, vec: vec.map((v2) => Math.max(-60, v2)), lv });
    }
    const m = (f) => +(vs.reduce((a, r) => a + f(r), 0) / vs.length).toFixed(3);
    const M = (f) => Math.max(...vs.map(f));
    const bus = busOf(def.recipe.cat);
    rows.push({
      id: def.id, key: def.key, cat: def.recipe.cat, bus, variants: nv, rule: def.rule, prio: def.recipe.prio ?? 0,
      ms: M((r) => r.ms), msMin: Math.min(...vs.map((r) => r.ms)), peakDb: M((r) => r.peakDb), l100: m((r) => r.l100), playL100: +(m((r) => r.l100) + 20 * Math.log10(BUS_LEVEL[bus])).toFixed(1),
      air6: M((r) => r.air6), hi4: M((r) => r.hi4), air6first: M((r) => r.air6first), hi4first: M((r) => r.hi4first), sub250: m((r) => r.sub250), mid: m((r) => r.mid),
      x0: Math.max(...vs.map((r) => +r.x0)), first1ms: M((r) => r.first1ms), stepCrest: M((r) => r.stepCrest), stepAtMs: vs.sort((a, b) => b.stepCrest - a.stepCrest)[0].stepAtMs, stepRel: M((r) => r.stepRel),
      xEnd: M((r) => r.xEnd), tailDb: M((r) => r.tailDb), dcRel: Math.max(...vs.map((r) => Math.abs(+r.dcRel))), truncated: vs.some((r) => r.truncated), tpeak: vs[0].tpeak,
    });
  }
  // nearest pairs (Euclid distance of the descriptor; the first variant of each sound against the first variant of every other)
  const first = desc.filter((d) => !/ v[1-9]$/.test(d.key));
  const dist = (a, b) => { let s = 0; for (let i = 0; i < a.vec.length; i++) { const d = a.vec[i] - b.vec[i]; s += d * d; } for (let i = 0; i < 3; i++) { const d = (a.lv[i] - b.lv[i]) * 1.5; s += d * d; } return Math.sqrt(s / a.vec.length); };
  const pairs = [];
  for (let i = 0; i < first.length; i++) for (let j = i + 1; j < first.length; j++) pairs.push([+dist(first[i], first[j]).toFixed(2), first[i].id, first[j].id]);
  pairs.sort((a, b) => a[0] - b[0]);
  return JSON.stringify({ rows, pairs: pairs.slice(0, 400), descN: first.length });
})()
