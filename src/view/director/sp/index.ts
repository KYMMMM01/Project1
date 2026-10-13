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
 * THE VIEW FAILS ALONE. The simulation emits `spCast` in the middle of a rule (after the gauge is spent, before the damage), and an emitter does not
 * catch: a throw in a picture (a missing texture, a canvas that is not there, a payload a later skill brings) would unwind through `Sim.tick` and
 * leave the cast half done. So every call into a scene or the intro is guarded here: the error is logged (`console.error`, which
 * `window.__errors` records), and a scene that threw is switched off for the rest of the battle.
 */
import { debugExpose } from '@/core/debug';
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
  for (const id of Object.keys(SCENES) as SpSkillName[]) {
    const make = SCENES[id] as SpSceneFactory<SpSkillName> | undefined;
    if (make) scenes[id] = make(env);
  }
  const list = Object.values(scenes) as SpScene<SpSkillName>[];

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
  /** The scene of a skill when it exists and has not broken. */
  const sceneOf = (id: SpSkillName): SpScene<SpSkillName> | undefined => {
    const s = scenes[id];
    return s && !broken.has(s) ? s : undefined;
  };

  on('spCast', (e: SpCastEvent) => {
    // A skill with no scene (its data is in before its picture is) takes no slot of the stage rule and shows no effect.
    const scene = sceneOf(e.skill);
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
    debugExpose('spStage', null);
  });
  debugExpose('spStage', {
    stats: () => ({ shown: rule.shown, lost: rule.lost, runs: runs.size, broken: broken.size }),
    scenes,
    rule,
    intro,
  });
  return { rule, intro, scenes };
}
