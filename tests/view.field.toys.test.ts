import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Container, Texture, type Sprite } from 'pixi.js';

// The baked textures need a renderer; the marks' logic does not.
vi.mock('@/view/field/art', () => ({
  TOY_INSETS: [4, 9, 14],
  toyChip: () => Texture.WHITE,
  toyBadge: () => Texture.WHITE,
}));
vi.mock('@/core/assets', async (original) => ({ ...(await original<typeof import('@/core/assets')>()), hasTex: () => true, tex: () => Texture.WHITE }));

import { setFxSettings } from '@/fx/settings';
import { RELIC_IDS, type RelicId, type UnitId } from '@/game/api';
import { BOARD_X, BOARD_Y, CELL_COUNT, CELL_H, CELL_W, COLS, ROWS, cellCenterX, cellCenterY, cellIndex, isEdgeCell } from '@/game/geometry';
import { TOY_FLIGHT } from '@/view/timing';
import { info, type InfoContent, type InfoView } from '@/view/info';
import { LIGHT_FOR, ToyMarks, pulse, reveal, toyOfKey } from '@/view/field/toyMarks';
import { MAX_TOYS, boosts, coverage, depthOf, positionalToys, toyCells, toyColor, toyShape } from '@/view/field/toyCells';
import type { FieldArt } from '@/view/field/art';
import type { FieldEnv } from '@/view/field/env';

const DT = 1 / 60;
/** The class of a cat on a board given as `{ cell: class index }`; empty cells are -1. */
const classes = (board: Record<number, number>) => (cell: number): number => board[cell] ?? -1;
const NOBODY = classes({});

describe('which toys mark the board, and the cells each one boosts', () => {
  it('the tower boosts the top row, the five cells of row 0, cats or none', () => {
    expect(toyShape('cat_tower')).toBe('row');
    expect(toyCells('cat_tower', NOBODY, [])).toEqual([0, 1, 2, 3, 4]);
    expect(toyCells('cat_tower', classes({ 7: 0 }), [])).toEqual([0, 1, 2, 3, 4]);
  });

  it('the window perch boosts the outer ring of the board and not the cells inside it', () => {
    expect(toyShape('window_perch')).toBe('ring');
    const cells = toyCells('window_perch', NOBODY, []);
    expect(cells.length).toBe(COLS * ROWS - (COLS - 2) * (ROWS - 2));
    expect(cells.length).toBe(16);
    for (const c of cells) expect(isEdgeCell(c)).toBe(true);
    const inner = [6, 7, 8, 11, 12, 13, 16, 17, 18];
    for (const c of inner) expect(cells).not.toContain(c);
    expect(cells).toContain(cellIndex(0, 0));
    expect(cells).toContain(cellIndex(COLS - 1, ROWS - 1));
  });

  it('the kneading cushion boosts the cats that stand next to a cat of their own class, and nothing else', () => {
    expect(toyShape('kneading_cushion')).toBe('pairs');
    // Two warriors side by side (cells 1 and 2), a warrior alone far away (17), and a column of three rangers (3, 8 and 13).
    const board = classes({ 1: 0, 2: 0, 3: 1, 17: 0, 8: 1, 13: 1 });
    expect(toyCells('kneading_cushion', board, [])).toEqual([1, 2, 3, 8, 13]);
    // The ranger at 3 stands beside a warrior (2) as well, which does not count for the warrior: only his own class.
    expect(toyCells('kneading_cushion', classes({ 2: 0, 3: 1 }), [])).toEqual([]);
    // Diagonals are not neighbours; nobody on the board marks nothing.
    expect(toyCells('kneading_cushion', classes({ 0: 2, 6: 2 }), [])).toEqual([]);
    expect(toyCells('kneading_cushion', NOBODY, [])).toEqual([]);
  });

  it('every toy whose effect is keyed to where a cat stands is marked, and no other: the sunny spot has its own sun cells', () => {
    const marked = RELIC_IDS.filter((id) => toyShape(id) !== null).sort();
    expect(marked).toEqual(['cat_tower', 'kneading_cushion', 'window_perch']);
    expect(toyShape('sunny_spot')).toBeNull();
    expect(toyShape('cat_tunnel')).toBeNull();
    expect(toyCells('yarn_ball', NOBODY, [])).toEqual([]);
  });

  it('gives each kind of toy its own colour, none of them the sun\'s mustard', () => {
    const colours = new Set([toyColor('row'), toyColor('ring'), toyColor('pairs')]);
    expect(colours.size).toBe(3);
  });

  it('lists the positional toys once each in the order picked, at most three', () => {
    const out: RelicId[] = [];
    expect(positionalToys(['yarn_ball', 'window_perch', 'sunny_spot', 'cat_tower', 'window_perch', 'kneading_cushion'], out)).toEqual(['window_perch', 'cat_tower', 'kneading_cushion']);
    expect(positionalToys([], out)).toEqual([]);
    expect(MAX_TOYS).toBe(3);
  });

  it('boosts() agrees with the simulation\'s own rules for the row and the ring', () => {
    for (let c = 0; c < CELL_COUNT; c++) {
      expect(boosts('row', c, NOBODY)).toBe(Math.floor(c / COLS) === 0);
      expect(boosts('ring', c, NOBODY)).toBe(isEdgeCell(c));
    }
  });
});

describe('where several toys boost one cell', () => {
  it('nests their frames in the order picked: the first outermost', () => {
    const toys: RelicId[] = ['cat_tower', 'window_perch', 'kneading_cushion'];
    const cover = new Uint8Array(CELL_COUNT * MAX_TOYS);
    const cells = coverage(toys, classes({ 0: 0, 1: 0 }), cover);
    // Cell 0: tower, perch and the cushion (a warrior beside a warrior) all boost it; cell 6 is inside the ring, in no row, beside nobody.
    expect(depthOf(cover, 0, 0)).toBe(0);
    expect(depthOf(cover, 0, 1)).toBe(1);
    expect(depthOf(cover, 0, 2)).toBe(2);
    expect(cover[6 * MAX_TOYS]).toBe(0);
    expect(cover[6 * MAX_TOYS + 1]).toBe(0);
    // Cell 5 (the left edge, below the top row): the perch only, so its frame is the outermost there.
    expect(cover[5 * MAX_TOYS + 1]).toBe(1);
    expect(depthOf(cover, 5, 1)).toBe(0);
    // The ring's 16 cells hold the five of the row and the two of the pair too, counted once each where they overlap.
    expect(cells).toBe(16);
  });

  it('a toy that boosts nothing here leaves no flag', () => {
    const cover = new Uint8Array(CELL_COUNT * MAX_TOYS);
    expect(coverage(['kneading_cushion'], NOBODY, cover)).toBe(0);
    expect(cover.every((v) => v === 0)).toBe(true);
  });
});

describe('the flourish and the light', () => {
  it('draws the cells in one after the other, each over a few tenths of a second', () => {
    expect(reveal(0, 0)).toBe(0);
    expect(reveal(0.3, 0)).toBe(1);
    expect(reveal(0.1, 0)).toBeGreaterThan(0);
    expect(reveal(0.1, 0)).toBeLessThan(1);
    expect(reveal(0.1, 5)).toBe(0);
    expect(reveal(0.1, 2)).toBeGreaterThan(reveal(0.1, 3));
    // The last cell of the board is in about a second.
    expect(reveal(1.2, CELL_COUNT - 1)).toBe(1);
    expect(reveal(0.5, CELL_COUNT - 1)).toBe(0);
  });

  it('a lit toy pulses and is dark again when its time is up', () => {
    expect(pulse(0)).toBe(0);
    expect(pulse(-1)).toBe(0);
    for (const left of [0.05, 0.4, 0.8, 1.2, LIGHT_FOR]) {
      expect(pulse(left)).toBeGreaterThan(0.3);
      expect(pulse(left)).toBeLessThanOrEqual(1);
    }
    expect(LIGHT_FOR).toBeGreaterThanOrEqual(1);
    expect(LIGHT_FOR).toBeLessThanOrEqual(2.5);
  });

  it('reads the toy out of a bubble key, and nothing out of any other key', () => {
    const known = (id: string): boolean => id === 'cat_tower';
    expect(toyOfKey('toy:cat_tower', known)).toBe('cat_tower');
    expect(toyOfKey('toy:yarn_ball', known)).toBeNull();
    expect(toyOfKey('enemy:cucumber', known)).toBeNull();
    expect(toyOfKey(12, known)).toBeNull();
  });
});

// ───────────────────────────── the view ─────────────────────────────

interface World {
  relics: RelicId[];
  units: Array<{ id: UnitId } | null>;
}

/** Three distinct textures over one source, so which frame a sprite wears can be told. */
const frameArt = [0, 1, 2].map(() => new Texture({ source: Texture.WHITE.source }));
const art = { toyFrame: frameArt, tileFill: Texture.WHITE } as unknown as FieldArt;

function makeWorld(): { env: FieldEnv; world: World } {
  const world: World = { relics: [], units: Array.from({ length: CELL_COUNT }, () => null) };
  const env = { battle: world } as unknown as FieldEnv;
  return { env, world };
}

class Recorder implements InfoView {
  shown: string[] = [];
  show(_t: Container, content: InfoContent): void {
    this.shown.push(content.title ?? content.text);
  }
  hide(): void {}
}

function build(): { marks: ToyMarks; world: World; floor: Container; layer: Container; run: (seconds: number, held?: number) => void } {
  const { env, world } = makeWorld();
  const floor = new Container();
  const layer = new Container();
  const marks = new ToyMarks(env, floor, layer, art);
  const run = (seconds: number, held = -1): void => {
    for (let t = 0; t < seconds - 1e-9; t += DT) marks.update(DT, held);
  };
  return { marks, world, floor, layer, run };
}

/** The sprites the marks keep for toy slot `k`, cell `c`: tint (on the floor), frame and badge. */
function markOf(floor: Container, layer: Container, k: number, c: number): { tint: Sprite; frame: Sprite; badge: Sprite } {
  const tints = (floor.children[0] as Container).children as Sprite[];
  const root = layer.children[0] as Container;
  const frames = (root.children[0] as Container).children as Sprite[];
  const badges = (root.children[2] as Container).children as Sprite[];
  return { tint: tints[k * CELL_COUNT + c] as Sprite, frame: frames[k * CELL_COUNT + c] as Sprite, badge: badges[k * CELL_COUNT + c] as Sprite };
}

beforeEach(() => {
  setFxSettings({ reducedMotion: false });
  vi.stubGlobal('window', { addEventListener: () => undefined, removeEventListener: () => undefined });
  info.bind(new Recorder());
});

afterEach(() => {
  info.bind(null);
  vi.unstubAllGlobals();
});

describe('the marks on the board', () => {
  it('shows nothing for toys that do not depend on where a cat stands', () => {
    const { marks, world, floor, layer, run } = build();
    world.relics = ['yarn_ball', 'sunny_spot'];
    run(1);
    for (let c = 0; c < CELL_COUNT; c++) expect(markOf(floor, layer, 0, c).frame.visible).toBe(false);
    expect(marks.shown).toEqual([]);
    marks.destroy();
  });

  it('a toy the run already holds when the field opens is simply there; a toy picked later flourishes after its flight to the shelf', () => {
    const { marks, world, floor, layer, run } = build();
    world.relics = ['cat_tower'];
    run(0.5);
    const top = markOf(floor, layer, 0, 2);
    expect(top.frame.visible).toBe(true);
    expect(top.frame.alpha).toBeGreaterThan(0.6);
    // Picked later: nothing during the flight, then it draws in, the first cell before the last.
    world.relics = ['cat_tower', 'window_perch'];
    run(TOY_FLIGHT * 0.8);
    const ring = (c: number) => markOf(floor, layer, 1, c).frame;
    expect(ring(0).visible).toBe(false);
    run(TOY_FLIGHT * 0.2 + 0.2);
    expect(ring(0).visible).toBe(true);
    expect(ring(cellIndex(COLS - 1, ROWS - 1)).visible).toBe(false);
    run(1.2);
    expect(ring(cellIndex(COLS - 1, ROWS - 1)).visible).toBe(true);
    expect(ring(6).visible).toBe(false);
    marks.destroy();
  });

  it('marks exactly the top row with a frame in the toy\'s colour, a faint tint on the floor and a badge on each cat that stands there', () => {
    const { marks, world, floor, layer, run } = build();
    world.units[1] = { id: 'w_paw' };
    world.units[7] = { id: 'w_paw' };
    world.relics = ['cat_tower'];
    run(0.5);
    for (let c = 0; c < CELL_COUNT; c++) {
      const m = markOf(floor, layer, 0, c);
      const row0 = c < COLS;
      expect(m.frame.visible, `frame ${c}`).toBe(row0);
      expect(m.tint.visible, `tint ${c}`).toBe(row0);
      expect(m.badge.visible, `badge ${c}`).toBe(c === 1);
    }
    const m = markOf(floor, layer, 0, 1);
    expect(m.frame.tint).toBe(toyColor('row'));
    expect(m.tint.alpha).toBeLessThan(0.3);
    expect(m.frame.alpha).toBeGreaterThan(0.5);
    // The badge stands on the cat's cell, to the left of its middle and above it.
    expect(m.badge.x).toBeLessThan(cellCenterX(1));
    expect(m.badge.y).toBeLessThan(cellCenterY(1));
    expect(m.badge.x).toBeGreaterThan(cellCenterX(1) - CELL_W / 2);
    expect(m.badge.y).toBeGreaterThan(cellCenterY(1) - CELL_H / 2);
    marks.destroy();
  });

  it('a cat that is being dragged takes its badge with it, and a cat that moves away leaves its cell unmarked by a badge', () => {
    const { marks, world, floor, layer, run } = build();
    world.units[2] = { id: 'w_paw' };
    world.relics = ['cat_tower'];
    run(0.5);
    expect(markOf(floor, layer, 0, 2).badge.visible).toBe(true);
    run(0.1, 2);
    expect(markOf(floor, layer, 0, 2).badge.visible).toBe(false);
    run(0.1, -1);
    expect(markOf(floor, layer, 0, 2).badge.visible).toBe(true);
    world.units[2] = null;
    run(0.1);
    expect(markOf(floor, layer, 0, 2).badge.visible).toBe(false);
    expect(markOf(floor, layer, 0, 2).frame.visible).toBe(true);
    marks.destroy();
  });

  it('the cushion follows the cats: its marks come when two of a class stand together and go when they part', () => {
    const { marks, world, floor, layer, run } = build();
    world.relics = ['kneading_cushion'];
    world.units[11] = { id: 'w_paw' };
    run(0.5);
    for (let c = 0; c < CELL_COUNT; c++) expect(markOf(floor, layer, 0, c).frame.visible).toBe(false);
    world.units[12] = { id: 'w_sword' };
    run(0.8);
    expect(markOf(floor, layer, 0, 11).frame.visible).toBe(true);
    expect(markOf(floor, layer, 0, 12).frame.visible).toBe(true);
    expect(markOf(floor, layer, 0, 13).frame.visible).toBe(false);
    world.units[12] = null;
    run(1.5);
    expect(markOf(floor, layer, 0, 11).frame.visible).toBe(false);
    marks.destroy();
  });

  it('toys on one cell stack: the second picked nests inside the first, its badge a step to the right', () => {
    const { marks, world, floor, layer, run } = build();
    world.units[0] = { id: 'w_paw' };
    world.relics = ['cat_tower', 'window_perch'];
    run(0.5);
    const first = markOf(floor, layer, 0, 0);
    const second = markOf(floor, layer, 1, 0);
    expect(first.frame.texture).toBe(frameArt[0]);
    expect(second.frame.texture).toBe(frameArt[1]);
    expect(second.badge.x).toBeGreaterThan(first.badge.x + 8);
    expect(second.badge.y).toBe(first.badge.y);
    // A cell only the ring boosts has the ring's frame outermost.
    expect(markOf(floor, layer, 1, 5).frame.texture).toBe(frameArt[0]);
    marks.destroy();
  });

  it('draws one chip for each toy in a column at the start of the board, one under the other', () => {
    const { marks, world, layer, run } = build();
    world.relics = ['cat_tower', 'window_perch'];
    run(0.5);
    const chips = (layer.children[0] as Container).children[1] as Container;
    const [a, b] = chips.children as Container[];
    expect((a as Container).visible).toBe(true);
    expect((b as Container).visible).toBe(true);
    expect((a as Container).x).toBeCloseTo(BOARD_X + 2, 5);
    expect((a as Container).y).toBeGreaterThan(BOARD_Y);
    expect((b as Container).y).toBeGreaterThan((a as Container).y + 24);
    expect(chips.children[2]?.visible).toBe(false);
    marks.destroy();
  });

  it('a tap on a toy\'s chip opens the toy\'s bubble, which lights exactly that toy\'s cells for a moment', () => {
    const view = new Recorder();
    info.bind(view);
    const { marks, world, floor, layer, run } = build();
    world.relics = ['cat_tower', 'window_perch'];
    run(2);
    const rest = markOf(floor, layer, 0, 3).frame.alpha;
    const chip = ((layer.children[0] as Container).children[1] as Container).children[0] as Container;
    expect(marks.tapAt(chip.x + 3, chip.y - 2)).toBe(true);
    expect(view.shown.length).toBe(1);
    run(0.3);
    // Its cells are brighter than at rest, and the other toy's are dimmed.
    expect(markOf(floor, layer, 0, 3).tint.alpha).toBeGreaterThan(0.2);
    expect(markOf(floor, layer, 1, 5).frame.alpha).toBeLessThan(rest);
    // A press anywhere else on the board is not taken.
    expect(marks.tapAt(cellCenterX(7), cellCenterY(7))).toBe(false);
    run(LIGHT_FOR + 0.5);
    expect(markOf(floor, layer, 0, 3).frame.alpha).toBeCloseTo(rest, 2);
    expect(markOf(floor, layer, 1, 5).frame.alpha).toBeCloseTo(rest, 2);
    marks.destroy();
  });

  it('tapping the toy\'s icon on the shelf (its bubble key) lights the same cells, and a toy that does not mark the board lights nothing', () => {
    const { marks, world, floor, layer, run } = build();
    world.relics = ['window_perch'];
    run(2);
    const rest = markOf(floor, layer, 0, 0).tint.alpha;
    info.tap('toy:yarn_ball', new Container(), { text: 'x' });
    run(0.3);
    expect(markOf(floor, layer, 0, 0).tint.alpha).toBeCloseTo(rest, 3);
    info.tap('toy:window_perch', new Container(), { text: 'x' });
    run(0.3);
    expect(markOf(floor, layer, 0, 0).tint.alpha).toBeGreaterThan(rest + 0.1);
    marks.destroy();
  });

  it('under reduced motion the marks are simply there, and a lit toy is steadily brighter instead of pulsing', () => {
    setFxSettings({ reducedMotion: true });
    const { marks, world, floor, layer, run } = build();
    world.relics = ['cat_tower'];
    run(0.1);
    world.relics = ['cat_tower', 'window_perch'];
    run(0.05);
    expect(markOf(floor, layer, 1, 0).frame.visible).toBe(true);
    expect(markOf(floor, layer, 1, 0).frame.scale.x).toBe(1);
    info.tap('toy:window_perch', new Container(), { text: 'x' });
    run(0.1);
    const a = markOf(floor, layer, 1, 0).tint.alpha;
    run(0.4);
    expect(markOf(floor, layer, 1, 0).tint.alpha).toBe(a);
    marks.destroy();
  });

  it('is pooled: every sprite is made once and nothing is added while toys come and go', () => {
    const { marks, world, floor, layer, run } = build();
    const count = (c: Container): number => 1 + c.children.reduce((n, k) => n + count(k as Container), 0);
    const before = count(floor) + count(layer);
    world.relics = ['cat_tower', 'window_perch', 'kneading_cushion'];
    world.units[0] = { id: 'w_paw' };
    world.units[1] = { id: 'w_sword' };
    run(2);
    world.relics = [];
    run(0.5);
    world.relics = ['kneading_cushion'];
    run(2);
    expect(count(floor) + count(layer)).toBe(before);
    marks.destroy();
  });
});
