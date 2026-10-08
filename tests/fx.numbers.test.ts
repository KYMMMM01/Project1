import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const font = vi.hoisted(() => ({ charWidth: 0, installed: [] as { chars: unknown; stroke: number }[] }));

// BitmapFont needs a canvas; the number logic does not. Text objects become plain containers.
vi.mock('pixi.js', async (importOriginal) => {
  const m = await importOriginal<typeof import('pixi.js')>();
  class FakeBitmapText extends m.Container {
    text = '';
    anchor = { set: () => undefined };
    /** What the stroked digits measure at the baked size: nothing unless a test sets `font.charWidth` (36 px a character is about right). */
    override get width(): number {
      return this.text.length * font.charWidth;
    }
  }
  class FakeGradient {}
  // The installed font is asked for its glyph sheets (the warm-up uploads them): a font with one sheet stands in.
  return {
    ...m,
    BitmapFont: { install: (o: { chars: unknown; style: { stroke: { width: number } } }) => font.installed.push({ chars: o.chars, stroke: o.style.stroke.width }) },
    BitmapFontManager: { getFont: () => ({ pages: [{ texture: m.Texture.WHITE }] }) },
    BitmapText: FakeBitmapText,
    FillGradient: FakeGradient,
  };
});

import { Container } from 'pixi.js';
import { fmt } from '@/core/format';
import { setLang } from '@/core/i18n';
import { FloatingNumbers, type NumStyle, type NumberTarget } from '@/fx/numbers';
import { NUMBER_LEVELS, setFxSettings } from '@/fx/settings';

const DT = 1 / 60;
/** Digits of a thin (ordinary) number are this many px high in the baked face, with their outline: the ink the player sees. */
const INK_THIN = 54;
const INK_THICK = 59;

function make(cap = 40): FloatingNumbers {
  const n = new FloatingNumbers(new Container(), cap);
  n.cap = cap;
  // The screen of the battle: the HUD's lower edge, the sides, the bottom panel and the board with its cats.
  Object.assign(n.area, { minX: 8, maxX: 712, minY: -18, maxY: 642, keepX0: 96, keepY0: 94, keepX1: 624, keepY1: 530 });
  return n;
}

/** An enemy on the left stretch of the lane (walking up): a cucumber, 61 wide, its bar 44 above the centre. */
function enemy(uid: number, x: number, y: number, o: Partial<NumberTarget> = {}): NumberTarget {
  return { uid, x, y, hw: 30, top: 44, bottom: 28, angle: -Math.PI / 2, maxHp: 100, heavy: false, boss: false, ...o };
}

/** The enemies of the field as the director lists them each frame. */
function world(n: FloatingNumbers, list: NumberTarget[]): void {
  n.sense = (into) => {
    for (const t of list) into.add(t.uid, t.x, t.y, t.hw, t.top, t.bottom);
  };
  n.update(0);
}

function hit(n: FloatingNumbers, t: NumberTarget, value: number, style: NumStyle = 'damage'): void {
  n.show(t.x, t.y, value, style, { target: t });
}

/** The visible numbers, as the player sees them. */
function shown(n: FloatingNumbers): Container[] {
  return n.layer.children.filter((c) => c.visible) as Container[];
}

function textOf(c: Container): string {
  return (c.children[0] as unknown as { text: string }).text;
}

/** The ink box of a number on screen: centre and half sizes. */
function ink(c: Container, thin = true): { x0: number; y0: number; x1: number; y1: number } {
  const w = ((c.children[0] as unknown as { width: number }).width * c.scale.x) / 2;
  const h = ((thin ? INK_THIN : INK_THICK) * c.scale.x) / 2;
  const cy = c.y + 4.7 * c.scale.x;
  return { x0: c.x - w, y0: cy - h, x1: c.x + w, y1: cy + h };
}

/** The box of an enemy: its picture and its bar. */
function box(t: NumberTarget): { x0: number; y0: number; x1: number; y1: number } {
  return { x0: t.x - t.hw, y0: t.y - t.top, x1: t.x + t.hw, y1: t.y + t.bottom };
}

const cut = (a: { x0: number; y0: number; x1: number; y1: number }, b: { x0: number; y0: number; x1: number; y1: number }): boolean => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;

function frames(n: FloatingNumbers, seconds: number): void {
  for (let t = 0; t < seconds - 1e-9; t += DT) n.update(DT);
}

beforeEach(() => {
  vi.stubGlobal('document', { documentElement: { lang: '' } });
  setFxSettings({ numbers: 'full', reducedMotion: false });
  setLang('en');
  font.charWidth = 0;
  font.installed.length = 0;
});

afterEach(() => setLang('ko'));

describe('the levels', () => {
  it('the default is the calm one, and every limit of brief is under full and under off is nothing', () => {
    const { brief, full, off } = NUMBER_LEVELS;
    // A share is a floor (full asks less of a number); a count is a ceiling (full allows more).
    for (const k of ['hitShare', 'heavyShare', 'tickShare'] as const) expect(brief[k], k).toBeGreaterThanOrEqual(full[k]);
    for (const k of ['plainRegion', 'plainAll', 'plainFrame', 'bigRegion', 'bigAll', 'bigFrame'] as const) expect(brief[k], k).toBeLessThanOrEqual(full[k]);
    expect(brief.soak || brief.extras).toBe(false);
    expect(full.soak && full.extras).toBe(true);
    expect(Object.values(off).every((v) => v === 0 || v === Infinity || v === false)).toBe(true);
  });

  it('starts on brief', async () => {
    vi.resetModules();
    const { fxSettings } = await import('@/fx/settings');
    expect(fxSettings.numbers).toBe('brief');
  });

  it('off shows nothing, not even a crit or a boss hit', () => {
    setFxSettings({ numbers: 'off' });
    const n = make();
    const t = enemy(1, 45, 300);
    world(n, [t]);
    for (const s of ['damage', 'crit', 'kill', 'big', 'hurt', 'dot'] as const) hit(n, t, 50, s);
    expect(n.count).toBe(0);
  });

  it('brief: a crit, a killing blow, a boss hit and damage taken always; an ordinary hit only from 6% of the enemy\'s health (1% on an elite or a boss); nothing quiet', () => {
    setFxSettings({ numbers: 'brief' });
    const n = make();
    const list = [enemy(1, 45, 120), enemy(2, 45, 300), enemy(3, 45, 480), enemy(4, 675, 200, { heavy: true }), enemy(5, 675, 400, { heavy: true })];
    world(n, list);
    const [a, b, c, e, f] = list as [NumberTarget, NumberTarget, NumberTarget, NumberTarget, NumberTarget];
    hit(n, a, 3);
    expect(n.count).toBe(0);
    hit(n, a, 7);
    expect(n.count).toBe(1);
    n.update(DT);
    hit(n, e, 0.5);
    expect(n.count).toBe(1);
    hit(n, e, 1.5);
    expect(n.count).toBe(2);
    n.update(DT);
    // The levels' quiet things: ticks, soaked damage, heals, gold.
    for (const s of ['dot', 'soak', 'heal', 'gold'] as const) hit(n, b, 90, s);
    expect(n.count).toBe(2);
    n.update(DT);
    hit(n, b, 1, 'crit');
    hit(n, c, 1, 'kill');
    expect(n.count).toBe(4);
    n.update(DT);
    hit(n, f, 1, 'big');
    expect(n.count).toBe(5);
  });

  it('full: any ordinary hit, a tick from 2% of the health, soaked damage, heals and gold', () => {
    const n = make();
    const list = [enemy(1, 45, 120), enemy(2, 45, 300), enemy(3, 45, 480), enemy(4, 675, 200), enemy(5, 675, 400)];
    world(n, list);
    const [a, b, c, d, e] = list as [NumberTarget, NumberTarget, NumberTarget, NumberTarget, NumberTarget];
    hit(n, a, 0.4);
    expect(n.count).toBe(1);
    hit(n, b, 1, 'dot');
    expect(n.count).toBe(1);
    n.update(DT);
    hit(n, b, 3, 'dot');
    expect(n.count).toBe(2);
    n.update(DT);
    hit(n, c, 12, 'soak');
    hit(n, d, 12, 'heal');
    expect(n.count).toBe(4);
    n.update(DT);
    hit(n, e, 12, 'gold');
    expect(n.count).toBe(5);
  });

  it('several small hits earn the number that none of them would: they are summed over the window', () => {
    setFxSettings({ numbers: 'brief' });
    const n = make();
    const t = enemy(1, 45, 300);
    world(n, [t]);
    hit(n, t, 2);
    n.update(DT);
    hit(n, t, 2);
    n.update(DT);
    expect(n.count).toBe(0);
    hit(n, t, 3);
    expect(n.count).toBe(1);
    expect(textOf(shown(n)[0] as Container)).toBe('7');
  });
});

describe('one number per enemy', () => {
  it('hits within 0.3 s are one number that adds up and bumps', () => {
    const n = make();
    const t = enemy(1, 45, 300);
    world(n, [t]);
    hit(n, t, 100);
    frames(n, 0.1);
    hit(n, t, 50);
    frames(n, 0.1);
    hit(n, t, 25);
    expect(n.count).toBe(1);
    expect(textOf(shown(n)[0] as Container)).toBe('175');
    const swollen = (shown(n)[0] as Container).scale.x;
    frames(n, 0.15);
    expect((shown(n)[0] as Container).scale.x).toBeLessThan(swollen);
  });

  it('a hit after the window starts the figure again, in the same place, and the old figure does not stay beside it', () => {
    const n = make();
    const t = enemy(1, 45, 300);
    world(n, [t]);
    hit(n, t, 100);
    frames(n, 0.2);
    hit(n, t, 10);
    frames(n, 0.15);
    expect(textOf(shown(n)[0] as Container)).toBe('110');
    hit(n, t, 7);
    expect(n.count).toBe(1);
    expect(textOf(shown(n)[0] as Container)).toBe('7');
  });

  it('keeps one number for each enemy, and a figure of a damage-over-time tick beside the ordinary one', () => {
    const n = make();
    const list = [enemy(1, 45, 120), enemy(2, 45, 380)];
    world(n, list);
    const [a, b] = list as [NumberTarget, NumberTarget];
    hit(n, a, 10);
    n.update(DT);
    hit(n, b, 11);
    n.update(DT);
    hit(n, a, 12);
    expect(n.count).toBe(2);
    n.update(DT);
    hit(n, a, 5, 'dot');
    expect(n.count).toBe(3);
    n.update(DT);
    hit(n, a, 5, 'dot');
    expect(n.count).toBe(3);
    expect(shown(n).map(textOf).sort()).toEqual(['10', '11', '22']);
  });

  it('a crit over an ordinary hit becomes one big number with the damage of both; an ordinary hit after it adds to it', () => {
    const n = make();
    const t = enemy(1, 45, 300);
    world(n, [t]);
    hit(n, t, 40);
    n.update(DT);
    hit(n, t, 60, 'crit');
    expect(n.count).toBe(1);
    expect(textOf(shown(n)[0] as Container)).toBe('100!');
    n.update(DT);
    hit(n, t, 5);
    expect(textOf(shown(n)[0] as Container)).toBe('105!');
  });

  it('a killing blow takes the figure of the window over and stands where the enemy died', () => {
    const n = make();
    const t = enemy(1, 45, 300);
    world(n, [t]);
    hit(n, t, 40);
    n.update(DT);
    hit(n, t, 60, 'kill');
    expect(n.count).toBe(1);
    expect(textOf(shown(n)[0] as Container)).toBe('100');
  });

  it('writes every figure the way the short number format does, below 10,000 too', () => {
    const n = make();
    for (const v of [0, 5, 99, 100, 999, 1000, 1234, 9999, 10000, 48210, 1234567]) {
      n.clear();
      n.update(DT);
      n.show(45, 300, v, 'heal');
      expect(textOf(shown(n)[0] as Container), String(v)).toBe('+' + fmt(v));
    }
  });

  it('formats a long figure with the short number format of the language', () => {
    const n = make();
    const t = enemy(1, 45, 300);
    world(n, [t]);
    hit(n, t, 48210, 'crit');
    expect(textOf(shown(n)[0] as Container)).toBe('48.2K!');
    n.clear();
    setLang('ko');
    n.update(DT);
    hit(n, t, 48210, 'crit');
    expect(textOf(shown(n)[0] as Container)).toBe('4.82만!');
  });
});

describe('size and weight', () => {
  const settle = (style: NumStyle, value: number): { scale: number; alpha: number } => {
    const n = make();
    const t = enemy(1, 45, 300);
    world(n, [t]);
    hit(n, t, value, style);
    frames(n, 0.2);
    const c = shown(n)[0] as Container;
    return { scale: c.scale.x, alpha: c.alpha };
  };

  it('ordinary numbers are about 21 px high with a thin outline and 70 to 80% opaque', () => {
    for (const v of [5, 80, 900, 5000]) {
      const { scale, alpha } = settle('damage', v);
      const px = scale * INK_THIN;
      expect(px).toBeGreaterThanOrEqual(19.5);
      expect(px).toBeLessThanOrEqual(22.5);
      expect(alpha).toBeGreaterThanOrEqual(0.7);
      expect(alpha).toBeLessThanOrEqual(0.8);
    }
  });

  it('crits and killing blows are bigger, 30 to 36 px with a heavy outline, and fully opaque', () => {
    for (const style of ['crit', 'kill', 'big'] as const) {
      const { scale, alpha } = settle(style, 700);
      expect(scale * INK_THICK).toBeGreaterThanOrEqual(29);
      expect(scale * INK_THICK).toBeLessThanOrEqual(37);
      expect(alpha).toBe(1);
    }
  });

  it('a damage-over-time tick is smaller and quieter than a hit', () => {
    const tick = settle('dot', 90);
    const plain = settle('damage', 90);
    expect(tick.scale).toBeLessThan(plain.scale);
    expect(tick.alpha).toBeLessThan(plain.alpha);
  });

  it('ordinary numbers live about half a second, big ones longer', () => {
    const n = make();
    const t = enemy(1, 45, 300);
    world(n, [t]);
    hit(n, t, 50);
    frames(n, 0.45);
    expect(n.count).toBe(1);
    frames(n, 0.1);
    expect(n.count).toBe(0);
    hit(n, t, 50, 'crit');
    frames(n, 0.6);
    expect(n.count).toBe(1);
  });

  describe('with real glyph widths', () => {
    beforeEach(() => {
      font.charWidth = 36;
    });

    const wideOf = (c: Container): number => (c.children[0] as unknown as { width: number }).width * c.scale.x;

    it('draws a long figure smaller rather than wider: 72 px at most for an ordinary number, 74 for a big one', () => {
      const n = make();
      const list = [enemy(1, 45, 120), enemy(2, 45, 480)];
      world(n, list);
      const [a, b] = list as [NumberTarget, NumberTarget];
      hit(n, a, 8644, 'damage');
      hit(n, b, 8644, 'crit');
      frames(n, 0.2);
      const [plain, crit] = shown(n);
      expect(wideOf(plain as Container)).toBeLessThanOrEqual(72.5);
      expect(wideOf(crit as Container)).toBeLessThanOrEqual(74.5);
      expect(wideOf(crit as Container)).toBeGreaterThan(wideOf(plain as Container));
    });

    it('a short one is not touched', () => {
      const n = make();
      const t = enemy(1, 45, 300);
      world(n, [t]);
      hit(n, t, 7);
      frames(n, 0.2);
      expect(wideOf(shown(n)[0] as Container)).toBeLessThan(40);
    });
  });
});

describe('where it stands', () => {
  beforeEach(() => {
    font.charWidth = 36;
  });

  it('above the health bar, never on the body, and drifting up and outward', () => {
    const n = make();
    const t = enemy(1, 45, 300);
    world(n, [t]);
    hit(n, t, 123);
    const c = shown(n)[0] as Container;
    const start = ink(c);
    expect(cut(start, box(t))).toBe(false);
    expect(start.y1).toBeLessThanOrEqual(t.y - t.top);
    const x0 = c.x;
    const y0 = c.y;
    frames(n, 0.4);
    const later = shown(n)[0] as Container;
    expect(later.y).toBeLessThan(y0);
    expect(later.x).toBeLessThanOrEqual(x0);
    expect(cut(ink(later), box(t))).toBe(false);
  });

  it('the side stretches drift toward the outside of the screen, the right one to the right', () => {
    const n = make();
    const left = enemy(1, 45, 300);
    const right = enemy(2, 675, 300, { angle: Math.PI / 2 });
    world(n, [left, right]);
    hit(n, left, 50);
    hit(n, right, 50);
    const [l, r] = shown(n) as [Container, Container];
    const lx = l.x;
    const rx = r.x;
    frames(n, 0.4);
    expect(l.x).toBeLessThan(lx);
    expect(r.x).toBeGreaterThan(rx);
    expect(ink(l).x0).toBeGreaterThanOrEqual(8 - 0.01);
    expect(ink(r).x1).toBeLessThanOrEqual(712 + 0.01);
  });

  it('on the top stretch it never runs under the HUD: it stands in a gap of the lane or is not shown, never above the HUD edge', () => {
    const n = make();
    const t = enemy(1, 360, 44, { angle: 0 });
    world(n, [t]);
    for (let i = 0; i < 6; i++) {
      hit(n, t, 50 + i, i % 2 ? 'crit' : 'damage');
      frames(n, 0.2);
      for (const c of shown(n)) {
        expect(ink(c, false).y0).toBeGreaterThanOrEqual(-18 - 0.5);
        expect(cut(ink(c), box(t))).toBe(false);
      }
    }
  });

  it('on the bottom stretch it goes below the feet, not onto the cats of the board', () => {
    const n = make();
    const t = enemy(1, 360, 580, { angle: Math.PI });
    world(n, [t]);
    hit(n, t, 50);
    const c = shown(n)[0] as Container;
    expect(ink(c).y0).toBeGreaterThan(t.y + t.bottom - 1);
    expect(ink(c).y1).toBeLessThanOrEqual(642);
  });

  it('a big figure that is wider than the lane is nudged in from the screen edge and stops short of the board', () => {
    const n = make();
    const left = enemy(1, 45, 300);
    const right = enemy(2, 675, 300, { angle: Math.PI / 2 });
    world(n, [left, right]);
    hit(n, left, 8644, 'crit');
    hit(n, right, 8644, 'crit');
    expect(n.count).toBe(2);
    const [l, r] = shown(n).map((c) => ink(c, false)) as [ReturnType<typeof ink>, ReturnType<typeof ink>];
    expect(l.x0).toBeGreaterThanOrEqual(8 - 0.01);
    expect(l.x1).toBeLessThanOrEqual(96);
    expect(r.x1).toBeLessThanOrEqual(712 + 0.01);
    expect(r.x0).toBeGreaterThanOrEqual(624);
  });

  it('goes with its enemy, and with the crowd when the enemy has died', () => {
    const n = make();
    const t = enemy(1, 45, 600);
    const list = [t];
    world(n, list);
    // 60 px per frame is what 3600 px/s is: the speed is learnt from the frames before the hit.
    t.y = 585;
    n.update(DT);
    hit(n, t, 50);
    const y0 = (shown(n)[0] as Container).y;
    t.y = 570;
    n.update(DT);
    const moved = (shown(n)[0] as Container).y;
    expect(y0 - moved).toBeGreaterThan(14);
    // The enemy is gone (killed by someone else): its number keeps its pace, it does not stop in the lane.
    list.length = 0;
    n.update(DT);
    const gone = (shown(n)[0] as Container).y;
    expect(gone).toBeLessThan(moved);
  });

  it('gives way when an enemy walks into it, and is gone within a tenth of a second', () => {
    const n = make();
    const a = enemy(1, 45, 300);
    const b = enemy(2, 45, 80);
    world(n, [a, b]);
    hit(n, a, 50);
    expect(n.count).toBe(1);
    const c = shown(n)[0] as Container;
    const at = ink(c);
    // Enemy `b` is now standing where the number is.
    b.x = (at.x0 + at.x1) / 2;
    b.y = (at.y0 + at.y1) / 2 - 10;
    frames(n, 0.03);
    expect(n.count).toBe(1);
    expect(c.alpha).toBeLessThan(0.78);
    frames(n, 0.1);
    expect(n.count).toBe(0);
  });

  it('a boss\'s number stays among the crowd that surrounds it', () => {
    const n = make();
    const list: NumberTarget[] = [];
    for (let i = 0; i < 12; i++) list.push(enemy(i + 1, 45, 120 + i * 34, i === 6 ? { boss: true, heavy: true } : {}));
    world(n, list);
    hit(n, list[6] as NumberTarget, 90, 'big');
    expect(n.count).toBe(1);
    frames(n, 0.3);
    expect(n.count).toBe(1);
    expect(cut(ink(shown(n)[0] as Container, false), box(list[6] as NumberTarget))).toBe(false);
  });

  it('an enemy in a row of enemies has no place for its number: nothing is shown over the row', () => {
    const n = make();
    const list: NumberTarget[] = [];
    for (let i = 0; i < 12; i++) list.push(enemy(i + 1, 45, 120 + i * 34));
    world(n, list);
    hit(n, list[6] as NumberTarget, 40);
    hit(n, list[3] as NumberTarget, 40);
    expect(n.count).toBe(0);
    expect(n.skipped).toBeGreaterThan(0);
    // The one at the end of the row has its room above its head.
    hit(n, list[0] as NumberTarget, 40);
    expect(n.count).toBe(1);
    for (const c of shown(n)) for (const t of list) expect(cut(ink(c), box(t)), `enemy ${t.uid}`).toBe(false);
  });

  it('a hit is shown when the lane is sparse and not when the enemies stand shoulder to shoulder: the same hits, the same level', () => {
    const sparse = make();
    const dense = make();
    const spread: NumberTarget[] = [];
    const packed: NumberTarget[] = [];
    for (let i = 0; i < 4; i++) {
      spread.push(enemy(i + 1, 45, 100 + i * 110));
      packed.push(enemy(i + 1, 45, 100 + i * 30));
    }
    world(sparse, spread);
    world(dense, packed);
    let a = 0;
    let b = 0;
    for (let i = 0; i < 4; i++) {
      hit(sparse, spread[i] as NumberTarget, 30);
      hit(dense, packed[i] as NumberTarget, 30);
      a = Math.max(a, sparse.count);
      b = Math.max(b, dense.count);
      sparse.update(DT);
      dense.update(DT);
    }
    expect(a).toBeGreaterThan(b);
  });
});

describe('the crowd rule', () => {
  it('a frame takes only so many new numbers, the crits more than the ordinary ones', () => {
    const n = make();
    const list: NumberTarget[] = [];
    for (let i = 0; i < 6; i++) list.push(enemy(i + 1, i % 2 ? 675 : 45, 100 + Math.floor(i / 2) * 200));
    world(n, list);
    for (const t of list) hit(n, t, 100 + t.uid);
    expect(n.count).toBe(NUMBER_LEVELS.full.plainFrame);
    n.update(DT);
    hit(n, list[5] as NumberTarget, 1, 'crit');
    hit(n, list[4] as NumberTarget, 1, 'crit');
    hit(n, list[3] as NumberTarget, 1, 'crit');
    hit(n, list[2] as NumberTarget, 1, 'crit');
    expect(n.count).toBe(NUMBER_LEVELS.full.plainFrame + NUMBER_LEVELS.full.bigFrame);
  });

  it('a screen region holds only so many: a larger figure takes the place of a smaller one, a smaller one is not shown', () => {
    const n = make();
    const limit = NUMBER_LEVELS.full.plainRegion;
    // Enemies far enough apart not to be in each other's way, all of them in the top left region of the field.
    const list = [enemy(1, 45, 40, { angle: -Math.PI / 2 }), enemy(2, 45, 150, { angle: -Math.PI / 2 }), enemy(3, 140, 44, { angle: 0 })];
    world(n, list);
    for (let i = 0; i < limit; i++) {
      hit(n, list[i] as NumberTarget, 20 + i);
      n.update(DT);
    }
    expect(n.count).toBe(limit);
    hit(n, list[limit] as NumberTarget, 5);
    n.update(DT);
    expect(n.count).toBe(limit);
    expect(shown(n).map(textOf)).not.toContain('5');
    hit(n, list[limit] as NumberTarget, 500);
    expect(n.count).toBe(limit);
    expect(shown(n).map(textOf)).toContain('505');
    expect(shown(n).map(textOf)).not.toContain('20');
  });

  it('the whole screen holds only so many, whatever the regions', () => {
    const n = make();
    const list: NumberTarget[] = [];
    // Twelve enemies spread over the four regions of the left and right lanes, far apart.
    for (let i = 0; i < 12; i++) list.push(enemy(i + 1, i % 2 ? 675 : 45, 60 + i * 50, { angle: i % 2 ? Math.PI / 2 : -Math.PI / 2 }));
    world(n, list);
    for (const t of list) {
      hit(n, t, 100 + t.uid);
      n.update(DT);
    }
    expect(n.count).toBeLessThanOrEqual(NUMBER_LEVELS.full.plainAll);
  });

  it('brief allows less than full over the same fight', () => {
    const run = (mode: 'brief' | 'full'): number => {
      setFxSettings({ numbers: mode });
      const n = make();
      const list: NumberTarget[] = [];
      for (let i = 0; i < 10; i++) list.push(enemy(i + 1, i % 2 ? 675 : 45, 60 + i * 55, { angle: i % 2 ? Math.PI / 2 : -Math.PI / 2, maxHp: 100 }));
      world(n, list);
      let most = 0;
      for (let step = 0; step < 20; step++) {
        for (const t of list) hit(n, t, 30 + t.uid);
        n.update(DT);
        most = Math.max(most, n.count);
      }
      return most;
    };
    expect(run('brief')).toBeLessThan(run('full'));
  });

  it('the first to go are the quiet ones, then the ordinary, a crit last: a crit takes the place of a tick, a tick never takes a crit\'s', () => {
    const n = make(2);
    const list = [enemy(1, 45, 100), enemy(2, 675, 200, { angle: Math.PI / 2 }), enemy(3, 45, 480)];
    world(n, list);
    hit(n, list[0] as NumberTarget, 50, 'dot');
    hit(n, list[1] as NumberTarget, 50, 'crit');
    n.update(DT);
    expect(n.count).toBe(2);
    hit(n, list[2] as NumberTarget, 60, 'damage');
    n.update(DT);
    expect(n.count).toBe(2);
    expect(shown(n).map(textOf).sort()).toEqual(['50!', '60']);
    hit(n, list[0] as NumberTarget, 99, 'damage');
    n.update(DT);
    expect(shown(n).map(textOf)).toContain('50!');
    n.update(DT);
    hit(n, list[2] as NumberTarget, 1, 'crit');
    n.update(DT);
    hit(n, list[1] as NumberTarget, 1, 'dot');
    expect(shown(n).filter((c) => textOf(c).endsWith('!'))).toHaveLength(2);
  });

  it('pools its numbers: a long fight makes no new text objects after the first few', () => {
    const n = make();
    const list = [enemy(1, 45, 120), enemy(2, 675, 300, { angle: Math.PI / 2 })];
    world(n, list);
    for (let i = 0; i < 200; i++) {
      hit(n, list[i % 2] as NumberTarget, 50 + i);
      frames(n, 0.2);
    }
    expect(n.created).toBeLessThanOrEqual(4);
    expect(n.layer.children.length).toBe(n.created);
  });
});

describe('capacity and eviction without bodies', () => {
  it('a number that belongs to no enemy stands above its point and is placed by the same rules', () => {
    const n = make(3);
    n.show(45, 300, 5, 'heal');
    expect(n.count).toBe(1);
    const c = shown(n)[0] as Container;
    expect(c.y).toBeLessThan(300);
    expect(textOf(c)).toBe('+5');
  });

  it('numbers fade out and are recycled after their lifetime without creating new objects', () => {
    const n = make(10);
    for (let i = 0; i < 3; i++) {
      n.show(45, 100 + i * 150, 100 + i, 'heal');
      n.update(DT);
    }
    expect(n.count).toBe(3);
    frames(n, 1);
    expect(n.count).toBe(0);
    for (let i = 0; i < 3; i++) {
      n.show(45, 100 + i * 150, 100 + i, 'heal');
      n.update(DT);
    }
    expect(n.created).toBe(3);
  });

  it('clear() hides everything and keeps the objects for reuse', () => {
    const n = make(10);
    n.show(45, 100, 1, 'heal');
    n.update(DT);
    n.show(45, 300, 2, 'hurt');
    n.clear();
    expect(n.count).toBe(0);
    expect(n.layer.children.every((c) => !c.visible)).toBe(true);
    n.show(45, 100, 3, 'heal');
    expect(n.created).toBe(2);
  });

  it('a face colour override gets its own pool: the face is baked per colour', () => {
    const n = make(10);
    const t = enemy(1, 45, 300);
    world(n, [t]);
    n.show(t.x, t.y, 10, 'dot', { target: t });
    n.update(DT);
    const u = enemy(2, 45, 480);
    n.show(u.x, u.y, 10, 'dot', { target: u, color: 0x0badf0 });
    expect(n.created).toBe(2);
  });
});

describe('the glyph sheets the warm-up uploads', () => {
  it('lists the sheets of every face baked, a colour that no stock style uses included, and bakes a face only once', async () => {
    const { bakeNumberFace, numberFontTextures } = await import('@/fx/numbers');
    const counts: number[] = [numberFontTextures().length];
    bakeNumberFace(0x0ace55);
    counts.push(numberFontTextures().length);
    bakeNumberFace(0x0ace55);
    counts.push(numberFontTextures().length);
    // A second colour is a second face.
    bakeNumberFace(0x0f00d1);
    counts.push(numberFontTextures().length);
    const first = counts[0] as number;
    expect(counts).toEqual([first, first + 1, first + 1, first + 2]);
  });
});

describe('the faces', () => {
  it('are baked thin for the ordinary numbers and thick for the big ones, with the Korean units of the short format', async () => {
    vi.resetModules();
    const { ensureNumberFonts } = await import('@/fx/numbers');
    ensureNumberFonts();
    expect(font.installed.some((f) => f.stroke < 10)).toBe(true);
    expect(font.installed.some((f) => f.stroke > 10)).toBe(true);
    for (const f of font.installed) {
      const chars = (f.chars as unknown[]).flat().join('');
      for (const ch of '만억조') expect(chars).toContain(ch);
      // The letters of the short format (K, M, B, T) come with the range of capitals.
      expect(chars).toContain('AZ');
    }
  });
});
