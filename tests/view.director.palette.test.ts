import { describe, expect, it } from 'vitest';
import { CLASS_IDS, ENEMY_IDS, UNIT_IDS } from '@/game/api';
import { ABILITY_CAPTION, CLASS_COLOR, ENEMY_TINT, SHOOT_CUE, STATUS_COLOR, UNIT_COLOR, themeOf } from '@/view/director/palette';

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
});
