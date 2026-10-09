import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Container, Sprite, Texture } from 'pixi.js';

// The baked textures need a renderer; the marks' logic does not.
vi.mock('@/core/assets', async (original) => ({ ...(await original<typeof import('@/core/assets')>()), hasTex: () => true, tex: () => Texture.WHITE }));

import { setFxSettings } from '@/fx/settings';
import { motion } from '@/ui';
import { UNIT_IDS, type DropAction, type UnitId } from '@/game/api';
import { auraScale, unitSpec } from '@/game';
import { CELL_COUNT, CELL_W, auraCells, cellCenterX, cellCenterY } from '@/game/geometry';
import {
  BADGE_BITS,
  BADGE_KINDS,
  BUFF_KINDS,
  BUFF_SLOT,
  BuffBoard,
  REACH,
  SOURCE,
  bitOf,
  boardWide,
  buffFacts,
  withOwnWard,
  chipsFit,
  giverCells,
  givesMask,
  kindCount,
  makePlan,
  planBuffs,
  previewMask,
  receivedMask,
  reachOf,
  type BoardCat,
  type BuffCat,
  type PlanIn,
} from '@/view/field/buffMath';
import { BuffMarks, RECENT_FOR } from '@/view/field/buffMarks';
import { BUFF_R } from '@/view/field/art';
import { CLASS_AT, FEET_DY, RANK_AT, SUN_AT, UnitView } from '@/view/field/unitView';
import type { FieldArt } from '@/view/field/art';
import type { FieldEnv } from '@/view/field/env';
import { newSim, put } from './simHelpers';

const DT = 1 / 60;
const sorted = (cells: readonly number[]): number[] => [...cells].sort((a, b) => a - b);

/** A board of cats from `{ cell: id }`, every cat at `level`, with its list of help worked out. */
function boardOf(layout: Record<number, UnitId>, level = 1): BuffBoard {
  const units: Array<BoardCat | null> = Array.from({ length: CELL_COUNT }, () => null);
  for (const [cell, id] of Object.entries(layout)) units[Number(cell)] = { id, level };
  const board = new BuffBoard();
  board.refresh(units);
  return board;
}

const at = (board: BuffBoard) => (cell: number): BuffCat | null => board.at(cell);

function planOf(board: BuffBoard, over: Partial<PlanIn> = {}): ReturnType<typeof makePlan> {
  return planBuffs({ unitAt: at(board), held: -1, hover: -1, action: null, selected: -1, recent: [], ...over }, makePlan());
}

const reached = (plan: ReturnType<typeof makePlan>): number[] => [...plan.cells].flatMap((v, c) => (v === REACH ? [c] : []));
const sources = (plan: ReturnType<typeof makePlan>): number[] => [...plan.cells].flatMap((v, c) => (v === SOURCE ? [c] : []));
const ghosts = (plan: ReturnType<typeof makePlan>): Record<number, number> => Object.fromEntries([...plan.ghost].flatMap((v, c) => (v !== 0 ? [[c, v]] : [])));

/** The cells a bell or a bard in `cell` reaches that are on the board: whatever shape the simulation gives that reach. */
const around = (cell: number): number[] => sorted(auraCells(cell, []));

describe('what a cat gives and what it receives', () => {
  it('reads what each trickster gives off its data: the bell speed and a ward, the bard damage, the lucky cat speed for the whole board, the others nothing', () => {
    expect(givesMask('t_bell')).toBe(bitOf('speed') | bitOf('ward'));
    expect(givesMask('t_bard')).toBe(bitOf('damage'));
    expect(givesMask('t_lucky')).toBe(bitOf('speed'));
    for (const id of ['t_chef', 't_alch', 'w_paw', 'r_star', 'm_cosmo'] as const) expect(givesMask(id), id).toBe(0);
    expect(boardWide('t_lucky')).toBe(true);
    expect(UNIT_IDS.filter((id) => boardWide(id))).toEqual(['t_lucky']);
  });

  it('badges two kinds, speed and damage: the ward is the dashed dome the cat already wears', () => {
    expect(BADGE_KINDS).toEqual(['speed', 'damage']);
    expect(BADGE_BITS).toBe(bitOf('speed') | bitOf('damage'));
    expect(BUFF_KINDS).toEqual(['speed', 'damage', 'ward']);
    expect(kindCount(0)).toBe(0);
    expect(kindCount(bitOf('speed') | bitOf('ward'))).toBe(2);
    expect(kindCount(bitOf('speed') | bitOf('damage') | bitOf('ward'))).toBe(3);
  });

  it('works out what each cat receives from the helpers around it, and who gives it', () => {
    const [bell, bard] = [7, 13];
    const board = boardOf({ [bell]: 't_bell', [bard]: 't_bard', 8: 'w_paw', 0: 'r_sling' });
    const near = board.at(8) as BuffCat;
    const wantMask = (auraCells(bell, []).includes(8) ? givesMask('t_bell') : 0) | (auraCells(bard, []).includes(8) ? givesMask('t_bard') : 0);
    expect(receivedMask(near)).toBe(wantMask);
    expect(receivedMask(board.at(0))).toBe(0);
    expect(receivedMask(board.at(5))).toBe(0);
    for (const t of auraCells(bell, [])) {
      const cat = board.at(t);
      if (!cat) continue;
      expect(cat.ward, `cell ${t}`).toBe(true);
      expect(cat.speed).toBeCloseTo(unitSpec('t_bell').aura.neighbourSpeed as number, 9);
      expect(cat.gifts.some((g) => g.fromCell === bell && g.fromUnit === 't_bell' && g.kind === 'speed')).toBe(true);
    }
  });

  it('adds up the strongest bell and the lucky cat, takes the strongest bard, and gives the lucky cat to every cat on the board', () => {
    const board = boardOf({ 6: 't_bell', 8: 't_bell', 7: 'w_paw', 12: 't_bard', 24: 't_lucky', 20: 'r_sling' }, 10);
    const bellOnce = (unitSpec('t_bell').aura.neighbourSpeed as number) * auraScale(unitSpec('t_bell'), 10);
    const luckyAll = (unitSpec('t_lucky').aura.boardSpeed as number) * auraScale(unitSpec('t_lucky'), 10);
    const paw = board.at(7) as BuffCat;
    // Two bells reach the cat in between: the simulation takes the stronger of them, not their sum.
    if (auraCells(6, []).includes(7) && auraCells(8, []).includes(7)) expect(paw.speed).toBeCloseTo(bellOnce + luckyAll, 9);
    // A cat no bell reaches still gets the lucky cat's speed, and so does the lucky cat itself.
    expect((board.at(20) as BuffCat).speed).toBeCloseTo(luckyAll, 9);
    expect((board.at(24) as BuffCat).speed).toBeCloseTo(luckyAll, 9);
    expect((board.at(20) as BuffCat).gifts.map((g) => g.fromUnit)).toEqual(['t_lucky']);
  });

  it('lists the cells of the tricksters that help a cat once each, and names each kind of help once', () => {
    const board = boardOf({ 7: 't_bell', 6: 'w_paw', 8: 't_bard', 24: 't_lucky' });
    const cat = board.at(7) as BuffCat;
    expect(giverCells(cat, [])).toContain(24);
    const facts = buffFacts(cat);
    expect(facts.map((f) => f.kind)).toEqual(BUFF_KINDS.filter((k) => facts.some((f) => f.kind === k)));
    const speed = facts.find((f) => f.kind === 'speed');
    expect(speed?.from).toEqual(['t_lucky']);
    expect(speed?.value).toBeCloseTo(unitSpec('t_lucky').aura.boardSpeed as number, 9);
    const damage = facts.find((f) => f.kind === 'damage');
    expect(damage !== undefined).toBe(auraCells(8, []).includes(7));
    expect(buffFacts(boardOf({ 0: 'w_paw' }).at(0) as BuffCat)).toEqual([]);
  });

  it('lists the ward a bell kitten gives itself (it dodges, though no other bell stands next to it)', () => {
    const board = boardOf({ 7: 't_bell', 6: 'w_paw' });
    const bell = buffFacts(board.at(7) as BuffCat);
    expect(bell.some((f) => f.kind === 'ward')).toBe(false);
    expect(withOwnWard(bell, 't_bell', 0.4).filter((f) => f.kind === 'ward')).toEqual([{ kind: 'ward', value: null, from: ['t_bell'] }]);
    // a cat another bell covers keeps that bell as the giver, and a cat that cannot dodge gets nothing
    const covered = buffFacts(board.at(6) as BuffCat);
    expect(withOwnWard(covered, 'w_paw', 0.4).filter((f) => f.kind === 'ward')[0]?.from).toEqual(['t_bell']);
    expect(withOwnWard([], 'w_paw', 0)).toEqual([]);
  });

  it('is rebuilt in place: the same records, and no new gifts once the pool has grown', () => {
    const units: Array<BoardCat | null> = Array.from({ length: CELL_COUNT }, () => null);
    units[7] = { id: 't_bell', level: 1 };
    units[8] = { id: 'w_paw', level: 1 };
    units[18] = { id: 't_lucky', level: 1 };
    const board = new BuffBoard();
    board.refresh(units);
    const first = board.at(8);
    const gifts = first?.gifts.slice();
    board.refresh(units);
    expect(board.at(8)).toBe(first);
    expect(board.at(8)?.gifts.length).toBe(gifts?.length);
    for (let i = 0; i < (gifts?.length ?? 0); i++) expect(board.at(8)?.gifts[i]).toBe(gifts?.[i]);
    units[7] = null;
    board.refresh(units);
    expect(board.at(7)).toBeNull();
    expect(receivedMask(board.at(8))).toBe(bitOf('speed'));
  });

  it('fits chips in order until the room is used up', () => {
    expect(chipsFit([80, 80, 30], 210, 10)).toBe(3);
    expect(chipsFit([80, 80, 30], 209, 10)).toBe(2);
    expect(chipsFit([80, 80, 30], 100, 10)).toBe(1);
    expect(chipsFit([80], 60, 10)).toBe(0);
    expect(chipsFit([], 60, 10)).toBe(0);
  });
});

describe('the reach of a helper, and what a cat would receive somewhere else', () => {
  it('is the cells the simulation reaches, and every other cell for the lucky cat', () => {
    expect(sorted(reachOf('t_bell', 7, []))).toEqual(around(7));
    expect(sorted(reachOf('t_bard', 0, []))).toEqual(around(0));
    expect(reachOf('t_lucky', 7, []).length).toBe(CELL_COUNT - 1);
    expect(reachOf('t_lucky', 7, [])).not.toContain(7);
    const board = boardOf({ 7: 't_bell', 8: 't_lucky' });
    expect(sorted((board.at(7) as BuffCat).reach)).toEqual(around(7));
    expect((board.at(8) as BuffCat).reach.length).toBe(CELL_COUNT - 1);
    // A cat that helps nobody reaches nothing.
    expect(boardOf({ 7: 'w_paw', 12: 't_chef' }).at(7)?.reach).toEqual([]);
    expect(boardOf({ 7: 'w_paw', 12: 't_chef' }).at(12)?.reach).toEqual([]);
  });

  it('agrees with the real simulation, at level 1 and at levels that strengthen the team effects', () => {
    for (const level of [1, 4, 7, 10]) {
      const sim = newSim({}, level);
      const bell = put(sim, 7, 't_bell');
      const bard = put(sim, 13, 't_bard');
      const paw = put(sim, 8, 'w_paw');
      const far = put(sim, 21, 'r_sling');
      const board = new BuffBoard();
      board.refresh(sim.units.map((u) => (u ? { id: u.id, level: u.level } : null)));
      for (const u of [bell, bard, paw, far]) {
        const cat = board.at(u.cell) as BuffCat;
        expect(cat.speed, `speed of ${u.id} at level ${level}`).toBeCloseTo(u.buffAttackSpeed, 9);
        expect(cat.damage, `damage of ${u.id} at level ${level}`).toBeCloseTo(u.buffDamage, 9);
        expect(cat.ward, `ward of ${u.id} at level ${level}`).toBe(u.shielded);
      }
      expect(auraScale(unitSpec('t_bell'), level)).toBeCloseTo(1 + bell.perk.aura, 12);
      expect(auraScale(unitSpec('t_bard'), level)).toBeCloseTo(1 + bard.perk.aura, 12);
    }
  });

  it('agrees with the real simulation about the lucky cat: every cat attacks faster by exactly its number', () => {
    for (const level of [1, 7, 10]) {
      const sim = newSim({}, level);
      const cat = put(sim, 0, 'r_sling');
      const before = cat.stats.interval;
      const lucky = put(sim, 22, 't_lucky');
      const speed = before / cat.stats.interval - 1;
      const board = new BuffBoard();
      board.refresh(sim.units.map((u) => (u ? { id: u.id, level: u.level } : null)));
      expect((board.at(0) as BuffCat).speed, `level ${level}`).toBeCloseTo(speed, 9);
      expect(lucky.stats.interval).toBeCloseTo(unitSpec('t_lucky').base.interval / (1 + speed), 9);
    }
  });

  it('agrees with the real simulation about which cells a bell reaches: the cells it shields', () => {
    for (const cell of [0, 4, 7, 12, 20, 24]) {
      const sim = newSim();
      put(sim, cell, 't_bell');
      for (let c = 0; c < CELL_COUNT; c++) if (c !== cell) put(sim, c, 'w_paw');
      const shielded = sim.units.flatMap((u, c) => (u?.shielded ? [c] : []));
      expect(sorted(shielded), `bell in ${cell}`).toEqual(around(cell));
    }
  });

  it('says what a cat would receive in a cell from the helpers around it, leaving out the one that is being lifted', () => {
    const board = boardOf({ 7: 't_bell', 13: 't_bard' });
    const unitAt = at(board);
    const bellReach = auraCells(7, []);
    const bardReach = auraCells(13, []);
    const bothCell = bellReach.find((c) => bardReach.includes(c)) as number;
    expect(previewMask(unitAt, bothCell, -1)).toBe(givesMask('t_bell') | givesMask('t_bard'));
    expect(previewMask(unitAt, bothCell, 13)).toBe(givesMask('t_bell'));
    expect(previewMask(unitAt, bothCell, 7)).toBe(givesMask('t_bard'));
    expect(previewMask(unitAt, 24, -1)).toBe(0);
    // A helper does not help the cell it stands in.
    expect(previewMask(unitAt, 7, -1) & givesMask('t_bell')).toBe(0);
  });
});

describe('what the board shows', () => {
  const crowd = boardOf({ 1: 'w_paw', 2: 'w_sword', 7: 't_bell', 8: 'r_sling', 12: 'r_ninja', 13: 't_bard', 14: 'm_storm', 18: 't_alch' });

  it('shows nothing when nothing is held, selected or new', () => {
    const plan = planOf(crowd);
    expect(reached(plan)).toEqual([]);
    expect(sources(plan)).toEqual([]);
    expect(ghosts(plan)).toEqual({});
  });

  it('shows the reach of a selected helper, its own cell marked apart', () => {
    const lone = boardOf({ 1: 'w_paw', 7: 't_bell', 8: 'r_sling' });
    const plan = planOf(lone, { selected: 7 });
    expect(sources(plan)).toEqual([7]);
    expect(reached(plan)).toEqual(around(7));
  });

  it('shows the reach of the helper of a selected cat that is being helped, and of every helper when there are two', () => {
    const one = planOf(crowd, { selected: 1 });
    expect(sources(one)).toEqual(auraCells(7, []).includes(1) ? [7] : []);
    const both = boardOf({ 6: 't_bell', 12: 't_bard', 7: 'w_paw' });
    const helpers = [6, 12].filter((h) => auraCells(h, []).includes(7));
    expect(sources(planOf(both, { selected: 7 }))).toEqual(helpers);
    // The cat itself stands in a reach, so it is lit.
    if (helpers.length > 0) expect(planOf(both, { selected: 7 }).cells[7]).toBe(REACH);
  });

  it('shows nothing for a selected cat that neither helps nor is helped', () => {
    const alone = boardOf({ 0: 'w_paw', 24: 'r_sling' });
    const plan = planOf(alone, { selected: 0 });
    expect(reached(plan)).toEqual([]);
    expect(sources(plan)).toEqual([]);
  });

  it('shows the reach of a helper for a moment after it was placed or moved, and not for one that was not', () => {
    expect(sources(planOf(crowd, { recent: [13] }))).toEqual([13]);
    expect(sources(planOf(crowd, { recent: [1] }))).toEqual([]);
    expect(sources(planOf(crowd, { recent: [0] }))).toEqual([]);
  });

  it('shows the whole board for a lucky cat that was just placed', () => {
    const board = boardOf({ 3: 't_lucky', 5: 'w_paw' });
    const plan = planOf(board, { recent: [3] });
    expect(sources(plan)).toEqual([3]);
    expect(reached(plan).length).toBe(CELL_COUNT - 1);
  });

  it('follows the finger while a helper is dragged: the reach is where it would stand, with a ghost on the cats that lack that help there', () => {
    const board = boardOf({ 6: 'w_viking', 7: 't_bell', 11: 'w_samurai', 13: 't_bard', 16: 'r_star' });
    const plan = planOf(board, { held: 13, hover: 10, action: 'move' });
    expect(sources(plan)).toEqual([10]);
    expect(reached(plan)).toEqual(around(10));
    const g = ghosts(plan);
    for (const c of around(10)) {
      const other = board.at(c);
      if (!other) continue;
      // A badge only for what the cat does not have yet, and never for the ward.
      expect(g[c], `cell ${c}`).toBe(bitOf('damage') & ~receivedMask(other));
    }
  });

  it('shows where a dragged helper came from when the drop would be refused or the finger is off the board', () => {
    const board = boardOf({ 7: 't_bell', 8: 'w_paw' });
    expect(sources(planOf(board, { held: 7, hover: -1, action: null }))).toEqual([7]);
    expect(sources(planOf(board, { held: 7, hover: 3, action: 'none' }))).toEqual([7]);
    expect(sources(planOf(board, { held: 7, hover: 3, action: 'move' }))).toEqual([3]);
  });

  it('a merge shows the reach of the cat the merge makes, and no reach when the result helps nobody', () => {
    // Two paws merge into a sword, who has no reach.
    const board = boardOf({ 7: 'w_paw', 8: 'w_paw', 12: 't_bell' });
    const merged = planOf(board, { held: 7, hover: 8, action: 'merge' as DropAction });
    expect(reached(merged)).toEqual([]);
    expect(sources(merged)).toEqual([]);
  });

  it('shows on each empty cell what the dragged cat would receive there, from the helpers still on the board', () => {
    const board = boardOf({ 7: 't_bell', 12: 'r_ninja', 13: 't_bard', 0: 'w_paw' });
    const plan = planOf(board, { held: 0, hover: 3, action: 'move' });
    const g = ghosts(plan);
    const bellReach = auraCells(7, []);
    const bardReach = auraCells(13, []);
    for (let c = 0; c < CELL_COUNT; c++) {
      if (board.at(c) !== null) continue;
      const want = ((bellReach.includes(c) ? bitOf('speed') : 0) | (bardReach.includes(c) ? bitOf('damage') : 0)) & BADGE_BITS;
      expect(g[c] ?? 0, `cell ${c}`).toBe(want);
    }
    // No helper is dragged: no reach is drawn.
    expect(reached(plan)).toEqual([]);
    // A cat that is itself a helper does not count for the cells it is lifted from.
    const lifted = planOf(board, { held: 13, hover: 3, action: 'move' });
    for (const c of bardReach) if (board.at(c) === null && !bellReach.includes(c)) expect(ghosts(lifted)[c]).toBeUndefined();
  });
});

// ───────────────────────────── the view ─────────────────────────────

const white = (): Texture => new Texture({ source: Texture.WHITE.source });
const art = {
  tileFill: white(),
  reachFrame: white(),
  toyFrame: [white(), white(), white()],
  buffBadge: { speed: white(), damage: white() },
  buffRing: white(),
  shadow: white(),
  rank: { common: white(), rare: white(), epic: white(), legendary: white(), mythic: white() },
  badge: { warrior: white(), ranger: white(), mage: white(), trickster: white() },
  shield: white(),
  noAct: white(),
  sunMark: white(),
} as unknown as FieldArt;

interface FakeUnit {
  uid: number;
  id: UnitId;
  level: number;
  cell: number;
}

interface World {
  units: Array<FakeUnit | null>;
  selected: number | null;
  shown: Set<number>;
  buffs: BuffBoard;
}

function makeWorld(): { env: FieldEnv; world: World } {
  const world: World = { units: Array.from({ length: CELL_COUNT }, () => null), selected: null, shown: new Set(), buffs: new BuffBoard() };
  const battle = { units: world.units, dropAction: (): DropAction => 'move' };
  const ctx = {
    get selected(): number | null {
      return world.selected;
    },
    unitView: (uid: number) => (world.shown.has(uid) ? ({ visible: true } as Container) : null),
  };
  return { env: { battle, ctx, buffs: world.buffs } as unknown as FieldEnv, world };
}

let nextUid = 1;
/** Puts a cat on the fake board. */
function stand(world: World, cell: number, id: UnitId, visible = true): FakeUnit {
  const u: FakeUnit = { uid: nextUid++, id, level: 1, cell };
  world.units[cell] = u;
  if (visible) world.shown.add(u.uid);
  return u;
}

function build(): { marks: BuffMarks; world: World; floor: Container; layer: Container; run: (seconds: number, held?: number, hover?: number) => void } {
  const { env, world } = makeWorld();
  const floor = new Container();
  const layer = new Container();
  const marks = new BuffMarks(env, floor, layer, art);
  const run = (seconds: number, held = -1, hover = -1): void => {
    for (let t = 0; t < seconds - 1e-9; t += DT) {
      world.buffs.refresh(world.units);
      marks.update(DT, held, hover);
    }
  };
  return { marks, world, floor, layer, run };
}

/** The sprites of cell `c`: its tint (on the floor), its frame and its ghost badges (in the layer). */
function spritesOf(floor: Container, layer: Container, c: number): { tint: Sprite; frame: Sprite; ghost: Sprite[] } {
  const tints = (floor.children[0] as Container).children as Sprite[];
  const root = layer.children[0] as Container;
  const frames = (root.children[0] as Container).children as Sprite[];
  const ghosts = (root.children[1] as Container).children as Sprite[];
  const n = BADGE_KINDS.length;
  return { tint: tints[c] as Sprite, frame: frames[c] as Sprite, ghost: BADGE_KINDS.map((_, k) => ghosts[c * n + k] as Sprite) };
}

beforeEach(() => {
  setFxSettings({ reducedMotion: false });
  nextUid = 1;
});

afterEach(() => {
  setFxSettings({ reducedMotion: false });
});

describe('the reach on the board', () => {
  it('frames the cells a selected helper reaches in a dotted frame, its own cell in a solid one, and nothing else', () => {
    const { marks, world, floor, layer, run } = build();
    stand(world, 7, 't_bell');
    stand(world, 8, 'w_paw');
    run(0.1);
    world.selected = 7;
    run(1);
    const reach = auraCells(7, []);
    for (let c = 0; c < CELL_COUNT; c++) {
      const s = spritesOf(floor, layer, c);
      const on = c === 7 || reach.includes(c);
      expect(s.frame.visible, `frame ${c}`).toBe(on);
      expect(s.tint.visible, `tint ${c}`).toBe(on);
    }
    expect(spritesOf(floor, layer, 7).frame.texture).toBe(art.toyFrame[0]);
    expect(spritesOf(floor, layer, reach[0] as number).frame.texture).toBe(art.reachFrame);
    expect(spritesOf(floor, layer, 7).frame.alpha).toBeGreaterThan(spritesOf(floor, layer, reach[0] as number).frame.alpha * 0.9);
    expect(spritesOf(floor, layer, reach[0] as number).tint.alpha).toBeLessThan(0.3);
    world.selected = null;
    run(1);
    expect(spritesOf(floor, layer, reach[0] as number).frame.visible).toBe(false);
    marks.destroy();
  });

  it('shows the reach of a helper that is placed after the field opened for a moment, once its picture is there, and then lets go', () => {
    const { marks, world, floor, layer, run } = build();
    stand(world, 18, 't_bard');
    run(0.5);
    // A helper that was there when the field opened is simply there: nothing is shown for it.
    expect(spritesOf(floor, layer, 18).frame.visible).toBe(false);
    // A new one whose picture is not on the board yet shows nothing; when it is, its reach shows.
    const late = stand(world, 7, 't_bell', false);
    const sample = auraCells(7, [])[0] as number;
    run(0.5);
    expect(spritesOf(floor, layer, sample).frame.visible).toBe(false);
    world.shown.add(late.uid);
    run(0.4);
    expect(spritesOf(floor, layer, sample).frame.visible).toBe(true);
    expect(spritesOf(floor, layer, 7).frame.visible).toBe(true);
    run(RECENT_FOR + 0.6);
    expect(spritesOf(floor, layer, sample).frame.visible).toBe(false);
    // Moving it shows its reach again, at the new cell.
    world.units[7] = null;
    world.units[0] = { ...late, cell: 0 };
    run(1);
    expect(spritesOf(floor, layer, 0).frame.visible).toBe(true);
    expect(spritesOf(floor, layer, sample).frame.visible).toBe(auraCells(0, []).includes(sample));
    marks.destroy();
  });

  it('under reduced motion the reach is simply on or off, at full strength', () => {
    setFxSettings({ reducedMotion: true });
    const { marks, world, floor, layer, run } = build();
    stand(world, 7, 't_bell');
    run(0.1);
    world.selected = 7;
    run(DT * 2);
    const s = spritesOf(floor, layer, auraCells(7, [])[0] as number);
    expect(s.frame.visible).toBe(true);
    expect(s.frame.scale.x).toBe(1);
    world.selected = null;
    run(DT * 2);
    expect(spritesOf(floor, layer, auraCells(7, [])[0] as number).frame.visible).toBe(false);
    marks.destroy();
  });

  it('puts a ghost badge in the badge slot the cat would wear it in: after the real ones on a cat, from the top on an empty cell', () => {
    const { marks, world, floor, layer, run } = build();
    stand(world, 7, 't_bell');
    stand(world, 13, 't_bard');
    // A cat the bell reaches and the bard does not yet, and a free cell where the bard would reach it: the cat already wears the speed
    // badge, so a ghost of the bard's damage comes second.
    let cat = -1;
    let hover = -1;
    for (const c of auraCells(7, [])) {
      if (c === 13 || auraCells(13, []).includes(c)) continue;
      for (let h = 0; h < CELL_COUNT && hover < 0; h++) if (h !== 7 && h !== 13 && h !== c && auraCells(h, []).includes(c)) [cat, hover] = [c, h];
      if (cat >= 0) break;
    }
    stand(world, cat, 'w_viking');
    run(0.1);
    run(0.6, 13, hover);
    const ghost = spritesOf(floor, layer, cat).ghost[1] as Sprite;
    expect(ghost.visible).toBe(true);
    expect(ghost.alpha).toBeLessThan(0.7);
    expect(ghost.x).toBe(cellCenterX(cat) + BUFF_SLOT.x);
    expect(ghost.y).toBeCloseTo(cellCenterY(cat) + FEET_DY + BUFF_SLOT.y + BUFF_SLOT.step, 3);
    // An empty cell next to the bell: what a cat landing there would get, from the top.
    const empty = auraCells(7, []).find((c) => world.units[c] === null && c !== hover) as number;
    const sprites = spritesOf(floor, layer, empty);
    expect(sprites.ghost[0]?.visible).toBe(true);
    expect(sprites.ghost[0]?.y).toBeCloseTo(cellCenterY(empty) + FEET_DY + BUFF_SLOT.y, 3);
    expect(sprites.ghost[1]?.visible).toBe(false);
    // Put down: the ghosts fade away.
    run(1);
    expect(spritesOf(floor, layer, cat).ghost[1]?.visible).toBe(false);
    expect(spritesOf(floor, layer, empty).ghost[0]?.visible).toBe(false);
    marks.destroy();
  });

  it('is pooled: nothing is added while helpers come and go', () => {
    const { marks, world, floor, layer, run } = build();
    const count = (): number => floor.children[0]!.children.length + layer.children[0]!.children[0]!.children.length + layer.children[0]!.children[1]!.children.length;
    const before = count();
    stand(world, 7, 't_bell');
    stand(world, 8, 'w_paw');
    run(0.3);
    world.selected = 7;
    run(0.5, -1, -1);
    run(0.5, 7, 3);
    world.units[7] = null;
    run(0.5);
    expect(count()).toBe(before);
    expect(before).toBe(CELL_COUNT * (2 + BADGE_KINDS.length));
    marks.destroy();
  });
});

describe('the badge column on a cat leaves the other stickers alone', () => {
  // A cat's stickers, measured from its feet (unitView.ts and art.ts): the badge is BUFF_R wide each way, the slots are BUFF_SLOT.
  const HALF = BUFF_R;
  const badgeBox = (i: number): { x0: number; x1: number; y0: number; y1: number } => ({
    x0: BUFF_SLOT.x - HALF,
    x1: BUFF_SLOT.x + HALF,
    y0: BUFF_SLOT.y + BUFF_SLOT.step * i - HALF,
    y1: BUFF_SLOT.y + BUFF_SLOT.step * i + HALF,
  });
  /** The sun sticker's circle (position and size as in `UnitView`: a 19 px sticker at 0.8). */
  const SUN = { x: SUN_AT.x, y: SUN_AT.y, r: 19 * 0.8 };
  const nearest = (b: { x0: number; x1: number; y0: number; y1: number }, x: number, y: number): number =>
    Math.hypot(Math.max(b.x0 - x, 0, x - b.x1), Math.max(b.y0 - y, 0, y - b.y1));
  /** The rank tag is a stadium: its middle segment at `RANK_AT` and a radius of 13, as long as `24 + 13 * pips` (`bakeRanks`). */
  const insideTag = (x: number, y: number, pips: number): boolean => {
    const half = (24 + 13 * pips) / 2 - 13;
    return Math.hypot(Math.max(Math.abs(x) - half, 0), y - RANK_AT) < 13;
  };

  it('stacks the badges from the top with no gap and no overlap, on the right flank of the cell', () => {
    for (let i = 0; i < BADGE_KINDS.length - 1; i++) expect(badgeBox(i + 1).y0 - badgeBox(i).y1).toBeCloseTo(0, 5);
    for (let i = 0; i < BADGE_KINDS.length; i++) expect(badgeBox(i).x1).toBeLessThanOrEqual(CELL_W / 2);
    expect(badgeBox(0).x0).toBeGreaterThan(0);
  });

  it('keeps clear of the sun sticker above it', () => {
    expect(nearest(badgeBox(0), SUN.x, SUN.y)).toBeGreaterThan(SUN.r);
  });

  it('keeps clear of the rank tag below it for every rank, the longest tag included', () => {
    const bottom = badgeBox(BADGE_KINDS.length - 1);
    // The badge is a rounded square (`drawBuffMark`: corners of 0.55 of the half width).
    const round = 0.55 * HALF;
    const insideBadge = (x: number, y: number): boolean => {
      const cx = Math.min(Math.max(x, bottom.x0 + round), bottom.x1 - round);
      const cy = Math.min(Math.max(y, bottom.y0 + round), bottom.y1 - round);
      return Math.hypot(x - cx, y - cy) <= round;
    };
    for (let pips = 1; pips <= 5; pips++) {
      for (let x = bottom.x0; x <= bottom.x1; x += 0.5) {
        for (let y = bottom.y0; y <= bottom.y1; y += 0.5) {
          if (insideBadge(x, y)) expect(insideTag(x, y, pips), `${pips} pips at ${x}, ${y}`).toBe(false);
        }
      }
    }
  });

  it('keeps clear of the class sticker at the left foot (radius 16)', () => {
    for (let i = 0; i < BADGE_KINDS.length; i++) expect(nearest(badgeBox(i), CLASS_AT.x, CLASS_AT.y)).toBeGreaterThan(16);
  });
});

describe('the badges on a cat', () => {
  const state = (): never =>
    ({ uid: 1, id: 'w_paw', cell: 8, charge: 0, blocked: false, weakened: 0, sunlit: false, shielded: false, stats: { interval: 1, damage: 1, range: 1, crit: 0, critMult: 2 } }) as never;
  const SPEED = bitOf('speed');
  const DAMAGE = bitOf('damage');

  function makeView(): { view: UnitView; ring: () => Sprite } {
    const view = new UnitView(art);
    view.assign(state(), art);
    // The ring round the shadow is the second child of the deco (shadow, ring, rank).
    return { view, ring: () => (view.root.children[0] as Container).children[1] as Sprite };
  }

  /** The badges: the last of the sprites of the root before `overhead` (the sun sticker and the others come before them). */
  const badges = (view: UnitView): Sprite[] => view.root.children.filter((c): c is Sprite => c instanceof Sprite).slice(-BADGE_KINDS.length);

  afterEach(() => {
    motion.reduced = false;
  });

  it('wears a badge for each kind it receives from a trickster, a tidy column from the top, and none for the ward', () => {
    const { view } = makeView();
    for (let i = 0; i < 120; i++) view.step(DT, i * DT, state(), false, SPEED | DAMAGE | bitOf('ward'));
    const [speed, damage] = badges(view);
    expect(speed?.visible).toBe(true);
    expect(damage?.visible).toBe(true);
    expect(speed?.x).toBe(BUFF_SLOT.x);
    expect(speed?.y).toBeCloseTo(BUFF_SLOT.y, 1);
    expect(damage?.y).toBeCloseTo(BUFF_SLOT.y + BUFF_SLOT.step, 1);
    expect(speed?.scale.x).toBeCloseTo(1, 1);
    // On the right flank, clear of the class sticker (left) and the rank tag (middle, below).
    expect(speed?.x).toBeGreaterThan(30);
    const only = makeView().view;
    for (let i = 0; i < 120; i++) only.step(DT, i * DT, state(), false, bitOf('ward'));
    expect(badges(only).every((b) => !b.visible)).toBe(true);
  });

  it('pops a badge in when its buff starts and shrinks it away when it stops, the others closing the gap', () => {
    const { view } = makeView();
    for (let i = 0; i < 90; i++) view.step(DT, i * DT, state(), false, 0);
    const [speed, damage] = badges(view);
    expect(speed?.visible).toBe(false);
    // Starts: it is small and swells past its size before it settles.
    let peak = 0;
    let early = 0;
    for (let i = 0; i < 90; i++) {
      view.step(DT, 2 + i * DT, state(), false, SPEED | DAMAGE);
      if (i === 0) early = speed?.scale.x ?? 0;
      peak = Math.max(peak, speed?.scale.x ?? 0);
    }
    expect(early).toBeLessThan(0.7);
    expect(peak).toBeGreaterThan(1.02);
    expect(speed?.scale.x).toBeCloseTo(1, 2);
    // Stops: the speed badge shrinks to nothing and the damage badge slides up into the first place.
    for (let i = 0; i < 120; i++) view.step(DT, 4 + i * DT, state(), false, DAMAGE);
    expect(speed?.visible).toBe(false);
    expect(damage?.y).toBeCloseTo(BUFF_SLOT.y, 1);
  });

  it('breathes a ring round the shadow while it is buffed, and wears nothing while it is held or has left', () => {
    const { view, ring } = makeView();
    for (let i = 0; i < 90; i++) view.step(DT, i * DT, state(), false, 0);
    expect(ring().alpha).toBe(0);
    let lo = 1;
    let hi = 0;
    for (let i = 0; i < 360; i++) {
      view.step(DT, 2 + i * DT, state(), false, SPEED);
      if (i > 120) {
        lo = Math.min(lo, ring().alpha);
        hi = Math.max(hi, ring().alpha);
      }
    }
    expect(lo).toBeGreaterThan(0.15);
    expect(hi).toBeGreaterThan(lo + 0.2);
    expect(hi).toBeLessThan(0.9);
    // Lifted by a finger: the badges and the ring go.
    view.dragging = true;
    for (let i = 0; i < 120; i++) view.step(DT, 9 + i * DT, state(), false, SPEED);
    expect(badges(view)[0]?.visible).toBe(false);
    expect(ring().alpha).toBe(0);
    // Put down: they come back; a view that has left the board is stepped with no unit, and loses them.
    view.dragging = false;
    for (let i = 0; i < 120; i++) view.step(DT, 12 + i * DT, state(), false, SPEED);
    expect(badges(view)[0]?.visible).toBe(true);
    for (let i = 0; i < 120; i++) view.step(DT, 15 + i * DT, null, false, SPEED);
    expect(badges(view)[0]?.visible).toBe(false);
  });

  it('under reduced motion a badge is simply there at full size, and a recycled view starts clean', () => {
    motion.reduced = true;
    const { view } = makeView();
    view.step(DT, 0, state(), false, SPEED);
    const [speed] = badges(view);
    expect(speed?.visible).toBe(true);
    expect(speed?.scale.x).toBe(1);
    view.assign(state(), art);
    expect(badges(view).every((b) => !b.visible)).toBe(true);
  });
});
