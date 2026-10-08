import { describe, expect, it, vi } from 'vitest';

// The card motion reads the kit's easing; nothing here needs a canvas.
vi.mock('@/ui', () => ({ backOut: (s: number) => (t: number) => 1 + (s + 1) * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2) }));

import type { ChestRarity, ChestResult } from '@/meta/types';
import { flipPose, flyPose, newCardPose, risePose, shadePose, showPose, stageScale, stageX, STAGE_GAP, wobblePose } from '../src/screens/shop/cardMotion';
import { crownLift, newPose, popPose, shakeOffset, windupPose } from '../src/screens/shop/chestPose';
import { CLIMBS, TOP_RANK, type ClimbPattern } from '../src/screens/shop/climb';
import {
  beatDuration, beatHops, beatPower, beatsOf, FLIP_TURN, RevealFlow, TIMES, type FlowEvent, type FlowOpts,
} from '../src/screens/shop/revealFlow';
import { mergePile, PLATE, rarityRank, stacksOf, type RevealStack } from '../src/screens/shop/revealPlan';

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
  /** The colour the stage showed when the event fired. */
  rank: number;
}

/** Run a flow by `dt` steps for `seconds`; every event is stamped with the time of the step it fired in. */
function play(flow: RevealFlow, seconds: number, clock = { t: 0 }, dt = 1 / 60): void {
  const end = clock.t + seconds;
  while (clock.t < end - 1e-9) {
    clock.t += dt;
    flow.update(dt);
  }
}

function make(list: RevealStack[], opts: FlowOpts = {}): { flow: RevealFlow; log: Logged[]; clock: { t: number } } {
  const log: Logged[] = [];
  const clock = { t: 0 };
  // The flow is built before the closure runs, so `flowRef` is set by the first event.
  const ref: { flow: RevealFlow | null } = { flow: null };
  const flow = new RevealFlow(list, (e) => log.push({ at: clock.t, e, rank: ref.flow ? ref.flow.chest.rank : 0 }), opts);
  ref.flow = flow;
  return { flow, log, clock };
}

/** One stack of the given best rank, played with the given climb pattern. */
function climbed(best: ChestRarity, climb: ClimbPattern, extra: FlowOpts = {}): ReturnType<typeof make> {
  return make([stack('k', best)], { climb, ...extra });
}

const types = (log: Logged[]): string[] => log.map((l) => l.e.type);
const times = (log: Logged[], type: string): number[] => log.filter((l) => l.e.type === type).map((l) => l.at);
const promotions = (log: Logged[]): Array<{ from: number; to: number }> =>
  log.filter((l) => l.e.type === 'promote').map((l) => ({ from: (l.e as { from: number }).from, to: (l.e as { to: number }).to }));

/** Every pattern of the table with the rank it belongs to. */
const PATTERNS: Array<{ best: ChestRarity; pattern: ClimbPattern }> = RARITIES.flatMap((best) => CLIMBS[best].map((pattern) => ({ best, pattern })));

/** Seconds from the first frame to the pop, and to the first card rising, for a pattern played alone. */
function timing(best: ChestRarity, pattern: ClimbPattern): { pop: number; firstCard: number } {
  const { flow, log, clock } = climbed(best, pattern);
  play(flow, 12, clock);
  return { pop: times(log, 'pop')[0] as number, firstCard: times(log, 'rise')[0] as number };
}

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

describe('the climb patterns', () => {
  it('has two or three patterns for every best rank, with odds that add up to a hundred', () => {
    for (const best of RARITIES) {
      const rows = CLIMBS[best];
      expect(rows.length).toBeGreaterThanOrEqual(2);
      expect(rows.length).toBeLessThanOrEqual(3);
      expect(rows.reduce((n, p) => n + p.odds, 0)).toBe(100);
      expect(new Set(rows.map((p) => p.id)).size).toBe(rows.length);
    }
  });

  it('ends exactly on its best rank, never passes it and never goes down', () => {
    for (const { best, pattern } of PATTERNS) {
      const ranks = pattern.beats;
      expect(ranks.length).toBeGreaterThan(0);
      expect(ranks[ranks.length - 1]).toBe(rarityRank(best));
      let at = 0;
      for (const r of ranks) {
        expect(r).toBeGreaterThanOrEqual(at);
        expect(r).toBeLessThanOrEqual(rarityRank(best));
        at = r;
      }
      // A late climb needs a beat before the late one to sit on.
      if (pattern.late) expect(ranks.length).toBeGreaterThanOrEqual(3);
    }
  });

  it('gives a better result more beats: the steady pattern of each rank is longer than the one below', () => {
    const steady = RARITIES.map((r) => CLIMBS[r][0] as ClimbPattern);
    for (let i = 1; i < steady.length; i++) expect(steady[i]?.beats.length).toBeGreaterThanOrEqual((steady[i - 1]?.beats.length ?? 0) + (i === 1 ? 0 : 1));
    expect(CLIMBS.legendary.some((p) => p.late)).toBe(true);
    expect(CLIMBS.legendary.some((p) => p.beats.some((r, i) => r - (p.beats[i - 1] ?? 0) >= 2))).toBe(true);
    expect(CLIMBS.common.every((p) => p.beats.every((r) => r === 0))).toBe(true);
  });

  it('plays what the table says: the colour climbs by the pattern on its beats, from the quiet colour, and ends on the best rank', () => {
    for (const { best, pattern } of PATTERNS) {
      const { flow, log, clock } = climbed(best, pattern);
      play(flow, 10, clock);
      const bursts = log.filter((l) => l.e.type === 'burst');
      expect(bursts).toHaveLength(pattern.beats.length);
      // After each beat the stage shows what the pattern says.
      bursts.forEach((b, i) => expect(b.rank).toBe(pattern.beats[i]));
      // Promotions chain from the quiet colour (rank 0) to the best rank, each from where the last one ended.
      let at = 0;
      for (const p of promotions(log)) {
        expect(p.from).toBe(at);
        expect(p.to).toBeGreaterThan(at);
        at = p.to;
      }
      expect(at).toBe(rarityRank(best));
      expect(flow.chest.rank).toBe(rarityRank(best));
    }
  });

  it('shows nothing but the quiet colour until the first promotion, whatever the result', () => {
    for (const { best, pattern } of PATTERNS) {
      const { flow, log, clock } = climbed(best, pattern);
      play(flow, 10, clock);
      const first = log.findIndex((l) => l.e.type === 'promote');
      const before = first < 0 ? log : log.slice(0, first);
      for (const l of before) expect(l.rank).toBe(0);
      // The land and the first rest are the same for every opening: the fall is not a tell.
      expect(types(log)[0]).toBe('land');
    }
  });

  it('makes a promotion beat harder and longer than any quiet beat, and the top rank full', () => {
    expect(beatDuration(1)).toBeGreaterThan(beatDuration(0));
    expect(beatDuration(2)).toBeGreaterThan(beatDuration(1));
    expect(beatHops(1)).toBeGreaterThan(beatHops(0));
    expect(beatHops(2)).toBeGreaterThan(beatHops(1));
    const quiet = Math.max(...[0, 1, 2, 3, 4].map((i) => beatPower(i, 0, 0)));
    expect(beatPower(0, 1, 1)).toBeGreaterThan(quiet);
    expect(beatPower(0, 1, 2)).toBeGreaterThan(beatPower(0, 1, 1));
    expect(beatPower(0, 1, 3)).toBe(1);
    expect(beatPower(2, 0, 0)).toBeGreaterThan(beatPower(1, 0, 0));
  });

  it('stalls once, and only in a late climb, between its last two colours', () => {
    for (const { best, pattern } of PATTERNS) {
      const { flow, log, clock } = climbed(best, pattern);
      play(flow, 10, clock);
      const stalls = log.filter((l) => l.e.type === 'stall');
      expect(stalls).toHaveLength(pattern.late ? 1 : 0);
      if (!pattern.late) continue;
      const stall = stalls[0] as Logged;
      const bursts = log.filter((l) => l.e.type === 'burst');
      const last = bursts[bursts.length - 1] as Logged;
      // It sits on the colour before the last one, goes still for its breath, then cracks to the best rank with no other event between.
      expect(stall.rank).toBeLessThan(rarityRank(best));
      expect(last.rank).toBe(rarityRank(best));
      expect(last.at - stall.at).toBeGreaterThan(TIMES.stall - 1 / 30);
      expect(last.at - stall.at).toBeLessThan(TIMES.stall + 1 / 30);
      expect(types(log).filter((x) => x === 'hold')).toHaveLength(1);
      expect(log.indexOf(stall)).toBeLessThan(log.findIndex((l) => l.e.type === 'hold'));
      expect((stall.e as { duration: number }).duration).toBe(TIMES.stall);
    }
  });

  it('starts the top rank\'s show on the promotion that reaches it and on no other', () => {
    for (const { best, pattern } of PATTERNS) {
      const { flow, log, clock } = climbed(best, pattern);
      let crownAt = -1;
      for (let i = 0; i < 700; i++) {
        clock.t += 1 / 60;
        flow.update(1 / 60);
        if (crownAt < 0 && flow.chest.crown >= 0) crownAt = clock.t;
      }
      if (best === 'legendary') {
        expect(crownAt).toBeGreaterThan(0);
        const to = log.find((l) => l.e.type === 'promote' && (l.e as { to: number }).to === TOP_RANK) as Logged;
        expect(Math.abs(crownAt - to.at)).toBeLessThan(1 / 30);
        const hold = log.find((l) => l.e.type === 'hold')?.e as { duration: number };
        expect(hold.duration).toBeGreaterThanOrEqual(1);
      } else {
        expect(crownAt).toBe(-1);
      }
    }
  });

  it('picks a pattern from the seed the same way every time and follows the odds', () => {
    const counts = new Map<string, number>();
    for (let seed = 0; seed < 1000; seed++) {
      const a = make([stack('k', 'legendary')], { seed });
      const b = make([stack('k', 'legendary')], { seed });
      expect(a.flow.climb.id).toBe(b.flow.climb.id);
      counts.set(a.flow.climb.id, (counts.get(a.flow.climb.id) ?? 0) + 1);
    }
    for (const p of CLIMBS.legendary) expect(counts.get(p.id)).toBe(p.odds * 10);
  });
});

describe('the director, left alone', () => {
  it('plays a wooden chest of commons in about three seconds, every event once and in order', () => {
    const { flow, log, clock } = make(stacks({ common: 3 }), { climb: CLIMBS.common[0] as ClimbPattern });
    play(flow, 6, clock);
    expect(flow.summarised).toBe(true);
    const order = types(log);
    expect(order.filter((x) => x === 'land')).toHaveLength(1);
    expect(order.filter((x) => x === 'burst')).toHaveLength(2);
    for (const one of ['hold', 'pop', 'summary']) expect(order.filter((x) => x === one)).toHaveLength(1);
    expect(order).not.toContain('promote');
    expect(order.indexOf('land')).toBeLessThan(order.indexOf('burst'));
    expect(order.indexOf('hold')).toBeGreaterThan(order.lastIndexOf('burst'));
    expect(order.indexOf('pop')).toBeGreaterThan(order.indexOf('hold'));
    expect(order.indexOf('rise')).toBeGreaterThan(order.indexOf('pop'));
    expect(order[order.length - 1]).toBe('summary');
    const done = (times(log, 'summary')[0] as number);
    expect(done).toBeGreaterThan(2.4);
    expect(done).toBeLessThan(3.4);
  });

  it('reaches the first card of a chest of only the lowest rank in about one and a half seconds, and opens a quick one sooner', () => {
    const quiet = timing('common', CLIMBS.common[0] as ClimbPattern);
    const quick = timing('common', CLIMBS.common[1] as ClimbPattern);
    expect(quiet.firstCard).toBeGreaterThan(1.3);
    expect(quiet.firstCard).toBeLessThan(1.8);
    expect(quick.firstCard).toBeLessThan(quiet.firstCard);
    expect(quick.firstCard).toBeGreaterThan(1);
  });

  it('adds about half a second for every promotion and takes about four seconds to pop a top-rank chest', () => {
    const steady = RARITIES.map((r) => timing(r, CLIMBS[r][0] as ClimbPattern));
    // The first and the second promotion each add between 0.4 and 0.8 s to the first card.
    for (const i of [1, 2]) {
      const step = (steady[i] as { firstCard: number }).firstCard - (steady[i - 1] as { firstCard: number }).firstCard;
      expect(step).toBeGreaterThan(0.4);
      expect(step).toBeLessThan(0.8);
    }
    // The top rank also has its long held breath: about four seconds to the pop, a late climb a little over.
    const top = steady[3] as { pop: number };
    expect(top.pop).toBeGreaterThan(3.4);
    expect(top.pop).toBeLessThan(4.6);
    const late = timing('legendary', CLIMBS.legendary[1] as ClimbPattern);
    expect(late.pop).toBeGreaterThan(top.pop + TIMES.stall - 0.1);
    expect(late.pop).toBeLessThan(5.2);
    // Every better steady chest takes longer than the one below, and none of the table runs away.
    for (const { best, pattern } of PATTERNS) expect(timing(best, pattern).pop).toBeLessThan(5.2);
    for (let i = 1; i < steady.length; i++) expect((steady[i] as { pop: number }).pop).toBeGreaterThan((steady[i - 1] as { pop: number }).pop);
  });

  it('holds the breath before the pop for the creak, longer the better the chest', () => {
    const holds = PATTERNS.map(({ best, pattern }) => {
      const { flow, log, clock } = climbed(best, pattern);
      play(flow, 8, clock);
      const hold = (log.find((l) => l.e.type === 'hold')?.e as { duration: number }).duration;
      expect(hold).toBeGreaterThanOrEqual(TIMES.creak);
      const heldAt = times(log, 'hold')[0] as number;
      expect(Math.abs(times(log, 'pop')[0] as number - heldAt - hold)).toBeLessThan(1 / 30);
      // The creak is the last of it, so the open sound's pop lands on the pop frame.
      expect(times(log, 'creak')).toHaveLength(1);
      expect(Math.abs((times(log, 'pop')[0] as number) - (times(log, 'creak')[0] as number) - TIMES.creak)).toBeLessThan(1 / 30);
      expect(types(log).indexOf('creak')).toBeGreaterThan(types(log).indexOf('hold'));
      expect(types(log).indexOf('creak')).toBeLessThan(types(log).indexOf('pop'));
      return { best, hold };
    });
    const by = (r: ChestRarity): number => (holds.find((h) => h.best === r) as { hold: number }).hold;
    expect(by('rare')).toBeGreaterThan(by('common'));
    expect(by('legendary')).toBeGreaterThan(by('epic') * 2);
  });

  it('gives a higher rank a longer wobble with more ticks that come closer together', () => {
    const wobbleOf = (r: ChestRarity): { dur: number; ticks: number[] } => {
      const { flow, log, clock } = make([stack('k', r)]);
      play(flow, 12, clock);
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
    play(flow, 14, clock);
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
    expect(times(huge.log, 'summary')[0]).toBeLessThan(34);
  });

  it('survives a huge step (a tab coming back) by firing everything in order once', () => {
    for (const { best, pattern } of PATTERNS) {
      const { flow, log } = make(stacks({ common: 2, [best]: 1 }), { climb: pattern });
      flow.update(0.5);
      flow.update(40);
      flow.update(40);
      expect(flow.summarised).toBe(true);
      const order = types(log);
      expect(order.filter((x) => x === 'summary')).toHaveLength(1);
      expect(order.filter((x) => x === 'pop')).toHaveLength(1);
      expect(order.indexOf('pop')).toBeLessThan(order.indexOf('rise'));
      expect(promotions(log).map((p) => p.to).filter((to, i, all) => to > (all[i - 1] ?? 0))).toHaveLength(promotions(log).length);
      expect(flow.chest.rank).toBe(rarityRank(best));
    }
  });
});

describe('the silhouette of the best card', () => {
  const sequence = (list: RevealStack[]): string[] => {
    const { flow, log, clock } = make(list, { seed: 3 });
    play(flow, 20, clock);
    const last = flow.beats.length - 1;
    return log.filter((l) => 'beat' in l.e && l.e.beat === last && l.e.type !== 'tick').map((l) => l.e.type);
  };

  it('is shown from the epic rank up, on every stack of the best rank (one beat each, at the end) and nowhere else', () => {
    expect(beatsOf(stacks({ common: 2, rare: 1 })).some((b) => b.veiled)).toBe(false);
    for (const spec of [{ common: 1 }, { rare: 2 }, { common: 2, rare: 1 }, { rare: 3 }]) expect(beatsOf(stacks(spec)).every((b) => !b.veiled)).toBe(true);
    const cases: Array<[Partial<Record<ChestRarity, number>>, number]> = [
      [{ epic: 1 }, 1], [{ common: 3, epic: 2 }, 2], [{ common: 3, rare: 2, epic: 1, legendary: 1 }, 1], [{ epic: 2, legendary: 3 }, 3],
      [{ common: 2, rare: 3, epic: 3 }, 3], [{ legendary: 4 }, 4], [{ common: 6, rare: 4, epic: 5, legendary: 6 }, 6],
    ];
    for (const [spec, count] of cases) {
      const list = stacks(spec);
      const beats = beatsOf(list);
      const best = (list[list.length - 1] as RevealStack).rarity;
      // The best rank's stacks are the last beats, one each and in order; every beat before them is a plain flip.
      expect(beats.map((b) => b.veiled)).toEqual(beats.map((_, i) => i >= beats.length - count));
      expect(beats.slice(beats.length - count).map((b) => b.stacks)).toEqual(Array.from({ length: count }, (_, i) => [list.length - count + i]));
      for (const b of beats.slice(beats.length - count)) expect(b.rarity).toBe(best);
      // The first of them is the one that holds the full time; the final one carries the finish.
      expect(beats.map((b) => b.firstVeil)).toEqual(beats.map((_, i) => i === beats.length - count));
      expect(beats.map((b) => b.last)).toEqual(beats.map((_, i) => i === beats.length - 1));
    }
  });

  it('flips to the silhouette, holds it, peels it away to the card and only then shows it', () => {
    for (const best of ['epic', 'legendary'] as const) {
      const order = sequence(stacks({ common: 1, [best]: 1 }));
      expect(order).toEqual(['rise', 'wobble', 'flip', 'shade', 'peel', 'show', 'fly', 'place']);
    }
    // A card below the epic rank flips as it always did.
    expect(sequence(stacks({ common: 1, rare: 1 }))).toEqual(['rise', 'wobble', 'flip', 'show', 'fly', 'place']);
  });

  it('holds the silhouette longer for a better card, and each tap moves the card one step on', () => {
    const held = (best: ChestRarity): number => {
      const { flow, log, clock } = make([stack('k', best)], { seed: 3 });
      play(flow, 20, clock);
      return (times(log, 'peel')[0] as number) - (times(log, 'shade')[0] as number);
    };
    expect(held('epic')).toBeGreaterThan(0.5);
    expect(held('legendary')).toBeGreaterThan(held('epic'));
    const { flow, log, clock } = make([stack('k', 'legendary')], { seed: 3 });
    let guard = 0;
    while (!log.some((l) => l.e.type === 'shade') && guard++ < 600) {
      flow.tap();
      play(flow, 1 / 30, clock);
    }
    expect(flow.beats[0]?.phase).toBe('shade');
    flow.tap();
    expect(flow.beats[0]?.phase).toBe('peel');
    flow.tap();
    expect(flow.beats[0]?.phase).toBe('show');
    flow.tap();
    expect(flow.beats[0]?.phase).toBe('fly');
  });

  /** Seconds each silhouette of a flow is held (shade to peel), by beat. */
  const holds = (log: Logged[]): Array<{ beat: number; held: number }> =>
    log.filter((l) => l.e.type === 'shade').map((l) => {
      const beat = (l.e as { beat: number }).beat;
      const peel = log.find((p) => p.e.type === 'peel' && (p.e as { beat: number }).beat === beat) as Logged;
      return { beat, held: peel.at - l.at };
    });
  const atBeat = (log: Logged[], b: number, type: string): number =>
    times(log.filter((l) => 'beat' in l.e && l.e.beat === b), type)[0] as number;

  it('shows every stack of the best rank as a silhouette, one after another: the first held the full time, the rest shorter, and the summary comes once', () => {
    for (const best of ['epic', 'legendary'] as const) {
      for (const count of [2, 3, 4]) {
        const { flow, log, clock } = make(stacks({ common: 1, rare: 1, [best]: count }), { seed: 3 });
        play(flow, 40, clock);
        const first = flow.beats.length - count;
        const shown = holds(log);
        expect(shown.map((h) => h.beat)).toEqual(Array.from({ length: count }, (_, i) => first + i));
        shown.forEach((h, i) => expect(Math.abs(h.held - (i === 0 ? TIMES.shade[best] : TIMES.shadeNext[best]))).toBeLessThan(1 / 30));
        expect(TIMES.shadeNext[best]).toBeGreaterThanOrEqual(0.3);
        expect(TIMES.shadeNext[best]).toBeLessThanOrEqual(0.4);
        expect(TIMES.shadeNext[best]).toBeLessThan(TIMES.shade[best]);
        // The next beat rises only when the one before has flown, so two silhouettes are never up at once.
        for (let b = first + 1; b < flow.beats.length; b++) expect(atBeat(log, b, 'shade')).toBeGreaterThan(atBeat(log, b - 1, 'peel'));
        // Only the last beat is the best card's finish.
        expect(flow.beats.filter((b) => b.plan.last)).toHaveLength(1);
        expect(flow.beats[flow.beats.length - 1]?.plan.veiled).toBe(true);
        expect(types(log).filter((x) => x === 'summary')).toHaveLength(1);
        for (const b of flow.beats) expect(b.phase).toBe('placed');
      }
    }
  });

  it('leaves the cards below the best rank as plain flips even when several share their rank', () => {
    const { flow, log, clock } = make(stacks({ epic: 2, legendary: 2 }), { seed: 3 });
    play(flow, 40, clock);
    expect(holds(log).map((h) => h.beat)).toEqual([2, 3]);
    const plain = log.filter((l) => 'beat' in l.e && l.e.beat < 2 && l.e.type !== 'tick').map((l) => l.e.type);
    expect(plain).not.toContain('shade');
    expect(plain).not.toContain('peel');
  });

  it('is hurried by taps one step each, silhouette after silhouette, and still ends in one summary', () => {
    const { flow, log, clock } = make(stacks({ common: 1, legendary: 3 }), { seed: 3 });
    let guard = 0;
    while (!flow.summarised && guard++ < 2000) {
      flow.tap();
      play(flow, 1 / 30, clock);
    }
    expect(flow.summarised).toBe(true);
    const shown = holds(log);
    expect(shown).toHaveLength(3);
    // Each tap moves a beat one step, so no silhouette waits for its time.
    for (const h of shown) expect(h.held).toBeLessThan(0.2);
    expect(types(log).filter((x) => x === 'summary')).toHaveLength(1);
    // Each tap, one step: a silhouette gives way to its peel on the very next tap, and the flight lets the next beat rise.
    const again = make(stacks({ legendary: 2 }), { seed: 3 });
    guard = 0;
    while (!again.log.some((l) => l.e.type === 'shade') && guard++ < 600) {
      again.flow.tap();
      play(again.flow, 1 / 30, again.clock);
    }
    expect(again.flow.beats[0]?.phase).toBe('shade');
    expect(again.flow.beats[1]?.phase).toBe('queued');
    again.flow.tap();
    expect(again.flow.beats[0]?.phase).toBe('peel');
    again.flow.tap();
    expect(again.flow.beats[0]?.phase).toBe('show');
    again.flow.tap();
    expect(again.flow.beats[0]?.phase).toBe('fly');
    expect(again.flow.beats[1]?.phase).toBe('rise');
  });

  it('gives a silhouette to every stack of the best rank of a whole pile of chests, not of each chest', () => {
    const chest = (id: number, cards: ChestResult['cards']): ChestResult =>
      ({ id, kind: 'gold', seed: id, oddsVersion: 1, upgraded: 0, overflowGold: 0, batch: 1, cards, pity: { unit: null, cards: 0 } }) as ChestResult;
    const list = stacksOf(mergePile([
      chest(1, [{ rarity: 'common', unit: 'w_paw' }, { rarity: 'epic', unit: 'm_storm' }, { rarity: 'legendary', unit: 'w_samurai' }]),
      chest(2, [{ rarity: 'rare', unit: 'w_sword' }, { rarity: 'epic', unit: 'w_viking' }]),
      chest(3, [{ rarity: 'legendary', unit: 'r_gunner' }, { rarity: 'legendary', unit: 'w_samurai' }]),
    ]));
    const beats = beatsOf(list);
    // Two legendary cats in the whole pile (w_samurai opened twice is one stack); the epics of the first two chests stay plain flips.
    const veiled = beats.filter((b) => b.veiled).flatMap((b) => b.stacks.map((i) => (list[i] as RevealStack).key));
    expect(veiled).toHaveLength(2);
    expect(new Set(veiled)).toEqual(new Set(['w_samurai', 'r_gunner']));
    expect(beats.filter((b) => b.veiled).every((b) => b.rarity === 'legendary')).toBe(true);
    expect(beats.slice(0, beats.length - 2).some((b) => b.veiled)).toBe(false);
    const { flow, log, clock } = make(list, { seed: 3 });
    play(flow, 40, clock);
    expect(holds(log)).toHaveLength(2);
    expect(types(log).filter((x) => x === 'summary')).toHaveLength(1);
  });

  it('can be skipped in the middle of the silhouettes: everything is placed at once and the summary comes once', () => {
    const { flow, log, clock } = make(stacks({ common: 1, legendary: 3 }), { seed: 3 });
    let guard = 0;
    while (log.filter((l) => l.e.type === 'shade').length < 2 && guard++ < 3000) play(flow, 1 / 60, clock);
    expect(flow.beats[flow.beats.length - 2]?.phase).toBe('shade');
    flow.skip();
    play(flow, 8, clock);
    for (const b of flow.beats) expect(b.phase).toBe('placed');
    expect(types(log).filter((x) => x === 'summary')).toHaveLength(1);
    expect(log.filter((l) => l.e.type === 'shade')).toHaveLength(2);
  });
});

describe('the director, tapped', () => {
  it('cracks the chest open with one tap per beat: the next beat starts at once', () => {
    const { flow, log, clock } = make(stacks({ common: 2 }), { climb: CLIMBS.common[0] as ClimbPattern });
    play(flow, TIMES.drop + 0.02, clock);
    expect(flow.chest.phase).toBe('idle');
    expect(flow.tap()).toBe(true);
    expect(flow.chest.phase).toBe('burst');
    expect(log.filter((l) => l.e.type === 'burst')).toHaveLength(1);
    expect((log[log.length - 1] as Logged).e).toMatchObject({ type: 'burst', index: 0, tapped: true });
    // A second tap while it shakes cuts the beat short and starts the next; the last beat is cut short into the breath.
    play(flow, 0.05, clock);
    expect(flow.tap()).toBe(true);
    expect(log.filter((l) => l.e.type === 'burst')).toHaveLength(2);
    play(flow, 0.05, clock);
    expect(flow.tap()).toBe(true);
    expect(flow.chest.phase).toBe('hold');
    const heldAt = clock.t;
    play(flow, 1, clock);
    expect(times(log, 'pop')[0]).toBeGreaterThan(heldAt + TIMES.hold.common - 1 / 30);
    expect(times(log, 'pop')[0]).toBeLessThan(heldAt + TIMES.hold.common + 1 / 30);
  });

  it('still climbs one rank at a time when tapped through: a tap never skips a promotion or passes the best rank', () => {
    for (const { best, pattern } of PATTERNS) {
      const { flow, log, clock } = climbed(best, pattern);
      play(flow, TIMES.drop + 0.01, clock);
      for (let i = 0; i < 12; i++) {
        flow.tap();
        play(flow, 1 / 20, clock);
      }
      play(flow, 4, clock);
      expect(promotions(log).map((p) => p.to)).toEqual(pattern.beats.filter((r, i) => r > (pattern.beats[i - 1] ?? 0)));
      expect(flow.chest.rank).toBe(rarityRank(best));
      expect(types(log).filter((x) => x === 'pop')).toHaveLength(1);
    }
  });

  it('is open well before the plain wind-up would have ended, and skips the stall of a late climb', () => {
    const late = CLIMBS.legendary[1] as ClimbPattern;
    const calm = climbed('legendary', late);
    play(calm.flow, 8, calm.clock);
    const tapped = climbed('legendary', late);
    play(tapped.flow, TIMES.drop + 0.01, tapped.clock);
    for (let i = 0; i < 5; i++) {
      tapped.flow.tap();
      play(tapped.flow, 1 / 15, tapped.clock);
    }
    play(tapped.flow, 3, tapped.clock);
    expect(tapped.log.filter((l) => l.e.type === 'stall')).toHaveLength(0);
    expect(times(tapped.log, 'pop')[0]).toBeLessThan((times(calm.log, 'pop')[0] as number) - 1.5);
    expect(tapped.flow.chest.rank).toBe(TOP_RANK);
  });

  it('cuts the stall short with a tap: the late promotion comes at once', () => {
    const { flow, log, clock } = climbed('legendary', CLIMBS.legendary[1] as ClimbPattern);
    let guard = 0;
    while (flow.chest.phase !== 'stall' && guard++ < 900) play(flow, 1 / 60, clock);
    expect(flow.chest.phase).toBe('stall');
    expect(flow.chest.rank).toBe(2);
    const at = clock.t;
    play(flow, 0.1, clock);
    expect(flow.tap()).toBe(true);
    expect(flow.chest.phase).toBe('burst');
    expect(flow.chest.rank).toBe(TOP_RANK);
    expect(clock.t - at).toBeLessThan(TIMES.stall);
    expect(log.filter((l) => l.e.type === 'burst').length).toBe(4);
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

  it('cuts a long held breath down to its creak with a tap, and has nothing to cut once it is only the creak', () => {
    const top = climbed('legendary', CLIMBS.legendary[0] as ClimbPattern);
    let guard = 0;
    while (top.flow.chest.phase !== 'hold' && guard++ < 900) play(top.flow, 1 / 60, top.clock);
    expect(top.flow.chest.phase).toBe('hold');
    play(top.flow, 0.1, top.clock);
    const at = top.clock.t;
    expect(types(top.log)).not.toContain('creak');
    expect(top.flow.tap()).toBe(true);
    // The creak starts on the frame of the tap and the pop follows a creak later, not a whole breath.
    expect(times(top.log, 'creak')).toEqual([at]);
    play(top.flow, 0.5, top.clock);
    expect(Math.abs((times(top.log, 'pop')[0] as number) - at - TIMES.creak)).toBeLessThan(1 / 30);
    // A tap in the creak itself has nothing left to cut.
    const live = make([stack('k', 'rare')], { climb: CLIMBS.rare[0] as ClimbPattern });
    guard = 0;
    while (live.flow.chest.phase !== 'hold' && guard++ < 900) play(live.flow, 1 / 60, live.clock);
    play(live.flow, TIMES.hold.rare - TIMES.creak + 0.02, live.clock);
    expect(types(live.log)).toContain('creak');
    expect(live.flow.tap()).toBe(false);
    const common = make([stack('k', 'common')], { climb: CLIMBS.common[0] as ClimbPattern });
    guard = 0;
    while (common.flow.chest.phase !== 'hold' && guard++ < 900) play(common.flow, 1 / 60, common.clock);
    expect(common.flow.tap()).toBe(false);
  });

  it('hurries the card on stage one step at a time: to its flip, its show, its flight, its place', () => {
    const { flow, log, clock } = make(stacks({ epic: 2 }), { seed: 3 });
    play(flow, TIMES.drop + 0.01, clock);
    for (let i = 0; i < 6; i++) {
      flow.tap();
      play(flow, 1 / 30, clock);
    }
    play(flow, 1.6, clock);
    expect(flow.chest.phase).toBe('open');
    const first = flow.beats[0];
    expect(first?.phase).not.toBe('queued');
    const steps: string[] = [];
    for (let guard = 0; guard < 24 && !flow.summarised; guard++) {
      const before = flow.beats.map((b) => b.phase).join();
      flow.tap();
      const after = flow.beats.map((b) => b.phase).join();
      if (after !== before) steps.push(after);
      play(flow, 1 / 30, clock);
    }
    expect(steps.length).toBeGreaterThan(2);
    play(flow, 12, clock);
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
    for (const at of [0, 0.2, 0.9, 1.45, 1.9, 2.6, 3.4, 5.5]) {
      const { flow, log, clock } = make(stacks({ common: 2, rare: 1, epic: 1, legendary: 1 }), { climb: CLIMBS.legendary[1] as ClimbPattern });
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
  it('has no fall, no beats and no stall: the neutral chest waits, each promotion is a still change of colour, then it opens and every card shows face up in order', () => {
    for (const { best, pattern } of PATTERNS) {
      const { flow, log, clock } = make(stacks({ common: 2, [best]: 1 }), { still: true, climb: pattern });
      play(flow, 14, clock);
      const order = types(log);
      for (const never of ['land', 'burst', 'stall', 'tick']) expect(order).not.toContain(never);
      // The silhouette of a good best card is held still for its moment and peels away without a turn.
      expect(order.includes('shade')).toBe(rarityRank(best) >= 2);
      expect(order.includes('peel')).toBe(rarityRank(best) >= 2);
      // The neutral chest first, for half a second; then one still change of colour per promotion, in order, each one on view for as long.
      const promoted = promotions(log);
      const wanted = pattern.beats.map((to, i) => ({ from: pattern.beats[i - 1] ?? 0, to })).filter((p) => p.to > p.from);
      expect(promoted).toEqual(wanted);
      const at = times(log, 'promote');
      at.forEach((t, i) => expect(Math.abs(t - TIMES.still * (i + 1))).toBeLessThan(1 / 30));
      expect(order.indexOf('hold')).toBeGreaterThan(order.lastIndexOf('promote'));
      expect(order.indexOf('creak')).toBe(order.indexOf('hold') + 1);
      expect(times(log, 'pop')[0]).toBeCloseTo(TIMES.still * (promoted.length + 1) + TIMES.creak, 1);
      expect(order[order.length - 1]).toBe('summary');
      // The card is on stage for the show (and the silhouette) and nothing else: its rise, flip and flight take no time.
      for (const b of flow.beats) expect(b.dur).toBeGreaterThanOrEqual(0);
      const shows = times(log, 'show');
      const flies = times(log, 'fly');
      expect(shows).toHaveLength(flow.beats.length);
      for (let i = 0; i < shows.length; i++) expect((flies[i] as number) - (shows[i] as number)).toBeGreaterThan(0.3);
      expect(times(log, 'place')).toEqual(flies);
      expect(flow.chest.rank).toBe(rarityRank(best));
    }
  });

  it('shows the silhouette of the best card still for a moment, and a tap moves it on', () => {
    const { flow, log, clock } = make([stack('k', 'legendary')], { still: true, climb: CLIMBS.legendary[0] as ClimbPattern });
    play(flow, 14, clock);
    const held = (times(log, 'peel')[0] as number) - (times(log, 'shade')[0] as number);
    expect(held).toBeGreaterThan(0.3);
    expect(held).toBeLessThan(0.5);
  });

  it('shows every silhouette of the best rank still for a moment, one after another, with no turn', () => {
    const { flow, log, clock } = make(stacks({ common: 1, legendary: 3 }), { still: true, climb: CLIMBS.legendary[0] as ClimbPattern });
    play(flow, 20, clock);
    const shade = log.filter((l) => l.e.type === 'shade');
    expect(shade).toHaveLength(3);
    for (const l of shade) {
      const beat = (l.e as { beat: number }).beat;
      const peel = log.find((p) => p.e.type === 'peel' && (p.e as { beat: number }).beat === beat) as Logged;
      expect(peel.at - l.at).toBeGreaterThan(0.3);
      expect(peel.at - l.at).toBeLessThan(0.5);
    }
    for (const b of flow.beats) expect(b.phase).toBe('placed');
    expect(types(log).filter((x) => x === 'summary')).toHaveLength(1);
  });

  it('counts a tap as the next colour of the climb, and as the opening in the held breath', () => {
    const { flow, log, clock } = make([stack('k', 'legendary')], { still: true, climb: CLIMBS.legendary[0] as ClimbPattern });
    play(flow, 0.1, clock);
    expect(flow.chest.phase).toBe('idle');
    expect(flow.chest.rank).toBe(0);
    for (const rank of [1, 2, 3]) {
      expect(flow.tap()).toBe(true);
      expect(flow.chest.rank).toBe(rank);
    }
    play(flow, TIMES.still + 0.05, clock);
    expect(flow.chest.phase).toBe('hold');
    expect(flow.tap()).toBe(true);
    expect(types(log)).toContain('pop');
  });
});

describe('the chest pose', () => {
  /** A flow of one stack of `best` played with `pattern` up to the first frame that `until` accepts. */
  function until(best: ChestRarity, pattern: ClimbPattern, ok: (f: RevealFlow) => boolean, dt = 1 / 120): RevealFlow {
    const { flow } = climbed(best, pattern);
    for (let i = 0; i < 4000 && !ok(flow); i++) flow.update(dt);
    return flow;
  }

  it('drops from above, lands with a squash and springs back', () => {
    const { flow } = make([stack('k', 'epic')]);
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
    flow.update(0.04);
    flow.update(0.4);
    windupPose(pose, flow.chest, 900);
    expect(Math.abs(pose.sx - 1)).toBeLessThan(0.1);
  });

  it('shakes harder and hops higher on a promotion beat than on a quiet one, with a taller hop for a leap', () => {
    const peak = (best: ChestRarity, pattern: ClimbPattern, beat: number): { x: number; hop: number } => {
      const flow = until(best, pattern, (f) => f.chest.burst === beat && f.chest.phase === 'burst');
      const pose = newPose();
      let x = 0;
      let hop = 0;
      for (let i = 0; i < 400 && flow.chest.burst === beat && flow.chest.phase === 'burst'; i++) {
        windupPose(pose, flow.chest, 900);
        x = Math.max(x, Math.abs(pose.x));
        hop = Math.min(hop, pose.y);
        flow.update(1 / 240);
      }
      return { x, hop };
    };
    const steady = CLIMBS.legendary[0] as ClimbPattern;
    const quiet = peak('legendary', steady, 0);
    const first = peak('legendary', steady, 1);
    const top = peak('legendary', steady, 3);
    expect(first.hop).toBeLessThan(quiet.hop - 6);
    expect(first.x).toBeGreaterThan(quiet.x);
    expect(top.x).toBeGreaterThan(first.x);
    const leap = peak('legendary', CLIMBS.legendary[2] as ClimbPattern, 1);
    expect(leap.hop).toBeLessThan(first.hop - 4);
  });

  it('flicks the lid for a few frames and lets light out on every beat, more on a promotion', () => {
    const { flow: f2, clock } = climbed('legendary', CLIMBS.legendary[0] as ClimbPattern);
    const pose = newPose();
    const glow = new Map<number, number>();
    let ajar = 0;
    for (let i = 0; i < 700 && f2.chest.phase !== 'open'; i++) {
      clock.t += 1 / 120;
      f2.update(1 / 120);
      windupPose(pose, f2.chest, 900);
      if (f2.chest.phase === 'burst') {
        glow.set(f2.chest.burst, Math.max(glow.get(f2.chest.burst) ?? 0, pose.glow));
        if (pose.ajar) ajar++;
      }
    }
    expect(ajar).toBeGreaterThan(8);
    expect(ajar).toBeLessThan(120);
    expect(glow.get(1)).toBeGreaterThan(glow.get(0) as number);
    expect(glow.get(0)).toBeGreaterThan(0.2);
  });

  it('stands dead still for the last of the held breath, and the late promotion\'s stall is the same breath', () => {
    for (const phase of ['hold', 'stall'] as const) {
      const flow = until('legendary', CLIMBS.legendary[1] as ClimbPattern, (f) => f.chest.phase === phase, 1 / 240);
      expect(flow.chest.phase).toBe(phase);
      const pose = newPose();
      flow.update(flow.chest.holdDur * 0.8);
      expect(flow.chest.phase).toBe(phase);
      windupPose(pose, flow.chest, 900);
      const a = { ...pose };
      flow.update(0.03);
      windupPose(pose, flow.chest, 900);
      expect(pose.x).toBe(a.x);
      expect(pose.y).toBeCloseTo(a.y, 5);
      expect(pose.sx).toBeCloseTo(a.sx, 3);
      expect(pose.sx).toBeGreaterThan(1.08);
    }
  });

  it('lifts the chest off the floor and trembles it once the top rank is reached, and a lower rank never does', () => {
    const pose = newPose();
    const top = until('legendary', CLIMBS.legendary[0] as ClimbPattern, (f) => f.chest.phase === 'hold');
    top.update(0.3);
    windupPose(pose, top.chest, 900);
    expect(pose.y).toBeLessThan(-50);
    let sway = 0;
    for (let i = 0; i < 40; i++) {
      top.update(1 / 240);
      windupPose(pose, top.chest, 900);
      sway = Math.max(sway, Math.abs(pose.x));
    }
    expect(sway).toBeGreaterThan(1);
    const epic = until('epic', CLIMBS.epic[0] as ClimbPattern, (f) => f.chest.phase === 'hold');
    epic.update(0.3);
    windupPose(pose, epic.chest, 900);
    expect(pose.y).toBeGreaterThan(-5);
    expect(crownLift(-1)).toBe(0);
    expect(crownLift(0)).toBe(0);
    expect(crownLift(10)).toBe(1);
  });

  it('squashes the chest on the frame of a tap or a promotion, harder than the idle breathing', () => {
    const { flow } = make([stack('k', 'rare')], { climb: CLIMBS.rare[0] as ClimbPattern });
    const pose = newPose();
    flow.update(TIMES.drop + 0.4);
    windupPose(pose, flow.chest, 900);
    const calm = pose.sy;
    flow.tap();
    windupPose(pose, flow.chest, 900);
    expect(pose.sy).toBeLessThan(calm - 0.08);
    const promoted = until('rare', CLIMBS.rare[0] as ClimbPattern, (f) => f.chest.rank === 1);
    windupPose(pose, promoted.chest, 900);
    expect(pose.sy).toBeLessThan(0.9);
  });

  it('pops with a jump, a squash on landing and a recoil, and ends at rest; a lifted chest comes down during the jump', () => {
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
    // Starts where the lifted chest was and comes down.
    popPose(pose, 0, 1);
    expect(pose.y).toBeLessThan(-50);
    popPose(pose, 0.24, 1);
    expect(pose.y).toBeCloseTo(0, 3);
  });

  it('does not allocate: the same pose object is filled and returned', () => {
    const pose = newPose();
    const { flow } = make([stack('k', 'rare')]);
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

  it('gathers the silhouette on stage: a slow swell and a shiver that grows, ending where it started', () => {
    shadePose(p, 0, 1, 360, 340, 2);
    expect(p.x).toBeCloseTo(360, 5);
    expect(p.s).toBeCloseTo(2, 1);
    shadePose(p, 0.9, 1, 360, 340, 2);
    expect(p.s).toBeGreaterThan(2.1);
    expect(p.flipX).toBe(1);
    let shiver = 0;
    for (let t = 0.8; t < 0.9; t += 0.002) {
      shadePose(p, t, 1, 360, 340, 2);
      shiver = Math.max(shiver, Math.abs(p.rot));
    }
    expect(shiver).toBeGreaterThan(0.01);
    expect(shiver).toBeLessThan(0.05);
    expect(p.y).toBe(340);
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
