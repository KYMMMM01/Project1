async (args) => {
  // args: { ids: ['sfx:sp_x', ...], samples: ['impact-sounds/x', ...], variants: 'all'|'first', perSheet, SR }
  const SR = args.SR || 48000;
  const { SOUNDS } = await import('/src/audio/sounds.ts');
  const { bakeVariant } = await import('/src/audio/bake.ts');
  const { sampleStore, parseWav } = await import('/src/audio/samples.ts');
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
  function spectrum(x, start, end, rate) {
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
    const binHz = rate / N;
    let sum = 0, cw = 0; const band = BANDS.map(() => 0);
    for (let k = 1; k < N / 2; k++) {
      const hz = k * binHz; const p = power[k];
      sum += p; cw += p * hz;
      for (let b = 0; b < BANDS.length; b++) if (hz >= BANDS[b][1] && hz < BANDS[b][2]) { band[b] += p; break; }
    }
    return { centroid: cw / Math.max(sum, 1e-18), band: band.map((v) => v / Math.max(sum, 1e-18)) };
  }
  async function kWeigh(x, rate) {
    const ctx = new OfflineAudioContext(1, x.length, rate);
    const buf = ctx.createBuffer(1, x.length, rate); buf.getChannelData(0).set(x);
    const src = ctx.createBufferSource(); src.buffer = buf;
    const hs = ctx.createBiquadFilter(); hs.type = 'highshelf'; hs.frequency.value = 1681.97; hs.gain.value = 3.9998;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 38.13; hp.Q.value = 0.5003;
    src.connect(hs); hs.connect(hp); hp.connect(ctx.destination); src.start();
    return (await ctx.startRendering()).getChannelData(0);
  }
  function envelope(x, ms, rate) {
    const w = Math.max(1, Math.round(ms * rate / 1000));
    const e = new Float64Array(x.length);
    for (let i = 0; i < x.length; i++) { let m = 0; const a = Math.max(0, i - w + 1); for (let j = a; j <= i; j++) { const v = Math.abs(x[j]); if (v > m) m = v; } e[i] = m; }
    return e;
  }
  function rmsRange(x, a, b) { a = Math.max(0, a); b = Math.min(x.length, b); if (b <= a) return 0; let s = 0; for (let i = a; i < b; i++) s += x[i] * x[i]; return Math.sqrt(s / (b - a)); }
  async function measure(x, rate) {
    const n = x.length;
    let peak = 0, pi = 0; for (let i = 0; i < n; i++) { const a = Math.abs(x[i]); if (a > peak) { peak = a; pi = i; } }
    const thr = peak * 0.01; let s0 = 0; while (s0 < n && Math.abs(x[s0]) < thr) s0++;
    let s1 = n - 1; while (s1 > s0 && Math.abs(x[s1]) < thr) s1--;
    const span = Math.max(1, s1 - s0 + 1);
    const ms = span * 1000 / rate;
    const env = envelope(x, 1, rate);
    const firstWin = Math.min(n, s0 + Math.round(0.15 * rate));
    let fpk = 0; for (let i = s0; i < firstWin; i++) if (env[i] > fpk) fpk = env[i];
    let i10 = s0, i90 = s0;
    for (let i = s0; i < firstWin; i++) if (env[i] >= 0.1 * fpk) { i10 = i; break; }
    for (let i = i10; i < firstWin; i++) if (env[i] >= 0.9 * fpk) { i90 = i; break; }
    const attack = (i90 - i10) * 1000 / rate;
    const on = i10;
    const r1 = rmsRange(x, on, on + Math.round(0.012 * rate)), r2 = rmsRange(x, on + Math.round(0.012 * rate), on + Math.round(0.08 * rate));
    const punch = db(r1) - db(r2);
    let t20 = ms; { const lim = peak * 0.1; let last = pi; for (let i = pi; i < n; i++) if (env[i] > lim) last = i; t20 = (last - pi) * 1000 / rate; }
    const sp = spectrum(x, s0, s1 + 1, rate);
    const first = spectrum(x, s0, Math.min(n, s0 + Math.round(0.02 * rate)), rate);
    const first80 = spectrum(x, s0, Math.min(n, s0 + Math.round(0.08 * rate)), rate);
    const k = await kWeigh(x, rate);
    let ss = 0; for (let i = s0; i <= s1; i++) ss += k[i] * k[i];
    const lufsSpan = -0.691 + dbp(ss / span);
    const w100 = Math.round(0.1 * rate); let l100 = -200;
    for (let a = Math.max(0, s0 - (w100 >> 1)); a <= s1; a += Math.round(0.005 * rate)) { let q = 0; const bb = Math.min(a + w100, n); for (let i = a; i < bb; i++) q += k[i] * k[i]; const v = -0.691 + dbp(q / w100); if (v > l100) l100 = v; }
    return {
      ms: +ms.toFixed(0), peakDb: +db(peak).toFixed(1), peak: +peak.toFixed(3), lufsSpan: +lufsSpan.toFixed(1), l100: +l100.toFixed(1),
      centroid: Math.round(sp.centroid), attack: +attack.toFixed(1), punch: +punch.toFixed(1), t20: +t20.toFixed(0),
      bite: +first.band[4].toFixed(3), body: +(first80.band[0] + first80.band[1]).toFixed(3),
      band: sp.band.map((v) => +(v * 100).toFixed(0)).join('/'),
      phone: +((1 - sp.band[0] - sp.band[1]) * 100).toFixed(0),
    };
  }
  // ---- plotting ----
  const W = 900, WAVE_H = 46, SPEC_H = 150, PAD = 20, ROW = WAVE_H + SPEC_H + PAD;
  function colour(v) {
    const stops = [[0, [8, 8, 30]], [0.25, [60, 20, 110]], [0.5, [180, 40, 90]], [0.75, [250, 150, 30]], [1, [255, 250, 190]]];
    for (let i = 1; i < stops.length; i++) if (v <= stops[i][0]) { const [a, ca] = stops[i - 1], [b, cb] = stops[i]; const t = (v - a) / (b - a); return ca.map((c, j) => Math.round(c + (cb[j] - c) * t)); }
    return stops[stops.length - 1][1];
  }
  function drawPanel(ctx, y0, x, rate, label, m, tmax) {
    const n = x.length;
    ctx.fillStyle = '#10101c'; ctx.fillRect(0, y0, W, ROW);
    ctx.fillStyle = '#1b1b30'; ctx.fillRect(40, y0, W - 50, WAVE_H);
    ctx.strokeStyle = '#6fd0ff'; ctx.beginPath();
    const pxPerSample = (W - 50) / (tmax * rate);
    for (let px = 0; px < W - 50; px++) {
      const a = Math.floor(px / pxPerSample), b = Math.min(n, Math.floor((px + 1) / pxPerSample) + 1);
      let mx = 0; for (let i = a; i < b && i < n; i++) { const v = Math.abs(x[i]); if (v > mx) mx = v; }
      const h = mx * (WAVE_H / 2 - 1);
      ctx.moveTo(40 + px + 0.5, y0 + WAVE_H / 2 - h); ctx.lineTo(40 + px + 0.5, y0 + WAVE_H / 2 + h);
    }
    ctx.stroke();
    const NF = 1024;
    const frames = Math.floor((W - 50));
    const fmin = 80, fmax = Math.min(16000, rate / 2);
    const img = ctx.createImageData(W - 50, SPEC_H);
    const win = new Float64Array(NF); for (let i = 0; i < NF; i++) win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * (i + 0.5) / NF);
    const cols = [];
    let maxDb = -200;
    for (let px = 0; px < frames; px++) {
      const centre = Math.round((px + 0.5) / pxPerSample);
      const re = new Float64Array(NF), im = new Float64Array(NF);
      for (let i = 0; i < NF; i++) { const k = centre - NF / 2 + i; re[i] = k >= 0 && k < n ? x[k] * win[i] : 0; }
      fft(re, im);
      const mag = new Float64Array(NF / 2); for (let k = 0; k < NF / 2; k++) mag[k] = Math.sqrt(re[k] * re[k] + im[k] * im[k]) / (NF / 4);
      const col = new Float64Array(SPEC_H);
      for (let r = 0; r < SPEC_H; r++) {
        const f = fmin * Math.pow(fmax / fmin, 1 - r / (SPEC_H - 1));
        const kk = f * NF / rate; const k0 = Math.floor(kk), fr = kk - k0;
        const v = mag[Math.min(NF / 2 - 1, k0)] * (1 - fr) + mag[Math.min(NF / 2 - 1, k0 + 1)] * fr;
        col[r] = db(v); if (col[r] > maxDb) maxDb = col[r];
      }
      cols.push(col);
    }
    const top = args.specTop ?? Math.max(maxDb, -50), range = args.specRange ?? 70;
    for (let px = 0; px < frames; px++) for (let r = 0; r < SPEC_H; r++) {
      const v = Math.min(1, Math.max(0, (cols[px][r] - (top - range)) / range));
      const [R, G, B] = colour(v); const o = (r * (W - 50) + px) * 4; img.data[o] = R; img.data[o + 1] = G; img.data[o + 2] = B; img.data[o + 3] = 255;
    }
    ctx.putImageData(img, 40, y0 + WAVE_H);
    ctx.fillStyle = '#c8c8e0'; ctx.font = '10px monospace';
    for (const f of [100, 250, 500, 1000, 2000, 4000, 8000, 16000]) { if (f > fmax) continue; const r = (1 - Math.log(f / fmin) / Math.log(fmax / fmin)) * (SPEC_H - 1); ctx.fillText(f >= 1000 ? (f / 1000) + 'k' : String(f), 2, y0 + WAVE_H + r + 4); ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(40, y0 + WAVE_H + r, W - 50, 1); ctx.fillStyle = '#c8c8e0'; }
    const step = tmax > 1.2 ? 0.2 : tmax > 0.5 ? 0.1 : tmax > 0.25 ? 0.05 : 0.02;
    for (let t = 0; t <= tmax + 1e-9; t += step) { const px = 40 + t * rate * pxPerSample; ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(px, y0 + WAVE_H, 1, SPEC_H); ctx.fillStyle = '#c8c8e0'; ctx.fillText(Math.round(t * 1000) + '', px + 2, y0 + WAVE_H + SPEC_H + 10); }
    ctx.fillStyle = '#ffe9a0'; ctx.font = '12px monospace';
    ctx.fillText(label + '  ' + m.ms + 'ms pk' + m.peakDb + ' L100 ' + m.l100 + ' cen' + m.centroid + ' att' + m.attack + ' bite' + m.bite + ' phone' + m.phone + '%', 44, y0 + 12);
  }
  const items = [];
  if (args.samples) {
    for (const id of args.samples) {
      const p = parseWav(await (await fetch('/soundboard/kenney/' + id + '.wav')).arrayBuffer());
      if (!p) { items.push({ label: id + ' MISSING', x: new Float32Array(10), rate: 44100 }); continue; }
      items.push({ label: id.split('/').pop(), x: p.data, rate: p.rate });
    }
  }
  if (args.ids) {
    await sampleStore.preload();
    for (const key of args.ids) {
      const def = SOUNDS.find((d) => d.key === key);
      if (!def) { items.push({ label: key + ' UNKNOWN', x: new Float32Array(10), rate: SR }); continue; }
      const nv = args.variants === 'all' ? (def.recipe.variants ?? 1) : 1;
      for (let v = 0; v < nv; v++) {
        const baked = await bakeVariant(def.recipe, def.key, v, SR);
        items.push({ label: def.id + (nv > 1 ? ' v' + v : ''), x: baked.buffer.getChannelData(0).slice(), rate: SR, gainDb: baked.gainDb, cat: def.recipe.cat, trim: def.recipe.trim ?? 0 });
      }
    }
  }
  const out = { rows: [], sheets: [] };
  const per = args.perSheet || 5;
  for (let s = 0; s < items.length; s += per) {
    const part = items.slice(s, s + per);
    const cv = document.createElement('canvas'); cv.width = W; cv.height = ROW * part.length; const ctx = cv.getContext('2d');
    let y = 0;
    for (const it of part) {
      const m = await measure(it.x, it.rate);
      out.rows.push({ label: it.label, ...m, gainDb: it.gainDb, cat: it.cat, trim: it.trim });
      const tmax = args.tmax || Math.max(0.05, (it.x.length / it.rate));
      drawPanel(ctx, y, it.x, it.rate, it.label, m, tmax);
      y += ROW;
    }
    out.sheets.push(cv.toDataURL('image/png').split(',')[1]);
  }
  return JSON.stringify(out);
}
