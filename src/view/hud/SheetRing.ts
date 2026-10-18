/**
 * The skill ring on the selection sheet's photo (step 3, docs/design_skills_v1.md 2.3: "the same ring turns live on the photo's corner").
 *
 * It is the board's own ring (`SpRingView` and its one frame sheet, `field/spRing.ts`) round a class sticker like the one a cat wears on the field, so the
 * player who sees it on the board knows it here, and it is driven by the same numbers: the cat's gauge (`UnitState.sp`), whether the cat stands stopped,
 * the battle's clock for the swell of a full ring and the flash of a cast, the field's own mark rules (the gunner's holster). Made only for a cat with a
 * skill in a battle with skills (`BattleApi.spOn`): the sheet of a battle without them never builds one and never paints the frame sheet.
 *
 * `ringLook` is the pure part: what the ring is told this frame, worked out from the unit and the battle.
 */
import { Container, Graphics } from 'pixi.js';
import { fxSettings } from '@/fx/settings';
import { unitDef } from '@/game';
import type { BattleApi, ClassId, UnitState } from '@/game/api';
import { Color, drawIcon, motion } from '@/ui';
import { ringHeld } from '../field/ringHold';
import { SpRingView, spRingArt, type RingLook } from '../field/spRing';
import { FLASH_SECONDS, PulseClock, RING_FULL, momentK, pulseWave, ringFrame, ringMarkOf } from '../field/spRingMath';
import { CLASS_ACCENT, CLASS_ICON } from './kit';

/** Radius of the class sticker inside the ring (the board's `badge` is a 14 px disc with a 2 px cream rim). */
const STICKER_R = 14;

/**
 * What the ring shows for `u` now. `castAt` is the battle time of the cat's last cast (or null), `clock` the swell's clock in seconds, `calm` reduced
 * motion and `low` the low quality tier. A full ring on the sheet always swells (there is only one: the board's limit of four pulsing rings is about
 * a crowd); a stopped cat's does not.
 */
export function ringLook(look: RingLook, u: UnitState, battle: BattleApi, castAt: number | null, clock: number, calm: boolean, low: boolean): RingLook {
  const def = unitDef(u.id);
  const frame = ringFrame(ringHeld(u.uid) ?? u.sp);
  look.frame = frame;
  look.blocked = u.blocked;
  look.pulsing = frame === RING_FULL;
  look.wave = pulseWave(clock);
  look.flash = castAt === null ? -1 : momentK(battle.time, castAt, FLASH_SECONDS);
  look.mark = def.spSkill ? ringMarkOf(def.spSkill.id, u, battle, calm) : null;
  look.calm = calm;
  look.low = low;
  look.trick = def.classId === 'trickster';
  return look;
}

/** The class sticker the ring goes round: a cream-rimmed disc in the class's colour with its glyph, the same as on the cat's cell. */
function classSticker(classId: ClassId): Container {
  const c = new Container();
  const disc = new Graphics();
  disc.circle(1.5, 3, STICKER_R + 2).fill({ color: Color.shadow, alpha: 0.3 });
  disc.circle(0, 0, STICKER_R + 2).fill(Color.paperLight);
  disc.circle(0, 0, STICKER_R - 0.5).fill(CLASS_ACCENT[classId]);
  c.addChild(disc, drawIcon(CLASS_ICON[classId], 16, Color.paperLight));
  return c;
}

export class SheetRing {
  readonly root = new Container();
  private readonly view: SpRingView;
  private readonly clock = new PulseClock();
  private readonly look: RingLook = { frame: 0, blocked: false, pulsing: false, wave: 0, flash: -1, mark: null, calm: false, low: false };
  private castUid = -1;
  private castAt: number | null = null;
  private lastTime: number;

  constructor(battle: BattleApi, classId: ClassId, scale: number) {
    this.root.label = 'sheet-ring';
    this.root.eventMode = 'none';
    this.view = new SpRingView(spRingArt());
    this.root.addChild(classSticker(classId), this.view.root);
    this.root.scale.set(scale);
    this.lastTime = battle.time;
  }

  /** The cat `uid` has just cast: the ring flashes (the gauge is already empty). */
  cast(uid: number, at: number): void {
    this.castUid = uid;
    this.castAt = at;
  }

  /** Once a frame: show the gauge of `u` as it is now. `dt` is real seconds. */
  tick(u: UnitState, battle: BattleApi, dt: number): void {
    const now = battle.time;
    this.clock.advance(Math.max(0, now - this.lastTime), dt);
    this.lastTime = now;
    const at = this.castUid === u.uid ? this.castAt : null;
    this.view.draw(ringLook(this.look, u, battle, at, this.clock.seconds, motion.reduced, fxSettings.tier === 'low'), dt);
  }

  destroy(): void {
    this.root.destroy({ children: true });
  }
}
