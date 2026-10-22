// Measurement toolkit (see README.md): a mobile-sized headless Edge, heap queries over CDP, a process-memory monitor.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { launch } from '../edge/cdp.mjs';

/** The scripts' own folder, and where they write (profiles of the browsers, result files): `.shots/mem` unless `MEM_OUT` says otherwise. */
export const SRC = path.dirname(fileURLToPath(import.meta.url));
export const HERE = path.resolve(process.env.MEM_OUT ?? '.shots/mem');
/** The DevTools port of the headless Edge: one browser at a time, so one port. */
export const CDP_PORT = Number(process.env.CDP_PORT ?? 9361);
export const MB = 1048576;
export const mb = (n, d = 1) => +(n / MB).toFixed(d);

const INIT = fs.readFileSync(path.join(SRC, 'init.js'), 'utf8');
const PAGE = fs.readFileSync(path.join(SRC, 'page.js'), 'utf8');

/** Open `url` in a headless Edge that looks like an iPhone to the page: 390 x 844 css px, devicePixelRatio 3, touch. */
export async function open(url, { port = CDP_PORT, tag = 'run', width = 390, height = 844, dpr = 3, extraInit = '' } = {}) {
  // Never share a browser: a second script on the same port would attach to the first one's page and drive it.
  if (await fetch(`http://127.0.0.1:${port}/json/version`).then(() => true, () => false)) throw new Error(`CDP port ${port} is busy: another run is still going`);
  const key = `mem-${tag}-${process.pid}`;
  const userDir = path.join(HERE, 'profiles', key);
  const b = await launch({ port, userDir, width, height });
  b.key = key;
  await b.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: dpr, mobile: true, screenWidth: width, screenHeight: height });
  await b.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 }).catch(() => {});
  await b.send('Performance.enable');
  await b.send('HeapProfiler.enable');
  await b.send('Page.addScriptToEvaluateOnNewDocument', { source: INIT });
  if (extraInit) await b.send('Page.addScriptToEvaluateOnNewDocument', { source: extraInit });
  b.mon = startMon(key);
  await b.goto(url);
  return b;
}

export async function waitFor(b, expr, { tries = 240, every = 500 } = {}) {
  for (let i = 0; i < tries; i++) {
    if (await b.eval(expr).catch(() => false)) return true;
    await b.sleep(every);
  }
  return false;
}

export async function installPageHelpers(b) {
  await b.eval(PAGE);
  await b.eval('window.__trk.epoch0 = Date.now() - performance.now(); 1');
}

// ---------------------------------------------------------------- process monitor (OS level; Chromium, not WebKit)
const MON = `
$key = $args[0]
$pids = @{}
$last = 0
while ($true) {
  $now = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
  if ($now - $last -gt 2500) {
    $pids = @{}
    Get-CimInstance Win32_Process -Filter "Name='msedge.exe'" | Where-Object { $_.CommandLine -match $key } | ForEach-Object { $t = 'browser'; if ($_.CommandLine -match '--type=([a-z-]+)') { $t = $Matches[1] }; $pids[[int]$_.ProcessId] = $t }
    $last = $now
  }
  $out = @()
  foreach ($id in @($pids.Keys)) { try { $p = [System.Diagnostics.Process]::GetProcessById($id); $out += ('{0},{1},{2},{3}' -f $id, $pids[$id], $p.WorkingSet64, $p.PrivateMemorySize64) } catch {} }
  Write-Output ("$now;" + ($out -join '|'))
  Start-Sleep -Milliseconds 250
}
`;

function startMon(key) {
  const file = path.join(HERE, 'profiles', key + '-mon.ps1');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, MON);
  const child = spawn('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', file, key], { stdio: ['ignore', 'pipe', 'ignore'] });
  const samples = [];
  let buf = '';
  child.stdout.on('data', (d) => {
    buf += d.toString();
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      const [t, rest] = line.split(';');
      if (!rest) continue;
      const procs = rest.split('|').filter(Boolean).map((s) => { const [pid, type, ws, priv] = s.split(','); return { pid: +pid, type, ws: +ws, priv: +priv }; });
      samples.push({ t: +t, procs });
    }
  });
  return {
    samples,
    stop() { try { child.kill(); } catch {} },
    /** Sum of private bytes by process type at the latest sample. */
    latest() {
      const s = samples[samples.length - 1];
      if (!s) return null;
      const by = {};
      for (const p of s.procs) { const e = (by[p.type] ??= { n: 0, priv: 0, ws: 0 }); e.n++; e.priv += p.priv; e.ws += p.ws; }
      return { t: s.t, by };
    },
    /** Peak (over samples between two epoch times) of renderer private bytes, GPU private bytes and their sum. */
    peak(from, to) {
      let r = 0, g = 0, sum = 0, ar = 0, ag = 0;
      for (const s of samples) {
        if (s.t < from || s.t > to) continue;
        let rr = 0, gg = 0, all = 0;
        for (const p of s.procs) { all += p.priv; if (p.type === 'renderer') rr += p.priv; if (p.type === 'gpu-process') gg += p.priv; }
        r = Math.max(r, rr); g = Math.max(g, gg); sum = Math.max(sum, all);
      }
      return { renderer: r, gpu: g, all: sum };
    },
  };
}

export function closeAll(b) {
  try { b.mon?.stop(); } catch {}
  try { b.close(); } catch {}
}

// ---------------------------------------------------------------- heap queries
async function qo(b, protoExpr, fn) {
  const p = await b.send('Runtime.evaluate', { expression: protoExpr, objectGroup: 'qo' });
  if (!p.result?.objectId) return { error: 'no prototype: ' + protoExpr };
  const r = await b.send('Runtime.queryObjects', { prototypeObjectId: p.result.objectId, objectGroup: 'qo' });
  const out = await b.send('Runtime.callFunctionOn', { objectId: r.objects.objectId, functionDeclaration: fn, returnByValue: true, objectGroup: 'qo' });
  await b.send('Runtime.releaseObjectGroup', { objectGroup: 'qo' });
  if (out.exceptionDetails) return { error: out.exceptionDetails.exception?.description ?? 'exception' };
  return out.result.value;
}

const TS_PROTO = `(() => {
  const r = window.__dbg.game.app.renderer;
  let s = r.texture.managedTextures.find(Boolean);
  let p = Object.getPrototypeOf(s);
  let guard = 0;
  while (Object.getPrototypeOf(Object.getPrototypeOf(p)) !== Object.prototype && guard++ < 10) p = Object.getPrototypeOf(p);
  return p;
})()`;
const CONT_PROTO = 'Object.getPrototypeOf(window.__dbg.game.root)';

const FN = {
  ab: `function(){ const a=this; let bytes=0; const sz=[]; for (let i=0;i<a.length;i++){ const n=a[i].byteLength; bytes+=n; sz.push(n);} sz.sort((x,y)=>y-x); const big=sz.filter(n=>n>=65536); return {n:a.length, bytes, over64k:big.length, over64kBytes: big.reduce((s,x)=>s+x,0), top: sz.slice(0,12)}; }`,
  audio: `function(){ const a=this; let bytes=0; const rows=[]; const byRate={}; for (let i=0;i<a.length;i++){ const x=a[i]; const n=x.length*x.numberOfChannels*4; bytes+=n; rows.push([n,x.length,x.numberOfChannels,x.sampleRate]); byRate[x.sampleRate]=(byRate[x.sampleRate]||0)+n; } rows.sort((p,q)=>q[0]-p[0]); const big=rows.filter(r=>r[0]>=262144); return {n:a.length, bytes, byRate, over256k:big.length, over256kBytes:big.reduce((s,x)=>s+x[0],0), top: rows.slice(0,10)}; }`,
  canvas: `function(){ const a=this; const st=window.__dbg&&window.__dbg.game?window.__dbg.game.app.canvas:null; let bytes=0, conn=0, ctx2d=0; const rows=[]; for (let i=0;i<a.length;i++){ const c=a[i]; if (c===st) continue; const b=c.width*c.height*4; bytes+=b; if (c.isConnected) conn++; rows.push([b,c.width,c.height,c.isConnected?1:0,(window.__trk.canv.stacks.get(c)||'')]); } rows.sort((p,q)=>q[0]-p[0]); const buckets={}; for (const r of rows){ const k=r[0]>=4194304?'>=4MB':r[0]>=1048576?'1-4MB':r[0]>=262144?'256K-1MB':r[0]>=65536?'64-256K':'<64K'; const e=(buckets[k]||(buckets[k]={n:0,bytes:0})); e.n++; e.bytes+=r[0]; } return {n:rows.length, bytes, connected:conn, buckets, top: rows.slice(0,12), stageCanvasLive: a.includes(st)}; }`,
  offscreen: `function(){ const a=this; let bytes=0; const rows=[]; for (let i=0;i<a.length;i++){ const c=a[i]; const b=c.width*c.height*4; bytes+=b; rows.push([b,c.width,c.height]); } rows.sort((p,q)=>q[0]-p[0]); return {n:a.length, bytes, top: rows.slice(0,8)}; }`,
  bitmap: `function(){ const a=this; let bytes=0; const rows=[]; for (let i=0;i<a.length;i++){ const c=a[i]; const w=c.width, h=c.height; const b=w*h*4; bytes+=b; rows.push([b,w,h]); } rows.sort((p,q)=>q[0]-p[0]); return {n:a.length, bytes, top: rows.slice(0,15)}; }`,
  img: `function(){ const a=this; let bytes=0, n=0; for (let i=0;i<a.length;i++){ const c=a[i]; const b=(c.naturalWidth||0)*(c.naturalHeight||0)*4; bytes+=b; if (b) n++; } return {n:a.length, decoded:n, bytes}; }`,
  sources: `function(){ const a=this; const r=window.__dbg.game.app.renderer; const tex=r.texture.managedTextures.filter(Boolean); const man=new Set(tex); const kinds={}; const rows=[]; let total=0, up=0, upBytes=0, destroyed=0, mip=0; const cn=(x)=> !x?'none':(x.constructor&&x.constructor.name)||'?'; for (let i=0;i<a.length;i++){ const s=a[i]; if (typeof s.pixelWidth!=='number') continue; const res=s.resource; const kind=!res?'rendertarget/empty':(typeof ImageBitmap!=='undefined'&&res instanceof ImageBitmap)?'art(ImageBitmap)':(res instanceof HTMLCanvasElement)?'canvas':(typeof OffscreenCanvas!=='undefined'&&res instanceof OffscreenCanvas)?'offscreencanvas':(res instanceof HTMLImageElement)?'img':(ArrayBuffer.isView(res))?'pixels':cn(res); const w=s.pixelWidth, h=s.pixelHeight; const m=(s.mipLevelCount>1)?1.333:1; const b=Math.round(w*h*4*m); const isUp=man.has(s); const e=(kinds[kind]||(kinds[kind]={n:0,bytes:0,upN:0,upBytes:0})); e.n++; e.bytes+=b; if (isUp){ e.upN++; e.upBytes+=b; upBytes+=b; up++; } total+=b; if (s.destroyed) destroyed++; if (m>1) mip++; rows.push([b,w,h,kind,isUp?1:0,s.label||'',s.resolution]); } rows.sort((p,q)=>q[0]-p[0]); return {alive:rows.length, total, up, upBytes, destroyed, mip, kinds, managedList: tex.length, top: rows.slice(0,25)}; }`,
  display: `function(){ const a=this; const stage=window.__dbg.game.app.stage; let attached=0, detached=0, destroyed=0, text=0, textDet=0, sprite=0, spriteDet=0, gfx=0, gfxDet=0; for (let i=0;i<a.length;i++){ const o=a[i]; if (o.destroyed) { destroyed++; continue; } let p=o, d=0, at=false; while (p && d++<80){ if (p===stage){ at=true; break;} p=p.parent; } if (at) attached++; else detached++; const isText = typeof o.text==='string' && o.style; const isG = o.context && o.fill; const isS = !isText && !isG && o.texture && !(o.children&&o.children.length); if (isText) { text++; if(!at) textDet++; } else if (isG) { gfx++; if(!at) gfxDet++; } else if (isS) { sprite++; if(!at) spriteDet++; } } return {alive:a.length, attached, detached, destroyed, text, textDet, sprite, spriteDet, gfx, gfxDet}; }`,
};

async function heapMetrics(b) {
  const m = await b.send('Performance.getMetrics');
  const o = {};
  for (const x of m.metrics) o[x.name] = x.value;
  return { jsUsed: o.JSHeapUsedSize, jsTotal: o.JSHeapTotalSize, nodes: o.Nodes, docs: o.Documents, listeners: o.JSEventListeners, layout: o.LayoutCount };
}

export async function snap(b, label, { gc = true, heap = true } = {}) {
  const t = Date.now();
  const pre = await heapMetrics(b);
  if (gc) {
    await b.send('HeapProfiler.collectGarbage');
    await b.send('HeapProfiler.collectGarbage');
    await b.sleep(250);
  }
  const post = await heapMetrics(b);
  const page = JSON.parse(await b.eval('JSON.stringify(window.__page())'));
  const h = {};
  if (heap) {
    h.arraybuffers = await qo(b, 'ArrayBuffer.prototype', FN.ab);
    h.audioBuffers = await qo(b, 'AudioBuffer.prototype', FN.audio);
    h.canvases = await qo(b, 'HTMLCanvasElement.prototype', FN.canvas);
    h.offscreen = await qo(b, 'OffscreenCanvas.prototype', FN.offscreen);
    h.bitmaps = await qo(b, 'ImageBitmap.prototype', FN.bitmap);
    h.images = await qo(b, 'HTMLImageElement.prototype', FN.img);
    h.sources = page.hasDbg ? await qo(b, TS_PROTO, FN.sources) : null;
    h.display = page.hasDbg ? await qo(b, CONT_PROTO, FN.display) : null;
  }
  await b.sleep(400);
  const proc = b.mon?.latest() ?? null;
  return { label, t, pre, post, page, heap: h, proc };
}

/** One-line digest of a snapshot. */
export function digest(s) {
  const p = s.proc?.by ?? {};
  const f = (k) => (p[k] ? mb(p[k].priv, 0) : '-');
  const src = s.heap.sources;
  return [
    s.label.padEnd(26),
    `js ${mb(s.post.jsUsed)}/${mb(s.pre.jsUsed)}`.padEnd(16),
    `ab ${s.heap.arraybuffers ? mb(s.heap.arraybuffers.bytes) : '-'}`.padEnd(10),
    `audio ${s.heap.audioBuffers ? mb(s.heap.audioBuffers.bytes) : '-'}`.padEnd(12),
    `gl ${mb(s.page.gl.texBytes)}`.padEnd(10),
    `rb ${mb(s.page.gl.rbBytes)}`.padEnd(9),
    `canv ${s.heap.canvases ? mb(s.heap.canvases.bytes) : '-'}`.padEnd(11),
    `bmp ${s.heap.bitmaps ? mb(s.heap.bitmaps.bytes) : '-'}`.padEnd(10),
    `src ${src ? src.alive : '-'}/${src ? mb(src.total) : '-'}`.padEnd(14),
    `tree ${s.page.tree ? s.page.tree.total : '-'}`.padEnd(10),
    `proc R${f('renderer')} G${f('gpu-process')} B${f('browser')}`,
  ].join(' ');
}

export const outFile = (name) => { const d = path.join(HERE, 'out'); fs.mkdirSync(d, { recursive: true }); return path.join(d, name); };
export const save = (name, obj) => fs.writeFileSync(outFile(name), JSON.stringify(obj, null, 1));
