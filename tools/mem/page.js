// Evaluated in the page once it is up: gathers what can be read from inside (no heap queries here: those are made from the CDP side).
(() => {
  const MB = 1048576;
  window.__page = () => {
    const T = window.__trk;
    const out = {};
    const dbg = window.__dbg;
    out.hasDbg = !!dbg;
    out.dpr = devicePixelRatio;
    out.inner = [innerWidth, innerHeight];
    // GL ledger
    const G = T.gl;
    const kinds = {};
    const list = [];
    for (const r of G.tex.values()) {
      const k = r.kind;
      const e = (kinds[k] ??= { n: 0, bytes: 0 });
      e.n++; e.bytes += r.bytes;
      list.push([r.bytes, r.w, r.h, r.kind, r.mips ? 'mip' : '', r.born, r.stack]);
    }
    list.sort((a, b) => b[0] - a[0]);
    out.gl = {
      textures: G.tex.size, texBytes: G.total, texPeak: G.peak, rbBytes: G.rbTotal, rbPeak: G.rbPeak, rbN: G.rb.size, bufBytes: G.bufTotal, bufPeak: G.bufPeak,
      created: G.created, deleted: G.deleted, uploads: G.uploads, uploadBytes: G.uploadBytes, contexts: G.ctxs, attrs: G.attrs, kinds, top: list.slice(0, 30),
      renderbuffers: [...G.rb.values()].filter((x) => x.bytes).sort((a, b) => b.bytes - a.bytes).slice(0, 40).map((x) => [x.bytes, x.w, x.h, x.samples, x.stack || '']),
      rbAll: [...G.rb.values()].filter((x) => x.bytes).length,
    };
    // canvases made, audio
    out.canvMade = [T.canv.made, T.canv.madeOff];
    const A = T.audio;
    out.audioTrk = { real: A.real, offline: A.offline, renders: A.renders, peakInflight: A.peakInflight, peakInflightMB: +(A.peakInflightBytes / MB).toFixed(2), renderedMB: +(A.renderedBytes / MB).toFixed(1), createBuf: A.createBuf, createBufMB: +(A.createBufBytes / MB).toFixed(2) };
    out.bitmapsMade = [T.bitmaps.made, +(T.bitmaps.bytes / MB).toFixed(1)];
    // JS heap as the page sees it
    const m = performance.memory;
    out.perfMemory = m ? { used: m.usedJSHeapSize, total: m.totalJSHeapSize } : null;
    if (!dbg || !dbg.game || !dbg.game.app) return out;
    const game = dbg.game;
    const app = game.app;
    const r = app.renderer;
    out.stage = { canvasCss: [app.canvas.clientWidth, app.canvas.clientHeight], canvasPx: [app.canvas.width, app.canvas.height], resolution: r.resolution, rendererSize: [r.width, r.height], design: [game.w, game.h], scale: game.scale };
    const gl = r.gl;
    if (gl) {
      out.stage.drawingBuffer = [gl.drawingBufferWidth, gl.drawingBufferHeight];
      out.stage.glAttrs = gl.getContextAttributes();
      out.stage.samples = gl.getParameter(gl.SAMPLES);
      out.stage.maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE);
    }
    // the scene graph
    let total = 0, text = 0, sprite = 0, graphics = 0, container = 0, other = 0, invisible = 0, maxDepth = 0, destroyed = 0, particle = 0;
    const walk = (n, d) => {
      total++;
      if (d > maxDepth) maxDepth = d;
      if (n.destroyed) destroyed++;
      if (n.visible === false || n.renderable === false) invisible++;
      if (typeof n.text === 'string' && n.style) text++;
      else if (n.context && n.fill) graphics++;
      else if (n.particleChildren) particle++;
      else if (n.texture && !n.children?.length) sprite++;
      else if (n.children) container++;
      else other++;
      for (const c of n.children || []) walk(c, d + 1);
    };
    walk(app.stage, 0);
    out.tree = { total, text, sprite, graphics, container, particle, other, invisible, maxDepth, destroyed };
    out.tree.particles = 0;
    const walkP = (n) => { if (n.particleChildren) out.tree.particles += n.particleChildren.length; for (const c of n.children || []) walkP(c); };
    walkP(app.stage);
    // Pixi's own list of what it has put on the GPU
    const man = r.texture && r.texture.managedTextures ? r.texture.managedTextures : [];
    out.pixi = { managed: man.filter(Boolean).length };
    const tk = {};
    let mb = 0;
    for (const s of man) {
      if (!s) continue;
      const res = s.resource;
      const kind = !res ? 'null' : res.constructor && res.constructor.name;
      const e = (tk[kind] ??= { n: 0, bytes: 0 });
      const b = s.pixelWidth * s.pixelHeight * 4 * (s.mipLevelCount > 1 ? 1.333 : 1);
      e.n++; e.bytes += b; mb += b;
    }
    out.pixi.managedBytes = mb;
    out.pixi.byResource = tk;
    out.pixi.mipmapped = man.filter((s) => s && s.mipLevelCount > 1).length;
    if (r.gc) out.pixi.gc = { enabled: r.gc.enabled, maxUnused: r.gc.maxUnusedTime, freq: r._frequency || r.gc._frequency };
    // audio engine
    try { out.audio = dbg.audio ? dbg.audio.stats() : null; } catch (e) { out.audio = String(e); }
    try { out.fxTierSaved = localStorage.getItem('fx.tier'); } catch (e) { out.fxTierSaved = null; }
    out.scene = dbg.scenes && dbg.scenes.current ? dbg.scenes.current.constructor.name : null;
    out.errors = (window.__errors || []).length;
    return out;
  };
})();
