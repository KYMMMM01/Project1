/**
 * The director of a chest opening: timing and order only, no pictures, no sound, no Pixi. The view feeds it frame times and the player's
 * taps and does what each event says on that very frame (so a thud is heard on the frame the chest lands). It never plays itself faster
 * or slower than it is told: left alone it runs the whole opening; a tap moves it one step on.
 *
 * Wind-up: the chest drops, lands, then shakes in bursts of rising power. A tap starts the next burst at once (cutting the running one
 * short), so a player can crack it open in as many taps as there are bursts; left alone the bursts follow each other. After the last
 * one the chest holds its breath, then pops. Cards: the stacks are grouped into beats (commons travel together, higher ranks alone);
 * each beat rises out of the opening, wobbles face down, flips, shows itself and flies to its place in the summary. The next beat
 * rises as soon as the one before it flies, so the flights overlap and a pile never drags.
 */
import type { ChestRarity } from '@/meta/types';
import { bestRarity, type RevealStack } from './revealPlan';

export type ChestPhase = 'drop' | 'idle' | 'burst' | 'hold' | 'open';
export type BeatPhase = 'queued' | 'rise' | 'wobble' | 'flip' | 'show' | 'fly' | 'placed';

/** Which stacks (indices into the reveal's stack list) travel together, and the rank they share. */
export interface BeatPlan {
  stacks: number[];
  rarity: ChestRarity;
  /** The last beat, the one with the best stack: that stack alone, unless the best card is a common. */
  last: boolean;
}

export type FlowEvent =
  | { type: 'land' }
  | { type: 'burst'; index: number; power: number; tapped: boolean }
  | { type: 'hold'; duration: number }
  | { type: 'pop' }
  | { type: 'rise' | 'wobble' | 'flip' | 'show' | 'fly' | 'place'; beat: number }
  | { type: 'tick'; beat: number; n: number }
  | { type: 'summary' };

/** All times in seconds. */
export const TIMES = {
  /** The fall: the shadow tells it first. */
  drop: 0.3,
  /** Quiet moment after the landing before the first burst when nobody taps, and between two bursts. */
  landRest: 0.12,
  burstGap: 0.08,
  burst: [0.32, 0.36, 0.4] as readonly number[],
  /** The held breath before the pop; the open sound creaks for `creak` and pops, so it starts that long before the pop. */
  hold: { common: 0.32, rare: 0.32, epic: 0.34, legendary: 0.46 } as Record<ChestRarity, number>,
  creak: 0.3,
  /** Reduced motion: the closed chest is shown this long (its tag already tells the rarity) before it opens. */
  still: 0.5,
  /** From the pop to the first beat rising out of the opening. */
  popToCard: 0.2,
  rise: { common: 0.24, rare: 0.3, epic: 0.34, legendary: 0.4 } as Record<ChestRarity, number>,
  wobble: { common: 0.08, rare: 0.36, epic: 0.62, legendary: 0.9 } as Record<ChestRarity, number>,
  ticks: { common: 0, rare: 2, epic: 3, legendary: 5 } as Record<ChestRarity, number>,
  flip: 0.24,
  /** The face is held on stage this long before it flies down. */
  show: { common: 0.1, rare: 0.26, epic: 0.45, legendary: 0.85 } as Record<ChestRarity, number>,
  stillShow: { common: 0.4, rare: 0.45, epic: 0.55, legendary: 0.7 } as Record<ChestRarity, number>,
  fly: 0.36,
  /** Delay between the cards of one beat on their way down. */
  stagger: 0.05,
  /** From the last card in its place to the summary. */
  summaryDelay: 0.12,
};

/** Share of the flip at which the card is edge-on and the face takes over from the back. */
export const FLIP_TURN = 0.4;

/** Rattles by the best rarity inside: a better chest makes you wait through one more. */
const BURSTS: Record<ChestRarity, number> = { common: 2, rare: 2, epic: 3, legendary: 3 };

/** Power of each burst: it rises burst by burst, the last is always full. */
export function burstPowers(count: number): number[] {
  return count === 2 ? [0.55, 1] : [0.4, 0.7, 1];
}

/** How a run of equal-rank stacks is split into beats: up to `solo` of them go one by one, more are grouped `group` at a time. */
const GROUPING: Record<ChestRarity, { solo: number; group: number }> = {
  common: { solo: 0, group: 4 },
  rare: { solo: 1, group: 3 },
  epic: { solo: 2, group: 2 },
  legendary: { solo: 3, group: 2 },
};

/**
 * Group the stacks (lowest rank first, best last) into beats. The best stack is a beat of its own at the end (unless it is a common).
 * Commons always travel together, up to four to a beat; a rank with only a few stacks shows them one by one; a long run is split in groups of
 * nearly equal size, so a pile with many stacks does not drag.
 */
export function beatsOf(stacks: readonly RevealStack[]): BeatPlan[] {
  const out: BeatPlan[] = [];
  const n = stacks.length;
  const best = stacks[n - 1];
  // Only a best card above common is worth a beat of its own: a chest of commons is all one run.
  const upto = best && best.rarity !== 'common' ? n - 1 : n;
  let i = 0;
  while (i < upto) {
    const rarity = (stacks[i] as RevealStack).rarity;
    let j = i;
    while (j < upto && (stacks[j] as RevealStack).rarity === rarity) j++;
    const run = j - i;
    const rule = GROUPING[rarity];
    const groups = run <= rule.solo ? run : Math.ceil(run / rule.group);
    let at = i;
    for (let g = 0; g < groups; g++) {
      const size = Math.floor(run / groups) + (g < run % groups ? 1 : 0);
      out.push({ stacks: Array.from({ length: size }, (_, k) => at + k), rarity, last: false });
      at += size;
    }
    i = j;
  }
  if (best && upto < n) out.push({ stacks: [n - 1], rarity: best.rarity, last: false });
  const lastBeat = out[out.length - 1];
  if (lastBeat) lastBeat.last = true;
  return out;
}

export interface ChestState {
  phase: ChestPhase;
  /** Seconds in the current phase (since the pop, once it is open). */
  age: number;
  /** Index of the burst that last started (-1 before the first). */
  burst: number;
  burstDur: number;
  power: number;
  holdDur: number;
  /** Seconds since the chest landed and since the last effective tap (large before either). */
  sinceLand: number;
  sinceTap: number;
  /** How far the paper fan behind the chest has grown, 0..1. It only ever grows. */
  fan: number;
  fanGoal: number;
}

export interface BeatState {
  plan: BeatPlan;
  phase: BeatPhase;
  /** Seconds in the current phase and how long the phase lasts. */
  age: number;
  dur: number;
  ticks: number;
}

function isPlaced(b: BeatState): boolean {
  return b.phase === 'placed';
}

const NEXT: Record<BeatPhase, BeatPhase> = { queued: 'rise', rise: 'wobble', wobble: 'flip', flip: 'show', show: 'fly', fly: 'placed', placed: 'placed' };

/** Beats beyond this many are played faster, down to half speed, so the opening of a big pile stays brisk. */
const PACE_FROM = 5;

export class RevealFlow {
  readonly chest: ChestState = {
    phase: 'drop', age: 0, burst: -1, burstDur: 0, power: 0, holdDur: 0, sinceLand: 99, sinceTap: 99, fan: 0.12, fanGoal: 0.15,
  };
  readonly beats: BeatState[];
  readonly best: ChestRarity;
  readonly bursts: number;
  /** The summary has been announced: nothing is left to play. */
  summarised = false;
  private readonly powers: number[];
  private readonly pace: number;
  private nextBeat = 0;
  private pendingTap = false;
  private endAge = 0;
  private started = false;

  constructor(stacks: readonly RevealStack[], private readonly emit: (e: FlowEvent) => void, private readonly still = false) {
    this.best = bestRarity(stacks);
    this.bursts = BURSTS[this.best];
    this.powers = burstPowers(this.bursts);
    this.beats = beatsOf(stacks).map((plan) => ({ plan, phase: 'queued', age: 0, dur: 0, ticks: 0 }));
    this.pace = Math.min(1, Math.max(0.5, 1 - 0.06 * Math.max(0, this.beats.length - PACE_FROM)));
  }

  /** Advance by `dt` seconds. Everything that falls due inside the step fires, in order, before it returns. */
  update(dt: number): void {
    if (this.summarised) return;
    const c = this.chest;
    if (!this.started) {
      this.started = true;
      if (this.still) {
        // No fall and no bursts: the closed chest stands there for a moment, then opens.
        c.phase = 'hold';
        c.holdDur = TIMES.still;
        c.sinceLand = 0;
        c.fan = c.fanGoal = 0.6;
        this.emit({ type: 'hold', duration: c.holdDur });
      }
    }
    c.sinceTap += dt;
    if (c.phase !== 'drop') c.sinceLand += dt;
    this.updateChest(dt);
    if (this.summarised) return;
    c.fan = Math.min(c.fanGoal, c.fan + dt * 2.4);
    this.updateBeats(dt);
  }

  private updateChest(dt: number): void {
    const c = this.chest;
    c.age += dt;
    for (let guard = 0; guard < 16; guard++) {
      if (c.phase === 'drop' && c.age >= TIMES.drop) {
        c.age -= TIMES.drop;
        c.phase = 'idle';
        c.sinceLand = c.age;
        c.fanGoal = 0.25;
        this.emit({ type: 'land' });
        if (this.pendingTap) {
          this.pendingTap = false;
          c.sinceTap = 0;
          this.startBurst(true, c.age);
        }
      } else if (c.phase === 'idle' && c.age >= (c.burst < 0 ? TIMES.landRest : TIMES.burstGap)) {
        c.age -= c.burst < 0 ? TIMES.landRest : TIMES.burstGap;
        this.startBurst(false, c.age);
      } else if (c.phase === 'burst' && c.age >= c.burstDur) {
        c.age -= c.burstDur;
        if (c.burst + 1 < this.bursts) c.phase = 'idle';
        else this.startHold(c.age);
      } else if (c.phase === 'hold' && c.age >= c.holdDur) {
        c.age -= c.holdDur;
        this.pop();
      } else break;
    }
  }

  /** `carry` is the time already spent in the new phase when the step that started it overshot the boundary. */
  private startBurst(tapped: boolean, carry: number): void {
    const c = this.chest;
    c.burst++;
    c.phase = 'burst';
    c.age = carry;
    c.burstDur = TIMES.burst[c.burst] as number;
    c.power = this.powers[c.burst] as number;
    c.fanGoal = Math.max(c.fanGoal, 0.3 + (0.5 * (c.burst + 1)) / this.bursts);
    this.emit({ type: 'burst', index: c.burst, power: c.power, tapped });
  }

  private startHold(carry: number): void {
    const c = this.chest;
    c.phase = 'hold';
    c.age = carry;
    c.holdDur = TIMES.hold[this.best];
    c.fanGoal = 1;
    this.emit({ type: 'hold', duration: c.holdDur });
  }

  private pop(): void {
    const c = this.chest;
    c.phase = 'open';
    c.fanGoal = 1;
    this.emit({ type: 'pop' });
  }

  private updateBeats(dt: number): void {
    const c = this.chest;
    if (c.phase !== 'open') return;
    for (let i = 0; i < this.beats.length; i++) {
      const b = this.beats[i] as BeatState;
      if (b.phase === 'queued' || b.phase === 'placed') continue;
      b.age += dt;
      if (b.phase === 'wobble') {
        const total = this.tickCount(b);
        while (b.ticks < total && b.age >= this.tickAt(b, b.ticks)) this.emit({ type: 'tick', beat: i, n: b.ticks++ });
      }
      for (let guard = 0; guard < 8 && !isPlaced(b) && b.age >= b.dur; guard++) {
        const over = b.age - b.dur;
        this.enter(i, NEXT[b.phase]);
        b.age = over;
      }
    }
    if (this.nextBeat === 0 && this.beats.length > 0 && c.age >= TIMES.popToCard) this.startBeat(0);
    if (this.nextBeat >= this.beats.length && c.age >= TIMES.popToCard && this.allPlaced()) {
      this.endAge += dt;
      if (this.endAge >= TIMES.summaryDelay) this.finish();
    }
  }

  private allPlaced(): boolean {
    for (let i = 0; i < this.beats.length; i++) if (!isPlaced(this.beats[i] as BeatState)) return false;
    return true;
  }

  private startBeat(i: number): void {
    if (i !== this.nextBeat || i >= this.beats.length) return;
    this.nextBeat++;
    this.enter(i, 'rise');
  }

  private enter(i: number, phase: BeatPhase): void {
    const b = this.beats[i] as BeatState;
    b.phase = phase;
    b.age = 0;
    b.dur = this.durationOf(b, phase);
    b.ticks = 0;
    if (phase !== 'queued') this.emit({ type: phase === 'placed' ? 'place' : phase, beat: i });
    // The next beat rises as soon as this one flies: the flights overlap.
    if (phase === 'fly') this.startBeat(i + 1);
  }

  private durationOf(b: BeatState, phase: BeatPhase): number {
    const r = b.plan.rarity;
    if (this.still) return phase === 'show' ? TIMES.stillShow[r] : 0;
    const pace = b.plan.last ? 1 : this.pace;
    switch (phase) {
      case 'rise':
        return TIMES.rise[r] * pace;
      case 'wobble':
        return TIMES.wobble[r] * pace;
      case 'flip':
        return TIMES.flip;
      case 'show':
        return TIMES.show[r] * pace;
      case 'fly':
        return (TIMES.fly + (b.plan.stacks.length - 1) * TIMES.stagger) * (b.plan.last ? 1 : Math.max(0.7, this.pace));
      default:
        return 0;
    }
  }

  /** Small rising sounds while a card wobbles: more of them for a higher rank, closer and closer together. */
  private tickCount(b: BeatState): number {
    return this.still ? 0 : TIMES.ticks[b.plan.rarity];
  }

  private tickAt(b: BeatState, n: number): number {
    const total = this.tickCount(b);
    return b.dur * (1 - Math.pow(1 - (n + 1) / (total + 1), 1.6));
  }

  /** A tap: the next burst at once during the wind-up, a step on for the card on stage after the pop. False when it did nothing. */
  tap(): boolean {
    if (this.summarised) return false;
    const c = this.chest;
    switch (c.phase) {
      case 'drop':
        // Taken now, played the moment the chest lands.
        this.pendingTap = true;
        return true;
      case 'idle':
        c.sinceTap = 0;
        this.startBurst(true, 0);
        return true;
      case 'burst':
        c.sinceTap = 0;
        if (c.burst + 1 < this.bursts) this.startBurst(true, 0);
        else this.startHold(0);
        return true;
      case 'hold':
        if (!this.still) return false;
        c.age = 0;
        this.pop();
        return true;
      case 'open':
        return this.hurry();
    }
  }

  /** Move the card on stage to its next step: face-down cards turn over, shown cards fly down, flying cards land. */
  private hurry(): boolean {
    for (let i = 0; i < this.beats.length; i++) {
      const b = this.beats[i] as BeatState;
      if (b.phase === 'rise' || b.phase === 'wobble') this.enter(i, 'flip');
      else if (b.phase === 'flip') this.enter(i, 'show');
      else if (b.phase === 'show') this.enter(i, 'fly');
      else continue;
      return true;
    }
    if (this.nextBeat < this.beats.length) {
      this.startBeat(this.nextBeat);
      return true;
    }
    for (let i = 0; i < this.beats.length; i++) {
      if ((this.beats[i] as BeatState).phase !== 'fly') continue;
      this.enter(i, 'placed');
      return true;
    }
    return false;
  }

  /** Everything is as good as played: every beat in its place, the summary announced once. */
  skip(): void {
    if (this.summarised) return;
    this.chest.phase = 'open';
    this.nextBeat = this.beats.length;
    for (const b of this.beats) b.phase = 'placed';
    this.finish();
  }

  private finish(): void {
    if (this.summarised) return;
    this.summarised = true;
    this.emit({ type: 'summary' });
  }
}
