/**
 * "피했어요!" over a cat that a wet or zap cell missed (the bell kitten's dodge): a small paper sticker that pops in above the cat,
 * rises and fades. Pooled and capped, never taking a touch; under reduced motion it simply shows and goes.
 */
import { Container, Graphics, type Text } from 'pixi.js';
import { t } from '@/core/i18n';
import { Pool } from '@/core/pool';
import { Ease } from '@/core/tween';
import { cellCenterX, cellCenterY } from '@/game/geometry';
import { Color, drawPaper, motion, paperSeed, uiLabel } from '@/ui';
import type { HudEnv } from './env';

/** Seconds a sticker stays, the most that are up at once, how far it rises and how far above the cat's cell centre it starts. */
export const DODGE_SECONDS = 1.1;
export const DODGE_MAX = 4;
export const DODGE_RISE = 40;
export const DODGE_ABOVE = 46;
const POP = 0.16;
const FADE = 0.3;

/** How far the sticker has risen `age` seconds after it appeared (it slows as it goes). */
export function dodgeRise(age: number): number {
  return DODGE_RISE * Ease.quadOut(Math.min(1, Math.max(0, age) / DODGE_SECONDS));
}

/** Its opacity: full, then gone over the last `FADE` seconds. */
export function dodgeAlpha(age: number): number {
  return Math.max(0, Math.min(1, (DODGE_SECONDS - age) / FADE));
}

/** Its size: a pop from 60% with a little overshoot, then 1. */
export function dodgeScale(age: number): number {
  return age >= POP ? 1 : 0.6 + 0.4 * Ease.backOut(Math.max(0, age) / POP);
}

class Sticker {
  readonly root = new Container();
  private readonly plate = new Graphics();
  private readonly label: Text;
  age = 0;
  x = 0;
  y = 0;

  constructor() {
    this.label = uiLabel('', { size: 26, color: Color.inkDeep });
    this.root.addChild(this.plate, this.label);
    this.root.eventMode = 'none';
    this.root.visible = false;
  }

  dress(text: string): void {
    this.label.text = text;
    const w = this.label.width + 30;
    this.plate.clear();
    drawPaper(this.plate, -w / 2, -22, { w, h: 44, kind: 'pill', fill: Color.paperLight, edge: Color.teal, edgeWidth: 3.5, edgeAlpha: 1, shadow: 3, grain: false, seed: paperSeed() });
  }

  place(): void {
    this.root.position.set(this.x, this.y - (motion.reduced ? 0 : dodgeRise(this.age)));
    this.root.alpha = motion.reduced ? 1 : dodgeAlpha(this.age);
    this.root.scale.set(motion.reduced ? 1 : dodgeScale(this.age));
  }
}

export class DodgeStickers {
  private readonly pool = new Pool<Sticker>(() => new Sticker());
  /** Oldest first. */
  private readonly live: Sticker[] = [];
  private readonly root = new Container();

  constructor(
    private readonly env: HudEnv,
    parent: Container,
  ) {
    this.root.eventMode = 'none';
    parent.addChild(this.root);
    env.on(env.battle.events, 'dodge', ({ unit }) => this.show(unit.cell));
  }

  private show(cell: number): void {
    const ctx = this.env.ctx;
    const s = this.pool.get();
    s.dress(t('hud.dodge'));
    s.age = 0;
    s.x = ctx.toSceneX(cellCenterX(cell));
    s.y = ctx.toSceneY(cellCenterY(cell)) - DODGE_ABOVE;
    s.root.visible = true;
    this.root.addChild(s.root);
    this.live.push(s);
    while (this.live.length > DODGE_MAX) this.drop(this.live.shift() as Sticker);
    s.place();
  }

  update(dt: number): void {
    for (let i = this.live.length - 1; i >= 0; i--) {
      const s = this.live[i] as Sticker;
      s.age += dt;
      if (s.age >= DODGE_SECONDS) {
        this.live.splice(i, 1);
        this.drop(s);
        continue;
      }
      s.place();
    }
  }

  private drop(s: Sticker): void {
    s.root.visible = false;
    s.root.parent?.removeChild(s.root);
    this.pool.release(s);
  }

  destroy(): void {
    for (const s of this.live) s.root.destroy({ children: true });
    this.live.length = 0;
    this.pool.drain((s) => s.root.destroy({ children: true }));
    this.root.destroy({ children: true });
  }
}
