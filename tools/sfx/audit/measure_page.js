(async () => {
  const { SOUNDS } = await import('/src/audio/sounds.ts');
  const { bakeVariant } = await import('/src/audio/bake.ts');
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
  const BANDS = [['sub', 0, 100], ['low', 100, 250], ['lowmid', 250, 800], ['mid', 800, 2500], ['himid', 2500, 6000], ['air', 6000, 24000]];
  function spectrum(x, start, end) {
    // Hann window over min(len, N) samples (a short sound is windowed over its own length, so its onset is not thrown away)
    const N = 2048, hop = 1024;
    const len = Math.max(8, end - start);
    const wl = Math.min(len, N);
    const power = new Float64Array(N / 2);
    const win = new Float64Array(wl); for (let i = 0; i < wl; i++) win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * (i + 0.5) / wl);
    const total = len <= N ? 1 : Math.ceil((len - N) / hop) + 1;
    for (let f = 0; f < total; f++) {
      const re = new Float64Array(N), im = new Float64Array(N);
      const s0 = start + f * hop;
      for (let i = 0; i < wl; i++) { const k = s0 + i; re[i] = k < end && k < x.length ? x[k] * win[i] : 0; }
      fft(re, im);
      for (let k = 0; k < N / 2; k++) power[k] += re[k] * re[k] + im[k] * im[k];
    }
    const binHz = SR / N;
    let sum = 0, cw = 0; const band = BANDS.map(() => 0);
    for (let k = 1; k < N / 2; k++) {
      const hz = k * binHz; const p = power[k];
      sum += p; cw += p * hz;
      for (let b = 0; b < BANDS.length; b++) if (hz >= BANDS[b][1] && hz < BANDS[b][2]) { band[b] += p; break; }
    }
    return { centroid: cw / Math.max(sum, 1e-18), band: band.map((v) => v / Math.max(sum, 1e-18)) };
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
  function envelope(x, ms) {
    const w = Math.max(1, Math.round(ms * SR / 1000));
    const e = new Float64Array(x.length);
    for (let i = 0; i < x.length; i++) { let m = 0; const a = Math.max(0, i - w + 1); for (let j = a; j <= i; j++) { const v = Math.abs(x[j]); if (v > m) m = v; } e[i] = m; }
    return e;
  }
  function rmsRange(x, a, b) { a = Math.max(0, a); b = Math.min(x.length, b); if (b <= a) return 0; let s = 0; for (let i = a; i < b; i++) s += x[i] * x[i]; return Math.sqrt(s / (b - a)); }

  async function measure(x) {
    const n = x.length;
    let peak = 0, pi = 0; for (let i = 0; i < n; i++) { const a = Math.abs(x[i]); if (a > peak) { peak = a; pi = i; } }
    const thr = peak * 0.01; let s0 = 0; while (s0 < n && Math.abs(x[s0]) < thr) s0++;
    let s1 = n - 1; while (s1 > s0 && Math.abs(x[s1]) < thr) s1--;
    const span = Math.max(1, s1 - s0 + 1);
    const ms = span * 1000 / SR;
    const env = envelope(x, 1);
    const firstWin = Math.min(n, s0 + Math.round(0.15 * SR));
    let fpk = 0; for (let i = s0; i < firstWin; i++) if (env[i] > fpk) fpk = env[i];
    let i10 = s0, i90 = s0;
    for (let i = s0; i < firstWin; i++) if (env[i] >= 0.1 * fpk) { i10 = i; break; }
    for (let i = i10; i < firstWin; i++) if (env[i] >= 0.9 * fpk) { i90 = i; break; }
    const attack = (i90 - i10) * 1000 / SR;
    const tpeak = (pi - s0) * 1000 / SR;
    let o5 = 0; for (let i = i10; i < Math.min(n, i10 + Math.round(0.005 * SR)); i++) o5 = Math.max(o5, Math.abs(x[i]));
    const on = i10;
    const r1 = rmsRange(x, on, on + Math.round(0.012 * SR)), r2 = rmsRange(x, on + Math.round(0.012 * SR), on + Math.round(0.08 * SR));
    const punch = db(r1) - db(r2);
    let t20 = ms; { const lim = peak * 0.1; let last = pi; for (let i = pi; i < n; i++) if (env[i] > lim) last = i; t20 = (last - pi) * 1000 / SR; }
    const sp = spectrum(x, s0, s1 + 1);
    const first = spectrum(x, s0, Math.min(n, s0 + Math.round(0.02 * SR)));
    const first80 = spectrum(x, s0, Math.min(n, s0 + Math.round(0.08 * SR)));
    const bite = first.band[4];
    const body = first80.band[0] + first80.band[1];
    const k = await kWeigh(x);
    let ss = 0; for (let i = s0; i <= s1; i++) ss += k[i] * k[i];
    const lufsSpan = -0.691 + dbp(ss / span);
    const w100 = Math.round(0.1 * SR); let l100 = -200;
    for (let a = Math.max(0, s0 - (w100 >> 1)); a <= s1; a += Math.round(0.005 * SR)) { let q = 0; const bb = Math.min(a + w100, n); for (let i = a; i < bb; i++) q += k[i] * k[i]; const v = -0.691 + dbp(q / w100); if (v > l100) l100 = v; }
    let sel = 0; for (let i = 0; i < n; i++) sel += k[i] * k[i]; sel = dbp(sel / SR);
    let rawSum = 0; for (let i = s0; i <= s1; i++) rawSum += x[i] * x[i];
    return {
      ms: +ms.toFixed(1), peakDb: +db(peak).toFixed(2), peak: +peak.toFixed(3), rmsDb: +dbp(rawSum / span).toFixed(2), crest: +(db(peak) - dbp(rawSum / span)).toFixed(1),
      lufsSpan: +lufsSpan.toFixed(1), l100: +l100.toFixed(1), sel: +sel.toFixed(1),
      centroid: Math.round(sp.centroid), attack: +attack.toFixed(1), tpeak: +tpeak.toFixed(1), onset5: +(o5 / Math.max(peak, 1e-9)).toFixed(2), punch: +punch.toFixed(1), t20: +t20.toFixed(0),
      bite: +bite.toFixed(3), body: +body.toFixed(3), band: sp.band.map((v) => +v.toFixed(3)), centroid20: Math.round(first.centroid),
    };
  }

  const rows = [];
  for (const def of SOUNDS) {
    const nv = def.recipe.variants ?? 1;
    const vs = [];
    for (let v = 0; v < nv; v++) {
      const baked = await bakeVariant(def.recipe, def.key, v, SR);
      vs.push(await measure(baked.buffer.getChannelData(0)));
    }
    const mean = (f) => +(vs.reduce((a, r) => a + f(r), 0) / vs.length).toFixed(3);
    const m0 = vs[0];
    rows.push({
      key: def.key, cat: def.recipe.cat, variants: nv, rate: def.recipe.rate ?? 0, prio: def.recipe.prio ?? 0, trim: def.recipe.trim ?? 0,
      rule: { maxVoices: def.rule.maxVoices, minGap: def.rule.minGap, falloff: def.rule.falloff, bucket: def.rule.bucket },
      ...m0,
      msMean: mean((r) => r.ms), lufsSpanMean: mean((r) => r.lufsSpan), l100Mean: mean((r) => r.l100), selMean: mean((r) => r.sel), centroidMean: Math.round(mean((r) => r.centroid)),
      spread: { ms: [Math.min(...vs.map((r) => r.ms)), Math.max(...vs.map((r) => r.ms))], centroid: [Math.min(...vs.map((r) => r.centroid)), Math.max(...vs.map((r) => r.centroid))], l100: [Math.min(...vs.map((r) => r.l100)), Math.max(...vs.map((r) => r.l100))] },
    });
  }
  return JSON.stringify(rows);
})()
