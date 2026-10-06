import { describe, expect, it } from 'vitest';
import { CLASS_IDS, ENEMY_IDS, UNIT_IDS } from '@/game/api';
import { ABILITY_CAPTION, CLASS_COLOR, DOT_NUMBER_COLOR, ENEMY_TINT, SHIELD_COLOR, SHOOT_CUE, STATUS_COLOR, UNIT_COLOR, themeOf } from '@/view/director/palette';
import { CLASS_HUE, CONFETTI, Hue } from '@/fx/palette';
import { Color } from '@/ui/theme';

/** Hue in degrees and saturation of an 0xRRGGBB colour. */
function hsv(c: number): { h: number; s: number } {
  const r = ((c >> 16) & 255) / 255;
  const g = ((c >> 8) & 255) / 255;
  const b = (c & 255) / 255;
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  if (d === 0) return { h: 0, s: 0 };
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: (h * 60 + 360) % 360, s: d / max };
}

const isPurple = (c: number): boolean => {
  const { h, s } = hsv(c);
  return s > 0.2 && h >= 255 && h <= 320;
};


describe('director palette', () => {
  it('covers every enemy, cat and class', () => {
    for (const id of ENEMY_IDS) expect(ENEMY_TINT[id]).toBeTypeOf('number');
    for (const id of UNIT_IDS) {
      expect(UNIT_COLOR[id]).toBeTypeOf('number');
      expect(SHOOT_CUE[id].volume).toBeGreaterThan(0);
      expect(SHOOT_CUE[id].volume).toBeLessThanOrEqual(1);
    }
    for (const id of CLASS_IDS) expect(CLASS_COLOR[id]).toBeTypeOf('number');
    expect(Object.keys(STATUS_COLOR)).toHaveLength(8);
    expect(Object.keys(ABILITY_CAPTION)).toHaveLength(6);
  });

  it('only the three zone and chain casters skip the projectile muzzle', () => {
    const casts = UNIT_IDS.filter((id) => SHOOT_CUE[id].style === 'cast');
    expect(casts.sort()).toEqual(['m_cosmo', 'm_frost', 'm_storm', 't_alch']);
    const swings = UNIT_IDS.filter((id) => SHOOT_CUE[id].style === 'swing');
    expect(swings.every((id) => id.startsWith('w_'))).toBe(true);
  });

  it('maps cosmetic ids to themes and falls back to the default', () => {
    expect(themeOf('fx_default').index).toBe(0);
    expect(themeOf('fx_default').count).toBe(0);
    expect(themeOf('fx_gem1').index).toBe(1);
    expect(themeOf('fx_gem2').index).toBe(2);
    expect(themeOf('fx_gem3').index).toBe(3);
    expect(themeOf('fx_gem9').index).toBe(0);
    expect(themeOf('').index).toBe(0);
    for (const i of [1, 2, 3]) expect(themeOf(`fx_gem${i}`).count).toBeGreaterThan(0);
  });

  it('has nothing purple anywhere in the staging: every effect colour is a paper token or a mix of two', () => {
    const all = [
      ...Object.values(ENEMY_TINT),
      ...Object.values(UNIT_COLOR),
      ...Object.values(CLASS_COLOR),
      ...Object.values(STATUS_COLOR),
      ...Object.values(DOT_NUMBER_COLOR),
      SHIELD_COLOR,
      ...[0, 1, 2, 3].flatMap((i) => themeOf(`fx_gem${i}`).colors),
      ...Object.values(Hue),
      ...CONFETTI,
    ];
    expect(all.length).toBeGreaterThan(80);
    for (const c of all) expect(isPurple(c)).toBe(false);
  });

  it('shares the four class papers with the field, all different from each other', () => {
    expect(CLASS_COLOR).toBe(CLASS_HUE);
    expect(new Set(CLASS_IDS.map((id) => CLASS_HUE[id])).size).toBe(4);
  });

  it('never uses a pure white or black in the shared hues: the lightest tone is the cream of the paper', () => {
    for (const c of Object.values(Hue)) {
      expect(c).not.toBe(0xffffff);
      expect(c).not.toBe(0x000000);
    }
    expect(Hue.cream).toBe(Color.paperLight);
  });
});
