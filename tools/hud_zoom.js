// Zoomed capture of any rectangle of the design space, for judging a layout like a ruler would (a 1x still hides faults of
// a few pixels). Prepended to a script by tools/hud_zoom.sh after tools/battle_motion.js, so the runner prelude (openGame,
// ev, tap, ...) and the mc* helpers (mcOpen, mcWarp, mcCat, mcMouse ...) are there too.
//
//   await hzShot(name, [x, y, w, h], zoom = 3, opts)   PNG of that design rectangle at `zoom` px per design px, with a ruler
//                                                      in the margins (design coordinates, a tick every `tick` px); opts.ruler = false
//   await hzTall(true | false)                          the 720 x 1600 screen (a 360 x 800 viewport) and back to the real one
//   await hzTexts([x, y, w, h])                         every visible Text whose centre is in the rectangle: [string, x, y, w, h, effective size]
//   await hzRects(fn, arg)                              run `fn(game, dbg, arg)` in the page and return its value (JSON), for measurements
//   await hzOpen(query, wave = 0)                       mcOpen + hzQuiet, then (wave > 0) play on with the bot to that wave and settle
//   await hzQuiet()                                     mark every guidebook topic read and answer a first-encounter card that is already up
//   await hzTap(x, y)                                   a real press and release at design coordinates
//   await hzToyChoice()                                 play the run on with the field emptied until the toy choice opens (wave 4's end)
//   await hzAudit(scope = 'stage' | 'popup')            texts that leave their paper by more than 3 px, are cut by the screen or overlap another
//   await hzPick(lang = 'ko', query = '')               a sandbox battle with five cats and the pick of three open (six summons)
//   await hzButton(caption)                             every shown or hidden kit Button with that caption: { vis, x, y, w, h } at its centre, design px
//   await hzBattle()                                    what the battle holds: pending choice, cats, fish, pause reasons, popup layer size, page errors
//
// How: the renderer is given resolution = zoom / scale, the canvas is cut down to the rectangle's size and the root container is
// moved so the rectangle sits at the canvas origin; one render, one read of the canvas, everything put back before the page
// gets a frame (no await between the first change and the restore).
async function hzShot(name, region, zoom = 3, opts = {}) {
  const url = await ev(
    ([region, zoom, opts]) => {
      const g = window.__dbg.game;
      const r = g.app.renderer;
      const [x, y, w, h] = region;
      const s = g.scale;
      const keep = { res: r.resolution, w: r.screen.width, h: r.screen.height, px: g.root.x, py: g.root.y };
      try {
        r.resolution = zoom / s;
        r.resize(Math.round(w * s), Math.round(h * s));
        g.root.position.set(-x * s, -y * s);
        g.app.render();
        const src = r.canvas;
        const ruler = opts.ruler !== false;
        const tick = opts.tick || (zoom >= 3 ? 20 : 40);
        const M = ruler ? 34 : 0;
        const out = document.createElement('canvas');
        out.width = src.width + M;
        out.height = src.height + M;
        const c = out.getContext('2d');
        c.fillStyle = '#1b1b1b';
        c.fillRect(0, 0, out.width, out.height);
        c.drawImage(src, M, M);
        if (ruler) {
          c.font = '12px monospace';
          c.fillStyle = '#8be9fd';
          c.strokeStyle = '#8be9fd';
          c.lineWidth = 1;
          const k = src.width / w;
          for (let v = Math.ceil(x / tick) * tick; v <= x + w; v += tick) {
            const px = M + (v - x) * k;
            c.beginPath();
            c.moveTo(px + 0.5, M - 8);
            c.lineTo(px + 0.5, M);
            c.stroke();
            c.fillText(String(v), px - 10, M - 12);
          }
          for (let v = Math.ceil(y / tick) * tick; v <= y + h; v += tick) {
            const py = M + (v - y) * k;
            c.beginPath();
            c.moveTo(M - 8, py + 0.5);
            c.lineTo(M, py + 0.5);
            c.stroke();
            c.fillText(String(v), 0, py + 4);
          }
        }
        return out.toDataURL('image/png');
      } finally {
        r.resolution = keep.res;
        r.resize(keep.w, keep.h);
        g.root.position.set(keep.px, keep.py);
        g.app.render();
      }
    },
    [region, zoom, opts],
  );
  await fs.mkdir('./shots', { recursive: true });
  await fs.writeFile('./shots/' + name + '.png', Buffer.from(url.split(',')[1], 'base64'));
  console.log('ZOOM ' + name);
}

async function hzTall(on) {
  await ev((on) => {
    const g = window.__dbg.game;
    if (!window.__hzVV) window.__hzVV = Object.getOwnPropertyDescriptor(window, 'visualViewport') || null;
    if (on) Object.defineProperty(window, 'visualViewport', { value: { width: 360, height: 800, addEventListener() {} }, configurable: true });
    else if (window.__hzVV) Object.defineProperty(window, 'visualViewport', window.__hzVV);
    else delete window.visualViewport;
    g.layout();
    g.app.render();
  }, on);
  await mcWarp(0.3);
}

async function hzTexts(region) {
  return await ev((region) => {
    const g = window.__dbg.game;
    const [x, y, w, h] = region;
    const out = [];
    const walk = (n) => {
      if (!n.visible || n.worldAlpha === 0) return;
      if (n.constructor && /Text$/.test(n.constructor.name) && n.text !== undefined && String(n.text).length) {
        const b = n.getBounds();
        const bx = b.x / g.scale;
        const by = b.y / g.scale;
        const bw = b.width / g.scale;
        const bh = b.height / g.scale;
        const cx = bx + bw / 2;
        const cy = by + bh / 2;
        if (cx >= x && cx <= x + w && cy >= y && cy <= y + h) {
          const wt = n.worldTransform;
          const k = Math.hypot(wt.a, wt.b) / g.scale;
          out.push([String(n.text).slice(0, 24), Math.round(bx * 10) / 10, Math.round(by * 10) / 10, Math.round(bw * 10) / 10, Math.round(bh * 10) / 10, Math.round(n.style.fontSize * k * 10) / 10]);
        }
      }
      for (const c of n.children || []) walk(c);
    };
    walk(g.app.stage);
    return out;
  }, region);
}

async function hzRects(fn, arg) {
  return await ev(({ src, arg }) => (new Function('game', 'dbg', 'arg', 'return (' + src + ')(game, dbg, arg)'))(window.__dbg.game, window.__dbg, arg), { src: fn.toString(), arg });
}

async function hzQuiet() {
  await ev(async ([L, R]) => {
    const resolve = (0, eval)(R);
    const m = await new Function('u', L)(resolve('/src/guide/topics.ts'));
    for (const t of m.TOPIC_LIST) window.__dbg.lessons.progress.markRead(t.id);
  }, [LOADER, RESOLVE]);
  // A card that is already up (the first one arrives with the scene) is answered with a real press of its "got it".
  for (let i = 0; i < 3 && (await ev(() => window.__dbg.lessons.card())); i++) {
    const btn = (await hzTexts([0, 0, 720, 1600])).find((tx) => tx[0] === '알겠어요' || tx[0] === 'Got it');
    if (!btn) break;
    await mcMouse('down', btn[1] + btn[3] / 2, btn[2] + btn[4] / 2);
    await mcMouse('up', 0, 0);
    await mcWarp(0.6);
  }
}

async function hzOpen(query, wave = 0) {
  await mcOpen(query);
  await hzQuiet();
  if (wave > 0) {
    await ev((w) => window.__dbg.battle.skipToWave(w), wave);
    await mcWarp(1.5);
  }
}

async function hzTap(x, y) {
  await mcMouse('down', x, y);
  await mcMouse('up', 0, 0);
  await mcWarp(0.5);
}

async function hzToyChoice() {
  await ev(async ([L, R]) => {
    const resolve = (0, eval)(R);
    const en = await new Function('u', L)(resolve('/src/game/sim/enemies.ts'));
    const b = window.__dbg.battle.battle;
    for (let i = 0; i < 4000 && !(b.phase === 'choice' && b.pending && b.pending.kind === 'relic'); i++) {
      for (const e of b.enemies.slice()) {
        if (e.isBoss || e.isElite) en.killEnemy(b, e, null);
        else en.removeEnemy(b, e);
      }
      b.step(0.25);
    }
  }, [LOADER, RESOLVE]);
  await mcWarp(2.5);
}

async function hzAudit(scope = 'stage') {
  return await ev((scope) => {
    const game = window.__dbg.game;
    const k = game.scale;
    const W = game.w;
    const H = game.h;
    const top = () => {
      const ch = game.popupLayer.children.filter((c) => c.visible && c.alpha > 0.5 && (c.children || []).length > 0);
      return ch[ch.length - 1] || game.popupLayer;
    };
    const root = scope === 'popup' ? top() : game.app.stage;
    const shown = (o) => {
      for (let p = o; p; p = p.parent) if (!p.visible || p.alpha <= 0.05 || p.renderable === false) return false;
      return true;
    };
    const box = (o) => {
      const r = o.getBounds();
      return { x: r.x / k, y: r.y / k, w: r.width / k, h: r.height / k };
    };
    const texts = [];
    const out = [];
    const walk = (o) => {
      if (!o.visible || o.alpha <= 0.05) return;
      if (o.constructor.name === 'Text' && typeof o.text === 'string' && o.text.trim() && o.width > 0 && shown(o)) texts.push(o);
      for (const c of o.children || []) walk(c);
    };
    walk(root);
    const inter = (a, b) => ({ w: Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), h: Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) });
    for (const t of texts) {
      const b = box(t);
      if (b.x < -2 || b.y < -2 || b.x + b.w > W + 2 || b.y + b.h > H + 2) out.push({ kind: 'offscreen', text: t.text.slice(0, 24), box: [b.x, b.y, b.w, b.h].map(Math.round) });
      let paper = null;
      for (let p = t.parent; p && !paper; p = p.parent) {
        const kids = p.children || [];
        const at = kids.findIndex((c) => { for (let q = t; q; q = q.parent) if (q === c) return true; return false; });
        for (let i = 0; i < Math.max(0, at); i++) {
          const s = kids[i];
          const sn = s.constructor.name;
          if (!s.visible || s.alpha <= 0.05 || !(sn === 'Graphics' || sn === 'Sprite' || sn === 'NineSliceSprite' || sn === 'Panel')) continue;
          const sb = box(s);
          const cx = b.x + b.w / 2;
          const cy = b.y + b.h / 2;
          if (sb.w > b.w * 0.6 && sb.h > b.h * 0.6 && cx >= sb.x && cx <= sb.x + sb.w && cy >= sb.y && cy <= sb.y + sb.h && sb.w < W * 1.05) paper = sb;
        }
      }
      if (paper) {
        const over = Math.max(paper.x - b.x, b.x + b.w - (paper.x + paper.w), paper.y - b.y, b.y + b.h - (paper.y + paper.h));
        if (over > 3) out.push({ kind: 'out-of-paper', text: t.text.slice(0, 24), by: Math.round(over), box: [b.x, b.y, b.w, b.h].map(Math.round), paper: [paper.x, paper.y, paper.w, paper.h].map(Math.round) });
      }
    }
    for (let i = 0; i < texts.length; i++) {
      for (let j = i + 1; j < texts.length; j++) {
        const a = box(texts[i]);
        const b = box(texts[j]);
        const r = inter(a, b);
        if (r.w > 4 && r.h > 8) out.push({ kind: 'overlap', a: texts[i].text.slice(0, 18), b: texts[j].text.slice(0, 18), by: [Math.round(r.w), Math.round(r.h)], at: [Math.round(a.x), Math.round(a.y)] });
      }
    }
    return out;
  }, scope);
}

async function hzPick(lang = 'ko', query = '') {
  await hzOpen('?scene=battle&chapter=1&seed=7&sandbox=1&runs=5&debug=1&lang=' + lang + query);
  await ev(() => {
    const d = window.__dbg.battle;
    d.give(900, 50);
    for (let i = 0; i < 6; i++) d.ctx.command('summon', () => d.battle.summon());
  });
  await mcWarp(2);
}

async function hzButton(caption) {
  return await ev((cap) => {
    const g = window.__dbg.game;
    const k = g.scale;
    const out = [];
    const walk = (n) => {
      if (n.caption === cap) {
        let vis = true;
        for (let p = n; p; p = p.parent) if (p.visible === false) vis = false;
        const b = n.getBounds();
        out.push({ vis, x: Math.round((b.x + b.width / 2) / k), y: Math.round((b.y + b.height / 2) / k), w: Math.round(b.width / k), h: Math.round(b.height / k) });
      }
      for (const c of n.children || []) walk(c);
    };
    walk(g.app.stage);
    return out;
  }, caption);
}

async function hzBattle() {
  return await ev(() => {
    const d = window.__dbg.battle;
    const b = d.battle;
    return { pending: b.pending ? b.pending.kind : null, cats: b.units.filter(Boolean).length, cells: b.units.map((u, i) => (u ? i : -1)).filter((i) => i >= 0), fish: b.fish, reasons: d.scene.pauseReasons(), popups: window.__dbg.game.popupLayer.children.length, errors: (window.__errors || []).length };
  });
}
