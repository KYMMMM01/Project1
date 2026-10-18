import { afterEach, describe, expect, it, vi } from 'vitest';
import { SKILL_TOPICS, TOPIC_IDS, TOPICS, bookHasSkills, shownTopicIds, topicDef, topicShown, topicsOf, type TopicDef } from '@/guide/topics';

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

describe('the topic on cat skills', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('is a page of the team section, right after the pick of three, with the cat and its ring for a picture', () => {
    const team = topicsOf('team', true).map((d) => d.id);
    expect(team.indexOf('sp_skill')).toBe(team.indexOf('pick3') + 1);
    expect(topicDef('sp_skill').section).toBe('team');
    expect(topicDef('sp_skill').art).toMatchObject({ k: 'ring', cat: 'w_viking' });
    const gauge = (topicDef('sp_skill').art as { gauge: number }).gauge;
    expect(gauge).toBeGreaterThan(0.5);
    expect(gauge).toBeLessThan(1);
  });

  it('sends "try it" on the home screen to the cat tab, which holds the cards with the skill on them', () => {
    expect(topicDef('sp_skill').try).toEqual({ tab: 'cats', point: 'cats.cards' });
  });

  it('is in the book only while skills are on: no list, no "next", no "back" and no count shows it otherwise', () => {
    expect(topicsOf('team', false).map((d) => d.id)).not.toContain('sp_skill');
    expect(topicsOf('team', true).map((d) => d.id)).toContain('sp_skill');
    expect(topicShown('sp_skill', false)).toBe(false);
    expect(topicShown('sp_skill', true)).toBe(true);
    expect(shownTopicIds(false)).toEqual(TOPIC_IDS.filter((id) => !SKILL_TOPICS.includes(id)));
    expect(shownTopicIds(true)).toEqual([...TOPIC_IDS]);
    // every other topic is in the book either way, in the same order, so the book reads as it did
    for (const id of TOPIC_IDS) if (!SKILL_TOPICS.includes(id)) expect(topicShown(id, false), id).toBe(true);
    // no switch given: the app's own, which is off in a test (no page, no URL)
    expect(topicsOf('team').map((d) => d.id)).toEqual(topicsOf('team', false).map((d) => d.id));
    expect(topicShown('sp_skill')).toBe(false);
  });

  it('follows the URL parameter the battles follow: sp=1 puts it in the book, sp=0 and no parameter leave it out', () => {
    vi.stubGlobal('location', { search: '?sp=1' });
    expect(topicShown('sp_skill')).toBe(true);
    expect(topicsOf('team').map((d) => d.id)).toContain('sp_skill');
    vi.stubGlobal('location', { search: '?sp=0' });
    expect(topicShown('sp_skill')).toBe(false);
    vi.stubGlobal('location', { search: '' });
    expect(topicShown('sp_skill')).toBe(false);
  });

  it('is listed for a visit that opens on it even with the switch off (the "more" of a card in a run that plays with skills), and for no other visit', () => {
    expect(bookHasSkills(undefined, false)).toBe(false);
    expect(bookHasSkills('merge', false)).toBe(false);
    expect(bookHasSkills('sp_skill', false)).toBe(true);
    expect(bookHasSkills(undefined, true)).toBe(true);
    expect(bookHasSkills()).toBe(false);
    // and then the page has its neighbours: "next" and "back" find it in its section
    const team = topicsOf('team', bookHasSkills('sp_skill', false)).map((d) => d.id);
    expect(team.indexOf('sp_skill')).toBe(team.indexOf('pick3') + 1);
  });

  it('is the only topic hidden, and it hides nothing from another section', () => {
    expect(SKILL_TOPICS).toEqual(['sp_skill']);
    for (const section of ['start', 'field', 'foes', 'home'] as const) expect(topicsOf(section, false)).toEqual(topicsOf(section, true));
  });
});
