/**
 * The tutorial's view (src/view/hud/Tutorial.ts) on a real tutorial simulation, with the pictures left out: what it does with the clock, the nudge, the laser's guide and the
 * cards when the player pauses, ignores a lesson, or when the HUD is built again. The pieces that only paint (the note, the hand, the sticker) are stand-ins that remember
 * what they were asked.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Container } from 'pixi.js';

vi.mock('@/audio', () => ({ audio: { play: () => undefined } }));
vi.mock('@/guide', () => ({ topicTeach: (id: string) => `teach:${id}`, topicDef: () => ({ art: 'x' }) }));
vi.mock('@/view/hud/kit', () => ({ unitPortrait: () => new Container() }));
vi.mock('@/view/hud/Hand', async () => {
  const { Container: C } = await import('pixi.js');
  return {
    Hand: class extends C {
      placed: { x: number; y: number } | null = null;
      place(x: number, y: number): void {
        this.placed = { x, y };
      }
      tap(): void {}
      drag(): void {}
      turnTo(): void {}
    },
  };
});
vi.mock('@/view/hud/LessonBubble', () => {
  const made: Array<{ visible: boolean; shakes: number; shows: number; hides: number }> = [];
  return {
    made,
    LessonBubble: class {
      visible = false;
      rect: { x: number; y: number; w: number; h: number } | null = null;
      shakes = 0;
      shows = 0;
      hides = 0;
      constructor() {
        made.push(this);
      }
      show(): void {
        this.visible = true;
        this.shows++;
        this.rect = { x: 40, y: 100, w: 620, h: 120 };
      }
      hide(): void {
        this.visible = false;
        this.hides++;
        this.rect = null;
      }
      shake(): void {
        this.shakes++;
      }
      destroy(): void {}
    },
  };
});
vi.mock('@/view/hud/LessonFx', () => ({
  LessonFx: class {
    cheering = false;
    cheerRect = null;
    update(): void {}
    celebrate(): void {}
    arrive(): void {}
    destroy(): void {}
  },
}));
vi.mock('@/ui', async (original) => {
  const real = await original<typeof import('@/ui')>();
  const { Container: C } = await import('pixi.js');
  return {
    ...real,
    Button: class extends C {
      onTap(): void {}
    },
    confirmDialog: async () => true,
    toast: () => undefined,
    drawDashedRect: () => undefined,
    TweenBag: class {
      call(): void {}
      killAll(): void {}
      killKeyed(): void {}
      runKeyed(): void {}
      run(): void {}
    },
  };
});

import { Emitter } from '@/core/events';
import { setLang } from '@/core/i18n';
import type { TopicId } from '@/guide';
import { CELL_COUNT } from '@/game/geometry';
import { TICK } from '@/game/data/balance';
import { emptyCounts, HOLD_LIMIT, RELAXED_PATIENCE, STEP_IDS, STEPS, TutorialScript, type StepDef, type World } from '@/view/hud/tutorialScript';
import { Tutorial, TutorialKeep, type TutorialHost } from '@/view/hud/Tutorial';
import type { EnvImpl } from '@/view/hud/env';
import { revealFlags } from '@/view/hud/policy';
import { computeBattleLayout } from '@/view/layout';
import { newSim } from './simHelpers';

const { made } = (await import('@/view/hud/LessonBubble')) as unknown as { made: Array<{ visible: boolean; shakes: number; shows: number; hides: number }> };

type Sim = ReturnType<typeof newSim>;

/** The battle as the script sees it (see tests/view.hud.script.test.ts). */
function world(over: Partial<World> = {}): World {
  return {
    phase: 'wave', wave: 1, waveKind: 'normal', pending: null, busy: false, cats: 3, empties: 17, twins: false, enemies: 4, targetAlive: false,
    fish: 20, purr: 0, moltCost: 1, gradeCost: 60, classCost: 60, maxTier: 0, sun: 0, laserReady: true, laserGuided: false, laserHold: false, callBonus: -1,
    selected: false, king: false, kingSelected: false, ringNear: false, counts: emptyCounts(), ...over,
  };
}

interface Rig {
  sim: Sim;
  tutorial: Tutorial;
  /** The note of the latest tutorial built. */
  note: () => { visible: boolean; shakes: number; shows: number; hides: number };
  reasons: Set<string>;
  paused: () => boolean;
  selected: { cell: number | null };
  select: ReturnType<typeof vi.fn>;
  env: { userPause: boolean; modalCount: number; reveal: ReturnType<typeof revealFlags> };
  giveUp: ReturnType<typeof vi.fn>;
  host: { [K in keyof TutorialHost]: ReturnType<typeof vi.fn> };
  taught: Set<string>;
  layout: ReturnType<typeof computeBattleLayout>;
  /** One frame: the tutorial first, then the battle's clock when nothing holds it. */
  frame(dt?: number): void;
  /** Frames for `seconds` of real time. */
  run(seconds: number): void;
}

function rig(opts: { keep?: TutorialKeep; sim?: Sim; taught?: string[]; skipped?: boolean } = {}): Rig {
  const sim = opts.sim ?? newSim({ mode: 'tutorial', seed: 7 });
  const layout = computeBattleLayout(720, 1280, 0, 0);
  const reasons = new Set<string>();
  const selected = { cell: null as number | null };
  const select = vi.fn((cell: number | null) => {
    selected.cell = cell;
  });
  const taught = new Set<string>(opts.taught ?? []);
  const giveUp = vi.fn();
  const ctx = {
    layers: { overlay: new Container() },
    events: new Emitter<Record<string, unknown>>(),
    get paused() {
      return reasons.size > 0;
    },
    setPaused: (reason: string, on: boolean) => void (on ? reasons.add(reason) : reasons.delete(reason)),
    get selected() {
      return selected.cell;
    },
    select,
    toSceneX: (x: number) => x,
    toSceneY: (y: number) => y,
  };
  const env = {
    userPause: false,
    modalCount: 0,
    reveal: revealFlags(true, []),
    ctx,
    battle: sim,
    layout: () => layout,
    progress: { isTaught: (id: string) => taught.has(id), markTaught: (id: string) => taught.add(id), markSkipped: vi.fn(), skipped: false },
    hints: { giveUp },
    lessonOf: null,
    lessonLeft: null,
    noteTo: null,
    on: <E extends object, K extends keyof E>(emitter: Emitter<E>, type: K, fn: (payload: E[K]) => void): void => void emitter.on(type, fn),
    showControl: (key: keyof ReturnType<typeof revealFlags>) => {
      env.reveal[key] = true;
    },
    holdPause: () => () => undefined,
    setSkip: () => undefined,
    skipChanged: new Emitter<{ change: null }>(),
  };
  const spot = { x: 260, y: 1180, w: 200, h: 100 };
  const host = {
    rectOf: vi.fn(() => spot),
    rectOfReveal: vi.fn(() => spot),
    pulse: vi.fn(),
    keepClear: vi.fn(() => []),
    laserGuided: vi.fn(() => false),
    laserHolds: vi.fn(() => false),
    settlePurr: vi.fn(),
    startLaserGuide: vi.fn(),
    endLaserGuide: vi.fn(),
    stickerKeep: vi.fn(() => []),
    chipColumn: vi.fn(() => ({ x: 0, y: 0, w: 10, h: 10 })),
    labelsOf: vi.fn(() => []),
    restingRects: vi.fn(() => []),
  };
  const keep = opts.keep ?? new TutorialKeep();
  const tutorial = new Tutorial(env as unknown as EnvImpl, host as unknown as TutorialHost, opts.skipped ?? false, keep);
  const frame = (dt = 1 / 30): void => {
    tutorial.update(dt);
    if (!ctx.paused) sim.step(Math.min(dt, TICK * 6));
  };
  const run = (seconds: number): void => {
    for (let t = 0; t < seconds; t += 1 / 30) frame();
  };
  return {
    sim,
    tutorial,
    note: () => made[made.length - 1] as { visible: boolean; shakes: number; shows: number; hides: number },
    reasons,
    paused: () => ctx.paused,
    selected,
    select,
    env,
    giveUp,
    host: host as never,
    taught,
    layout,
    frame,
    run,
  };
}

/** Two cats of one kind on the board: the twins the merge lesson points at. */
function twinCells(sim: Sim): [number, number] | null {
  for (let a = 0; a < sim.units.length; a++) {
    for (let b = a + 1; b < sim.units.length; b++) {
      const ua = sim.units[a];
      const ub = sim.units[b];
      if (ua && ub && ua.id === ub.id) return [a, b];
    }
  }
  return null;
}

/** Plays the opening the way an obedient player does (the three summons, the merge, "got it" on the notes) until the lesson of `id` is up. */
function reachLesson(r: Rig, id: string): void {
  r.frame();
  for (let i = 0; i < 3; i++) {
    r.sim.summon();
    r.frame();
  }
  for (let i = 0; i < 6000 && r.tutorial.topic !== id; i++) {
    const topic = r.tutorial.topic;
    if (topic === 'merge') {
      const pair = twinCells(r.sim);
      if (pair) r.sim.drop(pair[0], pair[1]);
    } else if (topic === 'lose_gauge' || topic === 'acts') {
      r.tutorial.script.tapOk();
    }
    r.frame();
  }
  for (let i = 0; i < 90; i++) r.frame();
  expect(r.tutorial.topic).toBe(id);
}

/** The three scripted summons, then frames until the merge lesson holds the clock with its note up. */
function toMergeLesson(r: Rig): void {
  r.frame();
  for (let i = 0; i < 3; i++) {
    r.sim.summon();
    r.frame();
  }
  for (let i = 0; i < 300 && r.tutorial.topic !== 'merge'; i++) r.frame();
  for (let i = 0; i < 90; i++) r.frame();
  expect(r.tutorial.topic).toBe('merge');
  expect(r.paused()).toBe(true);
}

describe('the tutorial view', () => {
  beforeAll(() => {
    vi.stubGlobal('document', { documentElement: { lang: '' } });
    setLang('en');
  });
  afterAll(() => {
    setLang('ko');
    vi.unstubAllGlobals();
  });
  beforeEach(() => {
    made.length = 0;
  });

  it('builds on a real tutorial run and begins the first lesson', () => {
    const r = rig();
    r.frame();
    expect(r.tutorial.topic).toBe('summon');
    expect(STEP_IDS).toContain('merge');
    expect(r.sim.units.length).toBe(CELL_COUNT);
  });

  it('holds the clock for the merge lesson, with its note on screen', () => {
    const r = rig();
    toMergeLesson(r);
    expect(r.reasons.has('tutorial')).toBe(true);
    expect(r.note().visible).toBe(true);
  });

  describe('a lesson the player leaves unanswered', () => {
    it('lets go of the screen: no note, no dim, the clock runs again', () => {
      const r = rig();
      toMergeLesson(r);
      r.run(HOLD_LIMIT + 2);
      expect(r.tutorial.script.relaxed).toBe(true);
      expect(r.paused()).toBe(false);
      expect(r.note().visible).toBe(false);
      expect((r.tutorial as unknown as { layer: { visible: boolean } }).layer.visible).toBe(false);
    });

    it('gives up on it after the short wait, hands its topic back to the cards, and the run goes on', () => {
      const r = rig();
      toMergeLesson(r);
      r.run(HOLD_LIMIT + RELAXED_PATIENCE + 3);
      expect(r.giveUp).toHaveBeenCalledWith('merge');
      expect(r.tutorial.script.has('merge')).toBe(false);
      expect(r.tutorial.topic).not.toBe('merge');
    });

    it("leaves a cat the player selected selected (the chips' lesson used to close its sheet again and again)", () => {
      const r = rig();
      reachLesson(r, 'classes');
      r.run(HOLD_LIMIT + 2);
      expect(r.tutorial.script.relaxed).toBe(true);
      r.select.mockClear();
      r.selected.cell = 12;
      r.run(1);
      expect(r.select).not.toHaveBeenCalled();
      expect(r.selected.cell).toBe(12);
    });

    it('is not waited for in one stretch of 25 seconds for three summons: every summon starts the wait over', () => {
      const r = rig();
      r.frame();
      for (let i = 0; i < 3; i++) {
        r.run(HOLD_LIMIT - 5);
        expect(r.tutorial.script.relaxed, `before summon ${i + 1}`).toBe(false);
        r.sim.summon();
        r.frame();
      }
    });
  });

  describe("the player's own pause", () => {
    it("does not count as waiting for a lesson, and the lesson's note gives way while the menu is open", () => {
      const r = rig();
      toMergeLesson(r);
      r.env.userPause = true;
      r.reasons.add('user');
      r.run(HOLD_LIMIT + 10);
      expect(r.tutorial.script.relaxed).toBe(false);
      expect(r.note().visible).toBe(false);
      r.env.userPause = false;
      r.reasons.delete('user');
      r.run(1);
      expect(r.note().visible).toBe(true);
      expect(r.tutorial.script.relaxed).toBe(false);
    });
  });

  describe("the player's own pause over a timed note", () => {
    /** The synergy note (4.5 seconds, read by the real clock) is up, as it is when a pick of three gave a synergy. */
    function withSynergyNote(): Rig {
      const keep = new TutorialKeep();
      const taught = new Set<TopicId>(STEP_IDS.slice(0, STEP_IDS.indexOf('synergy')));
      const script = new TutorialScript(taught);
      keep.script = script;
      script.update(world({ wave: 3, maxTier: 1, laserReady: false }), 0.1, false);
      expect(script.active?.id).toBe('synergy');
      return rig({ keep, taught: [...taught] });
    }

    it('does not run out under the menu: the note is still there to be read when the menu closes', () => {
      const r = withSynergyNote();
      r.run(1);
      expect(r.tutorial.topic).toBe('synergy');
      r.env.userPause = true;
      r.reasons.add('user');
      r.run(12);
      expect(r.tutorial.topic).toBe('synergy');
      expect(r.taught.has('synergy')).toBe(false);
      r.env.userPause = false;
      r.reasons.delete('user');
      r.run(1);
      expect(r.tutorial.topic).toBe('synergy');
      r.run(5);
      expect(r.taught.has('synergy')).toBe(true);
    });
  });

  describe('a tap on the dim round the lit window', () => {
    it('shakes the note, so the game does not look frozen', () => {
      const r = rig();
      toMergeLesson(r);
      const blockers = (r.tutorial as unknown as { blockers: Container[] }).blockers;
      expect(blockers.some((b) => b.visible)).toBe(true);
      const before = r.note().shakes;
      (blockers.find((b) => b.visible) as Container).emit('pointerdown', {} as never);
      expect(r.note().shakes).toBe(before + 1);
    });
  });

  describe('the beat after the last summon', () => {
    it('keeps the clock running for the new kitten to pop in, before the next lesson holds it', () => {
      const r = rig();
      r.frame();
      for (let i = 0; i < 3; i++) {
        r.sim.summon();
        r.frame();
      }
      // the third tap ended the first lesson: the clock runs on for the kitten, whatever lesson comes next, for the beat
      for (let i = 0; i < 15; i++) {
        r.frame();
        expect(r.paused(), `frame ${i}`).toBe(false);
      }
      r.run(2);
      expect(r.tutorial.topic).toBe('merge');
      expect(r.paused()).toBe(true);
    });
  });

  describe('the nudge', () => {
    it('is laid again beside the summon button when the screen is resized', () => {
      const r = rig({ skipped: true });
      r.run(2);
      const hand = (r.tutorial as unknown as { nudgeHand: { visible: boolean; placed: { x: number; y: number } | null } }).nudgeHand;
      expect(hand.visible).toBe(true);
      const first = hand.placed as { x: number; y: number };
      r.host.rectOf.mockReturnValue({ x: 260, y: 1020, w: 200, h: 100 });
      r.tutorial.resize(r.layout);
      const next = hand.placed as { x: number; y: number };
      expect(next.y).toBeLessThan(first.y - 100);
    });

    it('goes away when the run is decided', () => {
      const r = rig({ skipped: true });
      r.run(2);
      const hand = (r.tutorial as unknown as { nudgeHand: { visible: boolean } }).nudgeHand;
      expect(hand.visible).toBe(true);
      (r.sim as unknown as { phase: string }).phase = 'lost';
      r.frame();
      expect(hand.visible).toBe(false);
    });
  });

  describe('a HUD that is built again (a language switch) in the middle of the lessons', () => {
    it('goes on with the lesson that was up and does not teach the ones already given up on again', () => {
      const keep = new TutorialKeep();
      const first = rig({ keep });
      toMergeLesson(first);
      first.run(HOLD_LIMIT + RELAXED_PATIENCE + 3);
      expect(first.tutorial.script.has('merge')).toBe(false);
      const topic = first.tutorial.topic;
      first.tutorial.destroy();
      const second = rig({ keep, sim: first.sim });
      expect(second.tutorial.script).toBe(first.tutorial.script);
      expect(second.tutorial.script.has('merge')).toBe(false);
      expect(second.tutorial.topic).toBe(topic);
      // a plan built from scratch would teach it again
      expect(rig().tutorial.script.has('merge')).toBe(true);
    });

    it('keeps what the player has done: the count of the summon lesson does not start from nothing', () => {
      const keep = new TutorialKeep();
      const first = rig({ keep });
      first.frame();
      first.sim.summon();
      first.sim.summon();
      first.frame();
      first.tutorial.destroy();
      const second = rig({ keep, sim: first.sim });
      second.frame();
      second.sim.summon();
      second.frame();
      // two summons before the switch and one after: the lesson of three is done
      expect(second.tutorial.topic).not.toBe('summon');
    });
  });

  describe('the purr lesson', () => {
    it('counts the purr that is still flying to the counter when the lesson begins, so the counter does not read nought under the note', () => {
      const keep = new TutorialKeep();
      const taught = new Set<TopicId>(STEP_IDS.slice(0, STEP_IDS.indexOf('purr')));
      keep.script = new TutorialScript(taught);
      const r = rig({ keep, taught: [...taught] });
      (r.tutorial as unknown as { bump(key: string): void }).bump('purrGain');
      r.frame();
      r.frame();
      expect(r.tutorial.topic).toBe('purr');
      expect(r.host.settlePurr).toHaveBeenCalledTimes(1);
    });
  });

  describe('a lesson that is given up on without ever beginning', () => {
    it('leaves what is on screen alone: the nudge that is up is not put away with it', () => {
      const r = rig({ skipped: true });
      r.run(2);
      const hand = (r.tutorial as unknown as { nudgeHand: { visible: boolean } }).nudgeHand;
      expect(hand.visible).toBe(true);
      const laser = STEPS.find((step) => step.id === 'laser') as StepDef;
      r.host.pulse.mockClear();
      (r.tutorial as unknown as { handle(e: unknown): void }).handle({ kind: 'drop', step: laser });
      expect(r.host.pulse).not.toHaveBeenCalledWith(false);
      expect(r.giveUp).toHaveBeenCalledWith('laser');
    });
  });

  describe('the laser lesson and its guide', () => {
    /** A script that has the laser lesson up, as it is when the elite wave begins. */
    function withLaserLesson(): Rig {
      const keep = new TutorialKeep();
      const taught = new Set<TopicId>(STEP_IDS.slice(0, STEP_IDS.indexOf('laser')));
      const script = new TutorialScript(taught);
      keep.script = script;
      script.update(world({ wave: 3, enemies: 3 }), 0.1, false);
      expect(script.active?.id).toBe('laser');
      return rig({ keep, taught: [...taught] });
    }

    it('arms the guide again when a rebuilt HUD picks the lesson up', () => {
      const r = withLaserLesson();
      r.tutorial.resume();
      expect(r.host.startLaserGuide).toHaveBeenCalled();
    });

    it('ends the guide with the lesson when the lesson is given up on, and hands the topic back', () => {
      const r = withLaserLesson();
      r.tutorial.script.relax();
      r.run(RELAXED_PATIENCE + 3);
      expect(r.tutorial.topic).not.toBe('laser');
      expect(r.host.endLaserGuide).toHaveBeenCalledWith(false);
      expect(r.giveUp).toHaveBeenCalledWith('laser');
    });
  });
});
