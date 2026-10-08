/**
 * Which carriers of a hostile aura wear a ring, as pure maths over typed arrays (no Pixi, nothing allocated per frame).
 *
 * A carrier (a clock that speeds its neighbours up, a pill that mends them) wears one thin ring that hugs its body. Rings of the same
 * kind that would overlap are one indication: the one that came first keeps its ring, the others wear none, because the enemies in
 * reach already wear the small sticker of what is done to them (a carrier next to another carrier is one of them). A carrier's reach
 * is hinted once, when it appears, and only where no ring of its kind already shows that ground.
 */

/** The most carriers listed at once. */
export const CARRIER_CAP = 32;
/** The most rings drawn at once: a wave full of carriers is a handful of quiet lines, never a field of them. */
export const MAX_RINGS = 10;
/** A ring that is not worn yet is given when no other of its kind is nearer than this share of its diameter; one that is worn is kept until another comes nearer than `KEEP`. */
const GIVE = 0.7;
const KEEP = 0.5;

/** What a carrier shows: nothing, a ring, or a ring with the reach hinted. */
export const NO_RING = 0;
export const RING = 1;
export const RING_AND_REACH = 2;

export class AuraPlan {
  /** Per carrier, in the order they were listed. */
  readonly kind = new Uint8Array(CARRIER_CAP);
  readonly x = new Float32Array(CARRIER_CAP);
  readonly y = new Float32Array(CARRIER_CAP);
  /** Diameter of the ring round the body, and the aura's real radius. */
  readonly diameter = new Float32Array(CARRIER_CAP);
  readonly reach = new Float32Array(CARRIER_CAP);
  /** Whether the carrier wore a ring at the last look (the hysteresis). */
  readonly worn = new Uint8Array(CARRIER_CAP);
  /** What each shows now: `NO_RING`, `RING` or `RING_AND_REACH`. */
  readonly show = new Uint8Array(CARRIER_CAP);
  count = 0;

  reset(): void {
    this.count = 0;
  }

  add(kind: number, x: number, y: number, diameter: number, reach: number, worn: boolean): number {
    const i = this.count;
    if (i >= CARRIER_CAP) return -1;
    this.kind[i] = kind;
    this.x[i] = x;
    this.y[i] = y;
    this.diameter[i] = diameter;
    this.reach[i] = reach;
    this.worn[i] = worn ? 1 : 0;
    this.count = i + 1;
    return i;
  }

  /** Decide for every listed carrier, front of the list first (a carrier never gives way to one after it in the list). */
  decide(): void {
    let rings = 0;
    for (let i = 0; i < this.count; i++) {
      const gap = this.diameter[i] * (this.worn[i] ? KEEP : GIVE);
      let shown = rings < MAX_RINGS;
      let reachSeen = false;
      for (let j = 0; j < i && shown; j++) {
        if (this.kind[j] !== this.kind[i] || this.show[j] === NO_RING) continue;
        const dx = this.x[j] - this.x[i];
        const dy = this.y[j] - this.y[i];
        if (dx * dx + dy * dy < gap * gap) shown = false;
        else if (dx * dx + dy * dy < this.reach[i] * this.reach[i]) reachSeen = true;
      }
      if (!shown) {
        this.show[i] = NO_RING;
        continue;
      }
      rings++;
      this.show[i] = reachSeen || this.worn[i] ? RING : RING_AND_REACH;
    }
  }
}
