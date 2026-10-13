/**
 * The small pooled pieces the running bodies' scenes are made of (stomps, paw prints, stars, bursts, flashes). A `Pieces` pool makes a piece the
 * first time it is needed, reuses it after, never grows past its cap (a full pool takes over its oldest piece), and ages every live piece by the
 * battle's clock with a floor in real time (`span.ts`): a piece lasts until both its battle seconds and its real floor are over, stands still
 * while a popup holds the battle, and is hidden the frame it is over. Nothing is allocated per frame.
 */
import { Sprite, type Container, type Texture } from 'pixi.js';
import { Age } from './span';

export abstract class Piece {
  on = false;
  readonly age = new Age();
  /** Battle seconds and the real floor this piece lives for. */
  life = 0.3;
  floor = 0.2;

  /** Start (or restart) the piece's life. */
  start(life: number, floor: number): void {
    this.on = true;
    this.age.reset();
    this.life = life;
    this.floor = floor;
  }

  /** 0..1 how far into its life the piece is. */
  k(): number {
    return this.age.k(this.life, this.floor);
  }

  /** Stop and take everything of the piece off the screen. */
  abstract hide(): void;
  /** Free what the piece made. */
  abstract destroy(): void;
}

/** A piece that is one sprite. */
export class SpritePiece extends Piece {
  readonly sprite: Sprite;
  constructor(parent: Container, texture: Texture, anchorX = 0.5, anchorY = 0.5) {
    super();
    this.sprite = new Sprite(texture);
    this.sprite.anchor.set(anchorX, anchorY);
    this.sprite.eventMode = 'none';
    this.sprite.visible = false;
    parent.addChild(this.sprite);
  }
  hide(): void {
    this.on = false;
    this.sprite.visible = false;
  }
  destroy(): void {
    this.sprite.destroy();
  }
}

export class Pieces<T extends Piece> {
  readonly list: T[] = [];

  constructor(
    private readonly make: () => T,
    private readonly cap: number,
  ) {}

  /**
   * A free piece; the pool grows to its cap, and a full pool gives up its oldest (the one that has been on screen longest). `limit` is a
   * lower cap on how many may be on screen at once (the quality tier's): at the limit the oldest is taken over, so the NEWEST hits of a long
   * run are still drawn and the picture of a crowded road thins out from its back, never from its front.
   */
  take(limit: number = this.cap): T {
    let oldest: T | null = null;
    let free: T | null = null;
    let live = 0;
    for (const p of this.list) {
      if (!p.on) {
        if (!free) free = p;
        continue;
      }
      live++;
      if (!oldest || p.age.real > oldest.age.real) oldest = p;
    }
    if (oldest && live >= Math.min(limit, this.cap)) {
      oldest.hide();
      return oldest;
    }
    if (free) return free;
    const p = this.make();
    this.list.push(p);
    return p;
  }

  /** Age every live piece by the frame and draw it with `draw(piece, k)`; a piece that is over is hidden. */
  update(battleDt: number, dt: number, draw: (p: T, k: number) => void): void {
    for (const p of this.list) {
      if (!p.on) continue;
      p.age.tick(battleDt, dt);
      const k = p.k();
      if (k >= 1) {
        p.hide();
        continue;
      }
      draw(p, k);
    }
  }

  /** Pieces on screen right now. */
  get live(): number {
    let n = 0;
    for (const p of this.list) if (p.on) n++;
    return n;
  }

  clear(): void {
    for (const p of this.list) p.hide();
  }

  destroy(): void {
    for (const p of this.list) p.destroy();
    this.list.length = 0;
  }
}
