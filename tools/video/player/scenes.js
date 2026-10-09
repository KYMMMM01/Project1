// Every picture of the video is drawn here: drawFrame(ctx, t, S) is a pure function of the time t (seconds) and of the script/timeline.
import {
  W, H, C, CLASS, TAGS, FONT, clamp, lerp, prog, easeOutCubic, easeInCubic, easeInOut, easeOutBack, easeOutElastic, hash,
  art, drawArt, loadArt, text, measure, wrap, rr, paper, tape, arrow, star, paw, setFont, parseRich, layoutRich, drawRichLine, fmtNum,
} from './common.js';

// ───────────────────────── state ─────────────────────────
export function makeState(script, timeline) {
  const byId = new Map(timeline.cards.map((c) => [c.id, c]));
  const cards = script.cards.map((sc, index) => ({ ...sc, ...byId.get(sc.id), index }));
  const chapters = new Map(script.chapters.map((c) => [c.id, c]));
  const chapterStart = new Map();
  for (const c of cards) if (c.chapter && !chapterStart.has(c.chapter)) chapterStart.set(c.chapter, c.start);
  return { script, tl: timeline, cards, chapters, chapterStart, caches: {} };
}

/** Every art key the script uses (so the page can load them before the first frame). */
export function artKeys(script) {
  const keys = new Set();
  const walk = (o, key) => {
    if (typeof o === 'string') {
      if (/^(u|boss|enemy|cell|icon|misc|relic|fx|img):[a-z0-9_]+$/.test(o)) keys.add(o);
    } else if (Array.isArray(o)) o.forEach((x) => walk(x, key));
    else if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) walk(v, k);
  };
  walk(script.cards); walk(script.chapters);
  ['u:w_paw', 'u:w_sword', 'u:r_sling', 'u:m_snow', 'u:t_chef', 'u:m_fire', 'u:r_archer', 'enemy:cucumber', 'icon:fish', 'icon:gold', 'icon:gem', 'icon:ticket', 'misc:icon_purr', 'misc:keyart_title', 'u:t_bell'].forEach((k) => keys.add(k));
  return [...keys];
}

const cardAt = (S, t) => {
  const cs = S.cards;
  let lo = 0, hi = cs.length - 1;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (cs[mid].start <= t + 1e-9) lo = mid; else hi = mid - 1; }
  return cs[lo];
};

// ───────────────────────── frame ─────────────────────────
const DIRS = [{ x: 0, y: 1, r: 0.07 }, { x: 1, y: 0.1, r: -0.06 }, { x: 0, y: -1, r: -0.05 }, { x: -1, y: 0.1, r: 0.06 }];

export function drawFrame(ctx, t, S, opts = {}) {
  t = clamp(t, 0, S.tl.total - 1e-6);
  const c = cardAt(S, t);
  const u = t - c.start;
  const enter = S.script.timing.enter ?? 0.4;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  drawFloor(ctx, t, S);
  if (c.index > 0 && u < enter) {
    const p = S.cards[c.index - 1];
    drawPage(ctx, p, p.dur + u, S, t, false);
  }
  drawPage(ctx, c, u, S, t, true);
  drawHud(ctx, c, u, S, t, opts);
  if (!opts.noCaption) drawCaption(ctx, c, u, S);
  // closing fade
  const fadeLen = 0.9, left = S.tl.total - t;
  if (left < fadeLen && !opts.noFade) {
    ctx.globalAlpha = clamp(1 - left / fadeLen) * 0.9;
    ctx.fillStyle = C.inkDeep;
    ctx.fillRect(0, 0, W, H);
  }
  ctx.restore();
}

// ───────────────────────── floor and sheets ─────────────────────────
function floorTile() {
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = 720;
  const g = cv.getContext('2d');
  const tones = ['#c48f50', '#cb9758', '#bd8749', '#c8924f'];
  for (let r = 0; r < 4; r++) {
    const y = r * 180;
    g.fillStyle = tones[r];
    g.fillRect(0, y, W, 180);
    // grain
    for (let k = 0; k < 9; k++) {
      const yy = y + 14 + hash(r * 50 + k) * 150;
      g.strokeStyle = k % 2 ? 'rgba(160,106,51,0.22)' : 'rgba(224,176,112,0.28)';
      g.lineWidth = 2 + hash(r * 70 + k) * 3;
      g.beginPath();
      const ph = hash(r * 13 + k) * 6;
      for (let x = 0; x <= W; x += 40) { const ypos = yy + Math.sin(x * 0.004 + ph) * 7; if (x === 0) g.moveTo(x, ypos); else g.lineTo(x, ypos); }
      g.stroke();
    }
    // butt joints
    for (let j = 0; j < 2; j++) {
      const x = 200 + hash(r * 11 + j) * 1500;
      g.fillStyle = 'rgba(122,78,34,0.55)';
      g.fillRect(x, y, 5, 180);
    }
    // seam
    g.fillStyle = 'rgba(122,78,34,0.7)';
    g.fillRect(0, y, W, 6);
    g.fillStyle = 'rgba(255,230,180,0.25)';
    g.fillRect(0, y + 6, W, 3);
  }
  return cv;
}

function vignette() {
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  const grad = g.createRadialGradient(W / 2, H / 2, H * 0.45, W / 2, H / 2, H * 0.95);
  grad.addColorStop(0, 'rgba(60,34,16,0)');
  grad.addColorStop(1, 'rgba(60,34,16,0.38)');
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);
  return cv;
}

function drawFloor(ctx, t, S) {
  const k = S.caches;
  if (!k.floor) { k.floor = floorTile(); k.vig = vignette(); }
  const off = (t * 14) % 720;
  ctx.drawImage(k.floor, 0, -off);
  ctx.drawImage(k.floor, 0, 720 - off);
  ctx.drawImage(k.floor, 0, 1440 - off);
  ctx.drawImage(k.vig, 0, 0);
}

const SHEET = {
  hook: '#f0796b', outro: '#d3ebea',
  balance: '#f9d9cf', system: '#d3ebea', content: '#f8e7b5',
  chapterBalance: '#f0796b', chapterSystem: '#5fb9c4', chapterContent: '#f0bc43',
};

function dotPattern(ctx, S, color) {
  const k = S.caches;
  k.pat = k.pat || {};
  if (!k.pat[color]) {
    const cv = document.createElement('canvas');
    cv.width = 64; cv.height = 64;
    const g = cv.getContext('2d');
    g.fillStyle = 'rgba(255,250,240,0.38)';
    g.beginPath(); g.arc(16, 16, 4.5, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.arc(48, 48, 4.5, 0, Math.PI * 2); g.fill();
    k.pat[color] = ctx.createPattern(cv, 'repeat');
  }
  return k.pat[color];
}

function sheetColor(c) {
  if (c.kind === 'hook') return SHEET.hook;
  if (c.kind === 'outro') return SHEET.outro;
  if (c.kind === 'chapter') return SHEET['chapter' + c.chapter[0].toUpperCase() + c.chapter.slice(1)];
  return SHEET[c.chapter] || SHEET.balance;
}

function drawSheet(ctx, c, S) {
  const col = sheetColor(c);
  paper(ctx, 50, 45, 1820, 990, { fill: col, r: 46, border: null, shadow: 16 });
  ctx.save();
  rr(ctx, 50, 45, 1820, 990, 46);
  ctx.clip();
  ctx.fillStyle = dotPattern(ctx, S, col);
  ctx.fillRect(50, 45, 1820, 990);
  ctx.restore();
  ctx.save();
  ctx.setLineDash([24, 18]);
  ctx.lineCap = 'round';
  ctx.lineWidth = 5;
  ctx.strokeStyle = 'rgba(255,250,240,0.8)';
  rr(ctx, 78, 73, 1764, 934, 32);
  ctx.stroke();
  ctx.restore();
}

function drawPage(ctx, c, u, S, t, entering) {
  const enter = S.script.timing.enter ?? 0.4;
  ctx.save();
  const dir = DIRS[c.index % DIRS.length];
  const e = entering && c.index > 0 && u < enter ? easeOutBack(clamp(u / enter), 1.0) : 1;
  const k = 1 - e;
  ctx.translate(W / 2 + dir.x * k * W * 1.15, H / 2 + dir.y * k * H * 1.25);
  ctx.rotate(dir.r * k);
  ctx.translate(-W / 2, -H / 2);
  drawSheet(ctx, c, S);
  // camera push and a thud when the stamp lands
  const push = 1 + 0.032 * clamp(u / c.dur);
  const hit = c.tag ? 0.68 : 0.5;
  const d = u - hit;
  let sx = 0, sy = 0;
  if (d > 0 && d < 0.5) { const amp = 9 * Math.exp(-d * 13); sx = Math.sin(d * 75) * amp; sy = Math.cos(d * 91) * amp * 0.7; }
  ctx.translate(W / 2 + sx, H / 2 - 20 + sy);
  ctx.scale(push, push);
  ctx.translate(-W / 2, -(H / 2 - 20));
  const fn = SCENES[c.kind];
  if (!fn) throw new Error('no scene for ' + c.kind);
  fn(ctx, c, u, S, t);
  ctx.restore();
}

// ───────────────────────── HUD and captions ─────────────────────────
function drawHud(ctx, c, u, S, t, opts) {
  // channel bug (always)
  const name = S.script.meta.channel.name;
  setFont(ctx, 44);
  const nw = ctx.measureText(name).width;
  const bw = nw + 120, bx = 1830 - bw, by = 92;
  paper(ctx, bx, by, bw, 68, { fill: C.paperLight, r: 22, shadow: 6, border: C.kraft, bw: 4 });
  ctx.fillStyle = C.coral;
  ctx.beginPath(); ctx.arc(bx + 38, by + 34, 26, 0, Math.PI * 2); ctx.fill();
  ctx.lineWidth = 4; ctx.strokeStyle = C.coralDark; ctx.stroke();
  paw(ctx, bx + 38, by + 36, 22, C.onArt);
  text(ctx, name, bx + 78, by + 49, { size: 44, fill: C.ink });
  // section chip
  if (c.chapter && !opts.noSection) {
    const ch = S.chapters.get(c.chapter);
    const col = ch.color === 'coral' ? C.coral : ch.color === 'teal' ? C.teal : C.mustard;
    const dark = ch.color === 'coral' ? C.coralDark : ch.color === 'teal' ? C.tealDark : C.mustardDark;
    const label = ch.title;
    setFont(ctx, 46);
    const lw = ctx.measureText(label).width;
    const w = lw + 130;
    paper(ctx, 92, 92, w, 68, { fill: col, r: 22, shadow: 6, border: dark, bw: 4 });
    ctx.fillStyle = C.paperLight;
    ctx.beginPath(); ctx.arc(92 + 38, 126, 26, 0, Math.PI * 2); ctx.fill();
    text(ctx, ch.no, 92 + 38, 126 + 1, { size: 36, fill: dark, align: 'center', base: 'middle' });
    text(ctx, label, 92 + 78, 92 + 49, { size: 46, fill: C.onArt, stroke: C.inkDeep, sw: 5 });
    if (c.since) {
      const sx = 92 + w + 20;
      setFont(ctx, 44);
      const sw = ctx.measureText(c.since).width + 44;
      ctx.save();
      ctx.translate(sx + sw / 2, 126);
      ctx.rotate(-0.025);
      paper(ctx, -sw / 2, -34, sw, 68, { fill: 'rgba(244,214,150,0.95)', r: 10, shadow: 4, border: C.kraftDark, bw: 3 });
      text(ctx, c.since, 0, 15, { size: 44, fill: C.inkMid, align: 'center' });
      ctx.restore();
    }
  }
}

function drawCaption(ctx, c, u, S) {
  const lead = (c.narrStart - c.start);
  const a = easeOutCubic(prog(u, lead - 0.12, 0.18));
  if (a <= 0) return;
  const runs = parseRich(c.caption);
  const size = 52, maxW = 1740 - 88;
  const lines = layoutRich(ctx, runs, size, maxW);
  const lh = 62;
  const hBand = lines.length * lh + 26;
  const y1 = 990, y0 = y1 - hBand;
  const widest = Math.max(...lines.map((l) => l.w));
  const bw = Math.min(1740, widest + 88);
  const bx = (W - bw) / 2;
  ctx.save();
  ctx.globalAlpha *= a;
  ctx.translate(0, (1 - a) * 22);
  ctx.fillStyle = 'rgba(59,36,24,0.9)';
  rr(ctx, bx, y0, bw, hBand, 28);
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = 'rgba(255,250,240,0.22)';
  rr(ctx, bx + 5, y0 + 5, bw - 10, hBand - 10, 24);
  ctx.stroke();
  lines.forEach((ln, i) => {
    const x = (W - ln.w) / 2;
    drawRichLine(ctx, ln, x, y0 + 13 + 48 + i * lh - 4, size, { fill: C.onArt, hi: C.mustard });
  });
  ctx.restore();
}

// ───────────────────────── building blocks ─────────────────────────
const tagCache = new Map();
function tagCanvas(tagKey) {
  if (tagCache.has(tagKey)) return tagCache.get(tagKey);
  const tag = TAGS[tagKey];
  const w = 360, h = 160, pad = 14;
  const cv = document.createElement('canvas');
  cv.width = w + pad * 2; cv.height = h + pad * 2;
  const g = cv.getContext('2d');
  g.translate(pad, pad);
  // body
  g.fillStyle = tag.main;
  rr(g, 0, 0, w, h, 34); g.fill();
  g.lineWidth = 9; g.strokeStyle = tag.dark; rr(g, 4, 4, w - 8, h - 8, 31); g.stroke();
  g.lineWidth = 3; g.strokeStyle = 'rgba(255,250,240,0.75)'; rr(g, 17, 17, w - 34, h - 34, 22); g.stroke();
  // glyph
  const gx = 70, gy = h / 2;
  g.fillStyle = C.onArt; g.strokeStyle = tag.dark; g.lineWidth = 7; g.lineJoin = 'round';
  g.beginPath();
  if (tag.glyph === 'up') { g.moveTo(gx, gy - 34); g.lineTo(gx + 36, gy + 26); g.lineTo(gx - 36, gy + 26); g.closePath(); g.stroke(); g.fill(); }
  else if (tag.glyph === 'down') { g.moveTo(gx, gy + 34); g.lineTo(gx + 36, gy - 26); g.lineTo(gx - 36, gy - 26); g.closePath(); g.stroke(); g.fill(); }
  else if (tag.glyph === 'diamond') { g.moveTo(gx, gy - 38); g.lineTo(gx + 34, gy); g.lineTo(gx, gy + 38); g.lineTo(gx - 34, gy); g.closePath(); g.stroke(); g.fill(); }
  else if (tag.glyph === 'star') { g.beginPath(); for (let i = 0; i < 10; i++) { const a = (i * Math.PI) / 5 - Math.PI / 2; const r = i % 2 === 0 ? 40 : 18; g.lineTo(gx + Math.cos(a) * r, gy + Math.sin(a) * r); } g.closePath(); g.stroke(); g.fill(); }
  else { for (let i = 0; i < 3; i++) { const bh = 24 + i * 16; g.beginPath(); g.rect(gx - 38 + i * 28, gy + 32 - bh, 20, bh); g.stroke(); g.fill(); } }
  // label
  g.font = `104px ${FONT}`;
  g.textAlign = 'left'; g.textBaseline = 'alphabetic';
  g.lineJoin = 'round'; g.strokeStyle = tag.dark; g.lineWidth = 16; g.strokeText(tag.label, 128, h / 2 + 36);
  g.fillStyle = C.onArt; g.fillText(tag.label, 128, h / 2 + 36);
  // worn ink
  g.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 70; i++) {
    g.globalAlpha = 0.22 + hash(i * 3 + 1) * 0.3;
    g.beginPath(); g.arc(hash(i * 7) * w, hash(i * 11 + 5) * h, 1.5 + hash(i * 13) * 4, 0, Math.PI * 2); g.fill();
  }
  tagCache.set(tagKey, cv);
  return cv;
}

/** The stamp of a change: slams down at startU. */
function drawTag(ctx, tagKey, cx, cy, u, startU, rot = -0.1, scale = 1) {
  const p = prog(u, startU, 0.2);
  if (p <= 0) return;
  const cv = tagCanvas(tagKey);
  const s = lerp(2.8, 1, easeInCubic(p)) * scale;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rot + (1 - p) * 0.5);
  ctx.globalAlpha *= clamp(p * 3);
  ctx.scale(s, s);
  ctx.globalAlpha *= 0.25;
  ctx.fillStyle = C.shadow;
  ctx.drawImage(cv, -cv.width / 2 + 8, -cv.height / 2 + 12);
  ctx.globalAlpha = clamp(p * 3);
  ctx.drawImage(cv, -cv.width / 2, -cv.height / 2);
  ctx.restore();
  // burst ring after landing
  const q = prog(u, startU + 0.2, 0.4);
  if (q > 0 && q < 1) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.globalAlpha *= (1 - q) * 0.7;
    ctx.strokeStyle = TAGS[tagKey].main;
    ctx.lineWidth = 10 * (1 - q) + 2;
    rr(ctx, -190 * scale - q * 60, -85 * scale - q * 40, 380 * scale + q * 120, 170 * scale + q * 80, 44);
    ctx.stroke();
    ctx.restore();
  }
}

const pop = (u, start, dur = 0.45) => easeOutBack(prog(u, start, dur), 1.5);

function withPop(ctx, cx, cy, u, start, fn, dur = 0.45) {
  const p = prog(u, start, dur);
  if (p <= 0) return;
  const s = easeOutBack(p, 1.5);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(s, s);
  ctx.translate(-cx, -cy);
  ctx.globalAlpha *= clamp(p * 4);
  fn();
  ctx.restore();
}

function slideIn(ctx, u, start, dy, fn, dur = 0.35) {
  const p = prog(u, start, dur);
  if (p <= 0) return;
  const e = easeOutCubic(p);
  ctx.save();
  ctx.globalAlpha *= clamp(p * 3);
  ctx.translate(0, (1 - e) * dy);
  fn();
  ctx.restore();
}

function chip(ctx, label, x, y, opts = {}) {
  const size = opts.size ?? 44;
  setFont(ctx, size);
  const w = ctx.measureText(label).width + (opts.padX ?? 26) * 2;
  const h = opts.h ?? size + 20;
  if (opts.draw !== false) {
    paper(ctx, x, y, w, h, { fill: opts.fill ?? C.kraft, r: h / 2.4, shadow: opts.shadow ?? 5, border: opts.border ?? C.kraftDark, bw: 3 });
    if (opts.strike) { ctx.strokeStyle = C.berryDark; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(x + 10, y + h * 0.55); ctx.lineTo(x + w - 10, y + h * 0.45); ctx.stroke(); }
    text(ctx, label, x + w / 2, y + h / 2 + size * 0.36, { size, fill: opts.color ?? C.ink, stroke: opts.stroke, sw: 4, align: 'center' });
  }
  return { w, h };
}

function check(ctx, cx, cy, r, color, stroke, p = 1) {
  ctx.save();
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const pts = [[-0.55, 0.05], [-0.15, 0.45], [0.6, -0.5]];
  const draw = (lw, col) => {
    ctx.strokeStyle = col; ctx.lineWidth = lw;
    ctx.beginPath();
    const seg1 = clamp(p / 0.4), seg2 = clamp((p - 0.4) / 0.6);
    ctx.moveTo(cx + pts[0][0] * r, cy + pts[0][1] * r);
    ctx.lineTo(lerp(cx + pts[0][0] * r, cx + pts[1][0] * r, seg1), lerp(cy + pts[0][1] * r, cy + pts[1][1] * r, seg1));
    if (seg2 > 0) ctx.lineTo(lerp(cx + pts[1][0] * r, cx + pts[2][0] * r, seg2), lerp(cy + pts[1][1] * r, cy + pts[2][1] * r, seg2));
    ctx.stroke();
  };
  if (stroke) draw(r * 0.5, stroke);
  draw(r * 0.3, color);
  ctx.restore();
}

function cross(ctx, cx, cy, r, color, stroke, p = 1) {
  ctx.save();
  ctx.lineCap = 'round';
  const draw = (lw, col) => {
    ctx.strokeStyle = col; ctx.lineWidth = lw;
    const a = clamp(p / 0.5), b = clamp((p - 0.5) / 0.5);
    ctx.beginPath(); ctx.moveTo(cx - r, cy - r); ctx.lineTo(lerp(cx - r, cx + r, a), lerp(cy - r, cy + r, a)); ctx.stroke();
    if (b > 0) { ctx.beginPath(); ctx.moveTo(cx + r, cy - r); ctx.lineTo(lerp(cx + r, cx - r, b), lerp(cy - r, cy + r, b)); ctx.stroke(); }
  };
  if (stroke) draw(r * 0.62, stroke);
  draw(r * 0.4, color);
  ctx.restore();
}

function goodColor(good, tag) {
  if (good === true) return { fill: C.leaf, dark: C.leafDark };
  if (good === false) return { fill: C.berry, dark: C.berryDark };
  if (good === null || good === undefined) {
    if (tag === 'buff') return { fill: C.leaf, dark: C.leafDark };
    if (tag === 'nerf') return { fill: C.berry, dark: C.berryDark };
  }
  return { fill: C.teal, dark: C.tealDark };
}

// ───────────────────────── rows of an info card ─────────────────────────
function rowHeight(ctx, row, w) {
  if (row.t === 'num') return row.size === 'big' ? 204 : 140;
  if (row.t === 'text') return 138;
  const lines = layoutRich(ctx, parseRich(row.text), 44, w).length;
  return 18 + lines * 54;
}

/** One animated "old -> new" row. y is its top. Returns nothing; the caller advanced by rowHeight. */
function drawRow(ctx, row, x, y, w, u, start, tagKey) {
  const a = prog(u, start, 0.3);
  if (a <= 0) return;
  ctx.save();
  ctx.globalAlpha *= clamp(a * 2.5);
  ctx.translate(0, (1 - easeOutCubic(a)) * 26);
  if (row.t === 'note') {
    const lines = layoutRich(ctx, parseRich(row.text), 44, w);
    lines.forEach((ln, i) => drawRichLine(ctx, ln, x, y + 44 + i * 54, 44, { fill: C.inkSoft, hi: C.inkSoft }));
    ctx.restore();
    return;
  }
  text(ctx, row.label, x, y + 40, { size: 44, fill: C.inkSoft });
  const col = goodColor(row.good, tagKey);
  if (row.t === 'num') {
    const size = row.size === 'big' ? 150 : 88;
    const base = y + 48 + size * 0.86;
    const p = easeOutCubic(prog(u, start + 0.12, 0.95));
    const from = row.from, to = row.to;
    const val = from === null || from === undefined ? to * p : lerp(from, to, p);
    const done = p >= 1;
    const body = (done ? fmtNum(to, row.dec, row.comma) : fmtNum(val, row.dec, row.comma));
    const prefix = row.prefix ? (row.prefix === '-' ? '−' : row.prefix) : '';
    const newStr = prefix + body;
    const oldStr = from === null || from === undefined ? '' : (row.prefix === '+' ? '+' : '') + fmtNum(from, Number.isInteger(from) ? 0 : row.dec, row.comma);
    const oldSize = size * 0.6;
    const unitSize = Math.max(44, size * 0.36);
    const oldW = oldStr ? measure(ctx, oldStr, oldSize) : 0;
    const arrowW = oldStr ? size * 0.62 : 0;
    const gap = oldStr ? size * 0.16 : 0;
    // reserve the width of the final text so the layout does not jump while it ticks
    const finalStr = prefix + fmtNum(to, row.dec, row.comma);
    const newW = measure(ctx, finalStr, size);
    const unitW = row.unit ? measure(ctx, row.unit, unitSize) + 12 : 0;
    const total = oldW + gap + arrowW + gap + newW + unitW;
    const fit = Math.min(1, w / total);
    ctx.save();
    ctx.translate(x, base);
    ctx.scale(fit, fit);
    let cx = 0;
    if (oldStr) {
      text(ctx, oldStr, cx, 0, { size: oldSize, fill: C.inkSoft, alpha: 0.85 });
      const strike = easeOutCubic(prog(u, start + 0.3, 0.25));
      if (strike > 0) { ctx.strokeStyle = C.berryDark; ctx.lineWidth = 8; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(cx - 6, -oldSize * 0.18); ctx.lineTo(cx - 6 + (oldW + 12) * strike, -oldSize * 0.34); ctx.stroke(); }
      cx += oldW + gap;
      arrow(ctx, cx, -size * 0.32, arrowW, size * 0.3, C.ink, null);
      cx += arrowW + gap;
    }
    const land = prog(u, start + 1.07, 0.3);
    const sc = 1 + 0.14 * Math.sin(Math.PI * land);
    ctx.save();
    ctx.translate(cx + newW / 2, -size * 0.32);
    ctx.scale(sc, sc);
    text(ctx, newStr, -newW / 2, size * 0.32, { size, fill: col.fill, stroke: C.ink, sw: size * 0.07, align: 'left' });
    ctx.restore();
    if (row.unit) text(ctx, row.unit, cx + newW + 12, 0, { size: unitSize, fill: C.ink });
    ctx.restore();
  } else if (row.t === 'text') {
    const size = 56;
    const y0 = y + 54;
    const fromW = chip(ctx, row.from, 0, 0, { size, draw: false }).w;
    const toW = chip(ctx, row.to, 0, 0, { size, draw: false }).w;
    const aw = 74;
    const total = fromW + aw + toW + 28;
    const fit = Math.min(1, w / total);
    ctx.save();
    ctx.translate(x, y0);
    ctx.scale(fit, fit);
    chip(ctx, row.from, 0, 0, { size, fill: C.paperDim, border: C.kraft, color: C.inkSoft, strike: prog(u, start + 0.35, 0.2) > 0.5, h: 76 });
    arrow(ctx, fromW + 12, 38, aw - 6, 26, C.ink, null);
    const pp = pop(u, start + 0.45, 0.4);
    ctx.save();
    ctx.translate(fromW + aw + 14 + toW / 2, 38);
    ctx.scale(Math.max(pp, 0.001), Math.max(pp, 0.001));
    ctx.translate(-toW / 2, -38);
    chip(ctx, row.to, 0, 0, { size, fill: col.fill, border: col.dark, color: C.ink, h: 76, stroke: null });
    ctx.restore();
    ctx.restore();
  }
  ctx.restore();
}

/** The big paper card on the right: eyebrow chip, title and rows. */
function infoCard(ctx, c, u, box) {
  const { x, y, w, h } = box;
  const pp = prog(u, 0.05, 0.4);
  ctx.save();
  ctx.translate(0, (1 - easeOutCubic(pp)) * 40);
  ctx.globalAlpha *= clamp(pp * 3);
  paper(ctx, x, y, w, h, { fill: C.paperLight, r: 36, rot: 0.004, shadow: 14 });
  tape(ctx, x + 70, y + 8, 180, 56, -0.35);
  tape(ctx, x + w - 90, y + h - 6, 180, 56, -0.3);
  const titleSize = 88;
  setFont(ctx, titleSize);
  let ty = y + 34;
  slideIn(ctx, u, 0.28, 24, () => {
    text(ctx, c.title, x + 44, ty + titleSize * 0.84, { size: titleSize, fill: C.ink, maxW: w - 440 });
  });
  ty += titleSize + 20;
  const rows = c.rows || [];
  const innerW = w - 90;
  const avail = y + h - 30 - ty;
  let fit = Math.min(1.45, avail / rows.reduce((a, r) => a + rowHeight(ctx, r, innerW), 0));
  for (let k = 0; k < 4; k++) { // notes wrap differently at another scale: settle on a scale that really fits
    const tot = rows.reduce((a, r) => a + rowHeight(ctx, r, innerW / fit), 0);
    if (tot * fit <= avail + 0.5) break;
    fit = Math.max(0.5, fit * (avail / (tot * fit)) * 0.98);
  }
  const hs = rows.map((r) => rowHeight(ctx, r, innerW / fit));
  ctx.save();
  ctx.translate(x + 44, ty);
  ctx.scale(fit, fit);
  let ry = 0;
  rows.forEach((r, i) => {
    drawRow(ctx, r, 0, ry, innerW / fit, u, 0.55 + i * 0.3, c.tag);
    ry += hs[i];
  });
  ctx.restore();
  ctx.restore();
  if (c.tag) drawTag(ctx, c.tag, x + w - 205, y + 68, u, 0.5, -0.1, 0.85);
}

/** The small name tag under a sticker (class, boss, or a few words about the card). */
function artChip(ctx, c, cx, cy, u) {
  if (!c.chip) return;
  const k = CLASS[c.chip.klass] || CLASS.plain;
  setFont(ctx, 46);
  const cw = ctx.measureText(c.chip.text).width + 60;
  withPop(ctx, cx, cy, u, 0.55, () => {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(-0.03);
    paper(ctx, -cw / 2, -33, cw, 66, { fill: k.main, r: 22, shadow: 5, border: k.dark, bw: 4 });
    text(ctx, c.chip.text, 0, 15, { size: 46, fill: c.chip.klass === 'plain' ? C.ink : C.onArt, stroke: c.chip.klass === 'plain' ? null : k.dark, sw: 4, align: 'center' });
    ctx.restore();
  }, 0.4);
}

function artBacking(ctx, cx, cy, r, u, color = '#f1dfb8') {
  const p = easeOutCubic(prog(u, 0.05, 0.4));
  if (p <= 0) return;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(p, p);
  ctx.fillStyle = 'rgba(106,69,39,0.22)';
  ctx.beginPath(); ctx.arc(10, 14, r, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
  ctx.setLineDash([20, 16]); ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(180,143,98,0.8)'; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.arc(0, 0, r - 22, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();
}

/** Falling pictures (fish, coins, hearts) beside the art. */
function fxRain(ctx, key, u, box, opts = {}) {
  const n = opts.n ?? 9, every = opts.every ?? 0.42, fall = opts.fall ?? 0.85, size = opts.size ?? 90;
  for (let i = 0; i < n; i++) {
    const t0 = (opts.start ?? 0.5) + i * every;
    const p = prog(u, t0, fall);
    if (p <= 0 || p >= 1) continue;
    const x = box.x + hash(i * 17 + 3) * box.w;
    const y = lerp(box.y, box.y + box.h, easeInCubic(p));
    const a = p < 0.12 ? p / 0.12 : p > 0.85 ? (1 - p) / 0.15 : 1;
    ctx.save();
    ctx.globalAlpha *= a;
    drawArt(ctx, key, x + Math.sin(p * 6 + i) * 16, y, size, size, { rot: Math.sin(p * 5 + i) * 0.5, shadow: false });
    ctx.restore();
  }
}

// ───────────────────────── scenes ─────────────────────────
const SCENES = {};

function titleRow(ctx, c, u, text0) {
  slideIn(ctx, u, 0.15, 26, () => text(ctx, text0 ?? c.title, 130, 258, { size: 88, fill: C.ink, maxW: 1100 }));
}

SCENES.change = (ctx, c, u, S, t) => {
  const acx = 470, acy = 520;
  artBacking(ctx, acx, acy, 280, u);
  if (c.fx === 'fish') fxRain(ctx, 'icon:fish', u, { x: 230, y: 190, w: 480, h: 600 }, { size: 110 });
  if (c.fx === 'coins') fxRain(ctx, 'icon:gold', u, { x: 230, y: 190, w: 480, h: 600 }, { size: 100, every: 0.3, n: 12 });
  if (c.fx === 'purr') fxRain(ctx, 'misc:icon_purr', u, { x: 230, y: 190, w: 480, h: 600 }, { size: 100 });
  const p = pop(u, 0.18, 0.55);
  const bob = Math.sin(t * 2.4) * 7;
  const isIcon = /^(icon|misc|cell|relic)/.test(c.art);
  const sz = isIcon ? 470 : 600;
  withPop(ctx, acx, acy, u, 0.18, () => drawArt(ctx, c.art, acx, acy + bob, sz, sz, { rot: Math.sin(t * 1.7) * 0.025 }), 0.55);
  artChip(ctx, c, acx, 792, u);
  infoCard(ctx, c, u, { x: 830, y: 185, w: 1000, h: 650 });
};

SCENES.hook = (ctx, c, u, S, t) => {
  // confetti
  for (let i = 0; i < 46; i++) {
    const sp = 90 + hash(i * 5) * 160;
    const x = hash(i * 3 + 1) * W;
    const y = ((u * sp + hash(i * 7) * 1300) % 1300) - 110;
    const colors = [C.paperLight, C.mustard, C.teal, C.berry, C.leaf];
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(u * (1 + hash(i) * 3) + i);
    ctx.fillStyle = colors[i % colors.length];
    ctx.globalAlpha *= 0.85;
    ctx.fillRect(-12, -7, 24, 14);
    ctx.restore();
  }
  // a hit: the thing is at its size, jumps up at `start` and settles
  const punch = (start, amp = 0.16, dur = 0.32) => { const d = (u - start) / dur; return d < 0 || d > 1 ? 1 : 1 + amp * (1 - d) * (1 - d); };
  // flanking stickers
  const pos = [[300, 600, 420], [1620, 600, 420], [545, 790, 250], [1375, 790, 250]];
  c.stickers.slice(0, 4).forEach((k, i) => {
    const [x, y, sz] = pos[i];
    const pu = punch(0.3 + i * 0.08, 0.1);
    ctx.save();
    ctx.translate(x, y + 150);
    ctx.scale(pu, pu);
    ctx.translate(-x, -(y + 150));
    drawArt(ctx, k, x, y + Math.sin(t * 2.2 + i) * 8, sz, sz, { rot: (i % 2 ? 1 : -1) * 0.05 });
    ctx.restore();
  });
  // title words
  const sizes = [104, 112];
  c.lines.forEach((line, li) => {
    const size = sizes[li] ?? 104;
    setFont(ctx, size);
    const words = line.split(' ');
    const space = ctx.measureText(' ').width;
    const widths = words.map((w) => ctx.measureText(w).width);
    const total = widths.reduce((a, b) => a + b, 0) + space * (words.length - 1);
    let x = (W - total) / 2;
    const y = 255 + li * 128;
    words.forEach((w, wi) => {
      const pu = punch((li === 0 ? 0.3 : 0.77) + wi * 0.12, 0.2);
      ctx.save();
      ctx.translate(x + widths[wi] / 2, y - size * 0.3);
      ctx.scale(pu, pu);
      const hi = li === 1 && wi === words.length - 1;
      text(ctx, w, -widths[wi] / 2, size * 0.3, { size, fill: hi ? C.mustard : C.onArt, stroke: C.inkDeep, sw: size * 0.085 });
      ctx.restore();
      x += widths[wi] + space;
    });
  });
  // banner
  {
    const pu = punch(1.24, 0.08, 0.4);
    ctx.save();
    ctx.translate(W / 2, 640);
    ctx.rotate(-0.025);
    ctx.scale(pu, pu);
    paper(ctx, -450, -150, 900, 300, { fill: C.paperLight, r: 40, shadow: 14, border: C.kraft, bw: 6 });
    tape(ctx, -380, -150, 170, 56, -0.3);
    tape(ctx, 380, 150, 170, 56, -0.3);
    const numW = measure(ctx, c.banner.num, 190);
    text(ctx, c.banner.num, -numW / 2 - 100, 30, { size: 190, fill: C.coral, stroke: C.coralDark, sw: 10 });
    text(ctx, '패치', numW / 2 - 70, 30, { size: 110, fill: C.ink });
    text(ctx, '테스트 빌드 적용!', 0, 112, { size: 78, fill: C.ink, align: 'center' });
    ctx.restore();
  }
  // scope label
  if (c.scope) {
    const pu = punch(1.7, 0.15, 0.35);
    ctx.save();
    ctx.translate(1340, 446);
    ctx.rotate(0.06);
    ctx.scale(pu, pu);
    setFont(ctx, 46);
    const sw = ctx.measureText(c.scope).width + 50;
    paper(ctx, -sw / 2, -36, sw, 72, { fill: C.mustard, r: 16, shadow: 6, border: C.mustardDark, bw: 4 });
    text(ctx, c.scope, 0, 16, { size: 46, fill: C.inkDeep, align: 'center' });
    ctx.restore();
  }
  text(ctx, S.script.meta.channel.sub, W / 2, 855, { size: 48, fill: C.onArt, stroke: C.inkDeep, sw: 5, align: 'center' });
};

SCENES.chapter = (ctx, c, u, S, t) => {
  const ch = S.chapters.get(c.chapter);
  const dark = ch.color === 'coral' ? C.coralDark : ch.color === 'teal' ? C.tealDark : C.mustardDark;
  // giant number cut from paper
  const np = easeOutCubic(prog(u, 0.05, 0.5));
  ctx.save();
  ctx.globalAlpha *= 0.32 * np;
  text(ctx, ch.no, 1790, 880, { size: 620, fill: C.paperLight, align: 'right' });
  ctx.restore();
  const tp = pop(u, 0.12, 0.5);
  ctx.save();
  ctx.translate(150, 470);
  ctx.scale(Math.max(tp, 0.001), Math.max(tp, 0.001));
  text(ctx, ch.title, 0, 0, { size: 220, fill: C.onArt, stroke: C.inkDeep, sw: 18 });
  ctx.restore();
  slideIn(ctx, u, 0.4, 24, () => text(ctx, ch.sub, 160, 560, { size: 58, fill: C.inkDeep }));
  // little stickers
  const keys = ch.icons;
  keys.forEach((k, i) => {
    const gx = 1420 + (i % 2) * 270, gy = 300 + Math.floor(i / 2) * 235;
    const isIcon = /^(icon|misc|cell)/.test(k);
    withPop(ctx, gx, gy, u, 0.3 + i * 0.1, () => drawArt(ctx, k, gx, gy + Math.sin(t * 2 + i) * 6, isIcon ? 190 : 250, isIcon ? 190 : 240, { rot: (i % 2 ? 0.05 : -0.05) }), 0.5);
  });
  // agenda chips: where each chapter starts
  if (c.agenda) {
    const chips = [...S.chapters.values()];
    chips.forEach((o, i) => {
      const x = 130 + i * 560, y = 680, w = 520, h = 120;
      const start = S.chapterStart.get(o.id) ?? 0;
      const mm = Math.floor(start / 60), ss = Math.floor(start - mm * 60);
      const stamp = `${mm}:${String(ss).padStart(2, '0')}`;
      withPop(ctx, x + w / 2, y + h / 2, u, 0.7 + i * 0.12, () => {
        paper(ctx, x, y, w, h, { fill: C.paperLight, r: 26, shadow: 8, border: C.kraft, bw: 4 });
        const col = o.color === 'coral' ? C.coral : o.color === 'teal' ? C.teal : C.mustard;
        ctx.fillStyle = col;
        ctx.beginPath(); ctx.arc(x + 62, y + h / 2, 38, 0, Math.PI * 2); ctx.fill();
        text(ctx, o.no, x + 62, y + h / 2 + 15, { size: 44, fill: C.onArt, stroke: C.inkDeep, sw: 4, align: 'center' });
        text(ctx, o.title, x + 118, y + h / 2 + 16, { size: 46, fill: C.ink, maxW: 270 });
        text(ctx, stamp, x + w - 28, y + h / 2 + 16, { size: 46, fill: C.inkSoft, align: 'right' });
      }, 0.4);
    });
  }
};

// ----- board 5x5 -----
SCENES.board = (ctx, c, u, S, t) => {
  const cx = 470, cy = 505;
  const cw = 118, ch = 102;
  const cols = 5;
  const extra = easeOutBack(prog(u, 0.95, 0.5), 1.2);
  const rows = 4 + clamp(extra, 0, 1.2);
  const bw = cols * cw, bh = rows * ch;
  // path around the board
  const pad = 46;
  const px = cx - bw / 2 - pad, py = cy - 5 * ch / 2 - pad, pw = bw + pad * 2, ph = 5 * ch + pad * 2;
  const hp = easeOutCubic(prog(u, 0.05, 0.4));
  ctx.save();
  ctx.globalAlpha *= hp;
  const pathH = ph;
  ctx.setLineDash([24, 16]); ctx.lineWidth = 12; ctx.strokeStyle = C.kraftDark; ctx.lineCap = 'round';
  rr(ctx, px, py, pw, pathH - (1 - clamp(extra)) * ch, 40);
  ctx.stroke();
  ctx.restore();
  // mat
  const top = cy - 5 * ch / 2;
  ctx.save();
  ctx.globalAlpha *= hp;
  paper(ctx, cx - bw / 2 - 14, top - 14, bw + 28, bh + 28, { fill: C.kraft, r: 22, shadow: 10, border: C.kraftDark, bw: 5 });
  for (let r = 0; r < 5; r++) {
    for (let k = 0; k < cols; k++) {
      const y = top + r * ch;
      if (r >= 4) { if (extra <= 0) continue; }
      const isNew = r === 4;
      ctx.fillStyle = (r + k) % 2 ? '#fbf3e2' : '#f2e6c8';
      if (isNew) ctx.fillStyle = (r + k) % 2 ? '#ffe9a8' : '#ffd878';
      ctx.fillRect(cx - bw / 2 + k * cw + 2, y + 2, cw - 4, Math.min(ch - 4, bh - r * ch - 4 + 0));
    }
  }
  ctx.restore();
  // a few cats
  const cats = [['u:w_paw', 0, 0], ['u:r_sling', 2, 0], ['u:m_snow', 4, 1], ['u:t_chef', 1, 2], ['u:w_sword', 3, 3], ['u:m_fire', 0, 4], ['u:t_bell', 2, 4], ['u:r_archer', 4, 4]];
  cats.forEach(([k, gx, gy], i) => {
    if (gy === 4 && extra < 0.8) return;
    withPop(ctx, cx - bw / 2 + gx * cw + cw / 2, top + gy * ch + ch / 2, u, 0.3 + i * 0.07 + (gy === 4 ? 0.7 : 0), () => {
      drawArt(ctx, k, cx - bw / 2 + gx * cw + cw / 2, top + gy * ch + ch / 2 + 4, cw * 0.82, ch * 0.9, { shadow: true });
    }, 0.4);
  });
  // the enemy walking the path
  const lap = (u * 0.09) % 1;
  const perim = 2 * (pw + pathH) - 8 * 40;
  let d = lap * (2 * (pw - 80) + 2 * (pathH - 80));
  let ex = px + 40, ey = py;
  const wTop = pw - 80, hSide = ph - 80;
  if (d < wTop) { ex = px + 40 + d; ey = py; }
  else if ((d -= wTop) < hSide) { ex = px + pw; ey = py + 40 + d; }
  else if ((d -= hSide) < wTop) { ex = px + pw - 40 - d; ey = py + ph; }
  else { d -= wTop; ex = px; ey = py + ph - 40 - d; }
  if (hp > 0.9) drawArt(ctx, 'enemy:cucumber', ex, ey, 86, 86, { shadow: true });
  infoCard(ctx, c, u, { x: 830, y: 185, w: 1000, h: 650 });
};

// ----- ladder: the kitten does not count -----
SCENES.ladder = (ctx, c, u, S, t) => {
  titleRow(ctx, c, u);
  const n = c.units.length, gap = 16, tw = (1660 - gap * (n - 1)) / n;
  c.units.forEach((k, i) => {
    const x = 130 + i * (tw + gap), y = 290, h = 470;
    const dim = i === 0;
    const start = 0.25 + i * 0.1;
    withPop(ctx, x + tw / 2, y + h / 2, u, start, () => {
      paper(ctx, x, y, tw, h, { fill: dim ? '#e9dcc0' : C.paperLight, r: 30, shadow: dim ? 6 : 12, border: dim ? C.kraft : C.paperDim });
      drawArt(ctx, k, x + tw / 2, y + 190, tw - 40, 270, { gray: dim, alpha: dim ? 0.8 : 1 });
      const rk = c.ranks[i];
      const col = dim ? C.stone ?? '#a59d90' : ['#c9bba3', '#4fa3c7', '#9c7fc2', '#e8a23a', '#df5c6f'][i];
      setFont(ctx, 50);
      const rw = ctx.measureText(rk).width + 44;
      paper(ctx, x + tw / 2 - rw / 2, y + h - 100, rw, 68, { fill: dim ? '#c9bba3' : col, r: 22, shadow: 4, border: dim ? '#a59d90' : col, bw: 3 });
      text(ctx, rk, x + tw / 2, y + h - 52, { size: 50, fill: dim ? C.inkSoft : C.onArt, stroke: dim ? null : C.inkDeep, sw: 4, align: 'center' });
    }, 0.45);
    const mark = prog(u, 0.9 + i * 0.22, 0.3);
    if (mark > 0) {
      if (dim) cross(ctx, x + tw / 2, y + 150, 70, C.berry, C.berryDark, mark);
      else check(ctx, x + tw - 50, y + 56, 34, C.leaf, C.leafDark, mark);
    }
  });
  // foot
  slideIn(ctx, u, 2.0, 22, () => {
    setFont(ctx, 52);
    const w = Math.min(1660, ctx.measureText(c.foot).width + 80);
    paper(ctx, (W - w) / 2, 770, w, 84, { fill: C.mustard, r: 26, shadow: 7, border: C.mustardDark, bw: 4 });
    text(ctx, c.foot, W / 2, 770 + 58, { size: 52, fill: C.inkDeep, align: 'center', maxW: 1580 });
  });
  if (c.tag) drawTag(ctx, c.tag, 1650, 234, u, 0.5, -0.1, 0.7);
};

// ----- 3rd-step specials -----
SCENES.specials = (ctx, c, u, S, t) => {
  titleRow(ctx, c, u);
  const n = c.items.length, gap = 20, tw = (1660 - gap * (n - 1)) / n;
  c.items.forEach((it, i) => {
    const x = 130 + i * (tw + gap), y = 290, h = 560;
    const k = CLASS[it.klass];
    withPop(ctx, x + tw / 2, y + h / 2, u, 0.25 + i * 0.12, () => {
      paper(ctx, x, y, tw, h, { fill: C.paperLight, r: 30, shadow: 12 });
      // class chip
      setFont(ctx, 44);
      const cw = ctx.measureText(k.name).width + 40;
      paper(ctx, x + 24, y + 22, cw, 58, { fill: k.main, r: 18, shadow: 3, border: k.dark, bw: 3 });
      text(ctx, k.name, x + 24 + cw / 2, y + 22 + 43, { size: 44, fill: C.onArt, stroke: k.dark, sw: 4, align: 'center' });
      drawArt(ctx, it.unit, x + tw / 2, y + 205, tw - 60, 230, { rot: Math.sin(t * 1.6 + i) * 0.03 });
      text(ctx, it.name, x + tw / 2, y + 366, { size: 54, fill: C.ink, align: 'center', maxW: tw - 30 });
      const lines = it.text.split('\n').flatMap((part) => layoutRich(ctx, parseRich(part), 44, tw - 44));
      lines.forEach((ln, li) => drawRichLine(ctx, ln, x + (tw - ln.w) / 2, y + 428 + li * 54, 44, { fill: it.nerf ? C.berryDark : C.inkSoft, hi: C.ink }));
    }, 0.45);
    if (it.nerf) drawTag(ctx, 'nerf', x + tw - 70, y + 45, u, 1.5 + i * 0.05, -0.15, 0.4);
  });
  if (c.tag) drawTag(ctx, c.tag, 1650, 234, u, 0.5, -0.1, 0.7);
};

// ----- columns: N cats or cells with an old -> new number each -----
SCENES.columns = (ctx, c, u, S, t) => {
  titleRow(ctx, c, u);
  const n = c.items.length, gap = n > 4 ? 16 : 20, tw = (1660 - gap * (n - 1)) / n;
  const col = goodColor(c.good, c.tag);
  const top = 285, h = c.foot ? 490 : 560;
  c.items.forEach((it, i) => {
    const x = 130 + i * (tw + gap);
    const start = 0.25 + i * 0.1;
    withPop(ctx, x + tw / 2, top + h / 2, u, start, () => {
      paper(ctx, x, top, tw, h, { fill: C.paperLight, r: 30, shadow: 12 });
      drawArt(ctx, it.art, x + tw / 2, top + (c.foot ? 112 : 150), tw - 40, c.foot ? 170 : 230, { rot: Math.sin(t * 1.6 + i) * 0.03 });
      text(ctx, it.name, x + tw / 2, top + (c.foot ? 242 : 308), { size: 46, fill: C.ink, align: 'center', maxW: tw - 24 });
    }, 0.45);
    const nump = prog(u, 0.8 + i * 0.16, 0.3);
    if (nump > 0) {
      ctx.save();
      ctx.globalAlpha *= clamp(nump * 3);
      const same = it.from === it.to;
      const p = easeOutCubic(prog(u, 0.9 + i * 0.16, 0.8));
      const val = lerp(it.from, it.to, p);
      const yOld = c.foot ? top + 318 : top + h - 184, yNew = c.foot ? top + h - 38 : top + h - 52;
      if (same) {
        text(ctx, '그대로', x + tw / 2, yOld, { size: 52, fill: C.inkSoft, align: 'center' });
        text(ctx, String(it.to), x + tw / 2, yNew, { size: 100, fill: C.inkSoft, align: 'center' });
      } else {
        text(ctx, '이전 ' + fmtNum(it.from), x + tw / 2, yOld, { size: 48, fill: C.inkSoft, align: 'center', alpha: 0.9 });
        const land = prog(u, 1.7 + i * 0.16, 0.3);
        const sc = 1 + 0.12 * Math.sin(Math.PI * land);
        ctx.save();
        ctx.translate(x + tw / 2, yNew);
        ctx.scale(sc, sc);
        text(ctx, fmtNum(val), 0, 0, { size: 124, fill: col.fill, stroke: C.ink, sw: 9, align: 'center' });
        ctx.restore();
      }
      ctx.restore();
    }
  });
  if (c.foot) slideIn(ctx, u, 1.8, 20, () => {
    setFont(ctx, 50);
    const w = Math.min(1660, ctx.measureText(c.foot).width + 80);
    paper(ctx, (W - w) / 2, 792, w, 70, { fill: C.mustard, r: 24, shadow: 6, border: C.mustardDark, bw: 4 });
    text(ctx, c.foot, W / 2, 792 + 50, { size: 50, fill: C.inkDeep, align: 'center' });
  });
  if (c.tag) drawTag(ctx, c.tag, 1650, 234, u, 0.5, -0.1, 0.7);
};

// ----- cells: one special cell per chapter -----
SCENES.cells = (ctx, c, u, S, t) => {
  titleRow(ctx, c, u);
  const n = c.items.length, gap = 16, tw = (1660 - gap * (n - 1)) / n;
  c.items.forEach((it, i) => {
    const x = 130 + i * (tw + gap), y = 290, h = 560;
    withPop(ctx, x + tw / 2, y + h / 2, u, 0.25 + i * 0.12, () => {
      paper(ctx, x, y, tw, h, { fill: C.paperLight, r: 30, shadow: 12 });
      const colors = [C.mustard, C.coral, C.teal, C.leaf, C.violet];
      const dk = [C.mustardDark, C.coralDark, C.tealDark, C.leafDark, C.violetDark];
      setFont(ctx, 50);
      const cw = ctx.measureText(it.chapter).width + 44;
      paper(ctx, x + tw / 2 - cw / 2, y + 20, cw, 66, { fill: colors[i], r: 20, shadow: 3, border: dk[i], bw: 3 });
      text(ctx, it.chapter, x + tw / 2, y + 20 + 49, { size: 50, fill: C.onArt, stroke: dk[i], sw: 5, align: 'center' });
      const glow = 0.5 + 0.5 * Math.sin(t * 3 + i);
      drawArt(ctx, it.art, x + tw / 2, y + 205 + Math.sin(t * 2 + i) * 5, tw - 24, 190, { scale: 1 + glow * 0.025 });
      text(ctx, it.name, x + tw / 2, y + 362, { size: 48, fill: C.ink, align: 'center', maxW: tw - 20 });
      const lines = wrap(ctx, it.text, 46, tw - 36);
      lines.forEach((l, li) => text(ctx, l, x + tw / 2, y + 428 + li * 56, { size: 46, fill: C.inkSoft, align: 'center' }));
    }, 0.45);
  });
  if (c.tag) drawTag(ctx, c.tag, 1650, 234, u, 0.5, -0.1, 0.7);
};

// ----- auras: two cats with their lines -----
SCENES.auras = (ctx, c, u, S, t) => {
  titleRow(ctx, c, u);
  c.items.forEach((it, i) => {
    const x = 130 + i * 840, y = 290, w = 820, h = 560;
    withPop(ctx, x + w / 2, y + h / 2, u, 0.25 + i * 0.15, () => {
      paper(ctx, x, y, w, h, { fill: C.paperLight, r: 32, shadow: 12 });
      drawArt(ctx, it.art, x + 190, y + 250, 340, 380, { rot: Math.sin(t * 1.6 + i) * 0.03 });
      text(ctx, it.name, x + 190, y + 505, { size: 62, fill: C.ink, align: 'center' });
    }, 0.45);
    it.lines.forEach((ln, li) => {
      const col = goodColor(ln.good, c.tag);
      const start = 0.9 + i * 0.3 + li * 0.35;
      slideIn(ctx, u, start, 24, () => {
        text(ctx, ln.label, x + 390, y + 112 + li * 210, { size: 44, fill: C.inkSoft, maxW: 400 });
        const size = 60;
        setFont(ctx, size);
        const fw = chip(ctx, ln.from, 0, 0, { size, draw: false }).w;
        const tw2 = chip(ctx, ln.to, 0, 0, { size, draw: false }).w;
        const total = fw + 62 + tw2;
        const fit = Math.min(1, 400 / total);
        ctx.save();
        ctx.translate(x + 390, y + 138 + li * 210);
        ctx.scale(fit, fit);
        chip(ctx, ln.from, 0, 0, { size, fill: C.paperDim, border: C.kraft, color: C.inkSoft, strike: u > start + 0.5, h: 78 });
        arrow(ctx, fw + 8, 39, 52, 24, C.ink, null);
        chip(ctx, ln.to, fw + 66, 0, { size, fill: col.fill, border: col.dark, color: C.ink, h: 78 });
        ctx.restore();
      });
    });
  });
  if (c.tag) drawTag(ctx, c.tag, 1650, 234, u, 0.5, -0.1, 0.7);
};

// ----- swap: chef and bell exchange ranks -----
SCENES.swap = (ctx, c, u, S, t) => {
  titleRow(ctx, c, u);
  const slots = [{ x: 520, label: '꼬마' }, { x: 1400, label: '동네' }];
  slots.forEach((s, i) => {
    withPop(ctx, s.x, 550, u, 0.1 + i * 0.1, () => {
      paper(ctx, s.x - 330, 285, 660, 530, { fill: C.paperLight, r: 34, shadow: 12 });
      const col = i === 0 ? '#c9bba3' : '#4fa3c7';
      setFont(ctx, 54);
      const w = ctx.measureText(s.label).width + 56;
      paper(ctx, s.x - w / 2, 300, w, 72, { fill: col, r: 22, shadow: 4, border: i === 0 ? '#8f7f66' : '#2f7a9c', bw: 3 });
      text(ctx, s.label, s.x, 300 + 53, { size: 54, fill: C.onArt, stroke: C.inkDeep, sw: 5, align: 'center' });
    }, 0.45);
  });
  const sw = easeInOut(prog(u, 1.0, 0.8));
  // before: the bell kitten is the small one (left slot) and the chef the neighbourhood one (right slot); then they trade places
  const place = (it, fromX, toX, dir) => {
    const x = lerp(fromX, toX, sw);
    const lift = Math.sin(Math.PI * sw) * 110 * dir;
    withPop(ctx, x, 480, u, 0.25, () => drawArt(ctx, it.art, x, 482 + lift + Math.sin(t * 2) * 5, 280, 270, { rot: Math.sin(Math.PI * sw) * 0.2 * dir }), 0.5);
    const sp = prog(u, 1.9, 0.4);
    if (sp > 0) {
      ctx.save();
      ctx.globalAlpha *= sp;
      text(ctx, it.name, toX, 668, { size: 54, fill: C.ink, align: 'center' });
      [`피해 ${it.dmg[0]} → ${it.dmg[1]}`, `사거리 ${it.range[0]} → ${it.range[1]}`].forEach((l, li) => {
        const lay = layoutRich(ctx, parseRich(l), 46, 620)[0];
        drawRichLine(ctx, lay, toX - lay.w / 2, 724 + li * 52, 46, { fill: C.inkSoft, hi: C.inkSoft });
      });
      ctx.restore();
    }
  };
  place(c.b, 520, 1400, -1);
  place(c.a, 1400, 520, 1);
  const ap = easeOutCubic(prog(u, 0.7, 0.4));
  if (ap > 0) {
    ctx.save();
    ctx.globalAlpha *= ap * (1 - 0.6 * sw);
    ctx.lineWidth = 18; ctx.strokeStyle = C.mustard; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(960, 470, 130, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
    ctx.beginPath(); ctx.arc(960, 560, 130, Math.PI * 0.15, Math.PI * 0.85); ctx.stroke();
    ctx.restore();
  }
  if (c.tag) drawTag(ctx, c.tag, 1650, 234, u, 0.5, -0.1, 0.7);
};

// ----- laser: the dot sticks to the boss -----
SCENES.laser = (ctx, c, u, S, t) => {
  const acx = 470, acy = 520;
  artBacking(ctx, acx, acy, 280, u);
  const bob = Math.sin(t * 2.4) * 7;
  // the boss walks a little to the right so the dot has something to follow
  const walk = Math.sin(u * 1.1) * 26;
  withPop(ctx, acx, acy, u, 0.18, () => drawArt(ctx, c.art, acx + walk, acy + bob + 20, 480, 470), 0.55);
  // the dot: wanders, then locks at u=1.3
  const lock = prog(u, 1.3, 0.22);
  const wx = acx + 210 + Math.sin(u * 5) * 60, wy = acy - 160 + Math.cos(u * 4.3) * 50;
  const tx = acx + walk, ty = acy + bob + 20;
  const dx = lerp(wx, tx, easeOutCubic(lock)), dy = lerp(wy, ty, easeOutCubic(lock));
  ctx.save();
  ctx.fillStyle = 'rgba(240,60,60,0.35)';
  ctx.beginPath(); ctx.arc(dx, dy, 44 + Math.sin(t * 9) * 3, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#ff3b3b';
  ctx.beginPath(); ctx.arc(dx, dy, 22, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = C.onArt; ctx.lineWidth = 5; ctx.stroke();
  if (lock > 0) {
    const s = lerp(1.7, 1, easeOutCubic(lock));
    const r = 190 * s;
    ctx.globalAlpha *= clamp(lock * 2);
    ctx.strokeStyle = '#ff3b3b'; ctx.lineWidth = 9; ctx.setLineDash([22, 14]);
    ctx.beginPath(); ctx.arc(tx, ty, r, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]); ctx.lineWidth = 12; ctx.lineCap = 'round';
    for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const bx = tx + sx * (r + 14), by = ty + sy * (r + 14);
      ctx.beginPath(); ctx.moveTo(bx, by - sy * 56); ctx.lineTo(bx, by); ctx.lineTo(bx - sx * 56, by); ctx.stroke();
    }
    text(ctx, '붙었어요!', tx, ty - r - 40, { size: 56, fill: '#ff5a5a', stroke: C.inkDeep, sw: 6, align: 'center' });
  }
  ctx.restore();
  infoCard(ctx, c, u, { x: 830, y: 185, w: 1000, h: 650 });
};

// ----- missions: claim all -----
SCENES.missions = (ctx, c, u, S, t) => {
  const x = 130, y = 200, w = 900, h = 650;
  const pp = prog(u, 0.05, 0.4);
  ctx.save();
  ctx.translate(0, (1 - easeOutCubic(pp)) * 40);
  ctx.globalAlpha *= clamp(pp * 3);
  paper(ctx, x, y, w, h, { fill: C.paperLight, r: 34, shadow: 14 });
  tape(ctx, x + 80, y + 6, 180, 56, -0.3);
  text(ctx, '받을 보상 3개', x + 44, y + 92, { size: 56, fill: C.ink });
  ctx.restore();
  // the button
  const press = prog(u, 1.55, 0.18);
  const sq = press < 1 ? 1 - 0.1 * Math.sin(Math.PI * press) : 1;
  withPop(ctx, x + w - 250, y + 70, u, 0.5, () => {
    ctx.save();
    ctx.translate(x + w - 250, y + 70);
    ctx.scale(sq, sq);
    paper(ctx, -200, -48, 400, 96, { fill: C.coral, r: 30, shadow: 8, border: C.coralDark, bw: 6 });
    text(ctx, '모두 받기', 0, 20, { size: 60, fill: C.onArt, stroke: C.coralDark, sw: 6, align: 'center' });
    ctx.restore();
  });
  // rows
  const icons = ['icon:gold', 'icon:gem', 'icon:ticket', 'icon:fish'];
  for (let i = 0; i < 4; i++) {
    const ry = y + 150 + i * 118;
    const sp = prog(u, 0.6 + i * 0.15, 0.3);
    if (sp <= 0) continue;
    ctx.save();
    ctx.globalAlpha *= clamp(sp * 3);
    ctx.translate(0, (1 - easeOutCubic(sp)) * 24);
    paper(ctx, x + 30, ry, w - 60, 100, { fill: i < 3 ? '#fff4d6' : '#ece3cf', r: 22, shadow: 4, border: C.kraft, bw: 3 });
    // check box
    paper(ctx, x + 56, ry + 22, 56, 56, { fill: C.paperLight, r: 14, shadow: 0, border: C.kraftDark, bw: 4 });
    const cp = prog(u, 1.7 + i * 0.22, 0.3);
    if (i < 3 && cp > 0) check(ctx, x + 84, ry + 52, 24, C.leaf, C.leafDark, cp);
    // bar placeholder
    ctx.fillStyle = C.track;
    rr(ctx, x + 140, ry + 38, 330 - i * 30, 24, 12); ctx.fill();
    ctx.fillStyle = i < 3 ? C.leaf : C.kraft;
    rr(ctx, x + 140, ry + 38, i < 3 ? 330 - i * 30 : 120, 24, 12); ctx.fill();
    // reward icon
    drawArt(ctx, icons[i], x + w - 120, ry + 50, 80, 80, { shadow: false });
    ctx.restore();
  }
  // icons flying up when claimed
  for (let i = 0; i < 3; i++) {
    const fp = prog(u, 1.75 + i * 0.22, 0.7);
    if (fp <= 0 || fp >= 1) continue;
    const e = easeInOut(fp);
    const sx = x + w - 120, sy = y + 200 + i * 118;
    const ex = 1730, ey = 235;
    const sz = lerp(90, 40, e);
    ctx.save();
    ctx.globalAlpha *= 1 - 0.85 * easeInCubic(fp);
    drawArt(ctx, icons[i], lerp(sx, ex, e), lerp(sy, ey, e) - Math.sin(Math.PI * e) * 90, sz, sz, { shadow: false });
    ctx.restore();
  }
  // right: big words
  const tp = pop(u, 0.3, 0.5);
  ctx.save();
  ctx.translate(1420, 330);
  ctx.scale(Math.max(tp, 0.001), Math.max(tp, 0.001));
  text(ctx, c.title, 0, 40, { size: 170, fill: C.coral, stroke: C.coralDark, sw: 14, align: 'center', maxW: 720 });
  ctx.restore();
  const fp = prog(u, 1.2, 0.4);
  if (fp > 0) {
    ctx.save();
    ctx.globalAlpha *= fp;
    const chipsT = ['일일·주간 미션', '주간 컵', '무한 단계'];
    chipsT.forEach((s, i) => {
      const cw = measure(ctx, s, 50) + 56;
      const cx0 = 1420 - 360 + (i === 2 ? 0 : 0);
      const yy = 440 + i * 92;
      paper(ctx, 1420 - cw / 2, yy, cw, 80, { fill: C.mustard, r: 24, shadow: 6, border: C.mustardDark, bw: 4 });
      text(ctx, s, 1420, yy + 57, { size: 50, fill: C.inkDeep, align: 'center' });
    });
    ctx.restore();
  }
  if (c.tag) drawTag(ctx, c.tag, 1600, 780, u, 0.5, -0.1, 0.7);
};

// ----- gold dungeon / fish etc. are "change" -----

// ----- codex -----
SCENES.codex = (ctx, c, u, S, t) => {
  const bx = 130, by = 195, bw = 1020, bh = 650;
  const bp = prog(u, 0.05, 0.4);
  ctx.save();
  ctx.translate(0, (1 - easeOutCubic(bp)) * 40);
  ctx.globalAlpha *= clamp(bp * 3);
  paper(ctx, bx, by, bw, bh, { fill: '#c97d5e', r: 34, shadow: 14, border: '#a85f42', bw: 6 });
  paper(ctx, bx + 18, by + 18, bw / 2 - 22, bh - 36, { fill: C.paperLight, r: 24, shadow: 0, border: C.paperDim });
  paper(ctx, bx + bw / 2 + 4, by + 18, bw / 2 - 22, bh - 36, { fill: C.paperLight, r: 24, shadow: 0, border: C.paperDim });
  text(ctx, '몬스터', bx + bw * 0.25, by + 84, { size: 56, fill: C.ink, align: 'center' });
  text(ctx, '장난감', bx + bw * 0.75, by + 84, { size: 56, fill: C.ink, align: 'center' });
  ctx.restore();
  const grid = (list, gx0) => list.forEach((k, i) => {
    const gx = gx0 + (i % 3) * 150, gy = by + 190 + Math.floor(i / 3) * 165;
    withPop(ctx, gx, gy, u, 0.5 + i * 0.07, () => drawArt(ctx, k, gx, gy, 136, 138, { shadow: true }), 0.4);
  });
  grid(c.monsters, bx + bw * 0.25 - 150);
  grid(c.toys, bx + bw * 0.75 - 150);
  // counters
  c.counts.forEach((ct, i) => {
    const cx = 1500, cy = 300 + i * 215;
    const p = easeOutCubic(prog(u, 0.9 + i * 0.3, 1.0));
    withPop(ctx, cx, cy, u, 0.7 + i * 0.3, () => {
      paper(ctx, cx - 300, cy - 100, 600, 200, { fill: C.paperLight, r: 34, shadow: 12 });
      text(ctx, fmtNum(ct.n * p), cx - 40, cy + 62, { size: 170, fill: C.teal, stroke: C.ink, sw: 12, align: 'right' });
      text(ctx, '종', cx - 20, cy + 62, { size: 70, fill: C.ink });
      text(ctx, ct.label, cx + 200, cy + 14, { size: 54, fill: C.inkSoft, align: 'center', maxW: 150 });
    }, 0.45);
  });
  slideIn(ctx, u, 1.9, 22, () => {
    const lines = wrap(ctx, c.foot, 46, 560);
    lines.forEach((l, i) => text(ctx, l, 1500, 680 + i * 56, { size: 46, fill: C.inkSoft, align: 'center' }));
  });
  if (c.tag) drawTag(ctx, c.tag, 1620, 818, u, 0.5, -0.1, 0.6);
};

// ----- music -----
SCENES.music = (ctx, c, u, S, t) => {
  const acx = 430, acy = 520;
  artBacking(ctx, acx, acy, 270, u);
  withPop(ctx, acx, acy, u, 0.18, () => drawArt(ctx, c.art, acx, acy + Math.sin(t * 2.6) * 8, 560, 580, { rot: Math.sin(t * 2.6) * 0.03 }), 0.55);
  // floating notes
  for (let i = 0; i < 7; i++) {
    const p = ((u * 0.45 + i / 7) % 1);
    const nx = acx + 120 + Math.sin(i * 2.1) * 170 + p * 70, ny = acy + 150 - p * 440;
    ctx.save();
    ctx.globalAlpha *= Math.sin(Math.PI * p) * 0.95;
    ctx.translate(nx, ny); ctx.rotate(Math.sin(p * 6 + i) * 0.3);
    const col = [C.coral, C.teal, C.mustard, C.violet][i % 4];
    ctx.fillStyle = col; ctx.strokeStyle = C.ink; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.ellipse(0, 0, 21, 15, -0.4, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.lineWidth = 7; ctx.beginPath(); ctx.moveTo(17, -6); ctx.lineTo(17, -62); ctx.lineTo(42, -50); ctx.stroke();
    ctx.restore();
  }
  // right: title + chips
  const x = 830;
  slideIn(ctx, u, 0.25, 26, () => text(ctx, c.title, x + 20, 262, { size: 92, fill: C.ink }));
  c.chips.forEach((ch, i) => {
    const col = i % 2, row = Math.floor(i / 2);
    const cx = x + col * 510, cy = 310 + row * 138, w = 480, h = 118;
    withPop(ctx, cx + w / 2, cy + h / 2, u, 0.55 + i * 0.1, () => {
      paper(ctx, cx, cy, w, h, { fill: C.paperLight, r: 28, shadow: 8 });
      const dots = [C.mustard, C.coral, C.teal, C.leaf, C.violet, '#e8a23a', C.berry, C.sky];
      ctx.fillStyle = dots[i];
      ctx.beginPath(); ctx.arc(cx + 50, cy + h / 2, 22, 0, Math.PI * 2); ctx.fill();
      ctx.lineWidth = 4; ctx.strokeStyle = C.ink; ctx.stroke();
      text(ctx, ch.name, cx + 90, cy + 50, { size: 46, fill: C.ink, maxW: 270 });
      text(ctx, `${ch.bpm} BPM`, cx + 90, cy + 98, { size: 44, fill: C.inkSoft });
    }, 0.4);
  });
  if (c.tag) drawTag(ctx, c.tag, 1660, 230, u, 0.5);
};

// ----- bot win rate -----
SCENES.stat = (ctx, c, u, S, t) => {
  slideIn(ctx, u, 0.15, 26, () => text(ctx, c.title, 130, 258, { size: 88, fill: C.ink }));
  slideIn(ctx, u, 0.25, 20, () => text(ctx, c.sub, 130, 318, { size: 46, fill: C.inkSoft }));
  const x0 = 130, base = 745, maxH = 340, gw = 308;
  const cp = prog(u, 0.05, 0.4);
  ctx.save();
  ctx.translate(0, (1 - easeOutCubic(cp)) * 40);
  ctx.globalAlpha *= clamp(cp * 3);
  paper(ctx, x0, 345, 1660, 480, { fill: C.paperLight, r: 32, shadow: 12 });
  ctx.restore();
  ctx.save();
  ctx.globalAlpha *= clamp(cp * 3);
  ctx.strokeStyle = 'rgba(180,143,98,0.55)'; ctx.lineWidth = 3; ctx.setLineDash([14, 12]);
  for (const v of [50, 100]) {
    const y = base - (v / 100) * maxH;
    ctx.beginPath(); ctx.moveTo(x0 + 120, y); ctx.lineTo(x0 + 1630, y); ctx.stroke();
    text(ctx, v + '%', x0 + 100, y + 14, { size: 44, fill: C.inkSoft, align: 'right' });
  }
  ctx.restore();
  c.bars.forEach((b, i) => {
    const gx = x0 + 135 + i * gw;
    const grow = easeOutCubic(prog(u, 0.5 + i * 0.18, 0.7));
    const hOld = (b.from / 100) * maxH * grow;
    const gNew = easeOutCubic(prog(u, 0.9 + i * 0.18, 0.8));
    const hNew = (b.to / 100) * maxH * gNew;
    ctx.fillStyle = '#b9ab92';
    rr(ctx, gx, base - hOld, 104, hOld, 14); ctx.fill();
    ctx.fillStyle = C.leaf;
    rr(ctx, gx + 118, base - hNew, 104, hNew, 14); ctx.fill();
    ctx.lineWidth = 5; ctx.strokeStyle = C.ink;
    rr(ctx, gx + 118, base - hNew, 104, hNew, 14); ctx.stroke();
    if (grow > 0.9) text(ctx, String(b.from), gx + 52, base - hOld - 12, { size: 46, fill: C.inkSoft, align: 'center' });
    if (gNew > 0.9) text(ctx, b.to + '%', gx + 170, base - hNew - 14, { size: 60, fill: C.leafDark, align: 'center' });
    text(ctx, b.label, gx + 111, base + 52, { size: 46, fill: C.ink, align: 'center' });
  });
  // legend
  ctx.fillStyle = '#b9ab92'; rr(ctx, 1230, 270, 34, 34, 8); ctx.fill();
  text(ctx, '이전', 1276, 303, { size: 44, fill: C.inkSoft });
  ctx.fillStyle = C.leaf; rr(ctx, 1410, 270, 34, 34, 8); ctx.fill();
  text(ctx, '이번', 1456, 303, { size: 44, fill: C.inkSoft });
  if (c.tag) drawTag(ctx, c.tag, 1690, 250, u, 0.6, -0.1, 0.6);
};

// ----- outro -----
SCENES.outro = (ctx, c, u, S, t) => {
  // poster
  const pp = pop(u, 0.2, 0.55);
  withPop(ctx, 420, 520, u, 0.2, () => {
    ctx.save();
    ctx.translate(420, 510);
    ctx.rotate(-0.06);
    paper(ctx, -200, -320, 400, 650, { fill: C.paperLight, r: 18, shadow: 14, border: C.kraft, bw: 5 });
    const a = art('misc:keyart_title');
    const fit = Math.min(350 / a.w, 560 / a.h);
    ctx.drawImage(a.bitmap, -a.w * fit / 2, -300 + 14, a.w * fit, a.h * fit);
    tape(ctx, 0, -320, 190, 58, 0.05);
    ctx.restore();
  }, 0.55);
  // title and url
  const x = 860;
  slideIn(ctx, u, 0.3, 26, () => text(ctx, S.script.meta.game, x, 270, { size: 64, fill: C.ink, maxW: 960 }));
  withPop(ctx, 1340, 420, u, 0.5, () => text(ctx, '테스트 빌드', 1340, 440, { size: 150, fill: C.coral, stroke: C.coralDark, sw: 12, align: 'center' }), 0.5);
  const urlP = prog(u, 0.9, 0.4);
  if (urlP > 0) {
    ctx.save();
    ctx.globalAlpha *= clamp(urlP * 3);
    ctx.translate(0, (1 - easeOutCubic(urlP)) * 24);
    const url = S.script.meta.url;
    setFont(ctx, 60);
    const uw = Math.min(960, ctx.measureText(url).width + 80);
    paper(ctx, 1340 - uw / 2, 500, uw, 104, { fill: C.paperLight, r: 30, shadow: 10, border: C.teal, bw: 6 });
    text(ctx, url, 1340, 500 + 74, { size: 60, fill: C.tealDark, align: 'center', maxW: uw - 40 });
    ctx.restore();
  }
  withPop(ctx, 1340, 690, u, 1.3, () => text(ctx, '피드백 부탁드립니다', 1340, 720, { size: 104, fill: C.onArt, stroke: C.inkDeep, sw: 10, align: 'center' }), 0.5);
  // subscribe / like parody stickers
  const sp = prog(u, 2.0, 0.4);
  if (sp > 0) {
    withPop(ctx, 1500, 800, u, 2.0, () => {
      paper(ctx, 1210, 770, 300, 76, { fill: C.coral, r: 22, shadow: 6, border: C.coralDark, bw: 4 });
      text(ctx, '구독', 1360, 770 + 56, { size: 52, fill: C.onArt, stroke: C.coralDark, sw: 5, align: 'center' });
      paper(ctx, 1530, 770, 300, 76, { fill: C.paperLight, r: 22, shadow: 6, border: C.berry, bw: 4 });
      text(ctx, '좋아요', 1680, 770 + 56, { size: 52, fill: C.berryDark, align: 'center' });
    }, 0.4);
  }
  // BGM credit
  const cp = prog(u, 0.6, 0.5);
  if (cp > 0) {
    ctx.save();
    ctx.globalAlpha *= clamp(cp * 2);
    const label = S.script.meta.bgmCredit;
    setFont(ctx, 46);
    const cw = ctx.measureText(label).width + 56;
    paper(ctx, 92, 92, cw, 68, { fill: C.kraft, r: 20, shadow: 5, border: C.kraftDark, bw: 4 });
    text(ctx, label, 92 + cw / 2, 92 + 49, { size: 46, fill: C.inkDeep, align: 'center' });
    ctx.restore();
  }
};
