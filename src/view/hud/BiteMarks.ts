/**
 * What the gunner's bite leaves on the boss strip (docs/design_skills_v2.md 3.5): "-6%" rising from the bar where the bite fell out of it, a
 * pair of eggs under the boss's portrait that fill one by one (the pool is two bites), and, when the pool is empty, a "case closed" seal (a
 * padlock in a ring: the strip already has a green tick) stamped on a corner of the boss's portrait. `BossBar` owns one; it shows a bite when the cork lands (`biteHold.ts`), not when the simulation took it.
 * No word is written anywhere but the digits of the share: the game has no string for "case closed" yet.
 */
import { Container, Sprite, type Text } from 'pixi.js';
import { Ease } from '@/core/tween';
import { artLabel, Color, motion, TweenBag } from '@/ui';
import { EGGS, biteText, eggsFilled } from '../biteHold';
import { wantedArt } from '../wantedArt';

/** How wide each egg and the seal are drawn on the strip (design px). */
const EGG_SHOWN = 21;
const EGG_STEP = 23;
/** The seal is a small stamp in the portrait's upper-right corner (the face stays in sight), tilted like the poster's. */
export const STAMP_SHOWN = 32;
const STAMP_TILT = -0.3;
const STAMP_DX = 24;
const STAMP_DY = -14;
/** The share's label: size, how far it rises and how long it lives. */
const POP_SIZE = 28;
/** It starts on the bar and rises only this far: the row above holds the time left and the estimate, which it must not cover. */
const POP_RISE = 5;
const POP_SECONDS = 1.0;

export class BiteMarks {
  readonly root = new Container();
  private readonly bag = new TweenBag();
  private readonly eggs: Sprite[] = [];
  private readonly stamp = new Sprite();
  private pop: Text | null = null;
  private filled = 0;
  private stamped = false;

  constructor() {
    const art = wantedArt();
    this.root.eventMode = 'none';
    this.stamp.texture = art.lock;
    this.stamp.anchor.set(0.5);
    this.stamp.rotation = STAMP_TILT;
    this.stamp.scale.set(STAMP_SHOWN / this.stamp.texture.width);
    this.stamp.visible = false;
    for (let i = 0; i < EGGS; i++) {
      const egg = new Sprite(art.eggEmpty);
      egg.anchor.set(0.5);
      egg.visible = false;
      this.eggs.push(egg);
    }
    this.root.addChild(...this.eggs, this.stamp);
  }

  /**
   * The strip's portrait is the boss's mugshot: the two eggs hang under it, side by side centred on `x`, as they do under the poster, and
   * the seal goes on its upper-right corner. (They are not put after the name: the name row has no room to spare once the estimate shows.)
   */
  layout(x: number, eggsY: number, stampY: number): void {
    this.eggs.forEach((egg, i) => egg.position.set(x + (i - (EGGS - 1) / 2) * EGG_STEP, eggsY));
    this.stamp.position.set(x + STAMP_DX, stampY + STAMP_DY);
  }

  /** A new boss, or the strip went away: nothing was taken from it. */
  reset(): void {
    this.bag.killAll();
    this.filled = 0;
    this.stamped = false;
    this.stamp.visible = false;
    for (const egg of this.eggs) egg.visible = false;
    if (this.pop) this.pop.visible = false;
  }

  /**
   * The cork landed: the share's label rises from (`x`, `y`) on the bar, the eggs fill up to what this target has given (`taken` of `pool`),
   * and the seal comes down when `closed`.
   */
  show(share: number, taken: number, pool: number, closed: boolean, x: number, y: number): void {
    const calm = motion.reduced;
    const now = eggsFilled(taken, pool);
    const first = this.filled;
    this.filled = Math.max(first, now);
    const art = wantedArt();
    this.eggs.forEach((egg, i) => {
      egg.visible = true;
      egg.texture = i < this.filled ? art.eggFull : art.eggEmpty;
    });
    for (let i = first; i < this.filled; i++) this.swell(this.eggs[i] as Sprite, EGG_SHOWN / this.eggs[i]!.texture.width, 1.7, calm);

    if (closed && !this.stamped) {
      this.stamped = true;
      this.stamp.visible = true;
      const base = STAMP_SHOWN / this.stamp.texture.width;
      if (calm) this.stamp.scale.set(base);
      else this.swell(this.stamp, base, 1.9, calm);
    }
    this.label(biteText(share), x, y, calm);
  }

  /** A sprite pops: `from` times its resting size, settling in a fifth of a second. */
  private swell(sprite: Sprite, rest: number, from: number, calm: boolean): void {
    sprite.scale.set(rest * (calm ? 1 : from));
    if (calm) return;
    this.bag.runKeyed(sprite, {
      duration: 0.2,
      ease: Ease.cubicOut,
      onUpdate: (k) => sprite.scale.set(rest * (from + (1 - from) * k)),
      onComplete: () => sprite.scale.set(rest),
    });
  }

  private label(text: string, x: number, y: number, calm: boolean): void {
    const pop = (this.pop ??= artLabel(text, { size: POP_SIZE, color: Color.mustard }));
    if (!pop.parent) this.root.addChild(pop);
    pop.text = text;
    pop.visible = true;
    pop.alpha = 1;
    pop.position.set(x, y);
    pop.scale.set(1);
    this.bag.runKeyed(pop, {
      duration: POP_SECONDS,
      ease: Ease.linear,
      onUpdate: (k) => {
        if (calm) return;
        pop.position.set(x, y - POP_RISE * Ease.cubicOut(k));
        pop.scale.set(k < 0.12 ? 1 + 0.3 * (1 - k / 0.12) : 1);
        pop.alpha = k < 0.55 ? 1 : 1 - (k - 0.55) / 0.45;
      },
      onComplete: () => (pop.visible = false),
    });
  }

  destroy(): void {
    this.bag.killAll();
    this.root.destroy({ children: true });
  }
}
