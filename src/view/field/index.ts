import { Fx } from '@/fx';
import { CELL_COUNT } from '@/game/geometry';
import type { BattleContext, BattleLayout, FieldPart } from '../context';
import '../strings';
import { fieldArt } from './art';
import { Background } from './background';
import { CellLayer, type CellLook } from './cells';
import { FieldEffects } from './effects';
import { EnemyViews } from './enemies';
import type { FieldEnv } from './env';
import { FieldInput } from './input';
import { dropLook } from './policy';
import { Projectiles } from './projectiles';
import { buildRug, RUG_X, RUG_Y } from './rug';
import { rugSkin } from './rugSkins';
import { UnitViews } from './units';
import { buildWalkway } from './walkway';

/**
 * The playfield: background, mat, cells, walkway, cats, enemies, shots and ground effects, and the
 * pointer handling that moves cats around. It reads the simulation every frame and listens to its
 * events only for flourishes, so it never drifts from the real state.
 */
export function createField(ctx: BattleContext): FieldPart {
  const { layers, battle } = ctx;
  const art = fieldArt();
  // Ground effects sit under the characters; the context's own Fx draws over them.
  const ground = new Fx(layers.zones, ctx.tweens);
  const env: FieldEnv = { ctx, battle, art, ground, time: 0 };

  const background = new Background(layers.background, ctx.run.init.chapter);
  background.resize(ctx.layout);
  const walkway = buildWalkway();
  const rug = buildRug(rugSkin(ctx.run.rugSkin));
  rug.position.set(RUG_X, RUG_Y);
  layers.floor.addChild(walkway, rug);

  const cells = new CellLayer(layers.floor, layers.projectiles, art);
  const units = new UnitViews(env, layers.units);
  const enemies = new EnemyViews(env, layers.enemies);
  const shots = new Projectiles(env, layers.projectiles);
  const effects = new FieldEffects(env);
  const input = new FieldInput(env, layers.floor, layers.zones, layers.projectiles, units, cells);
  const offRefused = ctx.events.on('refused', (e) => {
    if (e.cell !== null) units.refuse(e.cell);
  });

  function updateCells(): void {
    const dragging = input.dragFrom !== null;
    const source = input.dragFrom ?? ctx.selected;
    for (let c = 0; c < CELL_COUNT; c++) {
      const occupied = (battle.units[c] ?? null) !== null;
      let look: CellLook = null;
      let color = 0xffffff;
      if (source !== null) {
        if (c === source) {
          look = 'selected';
        } else {
          look = dropLook(battle.dropAction(source, c));
          if (look === 'merge') color = units.mergeColor(c);
        }
      }
      cells.set(c, look, occupied, color, dragging && input.hover === c);
    }
  }

  return {
    update(dt: number): void {
      if (!ctx.paused) env.time += dt;
      // A selection whose cat has left (merged away, sold) is dropped.
      if (ctx.selected !== null && (battle.units[ctx.selected] ?? null) === null) ctx.select(null);
      units.update(dt, ctx.selected);
      enemies.update(dt);
      shots.update();
      effects.update();
      input.update(dt);
      updateCells();
      cells.update(dt, env.time);
      ground.update(dt);
    },
    resize(layout: BattleLayout): void {
      background.resize(layout);
    },
    destroy(): void {
      offRefused();
      input.destroy();
      effects.destroy();
      shots.destroy();
      enemies.destroy();
      units.destroy();
      cells.destroy();
      for (const c of [walkway, rug]) {
        layers.floor.removeChild(c);
        c.destroy({ children: true });
      }
      background.destroy();
      ground.destroy();
    },
    unitView: (uid: number) => units.get(uid)?.root ?? null,
    enemyView: (uid: number) => enemies.get(uid)?.root ?? null,
  };
}
