import { describe, expect, it, vi } from 'vitest';

// The card motion reads the kit's easing; nothing here needs a canvas.
vi.mock('@/ui', () => ({ backOut: (s: number) => (t: number) => 1 + (s + 1) * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2) }));

import type { ChestRarity } from '@/meta/types';
import { flipPose, flyPose, newCardPose, risePose, showPose, stageScale, stageX, STAGE_GAP, wobblePose } from '../src/screens/shop/cardMotion';
import { newPose, popPose, shakeOffset, windupPose } from '../src/screens/shop/chestPose';
import { beatsOf, burstPowers, FLIP_TURN, RevealFlow, TIMES, type FlowEvent } from '../src/screens/shop/revealFlow';
import { PLATE, stacksOf, type RevealStack } from '../src/screens/shop/revealPlan';

const RARITIES: ChestRarity[] = ['common', 'rare', 'epic', 'legendary'];
const stack = (key: string, rarity: ChestRarity, count = 1): RevealStack => ({ key, unit: null, rarity, count, bonus: false });
/** `n` stacks of each rank given, lowest first. */
function stacks(spec: Partial<Record<ChestRarity, number>>): RevealStack[] {
  const out: RevealStack[] = [];
  for (const r of RARITIES) for (let i = 0; i < (spec[r] ?? 0); i++) out.push(stack(`${r}${i}`, r, 1 + i));
  return out;
}

interface Logged {
  at: number;
  e: FlowEvent;
}

/** Run a flow by `dt` steps for `seconds`; every event is stamped with the time of the step it fired in. */
function play(flow: RevealFlow, seconds: number, clock = { t: 0 }, dt = 1 / 60): void {
  const end = clock.t + seconds;
  while (clock.t < end - 1e-9) {
    clock.t += dt;
    flow.update(dt);
  }
}

function make(list: RevealStack[], still = false): { flow: RevealFlow; log: Logged[]; clock: { t: number } } {
  const log: Logged[] = [];
  const clock = { t: 0 };
  const flow = new RevealFlow(list, (e) => log.push({ at: clock.t, e }), still);
  return { flow, log, clock };
}

/** Seconds of the wind-up when nobody taps, by the plan's own numbers: the fall, the rest, the bursts with their gaps, the held breath. */
function popTime(best: ChestRarity): number {
  const bursts = best === 'epic' || best === 'legendary' ? 3 : 2;
  let t = TIMES.drop + TIMES.landRest;
  for (let i = 0; i < bursts; i++) t += (TIMES.burst[i] as number) + (i < bursts - 1 ? TIMES.burstGap : 0);
  return t + TIMES.hold[best];
}

const types = (log: Logged[]): string[] => log.map((l) => l.e.type);
const times = (log: Logged[], type: string): number[] => log.filter((l) => l.e.type === type).map((l) => l.at);

describe('grouping the stacks into beats', () => {
  it('puts every stack in exactly one beat, the best last and, when it is above common, alone', () => {
    for (const spec of [{ common: 3 }, { common: 6, rare: 4, epic: 3, legendary: 2 }, { rare: 1 }, { common: 1, legendary: 1 }, { epic: 5 }]) {
      const list = stacks(spec);
      const beats = beatsOf(list);
      const flat = beats.flatMap((b) => b.stacks);
      expect([...flat].sort((a, b) => a - b)).toEqual(list.map((_, i) => i));
      const lastBeat = beats[beats.length - 1];
      expect(lastBeat?.stacks).toContain(list.length - 1);
      // A best card above common stands alone; a chest of commons is one run.
      if (list.length > 1 && (list[list.length - 1] as RevealStack).rarity !== 'common') expect(lastBeat?.stacks).toEqual([list.length - 1]);
      expect(beats.filter((b) => b.last)).toHaveLength(1);
      expect(lastBeat?.last).toBe(true);
      for (const b of beats) for (const i of b.stacks) expect((list[i] as RevealStack).rarity).toBe(b.rarity);
      // The order of the stacks is the order of the beats: lower ranks first, the best last.
      expect(flat).toEqual([...flat].sort((a, b) => a - b));
    }
  });

  it('groups commons four to a beat, shows a single rare or a couple of epics on their own and groups a long run in equal parts', () => {
    const sizes = (spec: Partial<Record<ChestRarity, number>>, rarity: ChestRarity): number[] =>
      beatsOf(stacks(spec)).filter((b) => !b.last && b.rarity === rarity).map((b) => b.stacks.length);
    expect(sizes({ common: 9, legendary: 1 }, 'common')).toEqual([3, 3, 3]);
    expect(sizes({ common: 4, legendary: 1 }, 'common')).toEqual([4]);
    expect(sizes({ common: 5, legendary: 1 }, 'common')).toEqual([3, 2]);
    expect(sizes({ common: 1, legendary: 1 }, 'common')).toEqual([1]);
    expect(sizes({ rare: 1, legendary: 1 }, 'rare')).toEqual([1]);
    expect(sizes({ rare: 2, legendary: 1 }, 'rare')).toEqual([2]);
    expect(sizes({ rare: 7, legendary: 1 }, 'rare')).toEqual([3, 2, 2]);
    expect(sizes({ epic: 3, legendary: 1 }, 'epic')).toEqual([2, 1]);
    const big = beatsOf(stacks({ common: 8, rare: 6, epic: 5, legendary: 4 }));
    expect(big.length).toBeLessThan(15);
    expect(big.every((b) => b.stacks.length <= 4)).toBe(true);
  });

  it('keeps the best stack on its own even when it shares a rank with others', () => {
    const beats = beatsOf(stacks({ legendary: 3 }));
    expect(beats.map((b) => b.stacks)).toEqual([[0], [1], [2]]);
    expect(beats.map((b) => b.last)).toEqual([false, false, true]);
  });

  it('has no beats for an empty chest and one for a single stack', () => {
    expect(beatsOf([])).toEqual([]);
    expect(beatsOf(stacks({ rare: 1 }))).toHaveLength(1);
  });
});

describe('the director, left alone', () => {
  it('plays a wooden chest of commons in about three seconds, every event once and in order', () => {
    const { flow, log, clock } = make(stacks({ common: 3 }));
    play(flow, 6, clock);
    expect(flow.summarised).toBe(true);
    const order = types(log);
    expect(order.filter((x) => x === 'land')).toHaveLength(1);
    expect(order.filter((x) => x === 'burst')).toHaveLength(2);
    for (const one of ['hold', 'pop', 'summary']) expect(order.filter((x) => x === one)).toHaveLength(1);
    expect(order.indexOf('land')).toBeLessThan(order.indexOf('burst'));
    expect(order.indexOf('hold')).toBeGreaterThan(order.lastIndexOf('burst'));
    expect(order.indexOf('pop')).toBeGreaterThan(order.indexOf('hold'));
    expect(order.indexOf('rise')).toBeGreaterThan(order.indexOf('pop'));
    expect(order[order.length - 1]).toBe('summary');
    const done = (times(log, 'summary')[0] as number);
    expect(done).toBeGreaterThan(2.4);
    expect(done).toBeLessThan(3.6);
  });

  it('pops at the time the plan says, later for a better chest, and holds the breath for the creak', () => {
    const pops = RARITIES.map((r) => {
      const { flow, log, clock } = make([stack('k', r)]);
      play(flow, 4, clock);
      const hold = log.find((l) => l.e.type === 'hold');
      const pop = times(log, 'pop')[0] as number;
      expect((hold?.e as { duration: number }).duration).toBeGreaterThanOrEqual(TIMES.creak);
      expect(Math.abs(pop - popTime(r))).toBeLessThan(1 / 30);
      return pop;
    });
    expect(pops[2]).toBeGreaterThan(pops[1] as number);
    expect(pops[3]).toBeGreaterThanOrEqual(pops[2] as number);
    // The wind-up of an epic or legendary chest stays about what it was (two seconds), not more.
    expect(pops[3]).toBeLessThan(2.3);
  });

  it('shakes in two bursts for a common or rare best card and three from epic on, each one harder', () => {
    const counts = RARITIES.map((r) => {
      const { flow, log, clock } = make([stack('k', r)]);
      play(flow, 4, clock);
      const powers = log.filter((l) => l.e.type === 'burst').map((l) => (l.e as { power: number }).power);
      for (let i = 1; i < powers.length; i++) expect(powers[i]).toBeGreaterThan(powers[i - 1] as number);
      expect(powers[powers.length - 1]).toBe(1);
      return powers.length;
    });
    expect(counts).toEqual([2, 2, 3, 3]);
    expect(burstPowers(3)).toEqual([0.4, 0.7, 1]);
  });

  it('gives a higher rank a longer wobble with more ticks that come closer together', () => {
    const wobbleOf = (r: ChestRarity): { dur: number; ticks: number[] } => {
      const { flow, log, clock } = make([stack('k', r)]);
      play(flow, 8, clock);
      const start = times(log, 'wobble')[0] as number;
      const flipAt = times(log, 'flip')[0] as number;
      return { dur: flipAt - start, ticks: times(log, 'tick').map((t) => t - start) };
    };
    const [c, r, e, l] = RARITIES.map(wobbleOf) as { dur: number; ticks: number[] }[];
    expect(c.ticks).toHaveLength(0);
    expect([r.ticks.length, e.ticks.length, l.ticks.length]).toEqual([2, 3, 5]);
    expect(r.dur).toBeGreaterThan(c.dur);
    expect(e.dur).toBeGreaterThan(r.dur);
    expect(l.dur).toBeGreaterThan(e.dur);
    const gaps = l.ticks.map((t, i) => t - (l.ticks[i - 1] ?? 0));
    for (let i = 2; i < gaps.length; i++) expect(gaps[i]).toBeLessThanOrEqual((gaps[i - 1] as number) + 1 / 30);
    expect(l.ticks[l.ticks.length - 1]).toBeLessThan(l.dur);
  });

  it('lets the next beat rise as soon as the one before it flies, and brings every beat to its place', () => {
    const list = stacks({ common: 2, rare: 2, epic: 1 });
    const { flow, log, clock } = make(list);
    play(flow, 12, clock);
    const beats = flow.beats.length;
    expect(times(log, 'place')).toHaveLength(beats);
    const rises = log.filter((l) => l.e.type === 'rise');
    const flies = log.filter((l) => l.e.type === 'fly');
    expect(rises).toHaveLength(beats);
    for (let i = 1; i < beats; i++) expect(Math.abs((rises[i] as Logged).at - (flies[i - 1] as Logged).at)).toBeLessThan(1 / 30);
    for (const b of flow.beats) expect(b.phase).toBe('placed');
  });

  it('keeps a pile with many stacks brisk: faster per beat, never more than a few seconds a card of the best rank', () => {
    const small = make(stacks({ common: 2, rare: 2, legendary: 1 }));
    play(small.flow, 30, small.clock);
    const huge = make(stacks({ common: 8, rare: 8, epic: 8, legendary: 6 }));
    play(huge.flow, 60, huge.clock);
    const perBeat = (m: ReturnType<typeof make>): number => ((times(m.log, 'summary')[0] as number) - (times(m.log, 'pop')[0] as number)) / m.flow.beats.length;
    expect(perBeat(huge)).toBeLessThan(perBeat(small));
    expect(huge.flow.summarised).toBe(true);
    expect(times(huge.log, 'summary')[0]).toBeLessThan(30);
  });

  it('grows the fan behind the chest with every burst and never lets it shrink', () => {
    const { flow, clock, log } = make(stacks({ epic: 1 }));
    let last = flow.chest.fan;
    const seen: number[] = [];
    for (let i = 0; i < 400; i++) {
      clock.t += 1 / 60;
      flow.update(1 / 60);
      expect(flow.chest.fan).toBeGreaterThanOrEqual(last - 1e-9);
      last = flow.chest.fan;
      if (i % 40 === 0) seen.push(last);
    }
    expect(log.length).toBeGreaterThan(0);
    expect(seen[0]).toBeLessThan(0.3);
    expect(last).toBeCloseTo(1, 5);
  });

  it('survives a huge step (a tab coming back) by firing everything in order once', () => {
    const { flow, log } = make(stacks({ common: 2, rare: 1, epic: 1 }));
    flow.update(0.5);
    flow.update(40);
    flow.update(40);
    expect(flow.summarised).toBe(true);
    const order = types(log);
    expect(order.filter((x) => x === 'summary')).toHaveLength(1);
    expect(order.filter((x) => x === 'pop')).toHaveLength(1);
    expect(order.indexOf('pop')).toBeLessThan(order.indexOf('rise'));
  });
});

describe('the director, tapped', () => {
  it('cracks the chest open with one tap per burst: the next burst starts at once', () => {
    const { flow, log, clock } = make(stacks({ common: 2 }));
    play(flow, TIMES.drop + 0.02, clock);
    expect(flow.chest.phase).toBe('idle');
    expect(flow.tap()).toBe(true);
    expect(flow.chest.phase).toBe('burst');
    expect(log.filter((l) => l.e.type === 'burst')).toHaveLength(1);
    expect((log[log.length - 1] as Logged).e).toMatchObject({ type: 'burst', index: 0, tapped: true });
    // A second tap while it shakes cuts the burst short and starts the next.
    play(flow, 0.05, clock);
    expect(flow.tap()).toBe(true);
    expect(log.filter((l) => l.e.type === 'burst')).toHaveLength(2);
    // The last burst is cut short by the third tap: the breath is held, and the pop follows within the hold.
    play(flow, 0.05, clock);
    expect(flow.tap()).toBe(true);
    expect(flow.chest.phase).toBe('hold');
    const heldAt = clock.t;
    play(flow, 1, clock);
    expect(times(log, 'pop')[0]).toBeGreaterThan(heldAt + TIMES.hold.common - 1 / 30);
    expect(times(log, 'pop')[0]).toBeLessThan(heldAt + TIMES.hold.common + 1 / 30);
    expect(clock.t).toBeGreaterThan(0);
  });

  it('is open well before the plain wind-up would have ended', () => {
    const tapped = make([stack('k', 'epic')]);
    play(tapped.flow, TIMES.drop + 0.01, tapped.clock);
    for (let i = 0; i < 4; i++) {
      tapped.flow.tap();
      play(tapped.flow, 1 / 15, tapped.clock);
    }
    play(tapped.flow, 1, tapped.clock);
    expect(times(tapped.log, 'pop')[0]).toBeLessThan(popTime('epic') - 0.6);
  });

  it('keeps a tap made during the fall and plays it the moment the chest lands', () => {
    const { flow, log, clock } = make(stacks({ rare: 1 }));
    play(flow, 0.1, clock);
    expect(flow.tap()).toBe(true);
    expect(types(log)).toEqual([]);
    play(flow, TIMES.drop, clock);
    expect(types(log).slice(0, 2)).toEqual(['land', 'burst']);
    expect(times(log, 'land')[0]).toBe(times(log, 'burst')[0]);
  });

  it('ignores a tap in the held breath (it is a held breath) and counts it as a tap in reduced motion', () => {
    const live = make([stack('k', 'common')]);
    play(live.flow, 1.3, live.clock);
    expect(live.flow.chest.phase).toBe('hold');
    expect(live.flow.tap()).toBe(false);
    const still = make([stack('k', 'common')], true);
    play(still.flow, 0.1, still.clock);
    expect(still.flow.chest.phase).toBe('hold');
    expect(still.flow.tap()).toBe(true);
    expect(types(still.log)).toContain('pop');
  });

  it('hurries the card on stage one step at a time: to its flip, its show, its flight, its place', () => {
    const { flow, log, clock } = make(stacks({ epic: 2 }));
    play(flow, TIMES.drop + 0.01, clock);
    for (let i = 0; i < 3; i++) {
      flow.tap();
      play(flow, 1 / 30, clock);
    }
    play(flow, 1, clock);
    expect(flow.chest.phase).toBe('open');
    const first = flow.beats[0];
    expect(first?.phase).not.toBe('queued');
    const steps: string[] = [];
    for (let guard = 0; guard < 12 && !flow.summarised; guard++) {
      const before = flow.beats.map((b) => b.phase).join();
      flow.tap();
      const after = flow.beats.map((b) => b.phase).join();
      if (after !== before) steps.push(after);
      play(flow, 1 / 30, clock);
    }
    expect(steps.length).toBeGreaterThan(2);
    play(flow, 10, clock);
    expect(flow.summarised).toBe(true);
    // No card is hurried past a step: every beat flipped, showed and flew once.
    for (const kind of ['flip', 'show', 'fly', 'place']) expect(times(log, kind)).toHaveLength(flow.beats.length);
  });

  it('a tap that has nothing to do says so', () => {
    const { flow, clock } = make(stacks({ common: 1 }));
    play(flow, 10, clock);
    expect(flow.summarised).toBe(true);
    expect(flow.tap()).toBe(false);
  });
});

describe('skipping', () => {
  it('announces the summary once from any frame and stops the director', () => {
    for (const at of [0, 0.2, 0.9, 1.45, 1.9, 2.6, 3.4]) {
      const { flow, log, clock } = make(stacks({ common: 2, rare: 1, epic: 1 }));
      if (at > 0) play(flow, at, clock);
      flow.skip();
      flow.skip();
      const n = log.length;
      play(flow, 5, clock);
      expect(flow.tap()).toBe(false);
      expect(log).toHaveLength(n);
      expect(types(log).filter((x) => x === 'summary')).toHaveLength(1);
      for (const b of flow.beats) expect(b.phase).toBe('placed');
    }
  });

  it('does not announce the summary twice when the played-out end follows a skip', () => {
    const { flow, log, clock } = make(stacks({ common: 1 }));
    play(flow, 1, clock);
    flow.skip();
    play(flow, 6, clock);
    expect(types(log).filter((x) => x === 'summary')).toHaveLength(1);
  });
});

describe('reduced motion', () => {
  it('has no fall and no bursts: the closed chest waits, opens, and every card shows face up in order', () => {
    const { flow, log, clock } = make(stacks({ common: 2, rare: 1, epic: 1 }), true);
    play(flow, 8, clock);
    const order = types(log);
    expect(order).not.toContain('land');
    expect(order).not.toContain('burst');
    expect(order).not.toContain('tick');
    expect(order[0]).toBe('hold');
    expect(times(log, 'pop')[0]).toBeCloseTo(TIMES.still, 1);
    expect(order[order.length - 1]).toBe('summary');
    // The card is on stage for the show and nothing else: its rise, flip and flight take no time.
    for (const b of flow.beats) expect(b.dur).toBeGreaterThanOrEqual(0);
    const shows = times(log, 'show');
    const flies = times(log, 'fly');
    expect(shows).toHaveLength(flow.beats.length);
    for (let i = 0; i < shows.length; i++) expect((flies[i] as number) - (shows[i] as number)).toBeGreaterThan(0.3);
    expect(times(log, 'place')).toEqual(flies);
  });
});

describe('the chest pose', () => {
  const sch = (best: ChestRarity) => {
    const { flow } = make([stack('k', best)]);
    return flow;
  };

  it('drops from above, lands with a squash and springs back', () => {
    const flow = sch('epic');
    const pose = newPose();
    windupPose(pose, flow.chest, 900);
    expect(pose.y).toBeCloseTo(-900, 5);
    flow.update(TIMES.drop * 0.5);
    windupPose(pose, flow.chest, 900);
    expect(pose.y).toBeGreaterThan(-900);
    expect(pose.y).toBeLessThan(0);
    flow.update(TIMES.drop * 0.5 + 0.002);
    expect(flow.chest.phase).toBe('idle');
    windupPose(pose, flow.chest, 900);
    expect(pose.y).toBe(0);
    expect(pose.sy).toBeLessThan(0.85);
    expect(pose.sx).toBeGreaterThan(1.1);
    flow.update(0.4);
    windupPose(pose, flow.chest, 900);
    expect(Math.abs(pose.sx - 1)).toBeLessThan(0.05);
  });

  it('shakes harder in each burst, hops, flicks the lid for a few frames and stands dead still for the last of the breath', () => {
    const flow = sch('legendary');
    const pose = newPose();
    const peaks: number[] = [];
    let ajarFrames = 0;
    let hop = 0;
    let lastBurst = -1;
    let peak = 0;
    for (let i = 0; i < 400 && flow.chest.phase !== 'hold'; i++) {
      flow.update(1 / 120);
      windupPose(pose, flow.chest, 900);
      if (flow.chest.phase === 'burst') {
        if (flow.chest.burst !== lastBurst) {
          if (lastBurst >= 0) peaks.push(peak);
          lastBurst = flow.chest.burst;
          peak = 0;
        }
        peak = Math.max(peak, Math.abs(pose.x));
        hop = Math.min(hop, pose.y);
        if (pose.ajar) ajarFrames++;
      }
    }
    peaks.push(peak);
    expect(peaks).toHaveLength(3);
    expect(peaks[1]).toBeGreaterThan(peaks[0] as number);
    expect(peaks[2]).toBeGreaterThan(peaks[1] as number);
    expect(hop).toBeLessThan(-6);
    expect(ajarFrames).toBeGreaterThan(3);
    expect(ajarFrames).toBeLessThan(80);
    // The last quarter of the held breath: nothing moves.
    flow.update(flow.chest.holdDur * 0.8);
    expect(flow.chest.phase).toBe('hold');
    windupPose(pose, flow.chest, 900);
    const a = { ...pose };
    flow.update(0.03);
    windupPose(pose, flow.chest, 900);
    expect(pose.x).toBe(0);
    expect(pose.sx).toBeCloseTo(a.sx, 3);
    expect(pose.sx).toBeGreaterThan(1.08);
  });

  it('squashes the chest on the frame of a tap, harder than the idle breathing', () => {
    const flow = sch('rare');
    const pose = newPose();
    flow.update(TIMES.drop + 0.4);
    windupPose(pose, flow.chest, 900);
    const calm = pose.sy;
    flow.tap();
    windupPose(pose, flow.chest, 900);
    expect(pose.sy).toBeLessThan(calm - 0.08);
  });

  it('pops with a jump, a squash on landing and a recoil, and ends at rest', () => {
    const pose = newPose();
    popPose(pose, 0);
    expect(pose.y).toBeCloseTo(0, 5);
    expect(pose.sx).toBeGreaterThan(1.1);
    popPose(pose, 0.12);
    expect(pose.y).toBeLessThan(-30);
    popPose(pose, 0.3);
    expect(pose.y).toBe(0);
    popPose(pose, 1.5);
    expect(pose.sx).toBeCloseTo(1, 2);
    expect(pose.sy).toBeCloseTo(1, 2);
    expect(pose.rot).toBeCloseTo(0, 3);
  });

  it('does not allocate: the same pose object is filled and returned', () => {
    const pose = newPose();
    const flow = sch('rare');
    expect(windupPose(pose, flow.chest, 700)).toBe(pose);
    expect(popPose(pose, 0.1)).toBe(pose);
  });

  it('shakes a screen by the square of the trauma and not at all without it', () => {
    const o = { x: 0, y: 0 };
    shakeOffset(o, 0, 3.3, 1);
    expect(Math.hypot(o.x, o.y)).toBe(0);
    let small = 0;
    let big = 0;
    for (let t = 0; t < 2; t += 0.01) {
      shakeOffset(o, 0.3, t, 1);
      small = Math.max(small, Math.hypot(o.x, o.y));
      shakeOffset(o, 0.9, t, 1);
      big = Math.max(big, Math.hypot(o.x, o.y));
    }
    expect(big).toBeGreaterThan(small * 5);
    expect(big).toBeLessThanOrEqual(16 * 2);
    shakeOffset(o, 0.9, 1, 0);
    expect(Math.hypot(o.x, o.y)).toBe(0);
  });
});

describe('the cards on stage', () => {
  const p = newCardPose();

  it('is big alone and shares the width when there are four, never wider than the screen', () => {
    expect(stageScale(1)).toBeGreaterThan(stageScale(2));
    expect(stageScale(2)).toBeGreaterThan(stageScale(3));
    expect(stageScale(3)).toBeGreaterThan(stageScale(4));
    for (let n = 1; n <= 4; n++) {
      const left = stageX(n, 0, 360) - (PLATE.w * stageScale(n)) / 2;
      const right = stageX(n, n - 1, 360) + (PLATE.w * stageScale(n)) / 2;
      expect(left).toBeGreaterThanOrEqual(24);
      expect(right).toBeLessThanOrEqual(696);
      expect((left + right) / 2).toBeCloseTo(360, 5);
      if (n > 1) expect(stageX(n, 1, 360) - stageX(n, 0, 360)).toBeCloseTo(PLATE.w * stageScale(n) + STAGE_GAP, 5);
    }
  });

  it('shoots up from the opening, grows as it comes and arrives on its place', () => {
    risePose(p, 0, 360, 600, 360, 340, 2.2, 1);
    expect([p.x, p.y]).toEqual([360, 600]);
    expect(p.s).toBeCloseTo(0.66, 2);
    risePose(p, 1, 360, 600, 300, 340, 2.2, 1);
    expect(p.x).toBeCloseTo(300, 5);
    expect(p.y).toBeCloseTo(340, 5);
    expect(p.s).toBeCloseTo(2.2, 5);
    expect(p.rot).toBeCloseTo(0, 5);
  });

  it('wobbles harder for a higher rank, a common hardly at all, and harder as the flip comes', () => {
    const swing = (rank: number, age: number): number => {
      let m = 0;
      for (let t = 0; t < 0.1; t += 0.002) {
        wobblePose(p, age + t, 1, rank, 360, 340, 2, 9);
        m = Math.max(m, Math.abs(p.rot));
      }
      return m;
    };
    expect(swing(0, 0.8)).toBeLessThan(0.03);
    expect(swing(1, 0.8)).toBeGreaterThan(swing(0, 0.8));
    expect(swing(2, 0.8)).toBeGreaterThan(swing(1, 0.8));
    expect(swing(3, 0.8)).toBeGreaterThan(swing(2, 0.8));
    expect(swing(3, 0.9)).toBeGreaterThan(swing(3, 0.1));
  });

  it('turns edge-on exactly where the face takes over and ends open, full width', () => {
    flipPose(p, 0, 360, 340, 2);
    expect(p.flipX).toBe(1);
    flipPose(p, FLIP_TURN, 360, 340, 2);
    expect(p.flipX).toBeCloseTo(0, 5);
    flipPose(p, 1, 360, 340, 2);
    expect(p.flipX).toBeCloseTo(1, 5);
    expect(p.y).toBeCloseTo(340, 3);
    expect(p.s).toBeCloseTo(2, 3);
    let widest = 0;
    for (let k = FLIP_TURN; k <= 1; k += 0.01) {
      flipPose(p, k, 0, 0, 1);
      widest = Math.max(widest, p.flipX);
    }
    expect(widest).toBeGreaterThan(1);
  });

  it('swells only for the best card of a good chest', () => {
    showPose(p, 0.4, 1, true, 360, 340, 2);
    expect(p.s).toBeGreaterThan(2.1);
    showPose(p, 0.4, 1, false, 360, 340, 2);
    expect(p.s).toBeLessThan(2.05);
  });

  it('flies from the stage to its place, shrinking to the plate size, and lands exactly there', () => {
    flyPose(p, 0, 360, 340, 2.2, 100, 900, 0.9, -1);
    expect([p.x, p.y, p.s]).toEqual([360, 340, 2.2]);
    flyPose(p, 0.5, 360, 340, 2.2, 100, 900, 0.9, -1);
    expect(p.s).toBeLessThan(2.2);
    expect(p.s).toBeGreaterThan(0.9);
    flyPose(p, 1, 360, 340, 2.2, 100, 900, 0.9, -1);
    expect(p.x).toBeCloseTo(100, 5);
    expect(p.y).toBeCloseTo(900, 5);
    expect(p.s).toBeCloseTo(0.9, 5);
    expect(p.rot).toBeCloseTo(0, 5);
    // Past the end it stays there; before the start it stays at the start.
    flyPose(p, 3, 360, 340, 2.2, 100, 900, 0.9, -1);
    expect(p.x).toBeCloseTo(100, 5);
    flyPose(p, -2, 360, 340, 2.2, 100, 900, 0.9, -1);
    expect(p.x).toBe(360);
  });
});

describe('stacks from a real result feed the director', () => {
  it('plays a result of cards through the director', () => {
    const list = stacksOf({
      cards: [
        { rarity: 'common', unit: 'w_paw' }, { rarity: 'common', unit: 'w_paw' }, { rarity: 'rare', unit: 'r_archer' },
        { rarity: 'common', unit: null }, { rarity: 'legendary', unit: 'm_frost' },
      ],
      pity: { unit: null, cards: 0 },
    });
    const { flow, clock } = make(list);
    play(flow, 20, clock);
    expect(flow.summarised).toBe(true);
    expect(flow.best).toBe('legendary');
    expect(flow.beats[flow.beats.length - 1]?.plan.stacks).toEqual([list.length - 1]);
  });
});
