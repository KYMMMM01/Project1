import { BitmapFont, BitmapText, Container, FillGradient } from 'pixi.js';
import { Ease } from '@/core/tween';
import { clamp, formatNumber } from '@/core/math';
import { Color, FONT_FAMILY } from '@/ui/theme';
import { popCurve, springWobble } from './curves';
import { fxSettings } from './settings';

export type NumStyle = 'damage' | 'crit' | 'dot' | 'heal' | 'gold' | 'hurt' | 'big';

const FONT_PLAIN = 'FxNum';
const FONT_HOT = 'FxNumHot';
const BAKED = 64;

let fontsReady = false;

/**
 * Bake the two bitmap fonts once. Call after the game fonts are loaded (BootScene does this before
 * any scene starts); show() calls it lazily too. Plain = white fill, dark outline, tinted per style;
 * Hot = baked gold-to-orange gradient with a brown outline for crits and boss hits.
 */
export function ensureNumberFonts(): void {
  if (fontsReady) return;
  fontsReady = true;
  const chars = [['0', '9'], ['A', 'Z'], '+-.,!x%ai ×'];
  BitmapFont.install({
    name: FONT_PLAIN,
    chars,
    resolution: 2,
    padding: 8,
    style: {
      fontFamily: FONT_FAMILY,
      fontSize: BAKED,
      fill: 0xffffff,
      stroke: { color: Color.outline, width: 11, join: 'round' },
      dropShadow: { color: Color.outline, alpha: 0.85, blur: 0, angle: Math.PI / 2, distance: 5 },
    },
  });
  BitmapFont.install({
    name: FONT_HOT,
    chars,
    resolution: 2,
    padding: 8,
    style: {
      fontFamily: FONT_FAMILY,
      fontSize: BAKED,
      fill: new FillGradient({
        type: 'linear',
        start: { x: 0, y: 0 },
        end: { x: 0, y: 1 },
        colorStops: [
          { offset: 0, color: 0xfff6b0 },
          { offset: 0.45, color: 0xffd23a },
          { offset: 1, color: 0xff8a1e },
        ],
        textureSpace: 'local',
      }),
      stroke: { color: 0x6b2e00, width: 12, join: 'round' },
      dropShadow: { color: 0x2a0f00, alpha: 0.9, blur: 0, angle: Math.PI / 2, distance: 6 },
    },
  });
}

interface StyleDef {
  font: string;
  tint: number;
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
    font: FONT_PLAIN, tint: 0xffffff, size: [30, 48], life: 0.6, rise: 40, pop: [0.6, 1.15, 1], popSeconds: 0.14,
    tilt: 0, prio: 0, prefix: '', suffix: '', scatter: 24,
  },
  crit: {
    font: FONT_HOT, tint: 0xffffff, size: [44, 64], life: 0.9, rise: 58, pop: [0.6, 1.5, 1.2], popSeconds: 0.18,
    tilt: 0.052, prio: 2, prefix: '', suffix: '!', scatter: 22,
  },
  dot: {
    font: FONT_PLAIN, tint: 0xa6ec5a, size: [22, 30], life: 0.55, rise: 36, pop: [0.6, 1.1, 1], popSeconds: 0.12,
    tilt: 0, prio: 0, prefix: '', suffix: '', scatter: 26,
  },
  heal: {
    font: FONT_PLAIN, tint: 0x6dff8a, size: [32, 42], life: 0.85, rise: 52, pop: [0.5, 1.2, 1], popSeconds: 0.15,
    tilt: 0, prio: 1, prefix: '+', suffix: '', scatter: 14,
  },
  gold: {
    font: FONT_PLAIN, tint: Color.gold, size: [32, 44], life: 0.85, rise: 52, pop: [0.5, 1.2, 1], popSeconds: 0.15,
    tilt: 0, prio: 1, prefix: '+', suffix: '', scatter: 14,
  },
  hurt: {
    font: FONT_PLAIN, tint: 0xff5a5a, size: [34, 50], life: 0.9, rise: 48, pop: [0.5, 1.2, 1], popSeconds: 0.15,
    tilt: 0, prio: 2, prefix: '-', suffix: '', scatter: 16,
  },
  big: {
    font: FONT_HOT, tint: 0xffffff, size: [64, 92], life: 1.15, rise: 64, pop: [0.4, 1.4, 1.15], popSeconds: 0.22,
    tilt: 0.06, prio: 3, prefix: '', suffix: '!', scatter: 10,
  },
};

export interface NumberOpts {
  /** Override the style's colour tint (plain-font styles only). */
  color?: number;
  /** Extra size multiplier. */
  scale?: number;
  /** Numbers with the same key fired within 100 ms are summed into one (multi-hit on a target). */
  key?: string | number;
  /** Disable the random horizontal scatter (tests, fixed layouts). */
  noScatter?: boolean;
}

class Num {
  readonly text: BitmapText;
  style: NumStyle = 'damage';
  def: StyleDef = STYLES.damage;
  age = 0;
  x = 0;
  y = 0;
  scale = 1;
  tiltAmp = 0;
  value = 0;
  key: string | number | undefined;
  constructor(readonly font: string) {
    this.text = new BitmapText({ text: '', style: { fontFamily: font, fontSize: BAKED } });
    this.text.anchor.set(0.5);
    this.text.visible = false;
    this.text.eventMode = 'none';
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

  /** Maximum simultaneous numbers; lowering it lets the extras finish. */
  cap: number;

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
    ensureNumberFonts();

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

    if (this.active.length >= this.cap && !this.evictFor(def.prio)) {
      this.skipped++;
      return;
    }
    let n = this.pools.get(def.font)?.pop();
    if (!n) {
      n = new Num(def.font);
      this.created++;
      this.layer.addChild(n.text);
    }
    n.style = style;
    n.def = def;
    n.age = 0;
    n.key = o.key;
    n.value = typeof value === 'number' ? value : 0;
    n.text.tint = o.color ?? def.tint;
    n.text.visible = true;
    n.tiltAmp = def.tilt * (Math.random() < 0.5 ? -1 : 1) * (0.6 + Math.random() * 0.4);
    n.x = x + (o.noScatter ? 0 : (Math.random() * 2 - 1) * def.scatter);
    n.y = y;
    this.setText(n, value, def, o);
    this.layer.addChild(n.text);
    this.active.push(n);
    this.apply(n);
  }

  update(dt: number): void {
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
    n.text.text = def.prefix + str.replace(/^-/, '') + def.suffix;
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
    const text = n.text;
    text.scale.set(s);
    text.position.set(n.x, n.y - d.rise * Ease.cubicOut(Math.min(1, n.age / (d.life * 0.9))));
    text.rotation = n.tiltAmp === 0 ? 0 : springWobble(n.age, n.tiltAmp, 3.2, 3.5);
    // Hold fully opaque for the first 70% of life, then fade out.
    text.alpha = t < 0.7 ? 1 : 1 - Ease.quadIn((t - 0.7) / 0.3);
  }

  private recycle(n: Num): void {
    n.text.visible = false;
    let pool = this.pools.get(n.font);
    if (!pool) {
      pool = [];
      this.pools.set(n.font, pool);
    }
    pool.push(n);
  }
}
