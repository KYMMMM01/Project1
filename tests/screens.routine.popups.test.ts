import { describe, expect, it } from 'vitest';
import { FEATURES } from '@/meta/data/schedule';
import {
  jumpTarget, mayShowPopup, newUnlocks, nextPopup, primaryJump, reconcileSeen, sortUnlocks, UNLOCK_ORDER, type PopupFacts,
} from '@/screens/system/popupPolicy';

function facts(patch: Partial<PopupFacts> = {}): PopupFacts {
  return {
    comebackReady: false,
    gemPassReady: false,
    level: 1,
    seenLevel: 1,
    unlocked: [],
    seenUnlocked: [],
    offered: new Set(),
    ...patch,
  };
}

describe('which popup is next', () => {
  it('shows nothing when everything was seen', () => {
    expect(nextPopup(facts({ level: 3, seenLevel: 3, unlocked: ['cats'], seenUnlocked: ['cats'] }))).toBeNull();
  });

  it('orders them: welcome back, gem pass, level up, unlocks', () => {
    const all = facts({ comebackReady: true, gemPassReady: true, level: 4, seenLevel: 2, unlocked: ['cats'] });
    expect(nextPopup(all)).toEqual({ kind: 'comeback' });
    expect(nextPopup({ ...all, offered: new Set(['comeback']) })).toEqual({ kind: 'gemPass' });
    expect(nextPopup({ ...all, offered: new Set(['comeback', 'gemPass']) })).toEqual({ kind: 'levelUp', from: 2, to: 4 });
    expect(nextPopup({ ...all, offered: new Set(['comeback', 'gemPass']), seenLevel: 4 })).toEqual({ kind: 'unlock', features: ['cats'] });
  });

  it('merges several levels gained at once into one popup', () => {
    expect(nextPopup(facts({ level: 7, seenLevel: 3 }))).toEqual({ kind: 'levelUp', from: 3, to: 7 });
  });

  it('does not repeat a dismissed offer in the same session', () => {
    expect(nextPopup(facts({ comebackReady: true, offered: new Set(['comeback']) }))).toBeNull();
    expect(nextPopup(facts({ gemPassReady: true, offered: new Set(['gemPass']) }))).toBeNull();
  });
});

describe('feature unlock batches', () => {
  it('lists only what the player has not seen, in announcement order', () => {
    const got = newUnlocks(['speed2x', 'patrol', 'cats', 'missions'], ['patrol']);
    expect(got).toEqual(['cats', 'missions', 'speed2x']);
  });

  it('ignores names the game does not know', () => {
    expect(newUnlocks(['nonsense', 'cats'], [])).toEqual(['cats']);
  });

  it('gives every feature a place in the order and a jump decision', () => {
    for (const f of FEATURES) {
      expect(UNLOCK_ORDER).toContain(f);
      expect(jumpTarget(f) === null || typeof jumpTarget(f) === 'string').toBe(true);
    }
    expect(new Set(UNLOCK_ORDER).size).toBe(FEATURES.length);
  });

  it('jumps to the first feature of a batch that has a screen', () => {
    expect(primaryJump(['speed2x', 'cats', 'patrol'])).toEqual({ feature: 'cats', tab: 'cats' });
    expect(primaryJump(['speed2x', 'speed3x'])).toBeNull();
    expect(primaryJump(['treat', 'missions'])).toEqual({ feature: 'missions', tab: 'missions' });
    expect(sortUnlocks(['piggy', 'shop', 'cats'])).toEqual(['cats', 'shop', 'piggy']);
  });

  it('trims the record when a smaller profile was restored', () => {
    expect(reconcileSeen(['cats'], ['cats', 'missions', 'pass'], 2, 6)).toEqual({ seenUnlocked: ['cats'], seenLevel: 2 });
    expect(reconcileSeen(['cats', 'missions'], ['cats'], 5, 3)).toEqual({ seenUnlocked: ['cats'], seenLevel: 3 });
  });
});

describe('when popups may open', () => {
  const open = { shellAlive: true, transitioning: false, modalOpen: false, busy: false };

  it('opens only on a quiet home screen', () => {
    expect(mayShowPopup(open)).toBe(true);
    expect(mayShowPopup({ ...open, shellAlive: false })).toBe(false);
    expect(mayShowPopup({ ...open, transitioning: true })).toBe(false);
    expect(mayShowPopup({ ...open, modalOpen: true })).toBe(false);
    expect(mayShowPopup({ ...open, busy: true })).toBe(false);
  });
});
