/**
 * Independent random streams (rules §1). Each purpose draws only from its own stream, in its own
 * order, so the n-th summon / pick / merge result does not depend on when the player clicks.
 */
import { Rng } from '@/core/rng';

const STREAM_NAMES = ['summon', 'pick', 'merge', 'toy', 'sun', 'wave', 'combat'] as const;
export type StreamName = (typeof STREAM_NAMES)[number];

/** hash(seed, name): FNV-1a over the name, seeded by an avalanche-mixed run seed. */
function streamSeed(seed: number, name: string): number {
  let h = Math.imul((seed ^ (seed >>> 16)) >>> 0, 0x45d9f3b) >>> 0;
  h = (h ^ 0x811c9dc5) >>> 0;
  for (let i = 0; i < name.length; i++) h = Math.imul(h ^ name.charCodeAt(i), 0x01000193) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

export class Streams {
  readonly summon: Rng;
  readonly pick: Rng;
  readonly merge: Rng;
  readonly toy: Rng;
  readonly sun: Rng;
  readonly wave: Rng;
  readonly combat: Rng;

  constructor(seed: number) {
    this.summon = new Rng(streamSeed(seed, 'summon'));
    this.pick = new Rng(streamSeed(seed, 'pick'));
    this.merge = new Rng(streamSeed(seed, 'merge'));
    this.toy = new Rng(streamSeed(seed, 'toy'));
    this.sun = new Rng(streamSeed(seed, 'sun'));
    this.wave = new Rng(streamSeed(seed, 'wave'));
    this.combat = new Rng(streamSeed(seed, 'combat'));
  }

  states(): number[] {
    return STREAM_NAMES.map((n) => this[n].state >>> 0);
  }

  restore(states: readonly number[]): void {
    STREAM_NAMES.forEach((n, i) => {
      this[n].state = states[i] as number;
    });
  }
}
