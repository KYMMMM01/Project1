import { describe, expect, it } from 'vitest';
import { SP_CAPSULE_KINDS, type SpCapsuleKind, type SpCapsuleResult } from '@/game';
import {
  BEATS, FALL_FROM, LINE_HAS_B, LINE_IDS, MATCH_SLACK, ROLL_DIST, SMALL_SCALE, baseAlpha, basePose, chorusSize, fallPose, heartsFor, landings, lidAlpha,
  lidPose, lineFor, lineShown, newPose, pairOpening, rollPose, springValue, waitRock, type Pending,
} from '@/view/director/sp/capsuleMath';

/** The pose of a falling capsule at a share of its fall, as plain numbers. */
const at = (kind: SpCapsuleKind, k: number) => ({ ...fallPose(BEATS[kind], k, newPose()) });

describe('how a capsule falls (capsuleMath)', () => {
  it('has a beat for every kind of capsule, and the three pink ones are told apart by their beat as well as their mark', () => {
    for (const k of SP_CAPSULE_KINDS) expect(BEATS[k]).toBeDefined();
    const sig = (k: SpCapsuleKind) => JSON.stringify([BEATS[k].land, BEATS[k].hop1, BEATS[k].hop2, BEATS[k].rock, BEATS[k].rattle]);
    // fish, purr and One More! all wear pink: their rhythm differs (light and quick, plain, heavy and rattling).
    expect(new Set([sig('fish'), sig('purr'), sig('more')]).size).toBe(3);
    expect(BEATS.more.rattle).toBeGreaterThan(0);
    expect(BEATS.purr.hop1[1]).toBeGreaterThan(BEATS.fish.hop1[1]);
    expect(BEATS.more.hop1[1]).toBeLessThan(BEATS.fish.hop1[1]);
    expect(BEATS.toy.hop1[1]).toBeGreaterThan(BEATS.fish.hop1[1]);
    expect(BEATS.guardian.land).toBeGreaterThan(BEATS.fish.land);
  });

  it('starts high above its resting place, falls, and touches the head exactly when the beat says', () => {
    for (const kind of SP_CAPSULE_KINDS) {
      const beat = BEATS[kind];
      expect(at(kind, 0).dy).toBeCloseTo(-FALL_FROM, 5);
      expect(at(kind, beat.land - 1e-6).dy).toBeGreaterThan(-1);
      expect(at(kind, beat.land - 1e-6).dy).toBeLessThanOrEqual(0);
      // The fall speeds up: the second half covers more than the first.
      const half = beat.land / 2;
      expect(at(kind, half).dy - at(kind, 0).dy).toBeLessThan(at(kind, beat.land).dy - at(kind, half).dy + FALL_FROM);
      expect(-at(kind, half).dy).toBeGreaterThan(FALL_FROM * 0.6);
    }
  });

  it('never goes below its resting place, bounces twice to the heights of the beat, and rests rocking', () => {
    for (const kind of SP_CAPSULE_KINDS) {
      const beat = BEATS[kind];
      let low = 0;
      let high1 = 0;
      let high2 = 0;
      for (let i = 0; i <= 2000; i++) {
        const k = i / 1000;
        const p = at(kind, k);
        low = Math.max(low, p.dy);
        if (k >= beat.land && k < beat.land + beat.hop1[0]) high1 = Math.max(high1, -p.dy);
        if (k >= beat.land + beat.hop1[0] && k < beat.land + beat.hop1[0] + beat.hop2[0]) high2 = Math.max(high2, -p.dy);
        expect(Number.isFinite(p.dx + p.dy + p.sx + p.sy + p.rot)).toBe(true);
      }
      expect(low).toBeLessThanOrEqual(1e-9);
      expect(high1).toBeCloseTo(beat.hop1[1], 0);
      expect(high2).toBeCloseTo(beat.hop2[1], 0);
      expect(high1).toBeGreaterThan(high2);
      // At rest it rocks, but never more than its beat says.
      let rock = 0;
      for (let i = 0; i <= 100; i++) rock = Math.max(rock, Math.abs(at(kind, beat.land + beat.hop1[0] + beat.hop2[0] + ((1 - beat.land - beat.hop1[0] - beat.hop2[0]) * i) / 100).rot));
      expect(rock).toBeGreaterThan(0);
      expect(rock).toBeLessThanOrEqual(beat.rock + 1e-9);
    }
  });

  it('squashes on the landing, most on the first, and stretches a little on the way down', () => {
    const b = BEATS.fish;
    const down = at('fish', b.land * 0.9);
    expect(down.sy).toBeGreaterThan(1);
    expect(down.sx).toBeLessThan(1);
    const land = at('fish', b.land + 0.025);
    expect(land.sy).toBeLessThan(1);
    expect(land.sx).toBeGreaterThan(1);
    const second = at('fish', b.land + b.hop1[0] + 0.025);
    expect(second.sy).toBeLessThan(1);
    expect(1 - second.sy).toBeLessThan(1 - land.sy);
  });

  it('a heavy capsule (One More!) shakes sideways while it rests, and the others do not', () => {
    const rest = (kind: SpCapsuleKind) => {
      const b = BEATS[kind];
      let dx = 0;
      for (let i = 0; i < 200; i++) dx = Math.max(dx, Math.abs(at(kind, b.land + b.hop1[0] + b.hop2[0] + 0.1 + i * 0.0003).dx));
      return dx;
    };
    expect(rest('more')).toBeGreaterThan(0.2);
    expect(rest('fish')).toBe(0);
    expect(rest('toy')).toBe(0);
  });

  it('lists the moments of the two landings (for the thuds)', () => {
    const b = BEATS.toy;
    const [a, c] = landings(b);
    expect(a).toBe(b.land);
    expect(c).toBeCloseTo(b.land + b.hop1[0], 9);
  });

  it('every kind has landed and finished bouncing before the opening (a share of 1)', () => {
    for (const kind of SP_CAPSULE_KINDS) {
      const b = BEATS[kind];
      expect(b.land + b.hop1[0] + b.hop2[0]).toBeLessThan(0.95);
    }
  });
});

describe('the lid, the base and the small capsule', () => {
  it('the lid springs up and away to its side, turns, and is gone by the end', () => {
    const p = newPose();
    lidPose(0, 1, p);
    expect([p.dx, p.dy, p.rot]).toEqual([0, expect.closeTo(0, 5), 0]);
    lidPose(0.4, 1, p);
    expect(p.dx).toBeGreaterThan(0);
    expect(p.dy).toBeLessThan(0);
    expect(p.rot).toBeGreaterThan(0);
    lidPose(0.4, -1, p);
    expect(p.dx).toBeLessThan(0);
    expect(p.rot).toBeLessThan(0);
    expect(lidAlpha(0)).toBe(1);
    expect(lidAlpha(0.5)).toBe(1);
    expect(lidAlpha(1)).toBeCloseTo(0, 9);
    expect(lidAlpha(0.75)).toBeCloseTo(0.5, 9);
    // Clamped outside 0..1.
    lidPose(-1, 1, p);
    expect(p.dx).toBe(0);
    lidPose(2, 1, p);
    expect(Number.isFinite(p.dy)).toBe(true);
  });

  it('the base settles a little as the lid goes and fades after it', () => {
    const p = newPose();
    basePose(0, p);
    expect([p.dy, p.sx, p.sy]).toEqual([0, 1, 1]);
    basePose(0.17, p);
    expect(p.dy).toBeGreaterThan(0);
    expect(p.sx).toBeGreaterThan(1);
    expect(p.sy).toBeLessThan(1);
    basePose(1, p);
    expect(p.dy).toBeCloseTo(0, 6);
    expect(baseAlpha(0.5)).toBe(1);
    expect(baseAlpha(1)).toBeCloseTo(0, 9);
    expect(baseAlpha(0.6)).toBeGreaterThan(baseAlpha(0.9));
  });

  it('the small capsule rolls out to its side, turning, growing to its size, and waits wobbling', () => {
    const p = newPose();
    rollPose(0, 1, p);
    expect(p.dx).toBe(0);
    expect(p.sx).toBeLessThan(0.6);
    rollPose(1, 1, p);
    expect(p.dx).toBeCloseTo(ROLL_DIST, 6);
    expect(p.sx).toBe(1);
    expect(p.rot).toBeGreaterThan(Math.PI * 2);
    rollPose(1, -1, p);
    expect(p.dx).toBeCloseTo(-ROLL_DIST, 6);
    // Halfway it is in the air.
    rollPose(0.4, 1, p);
    expect(p.dy).toBeLessThan(0);
    expect(SMALL_SCALE).toBeLessThan(1);
    let wob = 0;
    for (let i = 0; i < 100; i++) wob = Math.max(wob, Math.abs(waitRock(i * 0.01, 0.6)));
    expect(wob).toBeGreaterThan(0.02);
    expect(wob).toBeLessThan(0.2);
    // It wobbles harder the nearer the opening.
    let early = 0;
    let late = 0;
    for (let i = 0; i < 100; i++) {
      early = Math.max(early, Math.abs(waitRock(0.01 * i * 0.1, 0.6)));
      late = Math.max(late, Math.abs(waitRock(0.5 + i * 0.001, 0.6)));
    }
    expect(late).toBeGreaterThan(early);
  });
});

describe('the ring that springs back to half', () => {
  it('goes from empty to its value with a small overshoot, settles on it, and never passes full', () => {
    expect(springValue(0, 0.5)).toBe(0);
    expect(springValue(1, 0.5)).toBe(0.5);
    expect(springValue(-1, 0.5)).toBe(0);
    expect(springValue(2, 0.5)).toBe(0.5);
    let peak = 0;
    for (let i = 1; i < 100; i++) peak = Math.max(peak, springValue(i / 100, 0.5));
    expect(peak).toBeGreaterThan(0.5);
    expect(peak).toBeLessThan(0.65);
    // It rises first.
    expect(springValue(0.2, 0.5)).toBeGreaterThan(0.2);
    // A value near full is clamped.
    for (let i = 0; i <= 100; i++) expect(springValue(i / 100, 0.95)).toBeLessThanOrEqual(1);
  });
});

describe('which opening belongs to which cast', () => {
  const p = (kind: SpCapsuleKind, at: number, over: Partial<Pending> = {}): Pending => ({ kind, inner: null, at, opens: at + 1.2, stage: 'air', ...over });

  it('is the oldest capsule of that kind whose time has come', () => {
    const a = p('fish', 10);
    const b = p('fish', 20);
    expect(pairOpening([b, a], 'fish', false, 11.2)).toBe(a);
    // The later one is not due yet at that time, so a dropped cast's opening cannot steal it.
    expect(pairOpening([b], 'fish', false, 11.2)).toBeNull();
    expect(pairOpening([b], 'fish', false, 21.2)).toBe(b);
    // A tick of slack for the clock.
    expect(pairOpening([a], 'fish', false, 11.2 - MATCH_SLACK + 1e-6)).toBe(a);
    expect(pairOpening([a], 'fish', false, 11.2 - 2 * MATCH_SLACK)).toBeNull();
  });

  it('never matches another kind, a capsule already opened, or (for a big one) a small one', () => {
    const a = p('purr', 10);
    expect(pairOpening([a], 'fish', false, 11.2)).toBeNull();
    expect(pairOpening([{ ...a, stage: 'done' }], 'purr', false, 11.2)).toBeNull();
    expect(pairOpening([{ ...a, stage: 'inside' }], 'purr', false, 11.2)).toBeNull();
  });

  it('the small capsule of a One More! belongs to the oldest One More! that is waiting with that kind inside', () => {
    const one = p('more', 10, { inner: 'partner', stage: 'inside' });
    const two = p('more', 14, { inner: 'partner', stage: 'inside' });
    const other = p('more', 12, { inner: 'toy', stage: 'inside' });
    expect(pairOpening([two, one, other], 'partner', true, 13)).toBe(one);
    expect(pairOpening([two, one, other], 'toy', true, 13)).toBe(other);
    expect(pairOpening([one], 'guardian', true, 13)).toBeNull();
    // A One More! still in the air has no small capsule to open.
    expect(pairOpening([p('more', 10, { inner: 'partner' })], 'partner', true, 13)).toBeNull();
  });
});

describe('what pops up and what is thrown', () => {
  it('has a line for every prize, and the fallbacks speak in the voice of what was promised', () => {
    const results: SpCapsuleResult[] = ['fish', 'purr', 'seat', 'promote', 'more', 'toy', 'awaken', 'fallback'];
    for (const r of results) for (const k of SP_CAPSULE_KINDS) expect(LINE_IDS).toContain(lineFor(r, k));
    expect(lineFor('fish', 'fish')).toBe('fish');
    expect(lineFor('seat', 'partner')).toBe('partner');
    expect(lineFor('promote', 'partner')).toBe('partnerFull');
    expect(lineFor('awaken', 'guardian')).toBe('guardian');
    expect(lineFor('fallback', 'partner')).toBe('partnerEmpty');
    expect(lineFor('fallback', 'toy')).toBe('toyEmpty');
    expect(lineFor('fallback', 'guardian')).toBe('guardianEmpty');
    // A fish capsule that fell back (the knob that is off) says the purr line.
    expect(lineFor('fallback', 'fish')).toBe('purr');
  });

  it('the toy line is left to the toy screen, which says it in its heading', () => {
    expect(lineShown('toy')).toBe(false);
    for (const id of LINE_IDS) if (id !== 'toy') expect(lineShown(id)).toBe(true);
    expect(LINE_HAS_B.toy).toBe(true);
  });

  it('throws as many hearts as the prize pays (the purr capsule one more), up to the tier cap, and none for a prize that pays no purr', () => {
    expect(heartsFor('fish', 0, 2)).toBe(0);
    expect(heartsFor('seat', 0, 2)).toBe(0);
    expect(heartsFor('purr', 2, 2)).toBe(3);
    expect(heartsFor('fallback', 3, 2)).toBe(3);
    expect(heartsFor('fallback', 5, 2)).toBe(5);
    expect(heartsFor('fallback', 10, 2)).toBe(10);
    expect(heartsFor('fallback', 10, 1)).toBe(8);
    expect(heartsFor('fallback', 10, 0)).toBe(4);
    // More purr, more hearts: the amount says the size of the prize.
    expect(heartsFor('fallback', 10, 2)).toBeGreaterThan(heartsFor('fallback', 5, 2));
  });

  it('lets every cat of the board purr at the top tier and the first few below it', () => {
    expect(chorusSize(25, 2)).toBe(25);
    expect(chorusSize(25, 1)).toBe(14);
    expect(chorusSize(25, 0)).toBe(6);
    expect(chorusSize(3, 0)).toBe(3);
    expect(chorusSize(0, 2)).toBe(0);
  });
});
