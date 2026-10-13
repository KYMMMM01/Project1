/**
 * What a skill's scene is and what it is given. One scene module per skill (`shove.ts` and the files the next agents add beside it) holds
 * that skill's picture; the dispatcher in `index.ts` decides whether the stage rule lets a cast show, and passes on the cast and its
 * follow-up events (`spRunHit`, `spRunBurst`, `spRunEnd`, `bite`) to the scene of the skill they belong to.
 */
import type { BattleApi, BattleEvents, SpCastEvent, SpPayload } from '@/game';
import type { BattleContext } from '../../context';
import type { Stage } from '../stage';

export type SpSkillName = SpPayload['skill'];

/** The label of the star archer's night sheet (the first child of the front layer while the scene exists): what is drawn over the board but must not be dimmed by it (a poster, a cork) goes just above it. */
export const NIGHT_LABEL = 'sp-night';

/** The cast event of one skill, its payload narrowed. */
export type SpCastOf<K extends SpSkillName> = Extract<SpCastEvent, { skill: K }>;

/** What every scene is given: the director's stage (sound, shake, particles through `stage.fx`), the battle and its clock. */
export interface SpEnv {
  readonly stage: Stage;
  readonly ctx: BattleContext;
  readonly battle: BattleApi;
}

/**
 * One skill's scene. Only the stage rule's admitted casts reach `cast`; the follow-up events reach the scene only for a cast that was
 * admitted (a run whose cast lost shows nothing). Everything a scene makes lives on `ctx.layers` or in `stage.fx`, is timed by the battle's
 * clock (see `span.ts`), is pooled or small, and is gone after `clear`.
 */
export interface SpScene<K extends SpSkillName> {
  /** The cast: the picture starts. Called after the simulation's own events of the tick that cast, before the hits of that cast. */
  cast(e: SpCastOf<K>): void;
  /** The follow-up events of the skills that have them. */
  runHit?(e: BattleEvents['spRunHit']): void;
  runBurst?(e: BattleEvents['spRunBurst']): void;
  runEnd?(e: BattleEvents['spRunEnd']): void;
  bite?(e: BattleEvents['bite']): void;
  /** Once a frame: `dt` real seconds and `battleDt` seconds of the battle's clock (0 while it stands still). */
  update?(dt: number, battleDt: number): void;
  /** Victory, defeat or the end of the battle: cut everything off. The scene may be used again after (a revive). */
  clear(): void;
  /**
   * A scene with a run in flight (a body on the road) that the simulation carries on after a revive: a defeat does not `clear` it (its pictures
   * are timed by the battle's clock, which stands still, so they freeze with the run and go on); victory and the end of the battle do.
   */
  readonly survivesDefeat?: boolean;
  /** The director is going: free what `clear` kept (pools, textures a scene made). */
  destroy(): void;
}

export type SpSceneFactory<K extends SpSkillName> = (env: SpEnv) => SpScene<K>;
