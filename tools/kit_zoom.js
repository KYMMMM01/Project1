// Prelude for tools/kit_zoom.sh (it comes after tools/aside_run.sh's and tools/ui_motion_capture.js's own preludes).
// A 1x screenshot hides the faults of a few pixels a real high-resolution screen shows, so this captures any
// rectangle of the design space enlarged: the game's root container is scaled and moved so the rectangle fills the
// canvas, every baked (cached) texture is baked again at the new density, the page is shot, and everything is put back.
//
//   await zoom('chest_header', { x: 0, y: 700, w: 360, h: 140 }, 3)   -> <key>/z_chest_header.png, cropped to the rectangle
//   await zoomAll('home_top', [{ x, y, w, h }, ...], 3)                 one capture per rectangle, numbered
//   await probe(expr)                                                   JSON of any page expression (read bounds from the display tree)
//   await boxesOf(selectorFn)                                           design-space bounds of display objects
//
// The crop is written to the log as `ZOOM <name> <cropW> <cropH> <canvasW> <canvasH>` (canvas CSS pixels) and tools/kit_zoom.sh cuts
// the saved PNG down to it. k is the number of screen pixels per design pixel relative to the game's own scale (3 = three times).
async function zoom(name, r, k = 3) {
  const info = await ev(([r, k]) => {
    const g = window.__dbg.game;
    const root = g.root;
    const rd = g.app.renderer;
    const cw = g.app.canvas.clientWidth;
    const ch = g.app.canvas.clientHeight;
    // The rectangle must fit: shrink the factor when it is larger than the canvas allows.
    const kk = Math.min(g.scale * k, cw / r.w, ch / r.h);
    const saved = (window.__zoomSaved = { sx: root.scale.x, sy: root.scale.y, x: root.position.x, y: root.position.y, bakes: [] });
    root.scale.set(kk);
    root.position.set(-r.x * kk, -r.y * kk);
    // Baked textures are made at a fixed density when first drawn: bake them again for this magnification (capped by GPU limits).
    const density = Math.min(4, kk * rd.resolution);
    const walk = (n) => {
      if (n.isCachedAsTexture && n.renderGroup && n.renderGroup.textureOptions) {
        const o = n.renderGroup.textureOptions;
        saved.bakes.push([n, o.resolution]);
        o.resolution = Math.max(o.resolution || 1, density);
        n.updateCacheTexture();
      }
      if (n.children) for (const c of n.children) walk(c);
    };
    walk(g.app.stage);
    rd.render({ container: g.app.stage });
    return { kk, cw, ch, cropW: Math.round(r.w * kk), cropH: Math.round(r.h * kk), k: kk / g.scale };
  }, [r, k]);
  await sleep(120);
  for (let tries = 0; ; tries++) {
    try { await shot('z_' + name); break; } catch (e) { if (tries >= 3) throw e; await sleep(700); }
  }
  console.log('ZOOM ' + ['z_' + name, info.cropW, info.cropH, info.cw, info.ch].join(' ') + ' k=' + info.k.toFixed(2));
  await ev(() => {
    const g = window.__dbg.game;
    const s = window.__zoomSaved;
    if (!s) return;
    g.root.scale.set(s.sx, s.sy);
    g.root.position.set(s.x, s.y);
    for (const [n, res] of s.bakes) {
      if (n.destroyed || !n.renderGroup) continue;
      n.renderGroup.textureOptions.resolution = res;
      n.updateCacheTexture();
    }
    window.__zoomSaved = null;
  });
}
async function zoomAll(name, rects, k = 3) {
  for (let i = 0; i < rects.length; i++) await zoom(name + '_' + i, rects[i], k);
}
async function probe(expr) {
  return await ev((e) => JSON.stringify((0, eval)(e)), expr);
}
// The design-space bounds of every visible display object whose label (or constructor name) matches `pattern`.
async function boxesOf(pattern) {
  return await ev((p) => {
    const g = window.__dbg.game;
    const re = new RegExp(p);
    const out = [];
    const walk = (n, shown) => {
      const vis = shown && n.visible !== false && n.alpha > 0.02;
      if (!vis) return;
      const tag = (n.label || '') + '|' + (n.constructor && n.constructor.name);
      if (re.test(tag)) {
        const b = n.getBounds();
        out.push({ tag, x: +(b.x / g.scale).toFixed(1), y: +(b.y / g.scale).toFixed(1), w: +(b.width / g.scale).toFixed(1), h: +(b.height / g.scale).toFixed(1) });
      }
      if (n.children) for (const c of n.children) walk(c, vis);
    };
    walk(g.app.stage, true);
    return out;
  }, pattern);
}
// Scroll the first visible-or-not display object whose constructor name or label matches `pattern` into its ScrollView and return its design-space bounds
// ({x, y, w, h}); null when nothing matches. Pass `nth` to take a later match.
async function focus(pattern, nth = 0) {
  return await ev(([p, nth]) => {
    const g = window.__dbg.game;
    const re = new RegExp(p);
    const hits = [];
    const walk = (n) => {
      if (re.test((n.label || '') + '|' + (n.constructor && n.constructor.name))) hits.push(n);
      if (n.children) for (const c of n.children) walk(c);
    };
    walk(g.app.stage);
    const obj = hits[nth];
    if (!obj) return null;
    for (let a = obj.parent; a; a = a.parent) {
      if (a.isScrollHost) { a.scrollToShow(obj, 16, false); break; }
    }
    g.tick(0);
    const b = obj.getBounds();
    return { x: +(b.x / g.scale).toFixed(1), y: +(b.y / g.scale).toFixed(1), w: +(b.width / g.scale).toFixed(1), h: +(b.height / g.scale).toFixed(1) };
  }, [pattern, nth]);
}
// Pairs of visible, on-screen Text objects (inside the viewport of any ScrollView they sit in) whose boxes overlap by more than `slack` px each way.
// Prints `OVERLAP <label> "<a>" x y w h  |  "<b>" x y w h`; returns the count. A first look for UI that sits on UI; the zoomed stills settle each case.
async function textOverlaps(label, slack = 3) {
  const list = await ev((slack) => {
    const g = window.__dbg.game;
    const items = [];
    const walk = (n, shown, clip) => {
      const vis = shown && n.visible !== false && n.alpha > 0.05;
      if (!vis) return;
      let c = clip;
      if (n.isScrollHost && n.maskG) { const b = n.maskG.getBounds(); c = { x0: b.x, y0: b.y, x1: b.x + b.width, y1: b.y + b.height }; }
      if (typeof n.text === 'string' && n.text.trim() && n.style && n.getBounds) {
        const b = n.getBounds();
        const r = { x: b.x / g.scale, y: b.y / g.scale, w: b.width / g.scale, h: b.height / g.scale };
        const inView = r.x + r.w > 0 && r.x < g.w && r.y + r.h > 0 && r.y < g.h && (!c || (b.x + b.width > c.x0 && b.x < c.x1 && b.y + b.height > c.y0 && b.y < c.y1));
        if (inView && r.w > 1 && r.h > 1) items.push({ t: n.text.slice(0, 22), ...r });
      }
      if (n.children) for (const ch of n.children) walk(ch, vis, c);
    };
    walk(g.app.stage, true, null);
    const out = [];
    for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
      const a = items[i], b = items[j];
      const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
      const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
      if (ox > slack && oy > slack) out.push('"' + a.t + '" ' + [a.x, a.y, a.w, a.h].map(Math.round).join(',') + '  |  "' + b.t + '" ' + [b.x, b.y, b.w, b.h].map(Math.round).join(','));
    }
    return out;
  }, slack);
  for (const l of list) console.log('OVERLAP ' + label + ' ' + l);
  console.log('OVERLAPS ' + label + ' ' + list.length);
  return list.length;
}
