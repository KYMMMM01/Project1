import { describe, expect, it } from 'vitest';
import { Toggle } from '@/ui/controls';

/** The green fill and the check of a switch, reached the way the screens never do (they are private). */
const parts = (t: Toggle): { fill: { alpha: number; visible: boolean }; check: { alpha: number; visible: boolean } } => {
  const self = t as unknown as { onLayer: { alpha: number; visible: boolean }; check: { alpha: number; visible: boolean } };
  return { fill: self.onLayer, check: self.check };
};

describe('a switched-off toggle shows nothing of its "on" side', () => {
  it('hides the green fill and the check at 0 (inside a render group, alpha 0 alone left the last frame on screen)', () => {
    const t = new Toggle({ value: true });
    expect(parts(t).fill.visible).toBe(true);
    expect(parts(t).check.visible).toBe(true);
    t.setValue(false, false);
    expect(parts(t).fill).toMatchObject({ alpha: 0, visible: false });
    expect(parts(t).check).toMatchObject({ alpha: 0, visible: false });
    t.setValue(true, false);
    expect(parts(t).fill).toMatchObject({ alpha: 1, visible: true });
    expect(parts(t).check).toMatchObject({ alpha: 1, visible: true });
  });

  it('starts hidden when it starts off', () => {
    const t = new Toggle({ value: false });
    expect(parts(t).fill.visible).toBe(false);
    expect(parts(t).check.visible).toBe(false);
  });
});
