/**
 * Dev hooks on window.__dbg.audio (installed only when debug is enabled; lazy chunk):
 *   report()          bake + measure every SFX and stinger          -> SoundReport (incl. .table)
 *   music(track, i, s) offline-render a track and measure it        -> MusicRow
 *   wave(key, variant) baked samples of one sound ("sfx:coin")       -> {sampleRate, channels}
 *   stats() / resetStats()  live voice counters and unlock state
 */
import { debugExpose } from '@/core/debug';
import type { AudioEngine } from './engine';
import { bakeVariant } from './bake';
import { renderMusic, runReport } from './report';
import { SOUNDS } from './sounds';
import type { MusicTrackId } from './scores';

export function installAudioDebug(engine: AudioEngine): void {
  debugExpose('audio', {
    stats: () => engine.stats(),
    resetStats: () => engine.resetStats(),
    report: () => runReport(engine.sampleRate),
    music: (track: MusicTrackId, intensity = 1, seconds = 16) => renderMusic(track, intensity, seconds, engine.sampleRate),
    wave: async (key: string, variant = 0) => {
      const def = SOUNDS.find((d) => d.key === key);
      if (!def) return null;
      const baked = await bakeVariant(def.recipe, def.key, variant, engine.sampleRate);
      const channels: number[][] = [];
      for (let c = 0; c < baked.buffer.numberOfChannels; c++) {
        channels.push(Array.from(baked.buffer.getChannelData(c), (x) => Math.round(x * 1e5) / 1e5));
      }
      return { sampleRate: baked.buffer.sampleRate, channels };
    },
  });
}
