/** Pure plan of the chest reveal: which card stacks come out, in what order, how fast, and where they land. */
import { RARITY_OF, UNITS_BY_RARITY } from '@/meta/units';
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
}

/** Merge the stored results of one pile into the view the reveal plays (one chest, one rattle, one summary). */
export function mergePile(results: readonly ChestResult[]): Pile {
  const first = results[0];
  const pile: Pile = { kind: first ? first.kind : 'wooden', count: results.length, cards: [], bonuses: [], overflowGold: 0, ids: [] };
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

export interface Burst {
  /** Seconds from the first frame. */
  at: number;
  dur: number;
  /** 0..1: how hard the chest rattles and how much light leaks, rising burst by burst. */
  power: number;
}

export interface RevealSchedule {
  /** Seconds of the fall: the chest lands (squash, dust, shake) at `drop`. */
  drop: number;
  /** The rattles, each stronger than the one before. */
  bursts: Burst[];
  /** The rattling stops: the chest holds still while the lid creeps open (the creak). */
  freezeAt: number;
  /** The lid flies open: the open sprite, the flash, the rays, the stars and the paper. */
  pop: number;
  /** Start time of each stack's flight (same order as the stacks), measured from the first frame. */
  flightAt: number[];
  /** Seconds each flight and flip takes. */
  flight: number;
  /** When the last flip has landed (the best card is held for `hold` seconds after). */
  lastFlipAt: number;
  hold: number;
  total: number;
}

const DROP = 0.26;
/** Quiet moment after the landing before the first rattle, and between two rattles. */
const REST = 0.08;
const BURST_GAP = 0.06;
const BURST_LEN = [0.28, 0.32, 0.36] as const;
/** Rattles by the best rarity inside: a better chest makes you wait through one more. */
const BURSTS: Record<ChestRarity, number> = { common: 2, rare: 2, epic: 3, legendary: 3 };
/** The beat of stillness before the pop. The open sound creaks for `CREAK` seconds and then pops, so it starts that long before the pop. */
const FREEZE: Record<ChestRarity, number> = { common: 0.3, rare: 0.3, epic: 0.32, legendary: 0.42 };
export const CREAK = 0.3;
/** From the pop to the first card leaving the opening. */
const POP_TO_CARD = 0.14;
/** Pause on the best stack. */
const HOLD: Record<ChestRarity, number> = { common: 0, rare: 0.15, epic: 0.45, legendary: 0.9 };
const GAP: Record<ChestRarity, number> = { common: 0.1, rare: 0.14, epic: 0.2, legendary: 0.3 };
const FLIGHT = 0.34;
/** All stacks but the best share this much time at most, however many there are. */
const MAX_FLIP_PHASE = 2.2;

export function revealSchedule(stacks: readonly RevealStack[]): RevealSchedule {
  const best = bestRarity(stacks);
  const count = BURSTS[best];
  const bursts: Burst[] = [];
  let t = DROP + REST;
  for (let i = 0; i < count; i++) {
    const dur = BURST_LEN[i] as number;
    bursts.push({ at: t, dur, power: count === 2 ? (i === 0 ? 0.55 : 1) : ([0.4, 0.7, 1][i] as number) });
    t += dur + BURST_GAP;
  }
  const freezeAt = t - BURST_GAP;
  const pop = freezeAt + FREEZE[best];
  const start = pop + POP_TO_CARD;
  const flightAt: number[] = [];
  const n = stacks.length;
  const cap = n > 1 ? MAX_FLIP_PHASE / (n - 1) : GAP.common;
  t = start;
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
  return { drop: DROP, bursts, freezeAt, pop, flightAt, flight: FLIGHT, lastFlipAt, hold, total: lastFlipAt + hold };
}

/** The chest's pose in one frame: where it is, how it is squashed, how far its lid stands open and how much light leaks. */
export interface ChestPose {
  /** Offsets from the resting place, design px: down is positive. */
  x: number;
  y: number;
  rot: number;
  /** Squash and stretch about the foot of the chest. */
  sx: number;
  sy: number;
  /** Pixels the lid stands off the body. */
  crack: number;
  /** 0..1: how strong the light along the seam is. It steps up with every rattle and never falls back below the step it reached. */
  light: number;
  /** Swing of the tag hanging from the lock, radians. */
  tag: number;
}

export function newPose(): ChestPose {
  return { x: 0, y: 0, rot: 0, sx: 1, sy: 1, crack: 0, light: 0, tag: 0 };
}

/** The hairline of light on the seam from the first frame, and how wide the lid stands at the very end of the creak. */
const SEAM_LIGHT = 0.2;
const SEAM_CRACK = 1;
const CREAK_CRACK = 22;
const LANDING_RATE = 11;
const LANDING_HZ = 34;

function smooth(k: number): number {
  const u = Math.min(1, Math.max(0, k));
  return u * u * (3 - 2 * u);
}

/**
 * The pose of a closed chest `t` seconds after the first frame: it falls from `dropFrom` px up, lands with a squash that
 * springs back, rattles in the schedule's bursts (tilt, hop and sideways shake; the lid and the light rise a step each time and
 * never drop back below it), then holds still while the lid creeps open. Pure: it fills `out` and allocates nothing.
 */
export function chestPoseAt(out: ChestPose, t: number, sch: RevealSchedule, dropFrom: number): ChestPose {
  out.x = out.rot = out.tag = out.y = 0;
  out.sx = out.sy = 1;
  if (t < sch.drop) {
    const k = Math.max(0, t / sch.drop);
    out.y = -dropFrom * (1 - k * k);
    out.sy = 1 + 0.06 * k;
    out.sx = 1 - 0.03 * k;
    out.crack = SEAM_CRACK;
    out.light = SEAM_LIGHT;
    return out;
  }
  const tau = t - sch.drop;
  const squash = Math.exp(-LANDING_RATE * tau) * Math.cos(LANDING_HZ * tau);
  out.sx = 1 + 0.15 * squash;
  out.sy = 1 - 0.18 * squash;

  let crack = SEAM_CRACK;
  let light = SEAM_LIGHT;
  for (let i = 0; i < sch.bursts.length; i++) {
    const b = sch.bursts[i] as Burst;
    if (t < b.at) break;
    const peakCrack = 3 + 11 * b.power;
    const peakLight = 0.4 + 0.6 * b.power;
    const u = (t - b.at) / b.dur;
    // The lid stays a little ajar and the light a little brighter after each rattle.
    crack = Math.max(crack, 0.45 * peakCrack);
    light = Math.max(light, 0.5 * peakLight);
    if (u > 1) continue;
    const env = Math.min(1, u * 7) * (u > 0.78 ? (1 - u) / 0.22 : 1);
    const ph = (t - b.at) * (14 + 6 * b.power) * Math.PI * 2;
    out.x += Math.sin(ph) * env * (3 + 9 * b.power);
    out.rot += Math.sin(ph * 0.5 + i) * env * (0.025 + 0.06 * b.power);
    out.y -= Math.abs(Math.sin(Math.PI * (2 + i) * u)) * env * (4 + 16 * b.power);
    crack = Math.max(crack, peakCrack * env);
    light = Math.max(light, peakLight * env);
  }
  if (t >= sch.freezeAt) {
    const f = smooth((t - sch.freezeAt) / Math.max(0.01, sch.pop - sch.freezeAt));
    // Still, tense, a hair squashed; the lid creeps up with a tremble; the light swells to full.
    crack += (CREAK_CRACK - crack) * f + Math.sin(t * 90) * 0.8 * f;
    light += (1 - light) * f;
    out.sy = Math.min(out.sy, 1 - 0.04 * f);
    out.sx = Math.max(out.sx, 1 + 0.02 * f);
  }
  out.crack = crack;
  out.light = light;
  out.tag = -out.rot * 3 + Math.sin(t * 8) * 0.08 * light;
  return out;
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
