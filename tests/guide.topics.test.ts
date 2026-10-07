import { describe, expect, it } from 'vitest';
import { TOPICS, topicsOf, type TopicDef } from '@/guide/topics';

const point = (d: TopicDef): string | undefined => d.try?.point;

describe('"try it" on the home screen', () => {
  it('has a tab and a point for every topic of the home section', () => {
    const missing = topicsOf('home').filter((d) => !d.try?.tab || !point(d));
    expect(missing.map((d) => d.id)).toEqual([]);
  });

  it('names every point on the tab it goes to', () => {
    for (const d of TOPICS) {
      if (!d.try?.point) continue;
      expect(d.try.tab, d.id).toBeDefined();
      expect(d.try.point.startsWith(`${d.try.tab}.`), d.id).toBe(true);
    }
  });

  it('keeps the battle controls and the home points apart', () => {
    for (const d of TOPICS) if (d.try?.control) expect(d.try.point, d.id).toBeUndefined();
  });
});
