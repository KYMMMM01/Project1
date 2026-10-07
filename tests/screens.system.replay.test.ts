import { describe, expect, it } from 'vitest';
import { replayBlocked } from '@/screens/system/tutorialReplay';

describe('play the tutorial again', () => {
  it('is free to start when no run waits, or only an interrupted tutorial does', () => {
    expect(replayBlocked(null)).toBe(false);
    expect(replayBlocked({ init: { mode: 'tutorial' } })).toBe(false);
  });

  it('waits behind any other unfinished run, so nothing is cleared for a run that cannot open', () => {
    for (const mode of ['chapter', 'daily', 'endless']) expect(replayBlocked({ init: { mode } }), mode).toBe(true);
  });
});
