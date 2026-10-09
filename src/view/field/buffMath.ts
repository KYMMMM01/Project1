/**
 * Who helps whom on the board, as pure maths (no Pixi). A trickster's team effect (the bell kitten's attack speed and ward, the bard's
 * damage, the lucky cat's attack speed for everyone) reaches some cells; the cats standing there are "buffed". The simulation applies
 * these effects without keeping a list of them, so `BuffBoard` works the list out again from the same data it reads (`unitSpec(id).aura`,
 * `auraScale` for the cat's level and `auraCells` for the shape of the reach), once per frame and without allocating. The case the
 * simulation cannot answer at all is "what would happen if this cat stood there", which the drag preview shows: `reachOf`, `givesMask`
 * and `previewMask`. `tests/view.field.buff.test.ts` plays a bell, a bard and a lucky cat in a real simulation and fails if its numbers
 * or its reach ever differ from these.
 */
import { auraScale, mergeResultOf, unitSpec } from '@/game';
import type { DropAction, UnitId } from '@/game/api';
import { CELL_COUNT, auraCells } from '@/game/geometry';
import type { BuffMarkKind } from '@/fx/marks';

/** The kinds of help, in the order the sheet lists them. */
export type BuffKind = BuffMarkKind;
export const BUFF_KINDS: readonly BuffKind[] = ['speed', 'damage', 'ward'];

/**
 * The kinds that get a badge on the cat. The ward has none: a cat that a bell shields already wears the dashed dome, and a cat's right
 * flank has room for two badges between the sun sticker and the rank tag.
 */
export type BadgeKind = Exclude<BuffKind, 'ward'>;
export const BADGE_KINDS: readonly BadgeKind[] = ['speed', 'damage'];

const SPEED = 1;
const DAMAGE = 2;
const WARD = 4;
const BITS: Readonly<Record<BuffKind, number>> = { speed: SPEED, damage: DAMAGE, ward: WARD };
/** The bits of the kinds that have a badge. */
export const BADGE_BITS = SPEED | DAMAGE;
const NO_CELLS: readonly number[] = [];

/**
 * Where a cat's badges stand, measured from its feet: a column down the right flank, the first kind at the top, `step` apart. The sun sticker
 * is above it and the rank tag below it (a legendary or mythic tag is wide, so the column ends 5 px short of its top). The badges of a cat that
 * is not there yet (`ghost`) use the same slots, from the cell's middle (`FEET_DY` further up).
 */
export const BUFF_SLOT = { x: 35, y: -49, step: 25 } as const;

/** The bit of a kind in a mask. */
export function bitOf(kind: BuffKind): number {
  return BITS[kind];
}

/** How many kinds a mask holds. */
export function kindCount(mask: number): number {
  return ((mask & SPEED) !== 0 ? 1 : 0) + ((mask & DAMAGE) !== 0 ? 1 : 0) + ((mask & WARD) !== 0 ? 1 : 0);
}

/** One effect a trickster gives a cat: what it is and which cat gives it. */
export interface Gift {
  kind: BuffKind;
  fromCell: number;
  fromUnit: UnitId;
}

/** The part of a cat the markers read: what it receives and which cells its own team effect reaches. */
export interface BuffCat {
  readonly id: UnitId;
  /** Every effect that reaches the cat, in the order the helpers stand on the board. */
  readonly gifts: Gift[];
  /** What it receives, as the simulation adds it up: the strongest bell plus the lucky cat; the strongest bard; any bell's ward. Fractions (0.25 = +25 %). */
  speed: number;
  damage: number;
  ward: boolean;
  /** The cells its own team effect reaches (empty for a cat that helps nobody, every other cell for a board-wide one). */
  readonly reach: number[];
}

/** What `BuffBoard.refresh` reads of a cat on the board. */
export interface BoardCat {
  readonly id: UnitId;
  readonly level: number;
}

/** What a cat receives from tricksters now, as a mask (0 for an empty cell). */
export function receivedMask(u: Pick<BuffCat, 'speed' | 'damage' | 'ward'> | null | undefined): number {
  if (!u) return 0;
  return (u.speed > 0 ? SPEED : 0) | (u.damage > 0 ? DAMAGE : 0) | (u.ward ? WARD : 0);
}

/** The distinct cells of the tricksters that help a cat, appended to `out` (cleared first). */
export function giverCells(u: Pick<BuffCat, 'gifts'>, out: number[]): number[] {
  out.length = 0;
  for (const g of u.gifts) if (!out.includes(g.fromCell)) out.push(g.fromCell);
  return out;
}

/** True for a cat whose effect is the whole board's rather than the cells around it (the lucky cat). */
export function boardWide(id: UnitId): boolean {
  return (unitSpec(id).aura.boardSpeed ?? 0) > 0;
}

/** What a cat of this kind gives the cats it reaches, read off its data (its neighbours', or the whole board's for the lucky cat). 0 for a cat that helps nobody. */
export function givesMask(id: UnitId): number {
  const aura = unitSpec(id).aura;
  const speed = (aura.neighbourSpeed ?? 0) > 0 || (aura.boardSpeed ?? 0) > 0;
  return (speed ? SPEED : 0) | ((aura.neighbourDamage ?? 0) > 0 ? DAMAGE : 0) | (aura.shieldNeighbours ? WARD : 0);
}

/** The cells a helper of this kind standing in `cell` reaches: the cells `auraCells` gives for the reach in its data (the simulation reads the same), or every other cell for a board-wide one. */
export function reachOf(id: UnitId, cell: number, out: number[]): number[] {
  if (!boardWide(id)) return auraCells(cell, out, unitSpec(id).aura.reach ?? 1);
  out.length = 0;
  for (let c = 0; c < CELL_COUNT; c++) if (c !== cell) out.push(c);
  return out;
}

/** What a cat standing in `cell` would receive from the helpers on the board, leaving out the cat in `ignore` (the one that is being lifted away). */
export function previewMask(unitAt: (cell: number) => BuffCat | null, cell: number, ignore: number): number {
  let mask = 0;
  for (let t = 0; t < CELL_COUNT; t++) {
    if (t === cell || t === ignore) continue;
    const u = unitAt(t);
    if (u && u.reach.includes(cell)) mask |= givesMask(u.id);
  }
  return mask;
}

/** One line of a cat's buffs: the kind, the simulation's own number (a fraction; null for a kind without one) and who gives it. */
export interface BuffFact {
  kind: BuffKind;
  value: number | null;
  from: UnitId[];
}

/** The buffs a cat receives from tricksters now, in the sheet's order. */
export function buffFacts(u: BuffCat): BuffFact[] {
  const out: BuffFact[] = [];
  for (const kind of BUFF_KINDS) {
    const from: UnitId[] = [];
    for (const g of u.gifts) if (g.kind === kind && !from.includes(g.fromUnit)) from.push(g.fromUnit);
    if (from.length === 0) continue;
    out.push({ kind, value: kind === 'speed' ? u.speed : kind === 'damage' ? u.damage : null, from });
  }
  return out;
}

/**
 * A bell kitten dodges wet and zap cells itself, but no other bell stands next to it, so the board lists no ward for it: the sheet adds the
 * one it gives itself (`dodge` is the simulation's own chance on that cat).
 */
export function withOwnWard(facts: BuffFact[], id: UnitId, dodge: number): BuffFact[] {
  if (dodge > 0 && !facts.some((f) => f.kind === 'ward')) facts.push({ kind: 'ward', value: null, from: [id] });
  return facts;
}

/** How many of the chips (`widths[i]` wide each, taken in order) fit in `room` px with `gap` between them. */
export function chipsFit(widths: readonly number[], room: number, gap: number): number {
  let used = 0;
  for (let i = 0; i < widths.length; i++) {
    used += (i > 0 ? gap : 0) + (widths[i] as number);
    if (used > room) return i;
  }
  return widths.length;
}

// ───────────────────────────── the board's list of help ─────────────────────────────

/** A cat's record as the board writes it. */
type Rec = { -readonly [K in keyof BuffCat]: BuffCat[K] };

/**
 * The list of help on the board, worked out from where the cats stand. `refresh` rewrites it in place (every cat's record and the gifts are
 * pooled), so calling it every frame allocates nothing once the pool has grown to the biggest crowd of helpers it has seen.
 */
export class BuffBoard {
  private readonly cats: Rec[] = Array.from({ length: CELL_COUNT }, () => ({ id: 'w_paw' as UnitId, gifts: [], speed: 0, damage: 0, ward: false, reach: [] }));
  private readonly here = new Uint8Array(CELL_COUNT);
  private readonly bellSpeed = new Float64Array(CELL_COUNT);
  private readonly pool: Gift[] = [];
  private used = 0;

  /** The cat standing in `cell` as the markers read it, or null for an empty cell. */
  at(cell: number): BuffCat | null {
    return cell >= 0 && cell < CELL_COUNT && this.here[cell] === 1 ? (this.cats[cell] as BuffCat) : null;
  }

  private gift(kind: BuffKind, fromCell: number, fromUnit: UnitId): Gift {
    let g = this.pool[this.used];
    if (!g) {
      g = { kind, fromCell, fromUnit };
      this.pool.push(g);
    } else {
      g.kind = kind;
      g.fromCell = fromCell;
      g.fromUnit = fromUnit;
    }
    this.used++;
    return g;
  }

  refresh(units: ReadonlyArray<BoardCat | null | undefined>): void {
    this.used = 0;
    let lucky = 0;
    for (let c = 0; c < CELL_COUNT; c++) {
      const u = units[c];
      const cat = this.cats[c] as Rec;
      cat.gifts.length = 0;
      cat.reach.length = 0;
      cat.speed = cat.damage = 0;
      cat.ward = false;
      this.bellSpeed[c] = 0;
      this.here[c] = u ? 1 : 0;
      if (u) cat.id = u.id;
    }
    // Every helper in cell order, so the list of gifts is the same from one frame to the next.
    for (let h = 0; h < CELL_COUNT; h++) {
      const u = units[h];
      if (!u || givesMask(u.id) === 0) continue;
      const spec = unitSpec(u.id);
      const aura = spec.aura;
      const scale = auraScale(spec, u.level);
      const helper = this.cats[h] as BuffCat;
      reachOf(u.id, h, helper.reach);
      if (boardWide(u.id)) {
        const v = (aura.boardSpeed as number) * scale;
        if (v > lucky) lucky = v;
        for (let t = 0; t < CELL_COUNT; t++) if (this.here[t] === 1) (this.cats[t] as BuffCat).gifts.push(this.gift('speed', h, u.id));
        continue;
      }
      for (const t of helper.reach) {
        if (this.here[t] !== 1) continue;
        const target = this.cats[t] as BuffCat;
        if (aura.neighbourSpeed !== undefined) {
          const v = aura.neighbourSpeed * scale;
          if (v > (this.bellSpeed[t] as number)) this.bellSpeed[t] = v;
          target.gifts.push(this.gift('speed', h, u.id));
        }
        if (aura.neighbourDamage !== undefined) {
          const v = aura.neighbourDamage * scale;
          if (v > target.damage) target.damage = v;
          target.gifts.push(this.gift('damage', h, u.id));
        }
        if (aura.shieldNeighbours) {
          target.ward = true;
          target.gifts.push(this.gift('ward', h, u.id));
        }
      }
    }
    for (let c = 0; c < CELL_COUNT; c++) if (this.here[c] === 1) (this.cats[c] as BuffCat).speed = lucky + (this.bellSpeed[c] as number);
  }
}

// ───────────────────────────── what the board shows ─────────────────────────────

/** A cell of a footprint is one a helper reaches, or the helper's own. */
export const REACH = 1;
export const SOURCE = 2;

export interface PlanIn {
  /** The cat standing in a cell now, or null. */
  unitAt(cell: number): BuffCat | null;
  /** The cell of the cat being dragged (-1 for none), the cell under the finger (-1 off the board) and what letting go there would do. */
  held: number;
  hover: number;
  action: DropAction | null;
  /** The selected cell (-1 for none). */
  selected: number;
  /** Cells of helpers that have just been placed or moved, whose reach is shown for a moment. */
  recent: ReadonlyArray<number>;
}

export interface PlanOut {
  /** Per cell: 0, `REACH` or `SOURCE`. */
  cells: Uint8Array;
  /** Per cell: the kinds shown as a preview (a ghost badge) on the cat standing there or, for an empty cell, on the cat that would stand there. */
  ghost: Uint8Array;
}

export function makePlan(): PlanOut {
  return { cells: new Uint8Array(CELL_COUNT), ghost: new Uint8Array(CELL_COUNT) };
}

const reach: number[] = [];
const givers: number[] = [];

/** Marks the reach of a helper standing in `cell`, and its own cell. */
function mark(out: PlanOut, cell: number, cells: readonly number[]): void {
  for (const r of cells) if (out.cells[r] === 0) out.cells[r] = REACH;
  out.cells[cell] = SOURCE;
}

/**
 * What the board shows right now, as flags per cell:
 *  - the reach of a helper while it is dragged (at the cell the finger is over, so the player can choose the best one; where it came from if
 *    the drop would be refused), while it is selected, for a moment after it was placed or moved, and the reach of each helper of a selected
 *    cat that is being helped;
 *  - a ghost badge on the cats a dragged helper would help there (only the kinds they do not already have), and on every empty cell for the
 *    kinds the dragged cat would receive if it stood there.
 * The ward is never previewed: it has no badge.
 */
export function planBuffs(inp: PlanIn, out: PlanOut): PlanOut {
  out.cells.fill(0);
  out.ghost.fill(0);
  const { unitAt, held } = inp;
  const heldCat = held >= 0 ? unitAt(held) : null;
  if (heldCat) {
    let at = held;
    let id: UnitId = heldCat.id;
    if (inp.hover >= 0 && inp.hover !== held && inp.action !== null && inp.action !== 'none') {
      at = inp.hover;
      if (inp.action === 'merge') id = mergeResultOf(heldCat.id) ?? heldCat.id;
    }
    const gives = givesMask(id);
    if (gives !== 0) {
      const cells = reachOf(id, at, reach);
      mark(out, at, cells);
      for (const r of cells) {
        const other = unitAt(r);
        if (r !== held && other) out.ghost[r] = (out.ghost[r] as number) | (gives & BADGE_BITS & ~receivedMask(other));
      }
    }
    for (let c = 0; c < CELL_COUNT; c++) if (unitAt(c) === null) out.ghost[c] = (out.ghost[c] as number) | (previewMask(unitAt, c, held) & BADGE_BITS);
    return out;
  }
  const selected = inp.selected >= 0 ? unitAt(inp.selected) : null;
  if (selected) {
    if (givesMask(selected.id) !== 0) mark(out, inp.selected, selected.reach);
    for (const t of giverCells(selected, givers)) {
      const giver = unitAt(t);
      mark(out, t, giver ? giver.reach : NO_CELLS);
    }
  }
  for (const t of inp.recent) {
    const u = unitAt(t);
    if (u && givesMask(u.id) !== 0) mark(out, t, u.reach);
  }
  return out;
}
