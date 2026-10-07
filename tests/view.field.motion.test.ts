import { describe, expect, it } from 'vitest';
import { breathe, coilPose, deathScale, hopArc, makePose, releasePose, stepRate, walkBob, walkTilt } from '@/view/field/motion';
import { WEAPON_IDS, releaseSeconds, weaponStyle } from '@/view/weapons';
import { MERGE_SECONDS, REVEAL_DELAY, REVEAL_MS, REVEAL_OVERSHOOT, SLIDE_SECONDS } from '@/view/timing';
import { Color, TapeColors } from '@/ui/theme';
import { DEFAULT_RUG, RUG_SKINS, cellPaper, rugSkin, type RugPattern } from '@/view/field/rugSkins';

describe('weapon poses', () => {
  for (const id of WEAPON_IDS) {
    const spec = weaponStyle(id).pose;

    it(`${id}: continues out of its coil, reaches contact when the strike ends and ends at rest`, () => {
      const start = releasePose(spec, 0, 1, makePose());
      const coiled = coilPose(spec, 1, makePose());
      expect(start).toEqual(coiled);
      const hit = releasePose(spec, spec.strike, 1, makePose());
      expect(hit.lunge).toBeCloseTo(spec.hit.lunge, 5);
      expect(hit.rot).toBeCloseTo(spec.hit.rot, 5);
      expect(hit.sy).toBeCloseTo(spec.hit.sy, 5);
      expect(hit.rise).toBeCloseTo(spec.hit.rise, 5);
      const end = releasePose(spec, releaseSeconds(spec) + 1e-3, 1, makePose());
      expect(end).toEqual({ lunge: 0, sx: 1, sy: 1, rot: 0, rise: 0 });
    });

    it(`${id}: is continuous across the strike boundary`, () => {
      const a = releasePose(spec, spec.strike - 1e-6, 1, makePose());
      const b = releasePose(spec, spec.strike + 1e-6, 1, makePose());
      expect(Math.abs(a.lunge - b.lunge)).toBeLessThan(0.01);
      expect(Math.abs(a.sy - b.sy)).toBeLessThan(0.01);
      expect(Math.abs(a.rot - b.rot)).toBeLessThan(0.01);
    });

    it(`${id}: reaches contact on the release, not after it`, () => {
      // The sound is on the release frame: the contact pose may follow it by a few frames at most.
      expect(spec.strike).toBeLessThanOrEqual(0.09);
      expect(releaseSeconds(spec)).toBeLessThan(0.5);
      expect(spec.lead).toBeLessThanOrEqual(0.2);
    });

    it(`${id}: a cat coiled to any degree starts its release from that pose without a jump`, () => {
      for (const coil of [0, 0.3, 0.6, 1]) {
        const c = coilPose(spec, coil, makePose());
        const r = releasePose(spec, 0, coil, makePose());
        expect(r.lunge).toBeCloseTo(c.lunge, 6);
        expect(r.sy).toBeCloseTo(c.sy, 6);
      }
    });
  }

  it('gives each weapon its own body language', () => {
    const reach = (id: (typeof WEAPON_IDS)[number]): number => weaponStyle(id).pose.hit.lunge;
    // A punch jabs further than a sword swings, a katana darts furthest, the cork gun kicks the cat backwards.
    expect(reach('w_paw')).toBeGreaterThan(reach('w_sword'));
    expect(reach('w_samurai')).toBeGreaterThan(reach('w_paw'));
    expect(reach('r_gunner')).toBeLessThan(0);
    // The sword turns through an arc, the axe rises before it slams and lands squashed, the bow shivers, the bell shakes.
    expect(weaponStyle('w_sword').pose.hit.rot - weaponStyle('w_sword').pose.coil.rot).toBeGreaterThan(0.6);
    expect(weaponStyle('w_viking').pose.coil.rise).toBeGreaterThan(4);
    expect(weaponStyle('w_viking').pose.hit.sy).toBeLessThan(0.9);
    expect(weaponStyle('r_archer').pose.twang).toBeGreaterThan(0.05);
    expect(weaponStyle('t_bell').pose.twang).toBeGreaterThan(0.1);
    // Thrown things hop with the throw.
    expect(weaponStyle('m_snow').pose.hit.rise).toBeGreaterThan(3);
    expect(weaponStyle('t_lucky').pose.hit.rise).toBeGreaterThan(8);
  });

  it('is not one pose with different numbers: the twenty cats do not share a wind-up', () => {
    const windups = new Set(WEAPON_IDS.map((id) => JSON.stringify(weaponStyle(id).pose.coil)));
    expect(windups.size).toBeGreaterThanOrEqual(15);
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
