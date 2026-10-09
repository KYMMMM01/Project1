// The render page: draws every frame on a 1920x1080 canvas as a pure function of t = frame / 30, mixes the sound offline, encodes both with
// WebCodecs (H.264 + AAC) and muxes the MP4. The server (server.mjs) receives the file. ?mode=render (default) or ?mode=stills&times=1,2.5
import { W, H, FPS, loadFonts, loadArt } from './common.js';
import { makeState, drawFrame, artKeys } from './scenes.js';
import { buildMix, SR } from './audio.js';
import { Muxer, ArrayBufferTarget } from '/muxer/mp4-muxer.mjs';

const q = new URLSearchParams(location.search);
const mode = q.get('mode') || 'render';
const post = (o) => fetch('/event', { method: 'POST', body: JSON.stringify(o) }).catch(() => {});
const say = (m) => { const el = document.getElementById('log'); if (el) el.textContent = m; };
window.addEventListener('error', (e) => post({ type: 'error', message: `${e.message} @${e.filename}:${e.lineno}` }));
window.addEventListener('unhandledrejection', (e) => post({ type: 'error', message: 'unhandled: ' + ((e.reason && e.reason.stack) || e.reason) }));

async function save(name, blobOrBytes, dir) {
  const r = await fetch(`/save/${encodeURIComponent(name)}${dir ? '?dir=' + dir : ''}`, { method: 'POST', body: blobOrBytes });
  if (!r.ok) throw new Error('save failed ' + name);
}

const toPng = (canvas) => new Promise((res) => canvas.toBlob(res, 'image/png'));

async function main() {
  const t0 = performance.now();
  const script = await (await fetch('/script.json')).json();
  const timeline = await (await fetch('/work/timeline.json')).json();
  await loadFonts();
  const S = makeState(script, timeline);
  const keys = artKeys(script);
  await Promise.all(keys.map((k) => loadArt(k)));
  await post({ type: 'info', message: `fonts and ${keys.length} pictures ready in ${((performance.now() - t0) / 1000).toFixed(1)} s, ${timeline.cards.length} cards, ${timeline.total} s` });

  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d', { alpha: false });

  if (mode === 'stills') {
    const times = (q.get('times') || '0').split(',').map(Number);
    for (const t of times) {
      const frame = Math.round(t * FPS) / FPS;
      drawFrame(ctx, frame, S, { noCaption: q.get('nocaption') === '1' });
      await save(`still_${frame.toFixed(2)}.png`, await toPng(canvas), 'shots');
    }
    await post({ type: 'info', message: `${times.length} stills saved` });
    return;
  }

  // ───── sound ─────
  say('mixing the sound...');
  const mix = await buildMix(S, (m) => post({ type: 'info', message: m }));
  await post({ type: 'mix', stats: mix.stats });
  if (mode === 'mix') return; // ?mode=mix[&bedLimit=30]: only the sound, for checking the loop
  const totalFrames = timeline.frames;
  const perFrame = Math.round(SR / FPS);

  // ───── encoders and muxer ─────
  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: { codec: 'avc', width: W, height: H, frameRate: FPS },
    audio: { codec: 'aac', numberOfChannels: 2, sampleRate: SR },
    fastStart: 'in-memory',
  });
  let failed = null;
  const venc = new VideoEncoder({ output: (chunk, meta) => muxer.addVideoChunk(chunk, meta), error: (e) => { failed = e; post({ type: 'error', message: 'video encoder: ' + e.message }); } });
  const vcfg = { codec: 'avc1.640028', width: W, height: H, bitrate: script.video?.bitrate ?? 8_000_000, framerate: FPS, avc: { format: 'avc' }, latencyMode: 'quality', hardwareAcceleration: q.get('hw') || 'prefer-software' };
  const vsup = await VideoEncoder.isConfigSupported(vcfg);
  if (!vsup.supported) throw new Error('H.264 1080p is not supported by this browser');
  venc.configure(vcfg);
  const aenc = new AudioEncoder({ output: (chunk, meta) => muxer.addAudioChunk(chunk, meta), error: (e) => { failed = e; post({ type: 'error', message: 'audio encoder: ' + e.message }); } });
  const acfg = { codec: 'mp4a.40.2', sampleRate: SR, numberOfChannels: 2, bitrate: script.video?.audioBitrate ?? 192_000 };
  const asup = await AudioEncoder.isConfigSupported(acfg);
  if (!asup.supported) throw new Error('AAC is not supported by this browser');
  aenc.configure(acfg);

  const waitQueue = async () => {
    while (venc.encodeQueueSize > 6 || aenc.encodeQueueSize > 40) {
      await new Promise((r) => { venc.addEventListener('dequeue', r, { once: true }); setTimeout(r, 50); });
      if (failed) throw failed;
    }
  };

  say('encoding...');
  const started = performance.now();
  let thumbDone = false;
  for (let i = 0; i < totalFrames; i++) {
    const t = i / FPS;
    drawFrame(ctx, t, S);
    const frame = new VideoFrame(canvas, { timestamp: Math.round((i * 1e6) / FPS), duration: Math.round(1e6 / FPS) });
    venc.encode(frame, { keyFrame: i % (FPS * 2) === 0 });
    frame.close();
    // the matching 1/30 s of sound
    const a0 = i * perFrame;
    const data = new Float32Array(perFrame * 2);
    data.set(mix.L.subarray(a0, a0 + perFrame), 0);
    data.set(mix.R.subarray(a0, a0 + perFrame), perFrame);
    const ad = new AudioData({ format: 'f32-planar', sampleRate: SR, numberOfFrames: perFrame, numberOfChannels: 2, timestamp: Math.round((a0 * 1e6) / SR), data });
    aenc.encode(ad);
    ad.close();
    if (failed) throw failed;
    await waitQueue();
    if (i % 90 === 0) {
      const el = (performance.now() - started) / 1000;
      await post({ type: 'progress', frame: i, of: totalFrames, fps: +(i / Math.max(el, 0.001)).toFixed(1), seconds: +el.toFixed(1) });
      say(`encoding ${i}/${totalFrames}`);
    }
  }
  await venc.flush();
  await aenc.flush();
  if (failed) throw failed;
  muxer.finalize();
  const bytes = muxer.target.buffer;
  await post({ type: 'info', message: `muxed ${(bytes.byteLength / 1048576).toFixed(1)} MB in ${((performance.now() - started) / 1000).toFixed(0)} s` });
  await save('video.mp4', bytes);

  // thumbnail: the opening title at its fullest, without the caption band
  const thumbAt = (script.meta.thumbAt ?? 2.6);
  drawFrame(ctx, thumbAt, S, { noCaption: true, noFade: true });
  await save('thumb.png', await toPng(canvas));
  thumbDone = true;
  await post({ type: 'info', message: 'done' + (thumbDone ? ', thumbnail saved' : '') });
}

try {
  await main();
} catch (err) {
  await post({ type: 'error', message: String((err && err.stack) || err) });
}
await fetch('/finish', { method: 'POST' });
