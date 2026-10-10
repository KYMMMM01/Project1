import { describe, expect, it } from 'vitest';
import type { TopicId } from '@/guide';
import {
  emptyCounts, RELAXED_PATIENCE, revealedBy, STEP_IDS, STEPS, TUTORIAL_SUMMONS, TutorialScript, type CountKey, type ScriptEvent, type StepDef, type World,
} from '@/view/hud/tutorialScript';

function world(over: Partial<World> = {}): World {
  return {
    phase: 'wave', wave: 1, waveKind: 'normal', pending: null, busy: false, cats: 3, empties: 17, twins: false, enemies: 4, targetAlive: false,
    fish: 20, purr: 0, moltCost: 1, gradeCost: 60, classCost: 60, maxTier: 0, sun: 0, laserReady: true, laserGuided: false, laserHold: false, callBonus: -1,
    selected: false, king: false, kingSelected: false, counts: emptyCounts(), ...over,
  };
}

const bump = (w: World, key: CountKey, n = 1): World => ({ ...w, counts: { ...w.counts, [key]: w.counts[key] + n } });

const kinds = (events: readonly ScriptEvent[]): string[] => events.map((e) => `${e.kind}:${e.step.id}`);

/** What the world looks like when each lesson's moment comes, and what the player does to finish it. */
const MOMENT: Record<string, { at: Partial<World>; act?: (w: World) => World }> = {
  summon: { at: { phase: 'prep', wave: 0, enemies: 0 }, act: (w) => bump(w, 'summon', TUTORIAL_SUMMONS) },
  merge: { at: { phase: 'wave', wave: 1, enemies: 0, twins: true }, act: (w) => bump(w, 'merge') },
  lose_gauge: { at: { enemies: 3 } },
  classes: { at: {}, act: (w) => bump(w, 'sheetClose') },
  acts: { at: { wave: 2 } },
  pick3: { at: { wave: 3, pending: 'summon', busy: true }, act: (w) => bump(w, 'pick') },
  synergy: { at: { wave: 3, maxTier: 1 } },
  sun: { at: { wave: 3, sun: 4 }, act: (w) => bump(w, 'sunMove') },
  laser: { at: { wave: 3, enemies: 3 }, act: (w) => ({ ...w, laserGuided: true }) },
  elite: { at: { wave: 4, waveKind: 'elite', targetAlive: true } },
  purr: { at: { wave: 4, counts: { ...emptyCounts(), purrGain: 1 } } },
  toys: { at: { wave: 4, pending: 'relic', busy: true }, act: (w) => bump(w, 'relic') },
  molt: { at: { wave: 5, purr: 3 }, act: (w) => bump(w, 'molt') },
  summon_grade: { at: { wave: 5, fish: 150 }, act: (w) => bump(w, 'gradeUp') },
  class_upgrade: { at: { wave: 5, fish: 150 }, act: (w) => bump(w, 'classUp') },
  call_wave: { at: { wave: 6, callBonus: 5 }, act: (w) => bump(w, 'call') },
  speed: { at: { wave: 6 }, act: (w) => bump(w, 'speed') },
  sell: { at: { wave: 7, empties: 2, cats: 18 }, act: (w) => bump(w, 'sell') },
  awaken: { at: { wave: 7, king: true, purr: 13 }, act: (w) => bump(w, 'awaken') },
  boss: { at: { wave: 8, waveKind: 'boss', targetAlive: true } },
};

describe('the tutorial lesson plan', () => {
  it('teaches the owner\'s order: summon, merge, the enemy gauge, classes, the pick, sun, laser, elite, purr, toys, molt, upgrades, call, speed, sell, awaken, boss', () => {
    expect(STEP_IDS).toEqual([
      'summon', 'merge', 'lose_gauge', 'classes', 'acts', 'pick3', 'synergy', 'sun', 'laser', 'elite', 'purr', 'toys', 'molt', 'summon_grade',
      'class_upgrade', 'call_wave', 'speed', 'sell', 'awaken', 'boss',
    ]);
    expect(new Set(STEP_IDS).size).toBe(STEP_IDS.length);
  });

  it('brings each hidden control in with the lesson that explains it, and only once', () => {
    const all = STEPS.flatMap((s) => s.reveal);
    expect(new Set(all).size).toBe(all.length);
    const by = (id: TopicId): readonly string[] => (STEPS.find((s) => s.id === id) as StepDef).reveal;
    expect(by('classes')).toEqual(['chips']);
    expect(by('laser')).toEqual(['laser']);
    expect(by('purr')).toEqual(['purr']);
    expect(by('molt')).toEqual(['molt']);
    expect(by('summon_grade')).toEqual(['gradeUpgrade', 'odds']);
    expect(by('class_upgrade')).toEqual(['classUpgrade']);
    expect(by('call_wave')).toEqual(['callWave']);
    expect(by('speed')).toEqual(['speed']);
    expect(by('acts')).toEqual(['preview']);
    expect(by('pick3')).toEqual(['tracker']);
    expect(by('sell')).toEqual(['sellHint']);
    // the awakening is taught in the first run now: its own lesson brings the button in
    expect(by('awaken')).toEqual(['awaken']);
  });

  it('teaches every lesson in order when the player does what each one asks', () => {
    const script = new TutorialScript();
    let w = world();
    const log: string[] = [];
    for (const id of STEP_IDS) {
      const m = MOMENT[id] as (typeof MOMENT)[string];
      w = { ...w, ...m.at, counts: m.at.counts ?? w.counts };
      log.push(...kinds(script.update(w, 0.1, false)));
      expect(script.active?.id ?? log.at(-1), id).toBeTruthy();
      if (m.act) {
        w = m.act(w);
      } else if (id === 'synergy') {
        log.push(...kinds(script.update(w, 5, false)));
      } else {
        script.tapOk();
      }
      log.push(...kinds(script.update(w, 0.1, false)));
      w = { ...w, pending: null, busy: false };
    }
    // every lesson began and was done, once, in the plan's order, and none was dropped
    expect(log.filter((e) => e.startsWith('begin:'))).toEqual(STEP_IDS.map((id) => `begin:${id}`));
    expect(log.filter((e) => e.startsWith('done:'))).toEqual(STEP_IDS.map((id) => `done:${id}`));
    expect(log.some((e) => e.startsWith('drop:'))).toBe(false);
    expect(script.finished).toBe(true);
    expect(script.update(w, 0.1, false)).toEqual([]);
  });

  it('never begins a lesson before the one ahead of it is over', () => {
    const script = new TutorialScript();
    const w = world({ phase: 'prep', wave: 0, enemies: 0, twins: true });
    expect(kinds(script.update(w, 0.1, false))).toEqual(['begin:summon']);
    expect(script.update(w, 0.1, false)).toEqual([]);
    expect(script.active?.id).toBe('summon');
  });

  it('holds the clock for the first lesson and counts no patience while it does', () => {
    const script = new TutorialScript();
    const w = world({ phase: 'prep', wave: 0, enemies: 0 });
    script.update(w, 0.1, false);
    script.update(w, 1000, false);
    expect(script.active?.id).toBe('summon');
  });

  it('gives up on a lesson the player ignores, so a player who reads nothing is never stopped', () => {
    const script = new TutorialScript();
    let w = world({ phase: 'prep', wave: 0, enemies: 0 });
    script.update(w, 0.1, false);
    w = bump(w, 'summon', 3);
    script.update(w, 0.1, false);
    w = world({ twins: true, counts: w.counts });
    expect(kinds(script.update(w, 0.1, false))).toEqual(['begin:merge']);
    const merge = STEPS.find((s) => s.id === 'merge') as StepDef;
    // the merge waits for a drag on the field, which the field takes while the lesson holds the clock: no patience runs until it lets go
    expect(merge.holds(w)).toBe(true);
    expect(script.update(w, merge.patience * 10, false)).toEqual([]);
    script.relax();
    expect(script.update(w, RELAXED_PATIENCE - 1, false)).toEqual([]);
    expect(kinds(script.update(w, 2, false))).toEqual(['drop:merge', 'begin:lose_gauge']);
    expect(script.active?.id).toBe('lose_gauge');
  });

  it('drops a lesson whose moment has passed instead of teaching it late', () => {
    const script = new TutorialScript(new Set<TopicId>(['summon']));
    const w = world({ wave: 3, twins: true });
    expect(kinds(script.update(w, 0.1, false))).toEqual(['drop:merge', 'drop:lose_gauge', 'drop:classes', 'drop:acts']);
  });

  it('does not count patience while a popup holds the clock', () => {
    const script = new TutorialScript(new Set<TopicId>(['summon']));
    const w = world({ twins: true });
    script.update(w, 0.1, false);
    expect(script.update(w, 1000, true)).toEqual([]);
    expect(script.active?.id).toBe('merge');
  });

  it('ends a read-only lesson when "got it" is tapped, and a held lesson only then', () => {
    const script = new TutorialScript(new Set<TopicId>(['summon', 'merge']));
    const w = world();
    expect(kinds(script.update(w, 0.1, false))).toEqual(['begin:lose_gauge']);
    const gauge = STEPS.find((s) => s.id === 'lose_gauge') as StepDef;
    expect(gauge.ok).toBe(true);
    expect(gauge.holds(w)).toBe(true);
    expect(script.update(w, 500, false)).toEqual([]);
    script.tapOk();
    expect(kinds(script.update(w, 0.1, false))).toEqual(['done:lose_gauge', 'begin:classes']);
  });

  it('is done at once when the player did the thing before the lesson began', () => {
    const script = new TutorialScript(new Set<TopicId>(['summon']));
    const w = world({ twins: true });
    const events = script.update(w, 0.1, false);
    expect(kinds(events)).toEqual(['begin:merge']);
    expect(kinds(script.update(bump(w, 'merge'), 0.1, false))).toEqual(['done:merge', 'begin:lose_gauge']);
  });

  it('starts the pick of three and the toy choice by themselves when the simulation opens them, whatever is on screen', () => {
    const script = new TutorialScript(new Set<TopicId>(['summon', 'merge', 'lose_gauge', 'classes', 'acts']));
    const w = world({ wave: 3, pending: 'summon', busy: true });
    expect(kinds(script.update(w, 0.1, false))).toEqual(['begin:pick3']);
    expect(kinds(script.update(bump(w, 'pick'), 0.1, false))).toEqual(['done:pick3']);
  });

  it('keeps every lesson doable by the action alone: nothing needs a button the player was not shown', () => {
    for (const s of STEPS) {
      if (!s.ok && s.timed === 0) expect(typeof s.done, s.id).toBe('function');
    }
  });

  it('does not repeat a lesson the player was already taught, and its controls are out from the start', () => {
    const taught = new Set<TopicId>(['summon', 'merge', 'lose_gauge', 'classes', 'laser']);
    const script = new TutorialScript(taught);
    const events = script.update(world({ wave: 2 }), 0.1, false);
    expect(kinds(events)[0]).toBe('begin:acts');
    expect(revealedBy(taught)).toEqual(['chips', 'laser']);
  });

  it('stops for good on a skip and says what it leaves untaught', () => {
    const script = new TutorialScript(new Set<TopicId>(['summon']));
    script.update(world({ twins: true }), 0.1, false);
    const left = script.stop();
    expect(left.map((s) => s.id)).toContain('merge');
    expect(left.map((s) => s.id)).not.toContain('summon');
    expect(script.finished).toBe(true);
    expect(script.update(world({ wave: 5, purr: 3 }), 0.1, false)).toEqual([]);
    expect(script.active).toBeNull();
  });

  it('lets the elite cut in on a lesson that is still going, which is dropped', () => {
    const script = new TutorialScript(new Set<TopicId>(['summon', 'merge', 'lose_gauge', 'classes', 'acts', 'pick3', 'synergy', 'sun']));
    const w = world({ wave: 3, enemies: 3 });
    expect(kinds(script.update(w, 0.1, false))).toEqual(['begin:laser']);
    const elite = world({ wave: 4, waveKind: 'elite', targetAlive: true, enemies: 3 });
    expect(kinds(script.update(elite, 0.1, false))).toEqual(['drop:laser', 'begin:elite']);
    // the elite itself is never cut in on, and nothing before it can come back
    expect(script.update(world({ wave: 4, waveKind: 'elite', targetAlive: true, twins: true }), 0.1, false)).toEqual([]);
    expect(script.active?.id).toBe('elite');
  });

  it('lets go of a lesson that held the clock for ever and gives up on it after a short wait', () => {
    const script = new TutorialScript(new Set<TopicId>(['summon', 'merge']));
    const w = world();
    script.update(w, 0.1, false);
    expect(script.active?.id).toBe('lose_gauge');
    expect(script.update(w, 500, false)).toEqual([]);
    script.relax();
    expect(script.relaxed).toBe(true);
    expect(script.update(w, RELAXED_PATIENCE - 1, false)).toEqual([]);
    expect(kinds(script.update(w, 2, false))).toEqual(['drop:lose_gauge', 'begin:classes']);
    // the next lesson holds again until it is relaxed in its turn
    expect(script.relaxed).toBe(false);
  });

  it('can be told that a lesson cannot be shown, and moves on', () => {
    const script = new TutorialScript(new Set<TopicId>(['summon']));
    script.update(world({ twins: true }), 0.1, false);
    expect(script.abandon()).toMatchObject({ kind: 'drop', step: { id: 'merge' } });
    expect(script.active).toBeNull();
  });
});

describe('the battle stands still while a lesson waits for the player', () => {
  it('holds the clock in every lesson that is not a popup or the laser\'s own guide, at the moment it is taught', () => {
    for (const s of STEPS) {
      if (s.popup || s.id === 'laser') continue;
      const m = MOMENT[s.id] as (typeof MOMENT)[string];
      const w = world({ ...m.at, counts: m.at.counts ?? emptyCounts() });
      expect(s.holds(w), s.id).toBe(true);
      // both stages of a lesson that goes from a cat to a button
      expect(s.holds({ ...w, selected: true, kingSelected: true }), `${s.id} selected`).toBe(true);
    }
  });

  it('ends a timed note by the real clock while it holds the battle still', () => {
    const script = new TutorialScript(new Set<TopicId>(['summon', 'merge', 'lose_gauge', 'classes', 'acts', 'pick3']));
    const w = world({ wave: 3, maxTier: 1 });
    expect(kinds(script.update(w, 0.1, false))).toEqual(['begin:synergy']);
    const synergy = STEPS.find((s) => s.id === 'synergy') as StepDef;
    expect(synergy.holds(w)).toBe(true);
    expect(script.update(w, synergy.timed - 1, false)).toEqual([]);
    expect(kinds(script.update(w, 1.2, false))).toEqual(['done:synergy']);
  });

  it('counts no time for a lesson while a popup or a card holds the clock', () => {
    const script = new TutorialScript(new Set<TopicId>(['summon', 'merge', 'lose_gauge', 'classes', 'acts', 'pick3']));
    const w = world({ wave: 3, maxTier: 1 });
    script.update(w, 0.1, false);
    expect(script.update(w, 100, true)).toEqual([]);
    expect(script.active?.id).toBe('synergy');
  });
});

describe('the awakening lesson', () => {
  const taughtBefore = new Set<TopicId>(STEP_IDS.slice(0, STEP_IDS.indexOf('awaken')));
  const awaken = STEPS.find((s) => s.id === 'awaken') as StepDef;

  it('comes after selling and before the boss, and brings the awaken button in', () => {
    expect(STEP_IDS.indexOf('awaken')).toBe(STEP_IDS.indexOf('sell') + 1);
    expect(STEP_IDS.indexOf('boss')).toBe(STEP_IDS.indexOf('awaken') + 1);
    expect(awaken.reveal).toEqual(['awaken']);
    expect(awaken.ok).toBe(false);
    expect(awaken.popup).toBe(false);
  });

  it('waits for a king that can awaken now, and does not begin without one', () => {
    const script = new TutorialScript(taughtBefore);
    expect(script.update(world({ wave: 7, purr: 3 }), 0.1, false)).toEqual([]);
    expect(script.active).toBeNull();
    expect(kinds(script.update(world({ wave: 7, king: true, purr: 13 }), 0.1, false))).toEqual(['begin:awaken']);
  });

  it('points at the king first and at the awaken button once the king is selected, and is done by the awakening alone', () => {
    const w = world({ wave: 7, king: true, purr: 13 });
    expect(awaken.target(w)).toBe('king');
    expect(awaken.target({ ...w, selected: true, kingSelected: false })).toBe('king');
    expect(awaken.target({ ...w, selected: true, kingSelected: true })).toBe('awaken');
    const script = new TutorialScript(taughtBefore);
    script.update(w, 0.1, false);
    expect(script.update({ ...w, selected: true, kingSelected: true }, 0.1, false)).toEqual([]);
    expect(kinds(script.update(bump(w, 'awaken'), 0.1, false))).toEqual(['done:awaken']);
  });

  it('is dropped, not taught late, once the boss wave has come', () => {
    const script = new TutorialScript(taughtBefore);
    const w = world({ wave: 8, king: true, waveKind: 'boss', targetAlive: true });
    expect(kinds(script.update(w, 0.1, false))).toEqual(['drop:awaken', 'begin:boss']);
  });
});
