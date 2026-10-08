/** Pure plan of the chest reveal: which card stacks come out, in what order, how fast, and where they land. */
import { RARITY_OF, UNITS_BY_RARITY } from '@/meta/units';
import { climbSeed } from './climb';
import { CHEST_KINDS, CHEST_RARITIES, type BaseUnitId, type ChestCard, type ChestKind, type ChestRarity, type ChestResult } from '@/meta/types';

export interface RevealStack {
  /** Stable key: the unit id, or `wild:<rarity>`; a pity bonus stack gets a `bonus:` prefix. */
  key: string;
  unit: BaseUnitId | null;
  rarity: ChestRarity;
  count: number;
  /** The tenth-gold-chest bonus cards. */
  bonus: boolean;
}

export function rarityRank(r: ChestRarity): number {
  return CHEST_RARITIES.indexOf(r);
}

/** The best card of a chest whose best rank is at least this one first shows as a dark silhouette. */
export const SILHOUETTE_FROM = 2;

/** The tenth-gold-chest bonus: which unit and how many cards (none when `cards` is 0). */
export interface Bonus {
  unit: BaseUnitId | null;
  cards: number;
}

/**
 * Group the cards of a result into stacks, lowest rarity first so the best stack comes last (the
 * reveal builds up to it). Inside a rarity: bonus stacks last, then the fixed unit order, wild first.
 * A pile of chests passes every bonus it got in `bonuses`; equal cards of different chests share a stack.
 */
export function stacksOf(result: { cards: readonly ChestCard[]; pity?: Bonus; bonuses?: readonly Bonus[] }): RevealStack[] {
  const map = new Map<string, RevealStack>();
  for (const c of result.cards) {
    const key = c.unit ?? 'wild:' + c.rarity;
    const rarity = c.unit ? RARITY_OF[c.unit] : c.rarity;
    const s = map.get(key);
    if (s) s.count++;
    else map.set(key, { key, unit: c.unit, rarity, count: 1, bonus: false });
  }
  for (const p of result.bonuses ?? (result.pity ? [result.pity] : [])) {
    if (!p.unit || p.cards <= 0) continue;
    const key = 'bonus:' + p.unit;
    const s = map.get(key);
    if (s) s.count += p.cards;
    else map.set(key, { key, unit: p.unit, rarity: RARITY_OF[p.unit], count: p.cards, bonus: true });
  }
  const out = [...map.values()];
  const order = (s: RevealStack): number => {
    if (!s.unit) return -1;
    return UNITS_BY_RARITY[s.rarity].indexOf(s.unit);
  };
  out.sort((a, b) => rarityRank(a.rarity) - rarityRank(b.rarity) || Number(a.bonus) - Number(b.bonus) || order(a) - order(b));
  return out;
}

/** What one reveal shows: a single chest, or a pile of chests of one kind opened in one go. */
export interface Pile {
  kind: ChestKind;
  /** Chests in the pile (1 for a lone chest). */
  count: number;
  cards: ChestCard[];
  bonuses: Bonus[];
  overflowGold: number;
  /** Stored reveal ids: all of them are acknowledged when the reveal ends. */
  ids: number[];
  /** Made from the stored results, so a replay stages the climb the same way (it picks the climb pattern). */
  seed: number;
}

/** Merge the stored results of one pile into the view the reveal plays (one chest, one rattle, one summary). */
export function mergePile(results: readonly ChestResult[]): Pile {
  const first = results[0];
  const pile: Pile = { kind: first ? first.kind : 'wooden', count: results.length, cards: [], bonuses: [], overflowGold: 0, ids: [], seed: climbSeed(results) };
  for (const r of results) {
    pile.cards.push(...r.cards);
    if (r.pity.unit && r.pity.cards > 0) pile.bonuses.push(r.pity);
    pile.overflowGold += r.overflowGold;
    pile.ids.push(r.id);
  }
  return pile;
}

/** Consecutive stored reveals opened together share a `batch` tag: a replay after a crash shows each pile once. */
export function pilesOf(results: readonly ChestResult[]): ChestResult[][] {
  const out: ChestResult[][] = [];
  for (const r of results) {
    const last = out[out.length - 1];
    if (last && r.batch !== undefined && last[0]?.batch === r.batch) last.push(r);
    else out.push([r]);
  }
  return out;
}

/** Narrow an unknown service argument to a stored chest result. */
export function isChestResult(v: unknown): v is ChestResult {
  if (typeof v !== 'object' || v === null) return false;
  const r = v as Partial<ChestResult>;
  return typeof r.id === 'number' && typeof r.kind === 'string' && (CHEST_KINDS as readonly string[]).includes(r.kind) && Array.isArray(r.cards)
    && typeof r.pity === 'object' && r.pity !== null;
}

/** What a service argument plays: one stored chest result or an array of them (a pile), or null when it is neither. */
export function resultsOf(v: unknown): ChestResult[] | null {
  const list: unknown[] = Array.isArray(v) ? v : [v];
  return list.length > 0 && list.every(isChestResult) ? (list as ChestResult[]) : null;
}

export interface Flourish {
  /** A puff of dust under the card. */
  dust: boolean;
  /** A strip of tape slapped across the corner. */
  tape: boolean;
  /** The rarity's name stamped on the card. */
  stamp: boolean;
  /** A flat sunburst behind the card. */
  sun: boolean;
  /** Paper confetti raining over the screen. */
  confetti: boolean;
}

/** What a card's flip brings with it: every higher rarity keeps the flourishes of the one below and adds one; the best card of a chest gets the big finish. */
export function flourishOf(rarity: ChestRarity, isBest: boolean): Flourish {
  const rank = rarityRank(rarity);
  return {
    dust: rank === 0,
    tape: rank >= 1,
    stamp: rank >= 2,
    sun: isBest && rank >= 2,
    confetti: isBest && rank >= 3,
  };
}

export function bestRarity(stacks: readonly RevealStack[]): ChestRarity {
  let best: ChestRarity = 'common';
  for (const s of stacks) if (rarityRank(s.rarity) > rarityRank(best)) best = s.rarity;
  return best;
}

export function totalCards(stacks: readonly RevealStack[]): number {
  let n = 0;
  for (const s of stacks) n += s.count;
  return n;
}

export interface GridSlot {
  x: number;
  y: number;
}

/** Natural size of a reveal card's plate. The name is set under it at a fixed size on screen, whatever the scale. */
export const PLATE = { w: 116, h: 136 } as const;

/**
 * The rarity stamp lands on the photo's outer side: its near edge a quarter of the plate in from the middle (the cat's face is up and in the
 * centre, the tape in the upper left corner, the count at the foot and the "Wild" tag in the upper right), level with the middle. `half` is
 * half its width, `outer` the side it hangs on (1 the right).
 */
export const STAMP_NEAR = 0.28;
export function stampSpot(half: number, outer: 1 | -1): { x: number; y: number } {
  return { x: outer * (PLATE.w * STAMP_NEAR + half), y: -PLATE.h * 0.04 };
}

/** How big the stamp may arrive: up to `max` times its size, but never so big that its far edge passes the screen's, `room` plate units from the middle. */
export function stampFrom(room: number, half: number, max: number): number {
  return Math.max(1, Math.min(max, 1 + (room - (PLATE.w * STAMP_NEAR + 2 * half)) / half));
}
/** Font size of a card's name on screen: never below the kit's body-text floor, never shrunk to fit. */
export const NAME_SIZE = 24;
export const NAME_LINE = 26;
/** Space between a plate and its name, and below the name. */
export const NAME_GAP = 8;
const NAME_PAD = 4;
const CELL_GAP = 10;
/** Space between two rows: the tape and tags of a plate overhang its top, and must not lie on the names of the row above. */
const ROW_GAP = CELL_GAP + 18;
/** Room above the first row for the tape and tags that overhang a plate. */
const CREST = 22;
const MAX_SCALE = 1.5;
const MAX_COLS = 6;
/** A layout with fewer rows is chosen when its plates are at least this share of the biggest ones. */
const NEAR_BEST = 0.9;

export interface GridLayout {
  cols: number;
  rows: number;
  /** Plate scale from its natural size. */
  scale: number;
  /** Width of one cell; a name may use all of it. */
  cellW: number;
  /** Plate size on screen. */
  plateW: number;
  plateH: number;
  /** Height reserved under each plate for its name. */
  nameBlock: number;
  /** Plate centres, relative to the top-left of the area. */
  slots: GridSlot[];
}

/** Height a name of `lines` lines takes under its plate. */
export function nameBlockOf(lines: number): number {
  return NAME_GAP + lines * NAME_LINE + NAME_PAD;
}

/**
 * Lay `n` plates out in rows inside a `w` x `h` area, the last row centred. Every column count is tried and the one
 * that allows the biggest plates wins (a layout with fewer rows when its plates are nearly as big); a cell is as wide as its share of the area and carries
 * the name under the plate, so names keep their size and wrap in the cell instead of shrinking with the card.
 * `nameBlockFor` says how tall the names get when a cell is that wide (a long name wraps to a second line).
 */
export function gridLayout(n: number, w: number, h: number, nameBlockFor: (cellW: number) => number = () => nameBlockOf(1)): GridLayout {
  const options: GridLayout[] = [];
  for (let cols = 1; cols <= Math.min(Math.max(1, n), MAX_COLS); cols++) {
    const rows = Math.max(1, Math.ceil(n / cols));
    const cellW = (w - CELL_GAP * (cols - 1)) / cols;
    const nameBlock = nameBlockFor(cellW);
    const fitW = cellW / PLATE.w;
    const fitH = (h - CREST - ROW_GAP * (rows - 1) - rows * nameBlock) / (rows * PLATE.h);
    const scale = Math.max(0.1, Math.min(fitW, fitH, MAX_SCALE));
    options.push({ cols, rows, scale, cellW, plateW: PLATE.w * scale, plateH: PLATE.h * scale, nameBlock, slots: [] });
  }
  // The biggest plates win, unless a layout with fewer rows is nearly as big: a compact block reads better than wide gaps.
  const biggest = Math.max(...options.map((o) => o.scale));
  let best: GridLayout | null = null;
  for (const o of options) {
    if (o.scale < biggest * NEAR_BEST) continue;
    if (!best || o.rows < best.rows || (o.rows === best.rows && o.scale > best.scale)) best = o;
  }
  const g = best as GridLayout;
  const rowH = g.plateH + g.nameBlock;
  const usedH = g.rows * rowH + (g.rows - 1) * ROW_GAP;
  const top = CREST + Math.max(0, (h - CREST - usedH) / 2);
  for (let i = 0; i < n; i++) {
    const row = Math.floor(i / g.cols);
    const inRow = Math.min(g.cols, n - row * g.cols);
    const col = i - row * g.cols;
    const rowW = inRow * g.cellW + (inRow - 1) * CELL_GAP;
    g.slots.push({ x: (w - rowW) / 2 + g.cellW / 2 + col * (g.cellW + CELL_GAP), y: top + g.plateH / 2 + row * (rowH + ROW_GAP) });
  }
  return g;
}
