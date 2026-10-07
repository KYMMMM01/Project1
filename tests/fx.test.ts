import { beforeEach, describe, expect, it } from 'vitest';
import { PRIORITY_FILL, ParticleBudget, scaleCount } from '@/fx/budget';
import {
  ColorRamp,
  backOutS,
  bezierControl,
  fadeEnvelope,
  kickCurve,
  pick,
  popCurve,
  quadBezier,
  safeFlashColor,
  smoothstep01,
  springWobble,
  type Vec2,
} from '@/fx/curves';
import { boltPointCount, buildBolt } from '@/fx/bolt';
import { flightAt, flightTotal, makeFlightPlan, planFlight, type FlightState } from '@/fx/flyPath';
import { TimeFreeze } from '@/fx/freeze';
import { QualityGovernor, loadFxTier, saveFxTier } from '@/fx/governor';
import { FX_TIERS, FX_TIER_ORDER, REDUCED, countScale, fxSettings, onFxTierChange, setFxSettings, tierScale } from '@/fx/settings';

/** Deterministic rng so jitter assertions are stable. */
function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

describe('ColorRamp', () => {
  it('returns the solid colour for one stop', () => {
    const r = new ColorRamp().set([0x336699]);
    expect(r.rgb(0)).toBe(0x336699);
    expect(r.rgb(0.7)).toBe(0x336699);
  });

  it('interpolates two stops linearly and clamps t', () => {
    const r = new ColorRamp().set([0x000000, 0xff8040]);
    expect(r.rgb(0)).toBe(0x000000);
    expect(r.rgb(1)).toBe(0xff8040);
    expect(r.rgb(2)).toBe(0xff8040);
    expect(r.rgb(-1)).toBe(0x000000);
    const mid = r.rgb(0.5);
    expect((mid >> 16) & 255).toBeCloseTo(128, 0);
    expect((mid >> 8) & 255).toBeCloseTo(64, 0);
    expect(mid & 255).toBeCloseTo(32, 0);
  });

  it('hits the middle stop exactly at `mid` for three stops', () => {
    const r = new ColorRamp().set([0xff0000, 0x00ff00, 0x0000ff], 0.25);
    expect(r.rgb(0)).toBe(0xff0000);
    expect(r.rgb(0.25)).toBe(0x00ff00);
    expect(r.rgb(1)).toBe(0x0000ff);
    // Halfway between stop 1 and stop 2.
    const c = r.rgb(0.625);
    expect((c >> 8) & 255).toBeCloseTo(128, 0);
    expect(c & 255).toBeCloseTo(128, 0);
  });

  it('packs bgr as the byte-swapped rgb (Pixi particle order)', () => {
    const r = new ColorRamp().set([0x112233]);
    expect(r.bgr(0)).toBe(0x332211);
    expect(r.setSolid(0xabcdef).bgr(0.3)).toBe(0xefcdab);
  });
});

describe('curves', () => {
  it('pick samples inside a range and passes numbers through', () => {
    expect(pick(5, 0.9)).toBe(5);
    expect(pick([10, 20], 0)).toBe(10);
    expect(pick([10, 20], 1)).toBe(20);
    expect(pick([10, 20], 0.25)).toBeCloseTo(12.5);
  });

  it('fadeEnvelope ramps in and out and is 1 in between', () => {
    expect(fadeEnvelope(0, 0.2, 0.3)).toBe(0);
    expect(fadeEnvelope(0.5, 0.2, 0.3)).toBe(1);
    expect(fadeEnvelope(1, 0.2, 0.3)).toBe(0);
    expect(fadeEnvelope(0.1, 0.2, 0.3)).toBeCloseTo(smoothstep01(0.5));
    expect(fadeEnvelope(0, 0, 0)).toBe(1);
  });

  it('popCurve starts at from, overshoots to peak and settles at to', () => {
    expect(popCurve(0, 0.6, 1.5, 1.2)).toBe(0.6);
    expect(popCurve(1, 0.6, 1.5, 1.2)).toBe(1.2);
    expect(popCurve(0.6, 0.6, 1.5, 1.2)).toBeCloseTo(1.5);
    let max = 0;
    for (let t = 0; t <= 1; t += 0.01) max = Math.max(max, popCurve(t, 0, 1.15, 1));
    expect(max).toBeCloseTo(1.15, 2);
  });

  it('backOutS overshoots proportionally to s and ends at 1', () => {
    expect(backOutS(1, 2.5)).toBeCloseTo(1);
    let m17 = 0;
    let m30 = 0;
    for (let t = 0; t <= 1; t += 0.005) {
      m17 = Math.max(m17, backOutS(t, 1.70158));
      m30 = Math.max(m30, backOutS(t, 3));
    }
    expect(m17).toBeCloseTo(1.1, 1);
    expect(m30).toBeCloseTo(1.25, 1);
  });

  it('springWobble decays to a small remainder by 500 ms (guide values)', () => {
    const a = 8;
    expect(springWobble(0, a, 10, 6.5)).toBeCloseTo(a);
    let peak = 0;
    for (let t = 0.45; t <= 0.5; t += 0.001) peak = Math.max(peak, Math.abs(springWobble(t, a, 10, 6.5)));
    expect(peak).toBeLessThan(a * 0.06);
  });

  it('kickCurve rises fast to its peak at 25% and decays smoothly to rest', () => {
    expect(kickCurve(0)).toBe(0);
    expect(kickCurve(1)).toBe(0);
    expect(kickCurve(0.25)).toBeCloseTo(1);
    expect(kickCurve(0.125)).toBeGreaterThan(0.7);
    let prev = 1;
    for (let t = 0.26; t < 1; t += 0.02) {
      const v = kickCurve(t);
      expect(v).toBeLessThanOrEqual(prev);
      expect(v).toBeGreaterThanOrEqual(0);
      prev = v;
    }
  });

  it('safeFlashColor washes saturated red but leaves other colours alone', () => {
    expect(safeFlashColor(0xffffff)).toBe(0xffffff);
    expect(safeFlashColor(0xffd45e)).toBe(0xffd45e);
    expect(safeFlashColor(0x000000)).toBe(0x000000);
    const washed = safeFlashColor(0xff0000);
    const r = (washed >> 16) & 255;
    const g = (washed >> 8) & 255;
    const b = washed & 255;
    expect(r / (r + g + b)).toBeLessThan(0.8);
  });
});

describe('budget accounting', () => {
  it('never grants more than the per-priority fill of the cap', () => {
    const b = new ParticleBudget(100);
    // Fill with ambient particles: they stop at 55%.
    let n = b.grant(200, 0);
    b.add(n);
    expect(n).toBe(Math.floor(100 * PRIORITY_FILL[0]!));
    expect(b.live).toBe(55);
    // Same priority is now refused entirely, normal priority still has room up to 80%.
    expect(b.grant(10, 0)).toBe(0);
    n = b.grant(50, 1);
    b.add(n);
    expect(b.live).toBe(80);
    // Critical keeps the last slots, and never exceeds the cap.
    n = b.grant(500, 3);
    b.add(n);
    expect(b.live).toBe(100);
    expect(b.grant(1, 3)).toBe(0);
    expect(b.peak).toBe(100);
  });

  it('counts dropped and granted requests', () => {
    const b = new ParticleBudget(10);
    b.add(b.grant(8, 3));
    b.grant(6, 3);
    expect(b.granted).toBe(10);
    expect(b.dropped).toBe(4);
  });

  it('releases slots and clamps at zero', () => {
    const b = new ParticleBudget(10);
    b.add(4);
    b.remove(3);
    expect(b.live).toBe(1);
    b.remove(5);
    expect(b.live).toBe(0);
    expect(b.free).toBe(10);
  });

  it('room is never negative and treats unknown priorities as the extremes', () => {
    const b = new ParticleBudget(10);
    b.add(10);
    expect(b.room(0)).toBe(0);
    expect(b.room(99)).toBe(0);
    b.reset();
    expect(b.room(-5)).toBe(Math.floor(10 * PRIORITY_FILL[0]!));
    expect(b.room(99)).toBe(10);
  });

  it('scaleCount rounds stochastically around n*quality and keeps important effects visible', () => {
    expect(scaleCount(10, 1, 0, () => 0.99)).toBe(10);
    expect(scaleCount(10, 0.5, 0, () => 0.99)).toBe(5);
    expect(scaleCount(5, 0.5, 0, () => 0.1)).toBe(3);
    expect(scaleCount(5, 0.5, 0, () => 0.9)).toBe(2);
    expect(scaleCount(3, 0.1, 0, () => 0.9)).toBe(0);
    expect(scaleCount(3, 0.1, 2, () => 0.9)).toBe(1);
    expect(scaleCount(0, 1, 3)).toBe(0);
    // Average over many draws approaches the exact product.
    const rng = seeded(7);
    let sum = 0;
    for (let i = 0; i < 4000; i++) sum += scaleCount(6, 0.25, 0, rng);
    expect(sum / 4000).toBeCloseTo(1.5, 1);
  });
});

describe('flyTo path', () => {
  const out: Vec2 = { x: 0, y: 0 };

  it('quadBezier hits both endpoints and bends towards the control point', () => {
    quadBezier(out, 0, 0, 50, 100, 100, 0, 0);
    expect(out).toEqual({ x: 0, y: 0 });
    quadBezier(out, 0, 0, 50, 100, 100, 0, 1);
    expect(out).toEqual({ x: 100, y: 0 });
    quadBezier(out, 0, 0, 50, 100, 100, 0, 0.5);
    expect(out.x).toBeCloseTo(50);
    expect(out.y).toBeCloseTo(50);
  });

  it('bezierControl is perpendicular to the chord at the stated distance', () => {
    bezierControl(out, 0, 0, 200, 0, 100);
    expect(out.x).toBeCloseTo(100);
    expect(Math.abs(out.y)).toBeCloseTo(100);
    const up = { ...out };
    bezierControl(out, 0, 0, 200, 0, -100);
    expect(out.y).toBeCloseTo(-up.y);
    // Diagonal chord: distance from the chord midpoint equals the bulge.
    bezierControl(out, 0, 0, 300, 400, 80);
    expect(Math.hypot(out.x - 150, out.y - 200)).toBeCloseTo(80);
    expect((out.x - 150) * 300 + (out.y - 200) * 400).toBeCloseTo(0);
  });

  it('a flight starts at the source, bursts out, hangs, then lands exactly on the target', () => {
    const plan = planFlight(makeFlightPlan(), 100, 200, 600, 80, Math.PI / 2, 90, 100, 0.12, 0.2, 0.5);
    expect(plan.bx).toBeCloseTo(100);
    expect(plan.by).toBeCloseTo(290);
    const s: FlightState = { x: 0, y: 0, scale: 0 };
    flightAt(s, plan, 0);
    expect([s.x, s.y, s.scale]).toEqual([100, 200, 0]);
    flightAt(s, plan, 0.12);
    expect(s.x).toBeCloseTo(plan.bx);
    expect(s.y).toBeCloseTo(plan.by);
    // Hanging: stays near the rest point at full size.
    flightAt(s, plan, 0.12 + 0.1);
    expect(Math.hypot(s.x - plan.bx, s.y - plan.by)).toBeLessThan(4);
    expect(s.scale).toBe(1);
    const total = flightTotal(plan);
    expect(total).toBeCloseTo(0.82);
    flightAt(s, plan, total);
    expect(s.x).toBeCloseTo(600);
    expect(s.y).toBeCloseTo(80);
    expect(s.scale).toBeCloseTo(0);
  });

  it('flight accelerates: the last quarter of the flight covers most of the distance', () => {
    const plan = planFlight(makeFlightPlan(), 0, 0, 400, 0, 0, 0, 0, 0.1, 0.1, 1);
    const s: FlightState = { x: 0, y: 0, scale: 0 };
    const t0 = plan.burst + plan.hang;
    flightAt(s, plan, t0 + 0.75);
    const at75 = s.x;
    flightAt(s, plan, t0 + 1);
    expect(s.x - at75).toBeGreaterThan(400 * 0.55);
    // Position is monotonic along x for a straight (zero-bulge) flight.
    let prev = -1;
    for (let t = t0; t <= t0 + 1; t += 0.02) {
      flightAt(s, plan, t);
      expect(s.x).toBeGreaterThanOrEqual(prev);
      prev = s.x;
    }
  });

  it('icon shrinks to nothing during the last 60 ms of the flight only', () => {
    const plan = planFlight(makeFlightPlan(), 0, 0, 100, 0, 0, 10, 0, 0.1, 0.1, 0.5);
    const s: FlightState = { x: 0, y: 0, scale: 0 };
    const total = flightTotal(plan);
    flightAt(s, plan, total - 0.2);
    expect(s.scale).toBe(1);
    flightAt(s, plan, total - 0.03);
    expect(s.scale).toBeCloseTo(0.5);
  });
});

describe('lightning geometry', () => {
  it('keeps the endpoints and fills 2^levels + 1 points', () => {
    const levels = 4;
    const pts = new Float32Array(2 * boltPointCount(levels));
    const n = buildBolt(pts, 10, 20, 410, 320, levels, 0.2, seeded(3));
    expect(n).toBe(17);
    expect(pts[0]).toBe(10);
    expect(pts[1]).toBe(20);
    expect(pts[2 * (n - 1)]).toBe(410);
    expect(pts[2 * (n - 1) + 1]).toBe(320);
  });

  it('stays within a bounded corridor around the chord and actually jitters', () => {
    const levels = 5;
    const pts = new Float32Array(2 * boltPointCount(levels));
    const n = buildBolt(pts, 0, 0, 500, 0, levels, 0.2, seeded(11));
    let maxOff = 0;
    let moved = 0;
    for (let i = 0; i < n; i++) {
      const off = Math.abs(pts[2 * i + 1] as number);
      maxOff = Math.max(maxOff, off);
      if (off > 0.5) moved++;
    }
    // Displacements shrink with segment length, so the sum is a geometric series below ~ L * r / (1 - r/2).
    expect(maxOff).toBeLessThan(500 * 0.2 * 2);
    expect(maxOff).toBeGreaterThan(5);
    expect(moved).toBeGreaterThan(n / 2);
  });

  it('is deterministic for a given rng and different for another', () => {
    const levels = 3;
    const a = new Float32Array(2 * boltPointCount(levels));
    const b = new Float32Array(2 * boltPointCount(levels));
    const c = new Float32Array(2 * boltPointCount(levels));
    buildBolt(a, 0, 0, 100, 100, levels, 0.25, seeded(5));
    buildBolt(b, 0, 0, 100, 100, levels, 0.25, seeded(5));
    buildBolt(c, 0, 0, 100, 100, levels, 0.25, seeded(6));
    expect(Array.from(a)).toEqual(Array.from(b));
    expect(Array.from(a)).not.toEqual(Array.from(c));
  });
});

describe('TimeFreeze', () => {
  let a: { timeScale: number };
  let b: { timeScale: number };
  let f: TimeFreeze;

  beforeEach(() => {
    setFxSettings({ reducedMotion: false });
    a = { timeScale: 1 };
    b = { timeScale: 2 };
    f = new TimeFreeze(undefined, { cooldown: 0 }).addTarget(a).addTarget(b);
  });

  it('slows every target and restores their own previous speed', () => {
    expect(f.freeze(0.1, 0)).toBe(true);
    expect(a.timeScale).toBe(0);
    expect(b.timeScale).toBe(0);
    expect(f.isFrozen).toBe(true);
    f.update(0.06);
    expect(a.timeScale).toBe(0);
    f.update(0.06);
    expect(a.timeScale).toBe(1);
    expect(b.timeScale).toBe(2);
    expect(f.isFrozen).toBe(false);
    expect(f.factor).toBe(1);
  });

  it('overlapping freezes: the longest wins and a short one never shortens it', () => {
    f.freeze(0.2, 0);
    f.update(0.05);
    f.freeze(0.05, 0);
    f.update(0.06);
    expect(a.timeScale).toBe(0); // short freeze ended, the long one still holds
    f.update(0.08);
    expect(a.timeScale).toBe(0); // 0.19 s elapsed of 0.2
    f.update(0.02);
    expect(a.timeScale).toBe(1);
  });

  it('overlap uses the slowest active speed and steps back up as holds end', () => {
    f.freeze(0.2, 0.3);
    f.freeze(0.1, 0);
    expect(a.timeScale).toBe(0);
    expect(b.timeScale).toBe(0);
    f.update(0.11);
    expect(f.factor).toBeCloseTo(0.3);
    expect(a.timeScale).toBeCloseTo(0.3);
    expect(b.timeScale).toBeCloseTo(0.6);
    f.update(0.1);
    expect(a.timeScale).toBe(1);
    expect(b.timeScale).toBe(2);
  });

  it('caps a full stop at maxSeconds', () => {
    const g = new TimeFreeze(undefined, { maxSeconds: 0.2, cooldown: 0 }).addTarget(a);
    g.freeze(5, 0);
    g.update(0.19);
    expect(a.timeScale).toBe(0);
    g.update(0.02);
    expect(a.timeScale).toBe(1);
  });

  it('caps slow-motion at maxSlowSeconds, longer than a stop', () => {
    const g = new TimeFreeze(undefined, { cooldown: 0 }).addTarget(a);
    expect(g.freeze(5, 0.3)).toBe(true);
    g.update(0.35);
    expect(a.timeScale).toBeCloseTo(0.3);
    g.update(0.06);
    expect(a.timeScale).toBe(1);
  });

  describe('with default options', () => {
    let g: TimeFreeze;
    beforeEach(() => {
      g = new TimeFreeze().addTarget(a);
    });

    it('a 0.4 s slow-motion really lasts 0.4 s', () => {
      expect(g.freeze(0.4, 0.3)).toBe(true);
      g.update(0.25);
      expect(a.timeScale).toBeCloseTo(0.3);
      g.update(0.14);
      expect(a.timeScale).toBeCloseTo(0.3);
      g.update(0.02);
      expect(a.timeScale).toBe(1);
    });

    it('a hold requested while an event runs joins it instead of being refused', () => {
      expect(g.freeze(0.1, 0)).toBe(true);
      g.update(0.05);
      expect(g.freeze(0.3, 0.3)).toBe(true);
      expect(a.timeScale).toBe(0); // the stop is still the slowest hold
      g.update(0.06);
      expect(a.timeScale).toBeCloseTo(0.3); // stop over, slow-motion carries on
      g.update(0.3);
      expect(a.timeScale).toBe(1);
    });

    it('only starting a new event is rationed: 0.4 s of normal speed after the last one ended', () => {
      expect(g.freeze(0.1, 0)).toBe(true);
      g.update(0.12);
      expect(g.isFrozen).toBe(false);
      g.update(0.3);
      expect(g.freeze(0.05, 0)).toBe(false);
      g.update(0.1);
      expect(g.freeze(0.05, 0)).toBe(true);
    });

    it('joins cannot chain into a permanent freeze: an event is at most one stop plus one slow-motion', () => {
      expect(g.freeze(0.2, 0)).toBe(true);
      let total = 0;
      for (let i = 0; i < 40 && g.isFrozen; i++) {
        g.update(0.05);
        total += 0.05;
        g.freeze(0.2, 0);
      }
      // 0.6 s, plus at most the step it takes to notice that float residue left a hold epsilon above zero.
      expect(total).toBeLessThan(0.7);
      expect(g.isFrozen).toBe(false);
      expect(a.timeScale).toBe(1);
    });

    it('freezeThenSlow is a stop followed by slow-motion that lasts after the stop ends', () => {
      expect(g.freezeThenSlow(0.12, 0.3, 0.3)).toBe(true);
      expect(a.timeScale).toBe(0);
      g.update(0.1);
      expect(a.timeScale).toBe(0);
      g.update(0.04);
      expect(a.timeScale).toBeCloseTo(0.3);
      g.update(0.25);
      expect(a.timeScale).toBeCloseTo(0.3);
      g.update(0.05);
      expect(a.timeScale).toBe(1);
      expect(g.isFrozen).toBe(false);
    });

    it('freezeThenSlow clamps both parts and respects the cooldown', () => {
      expect(g.freezeThenSlow(9, 9, 0.5)).toBe(true);
      g.update(0.21);
      expect(a.timeScale).toBeCloseTo(0.5);
      g.update(0.4);
      expect(a.timeScale).toBe(1);
      expect(g.freezeThenSlow(0.1, 0.1)).toBe(false);
    });
  });

  it('respects the cooldown between freezes', () => {
    const g = new TimeFreeze(undefined, { cooldown: 0.4 }).addTarget(a);
    expect(g.freeze(0.05, 0)).toBe(true);
    g.update(0.06);
    expect(g.freeze(0.05, 0)).toBe(false);
    g.update(0.4);
    expect(g.freeze(0.05, 0)).toBe(true);
  });

  it('cancel restores immediately, survives many overlapping holds and starts no cooldown', () => {
    const g = new TimeFreeze().addTarget(a).addTarget(b);
    for (let i = 0; i < 20; i++) g.freeze(0.1 + i * 0.001, i % 2 === 0 ? 0 : 0.5);
    expect(a.timeScale).toBe(0);
    g.cancel();
    expect(a.timeScale).toBe(1);
    expect(b.timeScale).toBe(2);
    g.update(1);
    expect(a.timeScale).toBe(1);
    expect(g.freeze(0.05, 0)).toBe(true);
  });

  it('reports every change to the optional sink and ends on 1', () => {
    const seen: number[] = [];
    const g = new TimeFreeze((x) => seen.push(x), { cooldown: 0 });
    g.freeze(0.1, 0.5);
    g.update(0.2);
    expect(seen[0]).toBe(0.5);
    expect(seen[seen.length - 1]).toBe(1);
  });

  it('removing a target mid-freeze gives its speed back', () => {
    f.freeze(0.2, 0);
    f.removeTarget(a);
    expect(a.timeScale).toBe(1);
    f.update(0.3);
    expect(b.timeScale).toBe(2);
  });

  it('reduced motion drops slow-motion and shortens hit-stop', () => {
    setFxSettings({ reducedMotion: true });
    const g = new TimeFreeze(undefined, { cooldown: 0 }).addTarget(a);
    expect(g.freeze(0.4, 0.3)).toBe(false);
    expect(g.freezeThenSlow(0.1, 0.3)).toBe(true);
    g.update(REDUCED.hitStopMaxSeconds + 0.01);
    expect(a.timeScale).toBe(1);
    expect(g.freeze(0.2, 0)).toBe(true);
    g.update(REDUCED.hitStopMaxSeconds + 0.01);
    expect(a.timeScale).toBe(1);
  });
});

describe('QualityGovernor', () => {
  /** Feed `seconds` of frames at `ms` each; returns the tier changes seen. */
  function run(g: QualityGovernor, seconds: number, ms: number): string[] {
    const changes: string[] = [];
    const n = Math.round((seconds * 1000) / ms);
    for (let i = 0; i < n; i++) {
      const t = g.sample(ms / 1000);
      if (t) changes.push(t);
    }
    return changes;
  }

  it('starts in the default tier (mid) and a short stretch of 60 fps changes nothing', () => {
    const g = new QualityGovernor();
    expect(g.tier).toBe('mid');
    expect(run(g, 25, 16.7)).toEqual([]);
  });

  it('steps down one tier after about 2 s of slow frames, then again, and stops at low', () => {
    const g = new QualityGovernor({ start: 'high' });
    expect(run(g, 1.2, 28)).toEqual([]);
    expect(run(g, 1.8, 28)).toEqual(['mid']);
    // The average is judged afresh in the new tier: another couple of slow seconds, one more step.
    expect(run(g, 4, 28)).toEqual(['low']);
    expect(run(g, 30, 28)).toEqual([]);
    expect(g.tier).toBe('low');
  });

  it('ignores a short hitch', () => {
    const g = new QualityGovernor();
    run(g, 5, 16.7);
    g.sample(0.05);
    g.sample(0.05);
    run(g, 5, 16.7);
    expect(g.tier).toBe('mid');
  });

  it('steps back up only after 10 s of headroom and 30 s since the last change', () => {
    const g = new QualityGovernor({ start: 'low' });
    expect(run(g, 29, 10)).toEqual([]);
    expect(run(g, 2, 10)).toEqual(['mid']);
    // The hold restarts after each change, so the next step needs another 30 s.
    expect(run(g, 20, 10)).toEqual([]);
    expect(run(g, 20, 10)).toEqual(['high']);
  });

  it('a 60 Hz display that holds its 60 fps can climb (the guide 14 ms threshold could not)', () => {
    const g = new QualityGovernor();
    expect(run(g, 40, 16.7)).toEqual(['high']);
  });

  it('does not step up while frames are merely acceptable (between the thresholds)', () => {
    const g = new QualityGovernor({ start: 'low' });
    expect(run(g, 120, 18.5)).toEqual([]);
  });

  it('never oscillates: a climb that fails is not tried again', () => {
    const g = new QualityGovernor();
    const log: string[] = [];
    // Mid is comfortable (60 fps), so it climbs to high; high is too heavy (30 ms frames) and drops back.
    log.push(...run(g, 40, 16.7));
    expect(g.tier).toBe('high');
    log.push(...run(g, 2.4, 30));
    expect(g.tier).toBe('mid');
    expect(g.ceiling).toBe('mid');
    // Hours of comfortable frames afterwards: it stays in mid for good.
    log.push(...run(g, 600, 16.7));
    expect(log).toEqual(['high', 'mid']);
  });

  it('a step down long after the climb is a fresh slowdown, not proof the higher tier fails', () => {
    const g = new QualityGovernor();
    run(g, 40, 16.7);
    expect(g.tier).toBe('high');
    run(g, 200, 16.7);
    expect(run(g, 2.4, 30)).toEqual(['mid']);
    expect(g.ceiling).toBe('high');
    expect(run(g, 40, 16.7)).toEqual(['high']);
  });

  it('set() adopts a tier chosen elsewhere and forgets what it learnt', () => {
    const g = new QualityGovernor();
    run(g, 40, 16.7);
    run(g, 2.4, 30);
    expect(g.ceiling).toBe('mid');
    g.set('low');
    expect(g.tier).toBe('low');
    expect(g.ceiling).toBe('high');
    expect(run(g, 29, 10)).toEqual([]);
  });

  it('persists the tier and survives broken storage', () => {
    const mem = new Map<string, string>();
    const store = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) };
    expect(loadFxTier(store)).toBeNull();
    saveFxTier('mid', store);
    expect(loadFxTier(store)).toBe('mid');
    mem.set('fx.tier', 'toString');
    expect(loadFxTier(store)).toBeNull();
    const broken = {
      getItem: (): string | null => {
        throw new Error('blocked');
      },
      setItem: (): void => {
        throw new Error('blocked');
      },
    };
    expect(loadFxTier(broken)).toBeNull();
    expect(() => saveFxTier('low', broken)).not.toThrow();
    expect(loadFxTier(null)).toBeNull();
  });
});

describe('fxSettings', () => {
  it('clamps quality and toggles flags', () => {
    setFxSettings({ quality: 3, flashes: false, reducedMotion: true, numbers: 'brief' });
    expect(fxSettings.quality).toBe(1);
    expect(fxSettings.flashes).toBe(false);
    expect(fxSettings.reducedMotion).toBe(true);
    expect(fxSettings.numbers).toBe('brief');
    setFxSettings({ quality: -1 });
    expect(fxSettings.quality).toBe(0);
    setFxSettings({ quality: 1, flashes: true, reducedMotion: false, numbers: 'full' });
  });

  it('tiers are the product budgets: 400/40, 250/24 (default), 120/12', () => {
    expect(FX_TIERS.high).toMatchObject({ particles: 400, numbers: 40 });
    expect(FX_TIERS.mid).toMatchObject({ particles: 250, numbers: 24 });
    expect(FX_TIERS.low).toMatchObject({ particles: 120, numbers: 12 });
    expect(FX_TIER_ORDER).toEqual(['high', 'mid', 'low']);
    expect(FX_TIERS.high.scale).toBeGreaterThan(FX_TIERS.mid.scale);
    expect(FX_TIERS.mid.scale).toBeGreaterThan(FX_TIERS.low.scale);
  });

  it('defaults to the mid tier with the automatic governor on', () => {
    const fresh = { tier: fxSettings.tier, auto: fxSettings.autoTier };
    setFxSettings({ tier: 'mid', autoTier: true });
    expect(fxSettings.tier).toBe('mid');
    expect(fxSettings.autoTier).toBe(true);
    setFxSettings({ tier: fresh.tier, autoTier: fresh.auto });
  });

  it('tells subscribers about real tier changes only, until they unsubscribe', () => {
    setFxSettings({ tier: 'mid' });
    const seen: string[] = [];
    const off = onFxTierChange((t) => seen.push(t));
    setFxSettings({ tier: 'mid' });
    setFxSettings({ tier: 'low' });
    setFxSettings({ tier: 'low' });
    setFxSettings({ tier: 'high' });
    off();
    setFxSettings({ tier: 'mid' });
    expect(seen).toEqual(['low', 'high']);
  });

  it('ignores an unknown tier name', () => {
    setFxSettings({ tier: 'low' });
    setFxSettings({ tier: 'ultra' as never });
    expect(fxSettings.tier).toBe('low');
    setFxSettings({ tier: 'mid' });
  });

  it('only priority 2+ bursts follow the tier; the player quality setting applies to all', () => {
    setFxSettings({ tier: 'low', quality: 1 });
    expect(tierScale()).toBe(FX_TIERS.low.scale);
    expect(countScale(0)).toBe(1);
    expect(countScale(1)).toBe(1);
    expect(countScale(2)).toBe(FX_TIERS.low.scale);
    expect(countScale(3)).toBe(FX_TIERS.low.scale);
    setFxSettings({ tier: 'high', quality: 0.5 });
    expect(countScale(1)).toBe(0.5);
    expect(countScale(3)).toBe(0.5);
    setFxSettings({ tier: 'mid', quality: 1 });
  });
});
