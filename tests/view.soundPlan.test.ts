import { describe, expect, it } from 'vitest';
import { SFX_IDS } from '@/audio';
import { ENEMY_IDS, UNIT_IDS } from '@/game';
import { LATER_SOUNDS, LATER_STINGERS, START_SOUNDS, enemySounds, unitSounds, waveSounds } from '@/view/soundPlan';

describe('the sounds a battle needs', () => {
  it('lists every sound once, in one lane only', () => {
    for (const list of [START_SOUNDS, LATER_SOUNDS]) {
      expect(new Set(list).size).toBe(list.length);
      for (const id of list) expect(SFX_IDS, id).toContain(id);
    }
    for (const id of START_SOUNDS) expect(LATER_SOUNDS, id).not.toContain(id);
    expect(new Set(LATER_STINGERS).size).toBe(LATER_STINGERS.length);
  });

  it('puts the first minute first: the menus, the summon ladder, a merge, a plain hit', () => {
    expect(START_SOUNDS.slice(0, 3)).toEqual(['ui_click', 'summon_common', 'pickup']);
    for (const id of ['summon_rare', 'summon_epic', 'summon_legendary', 'merge', 'merge_big', 'hit_light', 'hit_heavy', 'crit', 'wave_start'] as const) {
      expect(START_SOUNDS).toContain(id);
    }
    // What only some runs play waits for the calm: the awakening, a sold cat, the hazards.
    for (const id of ['awaken', 'sell', 'hazard_warn', 'explosion'] as const) expect(LATER_SOUNDS).toContain(id);
  });

  it('gives every cat its release and its impact, and nothing else', () => {
    for (const id of UNIT_IDS) expect(unitSounds(id)).toEqual([`atk_${id}`, `imp_${id}`]);
  });

  it('gives every enemy its answer to a hit and its death first, then the cues its own rule plays', () => {
    for (const id of ENEMY_IDS) {
      const sounds = enemySounds(id);
      expect(sounds[0], id).toMatch(/^foe_\w+_hit$/);
      expect(sounds[1], id).toMatch(/^foe_(\w+_die|boss_\w+)$/);
      for (const s of sounds) expect(SFX_IDS, `${id} ${s}`).toContain(s);
    }
    expect(enemySounds('pill')).toContain('heal');
    expect(enemySounds('cone')).toContain('shield_break');
    expect(enemySounds('dryer')).toContain('weaken');
    expect(enemySounds('spray')).toEqual(expect.arrayContaining(['hazard_warn', 'splash']));
    expect(enemySounds('boss_vacuum')).toContain('whoosh');
    expect(enemySounds('boss_blender')).toContain('whoosh');
    expect(enemySounds('boss_bath')).toEqual(expect.arrayContaining(['splash', 'hazard_warn']));
    expect(enemySounds('boss_cloud')).toEqual(expect.arrayContaining(['zap', 'hazard_warn']));
    expect(enemySounds('boss_needle')).toContain('buff');
    expect(enemySounds('cucumber')).toEqual(['foe_juicy_hit', 'foe_juicy_die']);
  });

  it('adds nothing for a plain wave but its enemies, once each', () => {
    const sounds = waveSounds([
      { enemy: 'cucumber', count: 6 },
      { enemy: 'tangerine', count: 3 },
    ]);
    expect(sounds).toEqual(['foe_juicy_hit', 'foe_juicy_die']);
    expect(waveSounds([])).toEqual([]);
  });

  it('adds the warning, the cry and the heavy blows of an elite, and the collapse of a boss on top', () => {
    const elite = waveSounds([{ enemy: 'firecracker', count: 1 }]);
    expect(elite).toEqual(expect.arrayContaining(['boss_warning', 'boss_roar', 'hit_heavy', 'foe_paper_hit', 'foe_paper_die']));
    expect(elite).not.toContain('boss_die');
    const boss = waveSounds([
      { enemy: 'dust', count: 8 },
      { enemy: 'boss_blender', count: 1 },
    ]);
    expect(boss).toEqual(expect.arrayContaining(['boss_warning', 'boss_roar', 'boss_die', 'explosion', 'wave_clear', 'foe_boss_blender', 'foe_glass_hit', 'foe_fluff_hit']));
    expect(new Set(boss).size).toBe(boss.length);
  });

  it('counts the first-chapter elite that carries a boss name as an elite, not a boss', () => {
    const sounds = waveSounds([{ enemy: 'boss_cucumber', count: 1 }]);
    expect(sounds).toContain('boss_warning');
    expect(sounds).not.toContain('boss_die');
  });
});
