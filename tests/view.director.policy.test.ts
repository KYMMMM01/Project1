import { describe, expect, it } from 'vitest';
import {
  BannerQueue,
  FlightLedger,
  FrameBudget,
  GapGate,
  HitStopGate,
  IntensityMeter,
  KeyedGate,
  NumberAggregator,
  PitchLadder,
  SoundRule,
  SummonRate,
  WindowLimiter,
  AGGREGATION_WINDOW,
  dangerStrength,
  heartbeatInterval,
  iconsFor,
  intensityTarget,
  numberDensity,
  overflowSeconds,
  shareOf,
  shouldShowNumber,
  summonPlan,
  type BannerItem,
} from '@/view/director/policy';

const banner = (key: string, priority = 1, inS = 0.2, holdS = 1, outS = 0.2): BannerItem<string> => ({
  key,
  priority,
  inS,
  holdS,
  outS,
  payload: key,
});

describe('gates', () => {
  it('GapGate spaces firings per id', () => {
    const g = new GapGate(3);
    expect(g.ready(0, 1, 0.1)).toBe(true);
    expect(g.ready(0, 1.05, 0.1)).toBe(false);
    expect(g.ready(1, 1.05, 0.1)).toBe(true);
    expect(g.ready(0, 1.11, 0.1)).toBe(true);
  });

  it('WindowLimiter allows `max` per window and recovers', () => {
    const w = new WindowLimiter(3, 1);
    expect([w.take(0), w.take(0.1), w.take(0.2), w.take(0.3)]).toEqual([true, true, true, false]);
    expect(w.count(0.5)).toBe(3);
    expect(w.take(1.05)).toBe(true);
    expect(w.count(1.05)).toBe(3);
    expect(w.take(2.5)).toBe(true);
    expect(w.count(2.5)).toBe(1);
  });

  it('FrameBudget refills', () => {
    const b = new FrameBudget(2);
    expect([b.take(), b.take(), b.take()]).toEqual([true, true, false]);
    b.refill();
    expect(b.take()).toBe(true);
  });

  it('KeyedGate suppresses repeats of the same key and sub-id only', () => {
    const k = new KeyedGate(64);
    expect(k.ready(7, 1, 0, 0.5)).toBe(true);
    expect(k.ready(7, 1, 0.2, 0.5)).toBe(false);
    expect(k.ready(7, 2, 0.2, 0.5)).toBe(true);
    expect(k.ready(8, 1, 0.2, 0.5)).toBe(true);
    expect(k.ready(7, 1, 0.6, 0.5)).toBe(true);
  });

  it('HitStopGate grants one per 400 ms, capped at 200 ms and 50 ms when reduced', () => {
    const h = new HitStopGate();
    expect(h.request(150, 1, false)).toBe(150);
    expect(h.request(150, 1.2, false)).toBe(0);
    expect(h.request(500, 1.45, false)).toBe(200);
    expect(h.request(100, 2.5, true)).toBe(50);
    expect(h.request(100, 2.6, true, true)).toBe(50);
    expect(h.request(0, 9, false)).toBe(0);
  });
});

describe('PitchLadder', () => {
  it('climbs one step per event, hovers under the cap, and resets after the window', () => {
    const l = new PitchLadder(2, 5);
    const run = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8].map((t) => l.next(t));
    expect(run.slice(0, 6)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(run.slice(6)).toEqual([4, 5, 4]);
    expect(l.streak(0.9)).toBe(9);
    expect(l.next(5)).toBe(0);
    expect(l.streak(5.1)).toBe(1);
    expect(l.streak(9)).toBe(0);
  });

  it('perStep slows the climb', () => {
    const l = new PitchLadder(1, 3, 2);
    expect([0, 0.1, 0.2, 0.3, 0.4].map((t) => l.next(t))).toEqual([0, 0, 1, 1, 2]);
  });

  it('never exceeds the cap', () => {
    const l = new PitchLadder(1, 4);
    for (let i = 0; i < 100; i++) expect(l.next(i * 0.01)).toBeLessThanOrEqual(4);
  });
});

describe('floating numbers', () => {
  it('density follows the load of the number layer', () => {
    expect(numberDensity(5, 24)).toBe(0);
    expect(numberDensity(16, 24)).toBe(1);
    expect(numberDensity(23, 24)).toBe(2);
    expect(numberDensity(1, 0)).toBe(2);
  });

  it('crits always show; chip damage thins out as the layer fills', () => {
    expect(shouldShowNumber(2, 'crit', 1, 1000, false)).toBe(true);
    expect(shouldShowNumber(0, 'dot', 1, 1000, false)).toBe(true);
    expect(shouldShowNumber(1, 'normal', 5, 1000, false)).toBe(false);
    expect(shouldShowNumber(1, 'normal', 50, 1000, false)).toBe(true);
    expect(shouldShowNumber(1, 'dot', 50, 1000, false)).toBe(false);
    expect(shouldShowNumber(1, 'dot', 5, 1000, true)).toBe(true);
    expect(shouldShowNumber(1, 'absorb', 50, 100, false)).toBe(false);
    expect(shouldShowNumber(2, 'normal', 30, 1000, false)).toBe(false);
    expect(shouldShowNumber(2, 'normal', 60, 1000, false)).toBe(true);
    expect(shouldShowNumber(2, 'dot', 600, 1000, true)).toBe(false);
  });

  it('aggregates hits on one enemy inside the window into a running total', () => {
    const a = new NumberAggregator();
    expect(a.add(4, 10, 0, 0.1)).toBe(false);
    expect(a.total).toBe(10);
    expect(a.add(4, 15, 0.05, 0.1)).toBe(true);
    expect(a.total).toBe(25);
    expect(a.add(9, 7, 0.06, 0.1)).toBe(false);
    expect(a.total).toBe(7);
    // The window is measured from the hit that opened it.
    expect(a.add(4, 5, 0.11, 0.1)).toBe(false);
    expect(a.total).toBe(5);
    expect(a.add(4, 5, 0.2, 0.1)).toBe(true);
    expect(a.total).toBe(10);
  });

  it('remembers whether a window got a number on screen', () => {
    const a = new NumberAggregator();
    a.add(3, 1, 0, AGGREGATION_WINDOW);
    expect(a.visible).toBe(true);
    a.suppress();
    expect(a.add(3, 1, 0.05, AGGREGATION_WINDOW)).toBe(true);
    expect(a.visible).toBe(false);
    expect(a.total).toBe(2);
    a.reveal();
    expect(a.add(3, 1, 0.08, AGGREGATION_WINDOW)).toBe(true);
    expect(a.visible).toBe(true);
    expect(a.add(3, 1, 0.5, AGGREGATION_WINDOW)).toBe(false);
    expect(a.visible).toBe(true);
    expect(AGGREGATION_WINDOW).toBeCloseTo(0.1);
  });
});

describe('currency flights', () => {
  it('splits a total exactly across the icons', () => {
    for (const [total, n] of [[10, 3], [7, 12], [25, 12], [1, 1], [100, 12]] as const) {
      let sum = 0;
      let lo = Infinity;
      let hi = 0;
      for (let i = 0; i < n; i++) {
        const s = shareOf(total, n, i);
        sum += s;
        lo = Math.min(lo, s);
        hi = Math.max(hi, s);
      }
      expect(sum).toBe(total);
      expect(hi - lo).toBeLessThanOrEqual(1);
    }
  });

  it('chooses icon counts per reason, always between 1 and the cap', () => {
    expect(iconsFor('kill', 1)).toBe(1);
    expect(iconsFor('kill', 60)).toBe(3);
    expect(iconsFor('unit', 5)).toBe(1);
    expect(iconsFor('sell', 12)).toBe(5);
    expect(iconsFor('wave', 9)).toBe(3);
    expect(iconsFor('boss', 1000)).toBe(12);
    expect(iconsFor('act', 0)).toBe(1);
  });

  it('never has more than the cap in the air', () => {
    const l = new FlightLedger(12);
    expect(l.grant(5)).toBe(5);
    expect(l.grant(10)).toBe(7);
    expect(l.grant(3)).toBe(0);
    l.land(4);
    expect(l.inFlight).toBe(8);
    expect(l.grant(10)).toBe(4);
    l.land(100);
    expect(l.inFlight).toBe(0);
  });
});

describe('BannerQueue', () => {
  const step = (q: BannerQueue<string>, seconds: number, dt = 0.05): void => {
    for (let t = 0; t < seconds - 1e-9; t += dt) q.update(dt);
  };

  it('plays banners in order through in, hold and out', () => {
    const q = new BannerQueue<string>();
    const started: string[] = [];
    q.onStart = (b) => started.push(b.key);
    q.push(banner('a'));
    q.push(banner('b'));
    q.update(0);
    expect(q.active?.key).toBe('a');
    expect(q.phase).toBe('in');
    step(q, 0.3);
    expect(q.phase).toBe('hold');
    step(q, 1);
    expect(q.phase).toBe('out');
    step(q, 0.3);
    expect(q.active?.key).toBe('b');
    step(q, 2);
    expect(q.active).toBeNull();
    expect(started).toEqual(['a', 'b']);
  });

  it('a higher priority banner cuts the running one to its exit', () => {
    const q = new BannerQueue<string>();
    q.push(banner('low', 1));
    q.update(0);
    step(q, 0.4);
    expect(q.phase).toBe('hold');
    q.push(banner('high', 5));
    expect(q.phase).toBe('out');
    step(q, 0.3);
    expect(q.active?.key).toBe('high');
  });

  it('merges banners with the same key and keeps the active one up', () => {
    const q = new BannerQueue<string>();
    q.push(banner('wave'));
    q.update(0);
    step(q, 1);
    expect(q.phase).toBe('hold');
    q.push(banner('wave'));
    expect(q.length).toBe(1);
    expect(q.phase).toBe('hold');
    q.push(banner('x'));
    q.push(banner('x'));
    expect(q.length).toBe(2);
  });

  it('keeps pending banners ordered by priority and bounded', () => {
    const q = new BannerQueue<string>(2);
    q.push(banner('run'));
    q.update(0);
    q.push(banner('p1', 1));
    q.push(banner('p3', 3));
    q.push(banner('p2', 2));
    expect(q.length).toBe(3);
    step(q, 1.5);
    expect(q.active?.key).toBe('p3');
  });

  it('drops a stale low priority banner but keeps important ones', () => {
    const q = new BannerQueue<string>();
    q.push(banner('long', 2, 0.2, 5, 0.2));
    q.update(0);
    q.push(banner('minor', 1));
    q.push(banner('major', 2));
    step(q, 2);
    // Both waited longer than the stale limit; only the low priority one is gone.
    expect(q.length).toBe(2);
    q.clear();
    expect(q.active).toBeNull();
    expect(q.phase).toBe('idle');
  });
});

describe('summon staging', () => {
  it('flags a burst of summons as rapid', () => {
    const r = new SummonRate(1, 4);
    expect([0, 0.2, 0.4, 0.6].map((t) => r.note(t))).toEqual([false, false, false, true]);
    expect(r.note(5)).toBe(false);
  });

  it('thins only commons and rares, and shortens repeated big reveals', () => {
    expect(summonPlan(0, true, 99)).toEqual({ popOnly: true, thin: true, quick: false });
    expect(summonPlan(1, true, 99).thin).toBe(true);
    expect(summonPlan(1, false, 99).thin).toBe(false);
    expect(summonPlan(2, true, 99)).toEqual({ popOnly: false, thin: false, quick: false });
    expect(summonPlan(3, false, 1).quick).toBe(true);
    expect(summonPlan(3, false, 10).quick).toBe(false);
    expect(summonPlan(4, true, 0.5).quick).toBe(true);
  });
});

describe('music intensity and danger', () => {
  it('grows with the crowd and the run, floors at 0.75 during a boss', () => {
    const calm = intensityTarget(2, 60, 1, 24, false);
    const busy = intensityTarget(45, 60, 12, 24, false);
    const full = intensityTarget(60, 60, 24, 24, false);
    expect(calm).toBeLessThan(0.3);
    expect(busy).toBeGreaterThan(calm);
    expect(full).toBeLessThanOrEqual(1);
    expect(full).toBeGreaterThan(busy);
    expect(intensityTarget(0, 60, 8, 24, true)).toBeGreaterThanOrEqual(0.75);
    expect(intensityTarget(0, 0, 0, 0, false)).toBeGreaterThan(0);
  });

  it('smooths: up fast, down slowly, and converges', () => {
    const m = new IntensityMeter(0.3, 1.5);
    const start = m.value;
    m.update(1, 0.3);
    const rise = m.value - start;
    expect(rise).toBeGreaterThan(0.3);
    const peak = m.value;
    m.update(0, 0.3);
    expect(peak - m.value).toBeLessThan(rise);
    for (let i = 0; i < 600; i++) m.update(0.5, 0.016);
    expect(m.value).toBeCloseTo(0.5, 2);
  });

  it('maps danger levels to a vignette strength and heartbeat rate', () => {
    expect(dangerStrength(0, false)).toBe(0);
    expect(dangerStrength(1, false)).toBeLessThan(dangerStrength(2, false));
    expect(dangerStrength(0, true)).toBe(1);
    expect(heartbeatInterval(1, false)).toBe(0);
    expect(heartbeatInterval(2, false)).toBeCloseTo(60 / 70);
    expect(heartbeatInterval(2, true)).toBeLessThan(heartbeatInterval(2, false));
  });

  it('counts the overflow clock down in whole seconds', () => {
    expect(overflowSeconds(0, 2)).toBe(0);
    expect(overflowSeconds(0.01, 2)).toBe(2);
    expect(overflowSeconds(0.5, 2)).toBe(2);
    expect(overflowSeconds(1.2, 2)).toBe(1);
    expect(overflowSeconds(1.99, 2)).toBe(1);
    expect(overflowSeconds(5, 2)).toBe(1);
  });
});

describe('SoundRule', () => {
  it('enforces the gap and the concurrency window together', () => {
    const r = new SoundRule(0.045, 3, 0.2);
    expect(r.allow(0)).toBe(true);
    expect(r.allow(0.02)).toBe(false);
    expect(r.allow(0.05)).toBe(true);
    expect(r.allow(0.1)).toBe(true);
    expect(r.allow(0.15)).toBe(false);
    expect(r.allow(0.3)).toBe(true);
  });

  it('a rule without a window limit only spaces starts', () => {
    const r = new SoundRule(0.5);
    expect([r.allow(0), r.allow(0.4), r.allow(0.5)]).toEqual([true, false, true]);
  });
});

describe('SoundRule pool', () => {
  it('rules sharing a pool cannot start more than the pool allows together', () => {
    const pool = new WindowLimiter(3, 0.3);
    const a = new SoundRule(0.01, 0, 0, pool);
    const b = new SoundRule(0.01, 0, 0, pool);
    expect([a.allow(0), b.allow(0.05), a.allow(0.1), b.allow(0.15), a.allow(0.2)]).toEqual([true, true, true, false, false]);
    expect(b.allow(0.5)).toBe(true);
  });
});
