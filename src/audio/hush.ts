/**
 * The fight bus gives way for a big moment: while a skill's signature, a boss's cry or the awakening sounds, the weapons' and the enemies'
 * sounds are a few dB under, so the moment is heard through the crowd instead of being added to it (and a busy second does not get louder just
 * because a big thing happened in it). A hush is quick to come (about 15 ms: the big sound has a sharp start of its own), holds for the length of
 * the moment and lets go slowly (about 250 ms) so that the fight swells back in rather than snapping.
 *
 * The same class drives the live engine and the offline measurement (`tools/sfx/audit/mix_page.js`): it keeps its own model of the gain it asked
 * the bus for, so it can start a new hush from where the old one is, at any time in the future, without reading the node.
 */

export interface HushPlan {
  /** Gain the bus dips to. */
  floor: number;
  /** Time constants of the way down and of the way back (seconds). */
  attackTc: number;
  releaseTc: number;
  /** How long the bus stays down before it starts to come back. */
  hold: number;
}

const ATTACK_TC = 0.005;
const RELEASE_TC = 0.085;

/** The plan of a hush of `db` decibels (positive: how far down) lasting `seconds`. */
export function hushPlan(db: number, seconds: number): HushPlan {
  const down = Math.min(24, Math.max(0, Number.isFinite(db) ? db : 0));
  return { floor: Math.pow(10, -down / 20), attackTc: ATTACK_TC, releaseTc: RELEASE_TC, hold: Math.max(0.02, Number.isFinite(seconds) ? seconds : 0) };
}

export class Hush {
  /** The segment now running: from time `t0` at gain `v0` towards `target` with time constant `tc`; from `recoverAt` the way back to 1. */
  private t0 = 0;
  private v0 = 1;
  private target = 1;
  private tc = ATTACK_TC;
  private recoverAt = -Infinity;
  private recoverTc = RELEASE_TC;

  /** The gain the bus has (or will have, for a time in the future) according to what was asked of it. */
  gainAt(t: number): number {
    if (this.recoverAt === -Infinity) return 1;
    if (t < this.t0) return this.v0;
    if (t < this.recoverAt) return this.target + (this.v0 - this.target) * Math.exp(-(t - this.t0) / this.tc);
    const atEnd = this.target + (this.v0 - this.target) * Math.exp(-(this.recoverAt - this.t0) / this.tc);
    return 1 + (atEnd - 1) * Math.exp(-(t - this.recoverAt) / this.recoverTc);
  }

  /**
   * Dip `param` (the gain of the fight bus) at time `at` by `db` decibels for `seconds`. A hush that comes while another is still holding joins it:
   * the deeper floor wins and the later end wins, so a string of big moments is one long dip, not a series of bumps.
   */
  duck(param: AudioParam, at: number, db: number, seconds: number): void {
    const plan = hushPlan(db, seconds);
    const now = this.gainAt(at);
    const joining = this.recoverAt > at;
    const floor = joining ? Math.min(this.target, plan.floor) : plan.floor;
    const end = Math.max(joining ? this.recoverAt : -Infinity, at + plan.hold);
    this.t0 = at;
    this.v0 = now;
    this.target = floor;
    this.tc = plan.attackTc;
    this.recoverAt = end;
    this.recoverTc = plan.releaseTc;
    param.cancelScheduledValues(at);
    param.setValueAtTime(now, at);
    param.setTargetAtTime(floor, at, plan.attackTc);
    param.setTargetAtTime(1, end, plan.releaseTc);
  }

  /** Forget everything (the engine's stop-all, a new context). */
  reset(): void {
    this.t0 = 0;
    this.v0 = 1;
    this.target = 1;
    this.recoverAt = -Infinity;
  }
}
