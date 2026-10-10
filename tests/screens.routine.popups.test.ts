import { describe, expect, it } from 'vitest';
import { FEATURES } from '@/meta/data/schedule';
import {
  calendarDue, jumpTarget, mayShowPopup, newUnlocks, nextPopup, primaryJump, reconcileSeen, seenAfterImport, sortUnlocks, UNLOCK_ORDER, type PopupFacts,
} from '@/screens/system/popupPolicy';

function facts(patch: Partial<PopupFacts> = {}): PopupFacts {
  return {
    comebackReady: false,
    calendarReady: false,
    tutorialDone: true,
    today: '2026-10-10',
    calendarOfferedOn: '',
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

describe('the attendance popup', () => {
  const due = facts({ calendarReady: true });

  it('opens by itself when the reward of the day is still to be taken', () => {
    expect(nextPopup(due)).toEqual({ kind: 'calendar' });
    expect(calendarDue(due)).toBe(true);
  });

  it('stays away when there is nothing to take', () => {
    expect(nextPopup(facts({ calendarReady: false }))).toBeNull();
  });

  it('stays away until the tutorial is over, however much is waiting', () => {
    expect(nextPopup({ ...due, tutorialDone: false })).toBeNull();
    expect(nextPopup({ ...due, tutorialDone: false, level: 3, unlocked: ['cats'] })?.kind).toBe('levelUp');
  });

  it('is not repeated on the day it was dismissed, but is offered again on the next launch (the record is only memory)', () => {
    expect(nextPopup({ ...due, calendarOfferedOn: '2026-10-10' })).toBeNull();
    // A launch starts with no record.
    expect(nextPopup({ ...due, calendarOfferedOn: '' })).toEqual({ kind: 'calendar' });
  });

  it('is a new offer when the app is left open over midnight', () => {
    expect(nextPopup({ ...due, calendarOfferedOn: '2026-10-10', today: '2026-10-11' })).toEqual({ kind: 'calendar' });
    expect(nextPopup({ ...due, calendarOfferedOn: '2026-10-11', today: '2026-10-11' })).toBeNull();
  });

  it('comes after the welcome-back chest and before everything else, and the others follow one at a time', () => {
    const all = facts({ calendarReady: true, comebackReady: true, gemPassReady: true, level: 4, seenLevel: 2, unlocked: ['cats'] });
    expect(nextPopup(all)).toEqual({ kind: 'comeback' });
    const afterComeback = { ...all, offered: new Set<'comeback' | 'gemPass'>(['comeback']) };
    expect(nextPopup(afterComeback)).toEqual({ kind: 'calendar' });
    const afterCalendar = { ...afterComeback, calendarOfferedOn: '2026-10-10' };
    expect(nextPopup(afterCalendar)).toEqual({ kind: 'gemPass' });
    expect(nextPopup({ ...afterCalendar, offered: new Set(['comeback', 'gemPass']) })).toEqual({ kind: 'levelUp', from: 2, to: 4 });
    expect(nextPopup({ ...afterCalendar, offered: new Set(['comeback', 'gemPass']), seenLevel: 4 })).toEqual({ kind: 'unlock', features: ['cats'] });
  });

  it('goes before a level-up or an unlock that is due at the same time', () => {
    expect(nextPopup(facts({ calendarReady: true, level: 5, seenLevel: 2, unlocked: ['cats'] }))).toEqual({ kind: 'calendar' });
    expect(nextPopup(facts({ calendarReady: true, unlocked: ['cats'] }))).toEqual({ kind: 'calendar' });
  });

  it('is claimed once: taking the reward ends the offer for the day', () => {
    expect(nextPopup(facts({ calendarReady: false, calendarOfferedOn: '2026-10-10', level: 2, seenLevel: 1 }))?.kind).toBe('levelUp');
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

describe('after a backup import', () => {
  it('announces nothing the restored profile already had, and no level-up gems that were never paid here', () => {
    // A fresh install (level 1, nothing seen) that just took a level 98 code with everything unlocked.
    const unlocked = [...UNLOCK_ORDER];
    expect(nextPopup(facts({ level: 98, unlocked }))?.kind).toBe('levelUp');
    expect(nextPopup(facts({ level: 98, unlocked, ...seenAfterImport(unlocked, 98) }))).toBeNull();
  });

  it('follows a code with a lower level than this device had reached', () => {
    const r = seenAfterImport(['cats'], 3);
    expect(r).toEqual({ seenUnlocked: ['cats'], seenLevel: 3 });
    // The next real level-up is announced again.
    expect(nextPopup(facts({ level: 4, unlocked: ['cats'], ...r }))).toEqual({ kind: 'levelUp', from: 3, to: 4 });
  });

  it('copies the unlock list instead of sharing it with the profile', () => {
    const unlocked = ['cats'];
    const r = seenAfterImport(unlocked, 2);
    unlocked.push('missions');
    expect(r.seenUnlocked).toEqual(['cats']);
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
