/**
 * The tutorial's pointer: a cat's paw sticker. Its origin is the paw's tip, and it points up when it is not turned (`place` turns it, see
 * handMath.ts for which way). It pats a control in place (the arm comes in along its own line, touches, rings, draws back) or picks
 * something up at one spot, carries it to another and sets it down; the carried thing is whatever the caller hands over as the cargo.
 */
import { Container, Graphics, Sprite, type DestroyOptions } from 'pixi.js';
import { hasTex, tex } from '@/core/assets';
import { Ease } from '@/core/tween';
import { Color, motion, TweenBag } from '@/ui';
import { PAW_LENGTH, PAW_WIDTH } from './handMath';

/** The tip sits just inside the sticker's white border, this far down the image. */
const PAW_TIP = 0.05;
/** How far the arm hangs back from the spot while it waits, in px along its own line. */
const HOVER = 30;
const RING_R = 52;
/** A carried thing rides this far ahead of the tip (along the way the paw points) and this far up. */
const LEAD = 38;
const RAISE = 12;

/** A smooth 0..1 step. */
const smooth = (k: number): number => k * k * (3 - 2 * k);

export class Hand extends Container {
  private readonly bag = new TweenBag();
  /** The paw, turned about its tip; the ring and the cargo stay upright. */
  private readonly art = new Container();
  private readonly ring = new Graphics();
  private readonly cargo = new Container();
  private readonly shadow = new Graphics();
  private carried: Container | null = null;
  private turn = 0;

  constructor() {
    super();
    if (hasTex('icon_hand')) {
      const paw = new Sprite(tex('icon_hand'));
      paw.anchor.set(0.5, PAW_TIP);
      paw.scale.set(PAW_LENGTH / paw.texture.height);
      this.art.addChild(paw);
    } else {
      // Fallback without the image: a paper mitten with the same origin and reach.
      const g = new Graphics();
      const line = { width: 5, color: Color.ink, join: 'round' as const };
      g.roundRect(-PAW_WIDTH / 3, PAW_LENGTH * 0.4, PAW_WIDTH * 0.66, PAW_LENGTH * 0.6, 20).fill(Color.mustard).stroke(line);
      g.circle(0, PAW_LENGTH * 0.26, PAW_WIDTH * 0.42).fill(Color.paperLight).stroke(line);
      this.art.addChild(g);
    }
    this.ring.circle(0, 0, RING_R).stroke({ width: 6, color: Color.teal });
    this.ring.visible = false;
    this.shadow.ellipse(0, 0, 40, 14).fill({ color: Color.ink, alpha: 0.28 });
    this.cargo.visible = false;
    this.cargo.addChild(this.shadow);
    this.addChild(this.ring, this.cargo, this.art);
    this.eventMode = 'none';
  }

  /** Lay the paw down with its tip at (x, y), turned so its arm trails away to one side (handMath.pawRotation). */
  place(x: number, y: number, rotation: number): void {
    this.position.set(x, y);
    this.turn = rotation;
    this.art.rotation = rotation;
    this.setReach(0);
  }

  /** Turn the paw without moving it. */
  turnTo(rotation: number): void {
    this.turn = rotation;
    this.art.rotation = rotation;
  }

  /** Slide the paw along its own line: positive draws the arm back from the tip, negative pushes the tip forward. */
  private setReach(back: number): void {
    this.art.position.set(-Math.sin(this.turn) * back, Math.cos(this.turn) * back);
  }

  private clearCargo(): void {
    this.cargo.visible = false;
    if (this.carried && !this.carried.destroyed) this.carried.destroy({ children: true });
    this.carried = null;
  }

  private stop(): void {
    this.bag.killAll();
    this.clearCargo();
    this.ring.visible = false;
    this.alpha = 1;
    this.setReach(0);
  }

  /** Pat the spot, forever: the arm comes in, the tip touches, a ring spreads from it, the arm draws back. */
  tap(): void {
    this.stop();
    if (motion.reduced) return;
    this.bag.run({
      duration: 1.2,
      repeat: -1,
      ease: Ease.linear,
      onUpdate: (k) => {
        let back: number;
        if (k < 0.4) back = HOVER * (1 - Ease.cubicIn(k / 0.4));
        else if (k < 0.5) back = -6 * smooth((k - 0.4) / 0.1);
        else if (k < 0.68) back = -6 + (HOVER * 0.6 + 6) * Ease.cubicOut((k - 0.5) / 0.18);
        else back = HOVER * 0.6 + HOVER * 0.4 * smooth((k - 0.68) / 0.32);
        this.setReach(back);
        // A ring spreads from the tip as it lands.
        const r = k > 0.4 && k < 0.85 ? (k - 0.4) / 0.45 : -1;
        this.ring.visible = r >= 0;
        if (r >= 0) {
          this.ring.scale.set(0.25 + 0.75 * Ease.cubicOut(r));
          this.ring.alpha = 0.9 * (1 - r);
        }
      },
    });
  }

  /**
   * Pick up at (ax, ay), carry to (bx, by), set down, let go, and again, forever. Coordinates are in the parent's space. `cargo` is what the
   * paw carries (it starts exactly on what was picked up, lifts with a shadow under it, and is set down on the other spot); the hand owns it.
   * The way the paw is turned (`place`, `turnTo`) is kept all along.
   */
  drag(ax: number, ay: number, bx: number, by: number, cargo: Container | null): void {
    this.stop();
    this.position.set(ax, ay);
    if (cargo) {
      cargo.eventMode = 'none';
      this.cargo.addChild(cargo);
      this.carried = cargo;
    }
    if (motion.reduced) return;
    this.bag.run({
      duration: 2.6,
      repeat: -1,
      ease: Ease.linear,
      onUpdate: (k) => {
        // 0-.16 the arm comes in and presses; .16-.24 the cat is picked up; .24-.68 carried; .68-.78 set down (a ring); .78-.92 the arm draws back and fades.
        let back = 0;
        let t = 0;
        let lift = 0;
        let ring = -1;
        if (k < 0.16) back = HOVER * (1 - Ease.cubicIn(k / 0.16));
        else if (k < 0.24) {
          back = -6 * smooth((k - 0.16) / 0.08);
          lift = smooth((k - 0.16) / 0.08);
        } else if (k < 0.68) {
          back = -6;
          lift = 1;
          t = Ease.cubicInOut((k - 0.24) / 0.44);
        } else if (k < 0.78) {
          back = -6 + 6 * smooth((k - 0.68) / 0.1);
          lift = 1 - smooth((k - 0.68) / 0.1);
          t = 1;
          ring = (k - 0.68) / 0.1;
        } else {
          back = HOVER * Ease.cubicOut(Math.min(1, (k - 0.78) / 0.14));
          t = 1;
        }
        this.position.set(ax + (bx - ax) * t, ay + (by - ay) * t);
        this.setReach(back);
        this.alpha = k > 0.9 ? Math.max(0, 1 - (k - 0.9) / 0.05) : k < 0.04 ? k / 0.04 : 1;
        // The carried cat: on the spot it was picked from at first, raised and shadowed while carried, put down on the other spot.
        const showCargo = this.carried !== null && k > 0.16 && k < 0.8;
        this.cargo.visible = showCargo;
        if (showCargo && this.carried) {
          // Lifted, it rides a little ahead of the tip (so the paw's pad does not hide it) and settles back onto the spot it is set down on.
          this.cargo.position.set(Math.sin(this.turn) * LEAD * lift, -Math.cos(this.turn) * LEAD * lift - RAISE * lift);
          this.carried.scale.set(1 + 0.12 * lift);
          this.shadow.alpha = lift;
          this.shadow.position.set(6, 34 + RAISE * lift);
          this.shadow.scale.set(0.6 + 0.4 * lift);
        }
        // Where the cat is set down: a ring spreads from the spot.
        this.ring.visible = ring >= 0;
        if (ring >= 0) {
          this.ring.scale.set(0.25 + 0.75 * Ease.cubicOut(ring));
          this.ring.alpha = 0.9 * (1 - ring);
        }
      },
    });
  }

  override destroy(options?: DestroyOptions): void {
    this.bag.killAll();
    super.destroy(options);
  }
}
