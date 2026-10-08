import { afterEach, describe, expect, it } from 'vitest';
import { fxSettings } from '@/fx/settings';
import { motion } from '@/ui';
import { currentSettings, updateSettings } from '@/view/hud/settings';

describe('the reduce-motion setting', () => {
  afterEach(() => updateSettings({ reduceMotion: false }));

  it('is off by default and never follows the system flag', () => {
    expect(currentSettings().reduceMotion).toBe(false);
    expect(motion.reduced).toBe(false);
    expect(fxSettings.reducedMotion).toBe(false);
  });

  it('flips the kit flag and the effect switch at once, and back', () => {
    updateSettings({ reduceMotion: true });
    expect(motion.reduced).toBe(true);
    expect(fxSettings.reducedMotion).toBe(true);
    updateSettings({ reduceMotion: false });
    expect(motion.reduced).toBe(false);
    expect(fxSettings.reducedMotion).toBe(false);
  });
});

describe('the damage number level', () => {
  afterEach(() => updateSettings({ numbers: 'brief' }));

  it('is the calm one for a new player, on the screen and in the effects', () => {
    expect(currentSettings().numbers).toBe('brief');
    expect(fxSettings.numbers).toBe('brief');
  });

  it('reaches the effects at once, each of the three levels', () => {
    for (const level of ['full', 'off', 'brief'] as const) {
      updateSettings({ numbers: level });
      expect(currentSettings().numbers).toBe(level);
      expect(fxSettings.numbers).toBe(level);
    }
  });
});
