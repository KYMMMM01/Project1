// Tiny local server for the patch-video renderer. It serves the renderer page, the game's art and fonts and the audio/timeline made by
// build.mjs, and it receives what the page produces (POST /save/<name>: the mp4, the thumbnail, stills, the mixed WAV; POST /event: progress).
// It is not the game's dev server: own port (default 5431, VIDEO_PORT to change), exits when the page posts /finish or after a timeout.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const work = path.join(root, 'video', 'work');
const outDir = path.join(work, 'out');
// Where the verification page's stills go (build.mjs --verify passes a scratch folder; the default stays inside video/work).
const shotsDir = process.env.VIDEO_SHOTS_DIR ? path.resolve(process.env.VIDEO_SHOTS_DIR) : path.join(work, 'shots');
fs.mkdirSync(outDir, { recursive: true });
fs.mkdirSync(shotsDir, { recursive: true });
const PORT = Number(process.env.VIDEO_PORT || 5431);
const TIMEOUT_MS = Number(process.env.VIDEO_TIMEOUT_MS || 25 * 60 * 1000);

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.webp': 'image/webp',
  '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.mp4': 'video/mp4', '.ttf': 'font/ttf', '.woff2': 'font/woff2',
};

/** URL prefix -> directory (or single file). Nothing outside these roots is ever served. */
const MOUNTS = [
  ['/player/', path.join(here, 'player')],
  ['/muxer/', path.join(here, 'node_modules', 'mp4-muxer', 'build')],
  ['/img/', path.join(root, 'src', 'assets', 'img')],
  ['/art/', path.join(root, 'art')],
  ['/work/', work],
  ['/fonts/Jua.ttf', path.join(root, 'node_modules', '@expo-google-fonts', 'jua', '400Regular', 'Jua_400Regular.ttf')],
  ['/fonts/LilitaOne.ttf', path.join(root, 'node_modules', '@expo-google-fonts', 'lilita-one', '400Regular', 'LilitaOne_400Regular.ttf')],
  ['/script.json', path.join(here, 'script.json')],
  ['/bgm.json', path.join(work, 'bgm.json')],
];

const events = [];
let finished = false;

/** The owner's music is whichever of video/bgm.mp3, .wav, .ogg exists (first match wins). */
function bgmFile() {
  for (const ext of ['mp3', 'wav', 'ogg']) {
    const f = path.join(root, 'video', `bgm.${ext}`);
    if (fs.existsSync(f)) return f;
  }
  return null;
}

function serveFile(res, file, req) {
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404); res.end('not found: ' + path.relative(root, file)); return; }
    const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
    const range = req.headers.range;
    if (range && /^bytes=(\d*)-(\d*)$/.test(range)) {
      const [, a, b] = /^bytes=(\d*)-(\d*)$/.exec(range);
      const start = a ? Number(a) : 0;
      const end = b ? Math.min(Number(b), st.size - 1) : st.size - 1;
      res.writeHead(206, { 'Content-Type': type, 'Content-Range': `bytes ${start}-${end}/${st.size}`, 'Accept-Ranges': 'bytes', 'Content-Length': end - start + 1 });
      fs.createReadStream(file, { start, end }).pipe(res);
      return;
    }
    res.writeHead(200, { 'Content-Type': type, 'Content-Length': st.size, 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store' });
    fs.createReadStream(file).pipe(res);
  });
}

function resolveMount(urlPath) {
  for (const [prefix, target] of MOUNTS) {
    if (prefix.endsWith('/')) {
      if (!urlPath.startsWith(prefix)) continue;
      const rel = decodeURIComponent(urlPath.slice(prefix.length));
      const file = path.resolve(target, rel);
      if (file !== target && !file.startsWith(target + path.sep)) return null;
      return file;
    }
    if (urlPath === prefix) return target;
  }
  return null;
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const p = url.pathname;
  if (req.method === 'POST' && p.startsWith('/save/')) {
    const name = path.basename(decodeURIComponent(p.slice('/save/'.length)));
    const target = url.searchParams.get('dir') === 'shots' ? shotsDir : outDir;
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const file = path.join(target, name);
      fs.writeFileSync(file, Buffer.concat(chunks));
      console.log(`SAVED ${name} ${fs.statSync(file).size}`);
      res.writeHead(200); res.end('ok');
    });
    return;
  }
  if (req.method === 'POST' && p === '/event') {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8');
      events.push(text);
      console.log('EVENT ' + text);
      res.writeHead(200); res.end('ok');
    });
    return;
  }
  if (req.method === 'POST' && p === '/finish') {
    finished = true;
    console.log('FINISH');
    res.writeHead(200); res.end('ok');
    setTimeout(() => process.exit(0), 300);
    return;
  }
  if (p === '/status') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ finished, events: events.slice(-5) }));
    return;
  }
  if (p === '/bgm/track') {
    const f = bgmFile();
    if (!f) { res.writeHead(404); res.end('no video/bgm.(mp3|wav|ogg)'); return; }
    serveFile(res, f, req);
    return;
  }
  if (p === '/' || p === '/index.html') { res.writeHead(302, { Location: '/player/index.html' + url.search }); res.end(); return; }
  const file = resolveMount(p);
  if (!file) { res.writeHead(404); res.end('no mount for ' + p); return; }
  serveFile(res, file, req);
});

server.listen(PORT, '127.0.0.1', () => console.log(`LISTENING http://127.0.0.1:${PORT}/`));
setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, TIMEOUT_MS).unref();
