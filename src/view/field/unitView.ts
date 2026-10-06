import { Container, Sprite } from 'pixi.js';
import { tex } from '@/core/assets';
import { Ease, type Tween, type TweenOpts, type Tweener } from '@/core/tween';
import { clamp, clamp01, damp, lerp, TAU } from '@/core/math';
import { popIn, type ZoneHandle } from '@/fx';
import { cellCenterX, cellCenterY, cellCol } from '@/game/geometry';
import { unitClass, unitRarity } from '@/game';
import type { UnitId, UnitState } from '@/game/api';
import { Color, type RarityId } from '@/ui';
import type { FieldArt } from './art';
import { ATTACK_SECONDS, attackPose, breathe, makePose } from './motion';
import { unitTint } from './policy';

/** Where a unit's feet stand relative to its cell centre: the sprite reaches up from here. */
export const FEET_DY = 34;
const LUNGE_PX = 8;
const UNIT_HEIGHT: Record<RarityId, number> = { common: 92, rare: 94, epic: 96, legendary: 100, mythic: 104 };

/** Scale that puts a cat's art at its rarity's on-board height (also used for the drag preview's ghosts). */
export function unitSpriteScale(id: UnitId, textureHeight: number): number {
  return UNIT_HEIGHT[unitRarity(id)] / Math.max(1, textureHeight);
}

/** How a unit that has left the board is shown on its way out. */
export type ExitMode = 'none' | 'fly' | 'hold' | 'spin' | 'sell' | 'fade';

/**
 * One cat on the rug. Layers, from the outside in: `root` (positioned at the feet; juice and the
 * director may scale / fade / hide it), `rig` (this class's own pose: breathing, lunge, droop),
 * `body` (a channel left to juice helpers: pop-in, squash, shake), and the `sprite` itself.
 */
export class UnitView {
  readonly root = new Container();
  readonly body = new Container();
  readonly sprite = new Sprite();
  /** A point above the head for effects that ride along (the weakened swirl). */
  readonly overhead = new Container();
  /** Bumped every time the view is recycled so a delayed callback can tell it is stale. */
  token = 0;
  uid = 0;
  unitId: UnitId = 'w_paw';
  cell = -1;
  x = 0;
  y = 0;
  /** Offset from the cell's resting spot; tweens drive it back to zero after a move. */
  offX = 0;
  offY = 0;
  dragging = false;
  dragX = 0;
  dragY = 0;
  exit: ExitMode = 'none';
  exitK = 0;
  exitFromX = 0;
  exitFromY = 0;
  exitToX = 0;
  exitToY = 0;
  moveTween: Tween | null = null;
  /** The weakened swirl riding on this unit while it lasts. */
  swirl: ZoneHandle | null = null;
  /** Frame stamp of the last reconcile that matched this view to a unit on the board. */
  mark = 0;
  /** An awakened unit that stays hidden until the director reveals it (or `revealAt` passes). */
  awaiting = false;
  revealAt = 0;
  /** A unit that left the board stays shown until this time unless the director hides it first (0 = not held). */
  holdUntil = 0;
  /** A finger is down on this unit. */
  pressed = false;

  private readonly deco = new Container();
  private readonly shadow: Sprite;
  private readonly rank: Sprite;
  private readonly badge: Sprite;
  private readonly rig = new Container();
  private readonly dome: Sprite;
  private readonly noAct: Sprite;
  private readonly pose = makePose();
  private spriteScale = 0.3;
  private phase = 0;
  private facing = 1;
  private facingTarget = 1;
  private dirX = 1;
  private dirY = 0;
  private attackK = -1;
  private attackTween: Tween | null = null;
  private readonly attackOpts: TweenOpts;
  private blocked = 0;
  private weak = 0;
  private sun = 0;
  private shield = 0;
  private press = 0;
  private lift = 0;
  private select = 0;
  private lean = 0;
  private lastTint: number = Color.white;

  constructor(art: FieldArt) {
    this.root.label = 'unit';
    this.body.label = 'body';
    this.sprite.label = 'sprite';
    this.sprite.anchor.set(0.5, 1);
    this.shadow = this.makeSprite(art.shadow);
    this.shadow.position.y = 1;
    this.rank = this.makeSprite(art.rank.common);
    this.rank.position.y = 13;
    this.badge = this.makeSprite(art.badge.warrior);
    this.badge.position.set(-38, 4);
    this.dome = this.makeSprite(art.shield);
    this.dome.position.y = -46;
    this.noAct = this.makeSprite(art.noAct);
    this.overhead.position.y = -106;
    this.deco.addChild(this.shadow, this.rank);
    this.body.addChild(this.sprite);
    this.rig.addChild(this.body);
    this.root.addChild(this.deco, this.rig, this.dome, this.badge, this.noAct, this.overhead);
    this.root.eventMode = 'none';
    this.attackOpts = {
      duration: ATTACK_SECONDS,
      ease: Ease.linear,
      onUpdate: (k) => {
        this.attackK = k;
      },
      onComplete: () => {
        this.attackK = -1;
      },
    };
    this.dome.alpha = 0;
    this.noAct.alpha = 0;
  }

  private makeSprite(texture: Sprite['texture']): Sprite {
    const s = new Sprite(texture);
    s.anchor.set(0.5);
    s.eventMode = 'none';
    return s;
  }

  /** Make this view show `unit`. Resets every transient look so a recycled view starts clean. */
  assign(unit: UnitState, art: FieldArt): void {
    this.uid = unit.uid;
    this.unitId = unit.id;
    this.cell = unit.cell;
    const rarity = unitRarity(unit.id);
    const texture = tex('unit_' + unit.id);
    this.sprite.texture = texture;
    this.spriteScale = unitSpriteScale(unit.id, texture.height);
    this.rank.texture = art.rank[rarity];
    this.badge.texture = art.badge[unitClass(unit.id)];
    this.phase = (unit.uid * 1.713) % TAU;
    this.x = this.homeX(unit.cell);
    this.y = this.homeY(unit.cell);
    // Units on the right half face the middle of the board, the others face right.
    this.facing = this.facingTarget = cellCol(unit.cell) >= 3 ? -1 : 1;
    this.dirX = this.facing;
    this.dirY = 0;
    this.offX = this.offY = 0;
    this.dragging = false;
    this.exit = 'none';
    this.exitK = 0;
    this.attackK = -1;
    this.blocked = this.weak = this.sun = this.shield = this.press = this.lift = this.select = this.lean = 0;
    this.pressed = false;
    this.awaiting = false;
    this.revealAt = 0;
    this.holdUntil = 0;
    this.lastTint = Color.white;
    this.sprite.tint = Color.white;
    this.sprite.alpha = 1;
    this.dome.alpha = 0;
    this.noAct.alpha = 0;
    this.root.alpha = 1;
    this.root.scale.set(1);
    this.root.visible = true;
    this.deco.alpha = 1;
    this.deco.scale.set(1);
    this.body.scale.set(1);
    this.body.alpha = 1;
    this.rig.position.set(0, 0);
    this.rig.scale.set(1);
    this.rig.rotation = 0;
    this.root.position.set(this.x, this.y);
    this.root.zIndex = this.y;
    this.sprite.scale.set(this.spriteScale * this.facing, this.spriteScale);
  }

  homeX(cell: number): number {
    return cellCenterX(cell);
  }

  homeY(cell: number): number {
    return cellCenterY(cell) + FEET_DY;
  }

  /** Face `dx` (screen direction) and run the lunge toward (dx, dy). Ignored while the last one is still playing. */
  attack(tweens: Tweener, dx: number, dy: number): void {
    if (this.attackTween?.alive) return;
    const len = Math.hypot(dx, dy);
    if (len > 1) {
      this.dirX = dx / len;
      this.dirY = dy / len;
    }
    if (Math.abs(dx) > 6) this.facingTarget = dx > 0 ? 1 : -1;
    this.attackK = 0;
    this.attackTween = tweens.run(this.attackOpts);
  }

  setPressed(v: boolean): void {
    this.pressed = v;
  }

  /** Per-frame upkeep. `unit` is null for a view that has left the board and is playing its exit. */
  step(dt: number, time: number, unit: UnitState | null, selected: boolean): void {
    if (unit) {
      this.cell = unit.cell;
      this.blocked = damp(this.blocked, unit.blocked ? 1 : 0, 0.07, dt);
      this.weak = damp(this.weak, unit.weakened > 0 ? 1 : 0, 0.1, dt);
      this.sun = damp(this.sun, unit.sunlit ? 1 : 0, 0.25, dt);
      this.shield = damp(this.shield, unit.shielded ? 1 : 0, 0.15, dt);
    }
    this.press = damp(this.press, this.pressed ? 1 : 0, 0.03, dt);
    this.lift = damp(this.lift, this.dragging ? 1 : 0, 0.04, dt);
    this.select = damp(this.select, selected ? 1 : 0, 0.06, dt);
    if (Math.abs(this.facing - this.facingTarget) > 0.01) this.facing = damp(this.facing, this.facingTarget, 0.035, dt);
    else this.facing = this.facingTarget;

    // Position: dragged units follow the finger with a little weight; the rest rest at home plus any move offset.
    const hx = this.homeX(this.cell);
    const hy = this.homeY(this.cell);
    switch (this.exit) {
      case 'fly':
        this.x = lerp(this.exitFromX, this.exitToX, this.exitK);
        this.y = lerp(this.exitFromY, this.exitToY, this.exitK);
        break;
      case 'none':
        if (this.dragging) {
          this.x = damp(this.x, this.dragX, 0.03, dt);
          this.y = damp(this.y, this.dragY, 0.03, dt);
        } else {
          this.x = hx + this.offX;
          this.y = hy + this.offY;
        }
        break;
      default:
        break;
    }
    this.root.position.set(this.x, this.y);
    this.root.zIndex = this.dragging ? 100000 : this.exit === 'fly' ? this.y + 400 : this.y;

    // Pose.
    const pose = this.pose;
    if (this.attackK >= 0) attackPose(this.attackK, pose);
    else breathe(time, this.phase, 1 - 0.5 * this.weak, pose);
    let k = (1 - 0.06 * this.press) * (1 + 0.12 * this.lift) * (1 + 0.022 * this.select * Math.sin(time * 7));
    // A lifted sticker tilts the way it is being pulled and leans a little to one side.
    this.lean = damp(this.lean, this.dragging ? clamp((this.dragX - this.x) * 0.004, -0.12, 0.12) : 0, 0.05, dt);
    let rot = (-0.16 * this.blocked - 0.07 * this.weak) * this.facing + this.lift * (0.07 * this.facing + this.lean);
    let fade = 1;
    switch (this.exit) {
      case 'fly':
        k *= 1 - 0.2 * this.exitK;
        break;
      case 'hold':
        k *= 1 + 0.1 * Ease.quadOut(this.exitK);
        break;
      case 'spin':
        rot += this.exitK * TAU * 1.5;
        k *= Math.max(0, 1 - this.exitK * this.exitK);
        fade = clamp01(2 - 2 * this.exitK);
        break;
      case 'sell':
        k *= Math.max(0, 1 - this.exitK * this.exitK);
        fade = 1 - this.exitK;
        break;
      case 'fade':
        fade = 1 - this.exitK;
        k *= 1 - 0.3 * this.exitK;
        break;
      default:
        break;
    }
    const slump = 1 - 0.08 * this.blocked - 0.05 * this.weak;
    this.rig.scale.set(pose.sx * k, pose.sy * k * slump);
    this.rig.rotation = rot;
    const lunge = LUNGE_PX * pose.lunge;
    const sellRise = this.exit === 'sell' ? -26 * this.exitK : 0;
    this.rig.position.set(this.dirX * lunge, this.dirY * lunge * 0.6 - 3 * this.select - 16 * this.lift + sellRise);
    this.sprite.scale.x = this.spriteScale * this.facing;
    this.root.alpha = fade;

    // Conditions.
    const tint = unitTint(this.blocked, this.weak, this.sun);
    if (tint !== this.lastTint) {
      this.lastTint = tint;
      this.sprite.tint = tint;
    }
    this.dome.alpha = 0.9 * this.shield * (0.85 + 0.15 * Math.sin(time * 2.4 + this.phase));
    this.noAct.alpha = this.blocked;
    this.noAct.scale.set(0.8 + 0.2 * this.blocked);
    this.noAct.position.set(0, -100 + Math.sin(time * 3 + this.phase) * 2);
    // A lifted sticker casts a wider, fainter shadow on the paper below it.
    this.shadow.alpha = 0.34 - 0.12 * this.lift;
    this.shadow.scale.set(1 + 0.24 * this.lift);
    this.shadow.position.y = 1 + 5 * this.lift;
  }

  /** Pop in: the cat scales up with a back-out while its base and shadow grow in underneath. */
  appear(tweens: Tweener, overshoot: number, ms: number): void {
    this.root.visible = true;
    popIn(tweens, this.body, { ms, overshoot });
    this.deco.alpha = 0;
    this.deco.scale.set(0.5);
    tweens.run({
      duration: (ms / 1000) * 0.8,
      ease: Ease.backOut,
      onUpdate: (k) => {
        this.deco.scale.set(0.5 + 0.5 * k);
        this.deco.alpha = clamp01(k * 1.6);
      },
      onComplete: () => {
        this.deco.scale.set(1);
        this.deco.alpha = 1;
      },
    });
  }

  /** Take everything off screen; the view is about to be pooled. */
  retire(): void {
    this.token++;
    this.moveTween?.kill();
    this.moveTween = null;
    this.swirl?.stop();
    this.swirl = null;
    this.exit = 'none';
    this.dragging = false;
    this.root.visible = false;
  }
}
