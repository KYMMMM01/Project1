import { Ease, bezierControl, quadBezier, type Vec2 } from './curves';

/** One icon's journey: burst out of the source, hang, then curve into the target. Pure geometry. */
export interface FlightPlan {
  sx: number;
  sy: number;
  /** Where the icon rests after the burst. */
  bx: number;
  by: number;
  tx: number;
  ty: number;
  /** Bezier control point of the final leg. */
  cx: number;
  cy: number;
  burst: number;
  hang: number;
  flight: number;
}

export interface FlightState {
  x: number;
  y: number;
  scale: number;
}

/** The rectangle an icon's resting spot and curve have to stay inside (the screen, less half an icon). */
export interface FlyBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** Folds `v` back into [lo, hi]: a point that would land outside bounces off the edge instead of piling up on it. */
export function foldInto(v: number, lo: number, hi: number): number {
  if (hi <= lo) return (lo + hi) / 2;
  const r = v < lo ? 2 * lo - v : v > hi ? 2 * hi - v : v;
  // A distance of more than one span would need a second fold; one fold plus a clamp is enough for a burst.
  return r < lo ? lo : r > hi ? hi : r;
}

export function flightTotal(p: FlightPlan): number {
  return p.burst + p.hang + p.flight;
}

export function makeFlightPlan(): FlightPlan {
  return { sx: 0, sy: 0, bx: 0, by: 0, tx: 0, ty: 0, cx: 0, cy: 0, burst: 0.12, hang: 0.2, flight: 0.55 };
}

const ctl: Vec2 = { x: 0, y: 0 };

/**
 * Fills `plan` in place (icons are planned in a loop; no per-icon allocation). With `bounds` the resting spot
 * is folded back into the rectangle and so is the curve's control point, so the whole flight stays inside it:
 * a quadratic curve never leaves the triangle of its three points, and the target is inside by definition.
 */
export function planFlight(
  plan: FlightPlan,
  sx: number,
  sy: number,
  tx: number,
  ty: number,
  burstAngle: number,
  burstDist: number,
  bulge: number,
  burst: number,
  hang: number,
  flight: number,
  bounds?: FlyBounds,
): FlightPlan {
  plan.sx = sx;
  plan.sy = sy;
  plan.bx = sx + Math.cos(burstAngle) * burstDist;
  plan.by = sy + Math.sin(burstAngle) * burstDist;
  plan.tx = tx;
  plan.ty = ty;
  if (bounds) {
    plan.bx = foldInto(plan.bx, bounds.minX, bounds.maxX);
    plan.by = foldInto(plan.by, bounds.minY, bounds.maxY);
  }
  bezierControl(ctl, plan.bx, plan.by, tx, ty, bulge);
  plan.cx = bounds ? foldInto(ctl.x, bounds.minX, bounds.maxX) : ctl.x;
  plan.cy = bounds ? foldInto(ctl.y, bounds.minY, bounds.maxY) : ctl.y;
  plan.burst = burst;
  plan.hang = hang;
  plan.flight = flight;
  return plan;
}

/** Last stretch of the flight during which the icon shrinks into the target. */
const SHRINK_SECONDS = 0.06;

/** Position and scale at `t` seconds after this icon started. Writes into `out`. */
export function flightAt(out: FlightState, p: FlightPlan, t: number): FlightState {
  if (t <= 0) {
    out.x = p.sx;
    out.y = p.sy;
    out.scale = 0;
    return out;
  }
  if (t < p.burst) {
    const k = t / p.burst;
    const e = Ease.cubicOut(k);
    out.x = p.sx + (p.bx - p.sx) * e;
    out.y = p.sy + (p.by - p.sy) * e;
    out.scale = Ease.backOut(k);
    return out;
  }
  const h = t - p.burst;
  if (h < p.hang) {
    // A small bob keeps resting icons alive while they wait for their turn.
    out.x = p.bx;
    out.y = p.by + Math.sin((h / Math.max(0.001, p.hang)) * Math.PI * 2) * 2.5;
    out.scale = 1;
    return out;
  }
  const f = Math.min(1, (h - p.hang) / p.flight);
  quadBezier(out, p.bx, p.by, p.cx, p.cy, p.tx, p.ty, Ease.cubicIn(f));
  const left = (1 - f) * p.flight;
  out.scale = left < SHRINK_SECONDS ? left / SHRINK_SECONDS : 1;
  return out;
}
