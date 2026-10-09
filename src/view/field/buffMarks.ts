/**
 * The link between a trickster and the cats it helps, drawn on the board. Each cat that receives something wears its own badges (see
 * `UnitView`); this part shows the cells behind them: the cells a helper reaches, in a dotted mustard frame over a faint mustard tint, with
 * the helper's own cell framed stronger. They are shown while a helper is dragged (at the cell the finger is over, so the player can
 * choose the best one), while it or a cat it helps is selected, and for a moment after a helper was placed or moved. While a cat is
 * dragged, a ghost badge shows who a helper would help there, and where the dragged cat would be helped (on each empty cell).
 *
 * What to show is decided by `planBuffs` (pure, `buffMath.ts`); this class only keeps the sprites and fades them. Pooled: one tint, one
 * frame and three ghost badges per cell, made once.
 */
import { Container, Sprite, type Texture } from 'pixi.js';
import { clamp01, damp } from '@/core/math';
import { Ease } from '@/core/tween';
import { fxSettings } from '@/fx/settings';
import { CELL_COUNT, cellCenterX, cellCenterY } from '@/game/geometry';
import { Color } from '@/ui';
import type { FieldArt } from './art';
import { BADGE_BITS, BADGE_KINDS, BUFF_SLOT, REACH, SOURCE, bitOf, givesMask, kindCount, makePlan, planBuffs, receivedMask, type BadgeKind, type PlanIn } from './buffMath';
import type { FieldEnv } from './env';
import { FEET_DY } from './unitView';

/** Seconds a helper's reach stays on show after it was placed or moved. */
export const RECENT_FOR = 1.8;
/** How strong the frame and the tint of a reach cell are, for a cell the helper reaches and for its own. */
const FRAME_ALPHA = { [REACH]: 0.8, [SOURCE]: 1 } as const;
const TINT_ALPHA = { [REACH]: 0.16, [SOURCE]: 0.24 } as const;
/** A ghost badge is a promise, not a fact: fainter than the real one. */
const GHOST_ALPHA = 0.62;

interface Track {
  cell: number;
  /** Seconds of reach left to show; negative while the cat's picture is not there yet. */
  left: number;
  stamp: number;
}

export class BuffMarks {
  private readonly floor = new Container();
  private readonly root = new Container();
  private readonly frames = new Container();
  private readonly ghosts = new Container();
  private readonly tint: Sprite[] = [];
  private readonly frame: Sprite[] = [];
  /** `ghost[cell * kinds + kind]`. */
  private readonly ghost: Sprite[] = [];
  private readonly amount = new Float32Array(CELL_COUNT);
  private readonly role = new Uint8Array(CELL_COUNT);
  private readonly ghostAmount = new Float32Array(CELL_COUNT * BADGE_KINDS.length);
  private readonly plan = makePlan();
  private readonly tracked = new Map<number, Track>();
  private readonly recent: number[] = [];
  private frameNo = 0;
  /** False until the first frame: the helpers a run already has when the field opens are simply there, they are not "just placed". */
  private seen = false;
  private time = 0;
  private readonly input: PlanIn;

  constructor(
    private readonly env: FieldEnv,
    floor: Container,
    layer: Container,
    private readonly art: FieldArt,
  ) {
    this.floor.label = 'buff-floor';
    this.root.label = 'buff-marks';
    this.floor.eventMode = 'none';
    this.root.eventMode = 'none';
    this.root.addChild(this.frames, this.ghosts);
    floor.addChild(this.floor);
    layer.addChild(this.root);
    for (let c = 0; c < CELL_COUNT; c++) {
      const x = cellCenterX(c);
      const y = cellCenterY(c);
      this.tint.push(this.sprite(art.tileFill, x, y, this.floor, Color.mustard));
      this.frame.push(this.sprite(art.reachFrame, x, y, this.frames, Color.mustardDark));
      for (const kind of BADGE_KINDS) this.ghost.push(this.sprite(art.buffBadge[kind], x, y, this.ghosts, Color.white));
    }
    this.input = {
      unitAt: (cell) => env.buffs.at(cell),
      held: -1,
      hover: -1,
      action: null,
      selected: -1,
      recent: this.recent,
    };
  }

  private sprite(texture: Texture, x: number, y: number, parent: Container, tint: number): Sprite {
    const s = new Sprite(texture);
    s.anchor.set(0.5);
    s.position.set(x, y);
    s.tint = tint;
    s.visible = false;
    s.eventMode = 'none';
    parent.addChild(s);
    return s;
  }

  /** Forgets a helper that is not on the board any more (one bound function, so the sweep allocates nothing). */
  private readonly sweep = (t: Track, uid: number): void => {
    if (t.stamp !== this.frameNo) this.tracked.delete(uid);
  };

  /** The helpers on the board: a new one, or one that changed cell, shows its reach for `RECENT_FOR` seconds once its picture is there. */
  private track(dt: number): void {
    const { battle, ctx } = this.env;
    const first = !this.seen;
    this.seen = true;
    this.frameNo++;
    this.recent.length = 0;
    for (let c = 0; c < CELL_COUNT; c++) {
      const u = battle.units[c];
      if (!u || givesMask(u.id) === 0) continue;
      let t = this.tracked.get(u.uid);
      if (!t) {
        t = { cell: c, left: first ? 0 : -1, stamp: this.frameNo };
        this.tracked.set(u.uid, t);
      }
      t.stamp = this.frameNo;
      if (t.cell !== c) {
        t.cell = c;
        t.left = -1;
      }
      if (t.left < 0 && ctx.unitView(u.uid)?.visible) t.left = RECENT_FOR;
      else if (t.left > 0) t.left = Math.max(0, t.left - dt);
      if (t.left > 0) this.recent.push(c);
    }
    this.tracked.forEach(this.sweep);
  }

  /** Per frame. `held` is the cell of the cat being dragged (-1 for none), `hover` the cell under the finger. */
  update(dt: number, held: number, hover: number): void {
    const { battle, ctx } = this.env;
    const calm = fxSettings.reducedMotion;
    this.time += dt;
    this.track(dt);
    const inp = this.input;
    inp.held = held;
    inp.hover = hover;
    inp.action = held >= 0 && hover >= 0 && hover !== held ? battle.dropAction(held, hover) : null;
    inp.selected = ctx.selected ?? -1;
    planBuffs(inp, this.plan);
    const breath = calm ? 1 : 0.9 + 0.1 * Math.sin(this.time * 3);
    for (let c = 0; c < CELL_COUNT; c++) {
      const want = this.plan.cells[c] as number;
      if (want !== 0) this.role[c] = want;
      const a = calm ? (want !== 0 ? 1 : 0) : damp(this.amount[c] as number, want !== 0 ? 1 : 0, 0.06, dt);
      this.amount[c] = a;
      const frame = this.frame[c] as Sprite;
      const tint = this.tint[c] as Sprite;
      frame.visible = tint.visible = a > 0.01;
      if (frame.visible) {
        const role = this.role[c] === SOURCE ? SOURCE : REACH;
        // The helper's own cell is framed with a solid line, the cells it reaches with a dotted one.
        const texture = role === SOURCE ? this.art.toyFrame[0] : this.art.reachFrame;
        if (frame.texture !== texture) frame.texture = texture as Texture;
        frame.alpha = a * FRAME_ALPHA[role] * breath;
        tint.alpha = a * TINT_ALPHA[role];
        frame.scale.set(calm ? 1 : 1 + 0.06 * (1 - Ease.cubicOut(a)));
      }
      this.drawGhosts(c, dt, calm);
    }
  }

  /** The ghost badges of one cell: after the real ones if a cat stands there (they are already counted), from the top if it is empty. */
  private drawGhosts(cell: number, dt: number, calm: boolean): void {
    const mask = this.plan.ghost[cell] as number;
    const first = kindCount(receivedMask(this.env.buffs.at(cell)) & BADGE_BITS);
    let slot = first;
    for (let i = 0; i < BADGE_KINDS.length; i++) {
      const at = cell * BADGE_KINDS.length + i;
      const on = (mask & bitOf(BADGE_KINDS[i] as BadgeKind)) !== 0;
      const a = calm ? (on ? 1 : 0) : damp(this.ghostAmount[at] as number, on ? 1 : 0, 0.06, dt);
      this.ghostAmount[at] = a;
      const s = this.ghost[at] as Sprite;
      s.visible = a > 0.01;
      if (!s.visible) continue;
      if (on) s.position.set(cellCenterX(cell) + BUFF_SLOT.x, cellCenterY(cell) + FEET_DY + BUFF_SLOT.y + BUFF_SLOT.step * slot++);
      s.scale.set(calm ? 1 : Ease.backOut(clamp01(a)));
      s.alpha = clamp01(a * 2) * GHOST_ALPHA * (calm ? 1 : 0.88 + 0.12 * Math.sin(this.time * 4 + i));
    }
  }

  destroy(): void {
    this.floor.destroy({ children: true });
    this.root.destroy({ children: true });
  }
}
