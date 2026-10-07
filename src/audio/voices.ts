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
  /** Combat priority, 0 when absent (see `Recipe.prio`). */
  prio?: number;
  /** Combat bucket (`BUCKET_SWING`, `BUCKET_IMPACT`, `BUCKET_FOE`), or -1 / absent for a sound that is not part of the fight. */
  bucket?: number;
}

const DENSITY_WINDOW = 0.25;
const RING = 16;
export const GLOBAL_VOICE_CAP = 24;

/** Combat sounds come in three kinds that are thinned separately: the attack leaving a cat, its landing, and the enemy's answer. */
export const BUCKET_SWING = 0;
export const BUCKET_IMPACT = 1;
export const BUCKET_FOE = 2;
/**
 * Crowd control for the fight. At most `max` starts of a bucket in any `window` seconds, and the last of them has to be a sound that
 * has been silent for `fresh` seconds, so a frame in which ten cats fire plays a few different sounds and not the same one three
 * times. Priority 2 and above (crits, killing blows, deaths, bosses) skip the window.
 */
export const BUCKETS = [
  { window: 0.05, max: 2, fresh: 0.12 },
  { window: 0.05, max: 3, fresh: 0.12 },
  { window: 0.05, max: 2, fresh: 0.12 },
] as const;
/** Combat voices that may sound at once, whatever else is playing; a full table drops the oldest quiet voice of equal or lower priority. */
export const COMBAT_CAP = 10;
/** How long a voice that has to make room takes to fade out (seconds): short enough to be a cut, long enough not to click. */
export const CUT_SECONDS = 0.012;
/** Priority from which a sound skips the per-window thinning. */
export const PRIO_BYPASS = 2;

export class VoiceLimiter {
  private readonly ends: Float64Array[];
  private readonly lastStart: Float64Array;
  private readonly ring: Float64Array;
  private readonly ringPos: Uint8Array;
  private readonly globalEnds: Float64Array;
  /** The combat table: when each combat voice ends and started, its priority, level and where it sits in the per-id and global tables. */
  private readonly cEnd = new Float64Array(COMBAT_CAP);
  private readonly cStart = new Float64Array(COMBAT_CAP);
  private readonly cPrio = new Int8Array(COMBAT_CAP);
  private readonly cLevel = new Float64Array(COMBAT_CAP);
  private readonly cId = new Int32Array(COMBAT_CAP);
  private readonly cOwn = new Int16Array(COMBAT_CAP);
  private readonly cGlobal = new Int16Array(COMBAT_CAP);
  private readonly bucketRing = new Float64Array(BUCKETS.length * RING).fill(-1e9);
  private readonly bucketPos = new Uint8Array(BUCKETS.length);
  /** Voices dropped since the last reset, by reason; surfaced in the debug stats. `stolen` counts voices cut to make room. */
  dropped = { gap: 0, perId: 0, global: 0, bucket: 0, cap: 0, stolen: 0 };
  /** After a successful request: the combat table slot of the new voice (-1 when it is not a combat sound). */
  slot = -1;
  /** After a successful request: the combat slot whose voice the engine has to cut now to make room (-1 when none). */
  victim = -1;

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
   * @param level the volume the caller asked for (before the density falloff), to tell a quiet voice from a loud one
   * @returns volume scale in (0, 1], or 0 when the voice must be dropped
   */
  request(idx: number, start: number, dur: number, level = 1): number {
    this.slot = -1;
    this.victim = -1;
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

    const prio = rule.prio ?? 0;
    const bucket = rule.bucket ?? -1;
    let cslot = -1;
    let victim = -1;
    if (bucket >= 0) {
      if (prio < PRIO_BYPASS && !this.bucketAllows(bucket, idx, start)) {
        this.dropped.bucket++;
        return 0;
      }
      for (let i = 0; i < COMBAT_CAP; i++) {
        if ((this.cEnd[i] as number) <= start) {
          cslot = i;
          break;
        }
      }
      if (cslot < 0) {
        victim = this.pickVictim(prio);
        if (victim < 0) {
          this.dropped.cap++;
          return 0;
        }
        cslot = victim;
      }
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
    if (cslot >= 0) {
      if (victim >= 0) this.release(victim, start);
      this.cEnd[cslot] = end;
      this.cStart[cslot] = start;
      this.cPrio[cslot] = prio;
      this.cLevel[cslot] = level * scale;
      this.cId[cslot] = idx;
      this.cOwn[cslot] = slot;
      this.cGlobal[cslot] = gslot;
      this.slot = cslot;
      this.victim = victim;
      const bp = this.bucketPos[bucket] as number;
      this.bucketRing[bucket * RING + bp] = start;
      this.bucketPos[bucket] = (bp + 1) % RING;
    }
    return scale;
  }

  /** The per-window thinning of a bucket: see `BUCKETS`. */
  private bucketAllows(bucket: number, idx: number, start: number): boolean {
    const rule = BUCKETS[bucket] as (typeof BUCKETS)[number];
    let n = 0;
    const base = bucket * RING;
    for (let i = 0; i < RING; i++) if (start - (this.bucketRing[base + i] as number) < rule.window) n++;
    if (n >= rule.max) return false;
    return n < rule.max - 1 || start - (this.lastStart[idx] as number) >= rule.fresh;
  }

  /**
   * The combat voice to cut for a new sound of priority `prio`: the lowest priority first, then the quietest tier (quarters of the
   * requested volume), then the oldest. A voice of higher priority than the newcomer is never cut: the newcomer is dropped instead.
   */
  private pickVictim(prio: number): number {
    let best = -1;
    let bestPrio = 1e9;
    let bestTier = 1e9;
    let bestStart = 1e9;
    for (let i = 0; i < COMBAT_CAP; i++) {
      const pr = this.cPrio[i] as number;
      const tier = Math.min(3, Math.floor((this.cLevel[i] as number) * 4));
      const st = this.cStart[i] as number;
      if (pr < bestPrio || (pr === bestPrio && (tier < bestTier || (tier === bestTier && st < bestStart)))) {
        best = i;
        bestPrio = pr;
        bestTier = tier;
        bestStart = st;
      }
    }
    return best >= 0 && bestPrio <= prio ? best : -1;
  }

  /** A combat voice is being cut at `at`: its per-id and global places become free once the short fade is over. */
  private release(c: number, at: number): void {
    const end = at + CUT_SECONDS + 0.004;
    const own = this.ends[this.cId[c] as number] as Float64Array;
    const o = this.cOwn[c] as number;
    if (own[o] === this.cEnd[c]) own[o] = end;
    const g = this.cGlobal[c] as number;
    if (this.globalEnds[g] === this.cEnd[c]) this.globalEnds[g] = end;
    this.dropped.stolen++;
  }

  /** Combat voices still sounding at `now`. */
  combatActive(now: number): number {
    let n = 0;
    for (let i = 0; i < COMBAT_CAP; i++) if ((this.cEnd[i] as number) > now) n++;
    return n;
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
    this.cEnd.fill(0);
    this.cPrio.fill(0);
    this.bucketRing.fill(-1e9);
    this.bucketPos.fill(0);
    this.slot = -1;
    this.victim = -1;
    this.dropped = { gap: 0, perId: 0, global: 0, bucket: 0, cap: 0, stolen: 0 };
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
