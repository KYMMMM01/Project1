import { describe, expect, it } from 'vitest';
import { LockSet } from '@/screens/shell/LockSet';

function fake(enabled: boolean): { on: boolean; setEnabled(v: boolean): void } {
  return {
    on: enabled,
    setEnabled(v) {
      this.on = v;
    },
  };
}

describe('buttons that go quiet together', () => {
  it('lock every button while a request is in flight', () => {
    const set = new LockSet();
    const a = fake(true);
    const b = fake(true);
    set.add(a);
    set.add(b);
    set.setBusy(true);
    expect([a.on, b.on]).toEqual([false, false]);
  });

  it('give each one back its own availability, so an ad that is not ready stays off after a refused start', () => {
    const set = new LockSet();
    const ad = fake(false);
    const gems = fake(true);
    set.add(ad, () => false);
    set.add(gems);
    set.setBusy(true);
    set.setBusy(false);
    expect(ad.on).toBe(false);
    expect(gems.on).toBe(true);
  });

  it('read the availability when the lock lifts, not when the button was added', () => {
    const set = new LockSet();
    let ready = false;
    const ad = fake(false);
    set.add(ad, () => ready);
    set.setBusy(true);
    ready = true;
    set.setBusy(false);
    expect(ad.on).toBe(true);
  });
});
