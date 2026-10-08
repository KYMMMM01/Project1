import { Container } from 'pixi.js';
import { Fx } from '@/fx';
import { BOARD_H, BOARD_W, BOARD_X, BOARD_Y, CELL_COUNT } from '@/game/geometry';
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
import { LaserView } from './laser';
import { DragPreview } from './preview';
import { Projectiles } from './projectiles';
import { buildRug, RUG_X, RUG_Y } from './rug';
import { rugSkin } from './rugSkins';
import { SunNote } from './sunNote';
import { UnitViews } from './units';
import { FieldWarmup } from './warmup';
import { buildWalkway } from './walkway';
import { WeaponMarks } from './weaponMarks';

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
  const preview = new DragPreview(env, layers.floor, layers.projectiles);
  // Field space, above the HUD (the overlay layer, under the director's banners): where a cat is shown while it is held over the sell strip.
  const lift = new Container();
  lift.label = 'field-lift';
  lift.eventMode = 'none';
  lift.position.set(ctx.layout.fieldX, ctx.layout.fieldY);
  layers.overlay.addChild(lift);
  const units = new UnitViews(env, layers.units, lift);
  const enemies = new EnemyViews(env, layers.enemies);
  const spares = new FieldWarmup(battle, enemies, ground);
  const shots = new Projectiles(env, layers.projectiles);
  const effects = new FieldEffects(env, enemies, shots);
  // What the weapons leave on the field (swing arcs, stuck arrows, splats ...): over the cats and enemies, under the numbers.
  const marks = new WeaponMarks(env, layers.fxFront);
  const input = new FieldInput(env, layers.floor, layers.zones, layers.projectiles, units, cells);
  const sunNote = new SunNote(env, layers.fxFront);
  // The lit lane goes on the ground effects' layer (under the enemies and cats); the dot's tag over the cats.
  const laser = new LaserView(env, layers.zones, layers.fxFront);
  input.onEmptyTap = (cell) => {
    if (sunNote.lit(cell)) sunNote.show(cell);
  };
  /** Numbers stand between the HUD's lower edge and the bottom panel, an 8 px margin in from the screen's sides, and off the board (a cat's name tags are the cells' lower edge). */
  const NUMBER_SIDE = 8;
  const BOARD_INSET = 6;
  const clampNumbers = (layout: BattleLayout): void => {
    const area = ctx.fx.numbers.area;
    area.minY = layout.safeTop + layout.topH - layout.fieldY;
    area.maxY = layout.h - layout.safeBottom - layout.bottomH - layout.fieldY;
    area.minX = NUMBER_SIDE - layout.fieldX;
    area.maxX = layout.w - NUMBER_SIDE - layout.fieldX;
    area.keepX0 = BOARD_X + BOARD_INSET;
    area.keepY0 = BOARD_Y + BOARD_INSET;
    area.keepX1 = BOARD_X + BOARD_W - BOARD_INSET;
    area.keepY1 = BOARD_Y + BOARD_H - BOARD_INSET;
  };
  clampNumbers(ctx.layout);
  const offRefused = ctx.events.on('refused', (e) => {
    if (e.cell !== null) units.refuse(e.cell);
  });

  function updateCells(dt: number): void {
    const dragging = input.dragFrom !== null;
    const source = input.dragFrom ?? ctx.selected;
    for (let c = 0; c < CELL_COUNT; c++) {
      let look: CellLook = null;
      if (source !== null) {
        look = c === source ? (dragging ? 'origin' : 'selected') : dropLook(battle.dropAction(source, c));
        // Tap-tap only moves and merges (a tap on another cat selects it), so a swap shows no cue until the cat is dragged.
        if (!dragging) look = look === 'move' ? 'pick' : look === 'swap' ? null : look;
      }
      cells.set(c, look, dragging && input.hover === c);
    }
    const held = input.dragFrom ?? -1;
    const over = input.hover;
    preview.update(dt, held, over, held >= 0 && over >= 0 && over !== held ? battle.dropAction(held, over) : null);
  }

  return {
    update(dt: number): void {
      if (!ctx.paused) env.time += dt;
      // A selection whose cat has left (merged away, sold) is dropped.
      if (ctx.selected !== null && (battle.units[ctx.selected] ?? null) === null) ctx.select(null);
      units.update(dt, ctx.selected);
      enemies.update(dt);
      shots.update();
      effects.update(dt);
      marks.update(dt);
      input.update(dt);
      updateCells(dt);
      cells.update(dt, env.time);
      laser.update(dt, env.time);
      ground.update(dt);
      spares.update(dt);
    },
    resize(layout: BattleLayout): void {
      lift.position.set(layout.fieldX, layout.fieldY);
      clampNumbers(layout);
      background.resize(layout);
    },
    destroy(): void {
      offRefused();
      input.destroy();
      sunNote.destroy();
      laser.destroy();
      effects.destroy();
      marks.destroy();
      shots.destroy();
      enemies.destroy();
      units.destroy();
      lift.destroy({ children: true });
      preview.destroy();
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
