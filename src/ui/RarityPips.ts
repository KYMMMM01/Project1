import { Container, Graphics, type DestroyOptions } from 'pixi.js';
import { TAU } from '@/core/math';
import { Ease } from '@/core/tween';
import type { Box } from './layoutMath';
import { backOut, motion, TweenBag } from './motion';
import { Color, RARITY_GOLD, RARITY_ORDER, Rarity } from './theme';

export interface RarityPipsOpts {
  /** Which rarities are lit, in rarity order (common ... mythic). Missing entries count as dim. */
  owned?: readonly boolean[];
  /** Pip diameter in design px (default 16). */
  size?: number;
  gap?: number;
}

interface Pip {
  readonly holder: Container;
  readonly lit: Graphics;
  readonly dim: Graphics;
  readonly ring: Graphics;
  on: boolean;
}

const COUNT = RARITY_ORDER.length;

/** Closed outline of pip `i`: a circle, except the top rarity which is a star (so it never reads as "just another dot"). */
function pipPath(g: Graphics, i: number, r: number): void {
  if (i < COUNT - 1) {
    g.circle(0, 0, r);
    return;
  }
  const pts: number[] = [];
  for (let k = 0; k < 10; k++) {
    const a = -Math.PI / 2 + (k * Math.PI) / 5;
    const rr = k % 2 === 0 ? r * 1.22 : r * 0.55;
    pts.push(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  g.poly(pts);
}

/**
 * Five pips, one per rarity in that rarity's matte colour. A pip is either lit (a solid dot) or dim (a
 * hollow socket), so "which rarities do I own" never depends on colour alone: position says which
 * rarity, filled-versus-hollow says whether it is owned. Lit pips pop when they turn on.
 * Origin = centre of the row.
 */
export class RarityPips extends Container {
  readonly uiBox: Box;
  private readonly pips: Pip[] = [];
  private readonly bag = new TweenBag();
  private readonly flags: boolean[] = new Array<boolean>(COUNT).fill(false);

  constructor(opts: RarityPipsOpts = {}) {
    super();
    const size = opts.size ?? 16;
    const gap = opts.gap ?? Math.round(size * 0.45);
    const step = size + gap;
    const ow = Math.max(2, size * 0.16);
    RARITY_ORDER.forEach((id, i) => {
      const rar = Rarity[id];
      const holder = new Container();
      holder.x = (i - (COUNT - 1) / 2) * step;

      const dim = new Graphics();
      pipPath(dim, i, size / 2);
      dim.fill({ color: Color.paperDim, alpha: 0.9 }).stroke({ width: ow * 0.75, color: Color.kraftDark, alpha: 0.75, join: 'round' });

      const lit = new Graphics();
      pipPath(lit, i, size / 2);
      // The top rarity is the berry star with a small gold edge; the rest are flat dots with a deeper rim.
      lit.fill(rar.color).stroke({ width: ow, color: i === COUNT - 1 ? RARITY_GOLD : rar.dark, alignment: 0.5, join: 'round' });

      const ring = new Graphics();
      ring.circle(0, 0, size * 0.62).stroke({ width: Math.max(2, size * 0.18), color: rar.color });
      ring.visible = false;

      holder.addChild(dim, lit, ring);
      this.addChild(holder);
      const pip: Pip = { holder, lit, dim, ring, on: false };
      this.pips.push(pip);
    });
    this.uiBox = { x: -(COUNT * step - gap) / 2 - 3, y: -size * 0.75, w: COUNT * step - gap + 6, h: size * 1.5 };
    for (const pip of this.pips) this.paint(pip);
    this.set(opts.owned ?? [], false);
  }

  /** Current lit flags (do not mutate). */
  get owned(): readonly boolean[] {
    return this.flags;
  }

  /** How many pips are lit. */
  get count(): number {
    let n = 0;
    for (const f of this.flags) if (f) n++;
    return n;
  }

  /** Light and dim pips to match `owned`. Pips that turn on pop (unless `animate` is false or motion is reduced). */
  set(owned: readonly boolean[], animate = true): void {
    for (let i = 0; i < COUNT; i++) {
      const next = owned[i] === true;
      const pip = this.pips[i] as Pip;
      if (next === pip.on) continue;
      pip.on = next;
      this.flags[i] = next;
      this.paint(pip);
      if (next && animate && !motion.reduced) this.pop(pip);
    }
  }

  override destroy(options?: DestroyOptions): void {
    this.bag.killAll();
    super.destroy(options);
  }

  private paint(pip: Pip): void {
    this.bag.killKeyed(pip.holder);
    this.bag.killKeyed(pip.ring);
    pip.holder.scale.set(1);
    pip.ring.visible = false;
    pip.lit.visible = pip.on;
    pip.dim.visible = !pip.on;
  }

  private pop(pip: Pip): void {
    const ease = backOut(3.2);
    this.bag.runKeyed(pip.holder, {
      duration: 0.32,
      ease: Ease.linear,
      onUpdate: (k) => pip.holder.scale.set(0.15 + 0.85 * ease(k)),
      onComplete: () => pip.holder.scale.set(1),
    });
    pip.ring.visible = true;
    this.bag.runKeyed(pip.ring, {
      duration: 0.4,
      ease: Ease.cubicOut,
      onUpdate: (k) => {
        pip.ring.scale.set(0.7 + k * 1.2);
        pip.ring.alpha = 0.95 * (1 - k);
        pip.ring.rotation = k * TAU * 0.1;
      },
      onComplete: () => {
        pip.ring.visible = false;
      },
    });
  }
}
