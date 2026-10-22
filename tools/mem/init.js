// Injected before any page script (Page.addScriptToEvaluateOnNewDocument). Measurement only: it observes, it never changes what the game does.
(() => {
  if (window.__trk) return;
  const now = () => performance.now();
  Error.stackTraceLimit = 60;
  const T = (window.__trk = {
    t0: now(),
    gl: { tex: new Map(), rb: new Map(), buf: new Map(), total: 0, peak: 0, rbTotal: 0, rbPeak: 0, bufTotal: 0, bufPeak: 0, created: 0, deleted: 0, uploads: 0, uploadBytes: 0, big: [], hist: [], ctxs: 0, attrs: [] },
    canv: { made: 0, madeOff: 0, stacks: new WeakMap() },
    audio: { real: 0, offline: 0, inflight: 0, peakInflight: 0, inflightBytes: 0, peakInflightBytes: 0, renderedBytes: 0, renders: 0, list: [], createBuf: 0, createBufBytes: 0, decoded: 0 },
    bitmaps: { made: 0, bytes: 0 },
    tl: [],
    wantStacks: location.hostname === '127.0.0.1' && /[?&]stacks=1/.test(location.search),
  });
  const stackOf = () => {
    if (!T.wantStacks) return '';
    const lines = String(new Error().stack).split('\n').slice(2).map((x) => x.trim().replace(/^at /, '').replace(/http:\/\/127\.0\.0\.1:\d+/, '').replace(/\?v=[0-9a-f]+/, ''));
    const mine = lines.filter((x) => x.includes('/src/'));
    return lines.slice(0, 3).join(' < ') + ' >> ' + mine.slice(0, 7).join(' < ');
  };

  // ---- WebGL: every texture and renderbuffer, as the GPU is asked for them ----
  const BPP = { 0x1908: 4, 0x8058: 4, 0x1907: 3, 0x8051: 3, 0x8229: 1, 0x822b: 2, 0x881a: 8, 0x8814: 16, 0x88f0: 4, 0x81a5: 2, 0x81a6: 3, 0x81a7: 4, 0x8c43: 4, 0x8056: 2, 0x8d62: 2, 0x8057: 2, 0x1906: 1, 0x1909: 1, 0x190a: 2, 0x84f9: 4, 0x8cad: 5, 0x8d48: 1, 0x8d44: 1, 0x8d46: 1, 0x8d45: 1 };
  const bppOf = (fmt, type) => {
    if (fmt === 0x1908 || fmt === 0x1907) return type === 0x1406 ? (fmt === 0x1908 ? 16 : 12) : type === 0x8d61 || type === 0x140b ? (fmt === 0x1908 ? 8 : 6) : BPP[fmt];
    return BPP[fmt] ?? 4;
  };
  const sizeOfSource = (s) => {
    if (!s) return [0, 0, 'none'];
    const n = s.constructor && s.constructor.name;
    if (n === 'ImageBitmap') return [s.width, s.height, 'bitmap'];
    if (n === 'HTMLCanvasElement') return [s.width, s.height, 'canvas'];
    if (n === 'OffscreenCanvas') return [s.width, s.height, 'offscreen'];
    if (n === 'HTMLImageElement') return [s.naturalWidth, s.naturalHeight, 'img'];
    if (n === 'ImageData') return [s.width, s.height, 'imagedata'];
    if (n === 'HTMLVideoElement') return [s.videoWidth, s.videoHeight, 'video'];
    return [s.width || 0, s.height || 0, n || 'other'];
  };
  const G = T.gl;
  const note = (kind, total) => {
    const t = now() - T.t0;
    const last = G.hist[G.hist.length - 1];
    if (last && t - last[0] < 150) { last[1] = G.total; last[2] = G.rbTotal; } else G.hist.push([t, G.total, G.rbTotal]);
    if (G.hist.length > 4000) G.hist.splice(0, 1000);
  };
  const state = new WeakMap();
  const st = (gl) => { let s = state.get(gl); if (!s) { s = { unit: 0, bound: {}, rb: null, buf: {} }; state.set(gl, s); } return s; };
  const texOf = (gl, target) => st(gl).bound[st(gl).unit + ':' + target];
  const hookGL = (P) => {
    if (!P || P.__hooked) return;
    P.__hooked = true;
    const o = {};
    for (const k of ['createTexture', 'deleteTexture', 'bindTexture', 'activeTexture', 'texImage2D', 'texStorage2D', 'texImage3D', 'texStorage3D', 'generateMipmap', 'createRenderbuffer', 'deleteRenderbuffer', 'bindRenderbuffer', 'renderbufferStorage', 'renderbufferStorageMultisample', 'createBuffer', 'deleteBuffer', 'bindBuffer', 'bufferData', 'compressedTexImage2D']) if (typeof P[k] === 'function') o[k] = P[k];
    const entry = (rec, t) => rec.levels.reduce((a, b) => a + b, 0) * (rec.mips ? 1.3333 : 1);
    const sizeUp = (rec) => { let b = 0; for (const k of Object.keys(rec.lv)) b += rec.lv[k]; return Math.round(b * (rec.mips && Object.keys(rec.lv).length === 1 ? 1.3333 : 1)); };
    const setLevel = (rec, level, bytes, w, h, kind, fmt, op) => {
      const before = rec.bytes;
      rec.lv[level] = bytes;
      if (level === 0) { rec.w = w; rec.h = h; rec.kind = kind; rec.fmt = fmt; }
      rec.bytes = sizeUp(rec);
      G.total += rec.bytes - before;
      if (G.total > G.peak) G.peak = G.total;
      G.uploads++;
      G.uploadBytes += bytes;
      note();
      if (level === 0 && bytes >= 262144 && G.big.length < 600) G.big.push({ t: Math.round(now() - T.t0), op, kind, w, h, bytes, stack: T.wantStacks ? stackOf() : '' });
      if (T.wantStacks && !rec.stack && bytes >= 16384) rec.stack = stackOf();
    };
    P.createTexture = function () { const t = o.createTexture.call(this); G.tex.set(t, { w: 0, h: 0, bytes: 0, lv: {}, mips: false, kind: 'empty', fmt: 0, born: Math.round(now() - T.t0), stack: '' }); G.created++; return t; };
    P.deleteTexture = function (t) { const r = G.tex.get(t); if (r) { G.total -= r.bytes; G.tex.delete(t); G.deleted++; note(); } return o.deleteTexture.call(this, t); };
    P.activeTexture = function (u) { st(this).unit = u - 0x84c0; return o.activeTexture.call(this, u); };
    P.bindTexture = function (target, t) { st(this).bound[st(this).unit + ':' + target] = t; return o.bindTexture.call(this, target, t); };
    P.texImage2D = function (...a) {
      try {
        const rec = G.tex.get(texOf(this, a[0]));
        if (rec) {
          let w, h, kind, type, fmt;
          if (a.length >= 8 && typeof a[3] === 'number' && typeof a[4] === 'number' && typeof a[5] === 'number') { w = a[3]; h = a[4]; fmt = a[2]; type = a[7]; kind = a[8] == null ? 'empty' : sizeOfSource(a[8])[2] === 'other' || ArrayBuffer.isView(a[8]) ? 'pixels' : sizeOfSource(a[8])[2]; }
          else { const [sw, sh, k] = sizeOfSource(a[5]); w = sw; h = sh; kind = k; fmt = a[2]; type = a[4]; }
          setLevel(rec, a[1], w * h * bppOf(fmt, type), w, h, kind, fmt, 'texImage2D');
        }
      } catch (e) { /* never break the game */ }
      return o.texImage2D.apply(this, a);
    };
    P.texStorage2D = function (target, levels, fmt, w, h) {
      try {
        const rec = G.tex.get(texOf(this, target));
        if (rec) { let b = 0, lw = w, lh = h; for (let l = 0; l < levels; l++) { b += Math.max(1, lw) * Math.max(1, lh) * (BPP[fmt] ?? 4); lw >>= 1; lh >>= 1; } setLevel(rec, 0, b, w, h, 'storage', fmt, 'texStorage2D'); }
      } catch (e) { /* ignore */ }
      return o.texStorage2D.call(this, target, levels, fmt, w, h);
    };
    if (o.texImage3D) P.texImage3D = function (...a) { try { const rec = G.tex.get(texOf(this, a[0])); if (rec) setLevel(rec, a[1], a[3] * a[4] * a[5] * (BPP[a[2]] ?? 4), a[3], a[4], 'tex3d', a[2], 'texImage3D'); } catch (e) { /* ignore */ } return o.texImage3D.apply(this, a); };
    P.generateMipmap = function (target) {
      try { const rec = G.tex.get(texOf(this, target)); if (rec && !rec.mips) { const b = rec.bytes; rec.mips = true; rec.bytes = sizeUp(rec); G.total += rec.bytes - b; if (G.total > G.peak) G.peak = G.total; note(); } } catch (e) { /* ignore */ }
      return o.generateMipmap.call(this, target);
    };
    P.createRenderbuffer = function () { const r = o.createRenderbuffer.call(this); G.rb.set(r, { bytes: 0, w: 0, h: 0, samples: 0, fmt: 0 }); return r; };
    P.bindRenderbuffer = function (target, r) { st(this).rb = r; return o.bindRenderbuffer.call(this, target, r); };
    P.deleteRenderbuffer = function (r) { const x = G.rb.get(r); if (x) { G.rbTotal -= x.bytes; G.rb.delete(r); note(); } return o.deleteRenderbuffer.call(this, r); };
    const rbStore = (gl, samples, fmt, w, h) => { const x = G.rb.get(st(gl).rb); if (!x) return; const b = w * h * (BPP[fmt] ?? 4) * Math.max(1, samples); G.rbTotal += b - x.bytes; x.bytes = b; x.w = w; x.h = h; x.samples = samples; x.fmt = fmt; if (T.wantStacks && b >= 131072 && !x.stack) x.stack = stackOf(); if (G.rbTotal > G.rbPeak) G.rbPeak = G.rbTotal; note(); };
    P.renderbufferStorage = function (target, fmt, w, h) { try { rbStore(this, 0, fmt, w, h); } catch (e) { /* ignore */ } return o.renderbufferStorage.call(this, target, fmt, w, h); };
    if (o.renderbufferStorageMultisample) P.renderbufferStorageMultisample = function (target, samples, fmt, w, h) { try { rbStore(this, samples, fmt, w, h); } catch (e) { /* ignore */ } return o.renderbufferStorageMultisample.call(this, target, samples, fmt, w, h); };
    P.createBuffer = function () { const b = o.createBuffer.call(this); G.buf.set(b, 0); return b; };
    P.bindBuffer = function (target, b) { st(this).buf[target] = b; return o.bindBuffer.call(this, target, b); };
    P.deleteBuffer = function (b) { if (G.buf.has(b)) { G.bufTotal -= G.buf.get(b); G.buf.delete(b); } return o.deleteBuffer.call(this, b); };
    P.bufferData = function (target, data, usage) {
      try { const b = st(this).buf[target]; if (b && G.buf.has(b)) { const n = typeof data === 'number' ? data : data ? data.byteLength : 0; G.bufTotal += n - G.buf.get(b); G.buf.set(b, n); if (G.bufTotal > G.bufPeak) G.bufPeak = G.bufTotal; } } catch (e) { /* ignore */ }
      return o.bufferData.apply(this, arguments);
    };
  };
  hookGL(window.WebGLRenderingContext && WebGLRenderingContext.prototype);
  hookGL(window.WebGL2RenderingContext && WebGL2RenderingContext.prototype);
  const origGetContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, attrs) {
    const c = origGetContext.call(this, type, attrs);
    if (c && /webgl/.test(String(type))) { G.ctxs++; G.attrs.push({ type, requested: attrs ? JSON.parse(JSON.stringify(attrs)) : null, got: c.getContextAttributes ? c.getContextAttributes() : null, w: c.drawingBufferWidth, h: c.drawingBufferHeight }); }
    return c;
  };

  // ---- canvases made (the live ones are counted from the heap at each snapshot) ----
  const origCreate = Document.prototype.createElement;
  Document.prototype.createElement = function (tag, o2) {
    const el = origCreate.call(this, tag, o2);
    if (typeof tag === 'string' && tag.toLowerCase() === 'canvas') { T.canv.made++; if (T.wantStacks) T.canv.stacks.set(el, stackOf()); }
    return el;
  };
  if (window.OffscreenCanvas) {
    const OC = window.OffscreenCanvas;
    window.OffscreenCanvas = class extends OC { constructor(w, h) { super(w, h); T.canv.madeOff++; if (T.wantStacks) T.canv.stacks.set(this, stackOf()); } };
  }
  if (window.createImageBitmap) {
    const orig = window.createImageBitmap;
    window.createImageBitmap = function (...a) {
      const p = orig.apply(this, a);
      p.then((b) => { T.bitmaps.made++; T.bitmaps.bytes += b.width * b.height * 4; }, () => {});
      return p;
    };
  }

  // ---- audio: contexts, offline renders in flight, buffers made by hand ----
  const A = T.audio;
  if (window.AudioContext) {
    const AC = window.AudioContext;
    window.AudioContext = class extends AC { constructor(...a) { super(...a); A.real++; } };
  }
  if (window.OfflineAudioContext) {
    const OAC = window.OfflineAudioContext;
    const origStart = OAC.prototype.startRendering;
    OAC.prototype.startRendering = function (...a) {
      const bytes = this.length * 4 * (this.numberOfChannels || 1);
      A.offline++; A.renders++; A.inflight++; A.inflightBytes += bytes;
      if (A.inflight > A.peakInflight) A.peakInflight = A.inflight;
      if (A.inflightBytes > A.peakInflightBytes) A.peakInflightBytes = A.inflightBytes;
      const t = now();
      const done = () => { A.inflight--; A.inflightBytes -= bytes; A.renderedBytes += bytes; if (A.list.length < 4000) A.list.push([Math.round(t - T.t0), Math.round(now() - t), this.length, this.numberOfChannels, this.sampleRate]); };
      const p = origStart.apply(this, a);
      p.then(done, done);
      return p;
    };
  }
  if (window.BaseAudioContext) {
    const origCB = BaseAudioContext.prototype.createBuffer;
    BaseAudioContext.prototype.createBuffer = function (ch, len, rate) { A.createBuf++; A.createBufBytes += ch * len * 4; return origCB.call(this, ch, len, rate); };
  }

  // ---- timeline: the JS heap and the GL ledger four times a second ----
  setInterval(() => {
    const m = performance.memory;
    T.tl.push([Math.round(now() - T.t0), m ? m.usedJSHeapSize : 0, m ? m.totalJSHeapSize : 0, G.total, G.rbTotal, A.inflight, A.inflightBytes]);
    if (T.tl.length > 20000) T.tl.splice(0, 5000);
  }, 250);
})();
