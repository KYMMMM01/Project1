/**
 * Dev hooks on window.__dbg.audio (installed only when debug is enabled; lazy chunk):
 *   report()          bake + measure every SFX and stinger          -> SoundReport (incl. .table, .memory)
 *   combat()          the weapon and enemy sounds only (fast)       -> CombatReport (.table, .checks, .failing, .closest)
 *   music(track, i, s) offline-render a track and measure it        -> MusicRow
 *   seam(track, rate)  offline-render one loop and measure the dip at the loop point against the other bar lines -> SeamRow
 *   tracks(ids?)      render every track's (or the listed tracks') whole loop at intensity 1, the bed at 0, and check level, clipping, brightness, the loop seam -> MusicReport (.rows, .table, .failing)
 *   mix('battle'|'big'|'fight'|'fight3') offline-render a pile-up with/without the limiter -> MixRow
 *   crowd(speed, seconds) drive the live engine with a crowded fight on a wall-clock timer -> CrowdRow (voices, nodes, drops)
 *   spec(key, variant)  spectrogram of one sound as bytes (40 frames x 48 bins up to 8 kHz) -> {ms, w, h, data}
 *   wave(key, variant, half) baked samples of one sound ("sfx:coin")  -> {sampleRate, channels}
 *                     `half` mixes to mono at half the rate: small enough to dump a whole family
 *   stats() / resetStats()  live voice counters and unlock state
 *   candidate(key, wav) put a take that is not a file of the build in the sample store ("elevenlabs/atk_w_paw_2"; null takes it out) and bake the sounds
 *                     that play it again: a candidate is heard in the game exactly as a shipped take would be -> the keys of the sounds baked again
 *   synthOnly(id)     mark the takes of a sound unreadable and bake it again: the game then plays the sound's own synthesis -> whether it will be baked again
 *   api               the engine itself, so scripts can drive play / music / duck directly
 */
import { debugExpose } from '@/core/debug';
import type { MusicId } from './api';
import type { AudioEngine } from './engine';
import { spectrogram } from './analysis';
import { bakeVariant } from './bake';
import { MAX_TAKES, takesOf } from './recipe';
import { parseWav, sampleStore } from './samples';
import { renderMix, renderMusic, renderSeam, runCombatReport, runMusicReport, runReport } from './report';
import { crowd } from './crowd';
import { SOUNDS } from './sounds';
import type { MusicTrackId } from './scores';

export function installAudioDebug(engine: AudioEngine): void {
  debugExpose('audio', {
    api: engine,
    stats: () => engine.stats(),
    synthOnly: (id: string): boolean => {
      for (let n = 1; n <= MAX_TAKES; n++) sampleStore.block(`elevenlabs/${id}${n === 1 ? '' : `_${n}`}`);
      const def = SOUNDS.find((d) => d.id === id && !d.stinger);
      return def ? engine.rebake(def.index) : false;
    },
    candidate: (key: string, wav: ArrayBuffer | null): string[] => {
      const pcm = wav ? parseWav(wav) : null;
      if (wav && !pcm) throw new Error(`candidate ${key}: not a 16-bit PCM WAV`);
      sampleStore.put(key, pcm);
      // the sound whose take this is (`elevenlabs/<id>` or `elevenlabs/<id>_<n>`) gets as many variants as it now has takes, and is baked again
      const id = key.replace(/^elevenlabs\//, '').replace(/_[2-9]$/, '');
      const again: string[] = [];
      for (const def of SOUNDS) {
        if (def.id !== id && !(def.recipe.needs ?? []).includes(key)) continue;
        def.recipe.variants = Math.min(MAX_TAKES, Math.max(def.recipe.variants ?? 1, takesOf(id).length));
        if (engine.rebake(def.index)) again.push(def.key);
      }
      return again;
    },
    resetStats: () => engine.resetStats(),
    report: () => runReport(engine.sampleRate),
    combat: () => runCombatReport(engine.sampleRate),
    music: (track: MusicTrackId, intensity = 1, seconds = 16) => renderMusic(track, intensity, seconds, engine.sampleRate),
    tracks: (ids?: MusicTrackId[]) => runMusicReport(engine.sampleRate, ids),
    seam: (track: MusicTrackId, rate = 24000) => renderSeam(track, rate),
    mix: (scenario: 'battle' | 'big' | 'fight' | 'fight3' = 'battle') => renderMix(scenario, engine.sampleRate),
    crowd: (speed = 3, seconds = 12, track: MusicId = 'battle') => crowd(engine, speed, seconds, track),
    spec: async (key: string, variant = 0) => {
      const def = SOUNDS.find((d) => d.key === key);
      if (!def) return null;
      const baked = await bakeVariant(def.recipe, def.key, variant, engine.sampleRate);
      const frames = 40;
      const bins = 48;
      const s = spectrogram([baked.buffer.getChannelData(0)], baked.buffer.sampleRate, frames, bins, 8000);
      return { ms: Math.round(s.ms), w: frames, h: bins, data: Array.from(s.data) };
    },
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
