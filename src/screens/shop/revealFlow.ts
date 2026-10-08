/**
 * The director of a chest opening: timing and order only, no pictures, no sound, no Pixi. The view feeds it frame times and the player's
 * taps and does what each event says on that very frame (so a thud is heard on the frame the chest lands). It never plays itself faster
 * or slower than it is told: left alone it runs the whole opening; a tap moves it one step on.
 *
 * Wind-up: the chest drops and lands, then goes through the beats of its climb (`climb.ts`). Every opening starts on the same quiet
 * colour; a beat may promote the stage's colour one or two ranks (a `promote` event on the frame the beat starts), and the climb ends on
 * the best rank inside and never passes it or goes down. A late climb stalls once, as if it were the last beat, and then cracks to its
 * final colour. The top rank also starts the crown: the stage changes, the chest lifts and the held breath is long. A tap starts the
 * next beat at once (cutting the running one, the stall or the rest), after the last beat the chest holds its breath, then pops.
 * Cards: the stacks are grouped into beats (commons travel together, higher ranks alone); each beat rises out of the opening, wobbles
 * face down, flips, shows itself and flies to its place in the summary; the best card of an epic or legendary chest first shows as a
 * dark silhouette (`shade`) that peels away to the real card. The next beat rises as soon as the one before it flies, so the flights
 * overlap and a pile never drags.
 */
import type { ChestRarity } from '@/meta/types';
import { climbSteps, pickClimb, TOP_RANK, type ClimbPattern } from './climb';
import { bestRarity, rarityRank, SILHOUETTE_FROM, type RevealStack } from './revealPlan';

export type ChestPhase = 'drop' | 'idle' | 'burst' | 'stall' | 'hold' | 'open';
export type BeatPhase = 'queued' | 'rise' | 'wobble' | 'flip' | 'shade' | 'peel' | 'show' | 'fly' | 'placed';

/** Which stacks (indices into the reveal's stack list) travel together, and the rank they share. */
export interface BeatPlan {
  stacks: number[];
  rarity: ChestRarity;
  /** The last beat, the one with the best stack: that stack alone, unless the best card is a common. */
  last: boolean;
  /** The card is first shown as a dark silhouette: the best card of a chest whose best rank is epic or higher. */
  veiled: boolean;
}

export type FlowEvent =
  | { type: 'land' }
  /** The stage's colour climbs from rank `from` to rank `to` (on the frame of the beat that does it; without beats in the still form). */
  | { type: 'promote'; from: number; to: number }
  | { type: 'burst'; index: number; power: number; tapped: boolean }
  | { type: 'stall'; duration: number }
  /** The held breath begins, and its last `TIMES.creak` seconds begin: the open sound creaks and pops on the pop frame. */
  | { type: 'hold'; duration: number }
  | { type: 'creak' }
  | { type: 'pop' }
  | { type: 'rise' | 'wobble' | 'flip' | 'shade' | 'peel' | 'show' | 'fly' | 'place'; beat: number }
  | { type: 'tick'; beat: number; n: number }
  | { type: 'summary' };

/** All times in seconds. */
export const TIMES = {
  /** The fall: the shadow tells it first. */
  drop: 0.3,
  /** Quiet moment after the landing before the first beat when nobody taps, and between two beats. */
  landRest: 0.1,
  gap: 0.06,
  /** A quiet beat; a promotion beat is harder and longer (the new colour is read in its tail), a leap over two ranks longer still. */
  beat: 0.3,
  promote: 0.62,
  leap: 0.74,
  /** The late promotion's breath: the chest goes still as if it were about to open. */
  stall: 0.55,
  /** The held breath before the pop (the top rank's is long); the open sound creaks for `creak` and pops, so it starts that long before the pop. */
  hold: { common: 0.3, rare: 0.5, epic: 0.5, legendary: 1.2 } as Record<ChestRarity, number>,
  creak: 0.3,
  /** Reduced motion: the neutral chest and each colour after it are shown this long. */
  still: 0.5,
  /** From the pop to the first beat rising out of the opening. */
  popToCard: 0.16,
  rise: { common: 0.24, rare: 0.3, epic: 0.34, legendary: 0.4 } as Record<ChestRarity, number>,
  wobble: { common: 0.08, rare: 0.36, epic: 0.62, legendary: 0.9 } as Record<ChestRarity, number>,
  ticks: { common: 0, rare: 2, epic: 3, legendary: 5 } as Record<ChestRarity, number>,
  flip: 0.24,
  /** The silhouette is held this long (by the rank of the card), then peels away in `peel`. */
  shade: { common: 0, rare: 0, epic: 0.6, legendary: 0.9 } as Record<ChestRarity, number>,
  peel: 0.3,
  stillShade: 0.4,
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

/** How long a beat lasts by the ranks it climbs (0 for a quiet beat). */
export function beatDuration(climb: number): number {
  return climb >= 2 ? TIMES.leap : climb === 1 ? TIMES.promote : TIMES.beat;
}

/** How many hops a beat makes: a promotion has one more than a quiet beat, a leap two more. */
export function beatHops(climb: number): number {
  return 2 + Math.min(2, climb);
}

/** How hard a beat shakes: quiet beats build slowly and stay under every promotion, each promoted rank shakes harder than the one before and the top is full. */
export function beatPower(index: number, climb: number, to: number): number {
  return climb > 0 ? Math.min(1, 0.72 + 0.1 * to) : Math.min(0.62, 0.36 + 0.08 * index);
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
      out.push({ stacks: Array.from({ length: size }, (_, k) => at + k), rarity, last: false, veiled: false });
      at += size;
    }
    i = j;
  }
  if (best && upto < n) out.push({ stacks: [n - 1], rarity: best.rarity, last: false, veiled: false });
  const lastBeat = out[out.length - 1];
  if (lastBeat) {
    lastBeat.last = true;
    lastBeat.veiled = rarityRank(lastBeat.rarity) >= SILHOUETTE_FROM;
  }
  return out;
}

export interface ChestState {
  phase: ChestPhase;
  /** Seconds in the current phase (since the pop, once it is open). */
  age: number;
  /** Index of the beat that last started (-1 before the first), how long it lasts, how hard it shakes, how many hops it makes and how many ranks it climbed. */
  burst: number;
  burstDur: number;
  power: number;
  hops: number;
  climb: number;
  /** How long the current held breath or stall lasts. */
  holdDur: number;
  /** Seconds since the chest landed and since the last effective tap (large before either). */
  sinceLand: number;
  sinceTap: number;
  /** The colour the stage shows now (a rank): promoted on a beat, never lowered, never past the best rank. */
  rank: number;
  /** Seconds since the last promotion (large before the first), and since the stage reached the top rank (negative before). */
  sincePromo: number;
  crown: number;
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

function nextPhase(b: BeatState): BeatPhase {
  switch (b.phase) {
    case 'queued':
      return 'rise';
    case 'rise':
      return 'wobble';
    case 'wobble':
      return 'flip';
    case 'flip':
      return b.plan.veiled ? 'shade' : 'show';
    case 'shade':
      return 'peel';
    case 'peel':
      return 'show';
    case 'show':
      return 'fly';
    default:
      return 'placed';
  }
}

/** Beats beyond this many are played faster, down to half speed, so the opening of a big pile stays brisk. */
const PACE_FROM = 5;

export interface FlowOpts {
  /** Reduced motion: no fall and no beats, each colour of the climb is shown still. */
  still?: boolean;
  /** Picks the climb pattern from the table (the same seed always picks the same one). */
  seed?: number;
  /** A pattern to play instead of the pick. */
  climb?: ClimbPattern;
}

export class RevealFlow {
  readonly chest: ChestState = {
    phase: 'drop', age: 0, burst: -1, burstDur: 0, power: 0, hops: 2, climb: 0, holdDur: 0, sinceLand: 99, sinceTap: 99, rank: 0, sincePromo: 99, crown: -1,
  };
  readonly beats: BeatState[];
  readonly best: ChestRarity;
  readonly climb: ClimbPattern;
  /** Beats of the wind-up. */
  readonly bursts: number;
  /** The summary has been announced: nothing is left to play. */
  summarised = false;
  private readonly still: boolean;
  private readonly steps: number[];
  private readonly pace: number;
  private nextBeat = 0;
  private pendingTap = false;
  private endAge = 0;
  private started = false;
  /** The rest before the next beat, and how far the still form has come through the climb. */
  private gap = TIMES.landRest;
  private stillAt = 0;
  /** The held breath has reached its creak. */
  private creaked = false;

  constructor(stacks: readonly RevealStack[], private readonly emit: (e: FlowEvent) => void, opts: FlowOpts = {}) {
    this.still = opts.still ?? false;
    this.best = bestRarity(stacks);
    this.climb = opts.climb ?? pickClimb(this.best, opts.seed ?? 0);
    this.steps = climbSteps(this.climb);
    this.bursts = this.climb.beats.length;
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
        // No fall and no beats: the neutral chest stands there, then each colour of the climb, then it opens.
        c.phase = 'idle';
        c.sinceLand = 0;
        this.gap = TIMES.still;
      }
    }
    c.sinceTap += dt;
    c.sincePromo += dt;
    if (c.crown >= 0) c.crown += dt;
    if (c.phase !== 'drop') c.sinceLand += dt;
    if (this.still) this.updateStill(dt);
    else this.updateChest(dt);
    if (this.summarised) return;
    this.updateBeats(dt);
  }

  private updateChest(dt: number): void {
    const c = this.chest;
    c.age += dt;
    for (let guard = 0; guard < 24; guard++) {
      if (c.phase === 'drop' && c.age >= TIMES.drop) {
        c.age -= TIMES.drop;
        c.phase = 'idle';
        c.sinceLand = c.age;
        this.gap = TIMES.landRest;
        this.emit({ type: 'land' });
        if (this.pendingTap) {
          this.pendingTap = false;
          c.sinceTap = 0;
          this.startBurst(true, c.age);
        }
      } else if (c.phase === 'idle' && c.age >= this.gap) {
        c.age -= this.gap;
        this.following(c.age);
      } else if (c.phase === 'burst' && c.age >= c.burstDur) {
        c.age -= c.burstDur;
        this.endBeat();
      } else if (c.phase === 'stall' && c.age >= c.holdDur) {
        c.age -= c.holdDur;
        this.startBurst(false, c.age);
      } else if (c.phase === 'hold' && !this.creaked && c.age >= c.holdDur - TIMES.creak) {
        this.creaked = true;
        this.emit({ type: 'creak' });
      } else if (c.phase === 'hold' && c.age >= c.holdDur) {
        c.age -= c.holdDur;
        this.pop();
      } else break;
    }
  }

  /** The reduced-motion form: a closed chest that waits, each promotion shown as a still change of colour, then it opens. */
  private updateStill(dt: number): void {
    const c = this.chest;
    c.age += dt;
    for (let guard = 0; guard < 24; guard++) {
      if (c.phase === 'idle' && c.age >= this.gap) {
        c.age -= this.gap;
        const next = this.nextStill();
        if (next) {
          this.promote(next.from, next.to, c.age);
          this.gap = TIMES.still;
        } else {
          this.startHold(c.age, TIMES.creak);
        }
      } else if (c.phase === 'hold' && !this.creaked) {
        this.creaked = true;
        this.emit({ type: 'creak' });
      } else if (c.phase === 'hold' && c.age >= c.holdDur) {
        c.age -= c.holdDur;
        this.pop();
      } else break;
    }
  }

  /** The next promotion of the climb that the still form has not shown yet. */
  private nextStill(): { from: number; to: number } | null {
    while (this.stillAt < this.bursts) {
      const i = this.stillAt++;
      const step = this.steps[i] as number;
      const to = this.climb.beats[i] as number;
      if (step > 0) return { from: to - step, to };
    }
    return null;
  }

  /** The rest is over: the next beat, or the late promotion's breath when that beat is the last of a late climb. */
  private following(carry: number): void {
    const last = this.chest.burst + 1 === this.bursts - 1;
    if (this.climb.late && this.bursts > 1 && last) this.startStall(carry);
    else this.startBurst(false, carry);
  }

  /** `carry` is the time already spent in the new phase when the step that started it overshot the boundary. */
  private startBurst(tapped: boolean, carry: number): void {
    const c = this.chest;
    c.burst++;
    c.phase = 'burst';
    c.age = carry;
    const to = this.climb.beats[c.burst] as number;
    const climb = this.steps[c.burst] as number;
    c.climb = climb;
    c.burstDur = beatDuration(climb);
    c.hops = beatHops(climb);
    c.power = beatPower(c.burst, climb, to);
    if (climb > 0) this.promote(to - climb, to, carry);
    this.emit({ type: 'burst', index: c.burst, power: c.power, tapped });
  }

  private promote(from: number, to: number, carry: number): void {
    const c = this.chest;
    c.rank = to;
    c.sincePromo = carry;
    if (to >= TOP_RANK) c.crown = carry;
    this.emit({ type: 'promote', from, to });
  }

  private endBeat(): void {
    const c = this.chest;
    if (c.burst + 1 < this.bursts) {
      c.phase = 'idle';
      this.gap = TIMES.gap;
    } else {
      this.startHold(c.age);
    }
  }

  private startStall(carry: number): void {
    const c = this.chest;
    c.phase = 'stall';
    c.age = carry;
    c.holdDur = TIMES.stall;
    this.emit({ type: 'stall', duration: c.holdDur });
  }

  private startHold(carry: number, duration: number = TIMES.hold[this.best]): void {
    const c = this.chest;
    c.phase = 'hold';
    c.age = carry;
    c.holdDur = duration;
    this.creaked = false;
    this.emit({ type: 'hold', duration });
  }

  private pop(): void {
    this.chest.phase = 'open';
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
        this.enter(i, nextPhase(b));
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
    if (this.still) return phase === 'show' ? TIMES.stillShow[r] : phase === 'shade' ? TIMES.stillShade : 0;
    const pace = b.plan.last ? 1 : this.pace;
    switch (phase) {
      case 'rise':
        return TIMES.rise[r] * pace;
      case 'wobble':
        return TIMES.wobble[r] * pace;
      case 'flip':
        return TIMES.flip;
      case 'shade':
        return TIMES.shade[r];
      case 'peel':
        return TIMES.peel;
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

  /** A tap: the next beat at once during the wind-up (cutting the running beat, the rest or the stall), a step on for the card on stage after the pop. False when it did nothing. */
  tap(): boolean {
    if (this.summarised) return false;
    const c = this.chest;
    switch (c.phase) {
      case 'drop':
        // Taken now, played the moment the chest lands.
        this.pendingTap = true;
        return true;
      case 'idle':
        if (this.still) {
          // The next colour of the still climb now.
          c.age = this.gap;
          this.updateStill(0);
          return true;
        }
        c.sinceTap = 0;
        this.startBurst(true, 0);
        return true;
      case 'burst':
        c.sinceTap = 0;
        if (c.burst + 1 < this.bursts) this.startBurst(true, 0);
        else this.startHold(0);
        return true;
      case 'stall':
        c.sinceTap = 0;
        this.startBurst(true, 0);
        return true;
      case 'hold':
        // The still form has no breath to hold: it opens on a tap. The live one cuts the breath down to its creak (the last moment before the pop is the sound's).
        if (this.still) {
          c.age = 0;
          this.pop();
          return true;
        }
        if (c.age >= c.holdDur - TIMES.creak) return false;
        c.sinceTap = 0;
        c.age = c.holdDur - TIMES.creak;
        this.updateChest(0);
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
      else if (b.phase === 'flip' || b.phase === 'shade' || b.phase === 'peel' || b.phase === 'show') this.enter(i, nextPhase(b));
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
