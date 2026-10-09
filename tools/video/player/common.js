// Shared helpers of the render page: palette, easing, fonts, art loading, text and paper drawing.
// Everything here is a pure function of its arguments (the video is a function of time only), apart from the asset caches.

export const W = 1920;
export const H = 1080;
export const FPS = 30;

/** The game's craft-paper palette (src/ui/theme.ts) as CSS colours. */
export const C = {
  ink: '#4a3222', inkSoft: '#7d5e45', inkMid: '#6b4d38', inkDeep: '#3b2418', onArt: '#fffaf0',
  paper: '#fbf3e2', paperLight: '#fffaee', paperDim: '#edddbb', kraft: '#d9b88a', kraftDark: '#b48f62', track: '#d3bb94',
  wood: '#c48f50', woodDark: '#a06a33', woodLight: '#e0b070', shadow: '#6a4527',
  coral: '#f0796b', coralDark: '#c4544a', teal: '#5fb9c4', tealDark: '#3e9aa6', mustard: '#f0bc43', mustardDark: '#c48f1f',
  leaf: '#7dba5c', leafDark: '#4f8f3a', berry: '#d96579', berryDark: '#a83f56', violet: '#9c84c0', violetDark: '#6f5a96',
  sky: '#4fa3c7', skyDark: '#2f7a9c',
};

/** The four class colours the game uses (kit.ts CLASS_ACCENT) plus a boss red and a neutral. */
export const CLASS = {
  warrior: { main: C.coral, dark: C.coralDark, name: '전사' },
  ranger: { main: C.leaf, dark: C.leafDark, name: '사수' },
  mage: { main: C.sky, dark: C.skyDark, name: '마법' },
  trickster: { main: C.mustard, dark: C.mustardDark, name: '재주' },
  boss: { main: '#8f7fb0', dark: '#5f5080', name: '보스' },
  plain: { main: C.kraft, dark: C.kraftDark, name: '' },
};

/** The patch-notes tags: the big stamp on a change card. */
export const TAGS = {
  buff: { label: '버프', main: C.leaf, dark: C.leafDark, glyph: 'up' },
  nerf: { label: '너프', main: C.berry, dark: C.berryDark, glyph: 'down' },
  adjust: { label: '조정', main: C.mustard, dark: C.mustardDark, glyph: 'diamond' },
  new: { label: '신규', main: C.teal, dark: C.tealDark, glyph: 'star' },
  measure: { label: '측정', main: C.violet, dark: C.violetDark, glyph: 'bars' },
};

export const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const prog = (u, start, dur) => clamp((u - start) / dur);
export const easeOutCubic = (t) => 1 - (1 - t) ** 3;
export const easeInCubic = (t) => t * t * t;
export const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
export const easeOutBack = (t, s = 1.70158) => 1 + (s + 1) * (t - 1) ** 3 + s * (t - 1) ** 2;
export const easeOutElastic = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : 2 ** (-10 * t) * Math.sin(((t * 10 - 0.75) * 2 * Math.PI) / 3) + 1);
/** Deterministic noise in [0,1) from an integer seed. */
export function hash(n) {
  let x = (n | 0) ^ 0x9e3779b9;
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b);
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}

// ───────────── fonts ─────────────
export const FONT = 'GameLatin, GameKR, "Malgun Gothic", sans-serif';
export async function loadFonts() {
  const faces = [new FontFace('GameKR', 'url(/fonts/Jua.ttf)'), new FontFace('GameLatin', 'url(/fonts/LilitaOne.ttf)')];
  await Promise.all(faces.map((f) => f.load()));
  faces.forEach((f) => document.fonts.add(f));
  await document.fonts.ready;
}

// ───────────── art ─────────────
export function artUrl(key) {
  const [kind, name] = key.split(':');
  switch (kind) {
    case 'u': return `/art/units_v2/unit_${name}.png`;
    case 'boss': return `/art/enemies_v2/boss_${name}.png`;
    case 'enemy': return `/art/enemies_v2/enemy_${name}.png`;
    case 'cell': return `/art/cells_v1/cell_${name}.png`;
    case 'icon': return `/art/icons_v2/icon_${name}.png`;
    case 'misc': return `/art/misc_v2/${name}.png`;
    case 'relic': return `/art/icons_v2/relic_${name}.png`;
    case 'fx': return `/img/fx_${name}.webp`;
    case 'img': return `/img/${name}.webp`;
    default: throw new Error('unknown art key ' + key);
  }
}

const ART = new Map();
const MAX_ART = 820;

/** Loads one picture, trims its transparent margin, and keeps a high-quality bitmap plus a flat brown shadow silhouette of it. */
export async function loadArt(key) {
  if (ART.has(key)) return ART.get(key);
  const img = new Image();
  img.src = artUrl(key);
  await img.decode();
  const sw = img.naturalWidth, sh = img.naturalHeight;
  // alpha bounding box on a small copy
  const k = 200 / Math.max(sw, sh);
  const small = document.createElement('canvas');
  small.width = Math.max(1, Math.round(sw * k)); small.height = Math.max(1, Math.round(sh * k));
  const sctx = small.getContext('2d', { willReadFrequently: true });
  sctx.drawImage(img, 0, 0, small.width, small.height);
  const px = sctx.getImageData(0, 0, small.width, small.height).data;
  let x0 = small.width, y0 = small.height, x1 = -1, y1 = -1;
  for (let y = 0; y < small.height; y++) {
    for (let x = 0; x < small.width; x++) {
      if (px[(y * small.width + x) * 4 + 3] > 12) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
  }
  if (x1 < 0) { x0 = 0; y0 = 0; x1 = small.width - 1; y1 = small.height - 1; }
  const pad = 2;
  const cx0 = Math.max(0, Math.floor((x0 - pad) / k)), cy0 = Math.max(0, Math.floor((y0 - pad) / k));
  const cx1 = Math.min(sw, Math.ceil((x1 + 1 + pad) / k)), cy1 = Math.min(sh, Math.ceil((y1 + 1 + pad) / k));
  const cw = cx1 - cx0, ch = cy1 - cy0;
  const s = Math.min(1, MAX_ART / Math.max(cw, ch));
  const bw = Math.max(1, Math.round(cw * s)), bh = Math.max(1, Math.round(ch * s));
  const bitmap = await createImageBitmap(img, cx0, cy0, cw, ch, { resizeWidth: bw, resizeHeight: bh, resizeQuality: 'high' });
  const sh2 = document.createElement('canvas');
  sh2.width = bw; sh2.height = bh;
  const g = sh2.getContext('2d');
  g.drawImage(bitmap, 0, 0);
  g.globalCompositeOperation = 'source-in';
  g.fillStyle = C.shadow;
  g.fillRect(0, 0, bw, bh);
  const gray = document.createElement('canvas');
  gray.width = bw; gray.height = bh;
  const gg = gray.getContext('2d');
  gg.filter = 'grayscale(1) contrast(0.8) brightness(1.15)';
  gg.drawImage(bitmap, 0, 0);
  const art = { key, bitmap, shadow: sh2, gray, w: bw, h: bh, aspect: bw / bh };
  ART.set(key, art);
  return art;
}

export function art(key) {
  const a = ART.get(key);
  if (!a) throw new Error('art not loaded: ' + key);
  return a;
}

/** Fits a picture into a box (maxW x maxH) centred at (cx, cy). opts: {scale, rot, shadow, gray, alpha, flip, bob} */
export function drawArt(ctx, key, cx, cy, maxW, maxH, opts = {}) {
  const a = art(key);
  const fit = Math.min(maxW / a.w, maxH / a.h) * (opts.scale ?? 1);
  const w = a.w * fit, h = a.h * fit;
  ctx.save();
  ctx.translate(cx, cy);
  if (opts.rot) ctx.rotate(opts.rot);
  if (opts.flip) ctx.scale(-1, 1);
  const base = ctx.globalAlpha * (opts.alpha ?? 1);
  if (opts.shadow !== false) {
    ctx.globalAlpha = base * 0.28;
    ctx.drawImage(a.shadow, -w / 2 + 9, -h / 2 + 13, w, h);
  }
  ctx.globalAlpha = base;
  ctx.drawImage(opts.gray ? a.gray : a.bitmap, -w / 2, -h / 2, w, h);
  ctx.restore();
  return { w, h };
}

// ───────────── text ─────────────
export function setFont(ctx, size, family = FONT) {
  ctx.font = `${size}px ${family}`;
}

/**
 * Draws `str` at (x, y). opts: size, fill, stroke, sw (stroke width), align, base, maxW (shrinks the size to fit), alpha, spacing.
 * Returns the width drawn.
 */
export function text(ctx, str, x, y, opts = {}) {
  let size = opts.size ?? 48;
  setFont(ctx, size);
  if (opts.maxW) {
    const w0 = ctx.measureText(str).width;
    if (w0 > opts.maxW) { size = Math.floor(size * (opts.maxW / w0)); setFont(ctx, size); }
  }
  ctx.textAlign = opts.align ?? 'left';
  ctx.textBaseline = opts.base ?? 'alphabetic';
  ctx.lineJoin = 'round';
  ctx.miterLimit = 2;
  const prevAlpha = ctx.globalAlpha;
  if (opts.alpha != null) ctx.globalAlpha *= opts.alpha;
  if (opts.stroke) {
    ctx.strokeStyle = opts.stroke;
    ctx.lineWidth = (opts.sw ?? Math.max(4, size * 0.09)) * 2;
    ctx.strokeText(str, x, y);
  }
  ctx.fillStyle = opts.fill ?? C.ink;
  ctx.fillText(str, x, y);
  const w = ctx.measureText(str).width;
  ctx.globalAlpha = prevAlpha;
  return w;
}

export function measure(ctx, str, size) {
  setFont(ctx, size);
  return ctx.measureText(str).width;
}

/** Greedy wrap on spaces. Returns the lines. */
export function wrap(ctx, str, size, maxW) {
  setFont(ctx, size);
  const words = str.split(' ');
  const lines = [];
  let line = '';
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = w; } else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

// ───────────── shapes ─────────────
export function rr(ctx, x, y, w, h, r) {
  const rad = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}

/** A sheet of paper with the game's flat brown shadow. opts: fill, r, rot, border, bw, shadow (offset), alpha */
export function paper(ctx, x, y, w, h, opts = {}) {
  const r = opts.r ?? 30;
  ctx.save();
  if (opts.alpha != null) ctx.globalAlpha *= opts.alpha;
  const cx = x + w / 2, cy = y + h / 2;
  ctx.translate(cx, cy);
  if (opts.rot) ctx.rotate(opts.rot);
  ctx.translate(-cx, -cy);
  if (opts.shadow !== 0) {
    const so = opts.shadow ?? 12;
    ctx.globalAlpha *= 0.24;
    ctx.fillStyle = C.shadow;
    rr(ctx, x + so, y + so * 1.2, w, h, r);
    ctx.fill();
    ctx.globalAlpha = opts.alpha != null ? opts.alpha : 1;
  }
  ctx.fillStyle = opts.fill ?? C.paperLight;
  rr(ctx, x, y, w, h, r);
  ctx.fill();
  if (opts.border !== null) {
    ctx.lineWidth = opts.bw ?? 5;
    ctx.strokeStyle = opts.border ?? C.paperDim;
    rr(ctx, x + 2, y + 2, w - 4, h - 4, Math.max(2, r - 2));
    ctx.stroke();
  }
  ctx.restore();
}

/** A strip of washi tape (centred at cx, cy). */
export function tape(ctx, cx, cy, w = 190, h = 62, rot = -0.2, color = 'rgba(244,214,150,0.82)') {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rot);
  ctx.fillStyle = color;
  ctx.beginPath();
  const zig = 7;
  ctx.moveTo(-w / 2, -h / 2);
  ctx.lineTo(w / 2, -h / 2);
  for (let y = -h / 2; y < h / 2; y += zig * 2) { ctx.lineTo(w / 2 + zig * 0.6, y + zig); ctx.lineTo(w / 2, y + zig * 2); }
  ctx.lineTo(-w / 2, h / 2);
  for (let y = h / 2; y > -h / 2; y -= zig * 2) { ctx.lineTo(-w / 2 - zig * 0.6, y - zig); ctx.lineTo(-w / 2, y - zig * 2); }
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(160,106,51,0.25)';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();
}

/** A thick arrow pointing right: tail at x, tip at x + len. */
export function arrow(ctx, x, y, len, thick, color, stroke = C.ink) {
  const h = thick, head = thick * 1.7, body = Math.max(4, len - head * 0.7);
  ctx.save();
  ctx.translate(x, y);
  ctx.beginPath();
  ctx.moveTo(0, -h * 0.28);
  ctx.lineTo(body, -h * 0.28);
  ctx.lineTo(body, -head * 0.6);
  ctx.lineTo(len, 0);
  ctx.lineTo(body, head * 0.6);
  ctx.lineTo(body, h * 0.28);
  ctx.lineTo(0, h * 0.28);
  ctx.closePath();
  ctx.lineJoin = 'round';
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = Math.max(4, thick * 0.22); ctx.stroke(); }
  ctx.fillStyle = color;
  ctx.fill();
  ctx.restore();
}

export function star(ctx, cx, cy, r, color, stroke, rot = 0) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rot);
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = (i * Math.PI) / 5 - Math.PI / 2;
    const rad = i % 2 === 0 ? r : r * 0.45;
    ctx.lineTo(Math.cos(a) * rad, Math.sin(a) * rad);
  }
  ctx.closePath();
  ctx.lineJoin = 'round';
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = r * 0.18; ctx.stroke(); }
  ctx.fillStyle = color;
  ctx.fill();
  ctx.restore();
}

/** A paw print: pad plus four toes. */
export function paw(ctx, cx, cy, s, color, stroke = null) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.fillStyle = color;
  const blob = (x, y, rx, ry, rot = 0) => { ctx.beginPath(); ctx.ellipse(x * s, y * s, rx * s, ry * s, rot, 0, Math.PI * 2); if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = s * 0.12; ctx.stroke(); } ctx.fill(); };
  blob(0, 0.28, 0.5, 0.4);
  blob(-0.55, -0.12, 0.2, 0.28, -0.35);
  blob(-0.2, -0.46, 0.2, 0.3, -0.1);
  blob(0.2, -0.46, 0.2, 0.3, 0.1);
  blob(0.55, -0.12, 0.2, 0.28, 0.35);
  ctx.restore();
}

// ───────────── rich text (bold runs and drawn arrows) ─────────────
/**
 * Splits a caption such as "사수 **45%**로 → 끝" into runs. `**` toggles the highlight; "→" becomes a drawn arrow
 * (the game fonts have no arrow glyph, and the fallback font would not match).
 */
export function parseRich(str) {
  const runs = [];
  let hi = false;
  for (const part of str.split('**')) {
    const pieces = part.split('→');
    pieces.forEach((p, i) => {
      if (p) runs.push({ text: p, hi });
      if (i < pieces.length - 1) runs.push({ arrow: true, hi });
    });
    hi = !hi;
  }
  return runs;
}

/** Lays runs out into wrapped lines (items: {w, text?, arrow?, hi}). */
export function layoutRich(ctx, runs, size, maxW) {
  setFont(ctx, size);
  const space = ctx.measureText(' ').width;
  const items = [];
  for (const r of runs) {
    if (r.arrow) { items.push({ arrow: true, hi: r.hi, w: size * 1.05, glue: false }); continue; }
    const parts = r.text.split(/(\s+)/);
    for (const p of parts) {
      if (!p) continue;
      if (/^\s+$/.test(p)) { items.push({ gap: true, w: space * p.length }); continue; }
      items.push({ text: p, hi: r.hi, w: ctx.measureText(p).width });
    }
  }
  // words may be glued across runs when no gap separates them: treat consecutive non-gap items as one unbreakable cluster
  const clusters = [];
  let cur = null;
  for (const it of items) {
    if (it.gap) { if (cur) clusters.push(cur); clusters.push(it); cur = null; } else { if (!cur) cur = { items: [], w: 0 }; cur.items.push(it); cur.w += it.w; }
  }
  if (cur) clusters.push(cur);
  const lines = [];
  let line = { items: [], w: 0 };
  for (const c of clusters) {
    if (c.gap) { if (line.items.length) { line.items.push({ gap: true, w: c.w }); line.w += c.w; } continue; }
    if (line.w + c.w > maxW && line.items.length) {
      while (line.items.length && line.items[line.items.length - 1].gap) { line.w -= line.items.pop().w; }
      lines.push(line);
      line = { items: [], w: 0 };
    }
    for (const it of c.items) line.items.push(it);
    line.w += c.w;
  }
  while (line.items.length && line.items[line.items.length - 1].gap) { line.w -= line.items.pop().w; }
  if (line.items.length) lines.push(line);
  return lines;
}

export function drawRichLine(ctx, line, x, y, size, colors) {
  setFont(ctx, size);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  let cx = x;
  for (const it of line.items) {
    if (it.gap) { cx += it.w; continue; }
    const col = it.hi ? colors.hi : colors.fill;
    if (it.arrow) {
      arrow(ctx, cx + size * 0.08, y - size * 0.3, size * 0.9, size * 0.42, col, null);
    } else {
      ctx.fillStyle = col;
      ctx.fillText(it.text, cx, y);
    }
    cx += it.w;
  }
}

// ───────────── numbers ─────────────
export function fmtNum(v, dec = 0, comma = false) {
  const n = Number(v.toFixed(dec));
  const s = dec > 0 ? n.toFixed(dec) : String(Math.round(n));
  if (!comma) return s;
  const [i, f] = s.split('.');
  return i.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (f ? '.' + f : '');
}
