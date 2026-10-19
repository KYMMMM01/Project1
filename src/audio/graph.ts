/**
 * The mixing graph, built identically for the live engine and for offline music renders (the
 * quality report), so what the report measures is what the player hears.
 *
 *   fightBus -> fightDuck --\
 *   skillBus ---------------+-> sfxBus -> master
 *   uiBus -----------------/
 *   musicBus -> musicLpf -> duckGain ------> master
 *   reverbIn -> convolver -> musicBus (wet)
 *   master -> muteGain -> limiter (DynamicsCompressor) -> softClip (WaveShaper) -> destination
 *
 * Every sound effect goes through one of three buses by what it is (`busOf`): what the fight repeats (weapons, enemies), the cats' skills and the big
 * moments, and the interface and the rewards. The fight bus has a gain of its own that gives way for a big moment (`fightDuck`, see hush.ts), and the
 * very last stage bends anything that gets past the limiter under -0.5 dBFS (envelopes.ts `ceilingCurve`).
 */
import { ceilingCurve } from './envelopes';
import type { Cat } from './recipe';
import { impulseBuffer } from './synth';

/** Base gains: music sits well under the effects so a pile of hits is never buried. */
export const SFX_BASE = 1;
export const MUSIC_BASE = 0.22;
const MASTER_GAIN = 0.85;
/**
 * The levels of the three effect buses, before the user's volume (which acts on `sfxBus`, above all three). The fight bus is 2 dB up: the hit pass of 2026-10-19 levelled the weapons by what a
 * blow needs (the crack in front, a release lighter than its landing, the star archer's ping 5 dB down), which left an ordinary second of a fight 2 to 4 dB under where it was, and the
 * hits are what the testers asked to hear. The skills' signatures are not lifted with it (the hush takes 3 dB of the fight bus back under every one of them).
 */
export const BUS_LEVEL = { fight: 1.26, skill: 1, ui: 1 } as const;
/** Fully open setting of the music low-pass: transparent, so only a defeat muffle ever moves it. */
export const MUSIC_LPF_OPEN = 20000;
/** The last stage lets nothing past this (about -0.5 dBFS) and leaves everything under `SOFT_CLIP_KNEE` as it is. */
export const SOFT_CLIP_CEILING = 0.944;
export const SOFT_CLIP_KNEE = 0.6;

export type BusId = 'fight' | 'skill' | 'ui';

/** Which bus a loudness family plays through. */
export function busOf(cat: Cat): BusId {
  switch (cat) {
    case 'fire':
    case 'swing':
    case 'hit':
    case 'impact':
    case 'foe':
    case 'combat':
      return 'fight';
    case 'skill':
    case 'skillTick':
    case 'big':
    case 'finale':
    case 'stinger':
      return 'skill';
    default:
      return 'ui';
  }
}

export interface AudioGraph {
  master: GainNode;
  sfxBus: GainNode;
  musicBus: GainNode;
  duckGain: GainNode;
  /** Muffles the music under a defeat; reverb returns pass through it too. */
  musicLpf: BiquadFilterNode;
  muteGain: GainNode;
  limiter: DynamicsCompressorNode;
  reverbIn: GainNode;
  /** The three effect buses (all of them end in `sfxBus`); the fight bus passes through `fightDuck`, the gain a big moment dips. */
  fightBus: GainNode;
  fightDuck: GainNode;
  skillBus: GainNode;
  uiBus: GainNode;
  /** The ceiling after the limiter. */
  softClip: WaveShaperNode;
}

/** The node a sound of loudness family `cat` is connected to. */
export function busNode(graph: AudioGraph, cat: Cat): GainNode {
  const bus = busOf(cat);
  return bus === 'fight' ? graph.fightBus : bus === 'skill' ? graph.skillBus : graph.uiBus;
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
  const musicLpf = ctx.createBiquadFilter();
  musicLpf.type = 'lowpass';
  musicLpf.frequency.value = MUSIC_LPF_OPEN;
  musicLpf.Q.value = 0.5;

  // Safety limiter, not a mastering compressor: the baked levels leave headroom, so it only acts on
  // pile-ups. A higher threshold with a hard ratio pumped less than -12 dB / 8:1 in the offline
  // pile-up test (gain swing 2-4 dB against 4-5 dB), and keeps the worst case below clipping.
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -8;
  limiter.knee.value = 6;
  limiter.ratio.value = 14;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.14;

  sfxBus.connect(master);
  musicBus.connect(musicLpf);
  musicLpf.connect(duckGain);
  duckGain.connect(master);
  master.connect(muteGain);
  muteGain.connect(limiter);

  const reverbIn = ctx.createGain();
  const convolver = ctx.createConvolver();
  convolver.buffer = impulseBuffer(ctx, 1.1, 0.4);
  reverbIn.connect(convolver);
  convolver.connect(musicBus);

  // (created after the nodes above on purpose: the music player and the tests count gain nodes from the start)
  const fightBus = ctx.createGain();
  fightBus.gain.value = BUS_LEVEL.fight;
  const fightDuck = ctx.createGain();
  const skillBus = ctx.createGain();
  skillBus.gain.value = BUS_LEVEL.skill;
  const uiBus = ctx.createGain();
  uiBus.gain.value = BUS_LEVEL.ui;
  fightBus.connect(fightDuck);
  fightDuck.connect(sfxBus);
  skillBus.connect(sfxBus);
  uiBus.connect(sfxBus);

  // What gets past the limiter's 3 ms attack is bent under the ceiling here; below the knee the signal is not touched.
  const softClip = ctx.createWaveShaper();
  softClip.curve = ceilingCurve(SOFT_CLIP_CEILING, SOFT_CLIP_KNEE);
  softClip.oversample = '2x';
  limiter.connect(softClip);
  softClip.connect(ctx.destination);

  return { master, sfxBus, musicBus, duckGain, musicLpf, muteGain, limiter, reverbIn, fightBus, fightDuck, skillBus, uiBus, softClip };
}
