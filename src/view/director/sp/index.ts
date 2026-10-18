/**
 * The skills' staging: the director's one module for `spCast` and its follow-up events. It
 *   1. asks the stage rule (`stageRule.ts`) whether the cast's effect may show (a cast that loses shows only the ring flash, which the field
 *      draws for every cast),
 *   2. draws the name bubble and the rank 5 cut-in on the first cast of a skill (`intro.ts`; exempt from the rule),
 *   3. hands the cast and its follow-up events to the scene module of the skill (`scenes.ts`: `shove.ts` and the ones the next agents add),
 *   4. gives every scene its frame (`update`) with the real and the battle seconds, and cuts everything off on victory, on defeat (except a run
 *      the simulation carries on after a revive: `survivesDefeat`) and when the director goes.
 * Mounted only when the battle plays with skills (`BattleApi.spOn`): with them off nothing here exists and no listener is added.
 *
 * SCENES ARE BUILT ON THEIR SKILL'S FIRST CAST, not at battle start (twelve of them would put their layers, pools and listeners on every
 * board, though most boards never cast half of the skills). The first cast of a skill in a battle is the one the stage rule never drops (`SpCastEvent.first`,
 * counted per simulation, and a director belongs to exactly one), so the cast that builds a scene is also the cast that is shown to it: a scene
 * that listens to `spCast` itself (the ninja's, to seat clones whose cast lost) has not subscribed yet when that very event is delivered, and does
 * not need to. Follow-up events (`spRunHit`, `bite`, a scene's own `cutOpen`...) only ever follow a cast, so they never find a scene missing.
 * The scenes made so far are `scenes` (what the QA hook and the tests read); a scene's factory that throws is logged and that skill shows no
 * picture for the rest of the battle (its ring, bubble and cut-in are not affected).
 *
 * THE VIEW FAILS ALONE. The simulation emits `spCast` in the middle of a rule (after the gauge is spent, before the damage), and an emitter does not
 * catch: a throw in a picture (a missing texture, a canvas that is not there, a payload a later skill brings) would unwind through `Sim.tick` and
 * leave the cast half done. So every call into a scene or the intro is guarded here: the error is logged (`console.error`, which
 * `window.__errors` records), and a scene that threw is switched off for the rest of the battle.
 */
import { debugExpose } from '@/core/debug';
import { clearRingHolds } from '../../field/ringHold';
import type { SpCastEvent } from '@/game';
import type { Bus, Stage } from '../stage';
import { SpIntro } from './intro';
import { SCENES } from './scenes';
import { StageRule } from './stageRule';
import type { SpEnv, SpScene, SpSceneFactory, SpSkillName } from './types';

type SceneMap = Partial<Record<SpSkillName, SpScene<SpSkillName>>>;

/** What `mountSp` gives back: the pieces a test or a QA hook may look at. */
export interface SpStaging {
  rule: StageRule;
  intro: SpIntro;
  /** The scenes MADE so far (a skill's scene is built on its first cast): empty at mount. */
  scenes: SceneMap;
}

export function mountSp(stage: Stage, on: Bus): SpStaging | null {
  const ctx = stage.ctx;
  const battle = ctx.battle;
  if (!battle.spOn) return null;

  const env: SpEnv = { stage, ctx, battle };
  const rule = new StageRule();
  const intro = new SpIntro(env);
  const scenes: SceneMap = {};
  /** The scenes in the order they were made: what `update` and `clear` walk. */
  const list: SpScene<SpSkillName>[] = [];
  /** Skills whose scene factory threw: no second try in this battle. */
  const failed = new Set<SpSkillName>();

  /** Runs whose cast was shown: the follow-up events of a run whose cast lost are dropped. */
  const runs = new Set<number>();
  /** Whether the last gunner shot was shown (its `bite` event follows it with no id of its own). */
  let wantedShown = false;
  let last = battle.time;

  /** Scenes that threw: off for the rest of the battle (they are still cleared and destroyed). */
  const broken = new Set<SpScene<SpSkillName>>();
  const guarded = (what: string, fn: () => void, scene?: SpScene<SpSkillName>): void => {
    try {
      fn();
    } catch (err) {
      console.error(`[skills] ${what} failed`, err);
      if (scene && !broken.has(scene)) {
        broken.add(scene);
        try {
          scene.clear();
        } catch {
          // Already broken: nothing more can be done for it.
        }
      }
    }
  };
  /** The scene of a skill when it has been made and has not broken (it never makes one: the follow-up events of a cast find the scene the cast made). */
  const sceneOf = (id: SpSkillName): SpScene<SpSkillName> | undefined => {
    const s = scenes[id];
    return s && !broken.has(s) ? s : undefined;
  };
  /** The scene of a skill, made now if this is its first cast. A skill with no registry entry (or a factory that threw) has none. */
  const sceneFor = (id: SpSkillName): SpScene<SpSkillName> | undefined => {
    if (!scenes[id] && !failed.has(id)) {
      const make = SCENES[id] as SpSceneFactory<SpSkillName> | undefined;
      if (make) {
        try {
          const s = make(env);
          scenes[id] = s;
          list.push(s);
        } catch (err) {
          failed.add(id);
          console.error(`[skills] ${id} scene failed to start`, err);
        }
      }
    }
    return sceneOf(id);
  };

  on('spCast', (e: SpCastEvent) => {
    // A skill with no scene (its data is in before its picture is) takes no slot of the stage rule and shows no effect. The first cast of a
    // skill builds its scene, whether or not the stage rule then lets this cast show (the first one always does).
    const scene = sceneFor(e.skill);
    const show = scene !== undefined && rule.admit(stage.now, e.first);
    if (e.first) guarded('intro', () => intro.first(e));
    if (e.skill === 'wanted') wantedShown = show;
    if (!scene || !show) return;
    const run = (e.data as { runId?: number }).runId;
    if (run !== undefined) runs.add(run);
    guarded(`${e.skill} cast`, () => scene.cast(e), scene);
  });
  on('spRunHit', (e) => {
    const scene = sceneOf(e.skill);
    if (scene && runs.has(e.runId)) guarded(`${e.skill} run`, () => scene.runHit?.(e), scene);
  });
  on('spRunBurst', (e) => {
    const scene = sceneOf(e.skill);
    if (scene && runs.has(e.runId)) guarded(`${e.skill} burst`, () => scene.runBurst?.(e), scene);
  });
  on('spRunEnd', (e) => {
    if (!runs.delete(e.runId)) return;
    const scene = sceneOf(e.skill);
    if (scene) guarded(`${e.skill} run end`, () => scene.runEnd?.(e), scene);
  });
  on('bite', (e) => {
    const scene = sceneOf('wanted');
    if (wantedShown && scene) guarded('wanted bite', () => scene.bite?.(e), scene);
  });

  const clearScene = (s: SpScene<SpSkillName>): void => guarded('clear', () => s.clear(), s);
  const clear = (): void => {
    runs.clear();
    wantedShown = false;
    guarded('intro clear', () => intro.clear());
    for (const s of list) clearScene(s);
  };
  on('victory', clear);
  // A defeat clears what is short and local, but not a run in flight (a body on the road): the simulation freezes its run at the defeat and
  // carries it on after a revive, and every picture is timed by the battle's clock, which stands still meanwhile, so the picture freezes with
  // it and goes on. (The run ids stay, so the events that follow a revive still find their scene.)
  on('defeat', () => {
    wantedShown = false;
    guarded('intro clear', () => intro.clear());
    for (const s of list) if (!s.survivesDefeat) clearScene(s);
  });

  stage.addFrame((dt) => {
    const now = battle.time;
    const battleDt = Math.max(0, now - last);
    last = now;
    guarded('intro update', () => intro.update(dt, battleDt));
    for (const s of list) if (!broken.has(s)) guarded('scene update', () => s.update?.(dt, battleDt), s);
  });
  stage.onDestroy(() => {
    clear();
    for (const s of list) guarded('destroy', () => s.destroy());
    guarded('intro destroy', () => intro.destroy());
    // The gauge a ring shows in place of the cat's own is module state keyed by a unit's uid, and the next battle numbers its units from 1 again: a
    // hold a scene failed to let go of must not outlive its battle and show a stranger's gauge on a cat of the next one.
    clearRingHolds();
    debugExpose('spStage', null);
  });
  debugExpose('spStage', {
    stats: () => ({ shown: rule.shown, lost: rule.lost, runs: runs.size, broken: broken.size, made: list.length }),
    scenes,
    rule,
    intro,
  });
  return { rule, intro, scenes };
}
