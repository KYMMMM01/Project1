/**
 * The mixing graph, built identically for the live engine and for offline music renders (the
 * quality report), so what the report measures is what the player hears.
 *
 *   sfxBus ----------------------------------> master
 *   musicBus -> duckGain --------------------> master
 *   reverbIn -> convolver -> musicBus (wet)
 *   master -> muteGain -> limiter (DynamicsCompressor) -> destination
 */
import { impulseBuffer } from './synth';

/** Base gains: music sits well under the effects so a pile of hits is never buried. */
export const SFX_BASE = 1;
export const MUSIC_BASE = 0.5;
const MASTER_GAIN = 0.85;

export interface AudioGraph {
  master: GainNode;
  sfxBus: GainNode;
  musicBus: GainNode;
  duckGain: GainNode;
  muteGain: GainNode;
  limiter: DynamicsCompressorNode;
  reverbIn: GainNode;
}

export function createGraph(ctx: BaseAudioContext): AudioGraph {
  const master = ctx.createGain();
  master.gain.value = MASTER_GAIN;
  const sfxBus = ctx.createGain();
  sfxBus.gain.value = SFX_BASE;
  const musicBus = ctx.createGain();
  musicBus.gain.value = MUSIC_BASE;
  const duckGain = ctx.createGain();
  const muteGain = ctx.createGain();

  // Safety limiter, not a mastering compressor: the baked levels leave headroom, so it only acts on pile-ups.
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -8;
  limiter.knee.value = 6;
  limiter.ratio.value = 14;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.14;

  sfxBus.connect(master);
  musicBus.connect(duckGain);
  duckGain.connect(master);
  master.connect(muteGain);
  muteGain.connect(limiter);
  limiter.connect(ctx.destination);

  const reverbIn = ctx.createGain();
  const convolver = ctx.createConvolver();
  convolver.buffer = impulseBuffer(ctx, 1.1, 0.4);
  reverbIn.connect(convolver);
  convolver.connect(musicBus);

  return { master, sfxBus, musicBus, duckGain, muteGain, limiter, reverbIn };
}
