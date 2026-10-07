import { BitmapFont, BitmapFontManager, BitmapText, Container, Sprite, TextStyle, type Texture } from 'pixi.js';
import { Ease } from '@/core/tween';
import { clamp, formatNumber, mixColor } from '@/core/math';
import { Color, FONT_FAMILY } from '@/ui/theme';
import { popCurve, springWobble } from './curves';
import { fxSettings } from './settings';
import { fxTexture } from './textures';

export type NumStyle = 'damage' | 'crit' | 'dot' | 'heal' | 'gold' | 'hurt' | 'big';

const BAKED = 64;
/** New plain numbers (priority 0 and 1) accepted per frame: a zone ticking on forty enemies would lay down a hundred a frame, all but the newest evicted before one was drawn. */
const PLAIN_PER_FRAME = 3;
/** Width and height of the room a number takes along a clamped line: the next one lands beside it, not on it. */
const SLOT_W = 62;
const SLOT_Y = 34;
/** How far a face colour is lightened toward cream: on artwork the digits are light with a brown stroke (kit rule), the hue still says the kind. */
const FACE_LIGHT = 0.3;
/** Width of the brown stroke at the baked size (the fill covers its inner half). */
const STROKE = 12;
const CHARS = [['0', '9'], ['A', 'Z'], '+-.,!x%ai ×'];

const faces = new Map<number, string>();
const fonts = new Map<string, ReturnType<typeof BitmapFontManager.getFont>>();

/** The bitmap font of one face colour: the paper tone lightened toward cream, inside one flat brown stroke. Baked once per colour. */
function faceFont(color: number): string {
  let name = faces.get(color);
  if (name) return name;
  name = 'FxNum' + color.toString(16);
  faces.set(color, name);
  BitmapFont.install({
    name,
    chars: CHARS,
    resolution: 2,
    padding: 10,
    style: {
      fontFamily: FONT_FAMILY,
      fontSize: BAKED,
      fill: mixColor(color, Color.paperLight, FACE_LIGHT),
      stroke: { color: Color.ink, width: STROKE, join: 'round' },
    },
  });
  fonts.set(name, BitmapFontManager.getFont('0', new TextStyle({ fontFamily: name, fontSize: BAKED })));
  return name;
}

/** The glyph sheets of every face font baked so far: the warm-up puts them on the graphics card before the first number is drawn. */
export function numberFontTextures(): Texture[] {
  const out: Texture[] = [];
  for (const font of fonts.values()) for (const page of font.pages) out.push(page.texture);
  return out;
}

/**
 * Draw the face font of `color` now: for a colour that is not one of the stock styles' (a damage-over-time tick, a shield), whose font would
 * otherwise be drawn on the frame of its first number, 20 ms in the middle of a fight.
 */
export function bakeNumberFace(color: number): void {
  faceFont(color);
}

/**
 * Bake the face fonts of the stock styles once: 140 ms of drawing glyphs, so a battle does it while its scene is built (BattleScene) and
 * not on the frame of the first hit; show() calls it lazily too. A number floats over artwork, so it is light digits
 * (tinted by kind) inside one brown stroke, with no shadow and no second outline.
 */
export function ensureNumberFonts(): void {
  for (const def of Object.values(STYLES)) faceFont(def.face);
}

interface StyleDef {
  /** Flat face colour of the sticker. */
  face: number;
  /** A paper starburst behind the number, in this colour (crits and boss hits). */
  burst: number | null;
  /** Rendered glyph height in design px at magnitude 1 and at magnitude 1000 (it grows with log10). */
  size: readonly [number, number];
  life: number;
  rise: number;
  /** Starts, peaks and settles at these multiples of the target scale. */
  pop: readonly [number, number, number];
  popSeconds: number;
  /** Radians of random tilt amplitude (crit wobble). */
  tilt: number;
  /** 0 low .. 3 never dropped. */
  prio: number;
  prefix: string;
  suffix: string;
  /** Horizontal scatter in design px. */
  scatter: number;
}

const STYLES: Record<NumStyle, StyleDef> = {
  damage: {
    face: Color.coral, burst: null, size: [30, 48], life: 0.6, rise: 40, pop: [0.6, 1.15, 1], popSeconds: 0.14,
    tilt: 0, prio: 0, prefix: '', suffix: '', scatter: 24,
  },
  crit: {
    face: Color.mustard, burst: Color.coral, size: [40, 56], life: 0.9, rise: 58, pop: [0.6, 1.5, 1.2], popSeconds: 0.18,
    tilt: 0.052, prio: 2, prefix: '', suffix: '!', scatter: 22,
  },
  dot: {
    face: Color.teal, burst: null, size: [22, 30], life: 0.55, rise: 36, pop: [0.6, 1.1, 1], popSeconds: 0.12,
    tilt: 0, prio: 0, prefix: '', suffix: '', scatter: 26,
  },
  heal: {
    face: Color.leaf, burst: null, size: [32, 42], life: 0.85, rise: 52, pop: [0.5, 1.2, 1], popSeconds: 0.15,
    tilt: 0, prio: 1, prefix: '+', suffix: '', scatter: 14,
  },
  gold: {
    face: Color.mustard, burst: null, size: [32, 44], life: 0.85, rise: 52, pop: [0.5, 1.2, 1], popSeconds: 0.15,
    tilt: 0, prio: 1, prefix: '+', suffix: '', scatter: 14,
  },
  hurt: {
    face: Color.berry, burst: null, size: [34, 50], life: 0.9, rise: 48, pop: [0.5, 1.2, 1], popSeconds: 0.15,
    tilt: 0, prio: 2, prefix: '-', suffix: '', scatter: 16,
  },
  big: {
    face: Color.mustard, burst: Color.berry, size: [56, 80], life: 1.15, rise: 64, pop: [0.4, 1.4, 1.15], popSeconds: 0.22,
    tilt: 0.06, prio: 3, prefix: '', suffix: '!', scatter: 10,
  },
};

export interface NumberOpts {
  /** Override the style's face colour. */
  color?: number;
  /** Extra size multiplier. */
  scale?: number;
  /** Numbers with the same key fired within 100 ms are summed into one (multi-hit on a target). */
  key?: string | number;
  /** Disable the random horizontal scatter (tests, fixed layouts). */
  noScatter?: boolean;
}

/** One number: an optional paper starburst behind the stroked digits, drawn as one object. */
class Num {
  readonly root = new Container();
  readonly face: BitmapText;
  private readonly burst: Sprite;
  style: NumStyle = 'damage';
  def: StyleDef = STYLES.damage;
  age = 0;
  x = 0;
  y = 0;
  scale = 1;
  tiltAmp = 0;
  value = 0;
  /** Half the width of the digits at scale 1. */
  half = 0;
  key: string | number | undefined;
  constructor(readonly font: string) {
    this.burst = new Sprite(fxTexture('starburst'));
    this.burst.anchor.set(0.5);
    this.burst.width = this.burst.height = BAKED * 2.1;
    this.burst.visible = false;
    this.face = new BitmapText({ text: '', style: { fontFamily: font, fontSize: BAKED } });
    this.face.anchor.set(0.5);
    this.root.addChild(this.burst, this.face);
    this.root.visible = false;
    this.root.eventMode = 'none';
  }

  setText(text: string): void {
    this.face.text = text;
    this.half = this.face.width / 2;
  }

  setBurst(color: number | null): void {
    this.burst.visible = color !== null;
    if (color !== null) this.burst.tint = color;
  }
}

/**
 * Pooled floating combat text. At most `cap` are alive at once: when full, a new number evicts the
 * oldest one of the lowest priority that is not more important than itself (the guide drops the
 * oldest), so crits and boss hits are never lost to a flurry of plain hits, while a plain hit finding
 * only important numbers on screen is the one skipped. Motion is analytic in update(dt): no tweens,
 * no per-frame allocation.
 */
export class FloatingNumbers {
  readonly layer = new Container();
  private readonly active: Num[] = [];
  private readonly pools = new Map<string, Num[]>();
  /** Total BitmapText objects ever created, per stats(). */
  created = 0;
  skipped = 0;
  /** Plain numbers started since the last `update`. */
  private plainThisFrame = 0;
  private fontsReady = false;

  /** Maximum simultaneous numbers; lowering it lets the extras finish. */
  cap: number;
  /** A number never rises above this y (layer space): the scene sets it to the edge of the HUD so no hit is drawn under a pill. */
  minY = -Infinity;
  /** Its digits never cross these x (layer space): the screen edges, so a hit on the outer lane is not cut in half. */
  minX = -Infinity;
  maxX = Infinity;

  constructor(parent: Container, cap = 40) {
    this.cap = cap;
    this.layer.label = 'fx-numbers';
    this.layer.eventMode = 'none';
    parent.addChild(this.layer);
  }

  get count(): number {
    return this.active.length;
  }

  show(x: number, y: number, value: number | string, style: NumStyle = 'damage', o: NumberOpts = {}): void {
    const def = STYLES[style];
    const mode = fxSettings.numbers;
    if (mode === 'off' || (mode === 'brief' && def.prio < 2)) return;
    if (!this.fontsReady) {
      ensureNumberFonts();
      this.fontsReady = true;
    }

    if (o.key !== undefined && typeof value === 'number') {
      for (const a of this.active) {
        if (a.key === o.key && a.style === style && a.age < 0.1) {
          a.value += value;
          a.age = Math.min(a.age, 0.04);
          this.setText(a, a.value, def, o);
          return;
        }
      }
    }

    if (def.prio < 2 && this.plainThisFrame >= PLAIN_PER_FRAME) {
      this.skipped++;
      return;
    }
    if (this.active.length >= this.cap && !this.evictFor(def.prio)) {
      this.skipped++;
      return;
    }
    if (def.prio < 2) this.plainThisFrame++;
    const font = faceFont(o.color ?? def.face);
    let n = this.pools.get(font)?.pop();
    if (!n) {
      n = new Num(font);
      this.created++;
      this.layer.addChild(n.root);
    }
    n.style = style;
    n.def = def;
    n.age = 0;
    n.key = o.key;
    n.value = typeof value === 'number' ? value : 0;
    n.setBurst(def.burst);
    n.root.visible = true;
    n.tiltAmp = def.tilt * (Math.random() < 0.5 ? -1 : 1) * (0.6 + Math.random() * 0.4);
    const sx = x + (o.noScatter ? 0 : (Math.random() * 2 - 1) * def.scatter);
    // A hit near the top of the screen is held at `minY`: several of them would end on one line and read as one long number.
    n.x = Number.isFinite(this.minY) && y - def.rise <= this.minY + 8 ? this.freeX(sx, Math.max(this.minY, y - def.rise)) : sx;
    n.y = y;
    this.setText(n, value, def, o);
    this.layer.addChild(n.root);
    this.active.push(n);
    this.apply(n);
  }

  update(dt: number): void {
    this.plainThisFrame = 0;
    const list = this.active;
    let w = 0;
    for (let i = 0; i < list.length; i++) {
      const n = list[i] as Num;
      n.age += dt;
      if (n.age >= n.def.life) {
        this.recycle(n);
        continue;
      }
      this.apply(n);
      list[w++] = n;
    }
    list.length = w;
  }

  clear(): void {
    for (const n of this.active) this.recycle(n);
    this.active.length = 0;
  }

  destroy(): void {
    this.clear();
    this.layer.destroy({ children: true });
  }

  stats(): { alive: number; created: number; skipped: number } {
    return { alive: this.active.length, created: this.created, skipped: this.skipped };
  }

  /** Free one slot for a number of priority `prio`; false when everything alive outranks it. */
  /** The nearest spot along a line (right first, then left, up to two numbers' width each way) that no live number is already on. */
  private freeX(x: number, line: number): number {
    for (let k = 0; k < 5; k++) {
      const cand = x + (k % 2 === 1 ? 1 : -1) * Math.ceil(k / 2) * SLOT_W;
      let free = true;
      for (const a of this.active) {
        if (Math.abs(a.root.x - cand) < SLOT_W && Math.abs(a.root.y - line) < SLOT_Y) {
          free = false;
          break;
        }
      }
      if (free) return cand;
    }
    return x;
  }

  private evictFor(prio: number): boolean {
    const list = this.active;
    let victim = -1;
    let lowest = prio + 1;
    for (let i = 0; i < list.length; i++) {
      const p = (list[i] as Num).def.prio;
      // Strictly lower wins, so among equals the earliest (oldest) is kept as the victim.
      if (p < lowest) {
        lowest = p;
        victim = i;
      }
    }
    if (victim < 0) return false;
    this.recycle(list[victim] as Num);
    for (let i = victim + 1; i < list.length; i++) list[i - 1] = list[i] as Num;
    list.length--;
    return true;
  }

  private setText(n: Num, value: number | string, def: StyleDef, o: NumberOpts): void {
    const mag = typeof value === 'number' ? Math.max(1, Math.abs(value)) : 1;
    const str = typeof value === 'number' ? formatNumber(value) : value;
    n.setText(def.prefix + str.replace(/^-/, '') + def.suffix);
    // Size grows with log10 of the magnitude (guide: 30 + 6 log10 px), so a 4-digit hit reads bigger
    // than a 2-digit one.
    const k = clamp(Math.log10(mag) / 3, 0, 1);
    const px = def.size[0] + (def.size[1] - def.size[0]) * k;
    n.scale = (px / BAKED) * (o.scale ?? 1) * 1.28;
  }

  private apply(n: Num): void {
    const d = n.def;
    const t = n.age / d.life;
    const pop = popCurve(Math.min(1, n.age / d.popSeconds), d.pop[0], d.pop[1], d.pop[2]);
    const s = n.scale * pop;
    const root = n.root;
    root.scale.set(s);
    const reach = n.half * s;
    root.position.set(clamp(n.x, this.minX + reach, this.maxX - reach), Math.max(this.minY, n.y - d.rise * Ease.cubicOut(Math.min(1, n.age / (d.life * 0.9)))));
    root.rotation = n.tiltAmp === 0 ? 0 : springWobble(n.age, n.tiltAmp, 3.2, 3.5);
    // Hold fully opaque for the first 70% of life, then fade out.
    root.alpha = t < 0.7 ? 1 : 1 - Ease.quadIn((t - 0.7) / 0.3);
  }

  private recycle(n: Num): void {
    n.root.visible = false;
    let pool = this.pools.get(n.font);
    if (!pool) {
      pool = [];
      this.pools.set(n.font, pool);
    }
    pool.push(n);
  }
}
