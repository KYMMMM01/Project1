// node tools/video/inspect.mjs [file.mp4] : reads the boxes of the finished MP4 itself (no browser) and prints what is really in it:
// brands, whether the moov box comes before the media (fast start), each track's codec, size, duration, sample count, keyframe spacing and bit rate.
import fs from 'node:fs';
import path from 'node:path';
import { root } from './runner.mjs';

const file = process.argv[2] || path.join(root, 'video', '패치영상_2026-10-10.mp4');
const b = fs.readFileSync(file);
const u32 = (o) => b.readUInt32BE(o);
const u16 = (o) => b.readUInt16BE(o);
const fourcc = (o) => b.toString('latin1', o, o + 4);

function boxes(start, end) {
  const out = [];
  let o = start;
  while (o + 8 <= end) {
    let size = u32(o), hdr = 8;
    const type = fourcc(o + 4);
    if (size === 1) { size = Number(b.readBigUInt64BE(o + 8)); hdr = 16; }
    if (size === 0) size = end - o;
    out.push({ type, start: o, body: o + hdr, end: o + size });
    o += size;
  }
  return out;
}
const find = (list, type) => list.find((x) => x.type === type);
const kids = (x) => boxes(x.body, x.end);

const top = boxes(0, b.length);
console.log('file', file, (b.length / 1048576).toFixed(2), 'MB');
console.log('top-level boxes:', top.map((x) => `${x.type}@${x.start}`).join(' '));
const ftyp = find(top, 'ftyp');
console.log('brand', fourcc(ftyp.body), 'compatible', (() => { const r = []; for (let o = ftyp.body + 8; o < ftyp.end; o += 4) r.push(fourcc(o)); return r.join(','); })());
const moov = find(top, 'moov'), mdat = find(top, 'mdat');
console.log('fast start (moov before mdat):', moov.start < mdat.start);
const mvhd = find(kids(moov), 'mvhd');
const mvTimescale = u32(mvhd.body + 12), mvDur = u32(mvhd.body + 16);
console.log('movie duration', (mvDur / mvTimescale).toFixed(3), 's');
for (const trak of kids(moov).filter((x) => x.type === 'trak')) {
  const k = kids(trak);
  const tkhd = find(k, 'tkhd');
  const mdia = find(k, 'mdia'), mk = kids(mdia);
  const mdhd = find(mk, 'mdhd');
  const ts = u32(mdhd.body + 12), dur = u32(mdhd.body + 16);
  const hdlr = find(mk, 'hdlr');
  const handler = fourcc(hdlr.body + 8);
  const stbl = find(kids(find(mk, 'minf')), 'stbl'), sk = kids(stbl);
  const stsd = find(sk, 'stsd');
  const entry = boxes(stsd.body + 8, stsd.end)[0];
  const info = { handler, codec: entry.type, timescale: ts, seconds: +(dur / ts).toFixed(3) };
  if (handler === 'vide') {
    info.width = u16(entry.body + 24); info.height = u16(entry.body + 26);
    const avcC = find(boxes(entry.body + 78, entry.end), 'avcC');
    if (avcC) info.avc = { profileIdc: b[avcC.body + 1], profileCompat: b[avcC.body + 2], levelIdc: b[avcC.body + 3], codecString: 'avc1.' + [1, 2, 3].map((i) => b[avcC.body + i].toString(16).padStart(2, '0')).join('') };
    const stts = find(sk, 'stts');
    const n = u32(stts.body + 4);
    let samples = 0, firstDelta = u32(stts.body + 12);
    for (let i = 0; i < n; i++) samples += u32(stts.body + 8 + i * 8);
    info.samples = samples; info.frameRate = +(ts / firstDelta).toFixed(2);
    const stss = find(sk, 'stss');
    if (stss) {
      const cnt = u32(stss.body + 4);
      const idx = [];
      for (let i = 0; i < cnt; i++) idx.push(u32(stss.body + 8 + i * 4));
      const gaps = new Set();
      for (let i = 1; i < idx.length; i++) gaps.add(idx[i] - idx[i - 1]);
      info.keyframes = cnt; info.keyframeEveryFrames = [...gaps].join('/') + ' (' + (([...gaps][0] || 0) / info.frameRate).toFixed(2) + ' s)';
    }
  } else if (handler === 'soun') {
    info.channels = u16(entry.body + 16); info.sampleRate = u32(entry.body + 24) >>> 16;
    const esds = find(boxes(entry.body + 28, entry.end), 'esds');
    if (esds) info.esdsBytes = esds.end - esds.start;
    const stts = find(sk, 'stts');
    const n = u32(stts.body + 4);
    let samples = 0;
    for (let i = 0; i < n; i++) samples += u32(stts.body + 8 + i * 8);
    info.aacFrames = samples;
  }
  const stsz = find(sk, 'stsz');
  let bytes = 0;
  const fixed = u32(stsz.body + 4), cnt = u32(stsz.body + 8);
  if (fixed) bytes = fixed * cnt; else for (let i = 0; i < cnt; i++) bytes += u32(stsz.body + 12 + i * 4);
  info.payloadMB = +(bytes / 1048576).toFixed(2);
  info.kbps = Math.round((bytes * 8) / (dur / ts) / 1000);
  console.log('track', JSON.stringify(info));
}
