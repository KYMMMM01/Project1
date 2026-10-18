/**
 * Step 3, the selection sheet (docs/qa/directive_2026-10-13_skills_build.md decisions 29 and 30; design v1 2.3): with skills on, the cat's skill ring
 * turns on the photo's corner with the cat's gauge and the "i" bubble carries the skill's name and line after the ability line; with skills off
 * the sheet is exactly what it was (no ring, no sticker for a line that fits, the bubble says the ability line and nothing more).
 *
 * The sheet is built for real, out of stand-ins for the UI kit's pieces (no fonts and no canvas in this world); the ring is the board's own
 * `SpRingView` on a stubbed 2D canvas.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Container, Sprite, Texture } from 'pixi.js';

vi.mock('@/core/assets', async (original) => ({ ...(await original<typeof import('@/core/assets')>()), hasTex: () => true, tex: () => Texture.WHITE }));
vi.mock('@/audio', () => ({ audio: { play: () => undefined } }));
vi.mock('@/fx', () => ({ drawBuffMark: () => undefined }));
vi.mock('@/view/info', () => ({ info: { tap: vi.fn(), close: vi.fn() } }));
vi.mock('@/view/hud/BuildPlanView', async () => {
  const { Container } = await import('pixi.js');
  return { BuildPlanView: class extends Container {} };
});
vi.mock('@/view/hud/popups/MoltPicker', () => ({ MoltPicker: class {} }));
vi.mock('@/view/hud/kit', async (original) => {
  const real = await original<typeof import('@/view/hud/kit')>();
  const { Container, Rectangle } = await import('pixi.js');
  return {
    ...real,
    unitPhoto: () => new Container(),
    tapArea: (c: Container, x: number, y: number, w: number, h: number) => {
      c.eventMode = 'static';
      c.hitArea = new Rectangle(x, y, w, h);
    },
  };
});
vi.mock('@/ui', async (original) => {
  const real = await original<typeof import('@/ui')>();
  const { Container } = await import('pixi.js');
  class FakeText extends Container {
    text: string;
    constructor(text = '') {
      super();
      this.text = text;
    }
    // A text is as wide as ten pixels a letter: a long ability line is "cut", a short one is not.
    override get width(): number {
      return this.text.length * 10;
    }
    override set width(_v: number) {
      // a fixed measure is enough for the layout the tests look at
    }
  }
  class FakeButton extends Container {
    setSublabel(): void {}
    setEnabled(): void {}
    setStyle(): void {}
    onTap(): void {}
    onDisabledTap(): void {}
  }
  class FakeBag {
    killAll(): void {}
    killKeyed(): void {}
    runKeyed(): void {}
    call(): void {}
  }
  return {
    ...real,
    uiLabel: (text: string) => new FakeText(text),
    fitLabel: () => undefined,
    drawIcon: () => new Container(),
    drawPaper: () => undefined,
    drawDashedInset: () => undefined,
    paperSeed: () => 1,
    Button: FakeButton,
    IconButton: FakeButton,
    TweenBag: FakeBag,
  };
});

import { Emitter } from '@/core/events';
import { getLang, setLang } from '@/core/i18n';
import { setFxSettings } from '@/fx/settings';
import { unitDef } from '@/game';
import type { BattleEvents, UnitId, UnitState } from '@/game/api';
import { SP_ROWS } from '@/game/data/spSkills';
import { spTexts } from '@/game/data/spTexts';
import { motion } from '@/ui';
import { info } from '@/view/info';
import { clearRingHolds, holdRing } from '@/view/field/ringHold';
import { spRingArt } from '@/view/field/spRing';
import { FLASH_SECONDS, PULSE_SCALE, RING_FULL, RING_OUTER, RING_STEPS, ringFrame } from '@/view/field/spRingMath';
import { SheetRing, ringLook } from '@/view/hud/SheetRing';
import { SelectionSheet } from '@/view/hud/SelectionSheet';
import { SHEET, bottomRects, sheetBoxes, sheetSkillInfo, sheetSkillRing } from '@/view/hud/layoutMath';

const original = getLang();
const layout = { w: 720, h: 1280, safeTop: 0, safeBottom: 0, fieldX: 0, fieldY: 168, topH: 168, bottomH: 452 };
const RECT = bottomRects(layout).sheet;

function stubCanvas(): void {
  const ctx = new Proxy({}, { get: () => () => undefined, set: () => true });
  vi.stubGlobal('document', { documentElement: { lang: '' }, createElement: () => ({ width: 0, height: 0, style: {}, getContext: () => ctx }) });
}

beforeAll(stubCanvas);
afterAll(() => {
  vi.unstubAllGlobals();
  setLang(original);
});
beforeEach(() => {
  stubCanvas();
  setLang('ko');
  clearRingHolds();
  setFxSettings({ tier: 'high', autoTier: false });
  motion.reduced = false;
  vi.mocked(info.tap).mockClear();
});
afterEach(() => {
  clearRingHolds();
  motion.reduced = false;
});

// ───────────────────────── where the ring stands ─────────────────────────

describe('where the ring stands on the sheet', () => {
  const b = sheetBoxes(RECT.w, RECT.h);
  const at = sheetSkillRing(RECT.w, RECT.h);
  const r = RING_OUTER * at.scale;

  it('is on the photo\'s lower left corner, lapping it by a few px like the class sticker laps a cell', () => {
    expect(at.centre.x).toBeGreaterThan(b.photo.x);
    expect(at.centre.x).toBeLessThan(b.photo.x + b.photo.w / 2);
    expect(at.centre.y).toBeGreaterThan(b.photo.y + b.photo.h / 2);
    expect(at.centre.y).toBeLessThan(b.photo.y + b.photo.h);
    // it laps the photo's left and bottom edges (a sticker on a corner), by at most 6 px: the photo is still the picture
    expect(b.photo.x - (at.centre.x - r)).toBeGreaterThan(0);
    expect(b.photo.x - (at.centre.x - r)).toBeLessThanOrEqual(6);
    expect(at.centre.y + r - (b.photo.y + b.photo.h)).toBeGreaterThan(0);
    expect(at.centre.y + r - (b.photo.y + b.photo.h)).toBeLessThanOrEqual(6);
  });

  it('stays off the dashed line, above the build well, and clear of the "i" sticker on the far corner, at its biggest swell too', () => {
    for (const k of [1, 1 + PULSE_SCALE]) {
      const rr = RING_OUTER * at.scale * k;
      // the dashed line runs `frame` px in and is 3 px wide: 2 px of paper between it and the ring
      expect(at.centre.x - rr).toBeGreaterThanOrEqual(SHEET.frame + 1.5 + 2);
      expect(at.centre.y + rr).toBeLessThanOrEqual(b.well.y - 2);
      const info = sheetSkillInfo(RECT.w, RECT.h);
      expect(at.centre.x + rr).toBeLessThanOrEqual(info.centre.x - info.r - 6);
    }
  });

  it('is big enough to read: 36 design px across or more, which is 22 px on a 450 px screen and 18 px on a 360 px one', () => {
    expect(2 * r).toBeGreaterThanOrEqual(36);
  });
});

// ───────────────────────── what the ring is told ─────────────────────────

function fakeUnit(id: UnitId, sp: number, extra: Partial<UnitState> = {}): UnitState {
  return { uid: 7, id, sp, blocked: false, dodge: 0, stats: { damage: 100, interval: 1, range: 200, crit: 0 }, ...extra } as unknown as UnitState;
}

const lookOf = (): Parameters<typeof ringLook>[0] => ({ frame: 0, blocked: false, pulsing: false, wave: 0, flash: -1, mark: null, calm: false, low: false });
const battleAt = (time: number, spOn = true): Parameters<typeof ringLook>[2] => ({ spOn, time, units: [], wave: 1, previewWave: () => [], enemies: [], boss: null }) as never;

describe('what the sheet\'s ring shows', () => {
  it('turns with the gauge: the frame the board shows for it, 24 steps and a closed ring at 1', () => {
    for (const g of [0, 0.04, 0.25, 0.5, 0.99, 1]) {
      expect(ringLook(lookOf(), fakeUnit('w_viking', g), battleAt(5), null, 0, false, false).frame, `gauge ${g}`).toBe(ringFrame(g));
    }
    expect(ringFrame(0.5)).toBe(RING_STEPS / 2);
    expect(ringLook(lookOf(), fakeUnit('w_viking', 1), battleAt(5), null, 0, false, false).pulsing).toBe(true);
    expect(ringLook(lookOf(), fakeUnit('w_viking', 0.99), battleAt(5), null, 0, false, false).pulsing).toBe(false);
  });

  it('keeps a held gauge on show until the scene lets go (the capsule\'s half refund springs back at the lid)', () => {
    holdRing(7, 0.5);
    expect(ringLook(lookOf(), fakeUnit('t_lucky', 0.5), battleAt(5), null, 0, false, false).frame).toBe(RING_STEPS / 2);
    holdRing(7, 1);
    expect(ringLook(lookOf(), fakeUnit('t_lucky', 0.1), battleAt(5), null, 0, false, false).frame).toBe(RING_FULL);
  });

  it('flashes for 0.4 battle seconds after a cast and not before or after', () => {
    const u = fakeUnit('w_viking', 0);
    expect(ringLook(lookOf(), u, battleAt(10.1), 10, 0, false, false).flash).toBeCloseTo(0.1 / FLASH_SECONDS, 6);
    expect(ringLook(lookOf(), u, battleAt(9.9), 10, 0, false, false).flash).toBe(-1);
    expect(ringLook(lookOf(), u, battleAt(10 + FLASH_SECONDS + 0.01), 10, 0, false, false).flash).toBe(-1);
    expect(ringLook(lookOf(), u, battleAt(10.1), null, 0, false, false).flash).toBe(-1);
  });

  it('wears the stopped mark and the grey ring of a cat on a hazard tile, and the brown-edged ring of a trickster', () => {
    const look = ringLook(lookOf(), fakeUnit('w_viking', 0.5, { blocked: true }), battleAt(5), null, 0, false, false);
    expect(look.blocked).toBe(true);
    expect(look.mark).toBe('stopped');
    expect(look.pulsing).toBe(false);
    expect(ringLook(lookOf(), fakeUnit('t_bard', 0.5), battleAt(5), null, 0, false, false).trick).toBe(true);
    expect(ringLook(lookOf(), fakeUnit('w_viking', 0.5), battleAt(5), null, 0, false, false).trick).toBe(false);
  });

  it('wears the still star of a full ring under reduced motion, and passes the quality tier on', () => {
    const look = ringLook(lookOf(), fakeUnit('w_viking', 1), battleAt(5), null, 0, true, true);
    expect(look.mark).toBe('ready');
    expect(look.calm).toBe(true);
    expect(look.low).toBe(true);
  });
});

describe('the ring view on the sheet', () => {
  const ringSprites = (ring: SheetRing): { glow: Sprite; body: Sprite; flash: Sprite } => {
    const view = ring.root.children[1] as Container;
    return { glow: view.children[0] as Sprite, body: view.children[1] as Sprite, flash: view.children[2] as Sprite };
  };

  it('shows the frame of the cat\'s gauge, and a halo and the closed ring when it is full', () => {
    const art = spRingArt();
    const ring = new SheetRing(battleAt(5), 'warrior', 1.2);
    const u = fakeUnit('w_viking', 0.5);
    ring.tick(u, battleAt(5), 1 / 60);
    expect(ringSprites(ring).body.texture).toBe(art.frames[12]);
    expect(ringSprites(ring).glow.visible).toBe(false);
    u.sp = 1;
    ring.tick(u, battleAt(5.1), 1 / 60);
    expect(ringSprites(ring).body.texture).toBe(art.frames[RING_FULL]);
    expect(ringSprites(ring).glow.visible).toBe(true);
  });

  it('flashes when its cat casts, and only its cat\'s cast counts', () => {
    const ring = new SheetRing(battleAt(5), 'warrior', 1.2);
    const u = fakeUnit('w_viking', 0);
    ring.cast(99, 5);
    ring.tick(u, battleAt(5.05), 1 / 60);
    expect(ringSprites(ring).flash.visible).toBe(false);
    ring.cast(u.uid, 5);
    ring.tick(u, battleAt(5.05), 1 / 60);
    expect(ringSprites(ring).flash.visible).toBe(true);
    ring.tick(u, battleAt(6), 1 / 60);
    expect(ringSprites(ring).flash.visible).toBe(false);
  });

  it('is scaled by the sheet\'s size for it and takes no touch', () => {
    const ring = new SheetRing(battleAt(5), 'warrior', SHEET.ring);
    expect(ring.root.scale.x).toBe(SHEET.ring);
    expect(ring.root.eventMode).toBe('none');
    ring.destroy();
  });
});

// ───────────────────────── the sheet itself ─────────────────────────

const SHORT_LINE_CATS: UnitId[] = ['r_ninja', 't_bard'];

function board(units: Record<number, UnitState>): Array<UnitState | null> {
  return Array.from({ length: 25 }, (_, i) => units[i] ?? null);
}

/** An emitter that remembers which events anyone listened to. */
class SpyEmitter extends Emitter<BattleEvents> {
  readonly heard = new Set<keyof BattleEvents>();
  override on<K extends keyof BattleEvents>(type: K, fn: (payload: BattleEvents[K]) => void): () => void {
    this.heard.add(type);
    return super.on(type, fn);
  }
}

function makeSheet(spOn: boolean, id: UnitId, sp = 0.4): { sheet: SelectionSheet; unit: UnitState; events: SpyEmitter; battle: ReturnType<typeof fakeBattle> } {
  const events = new SpyEmitter();
  const unit = fakeUnit(id, sp);
  const battle = fakeBattle(spOn, events, board({ 12: unit }));
  const env = {
    battle,
    reveal: { molt: true, awaken: true, sellHint: false },
    revealed: new Emitter<{ reveal: { key: string; fresh: boolean } }>(),
    ctx: { select: () => undefined, command: () => null },
    hints: { request: () => undefined },
    on: <E extends object, K extends keyof E>(emitter: Emitter<E>, type: K, fn: (payload: E[K]) => void): void => void emitter.on(type, fn),
    modal: () => Promise.resolve(),
    explain: () => undefined,
  };
  const sheet = new SelectionSheet(env as never);
  sheet.layout(RECT);
  sheet.select(12);
  return { sheet, unit, events, battle };
}

function fakeBattle(spOn: boolean, events: SpyEmitter, units: Array<UnitState | null>) {
  return {
    spOn,
    events,
    time: 10,
    units,
    purr: 0,
    wave: 1,
    synergyTier: () => 0,
    awakenCost: () => 3,
    canAwaken: () => 'not_legendary',
    moltCostOf: () => 2,
    moltsLeft: () => 3,
    sellValue: () => ({ fish: 80, purr: 0 }),
    previewWave: () => [],
    enemies: [],
    boss: null,
  };
}

/** Every node under `root` with this label. */
function byLabel(root: Container, label: string, out: Container[] = []): Container[] {
  if (root.label === label) out.push(root);
  for (const c of root.children) byLabel(c as Container, label, out);
  return out;
}

const tapInfo = (sheet: SelectionSheet): { title: string; text: string; seconds: number | undefined } | null => {
  const [sticker] = byLabel(sheet.root, 'skill-info');
  if (!sticker) return null;
  vi.mocked(info.tap).mockClear();
  sticker.emit('pointerdown', {} as never);
  const call = vi.mocked(info.tap).mock.calls[0];
  if (!call) return null;
  return { title: (call[2] as { title: string }).title, text: (call[2] as { text: string }).text, seconds: (call[3] as { seconds?: number }).seconds };
};

describe('the selection sheet with skills on', () => {
  it('puts the skill ring on the photo\'s corner for a cat that has a skill, and a ring for each of the twelve', () => {
    for (const id of ['w_viking', 'w_samurai', 'w_tiger', 'r_ninja', 'r_gunner', 'r_star', 'm_storm', 'm_frost', 'm_cosmo', 't_bard', 't_alch', 't_lucky'] as UnitId[]) {
      const { sheet } = makeSheet(true, id);
      const rings = byLabel(sheet.root, 'sheet-ring');
      expect(rings, id).toHaveLength(1);
      const at = sheetSkillRing(RECT.w, RECT.h);
      expect(rings[0]?.position.x, id).toBe(at.centre.x);
      expect(rings[0]?.position.y, id).toBe(at.centre.y);
      sheet.destroy();
    }
  });

  it('has no ring for a cat without a skill', () => {
    for (const id of ['w_paw', 'w_sword', 'r_sling', 'm_snow', 't_chef', 't_bell'] as UnitId[]) {
      const { sheet } = makeSheet(true, id);
      expect(byLabel(sheet.root, 'sheet-ring'), id).toHaveLength(0);
      expect(byLabel(sheet.root, 'skill-info').length, id).toBeLessThanOrEqual(1);
      sheet.destroy();
    }
  });

  it('turns the ring with the gauge on every frame the HUD updates, without the sheet being rebuilt', () => {
    const { sheet, unit } = makeSheet(true, 'w_viking', 0.5);
    const art = spRingArt();
    const body = (): Texture => (((byLabel(sheet.root, 'sheet-ring')[0] as Container).children[1] as Container).children[1] as Sprite).texture;
    sheet.update(1 / 60);
    expect(body()).toBe(art.frames[12]);
    unit.sp = 0.75;
    sheet.update(1 / 60);
    expect(body()).toBe(art.frames[18]);
    unit.sp = 1;
    sheet.update(1 / 60);
    expect(body()).toBe(art.frames[RING_FULL]);
    unit.sp = 0;
    sheet.update(1 / 60);
    expect(body()).toBe(art.frames[0]);
  });

  it('flashes the ring when the selected cat casts, and not when another cat does', () => {
    const { sheet, unit, events, battle } = makeSheet(true, 'w_viking', 1);
    const flash = (): boolean => (((byLabel(sheet.root, 'sheet-ring')[0] as Container).children[1] as Container).children[2] as Sprite).visible;
    sheet.update(1 / 60);
    expect(flash()).toBe(false);
    events.emit('spCast', { unit: fakeUnit('r_ninja', 0, { uid: 99 }), skill: 'clones' } as never);
    sheet.update(1 / 60);
    expect(flash()).toBe(false);
    unit.sp = 0;
    events.emit('spCast', { unit, skill: 'shove' } as never);
    battle.time += 0.05;
    sheet.update(1 / 60);
    expect(flash()).toBe(true);
    battle.time += 1;
    sheet.update(1 / 60);
    expect(flash()).toBe(false);
  });

  it('gives a cat with a skill the "i" sticker even when its ability line fits, and the bubble says the ability line, a blank line, the skill\'s head and its line', () => {
    for (const lang of ['ko', 'en'] as const) {
      setLang(lang);
      for (const id of SHORT_LINE_CATS) {
        const { sheet } = makeSheet(true, id);
        const tapped = tapInfo(sheet);
        expect(tapped, `${lang} ${id}`).not.toBeNull();
        const skill = unitDef(id).spSkill;
        expect(tapped?.text, `${lang} ${id}`).toBe(`${unitDef(id).skillText()}\n\n${spTexts(skill?.id as never).bubble}`);
        sheet.destroy();
      }
    }
  });

  it('keeps the bubble up longer when it carries the skill too', () => {
    const { sheet } = makeSheet(true, 'w_viking');
    const withSkill = tapInfo(sheet)?.seconds ?? 0;
    const off = makeSheet(false, 'w_viking');
    const without = tapInfo(off.sheet)?.seconds ?? 0;
    expect(withSkill).toBeGreaterThan(without);
  });

  it('quotes the row: a retuned cooldown is the number in the bubble', () => {
    const old = SP_ROWS.shove.cooldown;
    SP_ROWS.shove.cooldown = 17;
    try {
      const { sheet } = makeSheet(true, 'w_viking');
      expect(tapInfo(sheet)?.text).toContain('\n17초마다 · ');
    } finally {
      SP_ROWS.shove.cooldown = old;
    }
  });

  it('draws the ring again for the next cat when another is selected, and never twice', () => {
    const { sheet, battle } = makeSheet(true, 'w_viking');
    battle.units[13] = fakeUnit('w_paw', 0, { uid: 8 });
    sheet.select(13);
    expect(byLabel(sheet.root, 'sheet-ring')).toHaveLength(0);
    battle.units[14] = fakeUnit('m_cosmo', 0.3, { uid: 9 });
    sheet.select(14);
    expect(byLabel(sheet.root, 'sheet-ring')).toHaveLength(1);
    sheet.select(12);
    expect(byLabel(sheet.root, 'sheet-ring')).toHaveLength(1);
  });
});

describe('the selection sheet with skills off', () => {
  it('has no ring, for any cat', () => {
    for (const id of ['w_viking', 'w_tiger', 't_lucky', 'w_paw'] as UnitId[]) {
      const { sheet } = makeSheet(false, id);
      expect(byLabel(sheet.root, 'sheet-ring'), id).toHaveLength(0);
      sheet.update(1 / 60);
      expect(byLabel(sheet.root, 'sheet-ring'), id).toHaveLength(0);
      sheet.destroy();
    }
  });

  it('has no "i" sticker for an ability line that fits, and when one is cut the bubble says the ability line and nothing else', () => {
    for (const id of SHORT_LINE_CATS) {
      const { sheet } = makeSheet(false, id);
      // the stand-in measures ten px a letter: whether this line is cut decides whether there is a sticker, and the bubble never has a skill in it
      const tapped = tapInfo(sheet);
      if (tapped) expect(tapped.text, id).toBe(unitDef(id).skillText());
      else expect(unitDef(id).skillText().length * 10, id).toBeLessThanOrEqual(RECT.w);
      sheet.destroy();
    }
    const { sheet } = makeSheet(false, 'w_viking');
    const tapped = tapInfo(sheet);
    expect(tapped?.text).toBe(unitDef('w_viking').skillText());
    expect(tapped?.text).not.toMatch(/스킬/);
    expect(tapped?.seconds).toBe(8);
  });

  it('listens for no skill cast', () => {
    const { events } = makeSheet(false, 'w_viking');
    expect(events.heard.has('spCast')).toBe(false);
    const on = makeSheet(true, 'w_viking');
    expect(on.events.heard.has('spCast')).toBe(true);
  });
});
