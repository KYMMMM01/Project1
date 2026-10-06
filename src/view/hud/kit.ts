/** Small display helpers shared by the HUD components: portraits, icons, hit areas, class colours. */
import { Container, Graphics, Rectangle, Sprite, type DestroyOptions } from 'pixi.js';
import { hasTex, tex } from '@/core/assets';
import { game } from '@/core/game';
import type { ClassId, EnemyId, RarityId, RelicId, UnitId } from '@/game';
import { bindPress, drawIcon, Rarity, vGradient, type IconName, type PressBinding } from '@/ui';

export const CLASS_ICON: Record<ClassId, IconName> = {
  warrior: 'class_warrior',
  ranger: 'class_ranger',
  mage: 'class_mage',
  trickster: 'class_trickster',
};

/** Accent of each class: lit synergy steps and the tier-up flare. */
export const CLASS_ACCENT: Record<ClassId, number> = {
  warrior: 0xff7a59,
  ranger: 0x6fdc5a,
  mage: 0x6aa8ff,
  trickster: 0xffd23f,
};

/** Stand-in icon for a toy without art: one glyph per rarity so a toy is never a blank square. */
const RELIC_FALLBACK: Record<Exclude<RarityId, 'mythic'>, IconName> = {
  common: 'paw',
  rare: 'heart',
  epic: 'star',
  legendary: 'crown',
};

/** A texture scaled to fit `box` x `box` and centred on the origin, or null when the art is not loaded. */
export function fitSprite(key: string, box: number): Sprite | null {
  if (!hasTex(key)) return null;
  const s = new Sprite(tex(key));
  s.anchor.set(0.5);
  const k = box / Math.max(s.texture.width, s.texture.height, 1);
  s.scale.set(k);
  return s;
}

/** Unit portrait about `h` tall, origin = centre. */
export function unitPortrait(id: UnitId, h: number): Container {
  const c = new Container();
  const s = fitSprite(`unit_${id}`, h);
  if (s) c.addChild(s);
  else c.addChild(drawIcon('paw', h * 0.8));
  return c;
}

/** Enemy portrait; small balloons borrow the big balloon's art, and anything unknown becomes a plain disc. */
export function enemyPortrait(id: EnemyId, size: number): Container {
  const c = new Container();
  const key = id.startsWith('boss_') ? id : `enemy_${id}`;
  const s = fitSprite(key, size) ?? fitSprite(key.replace('_small', ''), size * 0.75);
  if (s) c.addChild(s);
  else {
    const g = new Graphics();
    g.circle(0, 0, size * 0.38).fill(vGradient(0xd9d0f0, 0x8678b8)).stroke({ width: 4, color: 0x140a2e });
    c.addChild(g, drawIcon('skull', size * 0.5));
  }
  return c;
}

/** Toy icon: the art when it exists, otherwise a rarity-coloured medallion with a glyph. */
export function relicIcon(id: RelicId, size: number, rarity: Exclude<RarityId, 'mythic'>): Container {
  const c = new Container();
  const s = fitSprite(`relic_${id}`, size);
  if (s) {
    c.addChild(s);
    return c;
  }
  const r = Rarity[rarity];
  const g = new Graphics();
  g.circle(0, size * 0.04, size * 0.46).fill({ color: 0x07030f, alpha: 0.35 });
  g.circle(0, 0, size * 0.46).fill(vGradient(r.light, r.color)).stroke({ width: Math.max(3, size * 0.07), color: 0x140a2e });
  c.addChild(g, drawIcon(RELIC_FALLBACK[rarity], size * 0.58));
  return c;
}

/** Make `c` a touch target covering the rectangle (in its own coordinates). */
export function tapArea(c: Container, x: number, y: number, w: number, h: number): void {
  c.eventMode = 'static';
  c.cursor = 'pointer';
  c.hitArea = new Rectangle(x, y, w, h);
}

/** Make `c` a touch target of at least 88 x 88 centred on its origin. */
export function tapCentered(c: Container, w: number, h: number): void {
  const ww = Math.max(88, w);
  const hh = Math.max(88, h);
  tapArea(c, -ww / 2, -hh / 2, ww, hh);
}

export interface PressCardOpts {
  /** Fire on pointerdown (gameplay choices) instead of on release. */
  onDown?: boolean;
  /** A hold at least this long (tooltip time) is not a tap. */
  holdLimit?: number;
}

/**
 * A tappable card: the press dips and darkens it on the pointerdown frame, the release springs back.
 * `fire` runs on release inside the card (or on the down frame with `onDown`).
 */
export class PressCard extends Container {
  private readonly press: PressBinding;
  private downAt = 0;
  private enabledFlag = true;
  private dipped = false;

  constructor(w: number, h: number, private fire: (() => void) | null, opts: PressCardOpts = {}) {
    super();
    tapArea(this, -w / 2, -h / 2, w, h);
    const limit = opts.holdLimit ?? Infinity;
    this.press = bindPress(this, {
      down: () => {
        if (!this.enabledFlag) return;
        this.dipped = true;
        this.scale.set(this.scale.x * 0.96);
        this.tint = 0xd9d2ee;
        this.downAt = game.time;
        if (opts.onDown) this.fire?.();
      },
      up: (released) => {
        if (this.dipped) {
          this.dipped = false;
          this.tint = 0xffffff;
          this.scale.set(this.scale.x / 0.96);
        }
        if (!this.enabledFlag || opts.onDown) return;
        if (released && game.time - this.downAt < limit) this.fire?.();
      },
    });
  }

  setEnabled(v: boolean): void {
    this.enabledFlag = v;
  }

  setFire(fn: (() => void) | null): void {
    this.fire = fn;
  }

  override destroy(options?: DestroyOptions): void {
    this.press.dispose();
    this.fire = null;
    super.destroy(options);
  }
}

/** Event subscriptions of a popup or screen: released together when it is destroyed. */
export class Subs {
  private offs: Array<() => void> = [];

  add(off: () => void): void {
    this.offs.push(off);
  }

  dispose(): void {
    for (const off of this.offs.splice(0)) off();
  }
}
