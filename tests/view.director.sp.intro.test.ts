import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Container, Texture } from 'pixi.js';

// What the first cast of a skill shows (the name bubble and the rank 5 cut-in), against stand-ins for the things that need fonts and a screen:
// the paper label, the text measure and the awakening's banner (a flag that says whether one is playing, and a spy for the call that starts one).
const cut = vi.hoisted(() => ({ playing: false }));
vi.mock('@/core/assets', async (original) => ({ ...(await original<typeof import('@/core/assets')>()), hasTex: () => true, tex: () => Texture.WHITE }));
vi.mock('@/fx', async (original) => ({ ...(await original<typeof import('@/fx')>()), awakeningCutIn: cut }));
vi.mock('@/ui/text', async (original) => ({
  ...(await original<typeof import('@/ui/text')>()),
  label: (text: string, o: { size?: number } = {}) => ({ width: text.length * (o.size ?? 20) * 0.55, destroy: () => undefined }),
}));
vi.mock('@/ui/paper', async (original) => ({
  ...(await original<typeof import('@/ui/paper')>()),
  PaperLabel: class extends Container {
    uiBox: { x: number; y: number; w: number; h: number };
    constructor(o: { text: string; size?: number; minWidth?: number; maxWidth?: number }) {
      super();
      const w = Math.min(o.maxWidth ?? 360, Math.max(o.minWidth ?? 0, o.text.length * (o.size ?? 26) * 0.55 + 40));
      this.uiBox = { x: -w / 2, y: -23, w, h: 46 };
    }
  },
}));

import type { SpCastEvent, UnitId } from '@/game';
import { BOARD_W, BOARD_X, BOARD_Y, CELL_COUNT, cellCenterX, cellCenterY } from '@/game/geometry';
import { FEET_DY } from '@/view/field/unitView';
import { BUBBLE_FLOOR, BUBBLE_LIFE, CUTIN_TEMPO, CUTIN_WAIT, SpIntro, bubbleSpot, cutInTempo } from '@/view/director/sp/intro';
import { CUTIN_QUEUE } from '@/view/director/sp/stageRule';
import { game } from '@/core/game';
import { stageHeldFor } from '@/view/staging';
import type { SpEnv } from '@/view/director/sp/types';

const DT = 1 / 60;

function make(over: { speed?: number; reduced?: boolean } = {}) {
  const numbers = new Container();
  const awakening = vi.fn(() => {
    cut.playing = true;
  });
  const direct = vi.fn();
  const env = {
    stage: { direct, fx: { awakening }, reduced: over.reduced ?? false },
    ctx: { layers: { numbers }, speed: over.speed ?? 1 },
    battle: {},
  } as unknown as SpEnv;
  return { intro: new SpIntro(env), numbers, awakening, direct };
}

const cast = (id: UnitId, cell: number, skill: SpCastEvent['skill']): SpCastEvent =>
  ({ unit: { id, cell, uid: cell + 1 }, first: true, skill, x: 0, y: 0, data: {} }) as unknown as SpCastEvent;
const viking = (cell = 12): SpCastEvent => cast('w_viking', cell, 'shove');
const tiger = (cell = 11): SpCastEvent => cast('w_tiger', cell, 'charge');
const star = (cell = 13): SpCastEvent => cast('r_star', cell, 'lap');

/** Run `seconds` of frames with `battleRate` battle seconds per real second; returns the real seconds after which `done()` first held (or -1). */
function run(intro: SpIntro, seconds: number, battleRate: number, done?: () => boolean): number {
  for (let t = 0; t < seconds; t += DT) {
    intro.update(DT, DT * battleRate);
    if (done?.()) return t;
  }
  return -1;
}

beforeEach(() => {
  cut.playing = false;
});
afterEach(() => vi.restoreAllMocks());

describe('the first cast of a skill: the name bubble', () => {
  it('puts the name on the board over the cat and takes it off after its life: 0.8 s of the battle clock at 1x', () => {
    const { intro, numbers, awakening } = make();
    intro.first(viking());
    expect(numbers.children.length).toBe(1);
    expect(awakening).not.toHaveBeenCalled();
    expect(run(intro, BUBBLE_LIFE - 0.1, 1)).toBe(-1);
    expect(numbers.children.length).toBe(1);
    run(intro, 0.3, 1);
    expect(numbers.children.length).toBe(0);
    expect(intro.pending().bubbles).toBe(0);
  });

  it('is not shorter than its real floor at 3x (a three word English name has to be read), and not longer than its life at 1x', () => {
    expect(BUBBLE_FLOOR).toBeGreaterThanOrEqual(0.6);
    const a = make();
    a.intro.first(viking());
    // 3x: the battle clock is through its 0.8 s after a third of that in real time, but the bubble stays for the floor.
    const gone3 = run(a.intro, 2, 3, () => a.numbers.children.length === 0);
    expect(gone3).toBeGreaterThanOrEqual(BUBBLE_FLOOR - 2 * DT);
    expect(gone3).toBeLessThan(BUBBLE_FLOOR + 2 * DT);
    const b = make();
    b.intro.first(viking());
    const gone1 = run(b.intro, 2, 1, () => b.numbers.children.length === 0);
    expect(gone1).toBeGreaterThanOrEqual(BUBBLE_LIFE - 2 * DT);
    expect(gone1).toBeLessThan(BUBBLE_LIFE + 2 * DT);
  });

  it('stands still while a popup holds the battle: real time passes, the battle clock does not, and the bubble is not a frame older', () => {
    const { intro, numbers } = make();
    intro.first(viking());
    run(intro, 0.3, 1);
    const root = numbers.children[0] as Container;
    const alpha = root.alpha;
    const y = root.position.y;
    run(intro, 5, 0);
    expect(numbers.children.length).toBe(1);
    expect(root.alpha).toBeCloseTo(alpha, 9);
    expect(root.position.y).toBeCloseTo(y, 9);
  });

  it('shows at most four at once: a fifth takes the oldest one away and destroys it', () => {
    const { intro, numbers } = make();
    const roots: Container[] = [];
    for (let i = 0; i < 6; i++) {
      intro.first(viking(i * 4));
      roots.push(numbers.children[numbers.children.length - 1] as Container);
    }
    expect(numbers.children.length).toBe(4);
    expect(roots[0]?.destroyed).toBe(true);
    expect(roots[1]?.destroyed).toBe(true);
    expect(roots[5]?.destroyed).toBe(false);
  });

  it('is destroyed when it is dropped, when the intro is cleared and when it is destroyed (nothing is left on the layer)', () => {
    const a = make();
    a.intro.first(viking());
    const root = a.numbers.children[0] as Container;
    run(a.intro, 2, 1);
    expect(root.destroyed).toBe(true);
    expect(a.numbers.children.length).toBe(0);
    const b = make();
    b.intro.first(viking(2));
    b.intro.first(viking(14));
    const roots = [...b.numbers.children] as Container[];
    b.intro.clear();
    expect(b.numbers.children.length).toBe(0);
    expect(roots.every((r) => r.destroyed)).toBe(true);
    const c = make();
    c.intro.first(viking());
    c.intro.destroy();
    expect(c.numbers.children.length).toBe(0);
  });

  it('under reduced motion it only fades: no pop, no rise', () => {
    const { intro, numbers } = make({ reduced: true });
    intro.first(viking());
    const root = numbers.children[0] as Container;
    const y0 = root.position.y;
    run(intro, 0.3, 1);
    expect(root.scale.x).toBe(1);
    expect(root.position.y).toBe(y0);
  });

  it('stacks a second bubble over the first when two cats side by side cast for the first time in one moment', () => {
    const { intro, numbers } = make();
    intro.first(viking(12));
    intro.first(cast('r_gunner', 13, 'wanted'));
    const [a, b] = numbers.children as Container[];
    expect((b as Container).position.y).toBeLessThan((a as Container).position.y - 40);
  });
});

describe('where a name bubble stands (always on the board, never on the road)', () => {
  const H = 40;
  const WIDTHS = [110, 250, 360];

  it('keeps the whole label inside the board sideways for every cell and every width, with its tail still under it', () => {
    for (let cell = 0; cell < CELL_COUNT; cell++) {
      for (const w of WIDTHS) {
        const s = bubbleSpot(cell, w, H, 0);
        expect(s.tipX).toBe(cellCenterX(cell));
        expect(s.tipX + s.dx - w / 2, `cell ${cell} w ${w}`).toBeGreaterThanOrEqual(BOARD_X - 1e-9);
        expect(s.tipX + s.dx + w / 2, `cell ${cell} w ${w}`).toBeLessThanOrEqual(BOARD_X + BOARD_W + 1e-9);
        expect(Math.abs(s.dx), `cell ${cell} w ${w}`).toBeLessThan(w / 2 - 11);
      }
    }
  });

  it('keeps the whole label under the board\'s top edge, also at the top of its rise and the biggest of its pop: a cat in the first row does not hang it over the road', () => {
    for (let cell = 0; cell < CELL_COUNT; cell++) {
      const s = bubbleSpot(cell, 200, H, 0);
      const top = s.tipY - 10 - (15 + H + 2) * 1.1;
      expect(top, `cell ${cell}`).toBeGreaterThanOrEqual(BOARD_Y - 1e-9);
    }
  });

  it('is over the cat\'s head where that already is on the board, and lowered onto the board where it would not be', () => {
    const natural = (cell: number): number => cellCenterY(cell) + FEET_DY - 96;
    // The third row stands where it always did; the first row is pushed down from where the road is.
    expect(bubbleSpot(12, 150, H, 0).tipY).toBe(natural(12));
    expect(bubbleSpot(2, 150, H, 0).tipY).toBeGreaterThan(natural(2));
    // ...onto the cat itself (it has to stand between the road above and the cat's feet), not onto the cell below.
    expect(bubbleSpot(2, 150, H, 0).tipY).toBeLessThan(cellCenterY(2) + FEET_DY + 8);
  });

  it('puts a stacked bubble exactly one lift higher', () => {
    for (const cell of [2, 12, 24]) expect(bubbleSpot(cell, 150, H, 50).tipY).toBe(bubbleSpot(cell, 150, H, 0).tipY - 50);
  });

  it('is where the first cast puts it: the tip over the cat, the layer\'s child at the spot', () => {
    for (const cell of [0, 4, 12, 20, 24]) {
      const { intro, numbers } = make();
      intro.first(viking(cell));
      const root = numbers.children[0] as Container;
      expect(root.x).toBe(cellCenterX(cell));
      expect(root.y).toBeGreaterThanOrEqual(BOARD_Y);
    }
  });
});

describe('the first cast of a rank 5 skill: the cut-in', () => {
  it('shows the banner and no bubble on top of it: the same name is not said twice', () => {
    const { intro, numbers, awakening, direct } = make();
    intro.first(tiger());
    expect(awakening).toHaveBeenCalledTimes(1);
    expect(numbers.children.length).toBe(0);
    expect(direct).toHaveBeenCalledWith('awaken', expect.any(Number));
  });

  it('is the short banner with the mythic tag, takes no taps and fits its name', () => {
    const { intro, awakening } = make();
    intro.first(tiger());
    const [, name, opts] = awakening.mock.calls[0] as unknown as [unknown, string, Record<string, unknown>];
    expect(typeof name).toBe('string');
    expect(opts).toMatchObject({ short: true, passThrough: true });
    expect(typeof opts.tag).toBe('string');
    expect(typeof opts.color).toBe('number');
    expect(typeof opts.nameSize).toBe('number');
  });

  it('plays faster at 2x and at 3x, so that it does not cover seconds of the battle', () => {
    expect(cutInTempo(1)).toBe(1);
    expect(cutInTempo(2)).toBe(CUTIN_TEMPO[2]);
    expect(cutInTempo(3)).toBe(CUTIN_TEMPO[3]);
    expect(CUTIN_TEMPO[2]).toBeGreaterThan(1);
    expect(CUTIN_TEMPO[3]).toBeGreaterThan(CUTIN_TEMPO[2]);
    for (const speed of [1, 2, 3] as const) {
      cut.playing = false;
      const { intro, awakening } = make({ speed });
      intro.first(tiger());
      expect((awakening.mock.calls[0] as unknown as [unknown, string, { tempo: number }])[2].tempo).toBe(CUTIN_TEMPO[speed]);
    }
  });

  it('gives a skill below rank 5 its bubble and no banner', () => {
    const { intro, numbers, awakening } = make();
    intro.first(cast('r_gunner', 6, 'wanted'));
    expect(awakening).not.toHaveBeenCalled();
    expect(numbers.children.length).toBe(1);
  });

  it('lets the second skill wait for the first one\'s banner instead of losing its own, and plays it when the screen is free', () => {
    const { intro, numbers, awakening } = make();
    intro.first(tiger());
    expect(awakening).toHaveBeenCalledTimes(1);
    // The archer casts for the first time while the tiger's banner is up: its banner waits, and its name stands over the cat now, because the
    // picture it announces starts at once and the banner trails it.
    intro.first(star());
    expect(awakening).toHaveBeenCalledTimes(1);
    expect(intro.pending()).toEqual({ bubbles: 1, waiting: 1 });
    expect(numbers.children.length).toBe(1);
    // The banner is still up: nothing starts.
    run(intro, 0.5, 1);
    expect(awakening).toHaveBeenCalledTimes(1);
    // It ends: the waiting one starts within a frame, with the archer's own picture and name.
    cut.playing = false;
    intro.update(DT, DT);
    expect(awakening).toHaveBeenCalledTimes(2);
    expect(intro.pending().waiting).toBe(0);
    const names = awakening.mock.calls.map((c) => (c as unknown as [unknown, string])[1]);
    expect(names[0]).not.toBe(names[1]);
  });

  it('also waits behind an awakening\'s own banner, which is never cut short', () => {
    const { intro, awakening } = make();
    cut.playing = true;
    intro.first(tiger());
    expect(awakening).not.toHaveBeenCalled();
    intro.update(DT, DT);
    expect(awakening).not.toHaveBeenCalled();
    cut.playing = false;
    intro.update(DT, DT);
    expect(awakening).toHaveBeenCalledTimes(1);
  });

  it('keeps the order of the waiting banners, one after another', () => {
    const { intro, awakening } = make();
    cut.playing = true;
    intro.first(tiger());
    intro.first(star());
    expect(intro.pending().waiting).toBe(2);
    cut.playing = false;
    intro.update(DT, DT);
    expect(awakening).toHaveBeenCalledTimes(1);
    // The first one's banner is up (the stand-in sets the flag), so the second still waits.
    intro.update(DT, DT);
    expect(awakening).toHaveBeenCalledTimes(1);
    cut.playing = false;
    intro.update(DT, DT);
    expect(awakening).toHaveBeenCalledTimes(2);
    const ids = awakening.mock.calls.map((c) => (c as unknown as [{ label?: string }, string])[1]);
    expect(new Set(ids).size).toBe(2);
  });

  it('drops a banner for the bubble only when the queue is full', () => {
    const { intro, numbers, awakening } = make();
    cut.playing = true;
    for (let i = 0; i < CUTIN_QUEUE; i++) intro.first(tiger(i + 3));
    expect(intro.pending().waiting).toBe(CUTIN_QUEUE);
    // Each banner that waits has its bubble up already.
    expect(numbers.children.length).toBe(CUTIN_QUEUE);
    intro.first(star());
    expect(intro.pending().waiting).toBe(CUTIN_QUEUE);
    expect(numbers.children.length).toBe(CUTIN_QUEUE + 1);
    expect(awakening).not.toHaveBeenCalled();
  });

  it('gives up on a banner that has waited too long (its bubble was up when it joined the queue and is gone again by then)', () => {
    const { intro, numbers, awakening } = make();
    cut.playing = true;
    intro.first(star());
    expect(numbers.children.length).toBe(1);
    run(intro, CUTIN_WAIT - 0.2, 1);
    expect(intro.pending().waiting).toBe(1);
    run(intro, 0.4, 1);
    expect(intro.pending().waiting).toBe(0);
    expect(numbers.children.length).toBe(0);
    expect(awakening).not.toHaveBeenCalled();
  });

  it('forgets the waiting banners when the battle is cleared (victory, defeat)', () => {
    const { intro, numbers, awakening } = make();
    cut.playing = true;
    intro.first(tiger());
    intro.clear();
    expect(intro.pending()).toEqual({ bubbles: 0, waiting: 0 });
    cut.playing = false;
    intro.update(DT, DT);
    expect(awakening).not.toHaveBeenCalled();
    expect(numbers.children.length).toBe(0);
  });
});

describe('the banners hold the stage for a full screen that the same cast opens', () => {
  // A hold is module state that only ever grows: each test starts well past the ones before it.
  let epoch = 1000;
  beforeEach(() => {
    epoch += 100;
    game.time = epoch;
    cut.playing = false;
  });

  it('holds it for the banner that plays and for every banner that waits behind it, one banner\'s length each', () => {
    const { intro } = make();
    expect(stageHeldFor()).toBe(0);
    intro.first(tiger());
    expect(stageHeldFor()).toBeCloseTo(0.8, 6);
    intro.first(star());
    expect(stageHeldFor()).toBeCloseTo(1.6, 6);
    // Real time passes: the hold runs down with it.
    game.time += 0.5;
    expect(stageHeldFor()).toBeCloseTo(1.1, 6);
  });

  it('counts a banner at the speed the game runs at (1.5 times as fast at 3x)', () => {
    const { intro } = make({ speed: 3 });
    intro.first(tiger());
    expect(stageHeldFor()).toBeCloseTo(0.8 / CUTIN_TEMPO[3], 6);
  });

  it('holds nothing for a skill below rank 5, which shows no banner', () => {
    const { intro } = make();
    intro.first(cast('r_gunner', 6, 'wanted'));
    expect(stageHeldFor()).toBe(0);
  });

  it('takes back the share of a banner that was given up: the chain ends where it would without it', () => {
    const { intro } = make();
    const chainEnd = (): number => (intro as unknown as { chainEnd: number }).chainEnd;
    cut.playing = true;
    intro.first(star());
    expect(chainEnd()).toBeCloseTo(game.time + 0.8, 6);
    run(intro, CUTIN_WAIT + 0.2, 1);
    expect(intro.pending().waiting).toBe(0);
    expect(chainEnd()).toBeCloseTo(game.time, 6);
  });
});
