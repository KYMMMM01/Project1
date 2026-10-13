/**
 * Where the road runs inside a cat's reach (the simulation's events carry no road interval, so a scene works it out): the stretches of the
 * enemies' loop whose centre line is within `range` of a point. Pure, allocation only when a scene starts (a cast, not a frame).
 */
import { PATH_LENGTH, pathPoint, wrapPath, type PathPoint } from '@/game/geometry';

export interface RoadRun {
  /** Road coordinate (distance along the loop) where the stretch begins, in [0, PATH_LENGTH). */
  start: number;
  /** px of road in the stretch. */
  length: number;
}

const scratch: PathPoint = { x: 0, y: 0, angle: 0 };

/** The stretches of road within `range` px of (x, y), sampled every `step` px, the longest first. A whole lap when everything is in reach, none when nothing is. */
export function roadInReach(x: number, y: number, range: number, step = 8): RoadRun[] {
  const n = Math.max(2, Math.ceil(PATH_LENGTH / step));
  const gap = PATH_LENGTH / n;
  const inside: boolean[] = [];
  let count = 0;
  const r2 = range * range;
  for (let i = 0; i < n; i++) {
    pathPoint(i * gap, scratch);
    const dx = scratch.x - x;
    const dy = scratch.y - y;
    const hit = dx * dx + dy * dy <= r2;
    inside.push(hit);
    if (hit) count++;
  }
  if (count === 0) return [];
  if (count === n) return [{ start: 0, length: PATH_LENGTH }];
  // Start the walk just after a sample that is outside, so a stretch that crosses the seam is one stretch.
  let from = 0;
  while (inside[from]) from++;
  const runs: RoadRun[] = [];
  let begin = -1;
  for (let k = 1; k <= n; k++) {
    const i = (from + k) % n;
    if (inside[i]) {
      if (begin < 0) begin = i;
    } else if (begin >= 0) {
      const last = (from + k - 1) % n;
      const samples = ((last - begin + n) % n) + 1;
      runs.push({ start: begin * gap, length: Math.max(gap, (samples - 1) * gap) });
      begin = -1;
    }
  }
  runs.sort((a, b) => b.length - a.length);
  return runs;
}

/** `count` points spread evenly along a stretch, both ends included (one point for `count` 1: the middle). */
export function pointsAlong(run: RoadRun, count: number): PathPoint[] {
  const out: PathPoint[] = [];
  const n = Math.max(1, Math.floor(count));
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0.5 : i / (n - 1);
    out.push(pathPoint(wrapPath(run.start + run.length * t)));
  }
  return out;
}

/** Whether the road coordinate `coord` (any value: it is wrapped) lies on the stretch `run`. */
export function runHolds(run: RoadRun, coord: number): boolean {
  return wrapPath(coord - run.start) <= run.length;
}

/**
 * The part of each stretch of `runs` that the road coordinates `coords` stand on, with `margin` px of road more at each end: a cat's reach cuts
 * a long stretch out of the road (round a corner, across the seam), but its effect is only seen where something is pushed, so a stretch with
 * nothing on it is left out and one with something on it is cut down to where that is. `coords` may hold undefined for an enemy that is no
 * longer known.
 */
export function runsAround(runs: readonly RoadRun[], coords: ReadonlyArray<number | undefined>, margin: number): RoadRun[] {
  const out: RoadRun[] = [];
  for (const run of runs) {
    let lo = Infinity;
    let hi = -Infinity;
    for (const c of coords) {
      if (c === undefined || !runHolds(run, c)) continue;
      const o = wrapPath(c - run.start);
      lo = Math.min(lo, o);
      hi = Math.max(hi, o);
    }
    if (lo > hi) continue;
    const from = Math.max(0, lo - margin);
    const to = Math.min(run.length, hi + margin);
    out.push({ start: wrapPath(run.start + from), length: Math.max(1, to - from) });
  }
  return out;
}
