/**
 * Dev hooks on window.__dbg.audio (installed only when debug is enabled; lazy chunk):
 *   report()          bake + measure every SFX and stinger          -> SoundReport (incl. .table, .memory)
 *   music(track, i, s) offline-render a track and measure it        -> MusicRow
 *   seam(track, rate)  offline-render one loop and measure the dip at the loop point against the other bar lines -> SeamRow
 *   mix('battle'|'big') offline-render a pile-up with/without the limiter -> MixRow
 *   wave(key, variant, half) baked samples of one sound ("sfx:coin")  -> {sampleRate, channels}
 *                     `half` mixes to mono at half the rate: small enough to dump a whole family
 *   stats() / resetStats()  live voice counters and unlock state
 *   api               the engine itself, so scripts can drive play / music / duck directly
 */
import { debugExpose } from '@/core/debug';
import type { AudioEngine } from './engine';
import { bakeVariant } from './bake';
import { renderMix, renderMusic, renderSeam, runReport } from './report';
import { SOUNDS } from './sounds';
import type { MusicTrackId } from './scores';

export function installAudioDebug(engine: AudioEngine): void {
  debugExpose('audio', {
    api: engine,
    stats: () => engine.stats(),
    resetStats: () => engine.resetStats(),
    report: () => runReport(engine.sampleRate),
    music: (track: MusicTrackId, intensity = 1, seconds = 16) => renderMusic(track, intensity, seconds, engine.sampleRate),
    seam: (track: MusicTrackId, rate = 24000) => renderSeam(track, rate),
    mix: (scenario: 'battle' | 'big' = 'battle') => renderMix(scenario, engine.sampleRate),
    wave: async (key: string, variant = 0, half = false) => {
      const def = SOUNDS.find((d) => d.key === key);
      if (!def) return null;
      const baked = await bakeVariant(def.recipe, def.key, variant, engine.sampleRate);
      const buf = baked.buffer;
      if (half) {
        const n = buf.numberOfChannels;
        const out: number[] = [];
        for (let i = 0; i + 1 < buf.length; i += 2) {
          let sum = 0;
          for (let c = 0; c < n; c++) sum += (buf.getChannelData(c)[i] as number) + (buf.getChannelData(c)[i + 1] as number);
          out.push(Math.round((sum / (2 * n)) * 1e4) / 1e4);
        }
        return { sampleRate: buf.sampleRate / 2, channels: [out] };
      }
      const channels: number[][] = [];
      for (let c = 0; c < buf.numberOfChannels; c++) channels.push(Array.from(buf.getChannelData(c), (x) => Math.round(x * 1e5) / 1e5));
      return { sampleRate: buf.sampleRate, channels };
    },
  });
}
