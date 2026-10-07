import { describe, expect, it } from 'vitest';
import { ATTACK_SECONDS, attackPose, breathe, coilPose, deathScale, hopArc, makePose, stepRate, walkBob, walkTilt, windStart } from '@/view/field/motion';
import { MERGE_SECONDS, REVEAL_DELAY, REVEAL_MS, REVEAL_OVERSHOOT, SLIDE_SECONDS } from '@/view/timing';
import { Color, TapeColors } from '@/ui/theme';
import { DEFAULT_RUG, RUG_SKINS, cellPaper, rugSkin, type RugPattern } from '@/view/field/rugSkins';

describe('attack pose', () => {
  it('starts and ends at rest', () => {
    const p = makePose();
    for (const k of [0, 1]) {
      attackPose(k, p);
      expect(p).toEqual({ lunge: 0, sx: 1, sy: 1 });
    }
    expect(ATTACK_SECONDS).toBeGreaterThan(0.2);
  });

  it('pulls back first, then lunges the full distance, then recoils to rest', () => {
    const p = makePose();
    attackPose(0.2, p);
    expect(p.lunge).toBeLessThan(0);
    expect(p.sy).toBeLessThan(1);
    attackPose(0.46, p);
    expect(p.lunge).toBeCloseTo(1, 1);
    expect(p.sy).toBeGreaterThan(1);
    attackPose(0.99, p);
    expect(Math.abs(p.lunge)).toBeLessThan(0.05);
    expect(p.sx).toBeCloseTo(1, 1);
  });

  it('is continuous across phase boundaries', () => {
    const a = makePose();
    const b = makePose();
    for (const k of [0.26, 0.46]) {
      attackPose(k - 1e-6, a);
      attackPose(k + 1e-6, b);
      expect(Math.abs(a.lunge - b.lunge)).toBeLessThan(0.01);
      expect(Math.abs(a.sy - b.sy)).toBeLessThan(0.01);
    }
  });
});

describe('idle and walk cycles', () => {
  it('breathes with preserved volume and a per-unit phase', () => {
    const a = makePose();
    const b = makePose();
    breathe(0.3, 0, 1, a);
    breathe(0.3, 2, 1, b);
    expect(a.sy).not.toBe(b.sy);
    for (let t = 0; t < 3; t += 0.1) {
      breathe(t, 0, 1, a);
      expect(Math.abs(a.sy - 1)).toBeLessThan(0.04);
      expect(Math.abs(a.sx - 1)).toBeLessThan(0.04);
    }
  });

  it('hops and waddles in step', () => {
    const rate = stepRate(70);
    expect(rate).toBeGreaterThan(2);
    expect(stepRate(10)).toBeGreaterThanOrEqual(1.1);
    for (let t = 0; t < 2; t += 0.05) {
      expect(walkBob(t, rate, 4)).toBeGreaterThanOrEqual(0);
      expect(walkBob(t, rate, 4)).toBeLessThanOrEqual(4);
      expect(Math.abs(walkTilt(t, rate, 0.1))).toBeLessThanOrEqual(0.1);
    }
  });

  it('swells then collapses when dying', () => {
    expect(deathScale(0)).toBe(1);
    expect(deathScale(0.4)).toBeGreaterThan(1.1);
    expect(deathScale(1)).toBeCloseTo(0, 5);
  });

  it('arcs a hop up and back', () => {
    expect(hopArc(0, 20)).toBeCloseTo(0, 5);
    expect(hopArc(0.5, 20)).toBeCloseTo(-20, 5);
    expect(hopArc(1, 20)).toBeCloseTo(0, 5);
  });
});

describe('rug skins', () => {
  it('has at least eight distinct patterns across the skins', () => {
    const patterns = new Set<RugPattern>(RUG_SKINS.map((s) => s.pattern));
    expect(patterns.size).toBeGreaterThanOrEqual(8);
    expect(new Set(RUG_SKINS.map((s) => s.id)).size).toBe(RUG_SKINS.length);
  });

  it('covers every meta cosmetic id and falls back for unknown ones', () => {
    const ids = [
      'rug_default', 'rug_ch1', 'rug_ch2', 'rug_ch3', 'rug_ch4', 'rug_ch5',
      'rug_gem1', 'rug_gem2', 'rug_gem3', 'rug_baby', 'rug_butler', 'rug_calendar', 'rug_season',
    ];
    for (const id of ids) expect(rugSkin(id).id).toBe(id);
    expect(rugSkin('rug_from_the_future').id).toBe(DEFAULT_RUG);
  });

  it('keeps every sheet light enough that a cat sticker cream border stays an edge', () => {
    const lum = (c: number): number => 0.3 * ((c >> 16) & 255) + 0.59 * ((c >> 8) & 255) + 0.11 * (c & 255);
    for (const s of RUG_SKINS) {
      // The darkest sheet is plain kraft paper; nothing may be darker than it.
      expect(lum(s.paper)).toBeGreaterThanOrEqual(lum(Color.kraft) - 1);
      // The cells are a shade darker than their sheet, never a different colour family.
      expect(lum(cellPaper(s))).toBeLessThan(lum(s.paper));
      expect(lum(s.paper) - lum(cellPaper(s))).toBeLessThan(40);
      // The pattern ink differs from the paper, so it can be seen at all.
      expect(s.mark).not.toBe(s.paper);
      expect(Object.keys(TapeColors)).toContain(s.tape);
    }
  });

  it('keeps the default mat the cream sheet of the approved mock', () => {
    const d = rugSkin(DEFAULT_RUG);
    expect(d.paper).toBe(Color.paper);
    expect(d.pattern).toBe('plain');
    expect(d.dash).toBe(Color.teal);
  });
});

describe('attack anticipation', () => {
  it('a cat coiled to any degree continues into the attack without a jump', () => {
    for (const coil of [0, 0.3, 0.6, 1]) {
      const a = coilPose(coil, makePose());
      const b = attackPose(Math.max(1e-6, windStart(coil)), makePose());
      expect(b.sx).toBeCloseTo(a.sx, 3);
      expect(b.sy).toBeCloseTo(a.sy, 3);
      expect(b.lunge).toBeCloseTo(a.lunge, 3);
    }
  });

  it('a fully coiled cat starts at the strike and the start never passes it', () => {
    expect(windStart(0)).toBe(0);
    expect(windStart(1)).toBeLessThan(0.26 + 1e-9);
    expect(windStart(0.4)).toBeLessThan(windStart(0.8));
  });
});

describe('sticker timing', () => {
  it('each rank reveals later, springs further and settles slower than the one below', () => {
    for (let i = 1; i < REVEAL_DELAY.length; i++) {
      expect(REVEAL_DELAY[i]).toBeGreaterThan(REVEAL_DELAY[i - 1] as number);
      expect(REVEAL_OVERSHOOT[i]).toBeGreaterThan(REVEAL_OVERSHOOT[i - 1] as number);
      expect(REVEAL_MS[i]).toBeGreaterThan(REVEAL_MS[i - 1] as number);
    }
  });

  it('a hop and a merge are short enough never to hold the board up', () => {
    expect(SLIDE_SECONDS).toBeLessThan(0.25);
    expect(MERGE_SECONDS).toBeLessThan(0.25);
  });
});
