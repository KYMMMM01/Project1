/**
 * Where a RUNNING BODY is (the tiger general, the star archer's arrow). The simulation tells the view everything it needs in the cast's payload
 * (`SpRunData` and the two skills' extra fields; docs/handoff/skills1_sim.md section 2) and the view works the place out of the battle's clock:
 *
 *   covered(t) = min(dist, speed * max(0, t - at - delay))              px of the run the body has come
 *   place(t)   = pathPoint(startPath + dir * covered(t))               (the road is a loop: the seam is no special case)
 *
 * `t` is `BattleApi.time`: it stands still while a popup holds the simulation and runs 2x / 3x with the game, so the picture is exactly where
 * the simulation's body is at 1x, 2x and 3x and does not move under a popup. Pure and allocation-free (`out` is filled), so a test can walk a
 * whole run.
 */
import { pathPoint, wrapPath, type PathPoint } from '@/game/geometry';

export interface RunTrack {
  /** `BattleApi.time` of the cast. */
  at: number;
  /** +1 with the flow of the enemies, -1 against it. */
  dir: 1 | -1;
  /** Seconds after `at` before the body starts to move along the road. */
  delay: number;
  /** px/s. */
  speed: number;
  /** px the run covers. */
  dist: number;
  /** Road coordinate of the start, in [0, PATH_LENGTH). */
  startPath: number;
}

/** The track of a run from a cast's payload (the fields of `SpChargeData` and `SpLapData` that name the run). */
export function trackOf(d: { at: number; dir: 1 | -1; delay: number; speed: number; dist: number; startPath: number }): RunTrack {
  return { at: d.at, dir: d.dir, delay: d.delay, speed: d.speed, dist: d.dist, startPath: d.startPath };
}

/** px of the run covered at battle time `t`. */
export function covered(track: RunTrack, t: number): number {
  const s = track.speed * Math.max(0, t - track.at - track.delay);
  return s < track.dist ? s : track.dist;
}

/** The road coordinate of the body at battle time `t`, in [0, PATH_LENGTH). */
export function runCoord(track: RunTrack, t: number): number {
  return wrapPath(track.startPath + track.dir * covered(track, t));
}

/** The body's place on the road at battle time `t`; `angle` is the way the ROAD runs there (the flow's direction). Writes into `out`. */
export function runPlace(track: RunTrack, t: number, out: PathPoint): PathPoint {
  return pathPoint(runCoord(track, t), out);
}

/** The battle time at which the body reaches the end of its run. */
export function runEndsAt(track: RunTrack): number {
  return track.at + track.delay + track.dist / track.speed;
}

/** The way the body faces as it runs, in radians: along the road for a body that runs with the flow, against it otherwise. */
export function headingOf(track: RunTrack, roadAngle: number): number {
  return track.dir < 0 ? roadAngle + Math.PI : roadAngle;
}
