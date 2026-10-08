/**
 * Where a floating number may stand, and which of the numbers asked for are worth a place. Pure maths over typed arrays: no Pixi and
 * no allocation, so every rule is unit tested and a crowded frame costs a few hundred comparisons.
 *
 * A number belongs to a body (an enemy: its picture and its health bar make one box). It starts above that bar and drifts up and
 * outward, away from the lane's centre line; it never stands on its own body, nor on any other body, nor under the HUD, nor on the
 * board. When the place above the bar is not free it takes the next free one (beside it, a row higher, below the feet) and when
 * none is free the number is not shown: in a crowd the lane has to stay a row of enemies.
 */

/** Room kept between a number and the body or bar it sits beside, and round it. */
const GAP = 3;
const MARGIN = 2;

/** Bodies the field can tell the numbers about at once; past this the rest are not obstacles. */
const BODY_CAP = 192;

/**
 * A list of the boxes drawn on the field: one per enemy, the picture and the health bar above it together. It is refilled every frame
 * (`reset`, `add` for each body, `settle`), and remembers how fast each body moved: a number whose enemy has just died keeps going with
 * the crowd instead of standing in the lane for the next enemy to walk through.
 */
export class Bodies {
  count = 0;
  readonly uid = new Int32Array(BODY_CAP);
  /** Centre of the body. */
  readonly x = new Float32Array(BODY_CAP);
  readonly y = new Float32Array(BODY_CAP);
  /** Half the width, the reach above the centre (to the top of the health bar) and the reach below it. */
  readonly hw = new Float32Array(BODY_CAP);
  readonly top = new Float32Array(BODY_CAP);
  readonly bottom = new Float32Array(BODY_CAP);
  /** Velocity of the centre, px per second of the frames that were drawn. */
  readonly vx = new Float32Array(BODY_CAP);
  readonly vy = new Float32Array(BODY_CAP);
  private before = 0;
  private readonly prevUid = new Int32Array(BODY_CAP);
  private readonly prevX = new Float32Array(BODY_CAP);
  private readonly prevY = new Float32Array(BODY_CAP);

  /** Start a new frame: what was listed becomes what the speeds are measured against. */
  reset(): void {
    const n = this.count;
    for (let i = 0; i < n; i++) {
      this.prevUid[i] = this.uid[i] as number;
      this.prevX[i] = this.x[i] as number;
      this.prevY[i] = this.y[i] as number;
    }
    this.before = n;
    this.count = 0;
  }

  add(uid: number, x: number, y: number, hw: number, top: number, bottom: number): void {
    const i = this.count;
    if (i >= BODY_CAP) return;
    this.uid[i] = uid;
    this.x[i] = x;
    this.y[i] = y;
    this.hw[i] = hw;
    this.top[i] = top;
    this.bottom[i] = bottom;
    this.count = i + 1;
  }

  /** The frame is listed: work out how far each body moved in `dt` seconds (zero for one that was not there before). */
  settle(dt: number): void {
    for (let i = 0; i < this.count; i++) {
      let j = i < this.before && this.prevUid[i] === this.uid[i] ? i : -1;
      if (j < 0) for (let k = 0; k < this.before; k++) if (this.prevUid[k] === this.uid[i]) j = k;
      this.vx[i] = j < 0 || dt <= 0 ? 0 : ((this.x[i] as number) - (this.prevX[j] as number)) / dt;
      this.vy[i] = j < 0 || dt <= 0 ? 0 : ((this.y[i] as number) - (this.prevY[j] as number)) / dt;
    }
  }

  /** Index of the body of `uid`, or -1. */
  find(uid: number): number {
    for (let i = 0; i < this.count; i++) if (this.uid[i] === uid) return i;
    return -1;
  }
}

/** The boxes of the numbers alive (centre and half sizes), for a new number to keep clear of. */
export class Boxes {
  count = 0;
  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly w: Float32Array;
  readonly h: Float32Array;
  /** How fast each box moves (px per second): a number goes with its body. */
  readonly vx: Float32Array;
  readonly vy: Float32Array;

  constructor(readonly cap: number) {
    this.x = new Float32Array(cap);
    this.y = new Float32Array(cap);
    this.w = new Float32Array(cap);
    this.h = new Float32Array(cap);
    this.vx = new Float32Array(cap);
    this.vy = new Float32Array(cap);
  }

  set(i: number, x: number, y: number, w: number, h: number, vx: number, vy: number): void {
    this.x[i] = x;
    this.y[i] = y;
    this.w[i] = w;
    this.h[i] = h;
    this.vx[i] = vx;
    this.vy[i] = vy;
  }
}

/** Where numbers may stand (field space): the HUD's lower edge, the screen's sides and bottom panel, and the board. */
export interface Area {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  /** The board with its cats (none when `keepX1 <= keepX0`). */
  keepX0: number;
  keepY0: number;
  keepX1: number;
  keepY1: number;
}

export interface PlaceIn {
  /** The body the number belongs to (centre and box). */
  x: number;
  y: number;
  hw: number;
  top: number;
  bottom: number;
  /** The way away from the lane's centre line, sideways: -1 (left) to 1 (right); the top and bottom stretches have none. */
  nx: number;
  /** Half the width and height of the number's ink at its largest. */
  w: number;
  h: number;
  /** How far it may drift: up, and outward (sideways). */
  rise: number;
  out: number;
  /** How fast its body moves (px per second) and how long ahead (seconds) the others' motion is looked at: the place has to stay free that long. */
  vx: number;
  vy: number;
  horizon: number;
  /** How many rows above the bar and how many places along a row are tried. */
  rows: number;
  cols: number;
  /** The body to skip among the bodies (its own box is always kept clear). */
  uid: number;
}

export interface Spot {
  /** Where the number starts, from the body's centre, and how far it drifts. */
  ox: number;
  oy: number;
  dx: number;
  dy: number;
}

function overlaps(x0: number, y0: number, x1: number, y1: number, b0: number, c0: number, b1: number, c1: number): boolean {
  return x0 < b1 + MARGIN && x1 > b0 - MARGIN && y0 < c1 + MARGIN && y1 > c0 - MARGIN;
}

/** How far into a number a body has to reach before the number gives way. */
const DEEP = 3;

/** Places tried after the rows above the bar: below the feet (three columns), then beside the body (outward side first). */
const BELOW = 3;
const BESIDE = 2;

/**
 * Find the nearest free place for a number of the given size: above the bar first (straight above, then shifted outward, then the other
 * way), then a row higher, then below the feet, then beside the body. `relaxed` keeps clear of the number's own body, the HUD and the
 * board only (a boss's hit is shown even when the lane is full). Writes the place into `out`; false when there is none.
 */
export function findSpot(p: PlaceIn, a: Area, bodies: Bodies, live: Boxes, relaxed: boolean, out: Spot): boolean {
  const side = p.nx < -0.2 ? -1 : 1;
  const step = p.w * 1.2 + 2;
  const above = p.rows * p.cols;
  const total = above + BELOW + BESIDE;
  const bx0 = p.x - p.hw;
  const bx1 = p.x + p.hw;
  const by0 = p.y - p.top;
  const by1 = p.y + p.bottom;
  const keep = a.keepX1 > a.keepX0;
  for (let i = 0; i < total; i++) {
    let rx: number;
    let ry: number;
    let drift: number;
    if (i < above) {
      const row = Math.floor(i / p.cols);
      const k = i % p.cols;
      rx = (k === 0 ? 0 : (k & 1 ? side : -side) * Math.ceil(k / 2)) * step;
      ry = -(p.top + GAP + p.h) - row * (2 * p.h + MARGIN);
      drift = -1;
    } else if (i < above + BELOW) {
      const k = i - above;
      rx = (k === 0 ? 0 : (k & 1 ? side : -side) * Math.ceil(k / 2)) * step;
      ry = p.bottom + GAP + p.h;
      drift = 1;
    } else {
      const k = i - above - BELOW;
      rx = (k === 0 ? side : -side) * (p.hw + GAP + p.w);
      ry = -p.bottom * 0.3;
      drift = -0.5;
    }
    const sy = p.y + ry;
    if (sy - p.h < a.minY || sy + p.h > a.maxY) continue;
    // A number wider than the lane is nudged toward the free side: in from the screen's edge, never into the board.
    let sx = Math.min(a.maxX - p.w, Math.max(a.minX + p.w, p.x + rx));
    if (keep && sy + p.h + p.rise >= a.keepY0 && sy - p.h - p.rise <= a.keepY1) {
      if (p.x < a.keepX0) sx = Math.min(sx, a.keepX0 - MARGIN - p.w);
      else if (p.x > a.keepX1) sx = Math.max(sx, a.keepX1 + MARGIN + p.w);
    }
    if (sx - p.w < a.minX || sx + p.w > a.maxX) continue;
    rx = sx - p.x;
    // The place itself first: when the number cannot even stand there, drifting from it will not help.
    const sx0 = sx - p.w;
    const sx1 = sx + p.w;
    const sy0 = sy - p.h;
    const sy1 = sy + p.h;
    if (overlaps(sx0, sy0, sx1, sy1, bx0, by0, bx1, by1)) continue;
    if (keep && overlaps(sx0, sy0, sx1, sy1, a.keepX0, a.keepY0, a.keepX1, a.keepY1)) continue;
    if (!relaxed && !clearOfOthers(p, bodies, live, sx0, sy0, sx1, sy1)) continue;
    // It drifts as far as the room allows: the whole way, or when that is crowded, not at all.
    const ex = Math.min(a.maxX - p.w, Math.max(a.minX + p.w, sx + p.nx * p.out));
    const ey = Math.min(a.maxY - p.h, Math.max(a.minY + p.h, sy + drift * p.rise));
    const x0 = Math.min(sx, ex) - p.w;
    const x1 = Math.max(sx, ex) + p.w;
    const y0 = Math.min(sy, ey) - p.h;
    const y1 = Math.max(sy, ey) + p.h;
    const free =
      !overlaps(x0, y0, x1, y1, bx0, by0, bx1, by1) &&
      !(keep && overlaps(x0, y0, x1, y1, a.keepX0, a.keepY0, a.keepX1, a.keepY1)) &&
      (relaxed || clearOfOthers(p, bodies, live, x0, y0, x1, y1));
    out.ox = rx;
    out.oy = ry;
    out.dx = free ? ex - sx : 0;
    out.dy = free ? ey - sy : 0;
    return true;
  }
  return false;
}

/** Whether the box is free of every other body and number for `p.horizon` seconds, each moving as fast as it moves now (relative to this number's own body). */
function clearOfOthers(p: PlaceIn, bodies: Bodies, live: Boxes, x0: number, y0: number, x1: number, y1: number): boolean {
  const T = p.horizon;
  for (let j = 0; j < bodies.count; j++) {
    if (bodies.uid[j] === p.uid) continue;
    const bx = bodies.x[j] as number;
    const by = bodies.y[j] as number;
    const hw = bodies.hw[j] as number;
    const mx = ((bodies.vx[j] as number) - p.vx) * T;
    const my = ((bodies.vy[j] as number) - p.vy) * T;
    if (overlaps(x0, y0, x1, y1, bx - hw + Math.min(0, mx), by - (bodies.top[j] as number) + Math.min(0, my), bx + hw + Math.max(0, mx), by + (bodies.bottom[j] as number) + Math.max(0, my))) return false;
  }
  for (let j = 0; j < live.count; j++) {
    const bx = live.x[j] as number;
    const by = live.y[j] as number;
    const w = live.w[j] as number;
    const h = live.h[j] as number;
    const mx = ((live.vx[j] as number) - p.vx) * T;
    const my = ((live.vy[j] as number) - p.vy) * T;
    if (overlaps(x0, y0, x1, y1, bx - w + Math.min(0, mx), by - h + Math.min(0, my), bx + w + Math.max(0, mx), by + h + Math.max(0, my))) return false;
  }
  return true;
}

/**
 * Whether a number's box (centre `cx`, `cy`, half sizes `w`, `h`) has a body other than `uid` standing in it: more than `DEEP` px into
 * it both ways, so a body that only brushes the number's edge does not count.
 */
export function crossed(bodies: Bodies, uid: number, cx: number, cy: number, w: number, h: number): boolean {
  for (let j = 0; j < bodies.count; j++) {
    if (bodies.uid[j] === uid) continue;
    const bx = bodies.x[j] as number;
    const by = bodies.y[j] as number;
    const hw = bodies.hw[j] as number;
    const px = Math.min(cx + w, bx + hw) - Math.max(cx - w, bx - hw);
    if (px <= DEEP) continue;
    const py = Math.min(cy + h, by + (bodies.bottom[j] as number)) - Math.max(cy - h, by - (bodies.top[j] as number));
    if (py > DEEP) return true;
  }
  return false;
}

// ───────────────────────────── merging ─────────────────────────────

const PENDING_SLOTS = 128;

/**
 * The sums of hits that have no number yet (one was refused: too small, no room): a window runs from its first hit, and a later hit in
 * the same window asks for a place with the whole sum, so several small hits can earn the number that none of them would.
 */
export class Pending {
  private readonly key = new Int32Array(PENDING_SLOTS).fill(-1);
  private readonly start = new Float64Array(PENDING_SLOTS);
  private readonly sum = new Float64Array(PENDING_SLOTS);
  private readonly until = new Float64Array(PENDING_SLOTS);

  /** Add `value` to the window of `key` (a new one when the last has run out) and return the sum of the window. */
  add(key: number, value: number, now: number, window: number): number {
    const slot = (Math.imul(key, 0x9e3779b1) >>> 0) % PENDING_SLOTS;
    if (this.key[slot] === key && now - (this.start[slot] as number) < window) {
      this.sum[slot] = (this.sum[slot] as number) + value;
    } else {
      this.key[slot] = key;
      this.start[slot] = now;
      this.sum[slot] = value;
      this.until[slot] = 0;
    }
    return this.sum[slot] as number;
  }

  /** `key` found no place: do not look again before `until` (the hits go on adding up). Call after `add`. */
  hold(key: number, until: number): void {
    const slot = (Math.imul(key, 0x9e3779b1) >>> 0) % PENDING_SLOTS;
    if (this.key[slot] === key) this.until[slot] = until;
  }

  /** Whether `key` was told to wait and its time has not come. */
  held(key: number, now: number): boolean {
    const slot = (Math.imul(key, 0x9e3779b1) >>> 0) % PENDING_SLOTS;
    return this.key[slot] === key && now < (this.until[slot] as number);
  }

  /** The window of `key` got its number: nothing is left to carry. */
  drop(key: number): void {
    const slot = (Math.imul(key, 0x9e3779b1) >>> 0) % PENDING_SLOTS;
    if (this.key[slot] === key) this.key[slot] = -1;
  }

  clear(): void {
    this.key.fill(-1);
  }
}

// ───────────────────────────── the crowd rule ─────────────────────────────

/** The screen is cut into 4 x 4 regions of the field; each holds only so many numbers. */
const REGION_W = 180;
const REGION_H = 156;
const REGION_COLS = 4;

/** The region of a point of the field. */
export function regionOf(x: number, y: number): number {
  const cx = Math.min(REGION_COLS - 1, Math.max(0, Math.floor(x / REGION_W)));
  const cy = Math.min(3, Math.max(0, Math.floor(y / REGION_H)));
  return cy * REGION_COLS + cx;
}

/** Whether a number of priority `prioA` and value `valueA` ranks above one of `prioB` and `valueB`: priority first, then the larger figure. */
export function outranks(prioA: number, valueA: number, prioB: number, valueB: number): boolean {
  return prioA !== prioB ? prioA > prioB : valueA > valueB;
}
