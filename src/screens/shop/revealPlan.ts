/** Pure plan of the chest reveal: which card stacks come out, in what order, how fast, and where they land. */
import { RARITY_OF, UNITS_BY_RARITY } from '@/meta/units';
import { CHEST_RARITIES, type BaseUnitId, type ChestCard, type ChestRarity } from '@/meta/types';

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

/**
 * Group the cards of a result into stacks, lowest rarity first so the best stack comes last (the
 * reveal builds up to it). Inside a rarity: bonus stacks last, then the fixed unit order, wild first.
 */
export function stacksOf(result: { cards: readonly ChestCard[]; pity: { unit: BaseUnitId | null; cards: number } }): RevealStack[] {
  const map = new Map<string, RevealStack>();
  for (const c of result.cards) {
    const key = c.unit ?? 'wild:' + c.rarity;
    const rarity = c.unit ? RARITY_OF[c.unit] : c.rarity;
    const s = map.get(key);
    if (s) s.count++;
    else map.set(key, { key, unit: c.unit, rarity, count: 1, bonus: false });
  }
  const out = [...map.values()];
  if (result.pity.unit && result.pity.cards > 0) {
    out.push({ key: 'bonus:' + result.pity.unit, unit: result.pity.unit, rarity: RARITY_OF[result.pity.unit], count: result.pity.cards, bonus: true });
  }
  const order = (s: RevealStack): number => {
    if (!s.unit) return -1;
    return UNITS_BY_RARITY[s.rarity].indexOf(s.unit);
  };
  out.sort((a, b) => rarityRank(a.rarity) - rarityRank(b.rarity) || Number(a.bonus) - Number(b.bonus) || order(a) - order(b));
  return out;
}

/**
 * Dots on the ribbon across a closed chest: one for a common best card up to four for a legendary one, so the
 * tier is told by a count as well as by the ribbon's colour.
 */
export function ribbonDots(best: ChestRarity): number {
  return rarityRank(best) + 1;
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

export interface RevealSchedule {
  /** Seconds of the drop + rattle before the burst. */
  rattle: number;
  /** Start time of each stack's flight (same order as the stacks), measured from the first frame. */
  flightAt: number[];
  /** Seconds each flight and flip takes. */
  flight: number;
  /** When the last flip has landed (the best card is held for `hold` seconds after). */
  lastFlipAt: number;
  hold: number;
  total: number;
}

const DROP = 0.28;
/** Chest shake before the burst, by the best rarity inside: more to look forward to when more is inside. */
const RATTLE: Record<ChestRarity, number> = { common: 0.4, rare: 0.55, epic: 0.8, legendary: 1.1 };
/** Pause on the best stack. */
const HOLD: Record<ChestRarity, number> = { common: 0, rare: 0.15, epic: 0.45, legendary: 0.9 };
const GAP: Record<ChestRarity, number> = { common: 0.1, rare: 0.14, epic: 0.2, legendary: 0.3 };
const FLIGHT = 0.34;
const BURST = 0.1;
/** All stacks but the best share this much time at most, however many there are. */
const MAX_FLIP_PHASE = 2.2;

export function revealSchedule(stacks: readonly RevealStack[]): RevealSchedule {
  const best = bestRarity(stacks);
  const rattle = DROP + RATTLE[best];
  const start = rattle + BURST;
  const flightAt: number[] = [];
  const n = stacks.length;
  const cap = n > 1 ? MAX_FLIP_PHASE / (n - 1) : GAP.common;
  let t = start;
  for (let i = 0; i < n; i++) {
    const s = stacks[i] as RevealStack;
    flightAt.push(t);
    const isLast = i === n - 1;
    // Anticipation: the best stack waits a beat longer than the rest.
    const gap = Math.min(GAP[s.rarity], cap);
    t += isLast ? 0 : gap + (i + 1 === n - 1 ? GAP[best] * 0.8 : 0);
  }
  const lastFlipAt = (flightAt[n - 1] ?? start) + FLIGHT;
  const hold = HOLD[best];
  return { rattle, flightAt, flight: FLIGHT, lastFlipAt, hold, total: lastFlipAt + hold };
}

export interface GridSlot {
  x: number;
  y: number;
}

/** Natural size of a reveal card's plate. The name is set under it at a fixed size on screen, whatever the scale. */
export const PLATE = { w: 116, h: 136 } as const;
/** Font size of a card's name on screen: never below the kit's body-text floor, never shrunk to fit. */
export const NAME_SIZE = 24;
export const NAME_LINE = 26;
/** Space between a plate and its name, and below the name. */
export const NAME_GAP = 8;
const NAME_PAD = 4;
const CELL_GAP = 10;
/** Room above the first row for the tape and tags that overhang a plate. */
const CREST = 22;
const MAX_SCALE = 1.5;
const MAX_COLS = 6;

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
 * that allows the biggest plates wins (fewer rows on a tie); a cell is as wide as its share of the area and carries
 * the name under the plate, so names keep their size and wrap in the cell instead of shrinking with the card.
 * `nameBlockFor` says how tall the names get when a cell is that wide (a long name wraps to a second line).
 */
export function gridLayout(n: number, w: number, h: number, nameBlockFor: (cellW: number) => number = () => nameBlockOf(1)): GridLayout {
  let best: GridLayout | null = null;
  for (let cols = 1; cols <= Math.min(Math.max(1, n), MAX_COLS); cols++) {
    const rows = Math.max(1, Math.ceil(n / cols));
    const cellW = (w - CELL_GAP * (cols - 1)) / cols;
    const nameBlock = nameBlockFor(cellW);
    const fitW = cellW / PLATE.w;
    const fitH = (h - CREST - CELL_GAP * (rows - 1) - rows * nameBlock) / (rows * PLATE.h);
    const scale = Math.max(0.1, Math.min(fitW, fitH, MAX_SCALE));
    if (best && (scale < best.scale - 1e-9 || (Math.abs(scale - best.scale) <= 1e-9 && rows >= best.rows))) continue;
    best = { cols, rows, scale, cellW, plateW: PLATE.w * scale, plateH: PLATE.h * scale, nameBlock, slots: [] };
  }
  const g = best as GridLayout;
  const rowH = g.plateH + g.nameBlock;
  const usedH = g.rows * rowH + (g.rows - 1) * CELL_GAP;
  const top = CREST + Math.max(0, (h - CREST - usedH) / 2);
  for (let i = 0; i < n; i++) {
    const row = Math.floor(i / g.cols);
    const inRow = Math.min(g.cols, n - row * g.cols);
    const col = i - row * g.cols;
    const rowW = inRow * g.cellW + (inRow - 1) * CELL_GAP;
    g.slots.push({ x: (w - rowW) / 2 + g.cellW / 2 + col * (g.cellW + CELL_GAP), y: top + g.plateH / 2 + row * (rowH + CELL_GAP) });
  }
  return g;
}
