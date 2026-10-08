import { describe, expect, it } from 'vitest';
import { AuraPlan, CARRIER_CAP, MAX_RINGS, NO_RING, RING, RING_AND_REACH } from '@/view/field/auraPlan';

const HASTE = 0;
const HEAL = 1;
/** A clock's ring (a body 58 px across and the thin line round it) and its aura's real radius. */
const D = 57;
const REACH = 120;

function plan(carriers: Array<{ kind?: number; x: number; y?: number; worn?: boolean }>): AuraPlan {
  const p = new AuraPlan();
  for (const c of carriers) p.add(c.kind ?? HASTE, c.x, c.y ?? 0, D, REACH, c.worn ?? false);
  p.decide();
  return p;
}

const shows = (p: AuraPlan): number[] => Array.from(p.show.slice(0, p.count));

describe('which carriers of an aura wear a ring', () => {
  it('a lone carrier wears one ring, and its reach is hinted once, when it appears', () => {
    expect(shows(plan([{ x: 300 }]))).toEqual([RING_AND_REACH]);
    expect(shows(plan([{ x: 300, worn: true }]))).toEqual([RING]);
  });

  it('carriers standing apart each wear their own ring', () => {
    expect(shows(plan([{ x: 0 }, { x: 80 }, { x: 160 }]))).toEqual([RING_AND_REACH, RING, RING]);
  });

  it('the reach is hinted once where a ring of its kind already shows it: a second clock inside the first one\'s reach gets no hint', () => {
    // 80 px apart: far enough for two rings, inside each other\'s reach.
    expect(shows(plan([{ x: 0 }, { x: 80 }]))).toEqual([RING_AND_REACH, RING]);
    // 300 px apart: out of each other's reach, so each is hinted.
    expect(shows(plan([{ x: 0 }, { x: 300 }]))).toEqual([RING_AND_REACH, RING_AND_REACH]);
  });

  it('rings of one kind that would overlap are one: the first keeps its ring, the one on top of it wears none', () => {
    expect(shows(plan([{ x: 0 }, { x: 30 }]))).toEqual([RING_AND_REACH, NO_RING]);
    // Three in a heap: only the first.
    expect(shows(plan([{ x: 0 }, { x: 20 }, { x: 35 }]))).toEqual([RING_AND_REACH, NO_RING, NO_RING]);
  });

  it('a clock and a pill never merge: they are different things to be told apart', () => {
    expect(shows(plan([{ x: 0, kind: HASTE }, { x: 10, kind: HEAL }]))).toEqual([RING_AND_REACH, RING_AND_REACH]);
  });

  it('a ring that is worn is not given up the moment another stands near: a band of room keeps it from flickering', () => {
    // 35 px apart: a new ring would not be given (under 70 % of 57), a worn one is kept (over 50 %).
    expect(shows(plan([{ x: 0, worn: true }, { x: 35, worn: false }]))).toEqual([RING, NO_RING]);
    expect(shows(plan([{ x: 0, worn: true }, { x: 35, worn: true }]))).toEqual([RING, RING]);
    // Closer than half and both worn: the later one gives way.
    expect(shows(plan([{ x: 0, worn: true }, { x: 25, worn: true }]))).toEqual([RING, NO_RING]);
  });

  it('draws at most a handful of rings, the first ones, however many carriers there are', () => {
    const many = Array.from({ length: 24 }, (_, i) => ({ x: i * 80 }));
    const p = plan(many);
    expect(shows(p).filter((s) => s !== NO_RING).length).toBe(MAX_RINGS);
    expect(shows(p).slice(0, MAX_RINGS).every((s) => s !== NO_RING)).toBe(true);
  });

  it('eight carriers on a crowded lane make at most eight thin rings and fewer where they heap up', () => {
    // Four clocks and four pills along a lane, the pairs touching.
    const lane = [0, 26, 70, 96, 150, 176, 220, 246].map((x, i) => ({ x, kind: i < 4 ? HASTE : HEAL }));
    const p = plan(lane);
    const rings = shows(p).filter((s) => s !== NO_RING).length;
    expect(rings).toBeGreaterThan(0);
    expect(rings).toBeLessThanOrEqual(8);
    // No two rings of one kind overlap.
    for (let i = 0; i < p.count; i++) {
      for (let j = 0; j < i; j++) {
        if (p.show[i] === NO_RING || p.show[j] === NO_RING || p.kind[i] !== p.kind[j]) continue;
        expect(Math.hypot(p.x[i] - p.x[j], p.y[i] - p.y[j])).toBeGreaterThanOrEqual(D * 0.5);
      }
    }
  });

  it('lists no more carriers than it has room for, and starts again from nothing', () => {
    const p = new AuraPlan();
    for (let i = 0; i < CARRIER_CAP + 5; i++) p.add(HASTE, i * 100, 0, D, REACH, false);
    expect(p.count).toBe(CARRIER_CAP);
    expect(p.add(HASTE, 0, 0, D, REACH, false)).toBe(-1);
    p.reset();
    expect(p.count).toBe(0);
  });
});
