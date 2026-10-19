/**
 * The tutorial run as a lesson plan, with no display objects in it: which topic is taught when, which control or board
 * feature arrives with it, what the player has to do once for real, and when a lesson gives up so nothing ever blocks a
 * player who ignores it. `TutorialScript.update` is fed a plain snapshot of the battle every frame and answers with
 * what began, what was done and what was dropped; the view (Tutorial.ts) turns those into spotlights, hands and notes.
 */
import type { BattlePhase, WaveKind } from '@/game';
import type { TopicId } from '@/guide';
import type { RevealKey } from './policy';


/**
 * What a lesson points at. `cat` is a cat to tap (a popup lesson's placeholder), `weakcat` the weakest cat on the board (what a molt or a
 * sale costs least on), `king` the cat that can awaken now, `pair` the two twins, `ring` the skill ring of the cat whose ring is nearly full, the rest
 * are controls or board features.
 */
export type Target =
  | 'summon' | 'pair' | 'gauge' | 'chips' | 'wave' | 'sun' | 'laser' | 'bossbar' | 'purr' | 'cat' | 'weakcat' | 'king' | 'molt' | 'awaken' | 'grade'
  | 'call' | 'speed' | 'sell' | 'ring';

/** Things the player did since the run began; a step is done when its own counter has moved. */
export type CountKey =
  | 'summon' | 'merge' | 'molt' | 'sell' | 'gradeUp' | 'classUp' | 'call' | 'speed' | 'relic' | 'pick' | 'sheetClose' | 'sunMove' | 'purrGain' | 'awaken';

export type Counts = Readonly<Record<CountKey, number>>;

export function emptyCounts(): Record<CountKey, number> {
  return { summon: 0, merge: 0, molt: 0, sell: 0, gradeUp: 0, classUp: 0, call: 0, speed: 0, relic: 0, pick: 0, sheetClose: 0, sunMove: 0, purrGain: 0, awaken: 0 };
}

/** The battle as the script sees it. */
export interface World {
  phase: BattlePhase;
  wave: number;
  waveKind: WaveKind;
  pending: null | 'summon' | 'relic';
  /** A popup or a full screen is open. */
  busy: boolean;
  cats: number;
  empties: number;
  twins: boolean;
  enemies: number;
  /** An elite or a boss is on the field. */
  targetAlive: boolean;
  fish: number;
  purr: number;
  moltCost: number;
  /** Cost of the next summon-grade step, or -1 when there is none. */
  gradeCost: number;
  /** Cost of the cheapest class upgrade, or -1 when there is none. */
  classCost: number;
  /** The most different cats any class has on the board. */
  maxTier: number;
  sun: number;
  laserReady: boolean;
  /** The laser's own guided first use has been done. */
  laserGuided: boolean;
  /** The guided first use is at a step that waits for the player's touch (the button, then the lane): the clock stands still for it, and runs again for the marks. */
  laserHold: boolean;
  callBonus: number;
  /** A cat is selected. */
  selected: boolean;
  /** A king stands on the board that can awaken right now (a legendary, its class at the synergy step the awakening asks for, enough purr). */
  king: boolean;
  /** The selected cat is that king. */
  kingSelected: boolean;
  /** A cat's skill ring is nearly full (`RING_NEAR`) in a battle that plays with skills. */
  ringNear: boolean;
  counts: Counts;
}

export interface StepDef {
  id: TopicId;
  /** Controls that arrive with the lesson. */
  reveal: readonly RevealKey[];
  /** True when the lesson may begin. */
  when(w: World): boolean;
  target(w: World): Target;
  /** True once the player has done the thing (`since` = the counters when the lesson began). */
  done(w: World, since: Counts): boolean;
  /**
   * The clock is held while the lesson waits for the player: no enemy moves, no timer or income runs, and the field still takes the player's
   * gesture (`BattleContext.lessonHold`). A lesson that holds is let go of after `HOLD_LIMIT` seconds, unless it is a read-only note.
   */
  holds(w: World): boolean;
  /** A read-only lesson: it shows a "got it" button and ends when it is tapped. */
  ok: boolean;
  /** A lesson without an action ends by itself after this many seconds (a cheerful note); one that holds the clock counts them by the real clock. */
  timed: number;
  /** Game seconds of waiting (the clock held does not count) after which the lesson is dropped, not taught. */
  patience: number;
  /** From this wave on the lesson's moment has passed. */
  staleAt: number;
  /** A popup carries the lesson itself (the pick of three, the toy choice). */
  popup: boolean;
  /** Its moment is short and does not wait: it cuts in on the lesson in progress, which is dropped (the elite and the boss arrive once). */
  urgent: boolean;
  /** The lesson is about the cats' skills: it is in the plan only for a battle that plays with them (`stepsFor`), so a battle without them is taught exactly as it always was. */
  skill: boolean;
  /**
   * True (the usual case) when a lesson whose moment has not come yet lets the lessons behind it begin first. False for the lessons that open the run in a fixed order
   * (the summons, the merge, the gauge, the classes, the acts, the pick of three and the skill ring): the ones behind them wait for them, as they always did.
   */
  defer: boolean;
}

const calm = (w: World): boolean => !w.busy && w.pending === null && (w.phase === 'wave' || w.phase === 'prep');
const never = Infinity;
const since = (key: CountKey) => (w: World, from: Counts): boolean => w.counts[key] > from[key];

function step(def: Partial<StepDef> & Pick<StepDef, 'id' | 'when' | 'target' | 'done'>): StepDef {
  return { reveal: [], holds: () => false, ok: false, timed: 0, patience: never, staleAt: never, popup: false, urgent: false, skill: false, defer: true, ...def };
}

/** A lesson that has held the clock for this long (real seconds) lets go of it and waits this many more game seconds before it is dropped. */
export const HOLD_LIMIT = 25;
export const RELAXED_PATIENCE = 20;

/** Summons the first lesson asks for. */
export const TUTORIAL_SUMMONS = 3;

/**
 * In the order they are taught. The opening lessons (`defer: false`) begin only when the one before them is over (done, or dropped). From the skill ring on, a lesson
 * whose moment has not come does not hold up the ones behind it: what the player's own choices decide (a class pick that gives no synergy yet, a sun cell that has not
 * come) must never keep the elite, the toys and the upgrades from being taught.
 */
export const STEPS: readonly StepDef[] = [
  step({
    id: 'summon', defer: false, when: () => true, target: () => 'summon', done: (w, from) => w.counts.summon - from.summon >= TUTORIAL_SUMMONS, holds: () => true,
  }),
  step({
    id: 'merge', defer: false, when: (w) => calm(w) && w.twins, target: () => 'pair', done: since('merge'), holds: () => true, patience: 45, staleAt: 3,
  }),
  step({
    id: 'lose_gauge', defer: false, when: (w) => calm(w) && w.phase === 'wave' && w.enemies >= 2, target: () => 'gauge', done: () => false, holds: () => true, ok: true, staleAt: 3,
  }),
  step({
    id: 'classes', defer: false, reveal: ['chips'], when: (w) => calm(w) && w.phase === 'wave', target: () => 'chips', done: since('sheetClose'), holds: () => true, staleAt: 3,
  }),
  step({
    id: 'acts', defer: false, reveal: ['preview'], when: (w) => calm(w) && w.wave >= 2, target: () => 'wave', done: () => false, holds: () => true, ok: true, staleAt: 3,
  }),
  step({
    id: 'pick3', defer: false, reveal: ['tracker'], when: (w) => w.pending === 'summon', target: () => 'cat', done: since('pick'), popup: true,
  }),
  // The cats' skills (docs/qa/directive_2026-10-13_skills_build.md, decision 29): the pick of three has just given an Alley Boss, whose ring starts half full, so the ring
  // is nearly full 0.2 of its cooldown (2.4 to 3.6 s) into the wave. A read-only note on that ring, holding the clock like the other notes. It comes before the lessons after
  // it, which wait those few seconds, and its moment is wave 3 alone: from wave 4 on (the elite's wave) it is dropped, so it can never keep a later lesson waiting
  // (a lesson that waits for its moment holds up every lesson behind it) when the ring never got there (the cat was sold at once).
  step({
    id: 'sp_skill', defer: false, when: (w) => calm(w) && w.ringNear, target: () => 'ring', done: () => false, holds: () => true, ok: true, staleAt: 4, skill: true,
  }),
  step({
    id: 'synergy', when: (w) => calm(w) && w.maxTier >= 1, target: () => 'chips', done: () => false, holds: () => true, timed: 4.5, staleAt: 7,
  }),
  step({
    id: 'sun', when: (w) => calm(w) && w.sun > 0 && w.phase === 'wave', target: () => 'sun', done: since('sunMove'), holds: () => true, patience: 40, staleAt: 6,
  }),
  step({
    id: 'laser', reveal: ['laser'], when: (w) => calm(w) && w.phase === 'wave' && w.enemies >= 2 && w.laserReady, target: () => 'laser',
    done: (w) => w.laserGuided, holds: (w) => w.laserHold, patience: 40, staleAt: 6,
  }),
  step({
    id: 'elite', when: (w) => !w.busy && w.waveKind === 'elite' && w.targetAlive, target: () => 'bossbar', done: () => false, holds: () => true, ok: true, staleAt: 5,
    urgent: true,
  }),
  step({
    id: 'purr', reveal: ['purr'], when: (w) => calm(w) && w.counts.purrGain >= 1, target: () => 'purr', done: () => false, holds: () => true, ok: true, staleAt: 7,
  }),
  step({
    id: 'toys', when: (w) => w.pending === 'relic', target: () => 'cat', done: since('relic'), popup: true, staleAt: 6,
  }),
  step({
    id: 'molt', reveal: ['molt'], when: (w) => calm(w) && w.phase === 'wave' && w.wave >= 5 && w.purr >= w.moltCost && w.cats >= 1,
    target: (w) => (w.selected ? 'molt' : 'weakcat'), done: since('molt'), holds: () => true, patience: 45, staleAt: 9,
  }),
  step({
    id: 'summon_grade', reveal: ['gradeUpgrade', 'odds'], when: (w) => calm(w) && w.wave >= 5 && w.gradeCost >= 0 && w.fish >= w.gradeCost,
    target: () => 'grade', done: since('gradeUp'), holds: () => true, staleAt: 9,
  }),
  step({
    id: 'class_upgrade', reveal: ['classUpgrade'], when: (w) => calm(w) && w.wave >= 5 && w.classCost >= 0 && w.fish >= w.classCost,
    target: () => 'chips', done: since('classUp'), holds: () => true, staleAt: 9,
  }),
  step({
    id: 'call_wave', reveal: ['callWave'], when: (w) => calm(w) && w.wave >= 5 && w.callBonus >= 1, target: () => 'call', done: since('call'), holds: () => true, staleAt: 9,
  }),
  step({
    id: 'speed', reveal: ['speed'], when: (w) => calm(w) && w.wave >= 5, target: () => 'speed', done: since('speed'), holds: () => true, staleAt: 9,
  }),
  step({
    id: 'sell', reveal: ['sellHint'], when: (w) => calm(w) && w.phase === 'wave' && w.wave >= 6 && w.cats >= 2 && (w.empties <= 3 || w.wave >= 7),
    target: (w) => (w.selected ? 'sell' : 'weakcat'), done: since('sell'), holds: () => true, patience: 50, staleAt: 8,
  }),
  step({
    id: 'awaken', reveal: ['awaken'], when: (w) => calm(w) && w.phase === 'wave' && w.king,
    target: (w) => (w.kingSelected ? 'awaken' : 'king'), done: since('awaken'), holds: () => true, patience: 45, staleAt: 8,
  }),
  step({
    id: 'boss', when: (w) => !w.busy && w.waveKind === 'boss' && w.targetAlive, target: () => 'bossbar', done: () => false, holds: () => true, ok: true, urgent: true,
  }),
];

export const STEP_IDS: readonly TopicId[] = STEPS.map((s) => s.id);

/** The lessons a battle is taught: all of them, except the skills' when the battle plays without skills (`BattleApi.spOn`). */
export function stepsFor(skills: boolean): readonly StepDef[] {
  return skills ? STEPS : STEPS.filter((s) => !s.skill);
}

/** Every control a set of already-taught lessons has revealed (a restarted tutorial begins with these in place). */
export function revealedBy(taught: ReadonlySet<TopicId>): RevealKey[] {
  const out: RevealKey[] = [];
  for (const s of STEPS) if (taught.has(s.id)) for (const k of s.reveal) if (!out.includes(k)) out.push(k);
  return out;
}

export type ScriptEvent =
  | { kind: 'begin'; step: StepDef }
  | { kind: 'done'; step: StepDef; how: 'action' | 'ok' | 'timer' }
  /** `again`: an urgent lesson cut in on this one, which is put back and begins again after it (the topic is not given up). */
  | { kind: 'drop'; step: StepDef; again?: boolean };

export class TutorialScript {
  /** What the last `update` produced; reused every frame, so read it before the next call. */
  private readonly events: ScriptEvent[] = [];
  active: StepDef | null = null;
  /** Plan positions of the lessons that are over (done, or given up on); every other lesson of the plan is still to come, whenever its moment brings it. */
  private readonly over = new Set<number>();
  private activeIndex = -1;
  private from: Counts = emptyCounts();
  private clock = 0;
  private okTapped = false;
  private stopped = false;
  private relaxedFlag = false;

  /** Lessons in `taught` are never given again (the run still plays, its controls already out). `steps` is the plan (`stepsFor`). */
  constructor(
    private readonly taught: ReadonlySet<TopicId> = new Set(),
    private readonly steps: readonly StepDef[] = STEPS,
  ) {}

  /** The active lesson has held the clock long enough: it lets go, and gives up after `RELAXED_PATIENCE` more seconds. */
  relax(): void {
    this.relaxedFlag = true;
  }

  get relaxed(): boolean {
    return this.relaxedFlag;
  }

  /** The player pressed "got it" on a read-only lesson. */
  tapOk(): void {
    this.okTapped = true;
  }

  /** The lesson at plan position `i` has not been taught, done or given up on (the active one counts as to come). */
  private toCome(i: number): boolean {
    return !this.over.has(i) && !this.taught.has((this.steps[i] as StepDef).id);
  }

  get finished(): boolean {
    if (this.stopped) return true;
    if (this.active) return false;
    for (let i = 0; i < this.steps.length; i++) if (this.toCome(i)) return false;
    return true;
  }

  /** The lesson is the active one or still to come: the run will still teach it (a popup may say so in its own words). */
  has(topic: TopicId): boolean {
    for (let i = 0; i < this.steps.length; i++) if ((this.steps[i] as StepDef).id === topic) return this.toCome(i);
    return false;
  }

  /** Every lesson still to come (the active one first): what a skip leaves untaught. */
  get remaining(): StepDef[] {
    const out: StepDef[] = this.active ? [this.active] : [];
    for (let i = 0; i < this.steps.length; i++) if (this.toCome(i) && !(this.active && i === this.activeIndex)) out.push(this.steps[i] as StepDef);
    return out;
  }

  /** The lessons stop for good. */
  stop(): StepDef[] {
    const left = this.remaining;
    this.stopped = true;
    this.active = null;
    this.activeIndex = -1;
    return left;
  }

  /** The lessons whose moment has passed are given up on, wherever they stand in the plan. */
  private dropStale(w: World, out: ScriptEvent[]): void {
    for (let i = 0; i < this.steps.length; i++) {
      const s = this.steps[i] as StepDef;
      if (this.toCome(i) && w.wave >= s.staleAt) {
        this.over.add(i);
        out.push({ kind: 'drop', step: s });
      }
    }
  }

  /**
   * The lesson that begins now, or -1. An urgent lesson (the elite, the boss) whose moment is now comes first. Otherwise the first lesson of the plan whose moment has
   * come: the lessons before it that are still waiting for theirs are passed over when they defer (`StepDef.defer`), and hold it up when they do not.
   */
  private nextLesson(w: World): number {
    for (let i = 0; i < this.steps.length; i++) {
      const s = this.steps[i] as StepDef;
      if (s.urgent && this.toCome(i) && s.when(w)) return i;
    }
    for (let i = 0; i < this.steps.length; i++) {
      if (!this.toCome(i)) continue;
      const s = this.steps[i] as StepDef;
      if (s.when(w)) return i;
      if (!s.defer) break;
    }
    return -1;
  }

  /** `held`: the clock is held (a lesson or a popup is waiting), so patience does not run. */
  update(w: World, dt: number, held: boolean): readonly ScriptEvent[] {
    const out = this.events;
    out.length = 0;
    if (this.stopped) return out;
    for (let guard = 0; guard < 3 * this.steps.length + 4; guard++) {
      if (!this.active) {
        this.dropStale(w, out);
        const i = this.nextLesson(w);
        if (i < 0) return out;
        const next = this.steps[i] as StepDef;
        this.active = next;
        this.activeIndex = i;
        this.from = { ...w.counts };
        this.clock = 0;
        this.okTapped = false;
        this.relaxedFlag = false;
        out.push({ kind: 'begin', step: next });
      }
      const s = this.active;
      // An urgent lesson cuts in on the one in progress. That one is put back, not lost: it begins again after the urgent one unless its moment has passed.
      const cut = s.urgent ? -1 : this.urgentAhead(w);
      if (cut >= 0) {
        const again = w.wave < s.staleAt;
        out.push({ kind: 'drop', step: s, again });
        if (!again) this.over.add(this.activeIndex);
        this.active = null;
        this.activeIndex = -1;
        continue;
      }
      if (w.wave >= s.staleAt && !s.popup) {
        out.push({ kind: 'drop', step: s });
        this.finish();
        continue;
      }
      if (s.done(w, this.from)) {
        out.push({ kind: 'done', step: s, how: 'action' });
        this.finish();
        continue;
      }
      if (s.ok && this.okTapped) {
        out.push({ kind: 'done', step: s, how: 'ok' });
        this.finish();
        continue;
      }
      // A timed note that holds the clock counts its seconds by the real clock (the battle clock is the one it holds).
      if (!held && (s.timed > 0 || this.relaxedFlag || !s.holds(w))) this.clock += dt;
      if (s.timed > 0 && this.clock >= s.timed) {
        out.push({ kind: 'done', step: s, how: 'timer' });
        this.finish();
        continue;
      }
      if (this.clock >= (this.relaxedFlag ? Math.min(s.patience, RELAXED_PATIENCE) : s.patience)) {
        out.push({ kind: 'drop', step: s });
        this.finish();
        continue;
      }
      return out;
    }
    return out;
  }

  /** The position of an urgent lesson (other than the active one) whose moment is now, or -1. */
  private urgentAhead(w: World): number {
    for (let i = 0; i < this.steps.length; i++) {
      const s = this.steps[i] as StepDef;
      if (i !== this.activeIndex && s.urgent && this.toCome(i) && w.wave < s.staleAt && s.when(w)) return i;
    }
    return -1;
  }

  /** The active lesson cannot be shown (what it points at never appeared): drop it so the run is never left waiting. */
  abandon(): ScriptEvent | null {
    const s = this.active;
    if (!s) return null;
    this.finish();
    return { kind: 'drop', step: s };
  }

  private finish(): void {
    this.over.add(this.activeIndex);
    this.active = null;
    this.activeIndex = -1;
  }
}
