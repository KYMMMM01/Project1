// Page-side probe (evaluated in the game page): what each Pixi render group costs per frame.
// Pixi 8 keeps one instruction list per render group. Any structure change inside a group (a child added or removed, `visible` toggled,
// a Text whose words changed, a batched Graphics redrawn) rebuilds that group's whole list, and any moved, tinted or faded element marks
// the group's vertex buffer dirty, which is then uploaded whole. So a big group with one busy element pays for all its quiet ones.
// Installs `window.__perf` with start(), stop() => per-group report. `causes: true` records where structure changes come from
// (stack frames, readable in a dev build).
(() => {
  if (window.__perf) return 'already';
  const game = window.__dbg.game;
  const r = game.app.renderer;
  const sys = r.renderGroup;
  const batch = r.renderPipes.batch;
  const stage = game.app.stage;

  // Plain containers carry their place among their parent's children (Container#2) so paths tell siblings apart.
  const nameOf = (c) => {
    if (c.label && c.label !== c.constructor.name && c.label !== 'Graphics' && c.label !== 'Sprite' && c.label !== 'NineSliceSprite') return c.label;
    const n = (c.constructor && c.constructor.name) || '?';
    return c.parent ? `${n}#${c.parent.children.indexOf(c)}` : n;
  };
  const pathOf = (c) => {
    const parts = [];
    for (let n = c, i = 0; n && n !== stage && i < 12; n = n.parent, i++) parts.unshift(nameOf(n));
    return parts.join('>');
  };
  const countRenderables = (rg) => {
    let n = 0;
    const walk = (c) => {
      if (c !== rg.root && c.renderGroup) return;
      if (c.localDisplayStatus !== 7) return;
      if (c.renderPipeId) n++;
      for (const ch of c.children) walk(ch);
    };
    walk(rg.root);
    return n;
  };

  let on = false;
  let causes = false;
  let frames = 0;
  const groups = new Map(); // RenderGroup -> stats
  const byIs = new Map(); // instructionSet uid -> RenderGroup
  const stat = (rg) => {
    let s = groups.get(rg);
    if (!s) {
      s = { path: pathOf(rg.root), framesSeen: 0, builds: 0, buildMs: 0, structural: 0, byView: 0, uploads: 0, bytes: 0, renderables: 0, why: new Map(), viewers: new Map(), movers: new Map() };
      groups.set(rg, s);
    }
    return s;
  };

  const origUpdate = sys._updateRenderGroups;
  sys._updateRenderGroups = function (rg) {
    if (!on) return origUpdate.call(this, rg);
    const s = stat(rg);
    s.framesSeen++;
    byIs.set(rg.instructionSet.uid, rg);
    const wasStructural = rg.structureDidChange;
    const views = rg.childrenRenderablesToUpdate;
    if (causes && !wasStructural) {
      for (let i = 0; i < views.index; i++) {
        const c = views.list[i];
        if (!c) continue;
        const k = `${c.constructor.name} ${pathOf(c)}`;
        s.viewers.set(k, (s.viewers.get(k) || 0) + 1);
      }
    }
    if (causes) {
      // Containers whose transform, colour or visibility changed this frame (their subtree is recomputed and the group's buffer re-sent).
      for (const k in rg.childrenToUpdate) {
        const d = rg.childrenToUpdate[k];
        for (let i = 0; i < d.index; i++) {
          const c = d.list[i];
          if (!c || !c.didChange) continue;
          const key = `${c.constructor.name} ${pathOf(c)}`;
          s.movers.set(key, (s.movers.get(key) || 0) + 1);
        }
      }
    }
    rg.__perfStructural = wasStructural;
    return origUpdate.call(this, rg);
  };

  const origBuild = sys._buildInstructions;
  sys._buildInstructions = function (rg, x) {
    if (!on) return origBuild.call(this, rg, x);
    const s = stat(rg);
    const t0 = performance.now();
    const out = origBuild.call(this, rg, x);
    s.buildMs += performance.now() - t0;
    s.builds++;
    if (rg.__perfStructural) s.structural++;
    else s.byView++;
    s.renderables += countRenderables(rg);
    return out;
  };

  const origUpload = batch.upload;
  batch.upload = function (is) {
    if (on) {
      const batchers = this._batchersByInstructionSet[is.uid];
      let bytes = 0;
      for (const i in batchers) if (batchers[i].dirty) bytes += batchers[i].attributeSize * 4;
      if (bytes) {
        const rg = byIs.get(is.uid);
        if (rg) {
          const s = stat(rg);
          s.uploads++;
          s.bytes += bytes;
        }
      }
    }
    return origUpload.call(this, is);
  };

  // Who set structureDidChange: an accessor on every render group met while causes are on (dev build: readable frames).
  const watch = (rg) => {
    if (rg.__perfWatched) return;
    rg.__perfWatched = true;
    let v = rg.structureDidChange;
    Object.defineProperty(rg, 'structureDidChange', {
      configurable: true,
      get: () => v,
      set: (nv) => {
        if (nv && !v && on && causes) {
          const st = (new Error().stack || '').split('\n').slice(2, 7).map((l) => l.trim().replace(/^at /, '').replace(/https?:\/\/[^/]+\//, '').replace(/\?[^:)]*/, '')).filter((l) => !/node_modules|pixi/.test(l)).slice(0, 2).join(' < ');
          const s = stat(rg);
          s.why.set(st, (s.why.get(st) || 0) + 1);
        }
        v = nv;
      },
    });
  };
  const watchAll = () => {
    const walk = (c) => {
      if (c.renderGroup) watch(c.renderGroup);
      for (const ch of c.children) walk(ch);
    };
    walk(stage);
  };

  // Draw calls (WebGL): every drawElements / drawArrays while measuring.
  let draws = 0;
  let subCalls = 0;
  let subBytes = 0;
  const gl = r.gl;
  if (gl) {
    for (const fn of ['bufferSubData', 'bufferData']) {
      const o = gl[fn];
      gl[fn] = function (...a) {
        if (on) {
          subCalls++;
          const d = a[fn === 'bufferSubData' ? 2 : 1];
          // WebGL 2 bufferSubData(target, offset, data, srcOffset, length): the length (in elements) when given, else the whole view.
          if (d && d.byteLength) subBytes += fn === 'bufferSubData' && a[4] ? a[4] * (d.BYTES_PER_ELEMENT || 1) : d.byteLength;
        }
        return o.apply(this, a);
      };
    }
    for (const fn of ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced']) {
      const o = gl[fn];
      if (typeof o !== 'function') continue;
      gl[fn] = function (...a) { if (on) draws++; return o.apply(this, a); };
    }
  }

  window.__perf = {
    start(opts = {}) {
      causes = !!opts.causes;
      groups.clear();
      draws = 0;
      subCalls = 0;
      subBytes = 0;
      byIs.clear();
      frames = 0;
      if (causes) watchAll();
      on = true;
    },
    frame() {
      frames++;
      if (causes && frames % 30 === 0) watchAll();
    },
    stop() {
      on = false;
      const out = [];
      for (const s of groups.values()) {
        out.push({
          path: s.path,
          seen: s.framesSeen,
          buildsPerFrame: +(s.builds / Math.max(1, frames)).toFixed(3),
          structural: s.structural,
          byView: s.byView,
          avgRenderables: s.builds ? Math.round(s.renderables / s.builds) : 0,
          buildMsPerFrame: +(s.buildMs / Math.max(1, frames)).toFixed(4),
          uploadKBPerFrame: +(s.bytes / 1024 / Math.max(1, frames)).toFixed(2),
          why: [...s.why.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6),
          viewers: [...s.viewers.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12),
          movers: [...s.movers.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12),
        });
      }
      out.sort((a, b) => b.buildMsPerFrame + b.uploadKBPerFrame / 100 - (a.buildMsPerFrame + a.uploadKBPerFrame / 100));
      const total = { buildMsPerFrame: 0, uploadKBPerFrame: 0, buildsPerFrame: 0, groups: out.length };
      for (const g of out) { total.buildMsPerFrame += g.buildMsPerFrame; total.uploadKBPerFrame += g.uploadKBPerFrame; total.buildsPerFrame += g.buildsPerFrame; }
      total.drawsPerFrame = +(draws / Math.max(1, frames)).toFixed(2);
      total.glUploadsPerFrame = +(subCalls / Math.max(1, frames)).toFixed(1);
      total.glUploadKBPerFrame = +(subBytes / 1024 / Math.max(1, frames)).toFixed(1);
      return { frames, total, groups: out };
    },
  };
  return 'ok';
})();
