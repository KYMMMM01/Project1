import type { BattleApi } from '@/game';
import type { Fx } from '@/fx';
import type { BattleContext } from '../context';
import type { FieldArt } from './art';
import type { BuffBoard } from './buffMath';

/** What every part of the playfield shares. */
export interface FieldEnv {
  readonly ctx: BattleContext;
  readonly battle: BattleApi;
  readonly art: FieldArt;
  /** Who helps whom on the board, worked out again at the start of every frame. */
  readonly buffs: BuffBoard;
  /** Effects that live on the ground, under the characters (special cells, hazards, zones). */
  readonly ground: Fx;
  /** Animation clock in seconds: real time, standing still while the battle is paused. */
  time: number;
}
