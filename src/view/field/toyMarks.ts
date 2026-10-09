/**
 * Where a positional toy works, drawn on the board. A toy that boosts the top row, the outer ring or the cats beside their own class
 * (`toyCells.ts`) marks exactly those cells in its own colour: a thin rounded frame round each cell (toys on one cell nest, the first picked
 * outermost), a small up-arrow badge on every cat that stands there (like the badge of a special cell), and a round chip carrying the toy's
 * picture at the start of the board, one under the other in the order they were picked. The marks are calm: thin lines, a faint tint, nothing
 * that moves while the player plays. They come in with a short flourish when the toy lands on the shelf, and tapping the toy's icon on the
 * shelf (its information bubble opens, see `info.listen`) or its chip on the board lights exactly those cells for a moment.
 *
 * Pooled: every frame, tint and badge is made once (one per cell for each of the three toys at most) and only shown, moved and faded.
 */
import { Container, Sprite, type Texture } from 'pixi.js';
import { t } from '@/core/i18n';
import { hasTex, tex } from '@/core/assets';
import { clamp01, damp } from '@/core/math';
import { Ease } from '@/core/tween';
import { fxSettings } from '@/fx/settings';
import { relicDef, unitDef } from '@/game';
import { CLASS_IDS, type RelicId } from '@/game/api';
import { BOARD_X, BOARD_Y, CELL_COUNT, cellCenterX, cellCenterY } from '@/game/geometry';
import { TOY_FLIGHT } from '../timing';
import { info } from '../info';
import { toyBadge, toyChip, TOY_INSETS, type FieldArt } from './art';
import type { FieldEnv } from './env';
import { MAX_TOYS, TOY_SHAPES, coverage, depthOf, positionalToys, toyColor, toyShape } from './toyCells';

/** The flourish of a toy that has just landed: each cell's frame draws in `STAGGER` seconds after the one before, over `DRAW` seconds. */
const STAGGER = 0.036;
const DRAW = 0.28;
/** Seconds a tap on a toy lights its cells, and how many times they pulse in that time. */
export const LIGHT_FOR = 1.6;
const LIGHT_PULSES = 2;
/** Resting looks: how opaque a frame and the faint tint inside it are, and how far the others dim while one toy is lit. */
const FRAME_ALPHA = 0.8;
const TINT_ALPHA = 0.14;
const DIM = 0.45;
/** The chips sit in a column on the board's left edge from this far below its top, one every `CHIP_PITCH`; a tap lands within `CHIP_HIT` of a chip's middle. */
const CHIP_TOP = 20;
const CHIP_PITCH = 33;
const CHIP_HIT = 20;
/** The icon on a chip, px across. */
const ICON = 22;
/** Where a cat's badges stand in its cell, from the cell's middle: the first one here, the next ones a step to the right. */
const BADGE_X = -43;
const BADGE_Y = -33;
const BADGE_STEP = 15;

/** How far in a cell's frame has drawn `t` seconds after the flourish began, the cell being the `order`-th to draw (0..1). */
export function reveal(t: number, order: number): number {
  return clamp01((t - order * STAGGER) / DRAW);
}

/** The strength of a lit toy's cells `left` seconds before the light goes out (0..1): up with each pulse, never fully off until it ends. */
export function pulse(left: number): number {
  if (left <= 0) return 0;
  const k = clamp01(1 - left / LIGHT_FOR);
  return 0.35 + 0.65 * Math.abs(Math.sin(k * Math.PI * LIGHT_PULSES)) * (1 - 0.4 * k);
}

/** The toy a bubble key names (`toy:<id>`), or null for any other key. */
export function toyOfKey(key: unknown, known: (id: string) => boolean): RelicId | null {
  if (typeof key !== 'string' || !key.startsWith('toy:')) return null;
  const id = key.slice(4);
  return known(id) ? (id as RelicId) : null;
}

/** One toy's mark on one cell. */
interface CellMark {
  frame: Sprite;
  tint: Sprite;
  badge: Sprite;
  /** How much of the mark is there (0..1): follows whether the toy boosts the cell, so a mark comes and goes softly when cats are moved. */
  amount: number;
}

interface Slot {
  id: RelicId | null;
  color: number;
  readonly cells: CellMark[];
  readonly chip: Container;
  readonly face: Sprite;
  readonly icon: Sprite;
  /** Seconds since the flourish began (negative: still waiting for the toy to land on the shelf); `FLOURISHED` once it is done. */
  age: number;
  /** Seconds the toy's cells stay lit. */
  lit: number;
  /** The place of each boosted cell in the order the flourish draws them (board order, set each frame). */
  order: Int8Array;
}

const SETTLED = 99;

export class ToyMarks {
  private readonly root = new Container();
  /** The faint tint of each boosted cell lies on the floor under the cats; the frames, then the chips, then the cats' badges are over them, so one toy's frame never draws over another's chip. */
  private readonly floor = new Container();
  private readonly under = new Container();
  private readonly chips = new Container();
  private readonly badges = new Container();
  private readonly slots: Slot[] = [];
  private readonly toys: RelicId[] = [];
  private readonly cover = new Uint8Array(CELL_COUNT * MAX_TOYS);
  /** False until the first frame: the toys a run already holds when the field opens are simply there, they do not flourish. */
  private seen = false;
  private readonly offInfo: () => void;
  private readonly classAt = (cell: number): number => {
    const u = this.env.battle.units[cell];
    return u ? CLASS_IDS.indexOf(unitDef(u.id).classId) : -1;
  };

  constructor(
    private readonly env: FieldEnv,
    floor: Container,
    layer: Container,
    private readonly art: FieldArt,
  ) {
    this.root.label = 'toy-marks';
    this.root.eventMode = 'none';
    this.floor.eventMode = 'none';
    this.root.addChild(this.under, this.chips, this.badges);
    floor.addChild(this.floor);
    layer.addChild(this.root);
    for (let k = 0; k < MAX_TOYS; k++) this.slots.push(this.makeSlot());
    // The chips and badges are drawn once per colour: now, while the scene is built, and not on the frame a toy is picked.
    for (const shape of TOY_SHAPES) {
      toyChip(toyColor(shape));
      toyBadge(toyColor(shape));
    }
    this.offInfo = info.listen((key) => {
      const id = toyOfKey(key, (s) => this.slots.some((slot) => slot.id === s));
      if (id) this.light(id);
    });
  }

  private makeSlot(): Slot {
    const cells: CellMark[] = [];
    for (let c = 0; c < CELL_COUNT; c++) {
      const x = cellCenterX(c);
      const y = cellCenterY(c);
      const tint = this.sprite(this.art.tileFill, x, y, this.floor);
      const frame = this.sprite(this.art.toyFrame[0] as Texture, x, y, this.under);
      const badge = this.sprite(this.art.toyFrame[0] as Texture, x + BADGE_X, y + BADGE_Y, this.badges);
      cells.push({ tint, frame, badge, amount: 0 });
    }
    const chip = new Container();
    chip.visible = false;
    const face = new Sprite();
    face.anchor.set(0.5);
    const icon = new Sprite();
    icon.anchor.set(0.5);
    chip.addChild(face, icon);
    this.chips.addChild(chip);
    return { id: null, color: 0, cells, chip, face, icon, age: SETTLED, lit: 0, order: new Int8Array(CELL_COUNT) };
  }

  private sprite(texture: Texture, x: number, y: number, parent: Container): Sprite {
    const s = new Sprite(texture);
    s.anchor.set(0.5);
    s.position.set(x, y);
    s.visible = false;
    s.eventMode = 'none';
    parent.addChild(s);
    return s;
  }

  /** The toys on the shelf that mark the board, in the order they were picked. */
  get shown(): ReadonlyArray<RelicId> {
    return this.toys;
  }

  /** Per frame. `held` is the cell whose cat is being dragged (its badges wait), -1 for none. */
  update(dt: number, held: number): void {
    const calm = fxSettings.reducedMotion;
    positionalToys(this.env.battle.relics, this.toys);
    this.assign();
    coverage(this.toys, this.classAt, this.cover);
    let lit = false;
    for (const slot of this.slots) lit ||= slot.id !== null && slot.lit > 0;
    for (let k = 0; k < this.slots.length; k++) {
      const slot = this.slots[k] as Slot;
      if (slot.id === null) continue;
      slot.age = slot.age >= SETTLED ? SETTLED : slot.age + dt;
      slot.lit = Math.max(0, slot.lit - dt);
      this.draw(slot, k, dt, calm, lit, held);
    }
  }

  /** Give each slot its toy, starting a flourish for a toy that is new (not for the toys a continued run already holds when the field opens). */
  private assign(): void {
    const first = !this.seen;
    this.seen = true;
    for (let k = 0; k < this.slots.length; k++) {
      const slot = this.slots[k] as Slot;
      const id = this.toys[k] ?? null;
      if (id === slot.id) continue;
      slot.id = id;
      for (const m of slot.cells) {
        m.amount = 0;
        m.frame.visible = m.tint.visible = m.badge.visible = false;
      }
      slot.chip.visible = id !== null;
      slot.lit = 0;
      if (id === null) continue;
      const shape = toyShape(id);
      slot.color = shape ? toyColor(shape) : 0;
      slot.face.texture = toyChip(slot.color);
      const key = `relic_${id}`;
      slot.icon.visible = hasTex(key);
      if (slot.icon.visible) {
        slot.icon.texture = tex(key);
        slot.icon.scale.set(ICON / Math.max(1, slot.icon.texture.width, slot.icon.texture.height));
      }
      slot.chip.position.set(BOARD_X + 2, BOARD_Y + CHIP_TOP + CHIP_PITCH * k);
      // The toy lands on the shelf after its flight; its marks draw in then.
      slot.age = first || fxSettings.reducedMotion ? SETTLED : -TOY_FLIGHT;
    }
  }

  private draw(slot: Slot, k: number, dt: number, calm: boolean, anyLit: boolean, held: number): void {
    if (slot.age > DRAW + STAGGER * CELL_COUNT) slot.age = SETTLED;
    const light = slot.lit > 0 ? (calm ? 1 : pulse(slot.lit)) : 0;
    const dim = anyLit && slot.lit <= 0 ? DIM : 1;
    // The chip: pops in as the toy lands, then waits; it bumps a little while its cells are lit.
    const chipIn = slot.age >= SETTLED || calm ? 1 : clamp01(slot.age / 0.3);
    slot.chip.visible = chipIn > 0;
    slot.chip.scale.set(Ease.backOut(chipIn) * (1 + 0.14 * light));
    slot.chip.alpha = dim;
    let order = 0;
    for (let c = 0; c < CELL_COUNT; c++) {
      const m = slot.cells[c] as CellMark;
      const covered = this.cover[c * MAX_TOYS + k] === 1;
      m.amount = calm ? (covered ? 1 : 0) : damp(m.amount, covered ? 1 : 0, 0.08, dt);
      const on = m.amount > 0.01;
      if (covered) slot.order[c] = order++;
      const rev = slot.age >= SETTLED || calm ? 1 : reveal(slot.age, slot.order[c] as number);
      const a = m.amount * rev;
      m.frame.visible = m.tint.visible = on && rev > 0;
      if (m.frame.visible) {
        const depth = depthOf(this.cover, c, k);
        const texture = this.art.toyFrame[Math.min(depth, TOY_INSETS.length - 1)] as Texture;
        if (m.frame.texture !== texture) m.frame.texture = texture;
        m.frame.tint = m.tint.tint = slot.color;
        // Each frame draws in with a small overshoot and a flash of strength, and a lit one pulses.
        const pop = calm ? 1 : 1 + 0.1 * (1 - Ease.cubicOut(rev));
        m.frame.scale.set(pop);
        m.tint.scale.set(pop);
        const flash = calm ? 0 : 0.5 * Math.sin(Math.PI * rev) * (rev < 1 ? 1 : 0);
        m.frame.alpha = Math.min(1, (FRAME_ALPHA * dim + 0.1 * light + flash) * a);
        m.tint.alpha = Math.min(1, (TINT_ALPHA * dim + 0.3 * light + 0.15 * flash) * a);
      }
      this.badge(slot, m, c, k, a, held, light, calm);
    }
  }

  /** The up-arrow on the cat that stands in a boosted cell: the toy's colour, a step to the right for each further toy on the same cell. */
  private badge(slot: Slot, m: CellMark, cell: number, k: number, a: number, held: number, light: number, calm: boolean): void {
    const cat = this.env.battle.units[cell];
    const show = a > 0.01 && !!cat && cell !== held;
    m.badge.visible = show;
    if (!show) return;
    const texture = toyBadge(slot.color);
    if (m.badge.texture !== texture) m.badge.texture = texture;
    m.badge.position.set(cellCenterX(cell) + BADGE_X + BADGE_STEP * depthOf(this.cover, cell, k), cellCenterY(cell) + BADGE_Y);
    m.badge.scale.set((calm ? 1 : Ease.backOut(a)) * (1 + 0.25 * light));
    m.badge.alpha = clamp01(a * 2);
  }

  /** Light the cells of toy `id` for a moment (nothing for a toy that does not mark the board). */
  light(id: RelicId): void {
    for (const slot of this.slots) if (slot.id === id) slot.lit = LIGHT_FOR;
  }

  /**
   * A press at (x, y) on the field: when it lands on a toy's chip, the toy's information bubble opens (which lights its cells, `info.listen`)
   * and the press is taken. False when the press is not on a chip.
   */
  tapAt(x: number, y: number): boolean {
    for (const slot of this.slots) {
      if (slot.id === null || !slot.chip.visible) continue;
      const dx = x - slot.chip.x;
      const dy = y - slot.chip.y;
      if (dx * dx + dy * dy > CHIP_HIT * CHIP_HIT) continue;
      const def = relicDef(slot.id);
      info.tap(`toy:${slot.id}`, slot.chip, { title: t(def.nameKey), text: def.descText() });
      return true;
    }
    return false;
  }

  destroy(): void {
    this.offInfo();
    this.floor.destroy({ children: true });
    this.root.destroy({ children: true });
  }
}
