/**
 * Voice limiting as pure bookkeeping: the engine asks "may this sound start at time t and last d
 * seconds?" and gets back a volume scale (0 = drop). Nothing here touches WebAudio, and all state
 * lives in preallocated typed arrays so a busy fight never allocates.
 */

export interface VoiceRule {
  /** Simultaneous voices of this id before new ones are dropped. */
  maxVoices: number;
  /** Minimum seconds between two starts of this id. */
  minGap: number;
  /**
   * Density attenuation: volume scale = 1 / (1 + falloff * starts in the last DENSITY_WINDOW).
   * 0 disables it; rapid ids (hits, coins) use it so 15 plays/s stay a texture, not a wall.
   */
  falloff: number;
}

const DENSITY_WINDOW = 0.25;
const RING = 16;
export const GLOBAL_VOICE_CAP = 24;

export class VoiceLimiter {
  private readonly ends: Float64Array[];
  private readonly lastStart: Float64Array;
  private readonly ring: Float64Array;
  private readonly ringPos: Uint8Array;
  private readonly globalEnds: Float64Array;
  /** Voices dropped since the last reset, by reason; surfaced in the debug stats. */
  dropped = { gap: 0, perId: 0, global: 0 };

  constructor(
    private readonly rules: readonly VoiceRule[],
    globalCap = GLOBAL_VOICE_CAP,
  ) {
    this.ends = rules.map((r) => new Float64Array(Math.max(1, r.maxVoices)));
    this.lastStart = new Float64Array(rules.length).fill(-1e9);
    this.ring = new Float64Array(rules.length * RING).fill(-1e9);
    this.ringPos = new Uint8Array(rules.length);
    this.globalEnds = new Float64Array(globalCap);
  }

  /**
   * @param idx index into the rules array
   * @param start when the voice would start (context seconds)
   * @param dur how long it would sound
   * @returns volume scale in (0, 1], or 0 when the voice must be dropped
   */
  request(idx: number, start: number, dur: number): number {
    const rule = this.rules[idx];
    if (!rule) return 0;
    if (start - (this.lastStart[idx] as number) < rule.minGap) {
      this.dropped.gap++;
      return 0;
    }
    const own = this.ends[idx] as Float64Array;
    let slot = -1;
    for (let i = 0; i < own.length; i++) {
      if ((own[i] as number) <= start) {
        slot = i;
        break;
      }
    }
    if (slot < 0) {
      this.dropped.perId++;
      return 0;
    }
    let gslot = -1;
    for (let i = 0; i < this.globalEnds.length; i++) {
      if ((this.globalEnds[i] as number) <= start) {
        gslot = i;
        break;
      }
    }
    if (gslot < 0) {
      this.dropped.global++;
      return 0;
    }

    let scale = 1;
    if (rule.falloff > 0) {
      let n = 0;
      const base = idx * RING;
      for (let i = 0; i < RING; i++) if (start - (this.ring[base + i] as number) < DENSITY_WINDOW) n++;
      scale = 1 / (1 + rule.falloff * n);
    }

    const end = start + Math.max(0.01, dur);
    own[slot] = end;
    this.globalEnds[gslot] = end;
    this.lastStart[idx] = start;
    const p = this.ringPos[idx] as number;
    this.ring[idx * RING + p] = start;
    this.ringPos[idx] = (p + 1) % RING;
    return scale;
  }

  /** Voices of any id still sounding at `now`. */
  active(now: number): number {
    let n = 0;
    for (let i = 0; i < this.globalEnds.length; i++) if ((this.globalEnds[i] as number) > now) n++;
    return n;
  }

  activeOf(idx: number, now: number): number {
    const own = this.ends[idx];
    if (!own) return 0;
    let n = 0;
    for (let i = 0; i < own.length; i++) if ((own[i] as number) > now) n++;
    return n;
  }

  reset(): void {
    for (const e of this.ends) e.fill(0);
    this.globalEnds.fill(0);
    this.lastStart.fill(-1e9);
    this.ring.fill(-1e9);
    this.ringPos.fill(0);
    this.dropped = { gap: 0, perId: 0, global: 0 };
  }
}

/**
 * Polyphony budget for the music scheduler. Notes are scheduled slightly ahead in chronological
 * order, so counting the voices still sounding at a new note's start time gives the true overlap.
 * Priority >= 2 notes (kick, bass, chords, lead) may use the hard cap; the rest stop at the soft cap,
 * which means hats and arpeggio grace notes are the first to thin out under load.
 */
export class VoiceBudget {
  private readonly ends: Float64Array;
  /** Highest overlap ever admitted: the number the stress test checks. */
  peak = 0;
  dropped = 0;

  constructor(
    readonly softCap = 12,
    readonly hardCap = 14,
  ) {
    this.ends = new Float64Array(hardCap);
  }

  tryAdd(start: number, end: number, priority: number): boolean {
    let live = 0;
    let slot = -1;
    for (let i = 0; i < this.ends.length; i++) {
      if ((this.ends[i] as number) > start) live++;
      else if (slot < 0) slot = i;
    }
    const limit = priority >= 2 ? this.hardCap : this.softCap;
    if (live >= limit || slot < 0) {
      this.dropped++;
      return false;
    }
    this.ends[slot] = end;
    if (live + 1 > this.peak) this.peak = live + 1;
    return true;
  }

  /** Voices whose end lies after `time`. */
  activeAt(time: number): number {
    let n = 0;
    for (let i = 0; i < this.ends.length; i++) if ((this.ends[i] as number) > time) n++;
    return n;
  }

  reset(): void {
    this.ends.fill(0);
    this.peak = 0;
    this.dropped = 0;
  }
}
