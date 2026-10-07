import { Container, Graphics, Sprite } from 'pixi.js';
import { audio } from '@/audio';
import { Pool } from '@/core/pool';
import { Ease, type Tween } from '@/core/tween';
import { Color, drawDashedRect, motion, Rarity, type RarityId } from '@/ui';
import { CELL_H, CELL_W, cellCenterX, cellCenterY } from '@/game/geometry';
import { LAND_RING_SECONDS, TOSS_SECONDS, tossLift, tossPoint, tossScale, type TossPoint } from '../toss';
import type { FieldEnv } from './env';

const RING_W = CELL_W - 12;
const RING_H = CELL_H - 12;

/** A dashed ring in two parts: a cream rim under it so it reads on every mat, and the dashes (white, tinted per rarity). */
class LandingRing {
  readonly root = new Container();
  readonly dash = new Graphics();
  tween: Tween | null = null;

  constructor() {
    const rim = new Graphics();
    rim.roundRect(-RING_W / 2, -RING_H / 2, RING_W, RING_H, 24).stroke({ width: 11, color: Color.paperLight, alpha: 0.95 });
    drawDashedRect(this.dash, -RING_W / 2, -RING_H / 2, RING_W, RING_H, { radius: 24, color: Color.white, width: 7, dash: 15, gap: 9 });
    this.root.addChild(rim, this.dash);
    this.root.eventMode = 'none';
  }
}

const at: TossPoint = { x: 0, y: 0, k: 0 };

/**
 * What a summon does on the board: a paper sticker in the rarity's colour is tossed from the summon button along a short
 * arc onto the cell, and a bright dashed ring flashes round the cell as it lands. Both are pooled; neither takes input.
 * Under reduced motion there is no flight, only the ring (without its pulse).
 */
export class Arrivals {
  private readonly tokens = new Pool<Sprite>(
    () => {
      const s = new Sprite();
      s.anchor.set(0.5);
      s.eventMode = 'none';
      return s;
    },
    (s) => {
      s.parent?.removeChild(s);
    },
  );
  private readonly rings = new Pool<LandingRing>(
    () => new LandingRing(),
    (r) => {
      r.tween?.kill();
      r.tween = null;
      r.root.parent?.removeChild(r.root);
    },
  );
  private readonly flying = new Map<Tween, Sprite>();
  private readonly live = new Set<LandingRing>();

  constructor(
    private readonly env: FieldEnv,
    /** Scene space, above the HUD: the sticker leaves a HUD button. */
    private readonly sceneLayer: Container,
    /** Field space, over the cats: the ring must not be hidden by a neighbour. */
    private readonly fieldLayer: Container,
  ) {}

  /** Toss a sticker of this rarity from a scene-space point onto `cell`; `onLand` runs on the frame it lands. */
  toss(fromX: number, fromY: number, cell: number, rarity: RarityId, onLand: () => void): void {
    const { ctx, art } = this.env;
    const x1 = ctx.toSceneX(cellCenterX(cell));
    const y1 = ctx.toSceneY(cellCenterY(cell)) - 8;
    const lift = tossLift(Math.hypot(x1 - fromX, y1 - fromY));
    const s = this.tokens.get();
    s.texture = art.toss[rarity];
    s.position.set(fromX, fromY);
    s.scale.set(tossScale(0));
    s.rotation = 0;
    this.sceneLayer.addChild(s);
    audio.play('whoosh', { volume: 0.26 });
    const spin = (cell % 2 === 0 ? 1 : -1) * 0.9;
    const run = ctx.ui.run({
      duration: TOSS_SECONDS,
      ease: Ease.sineInOut,
      onUpdate: (k) => {
        tossPoint(k, fromX, fromY, x1, y1, lift, at);
        s.position.set(at.x, at.y);
        s.scale.set(tossScale(k));
        s.rotation = spin * (1 - k);
      },
      onComplete: () => {
        this.flying.delete(run);
        this.tokens.release(s);
        onLand();
      },
    });
    this.flying.set(run, s);
  }

  /** Flash the dashed ring round `cell` (the rarity's colour, pulsing in once) and let it go after `LAND_RING_SECONDS`. */
  ring(cell: number, rarity: RarityId): void {
    const r = this.rings.get();
    // A common cat's own tan would be the dullest ring on the board: the first rank flashes coral, the rest their rank's deep colour.
    r.dash.tint = rarity === 'common' ? Color.coral : Rarity[rarity].dark;
    r.root.position.set(cellCenterX(cell), cellCenterY(cell));
    this.fieldLayer.addChild(r.root);
    this.live.add(r);
    const still = motion.reduced;
    r.tween = this.env.ctx.ui.run({
      duration: LAND_RING_SECONDS,
      ease: Ease.linear,
      onUpdate: (k) => {
        if (still) {
          r.root.scale.set(1);
          r.root.alpha = k < 0.75 ? 1 : 0;
          return;
        }
        // Lands from a little outside, settles, then fades over the last third.
        const settle = Ease.backOut(Math.min(1, k / 0.22));
        r.root.scale.set(1.3 - 0.3 * settle);
        r.root.alpha = k < 0.6 ? 1 : 1 - (k - 0.6) / 0.4;
      },
      onComplete: () => {
        this.live.delete(r);
        this.rings.release(r);
      },
    });
  }

  destroy(): void {
    for (const [t, s] of this.flying) {
      t.kill();
      s.destroy();
    }
    this.flying.clear();
    for (const r of this.live) {
      r.tween?.kill();
      r.root.destroy({ children: true });
    }
    this.live.clear();
    this.tokens.drain((s) => s.destroy());
    this.rings.drain((r) => r.root.destroy({ children: true }));
  }
}
